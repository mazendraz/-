import { apiPost } from "./api";

/**
 * Fire-and-forget: record that the signed-in customer viewed this category —
 * feeds the 14-day inactive-browsing re-engagement email (see the API's
 * customerBrowsing.service.ts). Mirrors the mobile app's identically-named
 * function in lib/categories.ts — kept as its own small file rather than
 * folded into catalog.ts, which already owns a large surface (local-demo
 * data, admin CRUD, hydration) this one write doesn't need to sit alongside.
 *
 * Never awaited by callers and never surfaces an error; a lost view is a
 * slightly-less-targeted future email, never something worth interrupting a
 * page load over.
 */
export function recordCategoryView(categorySlug: string): void {
  apiPost("/customer/category-view", { categorySlug }).catch(() => {});
}
