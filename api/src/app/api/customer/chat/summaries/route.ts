import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { prisma } from "@/lib/prisma";
import * as chat from "@/lib/services/chat.service";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Matches the per-thread poll allowance — the list is legitimately requested
// from more than one screen (the messages tab and any unread badge).
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

/**
 * GET /api/v1/customer/chat/summaries — one line per request this account owns
 * that has (or can open) a thread.
 *
 * The account-based counterpart of POST /api/chat/summaries, which takes a
 * client-supplied batch of {ref, token} claims because an anonymous customer's
 * only proof of ownership IS that list. A signed-in customer needs no such
 * batch — `customerId` on Lead already says which ones are theirs — so this is
 * a GET with no body, and it can never be handed a claim for a lead it doesn't
 * actually own the way a forged batch could be attempted against the legacy
 * route.
 */
export const GET = withErrors(
  withCustomerAuth(async (request: NextRequest, _context, customer) => {
    const rl = await rateLimit(`customer-chat:summaries:${clientIp(request)}`, RATE_LIMIT);
    if (!rl.ok) throw new RateLimitError("Too many requests. Please slow down.");

    const leads = await prisma.lead.findMany({
      where: { customerId: customer.id },
      select: { id: true, refNumber: true, companyId: true },
    });

    return ok(await chat.getSummaries(leads), 200, { "Cache-Control": "no-store" });
  }),
);
