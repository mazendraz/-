import type { NextRequest } from "next/server";
import { authed } from "@/lib/middleware/guards";
import { ok } from "@/lib/utils/response";
import { SESSION_COOKIE, sessionCookieOptions, signToken } from "@/lib/auth";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { changePasswordSchema } from "@/lib/validation/auth";
import * as usersService from "@/lib/services/users.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// This endpoint verifies a password, so it is a guessing oracle for anyone who
// gets hold of a live session (a borrowed laptop, a hijacked cookie) and wants to
// confirm the password before using it elsewhere. Keyed by USER because that is
// what is under attack here, not the address it is coming from.
const RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

// PATCH /api/auth/password → 200 { token }. Change your OWN password.
//
// The target is always `user.id` from the session — there is deliberately no id
// in the body or the path, so this cannot be aimed at another account. Admins who
// need to reset someone ELSE's password still use PATCH /api/admin/users/:id.
//
// ── Why this answers 200 { token } and no longer 204 ────────────────────────
// Changing the password now moves User.tokensValidFrom, which kills EVERY token
// issued before this moment. That is the point — the old behaviour was
// documented as "other sessions are NOT revoked", so a stolen session survived
// the one action a person takes to end it. But it also kills the caller's own
// token, and signing someone out of the screen they are standing on because
// they did the right thing is a bad trade.
//
// So a replacement credential rides back in the same response, both ways, for
// the same reason POST /auth/login sends both: the website authenticates by
// httpOnly cookie (set below, nothing to do client-side), while the desktop app
// holds a Bearer token in memory and has to be handed the new one explicitly
// (see desktop/src/lib/api.ts setAuthToken).
export const PATCH = authed(async (request: NextRequest, _ctx, user) => {
  const rl = await rateLimit(`password-change:${user.id}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  const { currentPassword, newPassword } = changePasswordSchema.parse(
    await readJsonObject(request, 4096),
  );

  await usersService.changeOwnPassword(user.id, currentPassword, newPassword);

  // Records THAT it happened and from where — never any part of either password.
  await audit.record(user, {
    action: "auth.password.change",
    entity: "User",
    entityId: user.id,
    meta: { self: true, ip: clientIp(request) },
  });

  // Minted AFTER changeOwnPassword, so its `iat` is at or past the floor that
  // call just set — a token signed before it would be refused by its own change.
  const token = await signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
  });

  const res = ok({ token });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
