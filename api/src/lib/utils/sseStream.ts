/**
 * Server-Sent Events plumbing, shared by the live endpoints.
 *
 * SSE rather than WebSockets: the traffic is one-directional (the server tells
 * a client something changed; the client refetches over the normal API), it is
 * plain HTTP so it inherits the existing auth, CORS and proxy setup unchanged,
 * and browsers reconnect on their own. A WebSocket would add a second protocol
 * and a second authorization path for no capability we need.
 */
import {
  subscribe,
  type RealtimeEvent,
} from "@/lib/services/realtime.service";
import { RateLimitError } from "@/lib/utils/errors";

/**
 * How often to send a comment line down an idle connection.
 *
 * Not optional. Caddy, and every other reverse proxy, will close a connection
 * that has been silent long enough — and a chat that is quiet for two minutes
 * is the normal case, not an edge one. The heartbeat also lets the SERVER
 * notice a client that vanished without closing cleanly (a phone that lost
 * signal), because the write fails.
 */
const HEARTBEAT_MS = 25_000;

/**
 * How many streams one CALLER may hold open on one channel at a time.
 *
 * A held-open connection is not free: it pins a ReadableStream, a heartbeat
 * interval and a listener in the hub for as long as it lasts, on a single PM2
 * fork. Nothing capped that, so one account could open them without limit and
 * exhaust the process. The mobile client is well behaved about this now (it
 * multiplexes ONE connection across every component that asks — see
 * liveEvents.ts), but a server must not depend on a client choosing to be
 * polite: the client is the thing an attacker replaces.
 *
 * Sized for the legitimate worst case with room over it: a person with the site
 * open in a few browser tabs AND the app in the foreground. Past that, the
 * caller is told to slow down rather than silently served a connection that
 * competes with their own.
 */
const MAX_STREAMS_PER_CHANNEL = 8;

/**
 * One channel to subscribe to, with the key its connection is COUNTED
 * against for the cap above.
 *
 * `capKey` defaults to `channel` (a plain string channel behaves exactly as
 * before — one shared budget for everyone on it), which is the right shape
 * for `customer:<id>` and `company:<id>`: the channel string is already
 * per-owner, so counting by channel already means "per caller".
 *
 * `admins` breaks that assumption — every admin subscribes to the SAME
 * channel so every admin's connections shared one budget of 8 (see
 * docs/architecture/business-app/phase-4-realtime-push.md's B3, and
 * provider/stream/route.ts, the caller that sets this). Passing
 * `capKey: "admins:" + user.id` there keeps the cap PER ADMIN while every
 * admin still receives every event published to the real `admins` channel —
 * the cap and the pub/sub key are deliberately decoupled here.
 */
export interface SseChannel {
  channel: string;
  capKey?: string;
}

type ChannelInput = string | SseChannel;

function normalize(input: ChannelInput): Required<SseChannel> {
  if (typeof input === "string") return { channel: input, capKey: input };
  return { channel: input.channel, capKey: input.capKey ?? input.channel };
}

/**
 * Live connection counts, by capKey — separate from realtime.service's own
 * per-CHANNEL listener map (that one exists to fan events out; this one
 * exists only to enforce the cap, and the two are keyed differently
 * whenever `capKey` diverges from `channel`, see SseChannel's own comment).
 */
const connectionCounts = new Map<string, number>();

function increment(capKey: string): void {
  connectionCounts.set(capKey, (connectionCounts.get(capKey) ?? 0) + 1);
}

function decrement(capKey: string): void {
  const next = (connectionCounts.get(capKey) ?? 1) - 1;
  if (next <= 0) connectionCounts.delete(capKey);
  else connectionCounts.set(capKey, next);
}

/** Exposed for tests and for a future health/metrics endpoint — mirrors
 *  realtime.service's own subscriberCount() shape. */
export function sseConnectionCount(capKey: string): number {
  return connectionCounts.get(capKey) ?? 0;
}

/**
 * Open an SSE response subscribed to `channels`.
 *
 * The stream closes when the client disconnects — `request.signal` fires on
 * abort, which is the only reliable signal for it. Without unsubscribing there,
 * every navigation would leak a listener and the hub would grow forever.
 */
export function sseResponse(request: Request, channels: ChannelInput[]): Response {
  const normalized = channels.map(normalize);

  // Checked BEFORE the stream is constructed, so an over-limit caller costs a
  // map lookup rather than a subscription that has to be torn down again.
  const over = normalized.find((c) => sseConnectionCount(c.capKey) >= MAX_STREAMS_PER_CHANNEL);
  if (over) {
    throw new RateLimitError("Too many open connections. Close a tab and try again.");
  }

  normalized.forEach((c) => increment(c.capKey));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client went away between the abort firing and this write.
          closed = true;
        }
      };

      const onEvent = (event: RealtimeEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribers = normalized.map((c) => subscribe(c.channel, onEvent));

      // An immediate comment flushes headers, so the client's `onopen` fires
      // now rather than whenever the first real event happens to arrive.
      send(": connected\n\n");

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribers.forEach((off) => off());
        normalized.forEach((c) => decrement(c.capKey));
        try {
          controller.close();
        } catch {
          /* already closed by the runtime */
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform matters as much as no-cache: a proxy that buffers or
      // gzips this stream defeats the entire point by holding events until the
      // buffer fills.
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      // Nginx-family proxies buffer by default; this is the documented opt-out.
      "X-Accel-Buffering": "no",
    },
  });
}
