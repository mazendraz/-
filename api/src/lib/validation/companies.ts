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
  // ── Bounded on purpose ──────────────────────────────────────────────────
  // These were `min(1)` / `min(8)` with NO upper bound and no array cap, while
  // every neighbouring field (name 150, tagline 200, about 5000, categories 5)
  // was capped. That gap is not only a layout risk — `services` and `badges`
  // are part of the CARD payload (see serialize.ts companyScalars), so they are
  // returned for every company on every page of the PUBLIC /api/companies list.
  // One company with a multi-megabyte services array therefore inflates a
  // public, cached, unauthenticated response for everyone, and the admin write
  // path that creates it reads the body with a bare request.json() — no size
  // limit at all (unlike the public endpoints, which go through readJsonObject).
  //
  // The caps are deliberately far above real data (seeded companies carry ~6
  // services, ~3 badges, ~6 gallery items), so no existing record can fail to
  // round-trip through the admin editor — they only stop the absurd.
  services: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  gallery: z.array(imageRef).max(60).default([]),
  badges: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  phone: z.string().trim().min(8).max(32),
  location: z.string().trim().min(1).max(200),
  yearsExperience: z.number().int().min(0).max(200),
  responseTime: z.string().trim().min(1).max(80),
  verifiedSince: z.string().trim().min(1).max(20),
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
  email: z.string().email().max(254).optional(),
  whatsapp: z.string().trim().max(32).optional(),
  // Optional nested projects — when present, replace the company's project list.
  // Capped for the same reason as the arrays above: this is a replace-all write,
  // so an uncapped array is an uncapped INSERT in one transaction.
  projects: z.array(companyProjectSchema).max(200).optional(),
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
