/**
 * Phone parsing/formatting/validation — now defined once, in `@alassema/core`.
 *
 * Moved during phase 3 once a second real consumer (mobile/client's request
 * form) needed it: this was the exact module phase 1's core README named as
 * deferred until "the app that validates the move" existed. Re-exported here,
 * name by name rather than `export *`, so this file's surface stays exactly
 * what it was — DISTRICTS and the rest of core's contract don't leak into
 * every existing `../lib/phone` import site.
 */
export {
  type CountryCode,
  DEFAULT_COUNTRY,
  DEFAULT_DIAL_CODE,
  isValidE164,
  formatAsYouType,
  toE164,
  parseExisting,
  formatPhoneDisplay,
} from "@alassema/core";
