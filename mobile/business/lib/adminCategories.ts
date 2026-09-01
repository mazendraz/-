import type { ApiAdminCategory } from "@alassema/core";
import { apiDelete, apiGet, apiPost, apiPut } from "@alassema/mobile-shared";

/** The full-representation input `upsertCategorySchema` accepts. `PUT
 *  /admin/categories/[id]` is a full replace, same risk as the company PUT
 *  — always build this from the freshly-fetched ApiAdminCategory. */
export interface CategoryInput {
  label: string;
  description: string;
  icon: string;
  cover?: string;
  isActive: boolean;
  pricingMode: "QUOTE_ONLY" | "FIXED_CATALOG";
  metaTitle?: string | null;
  metaDescription?: string | null;
  labelAr?: string | null;
  descriptionAr?: string | null;
}

export function categoryToInput(c: ApiAdminCategory): CategoryInput {
  return {
    label: c.label,
    description: c.description,
    icon: c.icon,
    cover: c.cover || undefined,
    isActive: c.isActive,
    pricingMode: c.pricingMode,
    metaTitle: c.metaTitle ?? null,
    metaDescription: c.metaDescription ?? null,
    labelAr: c.labelAr ?? null,
    descriptionAr: c.descriptionAr ?? null,
  };
}

/** GET /admin/categories — every category, with total company counts and
 *  `publishedOfferingCompanyCount` (the pricing-mode-switch confirm needs
 *  this — see PricingModeSelector). No pagination on this route; the
 *  category tree is small by nature. */
export function fetchAdminCategories(): Promise<ApiAdminCategory[]> {
  return apiGet<ApiAdminCategory[]>("/admin/categories");
}

/** `metaTitle`/`metaDescription`/`labelAr`/`descriptionAr` are `.optional()`
 *  only on `upsertCategorySchema` (never `.nullable()`), while
 *  `ApiAdminCategory` reads them back as `T | null` — same mismatch as
 *  lib/adminCompanies.ts's identical `toWireBody`, found the same way
 *  (a 400 on the very first create). Converts at the one place every write
 *  passes through instead of pushing null-vs-undefined onto CategoryForm. */
function toWireBody(input: CategoryInput): Record<string, unknown> {
  const { metaTitle, metaDescription, labelAr, descriptionAr, ...rest } = input;
  return {
    ...rest,
    metaTitle: metaTitle ?? undefined,
    metaDescription: metaDescription ?? undefined,
    labelAr: labelAr ?? undefined,
    descriptionAr: descriptionAr ?? undefined,
  };
}

/** POST — auto-slugs from label. */
export function createCategory(input: CategoryInput): Promise<ApiAdminCategory> {
  return apiPost<ApiAdminCategory>("/admin/categories", toWireBody(input));
}

export function updateCategory(id: string, input: CategoryInput): Promise<ApiAdminCategory> {
  return apiPut<ApiAdminCategory>(`/admin/categories/${id}`, toWireBody(input));
}

/** 409 if any company's ONLY category is this one — never deletes a
 *  company (categories.service.remove's own guarantee). */
export function deleteCategory(id: string): Promise<void> {
  return apiDelete<void>(`/admin/categories/${id}`);
}
