/**
 * Server-Sent Events plumbing, shared by the live endpoints.
 *
 * SSE rather than WebSockets: the traffic is one-directional (the server tells
 * a client something changed; the client refetches over the normal API), it is
 * plain HTTP so it inherits the existing auth, CORS and proxy setup unchanged,
 * and browsers reconnect on their own. A WebSocket would add a second protocol
 * and a second authorization path for no capability we need.
 */
import { subscribe, type RealtimeEvent } from "@/lib/services/realtime.service";

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
 * Open an SSE response subscribed to `channels`.
 *
 * The stream closes when the client disconnects — `request.signal` fires on
 * abort, which is the only reliable signal for it. Without unsubscribing there,
 * every navigation would leak a listener and the hub would grow forever.
 */
export function sseResponse(request: Request, channels: string[]): Response {
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
