import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { verifyCaptcha } from "@/lib/middleware/captcha";
import { optionalCustomerId } from "@/lib/middleware/optionalCustomer";
import { waitlistJoinSchema } from "@/lib/validation/availability";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// POST /api/companies/[slug]/waitlist → 201 + ApiWaitlistEntry. Resolves the company
// by slug (404 if none / not ACTIVE). Same guard stack as POST /feedback.
export const POST = withErrors(withMaintenance(async (request: NextRequest, ctx: Ctx) => {
  const { slug } = await ctx.params;

  const rl = await rateLimit(`waitlist:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  // Bounded read: reject oversized bodies (413) before parsing.
  const raw = await readJsonObject(request);

  // Honeypot: real clients never fill `hp_field`; bots auto-fill every field.
  if (typeof (raw as { hp_field?: unknown }).hp_field === "string" &&
    (raw as { hp_field: string }).hp_field.trim() !== "") {
    throw new ValidationError("Submission rejected");
  }

  // CAPTCHA (no-op unless a secret is configured).
  // CAPTCHA — for ANONYMOUS submissions only, and a no-op unless a secret is
  // configured at all. Same rule, and the same reasoning, as POST /leads (see
  // that route's own comment): a signed-in customer already answered "is there
  // a human here?" more strongly than a challenge can, by holding a session
  // minted from a verified email address that every submission is attributable
  // to and revocable with.
  //
  // This matters because Turnstile is a BROWSER widget. The native apps have no
  // origin on the site key's domain list, so a WebView answers 110200 and never
  // issues a token — with a secret configured, this endpoint returned 400
  // "CAPTCHA verification required" for every signed-in mobile submission.
  // (Verified against this API with TURNSTILE_SECRET_KEY set: POST returned
  // {"code":"VALIDATION_ERROR","message":"CAPTCHA verification required"}.)
  // The leads route was already fixed this way; these routes were missed.
  //
  // Anonymous callers are unchanged, and the honeypot + per-IP rate limit above
  // still apply to signed-in and anonymous alike.
  // Resolved once and reused below for the entry itself — this route already
  // needed the id, so the captcha guard costs no extra auth lookup.
  const customerId = await optionalCustomerId(request);
  if (!customerId) {
    await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));
  }

  const payload = waitlistJoinSchema.parse(raw);
  const entry = await waitlistService.join(slug, payload, customerId);
  return ok(entry, 201);
}));
