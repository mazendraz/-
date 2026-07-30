// Zod schemas for lead endpoints. createLeadSchema validates ApiLeadPayload
// (POST /leads); leadStatusSchema validates PATCH /leads/:id (used in Phase 8).
import { z } from "zod";
import { sanitizedText } from "@/lib/utils/sanitize";

// Egyptian mobile. Accepts local and international forms:
//   01012345678 · 201012345678 · +201012345678 (E.164, trunk 0 dropped)
// Optional +20/20 country code, optional trunk 0, then 1[0125] + 8 digits.
const egyptianPhone = /^(?:\+?20)?0?1[0125]\d{8}$/;

/**
 * One selected line. NO PRICES: the server looks them up from the catalogue.
 * Accepting a price from the client would let the basket be submitted with
 * whatever total the browser felt like.
 */
const requestedItem = z.object({
  offeringId: z.string().min(1).max(64),
  qty: z.number().int().positive().max(10_000).optional(),
  tierId: z.string().min(1).max(64).nullish(),
});

export const createLeadSchema = z.object({
  companySlug: z.string().trim().min(1),
  companyName: z.string().trim().min(1), // informational; company resolved by slug
  // Free-text fields are HTML-stripped before length checks — the API must never
  // persist markup (defense-in-depth; React also escapes on render).
  //
  // Still required even with items[]: it is the human-readable summary older
  // screens, the notification emails and the CSV export all read. When items are
  // supplied the service fills it from their names.
  service: sanitizedText(1, 150),
  name: sanitizedText(2, 100),
  phone: z.string().trim().regex(egyptianPhone, "Invalid Egyptian mobile number"),
  district: sanitizedText(1, 100),
  budget: sanitizedText(1, 100),
  description: sanitizedText(10, 2000),
  // Feature C. Absent → the classic single-service request, unchanged.
  items: z.array(requestedItem).min(1).max(25).optional(),
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
