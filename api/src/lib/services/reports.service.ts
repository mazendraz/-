// Business Control Center — Reports Center. Every report type reshapes the
// output of an EXISTING service function into a flat table; nothing here
// runs a parallel aggregation query. See apiTypes.ts's ApiReport doc comment
// for the "no duplicate systems" reasoning.
import type { ApiReport, ApiReportQuery, ApiReportType } from "@/lib/apiTypes";
import { desktopOverview } from "./desktopOverview.service";
import { financeCashFlow, listTransactions } from "./finance.service";
import { list as listClients } from "./clients.service";
import { providerPerformance } from "./providerPerformance.service";
import { pricingIntelligence } from "./pricingIntelligence.service";

// Every list-shaped report is backed by a service function whose own
// pagination already caps at 100 rows per page (finance.service.ts,
// clients.service.ts, providerPerformance.service.ts, pricingIntelligence.
// service.ts each define their own MAX_PAGE_SIZE = 100). Reports read page 1
// at that same cap rather than opening a second, higher-limit path — an
// internal tool serving a few dozen staff doesn't need a bulk-export
// pipeline, and `truncated`/`totalAvailable` below make it obvious when a
// report isn't the whole data set, rather than silently dropping rows.
const REPORT_ROW_CAP = 100;

const META: Record<ApiReportType, { title: string; description: string }> = {
  "business-overview": {
    title: "Business Overview",
    description: "Platform-wide KPI summary for the selected period.",
  },
  revenue: {
    title: "Revenue",
    description: "Commission income transactions in the selected period.",
  },
  expenses: {
    title: "Expenses",
    description: "Expense transactions in the selected period.",
  },
  clients: {
    title: "Clients",
    description: "Client roster (not date-filtered — Client is an all-time aggregation, see clients.service.ts).",
  },
  providers: {
    title: "Providers",
    description: "Provider performance ranking for the selected period.",
  },
  pricing: {
    title: "Pricing",
    description: "Estimated vs. final price variance for every verified job in the selected period.",
  },
  "price-discrepancies": {
    title: "Price Discrepancies",
    description: "Verified jobs flagged as a price discrepancy in the selected period.",
  },
  "cash-flow": {
    title: "Cash Flow",
    description: "Weekly money in / money out for the selected period.",
  },
};

function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** RFC 4180 minimal escaping — quote a field only when it contains a comma,
 *  quote, or newline, doubling any embedded quotes.
 *
 *  Also guards against CSV/formula injection (CWE-1236): several of these
 *  columns carry free text an admin or a customer typed (Client.name,
 *  Transaction.note, Company.name) — if a cell starts with =, +, -, or @,
 *  Excel/Sheets can interpret it as a formula on open (e.g. a client named
 *  `=HYPERLINK(...)`). Prefixing with a leading apostrophe is the standard
 *  mitigation (OWASP CSV Injection guidance) — it forces the cell to render
 *  as literal text in every spreadsheet app, and is invisible in plain CSV
 *  viewers/parsers since it's just another leading character.
 *
 *  The apostrophe guard only applies to `string` inputs, never `number`: a
 *  genuine JS number (e.g. a negative deltaPercent — a job that came in
 *  under estimate) can never carry attacker-controlled formula text, so
 *  guarding it too would only corrupt legitimate negative figures into text
 *  cells (`'-5.2` instead of the number -5.2) without closing any real
 *  injection vector — the risk is specifically free text that ends up
 *  starting with one of these characters, not numeric values. */
function csvField(value: string | number): string {
  const s = String(value);
  const escaped = typeof value === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

function toCsv(columns: string[], rows: (string | number)[][]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\r\n");
}

// A `from` epoch ms is turned into a day count for the two report types
// (business-overview, cash-flow) whose underlying service takes `days`
// rather than `from`/`to` — same conversion FinanceOverviewPage.tsx and
// friends already do client-side, just server-side here.
function daysFromWindow(from: number | undefined): number {
  if (from == null) return 30;
  return Math.min(365, Math.max(1, Math.round((Date.now() - from) / 86_400_000)));
}

/** Admin: generate a Reports Center table (preview + CSV) for one report
 *  type. Every branch reuses an existing service function — see the file
 *  doc comment. */
export async function generateReport(query: ApiReportQuery): Promise<ApiReport> {
  const { type, from, to } = query;
  const { title, description } = META[type];
  let columns: string[] = [];
  let rows: (string | number)[][] = [];
  let totalAvailable = 0;

  switch (type) {
    case "business-overview": {
      const o = await desktopOverview({ days: daysFromWindow(from) });
      columns = ["Metric", "Value"];
      rows = [
        ["New Clients", o.newClients],
        ["New Requests", o.newRequests],
        ["Completed Services", o.completedServices],
        ["Service Value (EGP)", o.serviceValue],
        ["Al Asima Revenue (EGP)", o.alAsimaRevenue],
        ["Expenses (EGP)", o.expenses],
      ];
      totalAvailable = rows.length;
      break;
    }
    case "revenue": {
      const page = await listTransactions({ type: "COMMISSION_INCOME", from, to, pageSize: REPORT_ROW_CAP });
      columns = ["Date", "Provider", "Request", "Amount (EGP)", "Status"];
      rows = page.data.map((t) => [
        dayString(t.occurredAt),
        t.companyName ?? "—",
        t.leadRefNumber ?? "—",
        t.amount,
        t.status,
      ]);
      totalAvailable = page.meta.total;
      break;
    }
    case "expenses": {
      const page = await listTransactions({ type: "EXPENSE", from, to, pageSize: REPORT_ROW_CAP });
      columns = ["Date", "Category", "Note", "Amount (EGP)", "Status"];
      rows = page.data.map((t) => [dayString(t.occurredAt), t.categoryName ?? "—", t.note ?? "—", t.amount, t.status]);
      totalAvailable = page.meta.total;
      break;
    }
    case "clients": {
      const page = await listClients({ pageSize: REPORT_ROW_CAP });
      columns = ["Name", "Phone", "First Seen", "Total Requests", "Successful Services", "Total Value (EGP)", "Status"];
      rows = page.data.map((c) => [
        c.name,
        c.phone,
        dayString(c.firstSeenAt),
        c.totalRequests,
        c.successfulServices,
        c.totalValue,
        c.status,
      ]);
      totalAvailable = page.meta.total;
      break;
    }
    case "providers": {
      const page = await providerPerformance({ from, to, pageSize: REPORT_ROW_CAP });
      columns = ["Provider", "Category", "Requests", "Completed", "Completion Rate %", "Service Value (EGP)", "Rating", "Discrepancy %"];
      rows = page.data.map((p) => [
        p.companyName,
        p.categoryLabel || "—",
        p.requestsHandled,
        p.completedServices,
        p.completionRatePercent,
        p.serviceValue,
        p.avgRating,
        p.discrepancyRatePercent,
      ]);
      totalAvailable = page.meta.total;
      break;
    }
    case "pricing":
    case "price-discrepancies": {
      const page = await pricingIntelligence({ from, to, pageSize: REPORT_ROW_CAP });
      const variance = type === "price-discrepancies" ? page.variance.filter((v) => v.verificationStatus === "DISCREPANCY") : page.variance;
      columns = ["Request", "Service", "Provider", "Estimated (EGP)", "Final (EGP)", "Difference %", "Status"];
      rows = variance.map((v) => [
        v.refNumber,
        v.service,
        v.companyName,
        v.estimatedPrice ?? "—",
        v.finalPrice,
        v.deltaPercent ?? "—",
        v.verificationStatus,
      ]);
      // price-discrepancies filters client-side (in this function) out of a
      // single page of `pricing`'s underlying rows, so its own totalAvailable
      // is the filtered count on THIS page, not page.varianceTotal (which
      // counts confirmed + discrepancy together) — flagged via `truncated`
      // the same as every other report once a real bulk-export path is
      // needed, this filter belongs in pricingIntelligence.service.ts as a
      // real query param instead.
      totalAvailable = type === "price-discrepancies" ? rows.length : page.varianceTotal;
      break;
    }
    case "cash-flow": {
      const cf = await financeCashFlow({ days: daysFromWindow(from) });
      columns = ["Week Starting", "Money In (EGP)", "Money Out (EGP)"];
      rows = cf.series.map((p) => [p.date, p.moneyIn, p.moneyOut]);
      totalAvailable = rows.length;
      break;
    }
  }

  return {
    type,
    title,
    description,
    generatedAt: Date.now(),
    columns,
    rows,
    rowCount: rows.length,
    totalAvailable,
    truncated: totalAvailable > rows.length,
    csv: toCsv(columns, rows),
  };
}
