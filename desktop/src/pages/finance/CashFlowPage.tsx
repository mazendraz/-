// Money In / Money Out / Net Cash Flow / running Cash Balance + trend chart.
// Chart plumbing (SVG line/area builder) is a local copy of OverviewPage's
// buildChartPaths, adapted to this screen's two series (moneyIn/moneyOut) —
// duplicated rather than imported, same reasoning as components/shared/Trend.tsx:
// OverviewPage is validated Stage 1-3 code this project doesn't touch.
import { useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState } from "@/components/states/States";
import { NoDataForPeriod } from "@/components/states/States";
import { formatCurrency } from "@/lib/format";
import type { ApiCashFlow } from "@/lib/apiTypes";

export function CashFlowPage() {
  const { days, label } = usePeriod();

  const { data, loading, error, refetch } = useFetch<ApiCashFlow>(
    () => apiGet<ApiCashFlow>(`/admin/finance/cash-flow?days=${days}`),
    [days],
  );

  return (
    <>
      <PageHeader title="Cash Flow" description={`Money in, money out, and the running cash balance — ${label.toLowerCase()}.`} />

      {loading && <LoadingState label="Loading cash flow…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && <CashFlowBody data={data} />}
    </>
  );
}

function CashFlowBody({ data }: { data: ApiCashFlow }) {
  const isQuiet = data.moneyIn === 0 && data.moneyOut === 0;

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Money In" value={formatCurrency(data.moneyIn)} icon="arrow_downward" tone="positive" />
        <KpiCard label="Money Out" value={formatCurrency(data.moneyOut)} icon="arrow_upward" tone="negative" />
        <KpiCard
          label="Net Cash Flow"
          value={formatCurrency(data.netCashFlow)}
          icon="swap_horiz"
          tone={data.netCashFlow < 0 ? "negative" : "positive"}
        />
        <KpiCard label="Cash Balance" value={formatCurrency(data.cashBalance)} icon="account_balance_wallet" hint="All-time — not reset by the selected period." />
      </div>

      {isQuiet ? (
        <NoDataForPeriod />
      ) : (
        <CashFlowChart series={data.series} />
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "positive" | "negative";
  hint?: string;
}) {
  const valueTone = tone === "negative" ? "text-error" : tone === "positive" ? "text-primary" : "text-on-surface";
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-lift" title={hint}>
      <div className="mb-3 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-[18px] ${tone === "negative" ? "text-error" : "text-outline"}`}>{icon}</span>
      </div>
      <div className={`font-headline-lg text-headline-lg tabular-nums ${valueTone}`}>{value}</div>
    </div>
  );
}

function CashFlowChart({ series }: { series: ApiCashFlow["series"] }) {
  const { path, area, maxValue } = useMemo(() => buildChartPaths(series), [series]);

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-headline-sm text-headline-sm text-primary">Money In vs Money Out</h3>
        <div className="flex space-x-4">
          <Legend swatch="bg-primary" label="Money In" />
          <Legend swatch="bg-secondary" label="Money Out" />
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
            <path className="chart-area-primary" d={area.moneyIn} />
            <path className="chart-line-primary" d={path.moneyIn} />
            <path className="chart-area-secondary" d={area.moneyOut} />
            <path className="chart-line-secondary" d={path.moneyOut} />
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

function buildChartPaths(series: ApiCashFlow["series"]) {
  const w = 800;
  const h = 240;
  const values = series.flatMap((p) => [p.moneyIn, p.moneyOut]);
  const maxValue = Math.max(1, ...values);
  const n = Math.max(1, series.length - 1);

  function toPoints(key: "moneyIn" | "moneyOut") {
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

  const inPoints = toPoints("moneyIn");
  const outPoints = toPoints("moneyOut");

  return {
    maxValue: Math.max(0, ...values),
    path: { moneyIn: lineD(inPoints), moneyOut: lineD(outPoints) },
    area: { moneyIn: areaD(inPoints), moneyOut: areaD(outPoints) },
  };
}
