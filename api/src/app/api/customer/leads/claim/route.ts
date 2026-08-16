import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { claimLeadsSchema } from "@/lib/validation/auth";
import * as customerLeads from "@/lib/services/customerLeads.service";

export const dynamic = "force-dynamic";

// Per-ACCOUNT, not per-IP. The batch cap (50, in the schema) already bounds one
// call; this bounds how many calls an account can make, which is what turns a
// slow scan of the reference-number space into something that runs out of budget
// long before it finds anything. Keyed on the account because it is the thing
// that had to be created and verified to get here — far more expensive to rotate
// than an IP.
const RATE_LIMIT = { limit: 20, windowMs: 60 * 60_000 };

// POST /api/v1/customer/leads/claim → { results: [{ refNumber, outcome }] }
//
// Attaches past requests to the signed-in account, proved with the same
// reference + tracking token that already gates public tracking. Nothing here
// grants access the caller didn't already have — it makes an existing right
// durable instead of tied to one browser's localStorage.
//
// Answers 200 with per-item outcomes rather than failing the batch: a device
// handing over its history will routinely include requests that are already
// attached, and one stale entry must not discard the rest.
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, _context, customer) => {
      const rl = await rateLimit(`claim-leads:${customer.id}`, RATE_LIMIT);
      if (!rl.ok) {
        const minutes = Math.ceil(rl.retryAfterMs / 60_000);
        throw new RateLimitError(`Too many attempts. Try again in ${minutes}m.`);
      }

      const { claims } = claimLeadsSchema.parse(
        await readJsonObject(request, 16 * 1024),
      );

      const results = await customerLeads.claimLeads(customer.id, claims);
      return ok({ results });
    }),
  ),
);
