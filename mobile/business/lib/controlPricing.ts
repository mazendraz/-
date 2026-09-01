import type { ApiPricingAnalytics, ApiPricingIntelligence } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export function fetchPricingIntelligence(query: { page?: number; pageSize?: number; from?: number; to?: number; companyId?: string } = {}): Promise<ApiPricingIntelligence> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.from) params.set("from", String(query.from));
  if (query.to) params.set("to", String(query.to));
  if (query.companyId) params.set("companyId", query.companyId);
  const qs = params.toString();
  return apiGet<ApiPricingIntelligence>(`/admin/pricing-intelligence${qs ? `?${qs}` : ""}`);
}

export function fetchPricingAnalytics(days?: number): Promise<ApiPricingAnalytics> {
  const qs = days ? `?days=${days}` : "";
  return apiGet<ApiPricingAnalytics>(`/admin/analytics/pricing${qs}`);
}
