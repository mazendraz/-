import type { ApiReport, ApiReportType } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export const REPORT_TYPES: { value: ApiReportType; label: string }[] = [
  { value: "business-overview", label: "نظرة عامة على الأعمال" },
  { value: "revenue", label: "الإيرادات" },
  { value: "expenses", label: "المصروفات" },
  { value: "clients", label: "العملاء" },
  { value: "providers", label: "مقدّمو الخدمة" },
  { value: "pricing", label: "الأسعار" },
  { value: "price-discrepancies", label: "فروق الأسعار" },
  { value: "cash-flow", label: "التدفق النقدي" },
];

/** GET /admin/reports?type=&from=&to= — one fetch backs preview AND export
 *  (report.csv), so a preview can never show something different from
 *  what would be exported. This app is view-only here (no export/share
 *  action) per phase-12's own read-mostly boundary. */
export function fetchReport(query: { type: ApiReportType; from?: number; to?: number }): Promise<ApiReport> {
  const params = new URLSearchParams({ type: query.type });
  if (query.from) params.set("from", String(query.from));
  if (query.to) params.set("to", String(query.to));
  return apiGet<ApiReport>(`/admin/reports?${params.toString()}`);
}
