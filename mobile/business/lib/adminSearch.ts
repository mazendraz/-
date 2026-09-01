/**
 * GET /admin/search — cross-entity search over the Business Control Center's
 * staff data (clients, providers, requests, services, transactions),
 * permission-filtered server-side. `ApiSearchResult.path` is a DESKTOP app
 * route (see its own comment in packages/core) and is not navigable from
 * here — only `category: "request"` is actionable in this app, since its
 * `id` is a real Lead id this app already has a screen for (`/lead/[id]`).
 * Every other category renders as an inert info row.
 */
import type { ApiSearchResponse } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export function globalSearch(q: string): Promise<ApiSearchResponse> {
  return apiGet<ApiSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`);
}
