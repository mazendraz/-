/**
 * Live events from /customer/stream — the mobile counterpart of the website's
 * useLiveEvents.ts.
 *
 * ── Why this is hand-parsed instead of `new EventSource(...)` ────────────────
 * The website's hook uses the browser's native EventSource. React Native has
 * no such global — it isn't part of the JS engine and isn't polyfilled by
 * React Native core. What ships instead is `expo/fetch`, whose Response
 * exposes a real streaming `body` (a ReadableStream, confirmed against the
 * package actually installed here — `node_modules/expo/src/winter/fetch`, not
 * just the docs page). That's enough to read Server-Sent Events by hand: SSE's
 * wire format is `data: <json>\n\n`, nothing more, so there's no protocol
 * complexity a library would be earning its keep by hiding.
 *
 * ── Why this is worth the extra code over polling ─────────────────────────────
 * Same case the website's version documents: a held-open connection delivers a
 * reply in under a second and costs nothing while idle, where polling is a
 * request every N seconds against the radio and stops entirely the moment the
 * app is backgrounded — exactly when a provider's reply arrives. See api's
 * realtime.service.ts for the server side of this (in-process pub/sub, single
 * PM2 instance).
 */
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { getAccessToken } from "./session";
import { streamUrl } from "./api";

export interface LiveEvent {
  type: "message" | "lead" | "lead-status";
  leadId?: string;
  conversationId?: string;
  companyId?: string;
}

/**
 * Subscribe to the customer's live event stream while the app is foregrounded.
 * Reconnects on returning to foreground; disconnects on backgrounding rather
 * than holding a socket the OS is going to suspend anyway.
 *
 * `connected` mirrors the website's hook: polling elsewhere is only ever
 * SLOWED when this is true, never switched off — a stream that silently died
 * must not freeze the screen with no fallback (see requests.tsx's use of it).
 */
export function useLiveEvents(onEvent: (event: LiveEvent) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const url = streamUrl("/customer/stream");
    if (!url) return;

    // Bumped on every connect/disconnect so a stale attempt's callbacks
    // (arriving after a newer attempt has already started, or after unmount)
    // can tell they're stale and no-op instead of clobbering current state.
    let generation = 0;
    let controller: AbortController | null = null;

    async function connect() {
      const myGeneration = ++generation;
      controller = new AbortController();

      const token = await getAccessToken();
      if (!token || myGeneration !== generation) return;

      try {
        const res = await expoFetch(url!, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body || myGeneration !== generation) return;

        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (myGeneration === generation) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line. Only fully-received
          // frames are parsed; a frame split across two chunks stays in the
          // buffer until the rest arrives.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue; // a ":ping"/":connected" comment line
            try {
              handler.current(JSON.parse(dataLine.slice(5).trim()) as LiveEvent);
            } catch {
              /* a malformed frame is not worth dropping the connection over */
            }
          }
        }
      } catch (err) {
        // AbortError is US disconnecting (backgrounding, or unmount) — not a
        // failure to report.
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.warn("Live stream error:", err);
        }
      } finally {
        if (myGeneration === generation) setConnected(false);
      }
    }

    function disconnect() {
      generation++; // invalidates the in-flight attempt's checks above
      controller?.abort();
      controller = null;
    }

    // A backgrounded app has no business holding a streaming connection open
    // — the OS suspends the socket regardless, so keeping it "open" fools
    // nothing while draining battery for a stream nobody is reading.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
      else disconnect();
    });

    if (AppState.currentState === "active") connect();

    return () => {
      disconnect();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected };
}
