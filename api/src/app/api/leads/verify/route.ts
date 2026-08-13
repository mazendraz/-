import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { verifyLeadSchema } from "@/lib/validation/leadCompletion";
import * as leadCompletionService from "@/lib/services/leadCompletion.service";

export const dynamic = "force-dynamic";

// Same trust model as /leads/track and /reviews: no account, gated by ref +
// tracking token (or phone). Rate-limited per IP against token brute-forcing.
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// POST /api/leads/verify → ApiLead. Client confirms or disputes the provider's
// reported final amount for their own lead.
export const POST = withErrors(withMaintenance(async (request: NextRequest) => {
  const rl = await rateLimit(`leads-verify:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const raw = await readJsonObject(request);
  const payload = verifyLeadSchema.parse(raw);
  return ok(await leadCompletionService.verify(payload));
}));
