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

export const updateCategorySchema = upsertCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
