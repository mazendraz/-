/**
 * Live events from the server's SSE stream — shared by both mobile apps, and
 * the mobile counterpart of the website's useLiveEvents.ts.
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
 * app is backgrounded — exactly when a reply arrives. See api's
 * realtime.service.ts for the server side of this (in-process pub/sub, single
 * PM2 instance).
 *
 * ── Why this is ONE connection, not one per useLiveEvents() call ────────────
 * This used to open a fresh `expo/fetch` stream inside every component's own
 * useEffect in the client app, before this module was shared. Several call
 * sites mount it — the root layout, both list screens, a chat thread screen —
 * and expo-router keeps tab screens mounted once visited, so an account with a
 * list tab ever opened was holding 2–4 simultaneous SSE connections for the
 * rest of the session, against a server with no per-user connection cap on
 * the customer stream running as a single PM2 fork (the staff stream's
 * `admins` channel DOES cap — see api's sseStream.ts). All of it below module
 * scope now: one real connection, fanned out in-process to however many
 * components asked for events, the same way the SERVER's own
 * realtime.service.ts fans one event out to multiple listeners.
 *
 * ── Why this reconnects on its own now ───────────────────────────────────────
 * An earlier version only ever reconnected on a foreground TRANSITION
 * (backgrounded → active). A drop for any other reason — a proxy idle
 * timeout, a network blip, the API process restarting — ended the read loop,
 * set `connected` to false, and then nothing: the app stayed foregrounded, so
 * no foreground transition was coming to trigger a retry. An account could
 * sit with the app open indefinitely and never learn anything changed.
 * Losing and regaining the connection is a normal, not exceptional, outcome
 * of holding one open for an entire session — it needs its own retry loop,
 * not a retry loop borrowed from an unrelated lifecycle event.
 *
 * ── Who's signed in ────────────────────────────────────────────────────────
 * This module has no idea whether it's running in the customer client or the
 * staff Business App — it reads the signed-in subject id from session.ts's
 * useAuthSubject()/getAuthSubject(), which each app's own auth-state module
 * (customerAuth.ts / staffAuth.ts) keeps updated. See session.ts's own
 * comment on that pub/sub for why the dependency runs this direction.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { getConfig } from "./config";
import { getAccessToken, useAuthSubject } from "./session";
import { apiKeyHeader, isAbort, refreshAccessToken, streamUrl } from "./api";

export interface LiveEvent {
  /**
   * Server event types, plus ONE synthesised locally: `reconnect`.
   *
   * `reconnect` never comes down the wire. It is emitted here the moment a
   * stream is (re)established after having been down, and it means exactly
   * "you were disconnected — anything could have changed while you weren't
   * listening". SSE has no replay: a reconnect delivers what happens NEXT, not
   * what was missed, so a client that only reacts to real events sits on stale
   * data forever after one dropped connection. Verified on a device: with the
   * phone in airplane mode an order was moved to In Progress, and on
   * reconnecting the screen still showed the previous status.
   *
   * Every consumer already refetches through its authorized endpoint on any
   * event, so emitting this makes reconnection self-healing without a second
   * mechanism — and it covers the foreground case too, since returning to the
   * app reconnects.
   */
  type: "message" | "lead" | "lead-status" | "favorite" | "profile" | "reconnect";
  leadId?: string;
  conversationId?: string;
  companyId?: string;
}

// ── Module-level connection state ───────────────────────────────────────────
// A long-lived singleton by design, same lifetime as the app process — see
// the module comment above for why this replaced one connection per hook
// call.
let currentSubjectId: string | null = null;
let generation = 0;
let controller: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffAttempt = 0;
let appStateSubscribed = false;

let sharedConnected = false;
const eventListeners = new Set<(event: LiveEvent) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();

// Capped exponential backoff: 1s, 2s, 4s, 8s, 16s, then holds at 30s. Fast
// enough that a brief blip barely reads as an outage; capped so a real outage
// doesn't hammer the server or the battery.
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** Has a stream ever been established in this session? Distinguishes the first
 *  connection (nothing to reconcile) from a re-connection (possibly missed
 *  events) — see the `reconnect` note on LiveEvent. */
let hasEverConnected = false;

function setConnected(next: boolean): void {
  if (sharedConnected === next) return;
  sharedConnected = next;
  connectionListeners.forEach((l) => l(next));
}

function dispatch(event: LiveEvent): void {
  eventListeners.forEach((l) => l(event));
}

function scheduleReconnect(forGeneration: number): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** backoffAttempt);
  backoffAttempt = Math.min(backoffAttempt + 1, 5); // 1,2,4,8,16,30(cap) — stop growing past that
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Stale if disconnect() or a newer connect() ran since this was scheduled
    // (generation bumps on both), or if there's no longer a session/foreground
    // to reconnect for — the AppState/subject handlers below own those
    // transitions and will call connect() themselves when relevant again.
    if (forGeneration !== generation) return;
    if (!currentSubjectId || AppState.currentState !== "active") return;
    connect();
  }, delay);
}

/** One streaming request with the given token. Split out so a 401 can be retried
 *  with a refreshed one without duplicating the header construction. */
function openStream(url: string, token: string, signal: AbortSignal) {
  return expoFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
      ...(apiKeyHeader() ? { "X-Api-Key": apiKeyHeader() } : {}),
    },
    signal,
  });
}

async function connect(): Promise<void> {
  if (!currentSubjectId) return;
  const url = streamUrl(getConfig().streamPath);
  if (!url) return;

  const myGeneration = ++generation;
  // Abort the PREVIOUS attempt before overwriting the reference to it. The old
  // order lost that reference, so an overlapping connect() (AppState firing
  // "active" while an earlier attempt was still in flight) left a stream nobody
  // could cancel — it sat open until the server's next heartbeat write failed.
  controller?.abort();
  controller = new AbortController();
  const myController = controller;

  let token = await getAccessToken();
  if (myGeneration !== generation) return;
  if (!token) {
    // A subject with no access token on disk — the small window while
    // invalidateSession() has cleared the tokens but has not yet told the
    // app's auth-state module (which is what clears currentSubjectId), or a
    // SecureStore read that failed. Returning bare, as this used to, ended the
    // whole stream for the rest of the session: no reconnect was scheduled and
    // no AppState/subject transition was coming to start one, so the app went
    // permanently silent with only the screens' 45s polls covering for it —
    // the exact failure mode the 401 branch below was added to fix, reached
    // through a different door. Backoff is capped at 30s and the retry is a
    // SecureStore read, so a genuinely token-less state costs nothing while it
    // waits for the sign-out that is on its way.
    setConnected(false);
    scheduleReconnect(myGeneration);
    return;
  }

  try {
    let res = await openStream(url, token, myController.signal);

    // ── 401 → refresh → retry once ──────────────────────────────────────────
    // This path bypasses apiFetch (it needs the streaming body), and so it also
    // bypassed apiFetch's 401→refresh retry. The result: once the access token
    // expired, every reconnect presented the same dead token, got another 401,
    // and backed off — up to the 30s ceiling, forever. Live updates were simply
    // gone for the rest of the session, silently, because interval polling
    // elsewhere in the app quietly covered for it. It healed only if some
    // unrelated request happened to trigger a refresh first.
    //
    // refreshAccessToken() is shared with apiFetch, so concurrent 401s across
    // the app still collapse into ONE refresh call.
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (myGeneration !== generation) return;
      if (!fresh) {
        // The refresh token is dead too (invalidateSession has already told
        // the app's own auth-state module). Reconnecting cannot help; the
        // subject-id change that follows will tear this down.
        setConnected(false);
        return;
      }
      token = fresh;
      res = await openStream(url, token, myController.signal);
    }

    if (!res.ok || !res.body || myGeneration !== generation) {
      if (myGeneration === generation) scheduleReconnect(myGeneration);
      return;
    }

    // Was this a RE-connect rather than the first one? Decided before
    // setConnected flips the flag.
    const reconnected = hasEverConnected && !sharedConnected;
    hasEverConnected = true;
    setConnected(true);
    backoffAttempt = 0; // a real connection landed — forget any prior backoff
    // Tell everyone to reconcile — see the `reconnect` note on LiveEvent.
    if (reconnected) dispatch({ type: "reconnect" });
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
          dispatch(JSON.parse(dataLine.slice(5).trim()) as LiveEvent);
        } catch {
          /* a malformed frame is not worth dropping the connection over */
        }
      }
    }
  } catch (err) {
    // An abort is US disconnecting (backgrounding, sign-out, or a newer
    // connect() superseding this one) — not a failure to report. Goes through
    // api.ts's isAbort() rather than testing `err.name` here: on Android RN
    // rejects an aborted fetch with a plain Error named "Error", so the
    // name check this used to do never matched and every ordinary
    // disconnect warned — see isAbort's own comment.
    if (!isAbort(err)) {
      console.warn("Live stream error:", err);
    }
  } finally {
    if (myGeneration === generation) {
      setConnected(false);
      // The loop ended without disconnect() having been called (that bumps
      // generation itself, which the check above would have caught) — an
      // unexpected close. Retry rather than leave the app silent for the
      // rest of the session.
      scheduleReconnect(myGeneration);
    }
  }
}

function disconnect(): void {
  generation++; // invalidates the in-flight attempt's checks, and any pending reconnect timer
  controller?.abort();
  controller = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  backoffAttempt = 0;
  setConnected(false);
}

function handleAppStateChange(state: AppStateStatus): void {
  // A backgrounded app has no business holding a streaming connection open
  // — the OS suspends the socket regardless, so keeping it "open" fools
  // nothing while draining battery for a stream nobody is reading.
  //
  // ── Only "background", never "inactive" ─────────────────────────────────
  // These used to share a branch (`else disconnect()`), which is right on
  // Android and wrong on iOS. There, "inactive" is a TRANSIENT state that fires
  // for a Control Centre pull, an app-switcher peek, an incoming-call banner and
  // a notification pull-down — none of which is backgrounding, and after all of
  // them the app returns straight to "active". So a two-second glance at Control
  // Centre tore the stream down and rebuilt it; if the rebuild happened to fail
  // it entered backoff, costing up to 30s of realtime for a gesture the person
  // wouldn't connect to anything.
  //
  // The OS has not suspended the socket in "inactive", so holding it is free and
  // correct. Anything that is not one of these two known states is left alone
  // for the same reason.
  if (state === "active") {
    // `!sharedConnected` is load-bearing now that "inactive" no longer tears the
    // stream down: without it, every inactive→active bounce would reconnect over
    // a perfectly healthy connection and reintroduce exactly the churn the
    // branch above exists to stop. When the stream really is down this still
    // fires immediately, which is better than waiting out the backoff — the
    // person just came back and is looking at the screen.
    backoffAttempt = 0;
    if (currentSubjectId && !sharedConnected) connect();
  } else if (state === "background") {
    disconnect();
  }
}

/** Point the shared connection at (or away from) a signed-in account. A
 *  no-op when nothing changed, so N mounted consumers calling this with the
 *  same id cost nothing beyond the first. */
function setLiveEventsSubject(subjectId: string | null): void {
  if (subjectId === currentSubjectId) return;
  currentSubjectId = subjectId;
  disconnect();
  if (subjectId && AppState.currentState === "active") connect();
}

/**
 * Subscribe to the account's live event stream while the app is foregrounded.
 * Reconnects on returning to foreground, on an unexpected drop (with capped
 * backoff), and disconnects on backgrounding rather than holding a socket the
 * OS is going to suspend anyway.
 *
 * Every call shares the ONE underlying connection (see the module comment) —
 * this hook only registers/unregisters this component's own event and
 * connection-state listeners against it.
 *
 * `connected` mirrors the website's hook: polling elsewhere is only ever
 * SLOWED when this is true, never switched off — a stream that silently died
 * must not freeze the screen with no fallback (see each app's own list
 * screens, which keep an interval refetch for exactly the case this hook is
 * still reconnecting).
 */
export function useLiveEvents(onEvent: (event: LiveEvent) => void): { connected: boolean } {
  const [connected, setConnectedState] = useState(sharedConnected);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  // ── Why this depends on the signed-in subject ─────────────────────────────
  // connect() bails out when there's no subject id. Re-deriving it from
  // useAuthSubject() (rather than reading it once) is what lets a FRESH
  // sign-in — the store starts out signed-out because bootstrapSession is
  // async — pick the connection back up the moment the session resolves,
  // instead of the bail-out being permanent for the rest of the app session.
  const subjectId = useAuthSubject();

  useEffect(() => {
    if (!appStateSubscribed) {
      appStateSubscribed = true;
      AppState.addEventListener("change", handleAppStateChange);
      // No addEventListener return value is retained anywhere to remove this
      // — it deliberately outlives any single component, same as the shared
      // connection it drives. There is exactly one for the life of the app.
    }
    setLiveEventsSubject(subjectId);
  }, [subjectId]);

  useEffect(() => {
    const wrapped = (event: LiveEvent) => handler.current(event);
    eventListeners.add(wrapped);
    return () => {
      eventListeners.delete(wrapped);
    };
  }, []);

  useEffect(() => {
    connectionListeners.add(setConnectedState);
    return () => {
      connectionListeners.delete(setConnectedState);
    };
  }, []);

  return { connected };
}
