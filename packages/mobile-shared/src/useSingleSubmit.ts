/**
 * One press, one request.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * Every submitting screen in both apps already keeps a `busy` flag and hands
 * it to <Button>, which disables itself while it is true. That is the right
 * shape and it is not quite enough: `busy` is STATE, so it only disables the
 * button on the NEXT render. Two taps that land inside the same frame — a
 * double-tap, or an impatient jab at a screen that has not visibly reacted yet
 * — both read the old `false`, and both start a request.
 *
 * What that costs depends on the screen, and on the worst one it is not
 * cosmetic: two taps on "اطلب الخدمة" send the company the same order twice,
 * with two reference numbers, and only the second confirmation card is ever
 * shown — so the customer does not even know the first one exists. The same
 * window duplicates a chat message, a review, a problem report, and a
 * price-verification decision.
 *
 * ── Why a ref, and why here ────────────────────────────────────────────────
 * A ref is written synchronously, so the second tap sees the first one's mark
 * wherever in the frame it lands. Doing it once, here, rather than per screen,
 * is what keeps the reasoning above in one place — there are eight call sites,
 * and the next one added should not have to rediscover why `busy` alone is
 * insufficient.
 *
 * Deliberately NOT a replacement for `busy`: that still drives the spinner and
 * the disabled styling, which is what the customer actually sees. This only
 * closes the frame-sized hole underneath it.
 */
import { useCallback, useRef } from "react";

/**
 * Wrap an async submit handler so re-entrant calls are dropped until it
 * settles. The guard is released in a `finally`, so a FAILED submit is
 * immediately retryable — exactly as it was before.
 *
 * `handler` may be a new function identity every render; it is read through a
 * ref, so the returned callback is stable.
 */
export function useSingleSubmit<Args extends unknown[]>(
  handler: (...args: Args) => Promise<unknown> | unknown,
): (...args: Args) => void {
  const latest = useRef(handler);
  latest.current = handler;
  const running = useRef(false);

  return useCallback((...args: Args) => {
    if (running.current) return;
    running.current = true;
    // The handlers this wraps all catch their own errors and surface them;
    // catching here as well is what guarantees the release runs even if one
    // ever throws synchronously, so a single unexpected error can never leave
    // a button permanently dead for the rest of the screen's life.
    void Promise.resolve()
      .then(() => latest.current(...args))
      .catch(() => {})
      .finally(() => {
        running.current = false;
      });
  }, []);
}
