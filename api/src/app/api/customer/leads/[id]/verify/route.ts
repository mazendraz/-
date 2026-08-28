import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { verifyOwnedLeadSchema } from "@/lib/validation/leadCompletion";
import * as leadCompletionService from "@/lib/services/leadCompletion.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Same cap as the public /leads/verify — this is a lower-abuse surface (the
// caller needs a signed-in session, not just a guessed ref), but the amount
// itself is still customer-supplied input worth throttling.
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * POST /api/v1/customer/leads/[id]/verify → ApiLead.
 *
 * The account-owned counterpart of POST /leads/verify (ref + tracking token).
 * Exists because the app's mandatory price-verification gate (see
 * app/_layout.tsx on the mobile client) has no way to reach the token-gated
 * route for a lead this device didn't itself create — GET /customer/leads
 * never returns trackingToken, by design (see that route's comment). Without
 * this, a customer verifying from a second phone, or after a reinstall, hit a
 * permanent 404 on a screen with no way to dismiss it.
 *
 * Ownership is `Lead.customerId === customer.id`, checked inside
 * leadCompletionService.verifyOwned — no ref, no token, no phone: the session
 * itself is the credential.
 */
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, context: Ctx, customer) => {
      const rl = await rateLimit(`customer-leads-verify:${clientIp(request)}`, RATE_LIMIT);
      if (!rl.ok) {
        const seconds = Math.ceil(rl.retryAfterMs / 1000);
        throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
      }

      const { id } = await context.params;
      const input = verifyOwnedLeadSchema.parse(await readJsonObject(request));

      const lead = await leadCompletionService.verifyOwned(id, customer.id, input);
      return ok(lead);
    }),
  ),
);
