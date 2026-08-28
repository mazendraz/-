import { z } from "zod";

// POST /customer/category-view body — fired from the mobile/website category
// screen on view. The slug is looked up server-side (customerBrowsing.service
// .recordCategoryView); an unknown one is silently ignored there, so this
// schema only needs to check shape, not existence.
export const categoryViewSchema = z.object({
  categorySlug: z.string().trim().min(1).max(100),
});
