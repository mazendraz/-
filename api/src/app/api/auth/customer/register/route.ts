import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { customerRegisterSchema } from "@/lib/validation/auth";
import * as customerPassword from "@/lib/services/customerPassword.service";

export const dynamic = "force-dynamic";

// Tight per-IP cap. Registration is the enumeration surface — the response
// necessarily differs between a free address and a taken one — and it also
// sends mail, so an unbounded endpoint is both a probe and an outbound spam
// relay pointed at addresses the attacker chooses.
const RATE_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

// POST /api/v1/auth/customer/register → { verificationSent: true }
//
// Returns NO session. The account exists but cannot sign in until the address is
// verified — that is the rule that stops someone registering an address they
// don't own and inheriting the real owner's account when they later use Google.
export const POST = withErrors(
  withMaintenance(async (request: NextRequest) => {
    const ip = clientIp(request);

    const rl = await rateLimit(`customer-register:${ip}`, RATE_LIMIT);
    if (!rl.ok) {
      const minutes = Math.ceil(rl.retryAfterMs / 60_000);
      throw new RateLimitError(`Too many attempts. Try again in ${minutes}m.`);
    }

    const payload = customerRegisterSchema.parse(await readJsonObject(request, 4096));
    const result = await customerPassword.register(payload, ip);
    return ok(result, 201);
  }),
);
