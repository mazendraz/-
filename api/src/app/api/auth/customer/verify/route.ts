import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { deviceSchema, verifyEmailSchema } from "@/lib/validation/auth";
import { customerSignInResponse } from "@/lib/utils/customerSignIn";
import * as customerPassword from "@/lib/services/customerPassword.service";

export const dynamic = "force-dynamic";

// The token is 32 bytes of CSPRNG output, so this is not what stops guessing —
// it stops someone burning the endpoint (and its database lookup) in a loop.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// POST /api/v1/auth/customer/verify → { token, customer, outcome: "created" }
//
// Signs them in on success. The link they just clicked came from the inbox they
// are proving they control, which is the same evidence a password login
// produces — making them type the password they set ninety seconds ago adds a
// step and no security.
//
// `outcome: "created"` because from the customer's side this IS the moment the
// account starts existing, and the apps branch their first screen on that.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-verify:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const seconds = Math.ceil(rl.retryAfterMs / 1000);
      throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
    }

    const raw = await readJsonObject(request, 4096);
    const { token: verifyToken } = verifyEmailSchema.parse(raw);
    // Present only from a mobile client — see customerSignInResponse.
    const device = raw.device ? deviceSchema.parse(raw.device) : undefined;

    const customer = await customerPassword.verifyEmail(verifyToken, ip);
    return customerSignInResponse(customer, "created", device);
  }),
);
