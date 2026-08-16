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
  clearTokens,
  getAccessToken,
  getRefreshToken,
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

export function isApiConfigured(): boolean {
  return Boolean(BASE_URL);
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

// ── Token refresh ─────────────────────────────────────────────────────────────
// Concurrent requests that all hit a 401 at once (a screen firing three
// fetches on mount) must trigger exactly ONE refresh, not three racing to
// rewrite the stored tokens. Every caller awaits this same in-flight promise.
let refreshInFlight: Promise<string | null> | null = null;

/** Exchange the refresh token for a new access token. null = refresh failed;
 *  the caller should treat this as a full sign-out. */
async function refreshAccessToken(): Promise<string | null> {
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
        // retrying fixes that; only signing in again does.
        await clearTokens();
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
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: buildHeaders(token, extraHeaders),
      });
      return res;
    } catch (err) {
      if (isAbort(err) || options.signal?.aborted) throw err;
      signalReachability(false);
      throw new ApiError(0, err instanceof Error ? err.message : "Network request failed");
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

export function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE" });
}

/** Absolute URL for the SSE stream — see api's customer/stream route. */
export function streamUrl(path: string): string | null {
  return BASE_URL ? `${BASE_URL}${path}` : null;
}
