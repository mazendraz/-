import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { deviceSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { customerSignInResponse } from "@/lib/utils/customerSignIn";
import * as customerPassword from "@/lib/services/customerPassword.service";

export const dynamic = "force-dynamic";

// The token is 32 bytes of CSPRNG output — this isn't what stops guessing, it
// stops someone burning the endpoint (and its db lookup) in a loop. Same cap
// as /auth/customer/verify.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// POST /api/v1/auth/customer/reset-password → { token, customer, outcome: "returning" }
//
// Signs them in on success, same reasoning as /verify: the link came from the
// inbox they're proving they control, which is the evidence a login would ask
// for anyway. Every other session on the account is revoked first — see
// resetPassword's own comment.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-reset-password:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const seconds = Math.ceil(rl.retryAfterMs / 1000);
      throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
    }

    const raw = await readJsonObject(request, 4096);
    const { token, password } = resetPasswordSchema.parse(raw);
    // Present only from a mobile client — see customerSignInResponse.
    const device = raw.device ? deviceSchema.parse(raw.device) : undefined;

    const customer = await customerPassword.resetPassword(token, password, ip);
    return customerSignInResponse(customer, "returning", device);
  }),
);
