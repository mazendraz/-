import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { trackLeadSchema } from "@/lib/validation/leads";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// Public lookup — rate-limited per IP to blunt refNumber/phone guessing.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// GET /api/leads/track?ref=AA-…&phone=… → the customer's own ApiLead (status etc).
// Gated by ref + matching phone; both a bad ref and a wrong phone return 404.
export const GET = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`leads-track:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const { ref, phone } = trackLeadSchema.parse({
    ref: request.nextUrl.searchParams.get("ref"),
    phone: request.nextUrl.searchParams.get("phone"),
  });

  return ok(await leadsService.trackByRefAndPhone(ref, phone));
});
