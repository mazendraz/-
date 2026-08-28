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
  listenerCount,
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
 * How many streams one channel — i.e. one customer, or one company — may hold
 * open at a time.
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
 * Open an SSE response subscribed to `channels`.
 *
 * The stream closes when the client disconnects — `request.signal` fires on
 * abort, which is the only reliable signal for it. Without unsubscribing there,
 * every navigation would leak a listener and the hub would grow forever.
 */
export function sseResponse(request: Request, channels: string[]): Response {
  // Checked BEFORE the stream is constructed, so an over-limit caller costs a
  // map lookup rather than a subscription that has to be torn down again.
  const over = channels.find((c) => listenerCount(c) >= MAX_STREAMS_PER_CHANNEL);
  if (over) {
    throw new RateLimitError("Too many open connections. Close a tab and try again.");
  }

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

      const unsubscribers = channels.map((c) => subscribe(c, onEvent));

      // An immediate comment flushes headers, so the client's `onopen` fires
      // now rather than whenever the first real event happens to arrive.
      send(": connected\n\n");

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribers.forEach((off) => off());
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
