// Zod schemas for site-review (platform testimonial) endpoints.
import { z } from "zod";
import { sanitizedText } from "@/lib/utils/sanitize";

// POST /site-reviews — public submission (held for moderation).
export const createSiteReviewSchema = z.object({
  name: z.string().trim().min(2).max(100),
  district: z.string().trim().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  text: sanitizedText(3, 1000),
});
export type CreateSiteReviewInput = z.infer<typeof createSiteReviewSchema>;

// PATCH /admin/site-reviews/[id] — toggle homepage visibility.
export const siteReviewVisibilitySchema = z.object({
  visible: z.boolean(),
});

// PUT /admin/site-reviews/settings — open/close public submissions.
export const siteReviewSettingsSchema = z.object({
  enabled: z.boolean(),
});
