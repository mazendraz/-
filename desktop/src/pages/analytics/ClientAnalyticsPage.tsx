// Client Analytics — the Analytics module's read on the same
// /admin/clients/overview endpoint ClientsPage (Business module) already
// uses, wired to the shared period tabs instead of a fixed 30-day window,
// and surfacing the fields ClientsPage's KPI row doesn't have room for
// (Returning Clients, Requests per Client, Completed Services). No new list
// here — the Client Roster table already lives on the Business module's
// Clients page; duplicating it here would be exactly the "duplicate system"
// the brief says not to build. "Client activity" links out to that roster
// instead of re-fetching it.
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState } from "@/components/states/States";
import { Trend } from "@/components/shared/Trend";
import { formatCurrency, formatNumber, percentChange } from "@/lib/format";
import type { ApiClientOverview } from "@/lib/apiTypes";

export function ClientAnalyticsPage() {
  const { days, label } = usePeriod();

  const { data, loading, error, refetch } = useFetch<ApiClientOverview>(
    () => apiGet<ApiClientOverview>(`/admin/clients/overview?deltaDays=${days}`),
    [days],
  );

  return (
    <>
      <PageHeader
        title="Client Analytics"
        description={`Acquisition, retention and lifetime value — ${label.toLowerCase()}.`}
        actions={
          <Link
            to="/business/clients"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary"
          >
            View Client Roster
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        }
      />

      {loading && <LoadingState label="Loading client analytics…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && <Body data={data} />}
    </>
  );
}

function Body({ data }: { data: ApiClientOverview }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Total Clients" value={formatNumber(data.totalClients)} icon="groups" />
      <KpiCard
        label="New Clients"
        value={formatNumber(data.newClients.current)}
        icon="person_add"
        trendPercent={percentChange(data.newClients.current, data.newClients.previous)}
      />
      <KpiCard label="Returning Clients" value={formatNumber(data.returningClients)} icon="repeat" />
      <KpiCard label="Retention Rate" value={`${data.retentionRatePercent}%`} icon="favorite" hint="Active in both this window and the one before it." />
      <KpiCard label="Requests per Client" value={data.avgRequestsPerClient.toFixed(1)} icon="assignment" hint="All-time average, not windowed." />
      <KpiCard label="Completed Services" value={formatNumber(data.completedServicesTotal)} icon="task_alt" hint="All-time, tied to a known client." />
      <KpiCard label="Avg. Lifetime Value" value={formatCurrency(data.avgLifetimeValue)} icon="payments" highlight />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  trendPercent,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  trendPercent?: number | null;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-5 transition-shadow hover:shadow-lift ${
        highlight ? "border-primary/30 bg-primary/5" : "border-outline-variant bg-surface-container-lowest"
      }`}
      title={hint}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${highlight ? "text-primary" : "text-outline"}`}>{icon}</span>
      </div>
      <div className="flex flex-col">
        <span className={`font-headline-sm text-headline-sm tabular-nums ${highlight ? "text-primary" : "text-on-surface"}`}>{value}</span>
        {trendPercent !== undefined && <Trend percent={trendPercent} className="mt-1 w-max" />}
      </div>
    </div>
  );
}
