// Dashboard aggregates, read from the server.
//
// These used to be derived in the browser from the hydrated lead list — which is
// ONE page, capped at 100 rows. So every total, percentage and chart on the
// Overview and Analytics tabs silently stopped being true once a company passed
// 100 leads, while the paginated Leads tab beside it showed the real number.
// Aggregates have to be computed where the whole table is.
//
// No localStorage cache: these are counts that move whenever a lead arrives or a
// status changes, and a stale cached KPI is worse than a brief spinner.
import { useCallback, useEffect, useState } from "react";
import { apiGet, isApiConfigured } from "./api";
import { getCurrentUser } from "./auth";
import type { ApiLeadStats } from "./apiTypes";

export type LeadStats = ApiLeadStats;

export interface StatsWindow {
  /** Days in the daily trend. Server clamps to 90. */
  days?: number;
  /** Calendar months in the monthly bars. Server clamps to 24. */
  months?: number;
  /** Trailing window for the KPI delta. */
  deltaDays?: number;
}

function query(w: StatsWindow): string {
  const sp = new URLSearchParams();
  if (w.days) sp.set("days", String(w.days));
  if (w.months) sp.set("months", String(w.months));
  if (w.deltaDays) sp.set("deltaDays", String(w.deltaDays));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Aggregates for whichever dashboard is asking.
 *
 * The endpoint is chosen from the session role, and the provider one is scoped to
 * the caller's own company SERVER-side — there is no company parameter to get
 * wrong, and a provider cannot read another company's numbers.
 */
export function fetchLeadStats(w: StatsWindow = {}): Promise<LeadStats> {
  const path = getCurrentUser()?.role === "ADMIN" ? "/admin/stats" : "/provider/stats";
  return apiGet<LeadStats>(`${path}${query(w)}`);
}

export interface LeadStatsResult {
  stats: LeadStats | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * `stats` is null in demo mode and while the first request is in flight. Callers
 * fall back to the client-side analytics over their local lead list there — which
 * is correct offline, because localStorage IS the whole dataset in that mode.
 */
export function useLeadStats(w: StatsWindow = {}): LeadStatsResult {
  const apiMode = isApiConfigured();
  const { days, months, deltaDays } = w;
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  // Primitive deps, not the options object: an inline `{ days: 14 }` is a new
  // identity every render and would refetch on a loop.
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!apiMode) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchLeadStats({ days, months, deltaDays })
      .then((s) => { if (alive) { setStats(s); setError(""); } })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load statistics.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [apiMode, days, months, deltaDays, tick]);

  return { stats, loading, error, reload };
}
