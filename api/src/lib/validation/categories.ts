import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";
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
});

export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;

export const updateCategorySchema = upsertCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
