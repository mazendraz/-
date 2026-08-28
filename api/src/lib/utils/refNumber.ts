// Lead reference numbers: AA-YYYYMMDD-XXXX (XXXX = random base36, uppercase).
// Generated server-side; uniqueness is enforced by the Lead.refNumber unique index.
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * CSPRNG, not Math.random().
 *
 * A reference number is not itself a credential — the tracking token is, and
 * leadSecretMatches checks that one whenever the lead has it. But the reference
 * is the OTHER half of every public lookup (/leads/track, /api/chat,
 * /leads/verify), so how guessable it is decides how much a leaked or
 * low-entropy secret is worth. V8's Math.random is xorshift128+: fast,
 * well-distributed, and recoverable from a handful of observed outputs — and
 * observing outputs is trivial here, since every customer is shown their own.
 *
 * `randomInt` also avoids the modulo bias a `% ALPHABET.length` would introduce
 * (36 does not divide 256), which is not a real attack at four characters but
 * is free to get right.
 */
function randomSuffix(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Build a lead reference number, e.g. "AA-20260621-7F3K". */
export function generateRefNumber(date: Date = new Date()): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `AA-${y}${m}${d}-${randomSuffix()}`;
}

/** Validates the AA-YYYYMMDD-XXXX shape (used in tests / defensive checks). */
export const REF_NUMBER_PATTERN = /^AA-\d{8}-[A-Z0-9]{4}$/;
