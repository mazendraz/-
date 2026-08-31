import type { ApiCategory } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

/** Active categories with live company counts — for Home and Services. */
export function fetchCategories(): Promise<ApiCategory[]> {
  return apiGet<ApiCategory[]>("/categories");
}

/**
 * Fire-and-forget: record that the signed-in customer viewed this category —
 * feeds the 14-day inactive-browsing re-engagement email (see the API's
 * customerBrowsing.service.ts). Never awaited by callers and never surfaces
 * an error; a lost view is a slightly-less-targeted future email, never
 * something worth interrupting a screen load over.
 */
export function recordCategoryView(categorySlug: string): void {
  apiPost("/customer/category-view", { categorySlug }).catch(() => {});
}
