import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { appleSignInSchema, deviceSchema } from "@/lib/validation/auth";
import { customerSignInResponse } from "@/lib/utils/customerSignIn";
import {
  appleCreationName,
  isAppleSignInConfigured,
  verifyAppleIdToken,
} from "@/lib/services/appleIdentity.service";
import {
  signInWithIdentity,
  storeAppleRefreshToken,
} from "@/lib/services/customerAuth.service";
import { exchangeAppleAuthorizationCode } from "@/lib/services/appleServerAuth.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";

export const dynamic = "force-dynamic";

// Same 20/min as the Google route, for the same reason: there is no secret to
// guess here — nobody brute-forces their way to a valid Apple signature — so
// this protects the JWKS fetch and the account-creation path from being
// hammered, not a credential.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// POST /api/v1/auth/apple → { token, customer, outcome }
//
// The client runs Apple's sign-in sheet, gets an identity token, and posts it
// here. This route verifies it with Apple, resolves the account, and mints OUR
// session token. Apple's token is never stored and never accepted again after
// this point — it is evidence, not a session.
//
// The one shape difference from the Google route: `name`. Apple puts no name in
// the token, and hands the client one exactly once, so the display name is
// resolved HERE (from an untrusted request field, with a fallback) instead of
// arriving as a signed claim. Everything downstream of signInWithIdentity is
// provider-agnostic and needed no change.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`auth-apple:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const seconds = Math.ceil(rl.retryAfterMs / 1000);
      throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
    }

    // Answer "this deploy has no Apple sign-in" as a clean 400 rather than the
    // 500 that verifyAppleIdToken would raise. The apps show a real message and
    // fall back instead of reporting a server crash.
    if (!isAppleSignInConfigured()) {
      throw new ValidationError("Apple sign-in is not available.");
    }

    const raw = await readJsonObject(request, 8192);
    const { identityToken, rawNonce, fullName, authorizationCode } =
      appleSignInSchema.parse(raw);
    // Present only from a mobile client — see customerSignInResponse.
    const device = raw.device ? deviceSchema.parse(raw.device) : undefined;

    const identity = await verifyAppleIdToken(identityToken, rawNonce);
    const { customer, outcome } = await signInWithIdentity(
      {
        provider: "APPLE",
        subject: identity.subject,
        email: identity.email,
        emailVerified: identity.emailVerified,
        // Null on every sign-in after the first, because that is the truth: Apple
        // asserts no name then, and writing one would clobber whatever the
        // customer actually has. `fallbackName` covers the only case where a
        // name is mandatory — creating the row.
        name: fullName?.trim() || null,
        fallbackName: appleCreationName(identity, fullName),
        // Apple has no concept of a profile picture. Null here means "asserts
        // nothing", which leaves any avatar the customer already has alone —
        // including one set on an earlier Google sign-in to the same account.
        avatarUrl: null,
      },
      ip,
    );

    // ── Capture a revocable token, after the fact ────────────────────────────
    // Deferred until after the response for the same reason the welcome email is:
    // it is a round trip to a third party that the customer is not waiting for.
    // It buys ONE thing — the ability to call Apple's /auth/revoke when this
    // account is deleted, which guideline 5.1.1(v) requires (see
    // appleServerAuth.service). Nothing about this sign-in depends on it, so
    // every failure inside is swallowed rather than surfaced.
    //
    // `identity.audience` rather than a configured id: the exchange has to name
    // the exact client the code was issued to, and the verified token is the only
    // thing that actually knows which that was.
    if (authorizationCode) {
      runAfterResponse(async () => {
        const refreshToken = await exchangeAppleAuthorizationCode(
          authorizationCode,
          identity.audience,
        );
        await storeAppleRefreshToken(identity.subject, refreshToken);
      });
    }

    return customerSignInResponse(customer, outcome, device);
  }),
);
