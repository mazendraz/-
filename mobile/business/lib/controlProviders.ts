import type { ApiPage, ApiProviderPerformance, ApiProviderPerformanceSummary } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export interface ControlProvidersQuery {
  page?: number;
  pageSize?: number;
  from?: number;
  to?: number;
  category?: string;
  search?: string;
}

export function fetchProviderPerformance(query: ControlProvidersQuery = {}): Promise<ApiPage<ApiProviderPerformance>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.from) params.set("from", String(query.from));
  if (query.to) params.set("to", String(query.to));
  if (query.category) params.set("category", query.category);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiGet<ApiPage<ApiProviderPerformance>>(`/admin/providers-performance${qs ? `?${qs}` : ""}`);
}

export function fetchProviderPerformanceSummary(): Promise<ApiProviderPerformanceSummary> {
  return apiGet<ApiProviderPerformanceSummary>("/admin/providers-performance/summary");
}
