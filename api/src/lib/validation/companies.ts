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

// ── Array/entry limits, in ONE place ────────────────────────────────────────
// Both schemas below (create + partial update) read these, so the two can never
// drift apart again — they were duplicated literals, and a company that was
// created under one set could then fail to save under the other.
//
// The numbers are sized from REAL data, not from what a seeded fixture happens
// to carry. Measured on production (Sept 2026): one company had 62 gallery
// images (the old cap was 60) and seven had a single `services` entry of
// 139-208 characters (the old cap was 120) — a whole comma-separated service
// list pasted into one tag, which is how the admin UI is actually used. Every
// one of those companies was IMPOSSIBLE to save from the editor: the admin
// sends the complete record on every PUT, so the over-long field was rejected
// no matter which field the admin had actually edited, and the modal showed a
// bare "Validation failed".
export const MAX_GALLERY_IMAGES = 100;
export const MAX_SERVICE_ITEMS = 100;
export const MAX_SERVICE_LENGTH = 400;
export const MAX_BADGE_ITEMS = 20;
export const MAX_BADGE_LENGTH = 120;

const servicesArray = () =>
  z.array(z.string().trim().min(1).max(MAX_SERVICE_LENGTH)).max(MAX_SERVICE_ITEMS);
const galleryArray = () => z.array(imageRef).max(MAX_GALLERY_IMAGES);
const badgesArray = () =>
  z.array(z.string().trim().min(1).max(MAX_BADGE_LENGTH)).max(MAX_BADGE_ITEMS);

const baseCompanySchema = z.object({
  categoryIds: z
    .array(z.string().uuid())
    .min(1, "At least one category is required")
    .max(MAX_CATEGORIES_PER_COMPANY, `A company may belong to at most ${MAX_CATEGORIES_PER_COMPANY} categories`),
  // Which of categoryIds is the primary (see CompanyCategory). Defaults to
  // categoryIds[0] in the service layer when omitted.
  primaryCategoryId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(150),
  // Optional Arabic companion to name — same optional-text convention as
  // metaTitle/metaDescription below, not required on every save.
  nameAr: sanitizedOptionalText(150).optional(),
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
  // The caps are meant to stop the absurd, never a real record: the whole point
  // is that everything already in the database still round-trips through the
  // admin editor. Sizing them off the SEED data broke exactly that (see the
  // limit constants above) — so they now live there, above real production
  // maxima, and any future change to them belongs there too.
  services: servicesArray().default([]),
  gallery: galleryArray().default([]),
  badges: badgesArray().default([]),
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

/**
 * All fields optional for PATCH/PUT updates.
 *
 * `.partial()` alone is NOT enough for the six fields above that carry a
 * Zod `.default(...)` (services/gallery/badges/featured/verified/
 * completedProjects): Zod applies a field's default whenever it's absent
 * from the input, `.partial()` or not — so omitting one of these from an
 * update body doesn't leave it `undefined` (which companies.service.ts's
 * `update()` correctly reads as "don't touch this column"), it substitutes
 * the DEFAULT, which then gets written and silently wipes the real value.
 *
 * Found live (business-app phase 10): a PUT with only `{ tagline }` reset a
 * real company's 6-image gallery to `[]`. The business-app's own admin
 * editor was never at risk — it always sends the complete record — but any
 * other partial-PUT caller (present or future) would hit this. Re-declaring
 * these six here with no default closes it at the schema level, for every
 * caller, not just this one client.
 */
export const updateCompanySchema = baseCompanySchema
  .partial()
  .extend({
    services: servicesArray().optional(),
    gallery: galleryArray().optional(),
    badges: badgesArray().optional(),
    featured: z.boolean().optional(),
    verified: z.boolean().optional(),
    completedProjects: z.number().int().min(0).optional(),
  })
  .refine(primaryInCategoryIds, primaryRefineOptions);
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const companyStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});
export type CompanyStatusInput = z.infer<typeof companyStatusSchema>;
