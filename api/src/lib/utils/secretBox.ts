/**
 * Authenticated symmetric encryption for the few secrets that must be stored
 * RECOVERABLE rather than hashed.
 *
 * Almost every secret in this codebase is stored as a sha256 digest — session
 * refresh tokens, email-verification tokens, password-reset tokens — because
 * nothing ever needs the original back; a later request presents its own copy
 * and the two digests are compared. That is strictly safer and it is the default
 * everywhere it fits.
 *
 * It does not fit an Apple refresh token. That value has to be handed BACK to
 * Apple, months later, at account deletion (see appleServerAuth.service). A hash
 * cannot be replayed, so the choice is between plaintext and encryption.
 *
 * ── Why encrypt at all, given the token is already useless alone ─────────────
 * An Apple refresh token cannot be redeemed without a client secret signed by
 * our Sign-in-with-Apple private key, which lives in the environment and never
 * in the database. So a database-only compromise yields nothing redeemable, and
 * plaintext would arguably be defensible.
 *
 * It is still encrypted, for one reason that survives that argument: the schema
 * states, twice, that a database read must not yield working keys, and "working
 * only if the attacker also has the .p8" is a caveat that quietly stops being
 * true the day a backup and an env dump appear in the same breach. The cost of
 * not relying on that caveat is this file.
 *
 * ── Format ──────────────────────────────────────────────────────────────────
 * AES-256-GCM. Serialized as three base64url parts joined by `.`:
 *
 *     v1.<iv>.<ciphertext>.<authTag>
 *
 * The `v1` prefix is what makes a future algorithm change a migration rather
 * than a guess: `open` refuses anything it does not recognise instead of
 * misreading old bytes under new rules.
 *
 * GCM rather than CBC because it authenticates: a flipped bit in the stored
 * column fails `open` loudly instead of decrypting to plausible garbage that
 * then gets POSTed to Apple.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
/** GCM's standard nonce width. Not a tunable — 96 bits is what the mode expects. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * The key, decoded from `APPLE_TOKEN_ENCRYPTION_KEY`.
 *
 * Read per call rather than cached at import, matching allowedAudiences() in the
 * identity services: the value stays a pure function of the current environment,
 * which is what lets tests stub it.
 *
 * Base64 (either alphabet) of exactly 32 bytes — generate with
 * `openssl rand -base64 32`. A too-short key is thrown on rather than padded or
 * stretched: silently accepting a 6-character "key" would produce ciphertext
 * that looks fine in the column and protects nothing.
 */
function encryptionKey(): Buffer | null {
  const raw = process.env.APPLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APPLE_TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} base64-encoded bytes ` +
        `(got ${key.length}) — generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** True when a key is configured and sealing will work. */
export function isSecretBoxConfigured(): boolean {
  return encryptionKey() !== null;
}

/**
 * Encrypt a value for storage. Returns null when no key is configured, which
 * callers treat as "do not store this" rather than as an error — the whole
 * revocation feature is optional and turns off cleanly.
 */
export function seal(plaintext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a stored value, or null if it cannot be read.
 *
 * Null rather than a throw for every failure mode — wrong key, tampered bytes,
 * an unknown version, a truncated column — because every caller wants the same
 * thing from all of them: proceed without the token. Account deletion in
 * particular must not be blocked by an unreadable ciphertext.
 */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;

  const key = encryptionKey();
  if (!key) return null;

  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(parts[1]!, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parts[3]!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // final() throws when the auth tag does not match — the expected outcome of
    // a rotated key or a modified row, and not something to crash a request for.
    return null;
  }
}
