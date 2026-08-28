/**
 * Refetch a screen's data when it comes back into view.
 *
 * ── The problem this exists for ──────────────────────────────────────────────
 * Every catalog screen in this app fetches inside a mount-time `useEffect`.
 * That is correct exactly once. expo-router keeps a tab screen MOUNTED after
 * its first visit (the same behaviour liveEvents.ts documents for its own
 * reasons), so `fetchCompanies` / `fetchCategories` ran a single time in the
 * whole app session — and there was no `useFocusEffect` anywhere in the app to
 * make up for it.
 *
 * The practical consequence: an admin edits a company, a price, or a category
 * on the website, and the phone kept showing the old version until the app was
 * force-closed and reopened. The data was never stale on the SERVER — both
 * clients read the same Postgres through the same API (api's next.config.ts
 * aliases /api/v1 onto the website's own handlers) — the app just never asked
 * again.
 *
 * ── Why not the live (SSE) stream instead ────────────────────────────────────
 * The stream carries three event types (message / lead / lead-status), all of
 * them per-account, and both stream endpoints require authentication. Catalog
 * edits publish nothing, and a signed-out visitor browsing companies has no
 * stream at all. A server-pushed `catalog` event is the better long-term
 * answer; this is the part that works today, for every visitor, without a new
 * unauthenticated connection endpoint.
 *
 * ── Why a minimum interval ───────────────────────────────────────────────────
 * Without one, flicking between two tabs fires a request per tap. The public
 * catalog is served with `max-age=30` (api's response.ts PUBLIC_READ_CACHE), so
 * anything faster than that couldn't return newer data anyway — the guard just
 * declines to ask a question whose answer is already known.
 *
 * It also gives "skip the first focus" for free: `lastRun` starts at mount
 * time, and the first focus lands a few milliseconds later, so it is inside the
 * window and skipped. The screen's own mount fetch is not doubled.
 */
import { useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";

/** Matches PUBLIC_READ_CACHE's max-age — see the comment above. */
const DEFAULT_MIN_INTERVAL_MS = 30_000;

/**
 * Run `refresh` when the screen regains focus, and when the app returns to the
 * foreground while this screen is the focused one — never more often than
 * `minIntervalMs`, and never on the initial mount (the screen fetches for
 * itself there).
 *
 * `refresh` may be an inline arrow: it is read through a ref, so a new function
 * identity every render does not re-subscribe anything.
 */
export function useRefreshOnFocus(
  refresh: () => void,
  minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS,
): void {
  const handler = useRef(refresh);
  handler.current = refresh;

  // Mount counts as a run — the screen's own mount-time fetch just happened.
  const lastRun = useRef(Date.now());

  const maybeRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRun.current < minIntervalMs) return;
    lastRun.current = now;
    handler.current();
  }, [minIntervalMs]);

  useFocusEffect(
    useCallback(() => {
      maybeRefresh();

      // Returning from another APP is the other half of this: the screen never
      // lost focus, so no focus event is coming, but the customer has been
      // away — possibly for hours — and is looking at whatever was on screen
      // when they left.
      const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
        if (state === "active") maybeRefresh();
      });

      return () => subscription.remove();
    }, [maybeRefresh]),
  );
}
