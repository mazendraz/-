import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { resolveCustomerLead } from "@/lib/middleware/customerGuard";
import { stripHtml } from "@/lib/utils/sanitize";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

// The GET is rate-limited too, not just the POST. A chat that polls is the one
// endpoint a customer hits repeatedly by design, so it is also the easiest to
// turn into a cheap load generator.
const POLL_LIMIT = { limit: 40, windowMs: 60_000 };
const SEND_LIMIT = { limit: 20, windowMs: 60_000 };

// GET /api/chat?ref=&after=  ·  token in the X-Lead-Token header
//
// `after` makes this a delta poll: the client sends the timestamp of the newest
// message it holds and gets only what is newer.
export const GET = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`chat:get:${clientIp(request)}`, POLL_LIMIT);
  if (!rl.ok) throw new RateLimitError("Too many requests. Please slow down.");

  const lead = await resolveCustomerLead(request);
  const conversation = await chat.getOrCreateConversation(lead.id);

  const afterRaw = new URL(request.url).searchParams.get("after");
  const after = afterRaw && /^\d+$/.test(afterRaw) ? Number(afterRaw) : undefined;

  const thread = await chat.getThread(conversation.id, "customer", after);
  // Only a full read (no `after`) means the customer has actually seen the
  // thread; a delta poll must not silently clear the badge.
  if (!after) await chat.markRead(conversation.id, "customer");

  return ok(thread, 200, { "Cache-Control": "no-store" });
});

// POST /api/chat?ref=  ·  token in the X-Lead-Token header
export const POST = withErrors(withMaintenance(async (request: NextRequest) => {
  const rl = await rateLimit(`chat:post:${clientIp(request)}`, SEND_LIMIT);
  if (!rl.ok) throw new RateLimitError("You're sending messages too quickly.");

  const lead = await resolveCustomerLead(request);
  const conversation = await chat.getOrCreateConversation(lead.id);

  const raw = await readJsonObject(request);
  const body = stripHtml(String((raw as { body?: unknown }).body ?? ""));

  const message = await chat.postMessage({
    conversationId: conversation.id,
    sender: "CUSTOMER",
    body,
  });

  // Notifying the provider is deliberately debounced: three quick messages are
  // one thought, not three alerts.
  if (chat.shouldNotify(conversation.id)) {
    // Wired to notifications.service when provider push/telegram for chat is
    // switched on; the debounce gate belongs here either way.
  }

  return ok(message, 201, { "Cache-Control": "no-store" });
}));
