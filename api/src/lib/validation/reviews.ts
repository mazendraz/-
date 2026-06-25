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
