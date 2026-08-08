import {
  AsYouType, parsePhoneNumberFromString, isValidPhoneNumber, type CountryCode,
} from "libphonenumber-js/min";

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = "EG";

/** Full E.164 validity — what the backend now requires on new submissions. */
export function isValidE164(value: string): boolean {
  if (!value) return false;
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
}

/**
 * Live-format whatever the user has typed so far, under the given country's
 * rules — the AsYouType formatter handles trunk prefixes and digit grouping
 * per-country instead of a hand-rolled regex (see libphonenumber-js docs).
 */
export function formatAsYouType(raw: string, country: CountryCode): string {
  return new AsYouType(country).input(raw);
}

/**
 * E.164 for the given raw national input, or null while incomplete/invalid.
 * Requires `isValid()`, not just a parseable shape — some countries (Egypt
 * included) have variable-length landline patterns, so a still-being-typed
 * mobile number's prefix can otherwise parse as a "complete" shorter landline
 * number and get returned prematurely on every keystroke.
 */
export function toE164(raw: string, country: CountryCode): string | null {
  if (!raw.trim()) return null;
  const parsed = parsePhoneNumberFromString(raw, country);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Parse an existing stored value (E.164, or legacy formatted/local text) into
 * a country + national display string, for preselecting the picker when
 * editing an existing record. Falls back to `fallback` + the raw digits when
 * the value doesn't parse as a real number (blank field, garbage legacy data).
 */
export function parseExisting(
  value: string,
  fallback: CountryCode = DEFAULT_COUNTRY,
): { country: CountryCode; national: string } {
  const trimmed = value.trim();
  if (!trimmed) return { country: fallback, national: "" };
  const parsed = parsePhoneNumberFromString(trimmed, fallback);
  if (parsed) {
    return { country: (parsed.country as CountryCode | undefined) ?? fallback, national: parsed.formatNational() };
  }
  return { country: fallback, national: trimmed };
}

/** Pretty-print a stored phone for read-only display; returns the raw string unchanged if it doesn't parse. */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, DEFAULT_COUNTRY);
  return parsed ? parsed.formatInternational() : raw;
}
