/**
 * Districts (New Administrative Capital zones) — a runtime value, not a type,
 * which is why this is its own file rather than living in apiTypes.ts: that
 * file is re-exported as `export type *` throughout the codebase (api's and
 * the website's own apiTypes.ts both do this, since everything else in it IS
 * a type and the whole point is that the re-export is erased at compile
 * time). A const array folded in there would have been silently deleted by
 * every one of those type-only re-exports.
 *
 * SUGGESTIONS, not options. The request form used to be a Select over this
 * list, and 12 of the first 16 requests came in as "Other" — the names below
 * are English, the form is Arabic, and the answer people recognised as theirs
 * simply was not on it. "Other" is the one answer that loses the information
 * the provider needs before quoting, and it cannot be recovered afterwards.
 * So the field is free text now (the API always accepted it —
 * createLeadSchema: sanitizedText(1, 100)) and these are offered as
 * autocomplete hints on the website and as taps in the app.
 *
 * An admin can override the list via Settings.districts (a newline-separated
 * string, parsed on the website by parseLines()). Moved here rather than
 * re-typed in mobile/client: eight literal strings copied by hand into a
 * second file is exactly the kind of drift the core extraction (phase 1)
 * exists to prevent, and it already happened once with ApiOffering.
 *
 * English names, matching the website: these are proper zone names used as-is
 * even in the Arabic UI. "Other" is gone from the list — it was never a place,
 * and with a free-text field there is nothing left for it to mean.
 */
export const DISTRICTS = [
  "R7 District",
  "R8 District",
  "R9 District",
  "Central Business District",
  "Diplomatic Quarter",
  "Government District",
  "Green River Area",
] as const;
