/**
 * HTTP client for the Al Assema API — the mobile counterpart of app's
 * lib/api.ts.
 *
 * The shape (ApiError, apiGet/apiPost/apiPatch/apiDelete) deliberately mirrors
 * the website's client: anyone who has read one can read the other. What
 * differs is the credential. The website sends an httpOnly cookie the browser
 * attaches automatically; a phone has no cookie jar, so this attaches a Bearer
 * token from SecureStore instead, and — the piece the web client doesn't need
 * at all — refreshes it when the server says it expired.
 */
import Constants from "expo-constants";
import {
  getAccessToken,
  getRefreshToken,
  invalidateSession,
  saveAccessToken,
  saveTokens,
} from "./session";

// Expo only inlines env vars prefixed EXPO_PUBLIC_ into the client bundle —
// the direct counterpart of Vite's VITE_ prefix, and for the same reason
// (anything without it could be a server-only secret, so the bundler refuses
// to ship it to the device).
const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  ""
).replace(/\/$/, "");

// Mirrors the website's VITE_API_KEY (app/src/lib/api.ts) — same optional
// shared-secret gate (api's proxy.ts: when API_KEY is set server-side, every
// /api request without a matching X-Api-Key 401s). Currently unset on the
// server, so this is a no-op today — but without it wired here, turning that
// env var on would 401 every request this app makes while leaving the
// website untouched, since the website already sends it and this client
// never did.
const API_KEY = (process.env.EXPO_PUBLIC_API_KEY ?? "").trim();

export function isApiConfigured(): boolean {
  return Boolean(BASE_URL);
}

/** For the one caller that can't go through apiFetch's buildHeaders — the
 *  raw SSE fetch in liveEvents.ts, which needs the same header this module
 *  attaches to every other request. */
export function apiKeyHeader(): string {
  return API_KEY;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// ── Reachability signal ──────────────────────────────────────────────────────
// There is no `window` to dispatch a CustomEvent on, so this is a tiny
// pub/sub of its own — same purpose as the website's API_DOWN_EVENT
// (useBackendHealth reacts to real traffic instead of polling forever), same
// shape, different plumbing because there's no DOM event bus to borrow.
type ReachabilityListener = (reachable: boolean) => void;
const reachabilityListeners = new Set<ReachabilityListener>();

export function onReachabilityChange(listener: ReachabilityListener): () => void {
  reachabilityListeners.add(listener);
  return () => reachabilityListeners.delete(listener);
}

function signalReachability(reachable: boolean): void {
  reachabilityListeners.forEach((l) => l(reachable));
}

function isReachabilityFailure(status: number, code?: string): boolean {
  if (code === "MAINTENANCE") return false;
  return status === 0 || status >= 500;
}

// ── Request timeout ───────────────────────────────────────────────────────────
// `fetch()` has no built-in timeout. Against a genuinely unreachable host —
// a stale LAN IP, a dev machine that changed networks — some environments
// don't even reject the promise, they just hang forever. That single hung
// call used to freeze the WHOLE app, not just one screen: the maintenance
// check in app/_layout.tsx blocks ALL rendering until its own fetch settles
// (`if (!fontsLoaded || !sessionReady || maintenanceLoading) return null`),
// so an unreachable API meant a permanent blank white screen — every screen,
// not just the one missing data. Wrapping every request in an internal
// timeout guarantees it always settles one way or another.
const REQUEST_TIMEOUT_MS = 12000;

function withTimeout(externalSignal?: AbortSignal | null): {
  signal: AbortSignal;
  finish: () => void;
  isOurTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return {
    signal: controller.signal,
    finish: () => clearTimeout(timer),
    isOurTimeout: () => timedOut,
  };
}

// ── Token refresh ─────────────────────────────────────────────────────────────
// Concurrent requests that all hit a 401 at once (a screen firing three
// fetches on mount) must trigger exactly ONE refresh, not three racing to
// rewrite the stored tokens. Every caller awaits this same in-flight promise.
let refreshInFlight: Promise<string | null> | null = null;

/** Exchange the refresh token for a new access token. null = refresh failed;
 *  the caller should treat this as a full sign-out.
 *
 *  Exported for liveEvents.ts, which cannot go through apiFetch at all: SSE needs
 *  the streaming response body, so it calls expo/fetch directly and therefore
 *  misses the 401→refresh retry every other request gets for free. Sharing this
 *  function (rather than letting it grow a second copy) is also what keeps the
 *  single-flight guarantee true — one refresh, however many callers race for it. */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${BASE_URL}/auth/customer/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // The refresh token itself is dead (expired, revoked, or reuse was
        // detected server-side — see customerSession.service). No amount of
        // retrying fixes that; only signing in again does. invalidateSession
        // (not plain clearTokens) so customerAuth's in-memory `customer`
        // snapshot is told too — see that function's comment for the bug
        // this closes: a stale token cleared here but never reported left
        // the tab bar rendering the signed-in shell over a session that no
        // longer worked.
        await invalidateSession();
        return null;
      }
      const body = (await res.json()) as { token: string; refreshToken: string };
      // The server ROTATES the refresh token on every use (reuse detection
      // depends on it) — persisting only the access token here would leave a
      // stale refresh token on device that the next refresh silently rejects.
      await saveTokens({ accessToken: body.token, refreshToken: body.refreshToken });
      return body.token;
    } catch {
      // Network failure during refresh is NOT the same as an invalid token —
      // don't clear a still-good refresh token over a dropped connection.
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function buildHeaders(token: string | null, extra: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  return h;
}

/**
 * Typed fetch wrapper. Throws ApiError on non-2xx responses (after one retry
 * on 401 via refresh) and on network failure.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  if (!BASE_URL) throw new ApiError(0, "EXPO_PUBLIC_API_URL is not configured");

  const attempt = async (token: string | null): Promise<Response> => {
    const { signal, finish, isOurTimeout } = withTimeout(options.signal);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal,
        headers: buildHeaders(token, extraHeaders),
      });
      return res;
    } catch (err) {
      // A caller-initiated abort (e.g. a screen unmounting mid-request)
      // should still surface as a real AbortError so existing isAbort()
      // callers keep ignoring it. Our OWN timeout firing is a network
      // failure, not a cancellation — it must flow into the same
      // ApiError/reachability path as any other dropped connection, not be
      // silently swallowed as "this was intentional".
      if (isAbort(err) && !isOurTimeout()) throw err;
      signalReachability(false);
      throw new ApiError(
        0,
        isOurTimeout() ? "Request timed out" : err instanceof Error ? err.message : "Network request failed",
      );
    } finally {
      finish();
    }
  };

  let token = await getAccessToken();
  let res = await attempt(token);

  // One retry, only on 401, only if a refresh token exists. A 401 on the
  // refresh call itself is handled inside refreshAccessToken and never loops
  // back here — this path calls /auth/customer/refresh, not this function.
  if (res.status === 401 && path !== "/auth/customer/refresh") {
    const fresh = await refreshAccessToken();
    if (fresh) {
      token = fresh;
      res = await attempt(token);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.message ?? message;
      code = typeof body.code === "string" ? body.code : undefined;
    } catch {
      /* body wasn't JSON — keep statusText */
    }
    if (isReachabilityFailure(res.status, code)) signalReachability(false);
    throw new ApiError(res.status, message, code);
  }

  signalReachability(true);

  if (res.status === 204) return undefined as unknown as T;

  try {
    return (await res.json()) as T;
  } catch (err) {
    if (isAbort(err) || options.signal?.aborted) throw err;
    signalReachability(false);
    throw new ApiError(0, err instanceof Error ? err.message : "Failed to read response body");
  }
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: "GET", signal });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete(path: string, body?: unknown): Promise<void> {
  return apiFetch<void>(path, {
    method: "DELETE",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Absolute URL for the SSE stream — see api's customer/stream route. */
export function streamUrl(path: string): string | null {
  return BASE_URL ? `${BASE_URL}${path}` : null;
}

/**
 * One-shot readiness check against `/ready` (a real `SELECT 1`, unlike
 * `/health`'s liveness-only check) — the mobile counterpart of the
 * website's own inline probe in hooks/useBackendHealth.ts.
 *
 * Bypasses apiFetch deliberately: apiFetch is what SIGNALS reachability
 * (via signalReachability), so routing the probe through it would make the
 * probe feed its own listeners instead of reporting an independent result.
 */
export async function probeReady(): Promise<boolean> {
  if (!BASE_URL) return true; // unconfigured — nothing to probe

  // Bypassing apiFetch also meant bypassing withTimeout, which mattered more
  // here than anywhere else: this is the probe the OFFLINE screen's retry button
  // awaits, and offline is exactly when a bare fetch falls back to the OS socket
  // timeout — ~10s on Android's OkHttp, up to 60s on iOS NSURLSession. So the
  // one screen whose entire job is recovering from an outage sat with its button
  // disabled and "بنحاول..." on it for up to a minute, and useBackendHealth's
  // 10s probe loop silently became a 60s one.
  //
  // Its own controller rather than withTimeout(): that helper is fine, but the
  // point of this function is to produce a reachability answer INDEPENDENT of
  // the reachability bus, and reusing the shared plumbing invites someone later
  // to route it through apiFetch "for consistency". 5s is well past a healthy
  // /ready (a single `SELECT 1`) and well short of a user giving up.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE_URL}/ready`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false; // unreachable, or took longer than a healthy server ever would
  } finally {
    clearTimeout(timer);
  }
}
