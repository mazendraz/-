import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
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

  const raw = await request.json().catch(() => null);
  if (raw === null || typeof raw !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  // Honeypot: real clients never fill `website`; bots auto-fill every field.
  if (typeof (raw as { website?: unknown }).website === "string" &&
    (raw as { website: string }).website.trim() !== "") {
    throw new ValidationError("Submission rejected");
  }

  // CAPTCHA (no-op unless a secret is configured).
  await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));

  const payload = submitReviewSchema.parse(raw);
  return ok(await reviewsService.submitFromLead(payload), 201);
});
