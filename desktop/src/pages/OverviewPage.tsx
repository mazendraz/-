// Ported from stitch_al_asima_command_center/executive_overview/code.html.
// Layout, spacing, and card treatment follow the mockup closely; the two
// pieces the mockup shows that the backend has no real signal for
// (pre-submission "Website Visitors"/"Requests Started" in the funnel) are
// adapted to what IS real — see desktopOverview.service.ts's requestFunnel().
import { useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, NoDataForPeriod } from "@/components/states/States";
import type { ApiDesktopOverview } from "@/lib/apiTypes";
import { formatCurrency, formatCompactNumber, timeOfDay } from "@/lib/format";

export function OverviewPage() {
  const { user } = useAuth();
  const { days, label } = usePeriod();

  const { data, loading, error, refetch } = useFetch<ApiDesktopOverview>(
    () => apiGet<ApiDesktopOverview>(`/admin/desktop/overview?days=${days}`),
    [days],
  );

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";

  return (
    <>
      <PageHeader
        title={`Good ${timeOfDay()}, ${firstName}`}
        description={`Here's what's happening across Al Asima — ${label.toLowerCase()}.`}
      />

      {loading && <LoadingState label="Loading overview…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && <OverviewBody data={data} />}
    </>
  );
}

function OverviewBody({ data }: { data: ApiDesktopOverview }) {
  const isQuiet =
    data.newClients === 0 &&
    data.newRequests === 0 &&
    data.completedServices === 0 &&
    data.serviceValue === 0 &&
    data.alAsimaRevenue === 0 &&
    data.expenses === 0;

  return (
    <>
      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="New Clients" value={formatCompactNumber(data.newClients)} trendPercent={data.trend.newClientsPercent} />
        <KpiCard label="New Requests" value={formatCompactNumber(data.newRequests)} trendPercent={data.trend.newRequestsPercent} />
        <KpiCard
          label="Completed Services"
          value={formatCompactNumber(data.completedServices)}
          trendPercent={data.trend.completedServicesPercent}
        />
        <KpiCard label="Service Value" value={formatCurrency(data.serviceValue)} trendPercent={data.trend.serviceValuePercent} stacked />
        <KpiCard
          label="Al Asima Revenue"
          value={formatCurrency(data.alAsimaRevenue)}
          trendPercent={data.trend.alAsimaRevenuePercent}
          stacked
          highlight
        />
        <KpiCard
          label="Expenses"
          value={formatCurrency(data.expenses)}
          trendPercent={data.trend.expensesPercent}
          stacked
          inverse
        />
      </div>

      {isQuiet ? (
        <NoDataForPeriod />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <ServiceValueChart series={data.series} />
          <NeedsAttention needsAttention={data.needsAttention} />
          <RequestFunnel funnel={data.funnel} />
          <RecentActivity events={data.recentActivity} />
        </div>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  trendPercent,
  stacked,
  highlight,
  inverse,
}: {
  label: string;
  value: string;
  trendPercent: number | null;
  stacked?: boolean;
  highlight?: boolean;
  inverse?: boolean;
}) {
  return (
    <div
      className={`relative flex h-32 flex-col justify-between overflow-hidden rounded-lg border p-4 transition-shadow hover:shadow-lift ${
        highlight ? "border-surface-variant" : "border-surface-variant"
      } bg-surface-container-lowest`}
    >
      {highlight && <div className="absolute inset-0 bg-primary/5" />}
      <div className="relative z-10 flex h-full flex-col justify-between">
        <p
          className={`font-label-md text-label-md uppercase tracking-wider ${
            highlight ? "flex items-center font-bold text-primary" : "text-on-surface-variant"
          }`}
        >
          {highlight && <span className="material-symbols-outlined mr-1 text-[16px]">diamond</span>}
          {label}
        </p>
        {stacked ? (
          <div className="mt-auto flex flex-col">
            <span className="font-headline-sm text-headline-sm text-primary">{value}</span>
            <Trend percent={trendPercent} inverse={inverse} className="mt-1 w-max" />
          </div>
        ) : (
          <div className="mt-auto flex items-baseline justify-between">
            <span className="font-headline-lg text-headline-lg text-primary">{value}</span>
            <Trend percent={trendPercent} inverse={inverse} />
          </div>
        )}
      </div>
    </div>
  );
}

function Trend({ percent, inverse, className = "" }: { percent: number | null; inverse?: boolean; className?: string }) {
  if (percent === null) {
    return (
      <span className={`flex items-center rounded bg-surface-container px-2 py-1 font-body-sm text-body-sm text-on-surface-variant ${className}`}>
        New
      </span>
    );
  }
  const isUp = percent >= 0;
  // For Expenses, "up" is bad — flip which color reads as favorable.
  const favorable = inverse ? !isUp : isUp;
  return (
    <span
      className={`flex items-center rounded px-2 py-1 font-body-sm text-body-sm font-medium ${
        favorable ? "bg-secondary/10 text-secondary" : "bg-error-container/30 text-on-error-container"
      } ${className}`}
    >
      <span className="material-symbols-outlined mr-1 text-[16px]">{isUp ? "trending_up" : "trending_down"}</span>
      {isUp ? "+" : ""}
      {percent}%
    </span>
  );
}

function ServiceValueChart({ series }: { series: ApiDesktopOverview["series"] }) {
  const { path, area, maxValue } = useMemo(() => buildChartPaths(series), [series]);

  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-6 lg:col-span-8">
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

function NeedsAttention({ needsAttention }: { needsAttention: ApiDesktopOverview["needsAttention"] }) {
  const items = [
    {
      count: needsAttention.discrepanciesRequiringReview,
      label: "price discrepancies require review",
      severity: "Critical" as const,
    },
    {
      count: needsAttention.requestsAwaitingProviderResponse,
      label: "requests waiting for provider response",
      severity: "High" as const,
    },
    {
      count: needsAttention.outstandingCommissionCount,
      label: "outstanding commission amounts",
      severity: "Medium" as const,
    },
  ].filter((i) => i.count > 0);

  return (
    <div className="flex flex-col rounded-lg border border-surface-variant bg-surface-container-lowest p-6 lg:col-span-4">
      <h3 className="mb-6 flex items-center font-headline-sm text-headline-sm text-primary">
        <span className="material-symbols-outlined mr-2 text-error">error</span>
        Needs Your Attention
      </h3>
      {items.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing needs attention right now.</p>
      ) : (
        <div className="flex-1 space-y-4">
          {items.map((item) => (
            <div
              key={item.label}
              className={`flex items-start rounded-lg border p-4 ${severityStyle(item.severity)}`}
            >
              <div className={`mr-3 mt-2 h-2 w-2 flex-shrink-0 rounded-full ${severityDot(item.severity)}`} />
              <div>
                <p className="font-body-sm text-body-sm font-medium text-on-surface">
                  {item.count} {item.label}
                </p>
                <p className={`mt-1 font-label-md text-label-md uppercase tracking-wider ${severityText(item.severity)}`}>
                  {item.severity}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function severityStyle(s: "Critical" | "High" | "Medium"): string {
  if (s === "Critical") return "border-error-container bg-error-container/10";
  if (s === "High") return "border-secondary-container bg-secondary-container/10";
  return "border-outline-variant";
}
function severityDot(s: "Critical" | "High" | "Medium"): string {
  if (s === "Critical") return "bg-error";
  if (s === "High") return "bg-secondary";
  return "bg-outline";
}
function severityText(s: "Critical" | "High" | "Medium"): string {
  if (s === "Critical") return "text-error";
  if (s === "High") return "text-secondary";
  return "text-on-surface-variant";
}

function RequestFunnel({ funnel }: { funnel: ApiDesktopOverview["funnel"] }) {
  const steps = [
    { label: "Submitted", value: funnel.submitted },
    { label: "Contacted", value: funnel.contacted },
    { label: "In Progress", value: funnel.inProgress },
    { label: "Completed", value: funnel.completed },
  ];
  const base = steps[0]?.value || 0;

  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-6 lg:col-span-6">
      <h3 className="mb-2 font-headline-sm text-headline-sm text-primary">Client / Request Funnel</h3>
      <p className="mb-6 font-body-sm text-body-sm text-on-surface-variant">
        Lead status for requests submitted in this period.
      </p>
      {base === 0 ? (
        <NoDataForPeriod />
      ) : (
        <div className="relative space-y-3">
          <div className="absolute bottom-4 left-[15px] top-4 z-0 w-px bg-outline-variant" />
          {steps.map((step, i) => {
            const pct = base > 0 ? Math.round((step.value / base) * 100) : 0;
            const isLast = i === steps.length - 1;
            return (
              <div key={step.label} className="relative z-10 flex items-center" style={{ paddingLeft: i * 16 }}>
                <div
                  className={`mr-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${
                    isLast ? "border-primary/20 bg-primary/10" : "border-outline-variant bg-surface-container"
                  }`}
                >
                  <span className={`font-mono-data text-mono-data ${isLast ? "text-primary" : "text-on-surface-variant"}`}>
                    {i + 1}
                  </span>
                </div>
                <div
                  className={`flex flex-1 items-center justify-between rounded border p-3 ${
                    isLast ? "border-primary/20 bg-primary/5" : "border-surface-variant bg-surface"
                  }`}
                >
                  <span className={`font-body-sm text-body-sm ${isLast ? "font-medium text-primary" : "text-on-surface"}`}>
                    {step.label}
                  </span>
                  <span className={`font-mono-data text-mono-data ${isLast ? "font-bold text-primary" : "text-primary"}`}>
                    {step.value}
                  </span>
                </div>
                {i > 0 && <div className="ml-2 w-12 text-right font-label-md text-label-md text-on-surface-variant">{pct}%</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ACTIVITY_BADGE: Record<
  ApiDesktopOverview["recentActivity"][number]["type"],
  { label: string; className: string }
> = {
  new_request: { label: "New Request", className: "bg-primary/10 text-primary" },
  service_completed: { label: "Service Completed", className: "bg-secondary/10 text-secondary" },
  dispute_raised: { label: "Dispute Raised", className: "bg-error-container/50 text-on-error-container" },
  commission_collected: { label: "Payment Clear", className: "bg-secondary/10 text-secondary" },
  new_client: { label: "New Client", className: "bg-primary/10 text-primary" },
};

function RecentActivity({ events }: { events: ApiDesktopOverview["recentActivity"] }) {
  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-6 lg:col-span-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-headline-sm text-headline-sm text-primary">Recent Activity</h3>
      </div>
      {events.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="px-2 py-3 font-label-md text-label-md font-medium text-on-surface-variant">TIME</th>
                <th className="px-2 py-3 font-label-md text-label-md font-medium text-on-surface-variant">TYPE</th>
                <th className="px-2 py-3 font-label-md text-label-md font-medium text-on-surface-variant">ENTITY</th>
                <th className="px-2 py-3 text-right font-label-md text-label-md font-medium text-on-surface-variant">
                  AMOUNT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant">
              {events.map((e) => {
                const badge = ACTIVITY_BADGE[e.type];
                return (
                  <tr key={e.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="px-2 py-3 font-mono-data text-mono-data text-on-surface-variant">
                      {new Date(e.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-1 font-label-md text-[10px] uppercase ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 font-body-sm text-body-sm text-on-surface">{e.label}</td>
                    <td className="px-2 py-3 text-right font-mono-data text-mono-data text-primary">
                      {e.amount != null ? formatCurrency(e.amount) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
