/**
 * Lead data access — admin-scoped calls only, on entirely different routes
 * from lib/leads.ts's provider equivalents: `adminOnly` on the server is
 * strict role equality too, so a PROVIDER 403s on every one of these. See
 * lib/permissions.ts's header comment for why this is a separate module
 * rather than an extension of lib/leads.ts.
 */
import type { ApiLead, ApiLeadStats, ApiLeadStatus, ApiPage } from "@alassema/core";
import { apiDelete, apiGet } from "@alassema/mobile-shared";

export interface AdminLeadListQuery {
  page?: number;
  pageSize?: number;
  companyId?: string;
  status?: ApiLeadStatus;
  search?: string;
}

function toQueryString(query: AdminLeadListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** GET /admin/leads — every company, filterable by companyId/status/search. */
export function fetchAdminLeads(query: AdminLeadListQuery = {}): Promise<ApiPage<ApiLead>> {
  return apiGet<ApiPage<ApiLead>>(`/admin/leads${toQueryString(query)}`);
}

/** GET /admin/leads/[id] — B6 (business-app phase 8). Any company's lead, by
 *  id, same reasoning as provider/leads/[id]: a lead just accepted from the
 *  waiting list won't be sitting in an already-fetched page. */
export function fetchAdminLead(id: string): Promise<ApiLead> {
  return apiGet<ApiLead>(`/admin/leads/${id}`);
}

/** DELETE /admin/leads/[id] — hard delete, cascades the lead's conversation.
 *  Irreversible; the screen must confirm before calling this. */
export function deleteAdminLead(id: string): Promise<void> {
  return apiDelete<void>(`/admin/leads/${id}`);
}

/** GET /admin/stats — platform-wide, with byCompany + catalog populated
 *  (both absent on the provider endpoint — see lib/leads.ts's
 *  fetchProviderStats for the same shape without them). */
export function fetchAdminStats(query: { days?: number; months?: number; deltaDays?: number } = {}): Promise<ApiLeadStats> {
  const params = new URLSearchParams();
  if (query.days) params.set("days", String(query.days));
  if (query.months) params.set("months", String(query.months));
  if (query.deltaDays) params.set("deltaDays", String(query.deltaDays));
  const qs = params.toString();
  return apiGet<ApiLeadStats>(`/admin/stats${qs ? `?${qs}` : ""}`);
}
