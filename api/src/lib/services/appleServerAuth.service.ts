/**
 * The half of Sign in with Apple that talks BACK to Apple.
 *
 * appleIdentity.service verifies a token Apple already issued — a pure,
 * offline-ish check against a public key set, needing no credential of ours.
 * This module is the opposite: every call here is an authenticated request to
 * Apple's token endpoint, signed with our private key.
 *
 * ── Why this exists: guideline 5.1.1(v), the half everyone misses ────────────
 * The rule people remember is "an app that can create an account must let you
 * delete it in-app", and customerDeletion.service already satisfies that. For
 * Sign in with Apple there is a second, separately-enforced half: the app must
 * also call Apple's revocation endpoint, so the deleted account stops appearing
 * under Settings → Apple ID → Sign in with Apple. Skipping it leaves a dead
 * entry the user can never detach, and it is a documented rejection reason.
 *
 * Revoking needs a token issued to us. The identity token is not one — it is a
 * short-lived assertion, not a grant. The only artifact that works is a refresh
 * token, and the ONLY moment one can be obtained is the sign-in itself, from the
 * one-time `authorizationCode` Apple hands the client alongside the identity
 * token. Hence the shape of this file: exchange at sign-in, park the result
 * (encrypted — see utils/secretBox), spend it at deletion.
 *
 * ── The client secret is a JWT we sign, not a string we are given ────────────
 * Apple issues no client secret. Instead it issues a P-256 private key (.p8),
 * and the "client secret" is an ES256 JWT that we mint per request:
 *
 *     iss = Team ID          sub = client_id (our bundle id)
 *     aud = https://appleid.apple.com
 *     kid = Key ID (header)  exp ≤ 6 months out
 *
 * It is generated per call and never stored. Caching one would save a
 * millisecond of ECDSA and add a lifetime to manage; regenerating is cheaper
 * than being wrong about expiry.
 *
 * ── Which client_id ─────────────────────────────────────────────────────────
 * Whatever `aud` the identity token actually carried — passed in by the caller,
 * never guessed. For the iOS app that is the BUNDLE ID (com.alassema.client);
 * a Services ID would appear here only if the website ever offers Apple sign-in.
 * Apple rejects the exchange when `sub` does not match the client the code was
 * issued to, so guessing would fail in production and nowhere else.
 *
 * ── Nothing here is allowed to break a request ───────────────────────────────
 * Every function fails soft. A sign-in must not fail because Apple's token
 * endpoint is slow, and — much more importantly — an account deletion must NEVER
 * be blocked by it. A customer asking to be deleted gets deleted; the worst case
 * is a stale entry in their Apple settings, which is recoverable. Refusing to
 * delete is not.
 */
import { SignJWT, importPKCS8 } from "jose";

const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_ENDPOINT = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";

/**
 * Apple's ceiling is 6 months (15777000s) and rejects anything beyond it. Ten
 * minutes is used instead because this secret is minted for one HTTP request and
 * discarded — a long expiry would only widen the window if the signed JWT ever
 * leaked from a log or a proxy.
 */
const CLIENT_SECRET_TTL = "10m";

/** Apple is a hard dependency of the call but never of the caller — see header. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The .p8 contents, as issued by Apple: a PKCS#8 PEM block.
 *
 * Stored in the environment as a single line with `\n` escapes, because that is
 * what .env files, PM2 ecosystem configs and every hosted secret store can
 * actually hold. Un-escaping here means the operator pastes one value and this
 * is the only place that knows about the encoding.
 */
function privateKeyPem(): string | null {
  const raw = process.env.APPLE_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * True when this deploy can authenticate to Apple — i.e. when revocation works.
 *
 * Deliberately separate from isAppleSignInConfigured(). Sign-in needs only
 * APPLE_CLIENT_IDS (public identifiers, verifying against a public key set);
 * this needs the private key and its coordinates. A deploy can perfectly well
 * have the first without the second, and the apps keep working — it just cannot
 * revoke. Splitting the two checks is what keeps that a documented, detectable
 * state rather than a crash on the delete-account button.
 */
export function isAppleServerAuthConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      privateKeyPem(),
  );
}

/**
 * Mint the ES256 client secret for one request to Apple.
 *
 * Throws when unconfigured — every caller checks isAppleServerAuthConfigured()
 * first, so reaching here without a key is a programming error, not a runtime
 * condition to paper over.
 */
export async function appleClientSecret(clientId: string): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const pem = privateKeyPem();

  if (!teamId || !keyId || !pem) {
    throw new Error(
      "Apple server auth is unconfigured — APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY are all required",
    );
  }

  // ES256 is the only algorithm Apple accepts here; the key it issues is P-256,
  // so this pairing is fixed rather than chosen.
  const key = await importPKCS8(pem, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(CLIENT_SECRET_TTL)
    .sign(key);
}

/**
 * Trade the one-time `authorizationCode` from a sign-in for a refresh token.
 *
 * Returns null on ANY failure, including an unconfigured deploy. The caller's
 * sign-in has already succeeded on the strength of the verified identity token
 * by the time this runs — this is the optional extra that buys revocability
 * later, and it is not worth failing a login over.
 *
 * The code is single-use and expires in five minutes, so there is no retry
 * worth building: a failure here means this particular sign-in produced no
 * revocable token, and the NEXT sign-in by the same customer gets another
 * chance (see storeAppleRefreshToken's overwrite-only-when-present rule).
 */
export async function exchangeAppleAuthorizationCode(
  code: string,
  clientId: string,
): Promise<string | null> {
  if (!isAppleServerAuthConfigured()) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
    });

    const res = await fetch(APPLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Apple answers 400 with an `error` code. Logged without the body: the
      // response echoes nothing secret, but the request that produced it was
      // signed, and keeping the habit of not logging around this path is worth
      // more than the diagnostic.
      console.warn(`[apple] authorization code exchange failed: ${res.status}`);
      return null;
    }

    const json: unknown = await res.json();
    const refreshToken =
      typeof json === "object" && json !== null && "refresh_token" in json
        ? (json as { refresh_token?: unknown }).refresh_token
        : undefined;

    return typeof refreshToken === "string" && refreshToken ? refreshToken : null;
  } catch (err) {
    console.warn(
      `[apple] authorization code exchange error: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

/**
 * Revoke a refresh token, detaching this app from the user's Apple ID.
 *
 * Returns whether Apple confirmed it. The boolean is for the audit record, not
 * for control flow — see the header on why deletion never depends on it.
 *
 * Apple answers 200 with an empty body on success, and also treats an
 * already-revoked or unknown token as a 400 rather than a 200; both are terminal,
 * neither is worth retrying, and the account is being deleted either way.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<boolean> {
  if (!isAppleServerAuthConfigured()) return false;

  try {
    const body = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: clientId,
      client_secret: await appleClientSecret(clientId),
    });

    const res = await fetch(APPLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[apple] token revocation failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[apple] token revocation error: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return false;
  }
}

/**
 * The client_id to use when revoking, when the original `aud` is not to hand.
 *
 * Deletion happens months after sign-in and the identity token is long gone, so
 * the audience it carried has to be recovered from configuration. The FIRST
 * entry of APPLE_CLIENT_IDS is it, by the convention documented in .env.example:
 * the native bundle id leads the list, because the iOS app is the only client
 * that ever produces a revocable token.
 *
 * Storing the audience per identity row would remove the convention, and was
 * considered. It is not worth a column while exactly one client can reach this
 * path — but it is the change to make on the day the website gains Apple
 * sign-in, because a Services ID's token cannot be revoked with a bundle id.
 */
export function primaryAppleClientId(): string | null {
  const first = (process.env.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first ?? null;
}
