// Parse URL query params into a typed CompanyListQuery. Routes stay thin: parse →
// call service → respond. Invalid values fall back to safe defaults.
import type {
  CompanyListQuery,
  CompanySort,
} from "@/lib/services/companies.service";
import type {
  AdminLeadListQuery,
  LeadListQuery,
} from "@/lib/services/leads.service";
import type { AdminUserListQuery } from "@/lib/services/users.service";
import type { StatsQuery } from "@/lib/services/stats.service";
import type { WaitlistListQuery } from "@/lib/services/waitlist.service";
import type {
  ApiCashFlowQuery,
  ApiClientListQuery,
  ApiFinanceQuery,
  ApiLeadStatus,
  ApiPricingAnalyticsQuery,
  ApiPricingIntelligenceQuery,
  ApiProviderPerformanceQuery,
  ApiReportQuery,
  ApiReportType,
  ApiTransactionListQuery,
  ApiTransactionStatus,
  ApiTransactionType,
  ApiUserRole,
  ApiVerificationStatus,
  ApiWaitlistStatus,
} from "@/lib/apiTypes";
// Every free-text param goes through cleanParam, not a bare `.trim()`. A NUL
// byte survives the URL, JSON and Zod untouched and is only rejected by Postgres
// at the driver — i.e. as a 500. See sanitize.ts for the measured blast radius.
import { cleanParam } from "@/lib/utils/sanitize";

const SORTS: readonly CompanySort[] = [
  "recommended",
  "rating",
  "projects",
  "reviews",
  "name",
];

function toInt(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toFloat(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCompanyListQuery(
  searchParams: URLSearchParams,
): CompanyListQuery {
  const sortParam = searchParams.get("sort");
  const sort = SORTS.includes(sortParam as CompanySort)
    ? (sortParam as CompanySort)
    : undefined;

  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    category: cleanParam(searchParams.get("category")),
    search: cleanParam(searchParams.get("search")),
    minRating: toFloat(searchParams.get("minRating")),
    sort,
  };
}

const LEAD_STATUSES: readonly ApiLeadStatus[] = [
  "New",
  "Contacted",
  "In Progress",
  "Completed",
  "Cancelled",
];

function parseLeadStatus(value: string | null): ApiLeadStatus | undefined {
  return LEAD_STATUSES.includes(value as ApiLeadStatus)
    ? (value as ApiLeadStatus)
    : undefined;
}

// Accepts ISO date strings or epoch-ms numbers.
function toDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const ms = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

export function parseLeadListQuery(
  searchParams: URLSearchParams,
): LeadListQuery {
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    status: parseLeadStatus(searchParams.get("status")),
    search: cleanParam(searchParams.get("search")),
  };
}

const VERIFICATION_STATUSES: readonly ApiVerificationStatus[] = ["PENDING", "CONFIRMED", "DISCREPANCY"];

function parseVerificationStatus(value: string | null): ApiVerificationStatus | undefined {
  return VERIFICATION_STATUSES.includes(value as ApiVerificationStatus) ? (value as ApiVerificationStatus) : undefined;
}

export function parseAdminLeadListQuery(
  searchParams: URLSearchParams,
): AdminLeadListQuery {
  return {
    ...parseLeadListQuery(searchParams),
    companyId: cleanParam(searchParams.get("companyId")),
    from: toDate(searchParams.get("from")),
    to: toDate(searchParams.get("to")),
    verificationStatus: parseVerificationStatus(searchParams.get("verificationStatus")),
  };
}

/** Chart window sizes for the dashboard stats endpoints. Clamped in the service. */
export function parseStatsQuery(
  searchParams: URLSearchParams,
): StatsQuery {
  return {
    days: toInt(searchParams.get("days")),
    months: toInt(searchParams.get("months")),
    deltaDays: toInt(searchParams.get("deltaDays")),
  };
}

const WAITLIST_STATUSES: readonly ApiWaitlistStatus[] = [
  "WAITING",
  "NOTIFIED",
  "CONVERTED",
  "CANCELLED",
];

export function parseWaitlistListQuery(
  searchParams: URLSearchParams,
): WaitlistListQuery {
  const statusParam = searchParams.get("status");
  const status = WAITLIST_STATUSES.includes(statusParam as ApiWaitlistStatus)
    ? (statusParam as ApiWaitlistStatus)
    : undefined;
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    status,
    search: cleanParam(searchParams.get("search")),
  };
}

/** Same as parseWaitlistListQuery, plus the companyId filter — for the admin
 *  global waiting-list endpoint (mirrors parseAdminLeadListQuery). */
export function parseAdminWaitlistListQuery(
  searchParams: URLSearchParams,
): WaitlistListQuery {
  return {
    ...parseWaitlistListQuery(searchParams),
    companyId: cleanParam(searchParams.get("companyId")),
  };
}

const USER_ROLES: readonly ApiUserRole[] = ["ADMIN", "PROVIDER"];

export function parseAdminUserListQuery(
  searchParams: URLSearchParams,
): AdminUserListQuery {
  const roleParam = searchParams.get("role");
  const role = USER_ROLES.includes(roleParam as ApiUserRole)
    ? (roleParam as ApiUserRole)
    : undefined;
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    role,
    search: cleanParam(searchParams.get("search")),
  };
}

// ── Business Control Center (desktop app) ────────────────────────────────────
// All date-range params here are epoch ms (matching ApiFinanceQuery.from/to
// etc.), unlike parseAdminLeadListQuery's `from`/`to` above which also accepts
// ISO strings — kept consistent with how these new endpoints are documented
// in apiTypes.ts.

export function parseFinanceQuery(searchParams: URLSearchParams): ApiFinanceQuery {
  return {
    from: toInt(searchParams.get("from")),
    to: toInt(searchParams.get("to")),
  };
}

export function parseCashFlowQuery(searchParams: URLSearchParams): ApiCashFlowQuery {
  return { days: toInt(searchParams.get("days")) };
}

const TRANSACTION_TYPES: readonly ApiTransactionType[] = ["COMMISSION_INCOME", "EXPENSE", "ADJUSTMENT"];
const TRANSACTION_STATUSES: readonly ApiTransactionStatus[] = ["PENDING", "DISPUTED", "COLLECTED", "VOID"];

export function parseTransactionListQuery(searchParams: URLSearchParams): ApiTransactionListQuery {
  const typeParam = searchParams.get("type");
  const statusParam = searchParams.get("status");
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    type: TRANSACTION_TYPES.includes(typeParam as ApiTransactionType) ? (typeParam as ApiTransactionType) : undefined,
    status: TRANSACTION_STATUSES.includes(statusParam as ApiTransactionStatus)
      ? (statusParam as ApiTransactionStatus)
      : undefined,
    categoryId: cleanParam(searchParams.get("categoryId")),
    companyId: cleanParam(searchParams.get("companyId")),
    accountId: cleanParam(searchParams.get("accountId")),
    search: cleanParam(searchParams.get("search")),
    from: toInt(searchParams.get("from")),
    to: toInt(searchParams.get("to")),
  };
}

export function parsePricingIntelligenceQuery(searchParams: URLSearchParams): ApiPricingIntelligenceQuery {
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    from: toInt(searchParams.get("from")),
    to: toInt(searchParams.get("to")),
    companyId: cleanParam(searchParams.get("companyId")),
  };
}

export function parsePricingAnalyticsQuery(searchParams: URLSearchParams): ApiPricingAnalyticsQuery {
  return { days: toInt(searchParams.get("days")) };
}

export function parseProviderPerformanceQuery(searchParams: URLSearchParams): ApiProviderPerformanceQuery {
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    from: toInt(searchParams.get("from")),
    to: toInt(searchParams.get("to")),
    category: cleanParam(searchParams.get("category")),
    search: cleanParam(searchParams.get("search")),
  };
}

export function parseClientListQuery(searchParams: URLSearchParams): ApiClientListQuery {
  return {
    page: toInt(searchParams.get("page")),
    pageSize: toInt(searchParams.get("pageSize")),
    search: cleanParam(searchParams.get("search")),
  };
}

export function parseDesktopOverviewQuery(searchParams: URLSearchParams): { days?: number } {
  return { days: toInt(searchParams.get("days")) };
}

const REPORT_TYPES: readonly ApiReportType[] = [
  "business-overview",
  "revenue",
  "expenses",
  "clients",
  "providers",
  "pricing",
  "price-discrepancies",
  "cash-flow",
];

/** Returns null when `type` is missing or not one of REPORT_TYPES — the
 *  route treats that as a 400, not a silent fallback to some default report. */
export function parseReportQuery(searchParams: URLSearchParams): ApiReportQuery | null {
  const typeParam = searchParams.get("type");
  if (!REPORT_TYPES.includes(typeParam as ApiReportType)) return null;
  return {
    type: typeParam as ApiReportType,
    from: toInt(searchParams.get("from")),
    to: toInt(searchParams.get("to")),
  };
}

export function parseClientOverviewQuery(searchParams: URLSearchParams): { deltaDays?: number } {
  return { deltaDays: toInt(searchParams.get("deltaDays")) };
}
