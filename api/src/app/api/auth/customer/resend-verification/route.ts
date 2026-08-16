import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { resendVerificationSchema } from "@/lib/validation/auth";
import * as customerPassword from "@/lib/services/customerPassword.service";

export const dynamic = "force-dynamic";

// Stricter than login: every accepted call sends mail to an address the caller
// chose, so an open one is a spam relay aimed at whoever they like.
const IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 };
// And a per-address cap, so a rotating-IP caller still can't flood one inbox.
const EMAIL_LIMIT = { limit: 3, windowMs: 60 * 60_000 };

// POST /api/v1/auth/customer/resend-verification → 200, always.
//
// Answers identically whether the address is unknown, already verified,
// deactivated, or genuinely pending. Any difference here turns this into an
// account-existence oracle that needs no password at all.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-resend:${ip}`, IP_LIMIT);
    if (!rl.ok) {
      const minutes = Math.ceil(rl.retryAfterMs / 60_000);
      throw new RateLimitError(`Too many attempts. Try again in ${minutes}m.`);
    }

    const { email } = resendVerificationSchema.parse(await readJsonObject(request, 4096));

    // Consumed BEFORE the send and never surfaced differently: a caller who
    // trips the per-address cap gets the same 200 as everyone else, so the cap
    // can't be used to discover which addresses are real either.
    const perEmail = await rateLimit(`customer-resend:email:${email}`, EMAIL_LIMIT);
    if (perEmail.ok) await customerPassword.resendVerification(email);

    return ok({ sent: true });
  }),
);
