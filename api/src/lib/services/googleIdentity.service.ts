/**
 * Verification of a Google ID token.
 *
 * The client (mobile app or website) runs Google's own sign-in UI, receives an ID
 * token, and posts it here. This module answers exactly one question: *did Google
 * really issue this token, to us, for a user who is who it says?* It creates
 * nothing and trusts nothing else — see customerAuth.service for what happens
 * after.
 *
 * ── Why jose and not google-auth-library ─────────────────────────────────────
 * A Google ID token is a plain RS256 JWT signed with a key published at a JWKS
 * endpoint. `jose` — already a dependency here, used for our own HS256 tokens —
 * verifies exactly that, and caches/rotates the remote key set itself. Pulling in
 * google-auth-library would add a dependency (and its transitive tree) to do the
 * same verification behind a different name.
 *
 * ── What must be checked, and why each one matters ───────────────────────────
 *   signature  — jwtVerify against Google's JWKS. Without it the token is just a
 *                base64 string anyone can type by hand.
 *   issuer     — must be Google. A token from any other issuer is not evidence
 *                about a Google account.
 *   audience   — must be OUR client id. THIS is the check people skip, and it is
 *                the whole ballgame: a valid, correctly-signed Google ID token
 *                issued to a DIFFERENT app is trivial for the operator of that
 *                app to obtain. Without the audience check, anyone who runs any
 *                Google-signed-in app could take over accounts here by replaying
 *                their own users' tokens.
 *   expiry     — enforced by jwtVerify.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { UnauthorizedError } from "@/lib/utils/errors";

// Google's published signing keys. createRemoteJWKSet caches the key set and
// re-fetches on an unknown `kid`, so key rotation needs no action from us.
// Built once at module scope — a per-request instance would defeat the cache and
// hit Google on every sign-in.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Google issues the `iss` claim with and without the scheme, and both are valid.
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Every client id that may sign in to this backend.
 *
 * There will be several — a Web client for the site, plus one per mobile platform,
 * each with its own id issued by Google — and a token is minted for whichever
 * client asked for it. So the audience check accepts the SET of ids we own, not
 * one id. Configured as a comma-separated GOOGLE_CLIENT_IDS.
 *
 * Read per call rather than frozen at import so the value is a pure function of
 * the current environment, matching getAllowedOrigins() in proxy.ts (and making
 * it testable by stubbing env).
 */
function allowedAudiences(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when Google sign-in is configured at all. */
export function isGoogleSignInConfigured(): boolean {
  return allowedAudiences().length > 0;
}

/** The verified identity Google asserts. Nothing here is taken from the client. */
export interface GoogleIdentity {
  /** Google's immutable user id (`sub`). The login key — never the email. */
  subject: string;
  email: string;
  /** Google's own assertion. Gates account linking — see customerAuth.service. */
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

/**
 * Verify a Google ID token and return the identity it asserts.
 * Throws UnauthorizedError for anything that fails — never returns a partial result.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    // A configuration fault, not a caller fault. Failing loudly beats verifying
    // against an empty audience list, which would accept tokens issued to ANY app.
    throw new Error("GOOGLE_CLIENT_IDS is not set — Google sign-in is unconfigured");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: audiences,
    }));
  } catch {
    // One generic message for signature / issuer / audience / expiry alike: the
    // caller learning WHICH check failed only helps someone probing the gate.
    throw new UnauthorizedError("Google sign-in failed. Please try again.");
  }

  const subject = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!subject || !email) {
    // Both are required for an account. A Google token without them is not usable
    // even though it verified — treat it as a failed sign-in, not a 500.
    throw new UnauthorizedError("Google sign-in failed. Please try again.");
  }

  return {
    subject,
    email,
    // Google sends this as a real boolean; anything else is treated as unverified
    // rather than coerced, because a truthy non-boolean here would silently widen
    // account linking.
    emailVerified: payload.email_verified === true,
    // The profile fields are cosmetic and optional — a missing name must not fail
    // a sign-in, so fall back to the email's local part.
    name: (typeof payload.name === "string" && payload.name.trim()) || email.split("@")[0]!,
    avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
  };
}
