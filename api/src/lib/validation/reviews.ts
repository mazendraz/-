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

// Egyptian mobile — same pattern as validation/leads.ts (the shared secret that
// gates a customer's review against their own completed lead).
const egyptianPhone = /^(?:\+?20)?0?1[0125]\d{8}$/;

// Public customer review submission (POST /reviews). author/date/district are
// derived server-side from the lead, so the customer only sends rating + text.
// Gated by the lead's tracking token (new leads) or phone (legacy) — at least one.
export const submitReviewSchema = z
  .object({
    ref: z.string().trim().min(1),
    token: z.string().trim().min(1).max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(egyptianPhone, "Invalid Egyptian mobile number")
      .optional(),
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
