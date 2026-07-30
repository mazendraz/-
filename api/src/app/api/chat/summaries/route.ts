import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { resolveCustomerLeads, MAX_CLAIMS, type LeadClaim } from "@/lib/middleware/customerGuard";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

// The list view is opened far less often than a thread is polled, so this is
// tighter than the per-thread poll limit.
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * POST /api/chat/summaries → one line per thread this customer owns.
 *
 * ── Why POST, and why a batch ────────────────────────────────────────────────
 * POST because the body carries a LIST OF SECRETS. The whole reason the single
 * thread endpoint takes its token in a header is to keep it out of access logs;
 * putting several of them in a query string would undo that at N times the rate.
 *
 * A batch because the alternative — opening each thread to build the list —
 * marks every one of them as read. The unread badges would be cleared by the act
 * of rendering the list that displays them.
 *
 * Returns ONLY the threads whose secret verified. A stale reference in this
 * browser's storage is dropped from the result, not an error: it must not blank
 * out the customer's other conversations.
 */
export const POST = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`chat:summaries:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) throw new RateLimitError("Too many requests. Please slow down.");

  const raw = await readJsonObject(request);
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new ValidationError("`items` must be an array.");
  if (items.length > MAX_CLAIMS) {
    throw new ValidationError(`At most ${MAX_CLAIMS} requests can be looked up at once.`);
  }

  const claims: LeadClaim[] = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { ref, token, phone } = item as Record<string, unknown>;
    if (typeof ref !== "string" || !ref.trim()) return [];
    return [{
      ref,
      token: typeof token === "string" ? token : undefined,
      phone: typeof phone === "string" ? phone : undefined,
    }];
  });

  const leads = await resolveCustomerLeads(claims);
  const summaries = await chat.getSummaries(leads);
  return ok(summaries, 200, { "Cache-Control": "no-store" });
});
