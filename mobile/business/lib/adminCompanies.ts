/**
 * Company directory — admin, read-only in this phase (phase 8). Editing and
 * the status-change control land in phase 10.
 */
import type { ApiCompany, ApiPage } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export type CompanyStatusValue = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminCompanyListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CompanyStatusValue;
}

/**
 * GET /admin/companies. Note `status` narrows results server-side but
 * `ApiCompany` doesn't serialize a `status` field back — see phase-8's own
 * doc correction — so a matched row can't show which status it matched on.
 */
export function fetchAdminCompanies(query: AdminCompanyListQuery = {}): Promise<ApiPage<ApiCompany>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet<ApiPage<ApiCompany>>(`/admin/companies${qs ? `?${qs}` : ""}`);
}
