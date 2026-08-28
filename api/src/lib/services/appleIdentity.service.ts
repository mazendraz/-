/**
 * Verification of an Apple ID token ("Sign in with Apple").
 *
 * The mirror of googleIdentity.service: the client runs Apple's own sign-in UI,
 * receives an identity token, and posts it here. This module answers exactly one
 * question — *did Apple really issue this token, to us, for a user who is who it
 * says?* It creates nothing. See customerAuth.service for what happens after.
 *
 * Same shape as the Google verifier on purpose: `jose` + a remote JWKS, and the
 * audience check as the load-bearing gate. Read that file's header first; only
 * the differences are documented here, and there are four that matter.
 *
 * ── 1. Apple never sends a name or a picture ─────────────────────────────────
 * Google's token carries `name` and `picture` on every sign-in. Apple's carries
 * NEITHER, ever. The user's name is handed to the CLIENT exactly once — on the
 * very first authorization, and never again, not even after reinstalling the
 * app. So the name arrives here as an untrusted request field rather than a
 * signed claim, and on every later sign-in there is no name at all.
 *
 * That asymmetry is why VerifiedIdentity.name is `string | null` rather than
 * `string`: null means "this provider asserts nothing about the profile", which
 * is NOT the same as "the profile is empty". Without that distinction, the
 * second Apple sign-in would overwrite a real stored name with a fallback — see
 * refreshProfile in customerAuth.service.
 *
 * ── 2. The email may be a relay, and it is still the right key ───────────────
 * With "Hide My Email" Apple returns a per-app address at
 * `@privaterelay.appleid.com` that forwards to the real inbox. It is stable for
 * this app and unique to this user, so it works as an account key. It is NOT an
 * address a human recognizes, and mail to it is dropped unless the sending
 * domain is registered with Apple — see the note at the bottom of this file.
 *
 * ── 3. Apple's booleans are sometimes strings ────────────────────────────────
 * `email_verified` and `is_private_email` come back as the boolean `true` or the
 * STRING `"true"` depending on the flow and the SDK version. Reading them with
 * `=== true` — correct for Google — silently treats every string form as
 * unverified, which downgrades every Apple sign-in to "cannot link". Both forms
 * are accepted here, and nothing else is.
 *
 * ── 4. The nonce ─────────────────────────────────────────────────────────────
 * Apple echoes back whatever `nonce` the client asked it to embed. When the
 * token carries one, this module REQUIRES the caller to prove it knows the value
 * behind it. That binds the token to the request that carried it, so a token
 * captured on its own cannot be replayed. It is not enforced when the token has
 * no nonce at all: our clients always send one, so in practice the check always
 * runs, but a future web integration that forgets it fails loudly at Apple's end
 * rather than mysteriously here.
 */
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { UnauthorizedError } from "@/lib/utils/errors";

// Apple's published signing keys. Cached and rotated by createRemoteJWKSet, and
// built once at module scope for the same reason as the Google one: a
// per-request instance would defeat the cache and hit Apple on every sign-in.
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

// Apple issues exactly one form of `iss`, unlike Google's two.
const APPLE_ISSUER = "https://appleid.apple.com";

/** Apple's relay-address domain, used when a user picks "Hide My Email". */
const PRIVATE_RELAY_DOMAIN = "@privaterelay.appleid.com";

/**
 * Every audience that may sign in to this backend.
 *
 * For Apple these are NOT OAuth client ids in the Google sense — they are the
 * app's own identifiers: the iOS **bundle id** (`com.alassema.client`) for the
 * native flow, and a **Services ID** for the website flow, which is a separate
 * identifier registered in the Apple Developer portal. Both appear in `aud`.
 *
 * Read per call, not frozen at import, so the value is a pure function of the
 * current environment — same reasoning as allowedAudiences() in the Google
 * service, and what makes it testable by stubbing env.
 */
function allowedAudiences(): string[] {
  return (process.env.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when Apple sign-in is configured at all. */
export function isAppleSignInConfigured(): boolean {
  return allowedAudiences().length > 0;
}

/** The verified identity Apple asserts. Nothing here is taken from the client. */
export interface AppleIdentity {
  /** Apple's immutable user id (`sub`). The login key — never the email. */
  subject: string;
  email: string;
  /** Apple's own assertion. Gates account linking — see customerAuth.service. */
  emailVerified: boolean;
  /** True when `email` is a Hide-My-Email relay rather than a real inbox. */
  isPrivateEmail: boolean;
  /**
   * The `aud` this token was actually issued to — our bundle id for the iOS app,
   * a Services ID for a future web flow.
   *
   * Surfaced because the authorization-code exchange has to name the SAME client
   * (appleServerAuth.service), and Apple rejects the exchange when it does not
   * match. Reading it back off the verified token is the only way to know which
   * one it was without guessing, and it is safe to trust precisely because
   * jwtVerify already refused every audience except ours.
   */
  audience: string;
}

/**
 * Apple writes these as `true` or as `"true"`. Anything else — including the
 * string `"false"`, a missing claim, or an unexpected type — is false. Coercing
 * with `Boolean()` would be wrong in the one case that matters: `Boolean("false")`
 * is `true`, which would report an unverified address as verified and open the
 * account-linking path this flag exists to gate.
 */
function appleBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Verify an Apple identity token and return the identity it asserts.
 *
 * `rawNonce` is the un-hashed nonce the client generated before calling Apple.
 * Required whenever the token carries a `nonce` claim — see note 4 above.
 *
 * Throws UnauthorizedError for anything that fails — never returns a partial
 * result.
 */
export async function verifyAppleIdToken(
  idToken: string,
  rawNonce?: string,
): Promise<AppleIdentity> {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    // A configuration fault, not a caller fault. Failing loudly beats verifying
    // against an empty audience list, which would accept tokens issued to ANY app.
    throw new Error("APPLE_CLIENT_IDS is not set — Apple sign-in is unconfigured");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    }));
  } catch {
    // One generic message for signature / issuer / audience / expiry alike: the
    // caller learning WHICH check failed only helps someone probing the gate.
    throw new UnauthorizedError("Apple sign-in failed. Please try again.");
  }

  assertNonceMatches(payload.nonce, rawNonce);

  const subject = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!subject || !email) {
    // Both are required for an account. Apple omits `email` when the client did
    // not ask for the email scope — a client bug, but from here it is
    // indistinguishable from a token that simply cannot be used, so it is a
    // failed sign-in rather than a 500.
    throw new UnauthorizedError("Apple sign-in failed. Please try again.");
  }

  // `aud` is a string for a single audience and an array for several. Apple only
  // ever issues the string form, but the JWT spec allows both and jose types it
  // accordingly, so the array case is narrowed rather than cast away.
  const audience = Array.isArray(payload.aud) ? payload.aud[0]! : payload.aud!;

  return {
    subject,
    email,
    audience,
    emailVerified: appleBoolean(payload.email_verified),
    // Apple omits this claim entirely for a real address, so a missing value
    // meaning "not private" is correct here rather than merely convenient.
    isPrivateEmail:
      appleBoolean(payload.is_private_email) || email.endsWith(PRIVATE_RELAY_DOMAIN),
  };
}

/**
 * Enforce the nonce binding described in note 4.
 *
 * The client generates a random value, sends Apple the SHA-256 of it, and sends
 * US the original. Apple echoes its copy into the token verbatim. So the proof
 * is that hashing what the client gave us reproduces what Apple signed.
 *
 * The un-hashed form is accepted too, for a client that passed its nonce to
 * Apple directly without hashing. That is not a weaker check: the nonce is a
 * freshness marker, not a secret, and either form equally proves the caller knew
 * the value bound into this specific token.
 */
function assertNonceMatches(claim: unknown, rawNonce: string | undefined): void {
  if (typeof claim !== "string" || claim.length === 0) return; // No nonce to enforce.

  if (!rawNonce) {
    throw new UnauthorizedError("Apple sign-in failed. Please try again.");
  }

  const hashed = createHash("sha256").update(rawNonce).digest("hex");
  if (hashed !== claim && rawNonce !== claim) {
    throw new UnauthorizedError("Apple sign-in failed. Please try again.");
  }
}

/**
 * The name to store when CREATING a brand-new Apple account — never a name to
 * write over an existing one.
 *
 * That split is the whole point. This function always returns something, because
 * CustomerUser.name is non-null and a new row has to have one. A returning
 * customer, by contrast, must be left alone: Apple sends no name on any sign-in
 * after the first, so calling this on every sign-in and writing the result would
 * replace a real name with the fallback below. The route passes the verified
 * name and this fallback as two separate fields for exactly that reason.
 *
 * Apple hands the client a name on the first authorization only, so `clientName`
 * is present for a genuine first sign-in and absent for everything else —
 * including a user who signed in, deleted their account here, and came back.
 * It is untrusted input: it decorates a profile and is never read by any
 * authorization decision.
 *
 * The fallback matters more than it looks. Google's verifier falls back to the
 * email's local part, which reads fine for `ahmed@gmail.com`. For a Hide-My-Email
 * relay the local part is random hex, so that same fallback would put a string
 * like `k9x2m4h8t1` in front of the company this customer is messaging. A plain
 * Arabic default is the better failure.
 */
export function appleCreationName(
  identity: AppleIdentity,
  clientName?: string | null,
): string {
  const trimmed = clientName?.trim();
  if (trimmed) return trimmed.slice(0, 80);
  if (identity.isPrivateEmail) return "مستخدم Apple";
  return identity.email.split("@")[0]!;
}

/*
 * ── Operational note: mail to a relay address ────────────────────────────────
 * Anything sent to `@privaterelay.appleid.com` is REJECTED by Apple unless the
 * sending domain and address are registered under
 * Certificates, Identifiers & Profiles → Services → Sign in with Apple for Email
 * Communication, with the matching SPF record published. Until that is done,
 * every welcome / verification / password email to a Hide-My-Email customer
 * bounces, and nothing in this codebase can detect it.
 */
