import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { customerReviewSchema } from "@/lib/validation/customerReview";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Matches the pre-account /reviews route's cap.
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

/**
 * POST /api/v1/customer/leads/[id]/review → 201 + ApiReview.
 *
 * The account-owned counterpart of POST /api/reviews (ref + tracking token).
 * Ownership here is `Lead.customerId === customer.id`, checked inside
 * reviewsService.submitFromLeadId — no ref, no token, no CAPTCHA (the account
 * itself already required signing in, which the anonymous path has no
 * equivalent barrier for).
 */
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, context: Ctx, customer) => {
      const rl = await rateLimit(`customer-reviews:${clientIp(request)}`, RATE_LIMIT);
      if (!rl.ok) {
        const seconds = Math.ceil(rl.retryAfterMs / 1000);
        throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
      }

      const { id } = await context.params;
      const { rating, text } = customerReviewSchema.parse(await readJsonObject(request));

      const review = await reviewsService.submitFromLeadId(id, customer.id, rating, text ?? "");
      return ok(review, 201);
    }),
  ),
);
