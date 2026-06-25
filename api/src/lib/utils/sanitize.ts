// Server-side input sanitization for free-text fields. Strips HTML tags (and the
// content of script/style elements) as defense-in-depth against stored XSS — the
// React frontend also escapes on render, but the API must not persist markup.
import { z } from "zod";

export function stripHtml(input: string): string {
  return input
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
