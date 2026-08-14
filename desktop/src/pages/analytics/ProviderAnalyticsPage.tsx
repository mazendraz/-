// Provider Analytics — the Analytics module's read on the same
// /admin/providers-performance endpoints ProvidersPage (Business module)
// uses, the one real difference being that this screen wires up the shared
// period tabs (from/to) that ProvidersPage doesn't use at all (it shows the
// current/all-time roster). No drawer here — click-through case management
// is ProvidersPage's job; this screen is a read-only ranked comparison.
// "Accepted Requests" from the mockup is dropped, same reasoning as
// ProvidersPage's comment: Lead has no "accepted" state distinct from
// contacted/in-progress. "Avg Service Value" is computed client-side from
// two fields the row already carries (serviceValue / completedServices) —
// not a separate backend field.
import { useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ApiCategory, ApiPage, ApiProviderPerformance, ApiProviderPerformanceSummary } from "@/lib/apiTypes";

const PAGE_SIZE = 20;

export function ProviderAnalyticsPage() {
  const { days, label } = usePeriod();
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  // Lazy initializer, not a bare Date.now() in the render body — the
  // react-hooks/purity rule flags direct impure calls during render; this
  // pattern is the established fix (see FinanceOverviewPage.tsx).
  const [anchor] = useState(() => Date.now());
  const from = useMemo(() => anchor - days * 86_400_000, [anchor, days]);

  const summary = useFetch<ApiProviderPerformanceSummary>(
    () => apiGet<ApiProviderPerformanceSummary>("/admin/providers-performance/summary"),
    [],
  );
  const categories = useFetch<ApiCategory[]>(() => apiGet<ApiCategory[]>("/categories"), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), from: String(from) });
    if (category) params.set("category", category);
    return params.toString();
  }, [category, page, from]);

  const list = useFetch<ApiPage<ApiProviderPerformance>>(
    () => apiGet<ApiPage<ApiProviderPerformance>>(`/admin/providers-performance?${query}`),
    [query],
  );

  return (
    <>
      <PageHeader title="Provider Analytics" description={`Performance ranking across every provider — ${label.toLowerCase()}.`} />

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total Providers" value={summary.data ? formatNumber(summary.data.totalProviders) : undefined} loading={summary.loading} icon="groups" />
        <KpiCard label="Active Providers" value={summary.data ? formatNumber(summary.data.activeProviders) : undefined} loading={summary.loading} icon="how_to_reg" />
        <KpiCard label="Completed Services" value={summary.data ? formatNumber(summary.data.completedServicesTotal) : undefined} loading={summary.loading} icon="task_alt" />
        <KpiCard label="Avg Rating" value={summary.data ? summary.data.avgRating.toFixed(1) : undefined} loading={summary.loading} icon="star" />
        <KpiCard
          label="Price Discrepancy Rate"
          value={summary.data ? `${summary.data.discrepancyRatePercent}%` : undefined}
          loading={summary.loading}
          icon="warning"
          tone={summary.data && summary.data.discrepancyRatePercent > 3 ? "critical" : undefined}
        />
      </div>

      <div className="flex flex-col rounded border border-outline-variant bg-surface-container-lowest">
        <div className="flex flex-wrap items-center gap-4 border-b border-surface-container-high bg-surface-bright p-component-padding-x">
          <span className="flex items-center font-label-md text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined mr-1 align-middle text-[16px]">filter_list</span>
            Filters
          </span>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="cursor-pointer appearance-none rounded border border-outline-variant bg-surface px-3 py-1.5 pr-8 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Categories</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-outline">
              arrow_drop_down
            </span>
          </div>
        </div>

        {list.loading && <LoadingState label="Loading provider analytics…" />}
        {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.refetch} />}
        {!list.loading && !list.error && list.data && list.data.data.length === 0 && (
          <EmptyState icon="workspace_premium" title="No providers match this filter" />
        )}
        {!list.loading && !list.error && list.data && list.data.data.length > 0 && (
          <>
            <RankTable rows={list.data.data} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
  icon: string;
  tone?: "critical";
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-lift">
      <div className="mb-3 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${tone === "critical" ? "text-error" : "text-outline"}`}>{icon}</span>
      </div>
      <div className={`font-headline-sm text-headline-sm tabular-nums ${tone === "critical" ? "text-error" : "text-on-surface"}`}>
        {loading || value === undefined ? "—" : value}
      </div>
    </div>
  );
}

function avgServiceValue(p: ApiProviderPerformance): number {
  return p.completedServices > 0 ? Math.round(p.serviceValue / p.completedServices) : 0;
}

function RankTable({ rows }: { rows: ApiProviderPerformance[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-surface-container-low font-label-md text-label-md uppercase text-on-surface-variant">
          <tr>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Provider</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Category</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Requests</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Completed</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Completion Rate</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Service Value</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Avg Service Value</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Rating</th>
            <th className="border-b border-surface-container-high px-4 py-3 text-right font-semibold">Discrepancy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-high bg-surface-container-lowest font-body-sm text-body-sm text-on-surface">
          {rows.map((p) => (
            <tr key={p.companyId} className="transition-colors hover:bg-surface-bright">
              <td className="px-4 py-3 font-medium">{p.companyName}</td>
              <td className="px-4 py-3 text-on-surface-variant">{p.categoryLabel || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatNumber(p.requestsHandled)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatNumber(p.completedServices)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{p.completionRatePercent}%</td>
              <td className="px-4 py-3 text-right tabular-nums text-primary">{formatCurrency(p.serviceValue)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatCurrency(avgServiceValue(p))}</td>
              <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{p.avgRating.toFixed(1)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${p.discrepancyRatePercent > 3 ? "font-medium text-error" : "text-on-surface-variant"}`}>
                {p.discrepancyRatePercent}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
