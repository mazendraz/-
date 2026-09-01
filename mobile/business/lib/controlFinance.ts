import type {
  ApiCashFlow,
  ApiFinanceOverview,
  ApiPage,
  ApiTransaction,
  ApiTransactionListQuery,
  ApiTransactionStatus,
} from "@alassema/core";
import { apiGet, apiPatch } from "@alassema/mobile-shared";

export function fetchFinanceOverview(query: { from?: number; to?: number } = {}): Promise<ApiFinanceOverview> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", String(query.from));
  if (query.to) params.set("to", String(query.to));
  const qs = params.toString();
  return apiGet<ApiFinanceOverview>(`/admin/finance/overview${qs ? `?${qs}` : ""}`);
}

export function fetchCashFlow(days?: number): Promise<ApiCashFlow> {
  const qs = days ? `?days=${days}` : "";
  return apiGet<ApiCashFlow>(`/admin/finance/cash-flow${qs}`);
}

/** GET /admin/finance/transactions — server-side filtering only
 *  (finance.service.ts's own reason for existing: no client ever downloads
 *  the ledger to filter it locally). */
export function fetchTransactions(query: ApiTransactionListQuery = {}): Promise<ApiPage<ApiTransaction>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.search) params.set("search", query.search);
  if (query.from) params.set("from", String(query.from));
  if (query.to) params.set("to", String(query.to));
  const qs = params.toString();
  return apiGet<ApiPage<ApiTransaction>>(`/admin/finance/transactions${qs ? `?${qs}` : ""}`);
}

/**
 * PATCH — the ONE write this phase offers, status transitions only
 * (PENDING → COLLECTED | DISPUTED | VOID). Behind `finance:write`, distinct
 * from `finance:read` which every other function here only needs. No
 * create — COMMISSION_INCOME can only ever be created by the system
 * (leadCompletion.service.verify), and manual EXPENSE/ADJUSTMENT entry is
 * deliberately desktop-only per phase-12's own read-mostly boundary.
 */
export function setTransactionStatus(id: string, status: ApiTransactionStatus): Promise<ApiTransaction> {
  return apiPatch<ApiTransaction>(`/admin/finance/transactions/${id}`, { status });
}
