// Business Performance — the Analytics module's deeper, comparison-focused
// read on the same numbers Overview already shows. Deliberately reuses the
// EXISTING /admin/desktop/overview and /admin/finance/overview endpoints
// rather than standing up a parallel aggregation (see the mega-spec's "do
// not create duplicate systems" rule) — Conversion Rate and Outstanding are
// both derivable from fields those two endpoints already return, so no
// backend change was needed for this screen at all.
import { useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, NoDataForPeriod } from "@/components/states/States";
import { Trend } from "@/components/shared/Trend";
import { formatCurrency, formatCompactNumber } from "@/lib/format";
import type { ApiDesktopOverview, ApiFinanceOverview } from "@/lib/apiTypes";

export function BusinessPerformancePage() {
  const { days, label } = usePeriod();

  const overview = useFetch<ApiDesktopOverview>(() => apiGet<ApiDesktopOverview>(`/admin/desktop/overview?days=${days}`), [days]);
  const finance = useFetch<ApiFinanceOverview>(
    () => apiGet<ApiFinanceOverview>(`/admin/finance/overview?from=${Date.now() - days * 86_400_000}`),
    [days],
  );

  const loading = overview.loading || finance.loading;
  const error = overview.error ?? finance.error;

  return (
    <>
      <PageHeader title="Business Performance" description={`Platform-wide performance, ${label.toLowerCase()}.`} />

      {loading && <LoadingState label="Loading business performance…" />}
      {!loading && error && <ErrorState message={error} onRetry={() => { overview.refetch(); finance.refetch(); }} />}
      {!loading && !error && overview.data && finance.data && <Body overview={overview.data} finance={finance.data} />}
    </>
  );
}

function Body({ overview, finance }: { overview: ApiDesktopOverview; finance: ApiFinanceOverview }) {
  const conversionRatePercent = useMemo(
    () => (overview.newRequests > 0 ? Math.round((overview.completedServices / overview.newRequests) * 1000) / 10 : 0),
    [overview.newRequests, overview.completedServices],
  );
  const isQuiet =
    overview.newClients === 0 && overview.newRequests === 0 && overview.completedServices === 0 && overview.serviceValue === 0;

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="New Clients" value={formatCompactNumber(overview.newClients)} trendPercent={overview.trend.newClientsPercent} />
        <KpiCard label="New Requests" value={formatCompactNumber(overview.newRequests)} trendPercent={overview.trend.newRequestsPercent} />
        <KpiCard label="Completed Services" value={formatCompactNumber(overview.completedServices)} trendPercent={overview.trend.completedServicesPercent} />
        <KpiCard label="Conversion Rate" value={`${conversionRatePercent}%`} hint="Completed services ÷ new requests, this period." />
        <KpiCard label="Service Value" value={formatCurrency(overview.serviceValue)} trendPercent={overview.trend.serviceValuePercent} />
        <KpiCard label="Al Asima Revenue" value={formatCurrency(overview.alAsimaRevenue)} trendPercent={overview.trend.alAsimaRevenuePercent} highlight />
        <KpiCard label="Expenses" value={formatCurrency(overview.expenses)} trendPercent={overview.trend.expensesPercent} inverse />
        <KpiCard label="Net Income" value={formatCurrency(finance.netIncome)} tone={finance.netIncome < 0 ? "critical" : undefined} />
        <KpiCard label="Outstanding" value={formatCurrency(finance.outstandingRevenue)} tone={finance.outstandingRevenue > 0 ? "warning" : undefined} />
      </div>

      {isQuiet ? <NoDataForPeriod /> : <ServiceValueChart series={overview.series} />}
    </>
  );
}

function KpiCard({
  label,
  value,
  trendPercent,
  highlight,
  inverse,
  tone,
  hint,
}: {
  label: string;
  value: string;
  trendPercent?: number | null;
  highlight?: boolean;
  inverse?: boolean;
  tone?: "critical" | "warning";
  hint?: string;
}) {
  const valueTone = tone === "critical" ? "text-error" : highlight ? "text-primary" : "text-on-surface";
  return (
    <div
      className={`rounded-lg border p-5 transition-shadow hover:shadow-lift ${
        highlight ? "border-primary/30 bg-primary/5" : "border-outline-variant bg-surface-container-lowest"
      }`}
      title={hint}
    >
      <p className="mb-3 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
      <div className="flex flex-col">
        <span className={`font-headline-sm text-headline-sm tabular-nums ${valueTone}`}>{value}</span>
        {trendPercent !== undefined && <Trend percent={trendPercent} inverse={inverse} className="mt-1 w-max" />}
      </div>
    </div>
  );
}

function ServiceValueChart({ series }: { series: ApiDesktopOverview["series"] }) {
  const { path, area, maxValue } = useMemo(() => buildChartPaths(series), [series]);

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-headline-sm text-headline-sm text-primary">Service Value vs Al Asima Revenue</h3>
        <div className="flex space-x-4">
          <Legend swatch="bg-primary" label="Service Value" />
          <Legend swatch="bg-secondary" label="Revenue" />
        </div>
      </div>
      {series.length === 0 || maxValue === 0 ? (
        <NoDataForPeriod />
      ) : (
        <div className="relative h-64 w-full">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none">
            <line className="chart-grid" x1="0" x2="800" y1="40" y2="40" />
            <line className="chart-grid" x1="0" x2="800" y1="90" y2="90" />
            <line className="chart-grid" x1="0" x2="800" y1="140" y2="140" />
            <line className="chart-grid" x1="0" x2="800" y1="190" y2="190" />
            <line className="chart-grid" x1="0" x2="800" y1="240" y2="240" />
            <path className="chart-area-primary" d={area.serviceValue} />
            <path className="chart-line-primary" d={path.serviceValue} />
            <path className="chart-area-secondary" d={area.revenue} />
            <path className="chart-line-secondary" d={path.revenue} />
          </svg>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center space-x-2">
      <div className={`h-3 w-3 rounded-sm ${swatch}`} />
      <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
    </div>
  );
}

function buildChartPaths(series: ApiDesktopOverview["series"]) {
  const w = 800;
  const h = 240;
  const values = series.flatMap((p) => [p.serviceValue, p.revenue]);
  const maxValue = Math.max(1, ...values);
  const n = Math.max(1, series.length - 1);

  function toPoints(key: "serviceValue" | "revenue") {
    return series.map((p, i) => {
      const x = (i / n) * w;
      const y = h - (p[key] / maxValue) * h;
      return [x, y] as const;
    });
  }

  function lineD(points: readonly (readonly [number, number])[]) {
    return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  }

  function areaD(points: readonly (readonly [number, number])[]) {
    if (points.length === 0) return "";
    const last = points[points.length - 1]!;
    const first = points[0]!;
    return `${lineD(points)} L${last[0].toFixed(1)},${h} L${first[0].toFixed(1)},${h} Z`;
  }

  const svPoints = toPoints("serviceValue");
  const revPoints = toPoints("revenue");

  return {
    maxValue: Math.max(0, ...values),
    path: { serviceValue: lineD(svPoints), revenue: lineD(revPoints) },
    area: { serviceValue: areaD(svPoints), revenue: areaD(revPoints) },
  };
}
