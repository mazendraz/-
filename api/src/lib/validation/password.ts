// Password strength rules, in one place so the admin user endpoints, the
// self-service change endpoint and the create-admin bootstrap script cannot drift
// apart on what counts as acceptable.
import { z } from "zod";

/**
 * Twelve, not eight.
 *
 * Eight characters with no other rule accepted `password123`, and the only thing
 * standing behind it was the login throttle — 10/min per IP and 10 failures per
 * 15 minutes per account. That slows a spray; it does not stop a patient one, and
 * it does nothing at all once a hash is offline (which is precisely the situation
 * after the 2026-08-10 credential exposure).
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * bcrypt silently truncates its input past 72 BYTES. Rejecting above that is
 * honest: a user who sets a 100-character passphrase should not be told it was
 * accepted when only the first 72 bytes were ever hashed.
 */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * The passwords that actually show up in credential-stuffing lists, plus the ones
 * specific to this product that a person under time pressure reaches for.
 *
 * Deliberately a small embedded set rather than a dependency or a network call:
 * this runs on every password write, must work offline and in CI, and the long
 * tail of a 10-million-entry list adds almost nothing over the head of it. If you
 * want the real thing later, the place to add it is behind this function, not
 * beside it.
 */
const COMMON_PASSWORDS = new Set([
  "password", "passwort", "pass", "passw0rd", "p@ssword", "p@ssw0rd",
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
  "qwerty", "qwertyuiop", "azerty", "qwertz", "asdfgh", "zxcvbnm",
  "111111", "000000", "121212", "123123", "654321", "666666", "888888",
  "abc123", "a1b2c3", "letmein", "welcome", "monkey", "dragon", "master",
  "login", "admin", "administrator", "root", "guest", "test", "testing",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman",
  "trustno", "whatever", "shadow", "michael", "jennifer", "jordan",
  "hello", "freedom", "starwars", "computer", "internet", "samsung",
  "google", "facebook", "myspace", "linkedin", "secret", "changeme",
  "default", "temporary", "newpassword", "oldpassword", "mypassword",
  // Product / locale specific — the ones someone here would actually pick.
  "alassema", "assema", "elassema", "alassima", "asema",
  "egypt", "cairo", "masr", "misr", "newcapital", "capital",
]);

/**
 * Is this password one of the obvious ones?
 *
 * Checks the raw value AND its letters-only form, because `Password123!` is not a
 * different secret from `password` — the digits and the bang are the two things
 * every "add a number and a symbol" rule taught people to append, and an attacker
 * generating a wordlist appends them first.
 *
 * The `>= 4` floor stops a password made mostly of digits and symbols from
 * collapsing to a two-letter fragment that happens to match nothing useful.
 */
export function isCommonPassword(plain: string): boolean {
  const normalized = plain.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) return true;

  const lettersOnly = normalized.replace(/[^a-z]/g, "");
  return lettersOnly.length >= 4 && COMMON_PASSWORDS.has(lettersOnly);
}

/**
 * Does the password just restate the account it protects?
 *
 * `mazen@alassema.com` → `mazen2026!!` is a password an attacker guesses from the
 * login form alone. Takes the email separately because the schema does not have
 * it; callers that know the email should use this alongside `passwordSchema`.
 */
export function isDerivedFromEmail(plain: string, email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (local.length < 4) return false;
  return plain.toLowerCase().replace(/[^a-z0-9]/g, "").includes(local);
}

/** The shared password rule. Used by every write path that sets a password. */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`)
  .refine(
    (p) => !isCommonPassword(p),
    "That password is too common — pick something harder to guess.",
  );
