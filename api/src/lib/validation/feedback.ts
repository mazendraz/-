// Zod schemas for feedback (company "Report a problem" / suggestion / inquiry).
import { z } from "zod";
import { sanitizedText, sanitizedOptionalText } from "@/lib/utils/sanitize";

// POST /feedback — public submission from a company page.
// type is the lowercase API label; the service maps it to the Prisma enum.
export const createFeedbackSchema = z.object({
  companySlug: z.string().trim().min(1),
  type: z.enum(["problem", "suggestion", "inquiry"]),
  name: sanitizedOptionalText(150).optional(),
  phone: z.string().trim().max(30).optional(),
  message: sanitizedText(1, 2000), // required — the actual feedback body
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

// PATCH /admin/feedback/[id] — mark read/unread.
export const feedbackReadSchema = z.object({
  isRead: z.boolean(),
});
