/**
 * One reload at a time, and never a missed one.
 *
 * ── The problem this exists for ─────────────────────────────────────────────
 * Every account-scoped screen in the client app refetches on a live event, and
 * expo-router keeps a tab screen MOUNTED after its first visit (see
 * useRefreshOnFocus's comment) — so a single incoming chat message reached
 * FIVE mounted `useLiveEvents` consumers at once: the root layout's
 * price-verification check, the tab layout's two badge counts, the Messages
 * list, the Requests list, and the open chat thread. Each started its own
 * fetch (several of them the very same `GET /customer/leads`), none of them
 * knew about the others, and none of them was cancelled or skipped if one was
 * already running.
 *
 * A company replying five times in ten seconds therefore produced dozens of
 * overlapping requests, whose responses then landed in an order nobody
 * controlled — which is both the request storm and the "the list flicked back
 * to older data" race, from one cause.
 *
 * ── What this does about it ────────────────────────────────────────────────
 * While a reload is running, further triggers do not start a second one; they
 * raise a flag, and exactly ONE follow-up runs when the current one settles.
 * So a burst of N events costs at most 2 fetches instead of N, and the last
 * event is still always reflected — which a plain "skip while busy" guard
 * cannot promise, and which matters when the skipped event was the one
 * carrying the newest message.
 *
 * It deliberately does NOT replace each screen's own stale-response guard:
 * this collapses triggers, a request id decides which ANSWER wins when a
 * pull-to-refresh or an interval overlaps with an event-driven reload.
 */
import { useCallback, useEffect, useRef } from "react";

/**
 * Wrap a screen's `load` so that live events, intervals and focus can all fire
 * at it freely.
 *
 * `load` may be a new function identity every render — it is read through a
 * ref, so the returned trigger is stable and safe to put in an effect's
 * dependency list.
 */
export function useCoalescedReload(load: () => Promise<unknown> | void): () => void {
  const latest = useRef(load);
  latest.current = load;

  const running = useRef(false);
  const queued = useRef(false);
  const mounted = useRef(true);
  // Nothing here can set state after unmount on its own, but a queued
  // follow-up would keep firing `load` — and therefore its setState calls —
  // for a screen that is gone. The chain stops at the unmount instead.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runRef = useRef<() => void>(() => {});
  const run = useCallback(() => {
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    // `load` is expected to handle its own errors; catching here as well is
    // what guarantees the `finally` runs — a rejection that escaped the
    // screen must not leave `running` stuck true and the screen permanently
    // deaf to every later event.
    void Promise.resolve()
      .then(() => latest.current())
      .catch(() => {})
      .finally(() => {
        running.current = false;
        if (queued.current && mounted.current) {
          queued.current = false;
          runRef.current();
        }
      });
  }, []);
  runRef.current = run;

  return run;
}
