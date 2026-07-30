// Chat — one thread per request, shared by the customer, the provider and admins.
//
// The customer has no account: their credential is the request's reference
// number plus its tracking token. The token travels in the `X-Lead-Token`
// HEADER, never the query string — a thread that polls every few seconds would
// otherwise write that secret into the access log hundreds of times per
// conversation.
import { useCallback, useEffect, useState } from "react";
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

/** One line per thread, for the messages list. */
export interface ThreadSummary {
  refNumber: string;
  /** Null until the customer or the company sends the first message. */
  conversationId: string | null;
  companyName: string;
  companySlug: string;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageSender: MessageSender | null;
  unread: number;
  closed: boolean;
}

export interface LeadClaim {
  ref: string;
  token?: string;
  phone?: string;
}

/**
 * Summaries for every thread this browser holds a reference to.
 *
 * POST because the body carries a list of tracking tokens — the same reason the
 * single-thread endpoint takes its token in a header rather than the query
 * string. One round trip instead of N, and crucially it does NOT mark anything
 * read, so the unread counts survive being listed.
 */
export function fetchCustomerSummaries(claims: LeadClaim[]): Promise<ThreadSummary[]> {
  return apiPost<ThreadSummary[]>("/chat/summaries", { items: claims });
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

// ── Customer thread list ─────────────────────────────────────────────────────

export interface CustomerThreadsResult {
  threads: ThreadSummary[];
  loading: boolean;
  /** Translation key, resolved by the caller so it follows the language toggle. */
  errorKey: "messages_err_load" | null;
  totalUnread: number;
  reload: () => void;
}

// ── Shared summary store ─────────────────────────────────────────────────────
//
// ONE fetch shared by every component that wants this data, not one per hook.
//
// Both PersonalTabs (for its unread badge) and the Messages page ask for the
// same summaries, and React's StrictMode double-invokes effects in development —
// so the naive version fired FOUR identical requests per page view and tripped
// the endpoint's own rate limit after a few navigations. The page then showed a
// hard error for what was really "we asked too many times".
//
// A short TTL plus in-flight de-duplication fixes the cause rather than raising
// the ceiling, and has the side benefit that the badge is already populated when
// the user opens the page.
const SUMMARY_TTL_MS = 15_000;

let summaryCache: { key: string; at: number; rows: ThreadSummary[] } | null = null;
let summaryInFlight: { key: string; promise: Promise<ThreadSummary[]> } | null = null;
const summaryListeners = new Set<() => void>();

function notifySummaryListeners(): void {
  for (const fn of summaryListeners) fn();
}

/** Drop the cache so the next read refetches. */
export function invalidateThreadSummaries(): void {
  summaryCache = null;
}

function loadSummaries(claims: LeadClaim[], force: boolean): Promise<ThreadSummary[]> {
  const key = JSON.stringify(claims);
  const fresh = summaryCache
    && summaryCache.key === key
    && Date.now() - summaryCache.at < SUMMARY_TTL_MS;
  if (fresh && !force) return Promise.resolve(summaryCache!.rows);

  // Join the request already in the air rather than starting a second one.
  if (summaryInFlight && summaryInFlight.key === key) return summaryInFlight.promise;

  const promise = fetchCustomerSummaries(claims)
    .then((rows) => {
      summaryCache = { key, at: Date.now(), rows };
      notifySummaryListeners();
      return rows;
    })
    .finally(() => {
      if (summaryInFlight?.promise === promise) summaryInFlight = null;
    });

  summaryInFlight = { key, promise };
  return promise;
}

/**
 * Every conversation this device can prove it owns.
 *
 * The claims come from the leads in localStorage, so this is exactly the set of
 * requests submitted from this browser — the same basis "My Requests" uses. A
 * customer has no account, so there is nothing else to key on.
 */
export function useCustomerThreads(claims: LeadClaim[]): CustomerThreadsResult {
  // Serialized: `claims` is rebuilt on every render of the caller, so depending
  // on the array itself would refetch in a loop.
  const claimsKey = JSON.stringify(claims);
  const cached = summaryCache?.key === claimsKey ? summaryCache.rows : null;

  const [threads, setThreads] = useState<ThreadSummary[]>(cached ?? []);
  const [loading, setLoading] = useState(
    isApiConfigured() && claims.length > 0 && cached === null,
  );
  const [errorKey, setErrorKey] = useState<"messages_err_load" | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    invalidateThreadSummaries();
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const parsed = JSON.parse(claimsKey) as LeadClaim[];
    if (!isApiConfigured() || parsed.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }
    let alive = true;
    // Another component's fetch landing updates this one too.
    const onShared = () => {
      if (alive && summaryCache?.key === claimsKey) setThreads(summaryCache.rows);
    };
    summaryListeners.add(onShared);

    setLoading(true);
    loadSummaries(parsed, tick > 0)
      .then((rows) => { if (alive) { setThreads(rows); setErrorKey(null); } })
      .catch(() => {
        // Keep whatever is already on screen: a failed REFRESH should not wipe
        // conversations the customer can still read.
        if (alive && !summaryCache) setErrorKey("messages_err_load");
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; summaryListeners.delete(onShared); };
  }, [claimsKey, tick]);

  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0);
  return { threads, loading, errorKey, totalUnread, reload };
}
