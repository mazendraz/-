import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { verifyCaptcha } from "@/lib/middleware/captcha";
import { submitReviewSchema } from "@/lib/validation/reviews";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// POST /api/reviews → 201 + ApiReview. Customer review for their own completed
// lead, gated by ref + phone. Curated/admin reviews use /admin/companies/[id]/reviews.
export const POST = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`reviews:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  // Bounded read: reject oversized bodies (413) before parsing.
  const raw = await readJsonObject(request);

  // Honeypot: real clients never fill `hp_field`; bots auto-fill every field.
  // (Named generically, NOT "website"/"email", so browser password managers don't
  // autofill it and falsely flag a real user — see the matching frontend input.)
  if (typeof (raw as { hp_field?: unknown }).hp_field === "string" &&
    (raw as { hp_field: string }).hp_field.trim() !== "") {
    throw new ValidationError("Submission rejected");
  }

  // CAPTCHA (no-op unless a secret is configured).
  await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));

  const payload = submitReviewSchema.parse(raw);
  return ok(await reviewsService.submitFromLead(payload), 201);
});
