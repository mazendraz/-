import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isApiConfigured, onReachabilityChange, probeReady } from "./api";

// How long between probes once we already suspect the backend is down.
const PROBE_INTERVAL_MS = 10_000;
// Consecutive failed probes before we show the offline screen. Three at 10s ≈
// 30s of confirmed unreachability — long enough to ride out a brief network
// blip (switching wifi, a phone waking up) without flashing a scary
// full-screen message at everyone. Same threshold as the website's
// useBackendHealth, same reasoning.
const FAILURES_BEFORE_OFFLINE = 3;

/**
 * Is the backend unreachable? The mobile counterpart of the website's
 * useBackendHealth — same reactive-not-polling shape (api.ts already knows
 * when a request fails, because it was making that request anyway; this only
 * starts probing once it hears about a failure, and stops the moment one
 * probe succeeds), adapted for having no `window`/`document`:
 *   - the "a request just failed elsewhere in the app" signal is api.ts's own
 *     onReachabilityChange pub/sub instead of a window CustomEvent
 *   - "is the app currently in the foreground" is AppState instead of
 *     document.visibilitychange
 *
 * Before this hook existed, an unreachable API meant every screen just
 * quietly showed empty lists/sections with no explanation — indistinguishable
 * from "the app is broken" to anyone testing it. This turns that into one
 * clear, unmissable "can't reach the server" screen, same as the website.
 */
export function useBackendHealth(): boolean {
  const [offline, setOffline] = useState(false);
  // Refs, not state: these change inside the probe loop and must not re-run
  // the effect (which would tear down and recreate the timer every tick).
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probing = useRef(false);

  useEffect(() => {
    // Unconfigured (no EXPO_PUBLIC_API_URL) — nothing to be offline from.
    if (!isApiConfigured()) return;

    let alive = true;

    const stop = () => {
      probing.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    // Clear before setting — the AppState "active" handler below calls probe()
    // directly and probe() ends in schedule(), so an already-pending timer would
    // otherwise survive and start a second chain, one more per foreground. Same
    // defect and same fix as the website's hooks/useBackendHealth.ts.
    const schedule = () => {
      if (!alive || !probing.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(probe, PROBE_INTERVAL_MS);
    };

    async function probe() {
      if (!alive) return;
      // Nothing to learn while backgrounded — wait for it to come back.
      if (AppState.currentState !== "active") {
        schedule();
        return;
      }
      const ok = await probeReady();
      if (!alive) return;
      if (ok) {
        failures.current = 0;
        setOffline(false);
        stop(); // recovered — back to zero cost
        return;
      }
      failures.current += 1;
      if (failures.current >= FAILURES_BEFORE_OFFLINE) setOffline(true);
      schedule();
    }

    const start = () => {
      if (probing.current) return; // already watching
      probing.current = true;
      void probe(); // check immediately, then on the interval
    };

    // A successful request anywhere in the app proves the backend is
    // reachable; a failed one is what starts the probe loop in the first
    // place. Both come through the same channel apiFetch already feeds.
    const unsubscribe = onReachabilityChange((reachable) => {
      if (reachable) {
        failures.current = 0;
        setOffline(false);
        stop();
      } else {
        start();
      }
    });

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && probing.current) void probe();
    });

    return () => {
      alive = false;
      stop();
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return offline;
}
