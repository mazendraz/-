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
  service: z.string().trim().min(1).max(150),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(egyptianPhone, "Invalid Egyptian mobile number"),
  district: z.string().trim().min(1),
  budget: z.string().trim().min(1),
  description: sanitizedText(10, 2000),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const leadStatusSchema = z.object({
  status: z.enum(["New", "Contacted", "In Progress", "Completed", "Cancelled"]),
});

// Public lead tracking (GET /leads/track?ref=&phone=). Both required; the phone
// must be a valid Egyptian mobile (it's the shared secret that gates the lookup).
export const trackLeadSchema = z.object({
  ref: z.string().trim().min(1),
  phone: z.string().trim().regex(egyptianPhone, "Invalid Egyptian mobile number"),
});
