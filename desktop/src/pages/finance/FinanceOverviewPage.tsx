// Ported from stitch_al_asima_command_center/financial_command_center*/code.html
// (KPI-card grid + tonal treatment). The one thing every mockup in this set
// gets across mostly through layout — that Service Value and Al Asima
// Revenue are NOT the same number — is made explicit here with a small
// worked-example callout, per the product requirement that this distinction
// be "extremely clear," not just implied by two adjacent cards.
import { useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState } from "@/components/states/States";
import { formatCurrency } from "@/lib/format";
import { Trend } from "@/components/shared/Trend";
import type { ApiFinanceOverview } from "@/lib/apiTypes";

export function FinanceOverviewPage() {
  const { days, label } = usePeriod();
  // Date.now() only ever runs inside this lazy useState initializer (once,
  // on mount) — the react-hooks/purity rule flags a direct Date.now() call
  // in the render body (even inside useMemo), so "now" is captured once as
  // an anchor and `from` derives from it + `days` (ApiFinanceQuery takes
  // from/to, not days). The small drift between mount and a later tab click
  // is immaterial for a trailing-N-days window.
  const [anchor] = useState(() => Date.now());
  const from = useMemo(() => anchor - days * 86_400_000, [anchor, days]);

  const { data, loading, error, refetch } = useFetch<ApiFinanceOverview>(
    () => apiGet<ApiFinanceOverview>(`/admin/finance/overview?from=${from}`),
    [from],
  );

  return (
    <>
      <PageHeader title="Financial Overview" description={`Revenue, expenses and cash position — ${label.toLowerCase()}.`} />

      {loading && <LoadingState label="Loading financial overview…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && <OverviewBody data={data} />}
    </>
  );
}

function OverviewBody({ data }: { data: ApiFinanceOverview }) {
  return (
    <>
      <ServiceValueExplainer />

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Service Value"
          value={formatCurrency(data.serviceValueProcessed)}
          icon="payments"
          hint="Gross — the full job amount clients paid providers."
          trendPercent={data.trend?.serviceValueProcessedPercent}
        />
        <KpiCard
          label="Expected Al Asima Revenue"
          value={formatCurrency(data.recognizedRevenue)}
          icon="diamond"
          highlight
          hint="Al Asima's commission — recognized, whether collected yet or not."
          trendPercent={data.trend?.recognizedRevenuePercent}
        />
        <KpiCard
          label="Collected Revenue"
          value={formatCurrency(data.collectedRevenue)}
          icon="task_alt"
          hint="Commission that has actually been received."
          trendPercent={data.trend?.collectedRevenuePercent}
        />
        <KpiCard
          label="Outstanding Revenue"
          value={formatCurrency(data.outstandingRevenue)}
          icon="hourglass_top"
          tone={data.outstandingRevenue > 0 ? "warning" : undefined}
          hint="Commission recognized but not yet collected."
          trendPercent={data.trend?.outstandingRevenuePercent}
          inverse
        />
        <KpiCard
          label="Total Expenses"
          value={formatCurrency(data.totalExpenses)}
          icon="trending_down"
          tone="expense"
          hint="Operating costs recorded this period."
          trendPercent={data.trend?.totalExpensesPercent}
          inverse
        />
        <KpiCard
          label="Net Income"
          value={formatCurrency(data.netIncome)}
          icon="account_balance"
          tone={data.netIncome < 0 ? "critical" : undefined}
          hint="Recognized revenue minus expenses (accrual-basis)."
          trendPercent={data.trend?.netIncomePercent}
        />
        <KpiCard
          label="Cash Position"
          value={formatCurrency(data.cashPosition)}
          icon="account_balance_wallet"
          hint="Collected revenue minus collected expenses (cash-basis)."
          trendPercent={data.trend?.cashPositionPercent}
        />
        <KpiCard
          label="Disputed Revenue"
          value={formatCurrency(data.disputedRevenue)}
          icon="report"
          tone={data.disputedRevenue > 0 ? "critical" : undefined}
          hint="Commission on jobs with an unresolved price discrepancy."
          trendPercent={data.trend?.disputedRevenuePercent}
          inverse
        />
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h3 className="mb-4 font-headline-sm text-headline-sm text-primary">Commission Pipeline</h3>
        <div className="flex items-center gap-8">
          <PipelineStat label="Expected" value={data.commissionPipeline.expected} />
          <span className="material-symbols-outlined text-outline">arrow_forward</span>
          <PipelineStat label="Collected" value={data.commissionPipeline.collected} highlight />
        </div>
      </div>
    </>
  );
}

/** Static, clearly-labeled illustrative example — NOT live data. Exists
 *  because the product requirement is explicit that "Service Value ≠ Al
 *  Asima Revenue" must be extremely clear in the UI, not just implied by two
 *  adjacent KPI cards with different numbers. */
function ServiceValueExplainer() {
  return (
    <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary">info</span>
        <h3 className="font-label-md text-label-md font-bold uppercase tracking-wider text-primary">
          Service Value is not Al Asima Revenue
        </h3>
      </div>
      <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
        Al Asima only earns a commission on each job — never the full amount the client pays the provider. The two
        numbers below are always different, by design.
      </p>
      <div className="flex flex-wrap items-center gap-2 font-mono-data text-mono-data text-on-surface">
        <ExampleChip label="Service Value" value="EGP 1,000,000" />
        <span className="text-on-surface-variant">×</span>
        <ExampleChip label="Commission" value="10%" />
        <span className="text-on-surface-variant">=</span>
        <ExampleChip label="Al Asima Revenue" value="EGP 100,000" highlight />
        <span className="text-on-surface-variant">−</span>
        <ExampleChip label="Expenses" value="EGP 40,000" />
        <span className="text-on-surface-variant">=</span>
        <ExampleChip label="Net Income" value="EGP 60,000" highlight />
      </div>
      <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant/80">Example for illustration — not this period&apos;s actual figures.</p>
    </div>
  );
}

function ExampleChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex flex-col rounded border px-3 py-1.5 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-outline-variant bg-surface"
      }`}
    >
      <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className={highlight ? "text-primary" : ""}>{value}</span>
    </span>
  );
}

function PipelineStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`font-headline-lg text-headline-lg ${highlight ? "text-primary" : "text-on-surface"}`}>{formatCurrency(value)}</p>
    </div>
  );
}

type Tone = "warning" | "critical" | "expense";

function KpiCard({
  label,
  value,
  icon,
  tone,
  highlight,
  hint,
  trendPercent,
  inverse,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: Tone;
  highlight?: boolean;
  hint: string;
  /** undefined = no trend window requested (omit badge); null = new metric, no prior period. */
  trendPercent?: number | null;
  /** True when "up" is unfavorable (e.g. expenses, outstanding, disputed) — flips which color reads as good. */
  inverse?: boolean;
}) {
  const valueTone = tone === "critical" ? "text-error" : tone === "expense" ? "text-on-surface" : highlight ? "text-primary" : "text-on-surface";
  const iconTone = tone === "critical" || tone === "warning" ? "text-error" : highlight ? "text-primary" : "text-outline";
  return (
    <div
      className={`rounded-lg border p-5 transition-shadow hover:shadow-lift ${
        highlight ? "border-primary/30 bg-primary/5" : "border-outline-variant bg-surface-container-lowest"
      }`}
      title={hint}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${iconTone}`}>{icon}</span>
      </div>
      <div className={`font-headline-lg text-headline-lg tabular-nums ${valueTone}`}>{value}</div>
      {trendPercent !== undefined && <Trend percent={trendPercent} inverse={inverse} className="mt-2 w-max" />}
    </div>
  );
}
