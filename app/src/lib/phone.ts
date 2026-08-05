import {
  AsYouType, parsePhoneNumberFromString, isValidPhoneNumber,
  getCountries, getCountryCallingCode, type CountryCode,
} from "libphonenumber-js/min";
import type { Locale } from "./i18n";

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = "EG";

export interface CountryOption {
  code: CountryCode;
  dialCode: string; // "20", no "+"
  name: string; // localized display name
}

// Intl.DisplayNames gives every country's localized name for free — no
// hand-maintained bilingual name table to keep in sync with libphonenumber's
// own country list. Memoized per locale since building all ~245 entries
// (region lookup + calling code) on every render/keystroke would be wasteful.
const cache = new Map<Locale, CountryOption[]>();

export function countryOptions(locale: Locale): CountryOption[] {
  const cached = cache.get(locale);
  if (cached) return cached;

  const names = new Intl.DisplayNames([locale === "ar" ? "ar" : "en"], { type: "region" });
  const options = getCountries()
    .map((code): CountryOption => ({
      code,
      dialCode: getCountryCallingCode(code),
      name: names.of(code) ?? code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  cache.set(locale, options);
  return options;
}

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

/** Best-effort E.164 for the given raw national input, or null while incomplete. */
export function toE164(raw: string, country: CountryCode): string | null {
  if (!raw.trim()) return null;
  const parsed = parsePhoneNumberFromString(raw, country);
  return parsed?.number ?? null;
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
