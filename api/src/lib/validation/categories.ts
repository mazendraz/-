import { z } from "zod";
import { stripHtml, sanitizedOptionalText } from "@/lib/utils/sanitize";
import { imageRef } from "@/lib/validation/shared";

export const upsertCategorySchema = z.object({
  label: z.string().trim().min(2).max(100),
  description: z
    .string()
    .default("")
    .transform(stripHtml)
    .pipe(z.string().max(1000)),
  icon: z.string().trim().min(1).max(60),
  cover: imageRef.optional(),
  isActive: z.boolean().default(true),
  pricingMode: z.enum(["QUOTE_ONLY", "FIXED_CATALOG"]).default("QUOTE_ONLY"),
  metaTitle: sanitizedOptionalText(120).optional(),
  metaDescription: sanitizedOptionalText(320).optional(),
  // Optional Arabic companions to label/description — same optional-text
  // convention as metaTitle/metaDescription above, not required on every save.
  labelAr: sanitizedOptionalText(100).optional(),
  descriptionAr: sanitizedOptionalText(1000).optional(),
});

export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;

/**
 * All fields optional for PUT updates. Same fix as updateCompanySchema
 * (validation/companies.ts) and for the identical reason: `.partial()`
 * alone doesn't stop Zod applying a field's `.default(...)` when it's
 * omitted, and categories.service.ts's `update()` writes whatever the
 * parsed value is (`input.X ?? undefined`) — so a partial PUT that leaves
 * out `description`/`isActive`/`pricingMode` would silently reset them to
 * "", true, and QUOTE_ONLY respectively. `pricingMode` is the dangerous one
 * here: resetting it would silently disable every company's catalog in the
 * category. Re-declared here with no default for the same three fields.
 */
export const updateCategorySchema = upsertCategorySchema.partial().extend({
  description: z.string().transform(stripHtml).pipe(z.string().max(1000)).optional(),
  isActive: z.boolean().optional(),
  pricingMode: z.enum(["QUOTE_ONLY", "FIXED_CATALOG"]).optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
