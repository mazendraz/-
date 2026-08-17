import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { NotFoundError, RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { stripHtml } from "@/lib/utils/sanitize";
import { prisma } from "@/lib/prisma";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Same shape as the legacy token-gated /api/chat: a chat that polls is the
// endpoint a customer hits most, so it is also the cheapest to turn into a
// load generator if left unbounded.
const POLL_LIMIT = { limit: 40, windowMs: 60_000 };
const SEND_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * Resolve `id` to a lead the CALLER owns — the account-based counterpart of
 * customerGuard.ts's resolveCustomerLead (ref + X-Lead-Token). Both exist
 * because GET /customer/leads deliberately never returns trackingToken (the
 * account IS the credential for a signed-in customer — see that route's
 * comment), so the token-gated path is structurally unreachable from here.
 *
 * A missing lead and one owned by someone else get the SAME 404 — never let a
 * caller distinguish "doesn't exist" from "not yours" by probing ids.
 */
async function resolveOwnedLead(id: string, customerId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, companyId: true, customerId: true },
  });
  if (!lead || lead.customerId !== customerId) throw new NotFoundError("Request");
  return lead;
}

// GET /api/v1/customer/leads/[id]/messages?after= — this lead's thread.
export const GET = withErrors(
  withCustomerAuth(async (request: NextRequest, context: Ctx, customer) => {
    const rl = await rateLimit(`customer-chat:get:${clientIp(request)}`, POLL_LIMIT);
    if (!rl.ok) throw new RateLimitError("Too many requests. Please slow down.");

    const { id } = await context.params;
    const lead = await resolveOwnedLead(id, customer.id);
    const conversation = await chat.getOrCreateConversation(lead.id);

    const afterRaw = request.nextUrl.searchParams.get("after");
    const after = afterRaw && /^\d+$/.test(afterRaw) ? Number(afterRaw) : undefined;

    const thread = await chat.getThread(conversation.id, "customer", after);
    // Only a full read (no `after`) means the customer actually saw the thread;
    // a delta poll must not silently clear the unread badge.
    if (!after) await chat.markRead(conversation.id, "customer");

    return ok(thread, 200, { "Cache-Control": "no-store" });
  }),
);

// POST /api/v1/customer/leads/[id]/messages { body } — send.
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, context: Ctx, customer) => {
      const rl = await rateLimit(`customer-chat:send:${clientIp(request)}`, SEND_LIMIT);
      if (!rl.ok) throw new RateLimitError("Too many requests. Please slow down.");

      const { id } = await context.params;
      const lead = await resolveOwnedLead(id, customer.id);
      const conversation = await chat.getOrCreateConversation(lead.id);

      const { body } = await readJsonObject(request);
      const message = await chat.postMessage({
        conversationId: conversation.id,
        sender: "CUSTOMER",
        // No senderUserId: that field identifies which STAFF member (admin)
        // typed an ADMIN-sender message — meaningless for a customer.
        body: stripHtml(typeof body === "string" ? body : ""),
      });

      return ok(message, 201);
    }),
  ),
);
