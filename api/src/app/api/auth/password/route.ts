import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authed } from "@/lib/middleware/guards";
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

// PATCH /api/auth/password → 204. Change your OWN password.
//
// The target is always `user.id` from the session — there is deliberately no id
// in the body or the path, so this cannot be aimed at another account. Admins who
// need to reset someone ELSE's password still use PATCH /api/admin/users/:id.
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

  // The existing session stays valid: the caller just proved they own the account,
  // and signing them out of the tab they are standing in helps nobody. Other
  // sessions are NOT revoked — there is no token denylist (see auth.ts). To force
  // every session out, deactivate and reactivate the user.
  return new NextResponse(null, { status: 204 });
});
