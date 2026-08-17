/**
 * Districts (New Administrative Capital zones) — a runtime value, not a type,
 * which is why this is its own file rather than living in apiTypes.ts: that
 * file is re-exported as `export type *` throughout the codebase (api's and
 * the website's own apiTypes.ts both do this, since everything else in it IS
 * a type and the whole point is that the re-export is erased at compile
 * time). A const array folded in there would have been silently deleted by
 * every one of those type-only re-exports.
 *
 * The built-in default — an admin can override it via Settings.districts (a
 * newline-separated string, parsed on the website by parseLines()). Moved
 * here rather than re-typed in mobile/client: eight literal strings copied by
 * hand into a second file is exactly the kind of drift the core extraction
 * (phase 1) exists to prevent, and it already happened once with ApiOffering.
 *
 * English names, deliberately, matching the website: these are proper zone
 * names used as-is even in the Arabic UI, not translated labels.
 */
export const DISTRICTS = [
  "R7 District",
  "R8 District",
  "R9 District",
  "Central Business District",
  "Diplomatic Quarter",
  "Government District",
  "Green River Area",
  "Other",
] as const;
