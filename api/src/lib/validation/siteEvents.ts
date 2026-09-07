import { z } from "zod";

/**
 * The funnel, as an ordered allowlist. Every stage a visit can reach, in the
 * order it is reached — the drop between two consecutive entries IS the answer
 * to "where do people stop".
 *
 * An allowlist, not free text, for two reasons: a bot POSTing to the public
 * /api/track can't invent event names and bury the real ones, and renaming a
 * stage here forces the dashboard that reads it to be updated in the same
 * commit.
 */
export const FUNNEL_STAGES = [
  "page_view",          // any route — the top of the funnel (a visit)
  "category_view",      // opened a service category
  "company_view",       // opened a provider profile
  "request_form_open",  // opened the request form
  "request_form_start", // typed into the first field (real intent, not a bounce)
  "request_signin_wall",// hit the sign-in requirement on the way to sending
  "request_submit",     // pressed send
  "request_success",    // the server accepted the lead
  "request_error",      // the send failed (validation/network/rate limit)
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

// POST /api/track body. Everything is bounded to the column widths in
// schema.prisma (SiteEvent) so an oversized field is a 400, never a
// database error at insert time.
export const trackEventSchema = z.object({
  name: z.enum(FUNNEL_STAGES),
  // Route only — the client strips the query string before sending.
  path: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().min(8).max(40),
  // Referrer HOST or utm/ref value, never a full URL (see the model comment).
  source: z.string().trim().max(120).optional(),
  // Company/category slug the event is about, when it is about one.
  target: z.string().trim().max(160).optional(),
});

export type TrackEventInput = z.infer<typeof trackEventSchema>;
