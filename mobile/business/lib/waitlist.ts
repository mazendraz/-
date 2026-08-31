import type { ApiPage, ApiWaitlistEntry, ApiWaitlistStatus } from "@alassema/core";
import { apiDelete, apiGet, apiPatch } from "@alassema/mobile-shared";

export function fetchWaitlist(query: { page?: number; pageSize?: number; status?: ApiWaitlistStatus } = {}): Promise<ApiPage<ApiWaitlistEntry>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet<ApiPage<ApiWaitlistEntry>>(`/provider/waitlist${qs ? `?${qs}` : ""}`);
}

/** No transition graph on the server (unlike lead status) — any status may
 *  move to any other. `CONVERTED` is special: the server creates a REAL
 *  Lead from the entry's snapshot, so it isn't reversible in practice even
 *  though the API doesn't forbid re-selecting it — confirm before sending it. */
export function setWaitlistStatus(id: string, status: ApiWaitlistStatus): Promise<ApiWaitlistEntry> {
  return apiPatch<ApiWaitlistEntry>(`/provider/waitlist/${id}`, { status });
}

export function removeWaitlistEntry(id: string): Promise<void> {
  return apiDelete(`/provider/waitlist/${id}`);
}
