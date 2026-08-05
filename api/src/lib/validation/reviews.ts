import { z } from "zod";
import { sanitizedText } from "@/lib/utils/sanitize";

export const createReviewSchema = z.object({
  author: sanitizedText(1, 100),
  avatar: z.string().trim().min(1).max(4).optional(), // defaults to author's initial
  rating: z.number().int().min(1).max(5),
  text: sanitizedText(1, 2000),
  date: z.string().trim().min(1).max(40),
  district: sanitizedText(1, 100),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// Public customer review submission (POST /reviews). author/date/district are
// derived server-side from the lead, so the customer only sends rating + text.
// Gated by the lead's tracking token (new leads) or phone (legacy) — at least one.
export const submitReviewSchema = z
  .object({
    ref: z.string().trim().min(1),
    token: z.string().trim().min(1).max(200).optional(),
    // Same pattern as trackLeadSchema.phone (validation/leads.ts): a lookup
    // secret compared via phoneTail(), not a stored value — length check only.
    phone: z.string().trim().min(8).max(20).optional(),
    rating: z.number().int().min(1).max(5),
    text: sanitizedText(1, 2000),
  })
  .refine((o) => Boolean(o.token) || Boolean(o.phone), {
    message: "A tracking token or phone number is required",
  });

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// Admin moderation: approve / un-approve a review (PATCH /admin/reviews/[id]).
export const reviewApprovalSchema = z.object({ approved: z.boolean() });
export type ReviewApprovalInput = z.infer<typeof reviewApprovalSchema>;
