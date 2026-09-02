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
/**
 * ── One connection per URL, however many callers ────────────────────────────
 *
 * This used to open `new EventSource(...)` inside the hook, so every mounted
 * caller held its own stream. That was fine while Messages was the only
 * subscriber; the moment RootLayout began subscribing too (to keep the
 * account's orders live app-wide) a customer sitting on Messages held TWO
 * connections to the same endpoint, doubling the server's open-connection
 * count for no extra information — both were delivering the same events.
 *
 * The mobile client solved this a while ago and its reasoning applies here
 * unchanged: one real connection, fanned out in-process to however many hooks
 * want it, opened on the first subscriber and closed after the last one goes.
 * Refcounted rather than left open, so signing out or navigating away actually
 * releases it.
 */
interface Shared {
  source: EventSource;
  handlers: Set<(event: LiveEvent) => void>;
  connectedListeners: Set<(connected: boolean) => void>;
  connected: boolean;
}

const shared = new Map<string, Shared>();

function acquire(path: string): Shared {
  const existing = shared.get(path);
  if (existing) return existing;

  // withCredentials sends the httpOnly session cookie — the same credential
  // every other request uses. EventSource cannot set headers, which is
  // exactly why the stream endpoints authenticate by session and the legacy
  // token-gated chat keeps polling.
  const source = new EventSource(path, { withCredentials: true });
  const entry: Shared = {
    source,
    handlers: new Set(),
    connectedListeners: new Set(),
    connected: false,
  };

  const setConnected = (next: boolean) => {
    entry.connected = next;
    entry.connectedListeners.forEach((l) => l(next));
  };

  source.onopen = () => setConnected(true);
  source.onmessage = (e) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(e.data) as LiveEvent;
    } catch {
      // A malformed frame is not worth dropping the connection over.
      return;
    }
    // A copy, so a handler that unsubscribes while reacting cannot mutate the
    // set being iterated.
    [...entry.handlers].forEach((h) => h(event));
  };
  source.onerror = () => {
    // EventSource reconnects on its own; this only reflects the current state
    // so callers can fall back to polling in the meantime.
    setConnected(false);
  };

  shared.set(path, entry);
  return entry;
}

function release(path: string): void {
  const entry = shared.get(path);
  if (!entry || entry.handlers.size > 0 || entry.connectedListeners.size > 0) return;
  entry.source.close();
  shared.delete(path);
}

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

    const entry = acquire(path);
    const forward = (event: LiveEvent) => handler.current(event);
    entry.handlers.add(forward);
    entry.connectedListeners.add(setConnected);
    setConnected(entry.connected);

    return () => {
      entry.handlers.delete(forward);
      entry.connectedListeners.delete(setConnected);
      setConnected(false);
      release(path);
    };
  }, [path]);

  return { connected };
}
