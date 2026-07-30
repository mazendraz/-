import { useEffect, useRef, useState } from "react";
import { API_DOWN_EVENT, API_UP_EVENT, isApiConfigured } from "../lib/api";

// How long between probes once we already suspect the backend is down.
const PROBE_INTERVAL_MS = 10_000;
// Consecutive failed probes before we show the offline screen. Three at 10s ≈ 30s
// of confirmed unreachability, which is long enough to ride out a redeploy or a
// brief network blip without flashing a scary full-screen message at everyone.
const FAILURES_BEFORE_OFFLINE = 3;

/**
 * Is the backend unreachable?
 *
 * ── Why this does not poll on a timer ────────────────────────────────────────
 * The obvious implementation — `setInterval(() => fetch("/api/ready"), 30_000)` —
 * costs a real `SELECT 1` against the database per open tab, per visitor, forever,
 * to learn "still fine" 99.9% of the time. On a single VPS that is pure waste.
 *
 * Instead: api.ts already knows when a request fails, because it was making that
 * request anyway. It fires API_DOWN_EVENT. Only then do we start probing
 * /api/ready — and we stop the moment one probe succeeds. Steady state costs
 * nothing and the result is identical.
 *
 * Probing pauses while the tab is hidden (a background tab does not need to know)
 * and resumes on focus.
 *
 * ── Why /api/ready and not /api/health ───────────────────────────────────────
 * /api/health is a liveness probe: it returns { ok: true } without touching the
 * database. If Postgres is down, the whole site is broken and /health still says
 * everything is fine. /api/ready runs `SELECT 1` and returns 503 when the DB is
 * unreachable — which is the condition this hook exists to detect.
 */
export function useBackendHealth(): boolean {
  const [offline, setOffline] = useState(false);
  // Refs, not state: these change inside the probe loop and must not re-run the
  // effect (which would tear down and recreate the timer on every tick).
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probing = useRef(false);

  useEffect(() => {
    // Demo mode has no backend; there is nothing to be offline from.
    if (!isApiConfigured()) return;

    let alive = true;

    const stop = () => {
      probing.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };

    const probe = async () => {
      if (!alive) return;
      // Nothing to learn while the tab is hidden — wait for it to come back.
      if (document.hidden) { schedule(); return; }
      try {
        // Bypass apiFetch: it emits the very events this hook listens to, which
        // would make the probe feed itself. Also `cache: "no-store"` so a probe
        // never reads a cached 200 from a previous healthy check.
        const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
        const res = await fetch(`${base}/ready`, { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (res.ok) {
          failures.current = 0;
          setOffline(false);
          stop();               // recovered — back to zero cost
          return;
        }
        failures.current += 1;
      } catch {
        if (!alive) return;
        failures.current += 1;
      }
      if (failures.current >= FAILURES_BEFORE_OFFLINE) setOffline(true);
      schedule();
    };

    const schedule = () => {
      if (!alive || !probing.current) return;
      timer.current = setTimeout(probe, PROBE_INTERVAL_MS);
    };

    const start = () => {
      if (probing.current) return;   // already watching
      probing.current = true;
      void probe();                  // check immediately, then on the interval
    };

    // A successful request anywhere in the app proves the backend is reachable.
    const onUp = () => {
      failures.current = 0;
      setOffline(false);
      stop();
    };

    const onVisible = () => { if (!document.hidden && probing.current) void probe(); };

    window.addEventListener(API_DOWN_EVENT, start);
    window.addEventListener(API_UP_EVENT, onUp);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      stop();
      window.removeEventListener(API_DOWN_EVENT, start);
      window.removeEventListener(API_UP_EVENT, onUp);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return offline;
}
