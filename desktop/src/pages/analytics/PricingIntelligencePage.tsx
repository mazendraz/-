// Ported from stitch_al_asima_command_center/pricing_intelligence_2/code.html
// — KPI row and the "Open Price Discrepancies" table (renamed Variance
// Ledger here, since it lists every VERIFIED row, confirmed or disputed, not
// only open ones — see below) follow that mockup closely.
//
// The mockup's weekly "Price Comparison Analysis" chart (Estimated/Provider
// Final/Client Confirmed per week) was deliberately deferred at Stage 8 —
// pricingIntelligence.service.ts didn't compute a time-bucketed series yet —
// with a note that it could be "added the same way Overview's was if
// wanted." That's what pricingAnalytics() + /admin/analytics/pricing add
// here: the chart, plus by-category/by-provider breakdowns of the same
// underlying data. This is the ONE Pricing screen (matches the single
// "Pricing Intelligence" nav destination) — deliberately not a second
// Analytics page, to avoid exactly the duplicate system the brief warns
// against. Provider Final Price and Client Confirmed Price are kept as two
// separate lines in the new chart (never collapsed), per the platform's core
// pricing rule that the two are not the same number — unlike the KPI row's
// pre-existing avgFinalPrice, which stays as Stage 8 defined it.
//
// One other thing deliberately left out rather than faked:
//   - Status: the mockup shows three states (Pending Review / Under Review /
//     Resolved). This screen's variance rows are already-VERIFIED
//     completions ONLY (verifiedAt is not null — see the service), so there
//     is no "pending" sub-state here; a row is either CONFIRMED ("Resolved")
//     or DISCREPANCY ("Needs Review"). Unverified completions live on the
//     Price Verification screen (Stage 7), not this one.
import { useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFetch, type FetchState } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState, NoDataForPeriod } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { formatCurrency } from "@/lib/format";
import type { ApiPricingAnalytics, ApiPricingIntelligence } from "@/lib/apiTypes";

const PAGE_SIZE = 20;

export function PricingIntelligencePage() {
  const [page, setPage] = useState(1);
  const { days } = usePeriod();

  const query = useMemo(() => new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) }).toString(), [page]);

  const { data, loading, error, refetch } = useFetch<ApiPricingIntelligence>(
    () => apiGet<ApiPricingIntelligence>(`/admin/pricing-intelligence?${query}`),
    [query],
  );

  // Independent fetch from the KPI/ledger data above — the trend chart and
  // breakdowns are windowed by the shared period tabs, while the KPI row and
  // ledger stay all-verified-time as Stage 8 defined them, so each loads and
  // errors on its own rather than blocking the other.
  const analytics = useFetch<ApiPricingAnalytics>(
    () => apiGet<ApiPricingAnalytics>(`/admin/analytics/pricing?days=${days}`),
    [days],
  );

  return (
    <>
      <PageHeader title="Pricing Intelligence" description="Discrepancy rates and final-price variance across every verified job." />

      {loading && <LoadingState label="Loading pricing intelligence…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && <PricingIntelligenceBody data={data} page={page} onPageChange={setPage} analytics={analytics} />}
    </>
  );
}

function PricingIntelligenceBody({
  data,
  page,
  onPageChange,
  analytics,
}: {
  data: ApiPricingIntelligence;
  page: number;
  onPageChange: (page: number) => void;
  analytics: FetchState<ApiPricingAnalytics>;
}) {
  return (
    <>
      <div className="mb-section-gap grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Avg. Estimated Price" value={formatCurrency(data.avgEstimatedPrice)} icon="calculate" />
        <KpiCard label="Avg. Final Price" value={formatCurrency(data.avgFinalPrice)} icon="receipt_long" />
        <KpiCard
          label="Price Discrepancy Rate"
          value={`${data.priceDiscrepancyRatePercent}%`}
          icon="monitoring"
          tone={data.priceDiscrepancyRatePercent > 3 ? "critical" : undefined}
        />
        <KpiCard label="Highest Difference" value={formatCurrency(data.highestDifference)} icon="priority_high" />
      </div>

      <div className="mb-section-gap grid grid-cols-1 gap-6 md:grid-cols-2">
        <KpiCard label="Avg. Price Increase" value={formatCurrency(data.avgPriceIncrease)} icon="trending_up" small />
        <KpiCard label="Avg. Price Decrease" value={formatCurrency(data.avgPriceDecrease)} icon="trending_down" small />
        <KpiCard
          label="Additional Work Frequency"
          value={`${data.additionalWorkFrequencyPercent}% (${data.additionalWorkInstances} jobs)`}
          icon="add_task"
          small
        />
      </div>

      <div className="mb-section-gap">
        {analytics.loading && <LoadingState label="Loading price comparison analysis…" />}
        {!analytics.loading && analytics.error && <ErrorState message={analytics.error} onRetry={analytics.refetch} />}
        {!analytics.loading && !analytics.error && analytics.data && <PriceComparisonAnalysis data={analytics.data} />}
      </div>

      <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest p-5">
          <div>
            <h3 className="font-headline-sm text-headline-sm font-semibold text-primary">Variance Ledger</h3>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Every verified job&apos;s final amount against its estimate — confirmed and disputed alike.
            </p>
          </div>
        </div>

        {data.variance.length === 0 ? (
          <EmptyState icon="fact_check" title="No verified jobs in range" />
        ) : (
          <>
            <VarianceTable rows={data.variance} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.varianceTotal} onPageChange={onPageChange} />
          </>
        )}
      </section>
    </>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  small,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "critical";
  small?: boolean;
}) {
  return (
    <div className="group rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-lift">
      <div className="mb-4 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined ${tone === "critical" ? "text-error" : "text-outline group-hover:text-primary"}`}>
          {icon}
        </span>
      </div>
      <div
        className={`font-mono-data tabular-nums tracking-tight ${tone === "critical" ? "text-error" : "text-primary"} ${
          small ? "text-headline-sm" : "text-display-lg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function VarianceTable({ rows }: { rows: ApiPricingIntelligence["variance"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container-low">
          <tr>
            <th className="px-5 py-3 font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Request
            </th>
            <th className="px-5 py-3 font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Provider
            </th>
            <th className="px-5 py-3 font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Client
            </th>
            <th className="px-5 py-3 text-right font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Difference (EGP)
            </th>
            <th className="px-5 py-3 text-right font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Difference %
            </th>
            <th className="px-5 py-3 font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {rows.map((r) => {
            const diff = r.estimatedPrice != null ? r.finalPrice - r.estimatedPrice : null;
            return (
              <tr key={r.leadId} className="transition-colors hover:bg-surface-container-lowest/50">
                <td className="px-5 py-4">
                  <div className="font-mono-data text-mono-data text-primary">{r.refNumber}</div>
                  <div className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{r.service}</div>
                </td>
                <td className="px-5 py-4 font-body-md text-body-md text-on-surface">{r.companyName}</td>
                <td className="px-5 py-4 font-body-md text-body-md text-on-surface-variant">{r.clientName}</td>
                <td
                  className={`px-5 py-4 text-right font-mono-data text-mono-data tabular-nums ${
                    diff == null ? "text-on-surface-variant" : diff >= 0 ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {diff == null ? "—" : `${diff >= 0 ? "+ " : "- "}${formatCurrency(Math.abs(diff)).replace("EGP ", "")}`}
                </td>
                <td
                  className={`px-5 py-4 text-right font-mono-data text-mono-data tabular-nums ${
                    r.deltaPercent == null ? "text-on-surface-variant" : r.deltaPercent >= 0 ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {r.deltaPercent == null ? "—" : `${r.deltaPercent >= 0 ? "+" : ""}${r.deltaPercent}%`}
                </td>
                <td className="px-5 py-4">
                  {r.verificationStatus === "DISCREPANCY" ? (
                    <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-error-container px-2.5 py-1 font-label-md text-label-md text-on-error-container">
                      Needs Review
                    </span>
                  ) : (
                    <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-surface-dim px-2.5 py-1 font-label-md text-label-md text-on-surface opacity-80">
                      Resolved
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Price Comparison Analysis (weekly trend + breakdowns) ───────────────────
// The chart the Stage 8 comment above deferred, plus by-category/by-provider
// breakdowns of the same underlying data — see pricingAnalytics() in
// pricingIntelligence.service.ts for the aggregation. Estimated / Provider
// Final / Client Confirmed are always three distinct lines here, never
// collapsed into one "final" number.
function PriceComparisonAnalysis({ data }: { data: ApiPricingAnalytics }) {
  const isQuiet = data.trend.every((p) => p.avgEstimated === 0 && p.avgProviderFinal === 0 && p.avgClientConfirmed === 0);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-outline-variant p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-headline-sm text-headline-sm font-semibold text-primary">Price Comparison Analysis</h3>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Weekly averages — Provider Final Price and Client Confirmed Price kept separate, per the platform&apos;s pricing rule.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Legend swatch="bg-primary" label="Estimated" />
            <Legend swatch="bg-secondary" label="Provider Final" />
            <Legend swatch="bg-outline" label="Client Confirmed" />
          </div>
        </div>
      </div>

      <div className="p-5">
        {isQuiet ? <NoDataForPeriod /> : <TrendChart trend={data.trend} />}

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ByCategoryPanel rows={data.byCategory} />
          <ByProviderPanel rows={data.byProvider} />
        </div>
      </div>
    </section>
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

function TrendChart({ trend }: { trend: ApiPricingAnalytics["trend"] }) {
  const { path, maxValue } = useMemo(() => buildTrendPaths(trend), [trend]);

  if (trend.length === 0 || maxValue === 0) return <NoDataForPeriod />;

  return (
    <div className="relative h-64 w-full">
      <svg className="h-full w-full overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none">
        <line className="chart-grid" x1="0" x2="800" y1="40" y2="40" />
        <line className="chart-grid" x1="0" x2="800" y1="90" y2="90" />
        <line className="chart-grid" x1="0" x2="800" y1="140" y2="140" />
        <line className="chart-grid" x1="0" x2="800" y1="190" y2="190" />
        <line className="chart-grid" x1="0" x2="800" y1="240" y2="240" />
        <path className="chart-line-primary" d={path.avgEstimated} />
        <path className="chart-line-secondary" d={path.avgProviderFinal} />
        <path className="chart-line-tertiary" d={path.avgClientConfirmed} />
      </svg>
    </div>
  );
}

function buildTrendPaths(trend: ApiPricingAnalytics["trend"]) {
  const w = 800;
  const h = 240;
  const keys = ["avgEstimated", "avgProviderFinal", "avgClientConfirmed"] as const;
  const values = trend.flatMap((p) => keys.map((k) => p[k]));
  const maxValue = Math.max(0, ...values);
  const scale = maxValue > 0 ? maxValue : 1;
  const n = Math.max(1, trend.length - 1);

  function toPoints(key: (typeof keys)[number]) {
    return trend.map((p, i) => {
      const x = (i / n) * w;
      const y = h - (p[key] / scale) * h;
      return [x, y] as const;
    });
  }

  function lineD(points: readonly (readonly [number, number])[]) {
    return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  }

  return {
    maxValue,
    path: {
      avgEstimated: lineD(toPoints("avgEstimated")),
      avgProviderFinal: lineD(toPoints("avgProviderFinal")),
      avgClientConfirmed: lineD(toPoints("avgClientConfirmed")),
    },
  };
}

function ByCategoryPanel({ rows }: { rows: ApiPricingAnalytics["byCategory"] }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-surface-container-high px-5 py-4">
        <h4 className="font-label-lg text-label-lg text-on-surface">By Category</h4>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="category" title="No category data for this period" />
      ) : (
        <div className="divide-y divide-surface-container-high">
          {rows.map((r) => (
            <div key={r.category} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-body-md text-body-md text-on-surface">{r.category}</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.abs(r.avgDifferencePercent))}%` }}
                  />
                </div>
              </div>
              <div className="ml-4 flex shrink-0 flex-col items-end">
                <span className={`font-label-lg text-label-lg tabular-nums ${r.avgDifferencePercent > 3 ? "text-error" : "text-on-surface"}`}>
                  {r.avgDifferencePercent > 0 ? "+" : ""}
                  {r.avgDifferencePercent}%
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">{r.count} completions</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ByProviderPanel({ rows }: { rows: ApiPricingAnalytics["byProvider"] }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-surface-container-high px-5 py-4">
        <h4 className="font-label-lg text-label-lg text-on-surface">By Provider (Top 10)</h4>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="engineering" title="No provider data for this period" />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead className="font-label-md text-label-md uppercase text-on-surface-variant">
            <tr>
              <th className="border-b border-surface-container-high px-5 py-3 font-semibold">Provider</th>
              <th className="border-b border-surface-container-high px-5 py-3 text-right font-semibold">Completions</th>
              <th className="border-b border-surface-container-high px-5 py-3 text-right font-semibold">Avg Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm text-on-surface">
            {rows.map((r) => (
              <tr key={r.companyId} className="transition-colors hover:bg-surface-bright">
                <td className="px-5 py-3 font-medium">{r.companyName}</td>
                <td className="px-5 py-3 text-right tabular-nums text-on-surface-variant">{r.count}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${r.avgDifferencePercent > 3 ? "font-medium text-error" : "text-on-surface-variant"}`}>
                  {r.avgDifferencePercent > 0 ? "+" : ""}
                  {r.avgDifferencePercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
