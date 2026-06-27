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
import type { ApiLeadStatus, ApiUserRole } from "@/lib/apiTypes";

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
    category: searchParams.get("category")?.trim() || undefined,
    search: searchParams.get("search")?.trim() || undefined,
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
    search: searchParams.get("search")?.trim() || undefined,
  };
}

export function parseAdminLeadListQuery(
  searchParams: URLSearchParams,
): AdminLeadListQuery {
  return {
    ...parseLeadListQuery(searchParams),
    companyId: searchParams.get("companyId")?.trim() || undefined,
    from: toDate(searchParams.get("from")),
    to: toDate(searchParams.get("to")),
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
    search: searchParams.get("search")?.trim() || undefined,
  };
}
