import { useEffect, useRef, useState } from "react";
import { isApiConfigured } from "../lib/api";

/** What the server sends down the stream. Deliberately thin — see below. */
export interface LiveEvent {
  type: "message" | "lead" | "lead-status";
  leadId?: string;
  conversationId?: string;
  companyId?: string;
}

/**
 * Subscribe to the server's live event stream.
 *
 * Events carry IDs, never content: the handler's job is to refetch through the
 * normal endpoints, which already enforce who may read what. That means a bug
 * in this subscription can cause a spurious refresh, never a leak of somebody
 * else's message.
 *
 * `connected` is the point of the return value. Polling stays in place and is
 * only *slowed* while this is true — a stream that silently died would
 * otherwise leave the screen frozen with no fallback, and that failure is
 * invisible until someone complains a reply never arrived.
 */
export function useLiveEvents(
  path: string | null,
  onEvent: (event: LiveEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // Held in a ref so a caller passing an inline arrow doesn't tear the
  // connection down and rebuild it on every render.
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!path || !isApiConfigured() || typeof EventSource === "undefined") return;

    // withCredentials sends the httpOnly session cookie — the same credential
    // every other request uses. EventSource cannot set headers, which is
    // exactly why the stream endpoints authenticate by session and the legacy
    // token-gated chat keeps polling.
    const source = new EventSource(path, { withCredentials: true });

    source.onopen = () => setConnected(true);

    source.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as LiveEvent);
      } catch {
        // A malformed frame is not worth dropping the connection over.
      }
    };

    source.onerror = () => {
      // EventSource reconnects on its own; this only reflects the current state
      // so callers can fall back to polling in the meantime.
      setConnected(false);
    };

    return () => {
      setConnected(false);
      source.close();
    };
  }, [path]);

  return { connected };
}
