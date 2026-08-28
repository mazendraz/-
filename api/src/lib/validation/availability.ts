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

// POST /companies/:slug/waitlist — public join.
//
// Field-for-field the same request as createLeadSchema (leads.ts), because it IS
// the same request — just queued behind the company's busy period. Everything
// accepted here is carried onto the Lead verbatim when the provider accepts, so
// anything this schema drops is a detail the customer typed and the provider
// would never see.
//
// The two shape differences from createLeadSchema are both structural:
// companySlug/companyName are in the URL, and the description is called `note`
// after the column it has always written.
//
// district/budget stay OPTIONAL rather than becoming required like the lead's
// district: the mobile client and any bookmarked page can still be running the
// short join form, and rejecting those submissions outright would turn "we
// collect less from you" into "you cannot join at all".
export const waitlistJoinSchema = z.object({
  name: sanitizedText(2, 120),
  phone: z.string().trim().min(8).max(30),
  service: sanitizedOptionalText(150).optional(),
  note: sanitizedOptionalText(2000).optional(),
  district: sanitizedOptionalText(100).optional(),
  budget: sanitizedOptionalText(100).optional(),
  // Feature C, same contract as the lead's: ids and quantities only. Accepting a
  // price from the client would let the basket be submitted with whatever total
  // the browser felt like — and here it would sit unnoticed until the day the
  // provider accepts it.
  items: z
    .array(
      z.object({
        offeringId: z.string().min(1).max(64),
        qty: z.number().int().positive().max(10_000).optional(),
        tierId: z.string().min(1).max(64).nullish(),
      }),
    )
    .min(1)
    .max(25)
    .optional(),
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
