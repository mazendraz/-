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

/**
 * Header the phone should arrive in, mirroring the chat gate's X-Lead-Token.
 *
 * ── Why it moved out of the query string ────────────────────────────────────
 * `?phone=` put a customer's real phone number — which is also the shared
 * secret for this entry — into the request LINE, where it lands in the reverse
 * proxy's access log, any intermediary's log, and every backup of both. That is
 * the precise exposure customerGuard.ts already refused to accept for the chat
 * token ("Two lines to get right while writing this file; a migration to fix
 * once it has shipped"), and there is no reason this endpoint should be the
 * exception.
 *
 * ── Why the query parameter is still accepted ───────────────────────────────
 * A deployed website build is still sending it (app/src/lib/availability.ts),
 * and the API deploys before the frontend does. Removing it in the same change
 * would break waiting-list tracking for the window between the two, and for any
 * already-open tab afterwards. The header wins when both are present; drop the
 * fallback once the frontend has shipped and the access log stops showing
 * `phone=` on this path.
 */
const WAITLIST_PHONE_HEADER = "x-waitlist-phone";

// GET /api/waitlist/track?id=… → the customer's own ApiWaitlistEntry.
// Gated by id + matching phone (X-Waitlist-Phone header, or the legacy ?phone=);
// both a bad id and a wrong phone return 404.
export const GET = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`waitlist-track:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
  }

  const sp = request.nextUrl.searchParams;
  const headerPhone = request.headers.get(WAITLIST_PHONE_HEADER)?.trim();
  const { id, phone } = trackWaitlistSchema.parse({
    id: sp.get("id") ?? undefined,
    phone: headerPhone || (sp.get("phone") ?? undefined),
  });

  return ok(await waitlistService.trackByIdAndPhone(id, phone));
});
