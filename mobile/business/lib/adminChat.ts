/**
 * Chat data access — admin-scoped calls only (see lib/chat.ts's identical
 * header comment on why this is a separate module: `adminOnly` is strict
 * role equality, so a PROVIDER 403s on every one of these).
 */
import type { ApiConversation, ApiMessage, ApiPage } from "@alassema/core";
import { apiGet, apiPatch, apiPost } from "@alassema/mobile-shared";

export interface ThreadResult {
  conversation: ApiConversation;
  messages: ApiMessage[];
}

/** GET /admin/chat — every company's threads, filterable by companyId and a
 *  free-text `q` matching a lead's ref number, a customer's name, or a
 *  company's name. */
export function fetchAdminThreads(query: { page?: number; pageSize?: number; companyId?: string; q?: string; unreadOnly?: boolean } = {}): Promise<ApiPage<ApiConversation>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.q) params.set("q", query.q);
  if (query.unreadOnly) params.set("unread", "1");
  const qs = params.toString();
  return apiGet<ApiPage<ApiConversation>>(`/admin/chat${qs ? `?${qs}` : ""}`);
}

/** GET /admin/chat/[conversationId] — the ONLY viewer that also gets hidden
 *  messages (see ApiMessage.hidden's own comment): moderation must not
 *  destroy the record of what was said. Same full/delta `after` contract as
 *  lib/chat.ts's fetchThread. */
export function fetchAdminThread(conversationId: string, after?: number): Promise<ThreadResult> {
  const qs = after ? `?after=${after}` : "";
  return apiGet<ThreadResult>(`/admin/chat/${conversationId}${qs}`);
}

/** POST /admin/chat/[conversationId] — sent as ADMIN so both sides see it
 *  came from Al Assema, not from the other party. */
export function sendAdminMessage(conversationId: string, body: string): Promise<ApiMessage> {
  return apiPost<ApiMessage>(`/admin/chat/${conversationId}`, { body });
}

/** PATCH /admin/chat/[conversationId] — close or reopen. A closed thread
 *  rejects new messages (server-enforced; see chat.service.ts postMessage). */
export function setThreadClosed(conversationId: string, closed: boolean): Promise<ApiConversation> {
  return apiPatch<ApiConversation>(`/admin/chat/${conversationId}`, { closed });
}

/**
 * PATCH /admin/chat/[conversationId]/messages/[messageId] — hides (or
 * unhides) one message. The route is a PATCH with a `{ hidden }` body, NOT a
 * DELETE: the message stays in the table and stays visible to admins, it
 * just stops reaching the customer and the provider. (The original
 * phase-8 plan doc described this as a DELETE — corrected there and here
 * after reading the actual route file.)
 */
export function setMessageHidden(conversationId: string, messageId: string, hidden: boolean): Promise<ApiMessage> {
  return apiPatch<ApiMessage>(`/admin/chat/${conversationId}/messages/${messageId}`, { hidden });
}

/**
 * Resolves the one conversation a lead already has, for an admin. There is
 * no admin equivalent of provider/leads/[id]/conversation (not in phase-8's
 * API table), so this reuses GET /admin/chat's own `q` search — which
 * explicitly matches a lead's ref number — instead of inventing a new route.
 * A ref number is unique per lead, so a `pageSize: 1` search on the exact
 * ref can only ever resolve to that lead's own thread.
 */
export async function fetchAdminConversationForLead(refNumber: string): Promise<ApiConversation | null> {
  const result = await fetchAdminThreads({ q: refNumber, pageSize: 1 });
  return result.data[0] ?? null;
}
