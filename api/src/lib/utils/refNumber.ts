// Lead reference numbers: AA-YYYYMMDD-XXXX (XXXX = random base36, uppercase).
// Generated server-side; uniqueness is enforced by the Lead.refNumber unique index.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSuffix(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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
