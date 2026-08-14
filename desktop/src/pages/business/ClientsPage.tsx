// Ported from stitch_al_asima_command_center/client_management/code.html —
// KPI row, filter panel and Client Roster table follow that mockup. The
// "Client Acquisition Funnel" (Website Visitor → Qualified Lead →
// Consultation → Completed Service) is deliberately NOT reproduced: this
// platform has no visitor/session tracking or lead-source attribution, so
// every number in that funnel would be invented. Same reasoning as
// OverviewPage's requestFunnel — flagged, not faked. The "Value Tier" /
// "Acquisition Source" filters are omitted for the same reason (no backing
// field on Client); "Account Status" only shows the two real states
// (ACTIVE/DORMANT) — see ApiClient.status's comment on why there's no
// third "Review" state yet.
import { useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { Trend } from "@/components/shared/Trend";
import { formatCurrency, formatDateTime, percentChange } from "@/lib/format";
import type { ApiClient, ApiClientOverview, ApiPage } from "@/lib/apiTypes";

const PAGE_SIZE = 25;

export function ClientsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiClient | null>(null);
  const search = useDebouncedValue(searchInput, 350);

  const overview = useFetch<ApiClientOverview>(() => apiGet<ApiClientOverview>("/admin/clients/overview"), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [search, page]);

  const list = useFetch<ApiPage<ApiClient>>(() => apiGet<ApiPage<ApiClient>>(`/admin/clients?${query}`), [query]);

  return (
    <>
      <PageHeader
        title="Clients & CRM"
        description="Client acquisition, retention, and lifetime value across every provider."
      />

      <div className="mb-section-gap grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Clients"
          value={overview.data?.totalClients}
          loading={overview.loading}
          sub={overview.data ? `+${overview.data.newClients.current} new (last 30 days)` : undefined}
        />
        <KpiCard
          label="New Clients"
          value={overview.data?.newClients.current}
          loading={overview.loading}
          trendPercent={overview.data ? percentChange(overview.data.newClients.current, overview.data.newClients.previous) : null}
        />
        <KpiCard
          label="Retention Rate"
          value={overview.data ? `${overview.data.retentionRatePercent}%` : undefined}
          loading={overview.loading}
          sub="Active in both the last 30 days and the 30 before"
        />
        <KpiCard
          label="Avg. Lifetime Value"
          value={overview.data ? formatCurrency(overview.data.avgLifetimeValue) : undefined}
          loading={overview.loading}
          highlight
        />
      </div>

      <div className="flex flex-col rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-component-padding-x py-4">
          <h3 className="font-headline-sm text-headline-sm text-primary">Client Roster</h3>
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
              placeholder="Search name or phone…"
              className="w-64 rounded border border-outline-variant bg-surface-container-low py-1.5 pl-9 pr-3 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {list.loading && <LoadingState label="Loading clients…" />}
        {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.refetch} />}
        {!list.loading && !list.error && list.data && list.data.data.length === 0 && (
          <EmptyState icon="groups" title="No clients match this search" />
        )}
        {!list.loading && !list.error && list.data && list.data.data.length > 0 && (
          <>
            <ClientTable rows={list.data.data} onSelect={setSelected} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onPageChange={setPage} />
          </>
        )}
      </div>

      {selected && <ClientDrawer client={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function KpiCard({
  label,
  value,
  loading,
  trendPercent,
  sub,
  highlight,
}: {
  label: string;
  value: number | string | undefined;
  loading: boolean;
  trendPercent?: number | null;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="group flex flex-col justify-between rounded-xl border border-outline-variant bg-surface p-component-padding-x transition-transform duration-300 hover:-translate-y-0.5">
      <div className="mb-4 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <div className={`rounded p-1.5 ${highlight ? "bg-secondary-container/50" : "bg-surface-container-low"}`}>
          <span className={`material-symbols-outlined text-[20px] ${highlight ? "text-secondary" : "text-on-surface-variant"}`}>
            {highlight ? "workspace_premium" : "groups"}
          </span>
        </div>
      </div>
      <div>
        <div className="mb-1 font-display-lg text-display-lg text-primary">
          {loading || value === undefined ? "—" : value}
        </div>
        <div className="flex items-center gap-2">
          {trendPercent !== undefined && <Trend percent={trendPercent} className="w-max" />}
          {sub && <span className="font-body-sm text-body-sm text-on-surface-variant">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

const STATUS_META: Record<ApiClient["status"], string> = {
  ACTIVE: "bg-secondary/10 text-secondary border-secondary/20",
  DORMANT: "bg-surface-container text-on-surface-variant border-outline-variant",
};

function ClientTable({ rows, onSelect }: { rows: ApiClient[]; onSelect: (client: ApiClient) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            <th className="px-4 py-3 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Client</th>
            <th className="px-4 py-3 text-right font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Total Requests
            </th>
            <th className="px-4 py-3 text-right font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Successful Services
            </th>
            <th className="px-4 py-3 text-right font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
              Total Value
            </th>
            <th className="px-4 py-3 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Last Active</th>
            <th className="px-4 py-3 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50 font-body-sm text-body-sm text-on-surface">
          {rows.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c)}
              className="group cursor-pointer transition-colors hover:bg-surface-container-lowest/80"
            >
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data text-on-surface-variant">{c.totalRequests}</td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data text-on-surface-variant">
                {c.successfulServices}
              </td>
              <td className="px-4 py-3 text-right font-mono-data text-mono-data font-medium text-primary">
                {formatCurrency(c.totalValue)}
              </td>
              <td className="px-4 py-3 font-mono-data text-mono-data text-on-surface-variant">{formatDateTime(c.lastSeenAt)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_META[c.status]}`}
                >
                  {c.status === "ACTIVE" ? "Active" : "Dormant"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientDrawer({ client, onClose }: { client: ApiClient; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-background/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-6 shadow-lift">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary">{client.name}</h2>
            <p className="font-mono-data text-mono-data text-on-surface-variant">{client.phone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <span
          className={`mb-6 inline-flex w-max items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_META[client.status]}`}
        >
          {client.status === "ACTIVE" ? "Active" : "Dormant"}
        </span>

        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total Requests" value={String(client.totalRequests)} />
          <Stat label="Successful Services" value={String(client.successfulServices)} />
          <Stat label="Total Value" value={formatCurrency(client.totalValue)} />
          <Stat label="First Seen" value={formatDateTime(client.firstSeenAt)} />
        </div>

        <div className="mt-6 border-t border-surface-container-high pt-4">
          <Stat label="Last Active" value={formatDateTime(client.lastSeenAt)} />
        </div>

        <p className="mt-6 font-body-sm text-body-sm text-on-surface-variant">
          Look up this phone number under Operations → Requests for the client&apos;s full request history.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-mono-data text-mono-data text-primary">{value}</p>
    </div>
  );
}
