import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { loginSchema, deviceSchema } from "@/lib/validation/auth";
import { signToken, verifyPasswordSafe, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as audit from "@/lib/services/audit.service";
import * as staffSessions from "@/lib/services/staffSession.service";
import type { ApiAuthResponse } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// Throttle login attempts to slow brute-force (per IP).
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// Per-account throttle on FAILED attempts, keyed by email (uniform whether or not
// the account exists, so it never reveals which emails are registered). Counts
// only failures — a correct password skips it entirely, so a legitimate user is
// NEVER locked out and there's no self-lockout DoS. Stops distributed credential
// stuffing against one account that spreads across enough IPs to slip the per-IP
// limit above. Tune the ceiling via LOGIN_ACCOUNT_MAX_FAILURES.
const ACCOUNT_FAILURE_LIMIT = {
  limit: Math.max(1, Math.trunc(Number(process.env.LOGIN_ACCOUNT_MAX_FAILURES ?? "10")) || 10),
  windowMs: 15 * 60_000,
};

// POST /api/auth/login → { token, user }. Token is returned in the body.
export const POST = withErrors(async (request: NextRequest) => {
  const ip = clientIp(request);

  const rl = await rateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    // Logged before the body is parsed, so there is no email yet — the IP is the
    // subject of this event anyway.
    await audit.recordAuth({
      action: "auth.login.throttled",
      email: "-",
      ip,
      meta: { scope: "ip" },
    });
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  // Bounded read (a login body is tiny): reject oversized payloads before parsing,
  // consistent with the other public POST endpoints.
  const raw = await readJsonObject(request, 4096);
  const { email, password } = loginSchema.parse(raw);
  // Present only from the Business App mobile client — see customerSignIn.ts's
  // identical pattern. Its presence is what asks for a long-lived refresh
  // token instead of just the (still-issued) httpOnly cookie.
  const device = raw.device ? deviceSchema.parse(raw.device) : undefined;

  const user = await prisma.user.findUnique({ where: { email } });
  // Run a bcrypt compare even when there's no active user (verifyPasswordSafe uses
  // a dummy hash) so response timing can't be used to enumerate valid accounts.
  const activeHash = user && user.isActive ? user.passwordHash : null;
  if (!(await verifyPasswordSafe(password, activeHash))) {
    // Record the failure against the account. Once the ceiling is hit, further
    // FAILED attempts are throttled (a correct password still gets through).
    const acct = await rateLimit(`login:acct:${email}`, ACCOUNT_FAILURE_LIMIT);
    if (!acct.ok) {
      const seconds = Math.ceil(acct.retryAfterMs / 1000);
      await audit.recordAuth({
        action: "auth.login.throttled",
        email,
        ip,
        meta: { scope: "account" },
      });
      throw new RateLimitError(`Too many failed attempts. Try again in ${seconds}s.`);
    }
    // `known` distinguishes "wrong password" from "no such account" IN THE LOG
    // ONLY. The RESPONSE stays generic below — that distinction is exactly what
    // an attacker enumerating accounts wants, and exactly what you need when
    // reading the log afterwards.
    await audit.recordAuth({
      action: "auth.login.failure",
      email,
      ip,
      meta: { known: Boolean(user), active: user?.isActive ?? null },
    });
    // Generic message — never reveal whether the email exists.
    throw new UnauthorizedError("Invalid email or password");
  }

  // A truthy verifyPasswordSafe guarantees an active user matched (activeHash was
  // non-null); this only narrows the type for the compiler — it's never reached.
  if (!user) throw new UnauthorizedError("Invalid email or password");

  await audit.recordAuth({
    action: "auth.login.success",
    email: user.email,
    userId: user.id,
    ip,
    meta: { role: user.role },
  });

  // A device session — and therefore a refresh token — is opened ONLY when the
  // caller sent `device`. Minted BEFORE the token below, when there is one, so
  // the token can carry its id (`sid`) — see customerSignIn.ts's identical
  // ordering note for why: a token signed before the session exists has
  // nothing to bind to, and "revoke this device" would then only reach the
  // refresh token, not the access token it already handed out.
  let sessionId: string | undefined;
  let refreshToken: string | undefined;
  if (device) {
    const issued = await staffSessions.issue(user.id, device);
    sessionId = issued.sessionId;
    refreshToken = issued.refreshToken;
  }

  const token = await signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
    sid: sessionId,
  });

  const body: ApiAuthResponse = {
    token,
    ...(refreshToken ? { refreshToken } : {}),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      // Business Control Center (desktop app) access grants — always present
      // (possibly empty, e.g. PROVIDER accounts have no desktop access at all).
      desktopPermissions: user.desktopPermissions,
    },
  };
  // Deliver the token as an httpOnly cookie (primary, same-origin) AND in the body
  // (transition — the frontend will stop reading it once fully on cookies). The
  // cookie is set regardless: a mobile client has no cookie jar and ignores it,
  // while the website depends on it entirely.
  const res = ok(body);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
