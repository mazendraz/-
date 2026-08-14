// Ported from stitch_al_asima_command_center/provider_performance_2/code.html
// — KPI row, category filter and Provider Directory table follow that
// mockup. The mockup's "Accepted" column is dropped (no such concept exists
// on Lead — only "requested" and "completed" are real states); avatar
// initials use the same primary/secondary/tertiary-container token rotation
// the mockup itself uses (no photos exist for providers here).
import { useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ApiCategory, ApiPage, ApiProviderPerformance, ApiProviderPerformanceSummary } from "@/lib/apiTypes";

const PAGE_SIZE = 20;

export function ProvidersPage() {
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiProviderPerformance | null>(null);
  const search = useDebouncedValue(searchInput, 350);

  const summary = useFetch<ApiProviderPerformanceSummary>(
    () => apiGet<ApiProviderPerformanceSummary>("/admin/providers-performance/summary"),
    [],
  );
  // Public, unauthenticated catalog data (same endpoint the storefront uses)
  // — just populating the filter dropdown, not a permission-gated read.
  const categories = useFetch<ApiCategory[]>(() => apiGet<ApiCategory[]>("/categories"), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (category) params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [category, search, page]);

  const list = useFetch<ApiPage<ApiProviderPerformance>>(
    () => apiGet<ApiPage<ApiProviderPerformance>>(`/admin/providers-performance?${query}`),
    [query],
  );

  return (
    <>
      <PageHeader title="Provider Performance" description="Requests, completion rate, service value and discrepancy rate by provider." />

      <div className="mb-section-gap grid grid-cols-1 gap-base md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Providers"
          value={summary.data ? formatNumber(summary.data.totalProviders) : undefined}
          loading={summary.loading}
          icon="groups"
        />
        <KpiCard
          label="Active Now"
          value={summary.data ? formatNumber(summary.data.activeProviders) : undefined}
          loading={summary.loading}
          icon="how_to_reg"
          sub={
            summary.data && summary.data.totalProviders > 0
              ? `${Math.round((summary.data.activeProviders / summary.data.totalProviders) * 100)}% of all providers`
              : undefined
          }
        />
        <KpiCard
          label="Completed Services"
          value={summary.data ? formatNumber(summary.data.completedServicesTotal) : undefined}
          loading={summary.loading}
          icon="task_alt"
        />
        <KpiCard
          label="Avg Rating"
          value={summary.data ? summary.data.avgRating.toFixed(1) : undefined}
          loading={summary.loading}
          icon="star"
        />
        <KpiCard
          label="Price Discrepancy"
          value={summary.data ? `${summary.data.discrepancyRatePercent}%` : undefined}
          loading={summary.loading}
          icon="warning"
          tone={summary.data && summary.data.discrepancyRatePercent > 3 ? "critical" : undefined}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="font-headline-sm text-headline-sm text-primary">Provider Directory</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                placeholder="Search providers…"
                className="w-56 rounded border border-outline-variant bg-surface py-1.5 pl-9 pr-3 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                className="cursor-pointer appearance-none rounded border border-outline-variant bg-surface py-1.5 pl-3 pr-8 font-label-md text-label-md text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="">All Categories</option>
                {categories.data?.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {list.loading && <LoadingState label="Loading providers…" />}
        {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.refetch} />}
        {!list.loading && !list.error && list.data && list.data.data.length === 0 && (
          <EmptyState icon="storefront" title="No providers match these filters" />
        )}
        {!list.loading && !list.error && list.data && list.data.data.length > 0 && (
          <>
            <ProviderTable rows={list.data.data} onSelect={setSelected} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onPageChange={setPage} />
          </>
        )}
      </div>

      {selected && <ProviderDrawer provider={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function KpiCard({
  label,
  value,
  loading,
  icon,
  sub,
  tone,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
  icon: string;
  sub?: string;
  tone?: "critical";
}) {
  const valueTone = tone === "critical" ? "text-error" : "text-primary";
  return (
    <div className="flex flex-col justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-component-padding-x transition-shadow hover:shadow-lift">
      <div className="mb-4 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[20px] ${tone === "critical" ? "text-error" : "text-outline"}`}>
          {icon}
        </span>
      </div>
      <div>
        <div className={`font-headline-lg text-headline-lg tabular-nums ${valueTone}`}>
          {loading || value === undefined ? "—" : value}
        </div>
        {sub && <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{sub}</div>}
      </div>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
];

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash]!;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function StatusBadge({ status }: { status: ApiProviderPerformance["status"] }) {
  return status === "REVIEW" ? (
    <span className="inline-flex items-center rounded-full bg-error-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-error-container">
      Review
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface">
      Active
    </span>
  );
}

function ProviderTable({
  rows,
  onSelect,
}: {
  rows: ApiProviderPerformance[];
  onSelect: (p: ApiProviderPerformance) => void;
}) {
  return (
    <div className="no-scrollbar relative flex-1 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-container-low">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-label-md text-label-md font-semibold text-on-surface-variant">
              Provider
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-label-md text-label-md font-semibold text-on-surface-variant">
              Category
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-label-md text-label-md font-semibold text-on-surface-variant">
              Requests
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-label-md text-label-md font-semibold text-on-surface-variant">
              Completed
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-label-md text-label-md font-semibold text-on-surface-variant">
              Service Value
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-label-md text-label-md font-semibold text-on-surface-variant">
              Avg Rating
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-label-md text-label-md font-semibold text-on-surface-variant">
              Discrepancy
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-label-md text-label-md font-semibold text-on-surface-variant">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-variant bg-surface-container-lowest">
          {rows.map((p) => (
            <tr
              key={p.companyId}
              onClick={() => onSelect(p)}
              className="group cursor-pointer transition-colors duration-150 hover:bg-surface"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded font-label-md text-label-md ${avatarTone(p.companyName)}`}>
                    {initials(p.companyName)}
                  </div>
                  <div className="font-mono-data text-mono-data text-primary">{p.companyName}</div>
                </div>
              </td>
              <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{p.categoryLabel || "—"}</td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data tabular-nums text-on-surface">
                {formatNumber(p.requestsHandled)}
              </td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data tabular-nums text-on-surface">
                {formatNumber(p.completedServices)}
              </td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data tabular-nums text-primary">
                {formatCurrency(p.serviceValue)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <div className="flex items-center justify-end gap-1">
                  <span className="font-mono-data text-mono-data text-on-surface">{p.avgRating.toFixed(1)}</span>
                  <span className="material-symbols-outlined text-[14px] text-secondary">star</span>
                </div>
              </td>
              <td
                className={`px-4 py-3 text-right font-mono-data text-mono-data tabular-nums ${
                  p.discrepancyRatePercent > 3 ? "text-error" : "text-on-surface"
                }`}
              >
                {p.discrepancyRatePercent}%
              </td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderDrawer({ provider, onClose }: { provider: ApiProviderPerformance; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-background/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-6 shadow-lift">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded font-label-md text-label-md ${avatarTone(provider.companyName)}`}>
              {initials(provider.companyName)}
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-primary">{provider.companyName}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{provider.categoryLabel || "Uncategorized"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-6">
          <StatusBadge status={provider.status} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Stat label="Requests Handled" value={formatNumber(provider.requestsHandled)} />
          <Stat label="Completed" value={formatNumber(provider.completedServices)} />
          <Stat label="Completion Rate" value={`${provider.completionRatePercent}%`} />
          <Stat label="Avg Rating" value={provider.avgRating.toFixed(1)} />
          <Stat label="Service Value" value={formatCurrency(provider.serviceValue)} />
          <Stat
            label="Discrepancy Rate"
            value={`${provider.discrepancyRatePercent}%`}
            warn={provider.discrepancyRatePercent > 3}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`font-mono-data text-mono-data ${warn ? "text-error" : "text-primary"}`}>{value}</p>
    </div>
  );
}
