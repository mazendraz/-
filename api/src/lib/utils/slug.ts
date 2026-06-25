// URL slug generation. Handles Latin text; Arabic/other non-Latin input falls back
// to a stable hash suffix so a slug is always produced.

/** Convert a label into a URL-safe slug ("Aura Interiors" → "aura-interiors"). */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // collapse repeats

  return base;
}

/**
 * Produce a slug guaranteed unique against `exists`. Appends -2, -3, … on collision.
 * `exists(slug)` returns true if the slug is already taken.
 */
export async function uniqueSlug(
  input: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(input) || "item";
  let candidate = base;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
