/**
 * Chat data access — provider-scoped calls only (see lib/leads.ts's identical
 * header comment on why: `providerOnly` is strict role equality, so an ADMIN
 * 403s on every one of these; the admin equivalents in phase 8 call
 * /admin/chat/* instead, on a different route prefix, from a different
 * lib module).
 */
import type { ApiConversation, ApiMessage, ApiPage } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

export interface ThreadResult {
  conversation: ApiConversation;
  messages: ApiMessage[];
}

/** GET /provider/chat — this company's threads, most recently active
 *  first, paged. */
export function fetchThreads(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ApiConversation>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return apiGet<ApiPage<ApiConversation>>(`/provider/chat${qs ? `?${qs}` : ""}`);
}

/**
 * GET /provider/chat/[conversationId] — a full fetch when `after` is
 * omitted, a delta otherwise.
 *
 * ⚠️ The `after` distinction is load-bearing on the SERVER, not just a
 * perf optimization: a full fetch (no `after`) marks the thread read; a
 * delta poll (`after` present) does not (see api's chat.service.ts route
 * comment: "A delta poll is not 'the provider read it' — only a full open
 * clears it."). Getting this backwards silently zeroes a genuine unread
 * count. Screen focus → full fetch. An SSE `message` event while already
 * open → delta fetch with the last message's timestamp.
 */
export function fetchThread(conversationId: string, after?: number): Promise<ThreadResult> {
  const qs = after ? `?after=${after}` : "";
  return apiGet<ThreadResult>(`/provider/chat/${conversationId}${qs}`);
}

/** POST /provider/chat/[conversationId] — send a message. HTML is stripped
 *  server-side; sender is set from the auth guard, never from the body. */
export function sendMessage(conversationId: string, body: string): Promise<ApiMessage> {
  return apiPost<ApiMessage>(`/provider/chat/${conversationId}`, { body });
}

/** GET /provider/leads/[id]/conversation — resolves the one conversation
 *  every lead already has (created eagerly at submission), so "message this
 *  customer" on the lead detail screen has somewhere to jump to without
 *  paging through the full threads list to find it. */
export function fetchConversationForLead(leadId: string): Promise<ApiConversation> {
  return apiGet<ApiConversation>(`/provider/leads/${leadId}/conversation`);
}
