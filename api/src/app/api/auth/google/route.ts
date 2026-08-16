import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { googleSignInSchema } from "@/lib/validation/auth";
import { signCustomerToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import {
  isGoogleSignInConfigured,
  verifyGoogleIdToken,
} from "@/lib/services/googleIdentity.service";
import { signInWithIdentity } from "@/lib/services/customerAuth.service";
import type { ApiCustomerAuthResponse } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// Per-IP throttle. Looser than the password login's 10/min: there is no secret to
// guess here — an attacker cannot brute-force their way to a valid Google
// signature — so this is protecting the JWKS fetch and the account-creation path
// from being hammered, not a credential.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// POST /api/v1/auth/google → { token, customer, outcome }
//
// The client runs Google's sign-in UI, gets an ID token, and posts it here. This
// route verifies it with Google, resolves the account, and mints OUR session
// token. Google's token is never stored and never accepted again after this
// point — it is evidence, not a session.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`auth-google:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const seconds = Math.ceil(rl.retryAfterMs / 1000);
      throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
    }

    // Answer "this deploy has no Google sign-in" as a clean 400 rather than the
    // 500 that verifyGoogleIdToken would raise. The apps show a real message and
    // fall back instead of reporting a server crash.
    if (!isGoogleSignInConfigured()) {
      throw new ValidationError("Google sign-in is not available.");
    }

    const { idToken } = googleSignInSchema.parse(await readJsonObject(request, 8192));

    const identity = await verifyGoogleIdToken(idToken);
    const { customer, outcome } = await signInWithIdentity(
      { ...identity, provider: "GOOGLE" },
      ip,
    );

    const token = await signCustomerToken({ sub: customer.id });

    const body: ApiCustomerAuthResponse = { token, customer, outcome };

    // Same dual delivery as the staff login: the httpOnly cookie serves the
    // website (unreadable by JS, so XSS can't lift it), and the body serves the
    // mobile apps, which have no cookie jar and keep the token in the platform
    // keystore instead.
    const res = ok(body);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }),
);
