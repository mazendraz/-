import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { verifyCaptcha } from "@/lib/middleware/captcha";
import { waitlistJoinSchema } from "@/lib/validation/availability";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// POST /api/companies/[slug]/waitlist → 201 + ApiWaitlistEntry. Resolves the company
// by slug (404 if none / not ACTIVE). Same guard stack as POST /feedback.
export const POST = withErrors(async (request: NextRequest, ctx: Ctx) => {
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
  await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));

  const payload = waitlistJoinSchema.parse(raw);
  const entry = await waitlistService.join(slug, payload);
  return ok(entry, 201);
});
