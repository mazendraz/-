import type { ApiAuditLog, ApiPage } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  entity?: string;
  action?: string;
}

/** GET /admin/audit-logs — newest first, filterable by entity/action. */
export function fetchAuditLogs(query: AuditLogQuery = {}): Promise<ApiPage<ApiAuditLog>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.entity) params.set("entity", query.entity);
  if (query.action) params.set("action", query.action);
  const qs = params.toString();
  return apiGet<ApiPage<ApiAuditLog>>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
}
