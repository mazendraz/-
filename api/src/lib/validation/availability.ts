// Zod schemas for provider/admin availability ("busy") + the public waiting list.
import { z } from "zod";
import { sanitizedText, sanitizedOptionalText } from "@/lib/utils/sanitize";

// PATCH /provider/availability · PATCH /admin/companies/:id/availability.
// busyUntil is an epoch-ms instant (or null to clear the auto-reopen date). When
// busy is false the date/note are irrelevant; the service clears busyUntil then.
export const availabilitySchema = z.object({
  busy: z.boolean(),
  busyUntil: z.number().int().nonnegative().nullable().optional(),
  busyNote: sanitizedOptionalText(200).optional(),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

// POST /companies/:slug/waitlist — public join. Mirrors the lead/feedback shape:
// contact is name + phone (off-platform follow-up), service/note optional.
export const waitlistJoinSchema = z.object({
  name: sanitizedText(2, 120),
  phone: z.string().trim().min(8).max(30),
  service: sanitizedOptionalText(150).optional(),
  note: sanitizedOptionalText(500).optional(),
});
export type WaitlistJoinInput = z.infer<typeof waitlistJoinSchema>;

// PATCH /provider/waitlist/:id · /admin/companies/:id/waitlist/:entryId.
export const waitlistStatusSchema = z.object({
  status: z.enum(["WAITING", "NOTIFIED", "CONVERTED", "CANCELLED"]),
});
export type WaitlistStatusInput = z.infer<typeof waitlistStatusSchema>;
