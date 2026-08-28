import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "../lib/api";

/**
 * One place for the four things every hand-rolled fetch in this app has to get
 * right, and which nine of them got wrong in at least one way.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * There is no query library here, so every data read is a `useEffect` with its
 * own `useState` loading flag. The codebase had already worked out good answers
 * to each hazard — but each answer lived in exactly one file and none was
 * reusable, so the next fetcher rebuilt all of them from scratch and usually
 * missed one:
 *
 *   • CANCELLATION — hooks/useServerSearch.ts does this properly (a real
 *     AbortController handed to fetch). Most others used an `alive` flag, which
 *     discards a late response but leaves the connection running.
 *   • STALENESS — lib/liveEvents.ts (mobile) guards with a generation counter.
 *     Without one the last RESPONSE wins rather than the last REQUEST, so a slow
 *     earlier read can overwrite a newer answer. That was a live bug in both
 *     useMaintenance hooks and in useMyCompany.
 *   • LOADING vs REFETCHING — pages/Companies.tsx distinguishes them; lib/chat.ts
 *     did not, so its list flashed a spinner on every 30s poll.
 *   • ALWAYS SETTLING — a `finally` that is actually reachable on every path.
 *     Guaranteed here, and combined with the request deadline in lib/api.ts that
 *     is what makes "loading forever" unrepresentable.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────────
 * Cross-instance de-duplication (one request shared by several mounted hooks).
 * That looks like it belongs here and doesn't: sharing a promise and cancelling
 * it are in direct conflict — whichever instance unmounts first would abort a
 * request the others are still waiting on. Where the app needs it, it is already
 * solved one level down, at module scope, next to the data it serves:
 * lib/chat.ts's `summaryInFlight`, lib/customerAuth.ts's `meInFlight`,
 * lib/requests.ts's `hydrationInFlight`. That is the right layer for it.
 *
 * Caching and revalidation are also out of scope. This app's persistence story
 * is localStorage modules that own their own hydration; a second, competing
 * cache in the view layer would be the worst of both.
 */

export interface AsyncDataResult<T> {
  data: T | undefined;
  /** True ONLY when there is nothing to show yet. Never true over stale data. */
  loading: boolean;
  /** True while re-fetching with data already on screen. */
  refetching: boolean;
  /** The last failure, or null. Cleared by a successful load. */
  error: unknown;
  /** Re-run the current request. Safe to pass straight to a Retry button. */
  refetch: () => void;
}

export interface AsyncDataOptions {
  /**
   * When false the hook stays idle: no request, no loading state, `data`
   * preserved. For demo mode (no API configured) and dependent queries whose
   * parent hasn't resolved.
   */
  enabled?: boolean;
  /**
   * Keep the previous `data` while a new `key` loads, instead of clearing it.
   * True suits a list re-filtering (the old rows stay readable); false suits
   * navigating to a different entity, where showing the previous one's data
   * under the new one's heading would be wrong.
   */
  keepPreviousData?: boolean;
}

/**
 * Run `fetcher` whenever `key` changes, with cancellation, staleness guarding
 * and a loading state that cannot get stuck.
 *
 * `key` is a plain string and must capture EVERYTHING the request depends on —
 * it is both the cache-busting identity and the effect dependency. Build it with
 * template literals or JSON.stringify; an object would change identity every
 * render and refetch forever.
 *
 * `fetcher` receives an AbortSignal and MUST pass it through (apiGet takes one
 * as its second argument). Ignoring it downgrades cancellation to "discard the
 * result", which is what most of this codebase used to do.
 */
export function useAsyncData<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { enabled = true, keepPreviousData = false }: AsyncDataOptions = {},
): AsyncDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);

  // Read through refs so a caller may pass an inline arrow without re-running
  // the effect on every render — the same reason ChatThread and useRefreshOnFocus
  // hold their callbacks this way.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Assigned during render, so the effect always sees the CURRENT value. Taking
  // `data` as a dependency instead would re-run the effect on every successful
  // load, which is a refetch loop.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Only the newest request may write. Incremented per attempt rather than
  // relying on the AbortController alone, because a response can already be
  // in-flight through `.then` when the abort lands.
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setPending(false);
      return;
    }

    const mine = ++generation.current;
    const controller = new AbortController();

    if (!keepPreviousData) setData(undefined);
    setPending(true);

    void (async () => {
      try {
        const result = await fetcherRef.current(controller.signal);
        if (mine !== generation.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        // A cancellation is this hook superseding itself or unmounting — not a
        // failure, and reporting it would flash an error on every keystroke or
        // navigation. Our request deadline in lib/api.ts deliberately surfaces as
        // an ApiError rather than an abort, so a genuine timeout still lands here.
        if (mine !== generation.current || isAbort(err) || controller.signal.aborted) return;
        setError(err);
      } finally {
        // Reachable on every path, including the abort branches above — which is
        // the whole point. The generation check keeps a superseded request from
        // clearing the CURRENT one's pending state.
        if (mine === generation.current) setPending(false);
      }
    })();

    return () => {
      // Bumping the generation before aborting means a response that is already
      // resolving cannot write either.
      generation.current += 1;
      controller.abort();
    };
  }, [key, enabled, keepPreviousData, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return {
    data,
    loading: pending && data === undefined,
    refetching: pending && data !== undefined,
    error,
    refetch,
  };
}
