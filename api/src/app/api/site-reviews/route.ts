import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { createSiteReviewSchema } from "@/lib/validation/siteReviews";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// GET /api/site-reviews → visible ApiSiteReview[] (public; homepage testimonials).
export const GET = withErrors(async () => {
  return ok(await service.listPublic());
});

// POST /api/site-reviews → 201 + ApiSiteReview, held for moderation (visible=false).
export const POST = withErrors(async (request: NextRequest) => {
  const rl = rateLimit(`site-reviews:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  if (!(await service.getEnabled())) {
    throw new ForbiddenError("Review submissions are currently closed.");
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

  const payload = createSiteReviewSchema.parse(raw);
  return ok(await service.create(payload), 201);
});
