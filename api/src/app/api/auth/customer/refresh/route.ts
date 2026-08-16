import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { refreshTokenSchema } from "@/lib/validation/auth";
import { signCustomerToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as sessions from "@/lib/services/customerSession.service";

export const dynamic = "force-dynamic";

// Generous: a legitimate app refreshes roughly once a day, but every app on a
// shared mobile network appears from the same carrier IP. Too tight a cap here
// signs out a neighbourhood, and the token itself is 32 bytes of CSPRNG output —
// this is not what stops guessing.
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

// POST /api/v1/auth/customer/refresh → { token, refreshToken, customer }
//
// Deliberately NOT behind withCustomerAuth: the whole point is to be reachable
// with an EXPIRED access token. The refresh token in the body is the credential.
export const POST = withErrors(async (request: NextRequest) => {
  const ip = clientIp(request);

  const rl = await rateLimit(`customer-refresh:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  const { refreshToken } = refreshTokenSchema.parse(await readJsonObject(request, 4096));

  // Rotates, or revokes the session on reuse — see customerSession.service.
  const result = await sessions.refresh(refreshToken, ip);

  const customer = await prisma.customerUser.findUnique({
    where: { id: result.customerId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      emailVerified: true,
      isActive: true,
    },
  });
  // refresh() already rejected an inactive account; this re-check exists because
  // the row is read here separately and "the session was fine a millisecond ago"
  // is not a reason to hand out a token now.
  if (!customer || !customer.isActive) {
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  const token = await signCustomerToken({ sub: customer.id });

  return ok(
    {
      token,
      refreshToken: result.refreshToken,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        avatarUrl: customer.avatarUrl,
        emailVerified: customer.emailVerified,
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
