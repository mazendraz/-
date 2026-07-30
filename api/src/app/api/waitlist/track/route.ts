import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { trackWaitlistSchema } from "@/lib/validation/availability";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

// Public lookup — rate-limited per IP to blunt id/phone guessing.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

// GET /api/waitlist/track?id=…&phone=… → the customer's own ApiWaitlistEntry.
// Gated by id + matching phone; both a bad id and a wrong phone return 404.
export const GET = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`waitlist-track:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const sp = request.nextUrl.searchParams;
  const { id, phone } = trackWaitlistSchema.parse({
    id: sp.get("id") ?? undefined,
    phone: sp.get("phone") ?? undefined,
  });

  return ok(await waitlistService.trackByIdAndPhone(id, phone));
});
