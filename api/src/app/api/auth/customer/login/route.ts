import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { customerLoginSchema, deviceSchema } from "@/lib/validation/auth";
import { customerSignInResponse } from "@/lib/utils/customerSignIn";
import * as customerPassword from "@/lib/services/customerPassword.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// Per-IP, and mirrors the staff login's shape for the same reasons documented
// there.
const IP_LIMIT = { limit: 10, windowMs: 60_000 };

// Per-account, counting FAILURES only. A correct password never touches this, so
// a legitimate customer is never locked out and nobody can lock someone else out
// by guessing at their address on purpose. Keyed by the submitted email whether
// or not it exists, so the throttle itself doesn't reveal which addresses are
// registered.
const ACCOUNT_FAILURE_LIMIT = { limit: 10, windowMs: 15 * 60_000 };

// POST /api/v1/auth/customer/login → { token, customer, outcome: "returning" }
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-login:${ip}`, IP_LIMIT);
    if (!rl.ok) {
      const seconds = Math.ceil(rl.retryAfterMs / 1000);
      throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
    }

    const raw = await readJsonObject(request, 4096);
    const { email, password } = customerLoginSchema.parse(raw);
    // Present only from a mobile client — see customerSignInResponse.
    const device = raw.device ? deviceSchema.parse(raw.device) : undefined;

    let customer;
    try {
      customer = await customerPassword.loginWithPassword(email, password, ip);
    } catch (err) {
      // Charge the per-account budget for any failure, then rethrow untouched —
      // the service already chose the message, and the "verify your email" case
      // must reach the UI intact so it can offer to resend the link.
      const acct = await rateLimit(`customer-login:acct:${email}`, ACCOUNT_FAILURE_LIMIT);
      if (!acct.ok) {
        const minutes = Math.ceil(acct.retryAfterMs / 60_000);
        await audit.recordAuth({
          action: "auth.login.throttled",
          email,
          ip,
          meta: { scope: "customer-account" },
        });
        throw new RateLimitError(`Too many failed attempts. Try again in ${minutes}m.`);
      }
      throw err;
    }

    return customerSignInResponse(customer, "returning", device);
  }),
);
