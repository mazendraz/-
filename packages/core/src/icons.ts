/**
 * `Category.icon` is a free-text admin field (the website's CategoryEditor is
 * a plain `<input>`, validated server-side only for length — see
 * `api/src/lib/validation/categories.ts`), so rows arrive with decoration
 * around the actual Material Symbols name: an emoji glued on ("⚡electrical-
 * services"), a leading non-breaking space, or spaces/hyphens where the font's
 * ligature needs an underscore ("sensor door" instead of "sensor_door"). The
 * website renders `cat.icon` as literal ligature text in a
 * `material-symbols-outlined` span, so any of that decoration makes the font
 * fail to match a glyph and the raw text (or a broken box) shows instead of
 * the icon — the "category icon looks broken" report.
 *
 * Mirrors the equivalent cleanup mobile/client/components/Icon.tsx does for
 * the same data (that one additionally maps to Material Icons' kebab-case
 * naming for @expo/vector-icons; the website's font uses Material Symbols'
 * own underscore_case, so this folds to underscores instead).
 */
export function normalizeIconName(name: string | null | undefined, fallback = "category"): string {
  if (!name) return fallback;
  const symbols = name
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, " ")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return symbols || fallback;
}
