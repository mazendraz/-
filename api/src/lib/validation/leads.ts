// Zod schemas for lead endpoints. createLeadSchema validates ApiLeadPayload
// (POST /leads); leadStatusSchema validates PATCH /leads/:id (used in Phase 8).
import { z } from "zod";
import { sanitizedText, sanitizedOptionalText } from "@/lib/utils/sanitize";
import { isValidE164Phone } from "@/lib/utils/phone";

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
  // The frontend's PhoneInput always normalizes to E.164 before sending, so
  // this can require a genuinely valid international number rather than an
  // Egypt-only regex (PhoneInput plan — international support, confirmed).
  phone: z.string().trim().refine(isValidE164Phone, "Invalid phone number"),
  district: sanitizedText(1, 100),
  // No longer collected on the request form (customer choice — the field
  // stays required on the Lead/DB shape, so the client sends ""); older
  // leads still carry a real value.
  budget: sanitizedOptionalText(100),
  // Optional: a customer may submit with no project details at all.
  description: sanitizedOptionalText(2000),
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
    // A lookup secret compared via phoneTail()'s fuzzy last-10-digits match,
    // not a stored value — a length check is enough, and it stays backward
    // compatible with any format a bookmarked tracking link might carry.
    phone: z.string().trim().min(8).max(20).optional(),
  })
  .refine((o) => Boolean(o.token) || Boolean(o.phone), {
    message: "A tracking token or phone number is required",
  });
