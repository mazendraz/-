import type { ApiClient, ApiClientOverview, ApiPage } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export function fetchClients(query: { page?: number; pageSize?: number; search?: string } = {}): Promise<ApiPage<ApiClient>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiGet<ApiPage<ApiClient>>(`/admin/clients${qs ? `?${qs}` : ""}`);
}

export function fetchClientOverview(deltaDays?: number): Promise<ApiClientOverview> {
  const qs = deltaDays ? `?deltaDays=${deltaDays}` : "";
  return apiGet<ApiClientOverview>(`/admin/clients/overview${qs}`);
}
