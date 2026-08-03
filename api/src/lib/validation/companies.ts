// Zod schemas for admin company endpoints. upsertCompanySchema covers all
// ApiCompany input fields (backend-plan §6); updateCompanySchema is the partial.
import { z } from "zod";
import { sanitizedOptionalText } from "@/lib/utils/sanitize";
import { imageRef } from "@/lib/validation/shared";

// Nested project edited within the company editor (replace-all on save).
const companyProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  img: imageRef,
  description: sanitizedOptionalText(2000),
  year: z.string().trim().min(1).max(10),
  featured: z.boolean().default(false),
});

// No maximum unless configured — this constant IS the config point (requirement:
// "no max number of categories unless explicitly configured").
export const MAX_CATEGORIES_PER_COMPANY = 5;

const baseCompanySchema = z.object({
  categoryIds: z
    .array(z.string().uuid())
    .min(1, "At least one category is required")
    .max(MAX_CATEGORIES_PER_COMPANY, `A company may belong to at most ${MAX_CATEGORIES_PER_COMPANY} categories`),
  // Which of categoryIds is the primary (see CompanyCategory). Defaults to
  // categoryIds[0] in the service layer when omitted.
  primaryCategoryId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(150),
  tagline: sanitizedOptionalText(200),
  about: sanitizedOptionalText(5000),
  logo: imageRef,
  cover: imageRef,
  services: z.array(z.string().trim().min(1)).default([]),
  gallery: z.array(imageRef).default([]),
  badges: z.array(z.string().trim().min(1)).default([]),
  phone: z.string().trim().min(8),
  location: z.string().trim().min(1),
  yearsExperience: z.number().int().min(0),
  responseTime: z.string().trim().min(1),
  verifiedSince: z.string().trim().min(1),
  completedProjects: z.number().int().min(0).default(0),
  featured: z.boolean().default(true),
  verified: z.boolean().default(false),
  // Manual rating override. rating/reviewCount only take effect when
  // ratingOverridden is true; otherwise they're derived from the Review table.
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  ratingOverridden: z.boolean().optional(),
  metaTitle: sanitizedOptionalText(120).optional(),
  metaDescription: sanitizedOptionalText(320).optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().trim().optional(),
  // Optional nested projects — when present, replace the company's project list.
  projects: z.array(companyProjectSchema).optional(),
});

// Shared by both schemas below — Zod drops .refine()'s effect across .partial(),
// so each derives independently from baseCompanySchema rather than one wrapping
// the other.
function primaryInCategoryIds(data: { categoryIds?: string[]; primaryCategoryId?: string }): boolean {
  if (!data.categoryIds || !data.primaryCategoryId) return true; // nothing to cross-check
  return data.categoryIds.includes(data.primaryCategoryId);
}
const primaryRefineOptions = {
  message: "primaryCategoryId must be one of categoryIds",
  path: ["primaryCategoryId"] as string[],
};

export const upsertCompanySchema = baseCompanySchema.refine(primaryInCategoryIds, primaryRefineOptions);
export type UpsertCompanyInput = z.infer<typeof upsertCompanySchema>;

// All fields optional for PATCH/PUT updates.
export const updateCompanySchema = baseCompanySchema.partial().refine(primaryInCategoryIds, primaryRefineOptions);
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const companyStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});
export type CompanyStatusInput = z.infer<typeof companyStatusSchema>;
