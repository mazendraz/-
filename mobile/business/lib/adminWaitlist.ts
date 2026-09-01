import type { ApiPage, ApiWaitlistEntry, ApiWaitlistStatus } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export interface AdminWaitlistQuery {
  page?: number;
  pageSize?: number;
  companyId?: string;
  status?: ApiWaitlistStatus;
  search?: string;
}

/** GET /admin/waitlist — every company's waiting list in one place. Status
 *  changes and deletes reuse lib/adminCompanies.ts's company-scoped
 *  functions (setCompanyWaitlistStatus/deleteCompanyWaitlistEntry) — every
 *  entry here already carries the companyId those need. */
export function fetchPlatformWaitlist(query: AdminWaitlistQuery = {}): Promise<ApiPage<ApiWaitlistEntry>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiGet<ApiPage<ApiWaitlistEntry>>(`/admin/waitlist${qs ? `?${qs}` : ""}`);
}
