import type { ApiLead, ApiLeadStatus, ApiOperationsSummary, ApiPage } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export interface ControlLeadsQuery {
  page?: number;
  pageSize?: number;
  status?: ApiLeadStatus;
  search?: string;
}

/** GET /admin/desktop/leads — desktopOnly("operations:read"). Same
 *  underlying leadsService.listAll as /admin/leads (phase 8), reached via a
 *  separate route: a desktop user without operations:read can't get here
 *  even if they somehow guessed the phase-8 URL, and vice versa. */
export function fetchControlLeads(query: ControlLeadsQuery = {}): Promise<ApiPage<ApiLead>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiGet<ApiPage<ApiLead>>(`/admin/desktop/leads${qs ? `?${qs}` : ""}`);
}

export function fetchOperationsSummary(): Promise<ApiOperationsSummary> {
  return apiGet<ApiOperationsSummary>("/admin/desktop/leads/summary");
}
