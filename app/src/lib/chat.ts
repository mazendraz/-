// Chat — one thread per request, shared by the customer, the provider and admins.
//
// The customer has no account: their credential is the request's reference
// number plus its tracking token. The token travels in the `X-Lead-Token`
// HEADER, never the query string — a thread that polls every few seconds would
// otherwise write that secret into the access log hundreds of times per
// conversation.
import { useEffect, useState } from "react";
import { apiFetch, apiGet, apiPost, apiPatch, isApiConfigured } from "./api";

export type MessageSender = "CUSTOMER" | "PROVIDER" | "ADMIN";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  body: string;
  attachment: string | null;
  /** Present only in the admin view. */
  hidden?: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  leadId: string;
  companyId: string;
  refNumber?: string;
  companyName?: string;
  customerName?: string;
  lastMessageAt: number | null;
  customerUnread: number;
  providerUnread: number;
  closed: boolean;
  createdAt: number;
}

export interface Thread {
  conversation: Conversation;
  messages: ChatMessage[];
}

// ── Customer (no account) ────────────────────────────────────────────────────

function leadHeaders(token?: string, phone?: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h["X-Lead-Token"] = token;
  // Legacy requests predate tracking tokens and fall back to a phone match —
  // also a header, for the same reason.
  else if (phone) h["X-Lead-Phone"] = phone;
  return h;
}

export function fetchCustomerThread(params: {
  ref: string; token?: string; phone?: string; after?: number;
}): Promise<Thread> {
  const q = new URLSearchParams({ ref: params.ref });
  if (params.after) q.set("after", String(params.after));
  return apiFetch<Thread>(`/chat?${q}`, { method: "GET" }, leadHeaders(params.token, params.phone));
}

export function sendCustomerMessage(params: {
  ref: string; token?: string; phone?: string; body: string;
}): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(
    `/chat?ref=${encodeURIComponent(params.ref)}`,
    { method: "POST", body: JSON.stringify({ body: params.body }) },
    leadHeaders(params.token, params.phone),
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function listProviderConversations(): Promise<Conversation[]> {
  return apiGet<Conversation[]>("/provider/chat");
}

export function fetchProviderThread(conversationId: string, after?: number): Promise<Thread> {
  return apiGet<Thread>(`/provider/chat/${conversationId}${after ? `?after=${after}` : ""}`);
}

export function sendProviderMessage(conversationId: string, body: string): Promise<ChatMessage> {
  return apiPost<ChatMessage>(`/provider/chat/${conversationId}`, { body });
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface ConversationPage {
  data: Conversation[];
  meta: { total: number; page: number; pageSize: number };
}

export function listAdminConversations(
  params: {
    q?: string; companyId?: string; page?: number; pageSize?: number;
    /** Only threads a customer is still waiting on (providerUnread > 0). */
    unreadOnly?: boolean;
  } = {},
): Promise<ConversationPage> {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.companyId) q.set("companyId", params.companyId);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.unreadOnly) q.set("unread", "1");
  const qs = q.toString();
  return apiGet<ConversationPage>(`/admin/chat${qs ? `?${qs}` : ""}`);
}

/**
 * Badge count for the admin's Conversations tab.
 *
 * Counts threads where a customer has written and the company has not opened it
 * — the case an admin would want to notice without going looking. There is no
 * admin-side read marker to key off (and adding one would need a migration), so
 * this reuses the counter that already exists rather than inventing state that
 * would then have to be kept correct.
 *
 * pageSize=1 because only `meta.total` is read: a COUNT plus a single row.
 */
export function useUnreadChatCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isApiConfigured()) return;
    let alive = true;
    listAdminConversations({ unreadOnly: true, pageSize: 1 })
      .then((p) => { if (alive) setCount(p.meta.total); })
      .catch(() => { if (alive) setCount(0); }); // a badge must never break the nav
    return () => { alive = false; };
  }, []);
  return count;
}

export function fetchAdminThread(conversationId: string, after?: number): Promise<Thread> {
  return apiGet<Thread>(`/admin/chat/${conversationId}${after ? `?after=${after}` : ""}`);
}

export function sendAdminMessage(conversationId: string, body: string): Promise<ChatMessage> {
  return apiPost<ChatMessage>(`/admin/chat/${conversationId}`, { body });
}

export function setMessageHidden(conversationId: string, messageId: string, hidden: boolean): Promise<ChatMessage> {
  return apiPatch<ChatMessage>(`/admin/chat/${conversationId}/messages/${messageId}`, { hidden });
}

export function setConversationClosed(conversationId: string, closed: boolean): Promise<Conversation> {
  return apiPatch<Conversation>(`/admin/chat/${conversationId}`, { closed });
}

// ── Polling cadence ──────────────────────────────────────────────────────────
//
// The BACKOFF is what actually keeps this affordable, not the ETag: every open
// chat on one VPS polling at a fixed 8s adds up fast, and most open threads are
// idle most of the time. Fast while a conversation is live, slow when it goes
// quiet, instantly fast again the moment anyone types.
export const POLL_ACTIVE_MS = 8_000;
export const POLL_IDLE_MS = 30_000;
/** Quiet for this long → drop to the idle cadence. */
export const POLL_IDLE_AFTER_MS = 120_000;

export function pollInterval(lastActivityAt: number, now = Date.now()): number {
  return now - lastActivityAt > POLL_IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
}

export function chatAvailable(): boolean {
  return isApiConfigured();
}
