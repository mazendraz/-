/**
 * In-process publish/subscribe behind the live (SSE) endpoints.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * The chat polls every 8 seconds while a conversation is active. In a browser
 * tab that is merely wasteful; on a phone it is a request every 8 seconds
 * against the radio, and it stops entirely the moment the app is backgrounded —
 * which is exactly when a reply arrives. A held-open connection delivers in
 * under a second and costs nothing while idle.
 *
 * ── Why in-process, and where that stops working ─────────────────────────────
 * The backend runs as a SINGLE PM2 instance in fork mode, deliberately: the
 * rate limiter (middleware/rateLimit.ts) is in-memory and only correct with one
 * process. This hub inherits exactly that constraint and no new one — a
 * subscriber and the request that publishes to it are always in the same
 * process today.
 *
 * The day that stops being true, both this and the rate limiter need a shared
 * backend, and the answer is the same for both: Postgres LISTEN/NOTIFY, or the
 * Upstash Redis the rate limiter already anticipates. That is a deployment
 * change, not a rewrite of the callers — publish() and subscribe() are the whole
 * surface.
 *
 * ── Why not Supabase Realtime ────────────────────────────────────────────────
 * It was the original plan and it is a fine answer at scale, but it costs RLS
 * policies on three tables plus a publishable key shipped to every client — and
 * none of it can be exercised on a development database that is plain Postgres,
 * so it would ship unverified. This reuses the auth the API already enforces and
 * can be tested locally today.
 */

/** Everything a live subscriber can be told about. */
export type RealtimeEvent =
  | { type: "message"; leadId: string; conversationId: string }
  | { type: "lead"; leadId: string; companyId: string }
  | { type: "lead-status"; leadId: string };

type Listener = (event: RealtimeEvent) => void;

/**
 * channel → listeners.
 *
 * Channels are coarse on purpose: `customer:<id>` and `company:<id>`, not one
 * per conversation. A subscriber is told *something changed in your world* and
 * refetches; it is not sent the message body. That keeps authorization at the
 * fetch — which already enforces it — instead of duplicating it here, where
 * getting it wrong would mean pushing one person's messages to another.
 */
const channels = new Map<string, Set<Listener>>();

export function channelForCustomer(customerId: string): string {
  return `customer:${customerId}`;
}

export function channelForCompany(companyId: string): string {
  return `company:${companyId}`;
}

/** Admins see platform-wide activity. */
export const ADMIN_CHANNEL = "admins";

/** Register a listener. Returns the unsubscribe function. */
export function subscribe(channel: string, listener: Listener): () => void {
  let set = channels.get(channel);
  if (!set) {
    set = new Set();
    channels.set(channel, set);
  }
  set.add(listener);

  return () => {
    set!.delete(listener);
    // Drop the empty set rather than leaving it: without this the map grows by
    // one entry per customer who ever connected and never shrinks.
    if (set!.size === 0) channels.delete(channel);
  };
}

/**
 * Fan an event out to a channel's listeners.
 *
 * Never throws, and one listener throwing does not stop the others — a
 * subscriber whose connection died mid-write must not be able to prevent
 * everybody else from being notified. Callers are notification paths, and those
 * fail open here exactly as they do for email and push.
 */
export function publish(channel: string, event: RealtimeEvent): void {
  const set = channels.get(channel);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (err) {
      console.error(`[realtime] listener failed on ${channel}:`, err);
    }
  }
}

/** Publish the same event to several channels (both sides of a conversation). */
export function publishAll(channelList: string[], event: RealtimeEvent): void {
  for (const channel of new Set(channelList)) publish(channel, event);
}

/** How many streams are currently subscribed to one channel. Used by
 *  sseStream's per-channel connection cap — see MAX_STREAMS_PER_CHANNEL. */
export function listenerCount(channel: string): number {
  return channels.get(channel)?.size ?? 0;
}

/** Live listener count — for the health endpoint and for tests. */
export function subscriberCount(): number {
  let total = 0;
  for (const set of channels.values()) total += set.size;
  return total;
}
