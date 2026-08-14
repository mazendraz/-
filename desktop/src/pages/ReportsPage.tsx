// Reports Center — Phase 11. The 8 report types the brief specifies, each a
// flat table over an EXISTING service's data (see reports.service.ts's file
// doc comment) — this screen adds zero new aggregation, only presentation:
// pick a type, pick the shared period, Generate, preview, Export CSV.
//
// Export is a real client-side CSV download (Blob + object URL + a
// programmatic `<a download>` click) built from the SAME `csv` field the
// preview table itself was rendered from — never a separate export call, so
// what's on screen is always exactly what downloads. No Excel/PDF export
// yet: this app has no Tauri fs/dialog plugin wired up (only opener + http —
// see src-tauri/Cargo.toml), and a browser-download CSV needs neither; a
// native Save-As flow for Excel/PDF is a real plugin addition, flagged here
// rather than faked with a client-only XLSX/PDF library that can't write to
// disk from within the webview sandbox the same way.
import { useState } from "react";
import { apiGet } from "@/lib/api";
import { usePeriod } from "@/lib/dateRange";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import type { ApiReport, ApiReportType } from "@/lib/apiTypes";

const REPORT_TYPES: { type: ApiReportType; label: string; icon: string; description: string }[] = [
  { type: "business-overview", label: "Business Overview", icon: "monitoring", description: "Platform-wide KPI summary." },
  { type: "revenue", label: "Revenue", icon: "trending_up", description: "Commission income transactions." },
  { type: "expenses", label: "Expenses", icon: "trending_down", description: "Expense transactions." },
  { type: "clients", label: "Clients", icon: "groups", description: "Client roster." },
  { type: "providers", label: "Providers", icon: "workspace_premium", description: "Provider performance ranking." },
  { type: "pricing", label: "Pricing", icon: "price_change", description: "Estimated vs. final price variance." },
  { type: "price-discrepancies", label: "Price Discrepancies", icon: "warning", description: "Verified jobs flagged as a discrepancy." },
  { type: "cash-flow", label: "Cash Flow", icon: "swap_horiz", description: "Weekly money in / money out." },
];

export function ReportsPage() {
  const { days, label: periodLabel } = usePeriod();
  const [selected, setSelected] = useState<ApiReportType>("business-overview");
  const [report, setReport] = useState<ApiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      // Lazy Date.now() here is fine — it runs inside an event handler, not
      // during render, so the react-hooks/purity rule doesn't apply (unlike
      // the useMemo-anchored Date.now() elsewhere in this app).
      const from = Date.now() - days * 86_400_000;
      const data = await apiGet<ApiReport>(`/admin/reports?type=${selected}&from=${from}`);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!report) return;
    const blob = new Blob([report.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    a.href = url;
    a.download = `al-asima-${report.type}-${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Reports" description="Generate, preview and export operational reports." />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {REPORT_TYPES.map((r) => (
          <button
            key={r.type}
            type="button"
            onClick={() => {
              setSelected(r.type);
              setReport(null);
              setError(null);
            }}
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
              selected === r.type
                ? "border-primary bg-primary/5"
                : "border-outline-variant bg-surface-container-lowest hover:border-outline"
            }`}
          >
            <span className={`material-symbols-outlined text-[20px] ${selected === r.type ? "text-primary" : "text-outline"}`}>{r.icon}</span>
            <span className="font-label-lg text-label-lg text-on-surface">{r.label}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">{r.description}</span>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded border border-outline-variant bg-surface-container-lowest px-component-padding-x py-component-padding-y">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          Period: <span className="font-medium text-on-surface">{periodLabel}</span> — use the period tabs above to change it.
        </span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </div>

      {loading && <LoadingState label="Generating report…" />}
      {!loading && error && <ErrorState message={error} onRetry={handleGenerate} />}
      {!loading && !error && !report && (
        <EmptyState icon="description" title="No report generated yet" message="Pick a report type and click Generate Report." />
      )}
      {!loading && !error && report && <ReportPreview report={report} onExport={handleExport} />}
    </>
  );
}

function ReportPreview({ report, onExport }: { report: ApiReport; onExport: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant p-5">
        <div>
          <h3 className="font-headline-sm text-headline-sm font-semibold text-primary">{report.title}</h3>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{report.description}</p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            Generated {new Date(report.generatedAt).toLocaleString()} ·{" "}
            {report.truncated ? (
              <span className="text-secondary">
                Showing {report.rowCount} of {report.totalAvailable} rows — narrow the period for a complete export.
              </span>
            ) : (
              `${report.rowCount} row${report.rowCount === 1 ? "" : "s"}`
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={report.rowCount === 0}
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export CSV
        </button>
      </div>

      {report.rowCount === 0 ? (
        <EmptyState icon="description" title="No data in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container-low">
              <tr>
                {report.columns.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-5 py-3 font-label-md text-label-md font-medium uppercase tracking-wider text-on-surface-variant"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {report.rows.map((row, i) => (
                // Rows are plain string/number tuples with no stable id; the
                // report is read-only and never reorders, so index-as-key is
                // fine here (this project doesn't enable react/no-array-index-key).
                <tr key={i} className="transition-colors hover:bg-surface-container-lowest/50">
                  {row.map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-5 py-3 font-body-sm text-body-sm text-on-surface">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
