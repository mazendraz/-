import { z } from "zod";
import { sanitizedText } from "@/lib/utils/sanitize";

export const createReviewSchema = z.object({
  author: z.string().trim().min(1).max(100),
  avatar: z.string().trim().min(1).max(4).optional(), // defaults to author's initial
  rating: z.number().int().min(1).max(5),
  text: sanitizedText(1, 2000),
  date: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(100),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// Egyptian mobile — same pattern as validation/leads.ts (the shared secret that
// gates a customer's review against their own completed lead).
const egyptianPhone = /^(?:\+?20)?0?1[0125]\d{8}$/;

// Public customer review submission (POST /reviews). author/date/district are
// derived server-side from the lead, so the customer only sends rating + text.
export const submitReviewSchema = z.object({
  ref: z.string().trim().min(1),
  phone: z.string().trim().regex(egyptianPhone, "Invalid Egyptian mobile number"),
  rating: z.number().int().min(1).max(5),
  text: sanitizedText(1, 2000),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
