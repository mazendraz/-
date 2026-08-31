/**
 * Lead data access — provider-scoped calls only. Admin equivalents live in
 * lib/adminLeads.ts (phase 8), on entirely different routes: `providerOnly`
 * on the server is strict role equality, so an ADMIN 403s on every one of
 * these — see lib/permissions.ts's header comment.
 */
import type { ApiLead, ApiLeadCompletionPayload, ApiLeadStats, ApiLeadStatus, ApiPage } from "@alassema/core";
import { apiGet, apiPatch, apiPost } from "@alassema/mobile-shared";

export interface LeadListQuery {
  page?: number;
  pageSize?: number;
  status?: ApiLeadStatus;
  search?: string;
}

function toQueryString(query: LeadListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** GET /provider/leads — own company only. Returns an empty page (not an
 *  error) for a provider with no company linked; see hasCompany() in
 *  lib/permissions.ts. */
export function fetchLeads(query: LeadListQuery = {}): Promise<ApiPage<ApiLead>> {
  return apiGet<ApiPage<ApiLead>>(`/provider/leads${toQueryString(query)}`);
}

/** GET /provider/leads/[id] — always fetch detail by id, never read it out
 *  of a list page's cache: a lead created moments ago (e.g. a just-accepted
 *  waitlist entry) may not be in an already-fetched page at all. */
export function fetchLead(id: string): Promise<ApiLead> {
  return apiGet<ApiLead>(`/provider/leads/${id}`);
}

/**
 * PATCH /leads/[id] — status change. Shared with the admin app (phase 8)
 * on the SAME route; ownership/role are enforced server-side per caller.
 *
 * A provider cannot reach "Completed" through this call — the server's
 * `requireCompletion` flag rejects it (see api's leads.service.updateStatus
 * and PATCH /leads/[id]'s own comment). The UI never offers that transition
 * in the first place (see StatusSheet), so this is a second, server-side
 * backstop, not the primary defense.
 */
export function updateLeadStatus(id: string, status: ApiLeadStatus): Promise<ApiLead> {
  return apiPatch<ApiLead>(`/leads/${id}`, { status });
}

/** POST /provider/leads/[id]/complete — the only path to "Completed" for a
 *  provider. Captures the final amount and opens the customer's price-
 *  verification gate. Returns the updated ApiLead (with `.completion`
 *  populated), not a bare completion record. */
export function completeLead(id: string, payload: ApiLeadCompletionPayload): Promise<ApiLead> {
  return apiPost<ApiLead>(`/provider/leads/${id}/complete`, payload);
}

/** GET /provider/stats — own company only. `byCompany` is empty and
 *  `catalog` is absent on this endpoint (both are admin-only fields on the
 *  shared ApiLeadStats shape — see phase-8's admin equivalent). 400 if the
 *  caller has no company linked. */
export function fetchProviderStats(query: { days?: number; months?: number; deltaDays?: number } = {}): Promise<ApiLeadStats> {
  const params = new URLSearchParams();
  if (query.days) params.set("days", String(query.days));
  if (query.months) params.set("months", String(query.months));
  if (query.deltaDays) params.set("deltaDays", String(query.deltaDays));
  const qs = params.toString();
  return apiGet<ApiLeadStats>(`/provider/stats${qs ? `?${qs}` : ""}`);
}
