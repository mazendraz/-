import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import * as customerPassword from "@/lib/services/customerPassword.service";

export const dynamic = "force-dynamic";

// Same shape as registration's cap: tight enough to blunt using this as a mail
// relay or an enumeration oracle, generous enough that a real customer trying
// twice never hits it.
const RATE_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

// POST /api/v1/auth/customer/forgot-password → { ok: true }, always.
//
// Never reveals whether the address exists, is Google-only, or deactivated —
// requestPasswordReset silently no-ops for all three, and the response here is
// identical either way. The UI always shows the same "check your inbox" copy.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-forgot-password:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const minutes = Math.ceil(rl.retryAfterMs / 60_000);
      throw new RateLimitError(`Too many attempts. Try again in ${minutes}m.`);
    }

    const { email } = forgotPasswordSchema.parse(await readJsonObject(request, 4096));
    await customerPassword.requestPasswordReset(email);

    return ok({ ok: true });
  }),
);
