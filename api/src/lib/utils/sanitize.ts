// Server-side input sanitization for free-text fields. Strips HTML tags (and the
// content of script/style elements) as defense-in-depth against stored XSS — the
// React frontend also escapes on render, but the API must not persist markup.
import { z } from "zod";

/**
 * Remove characters Postgres cannot store in a `text` column.
 *
 * A NUL (U+0000) is a perfectly legal JavaScript string character and survives
 * JSON.parse and Zod untouched — but Postgres rejects it outright with
 * `22021: invalid byte sequence for encoding "UTF8": 0x00`. Prisma passes it
 * straight through, so the failure lands at the driver, where withErrors can only
 * report it as a generic 500. Measured before this fix: a single NUL anywhere in
 * a search term produced an UNAUTHENTICATED 500 on /api/companies,
 * /api/companies/:slug/reviews and every other search endpoint — no account, no
 * rate limit, one query string.
 *
 * The rest of the C0 controls go with it. They are invisible, carry no meaning in
 * a name or a search term, and are a standard way to smuggle a value past an
 * equality or uniqueness check that a human reader would call identical.
 *
 * U+0009 (tab), U+000A (line feed) and U+000D (carriage return) are deliberately
 * NOT stripped: multi-line descriptions are real content.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS, "");
}

export function stripHtml(input: string): string {
  return stripControlChars(input)
    // Drop entire <script>/<style> blocks including their contents.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    // Remove any remaining tags, leaving their text content.
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * A trimmed, HTML-stripped string with length bounds applied AFTER sanitization,
 * so a value made only of markup correctly fails the minimum length.
 */
export function sanitizedText(min: number, max: number) {
  return z
    .string()
    .transform(stripHtml)
    .pipe(z.string().min(min).max(max));
}

/** Optional sanitized text with a max bound (min 0); empty allowed. */
export function sanitizedOptionalText(max: number) {
  return z
    .string()
    .transform(stripHtml)
    .pipe(z.string().max(max));
}

/**
 * A free-text value arriving from the QUERY STRING (search terms, filter values).
 *
 * Reads needed this as much as writes did, and they were the half with nothing:
 * every text WRITE already flowed through stripHtml above, while `?search=` went
 * from the URL into a Prisma `contains` untouched — which is how a NUL byte in a
 * query string became a 500 on public endpoints.
 *
 * Returns undefined when the value is empty once cleaned, which is what every
 * caller already wants: an absent filter rather than an empty string that matches
 * everything.
 */
export function cleanParam(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return stripControlChars(value).trim() || undefined;
}
