import {
  leadsPerDay, leadsPerMonth, leadsByStatus, conversionFunnel, periodDelta,
  statsPerDay, statsPerMonth, statsByStatus, statsFunnel, statsDelta, statsConversion,
} from "../../lib/analytics";
import { useLocale } from "../../context/LocaleContext";
import { useProvider } from "./context";

/**
 * The chart series behind Overview and Analytics.
 *
 * Its own module so the analytics library is imported by those two tab chunks
 * only — ProviderLayout deliberately doesn't touch it (DM-12). A provider
 * opening Settings shouldn't download the charting code.
 *
 * Server aggregates when available; the client-side fallback over the local
 * lead list is the demo-mode path, which is correct there because localStorage
 * IS the whole dataset in that mode.
 */
export function useProviderCharts() {
  const { locale } = useLocale();
  const { agg, leads, stats } = useProvider();

  return {
    daily: agg ? statsPerDay(agg, locale) : leadsPerDay(leads, 14, locale),
    byStatus: agg ? statsByStatus(agg, locale) : leadsByStatus(leads, locale),
    funnel: agg ? statsFunnel(agg, locale) : conversionFunnel(leads, locale),
    monthly: agg ? statsPerMonth(agg, locale) : leadsPerMonth(leads, 6, locale),
    delta: agg ? statsDelta(agg) : periodDelta(leads, 7),
    conversion: agg
      ? statsConversion(agg)
      : (stats.total ? Math.round((stats.completed / stats.total) * 100) : 0),
  };
}
