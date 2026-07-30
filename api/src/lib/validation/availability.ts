// Zod schemas for provider/admin availability ("busy") + the public waiting list.
import { z } from "zod";
import { sanitizedText, sanitizedOptionalText } from "@/lib/utils/sanitize";

// PATCH /provider/availability · PATCH /admin/companies/:id/availability.
// busyUntil is an epoch-ms instant (or null to clear the auto-reopen date). When
// busy is false the date/note are irrelevant; the service clears busyUntil then.
//
// busyNote is NULLABLE, not merely optional. ApiAvailabilityPayload declares it
// `string | null`, and the client sends an explicit null to mean "no note" — so
// an `.optional()`-only schema rejected the payload the client actually sends.
// That is what made the admin list's availability toggle appear inert: every
// click 400'd on `busyNote` and the row never changed. The service already
// treats null as "clear it", so only this line was wrong.
export const availabilitySchema = z.object({
  busy: z.boolean(),
  busyUntil: z.number().int().nonnegative().nullable().optional(),
  busyNote: sanitizedOptionalText(200).nullable().optional(),
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

// GET /waitlist/track?id=&phone= — public lookup. The id plus the phone the
// customer joined with (the only shared secret a waitlist join has) is the
// credential — mirrors the leads track endpoint's phone fallback.
export const trackWaitlistSchema = z.object({
  id: z.string().trim().min(1),
  phone: z.string().trim().min(8).max(30),
});
export type TrackWaitlistInput = z.infer<typeof trackWaitlistSchema>;
