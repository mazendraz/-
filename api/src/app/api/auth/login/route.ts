import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { loginSchema } from "@/lib/validation/auth";
import { signToken, verifyPasswordSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const rl = await rateLimit(`login:${clientIp(request)}`, LOGIN_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  const { email, password } = loginSchema.parse(await request.json());

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
      throw new RateLimitError(`Too many failed attempts. Try again in ${seconds}s.`);
    }
    // Generic message — never reveal whether the email exists.
    throw new UnauthorizedError("Invalid email or password");
  }

  // A truthy verifyPasswordSafe guarantees an active user matched (activeHash was
  // non-null); this only narrows the type for the compiler — it's never reached.
  if (!user) throw new UnauthorizedError("Invalid email or password");

  const token = await signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
  });

  const body: ApiAuthResponse = {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
  };
  return ok(body);
});
