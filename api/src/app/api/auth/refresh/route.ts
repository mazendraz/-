import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { refreshTokenSchema } from "@/lib/validation/auth";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as staffSessions from "@/lib/services/staffSession.service";

export const dynamic = "force-dynamic";

// Generous, same reasoning as the customer route: a legitimate app refreshes
// roughly once a day, but every app on a shared mobile network appears from
// the same carrier IP. Too tight a cap here signs out a neighbourhood, and
// the token itself is 32 bytes of CSPRNG output — this is not what stops
// guessing.
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

// POST /api/v1/auth/refresh → { token, refreshToken, user }
//
// Deliberately NOT behind withAuth: the whole point is to be reachable with
// an EXPIRED access token. The refresh token in the body is the credential.
// Staff-only counterpart of /auth/customer/refresh — see
// staffSession.service.ts for the rotation and reuse-detection semantics
// this shares with the customer path.
export const POST = withErrors(async (request: NextRequest) => {
  const ip = clientIp(request);

  const rl = await rateLimit(`staff-refresh:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  const { refreshToken } = refreshTokenSchema.parse(await readJsonObject(request, 4096));

  // Rotates, or revokes the session on reuse — see staffSession.service.
  const result = await staffSessions.refresh(refreshToken, ip);

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      isActive: true,
      desktopPermissions: true,
    },
  });
  // refresh() already rejected an inactive account; this re-check exists
  // because the row is read here separately and "the session was fine a
  // millisecond ago" is not a reason to hand out a token now.
  if (!user || !user.isActive) {
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  // Bound to the session it was refreshed from, so revoking that one device
  // kills this access token too rather than leaving it live until it expires.
  const token = await signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
    sid: result.sessionId,
  });

  return ok(
    {
      token,
      refreshToken: result.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        desktopPermissions: user.desktopPermissions,
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
