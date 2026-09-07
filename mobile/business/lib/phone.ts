/**
 * Phone numbers, rendered so the dial code stays on the correct end.
 *
 * ── The bug this exists to close ───────────────────────────────────────────
 * A number is stored as "+201011335466" and displayed inside Arabic screens,
 * which are RTL paragraphs. "+" is a bidi-NEUTRAL character: the Unicode
 * bidirectional algorithm gives it no direction of its own and resolves it
 * from its surroundings, and at the start of a run with nothing strongly
 * left-to-right before it, that resolution is the paragraph's own direction.
 * So the plus is placed at the paragraph's start edge — the RIGHT — and the
 * lead detail screen rendered a customer's number as "201011335466+".
 *
 * That is not a cosmetic complaint. A dial code with its plus on the wrong end
 * is a different string to anyone reading it aloud or copying it by eye, and
 * this is a screen whose entire purpose is getting a provider to call someone.
 *
 * ── Why isolate characters and not `writingDirection` ──────────────────────
 * React Native's `writingDirection` style is iOS-only; on Android it does
 * nothing, and Android is where this was observed. U+2066 LEFT-TO-RIGHT
 * ISOLATE … U+2069 POP DIRECTIONAL ISOLATE is the Unicode-level answer,
 * handled by the platform text engine on both, and it ISOLATES rather than
 * merely embeds — so the number cannot reorder against whatever label sits
 * beside it either.
 */
const LRI = "⁦";
const PDI = "⁩";

/**
 * Wrap a phone number so it always reads left-to-right, whatever surrounds it.
 *
 * Display only — never pass the result to `tel:`, `Linking`, an API call or a
 * comparison. The isolate characters are real characters and would travel with
 * the string; every call site here keeps using the raw `lead.phone` for the
 * dial itself and only formats what the eye sees.
 */
export function displayPhone(phone: string | null | undefined): string {
  const value = (phone ?? "").trim();
  if (!value) return "";
  return `${LRI}${value}${PDI}`;
}
