import { useEffect, useRef } from "react";

/**
 * Re-run `fn` on an interval, but only while the tab is actually being looked
 * at — and once immediately whenever it becomes visible again.
 *
 * ── Why a hook rather than a setInterval in each screen ─────────────────────
 * The staff dashboards hold no SSE connection (see lib/notifications.ts for why
 * — the staff stream's `admins` channel is capped per account, and a dashboard
 * tab left open all day would spend that budget where a provider's PHONE needs
 * it). Everything that has to notice a change on the web therefore polls, and
 * every screen that polls needs the same three behaviours: stop while hidden,
 * catch up on return, and keep exactly ONE timer.
 *
 * That last one is not theoretical. ChatThread.tsx documents the bug this hook
 * exists to make unrepeatable: a hand-rolled setTimeout chain that re-armed on
 * `visibilitychange` left the previously-pending timer pending, so every
 * tab-switch-away-and-back added another concurrent chain — twenty tab switches
 * over a working day meant twenty-one loops at the same cadence, and it read as
 * "the dashboard gets slow after a while" rather than as a bug. A single
 * `setInterval` owned by one effect cannot accumulate that way: the visible
 * handler calls `fn` directly instead of scheduling anything.
 *
 * `fn` is held in a ref, so a caller may pass a fresh closure every render
 * (the usual `useCallback` that closes over the current page or query) without
 * tearing down and re-creating the timer underneath it.
 */
export function useVisiblePoll(fn: () => void, intervalMs: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      // A hidden tab does not need to know yet, and this is the single biggest
      // saving when someone leaves the dashboard open in a background tab.
      if (!document.hidden) fnRef.current();
    };

    const id = setInterval(tick, intervalMs);
    // Not `tick`: returning to the tab is exactly when the data is most likely
    // to be stale, so this one runs regardless of the (now false) hidden check.
    const onVisible = () => {
      if (!document.hidden) fnRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
