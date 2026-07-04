// Zod schemas for lead endpoints. createLeadSchema validates ApiLeadPayload
// (POST /leads); leadStatusSchema validates PATCH /leads/:id (used in Phase 8).
import { z } from "zod";
import { sanitizedText } from "@/lib/utils/sanitize";

// Egyptian mobile. Accepts local and international forms:
//   01012345678 · 201012345678 · +201012345678 (E.164, trunk 0 dropped)
// Optional +20/20 country code, optional trunk 0, then 1[0125] + 8 digits.
const egyptianPhone = /^(?:\+?20)?0?1[0125]\d{8}$/;

export const createLeadSchema = z.object({
  companySlug: z.string().trim().min(1),
  companyName: z.string().trim().min(1), // informational; company resolved by slug
  // Free-text fields are HTML-stripped before length checks — the API must never
  // persist markup (defense-in-depth; React also escapes on render).
  service: sanitizedText(1, 150),
  name: sanitizedText(2, 100),
  phone: z.string().trim().regex(egyptianPhone, "Invalid Egyptian mobile number"),
  district: sanitizedText(1, 100),
  budget: sanitizedText(1, 100),
  description: sanitizedText(10, 2000),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const leadStatusSchema = z.object({
  status: z.enum(["New", "Contacted", "In Progress", "Completed", "Cancelled"]),
});

// Public lead tracking (GET /leads/track?ref=&token=&phone=). The ref plus a
// secret: the high-entropy token (new leads) OR the phone (legacy leads). At least
// one secret is required; the service decides which applies per lead.
export const trackLeadSchema = z
  .object({
    ref: z.string().trim().min(1),
    token: z.string().trim().min(1).max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(egyptianPhone, "Invalid Egyptian mobile number")
      .optional(),
  })
  .refine((o) => Boolean(o.token) || Boolean(o.phone), {
    message: "A tracking token or phone number is required",
  });
