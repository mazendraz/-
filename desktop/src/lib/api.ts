/**
 * Core HTTP client for the Al Asima backend API — the desktop-app twin of
 * app/src/lib/api.ts, adapted for two things that differ here:
 *
 *  1. Auth travels as `Authorization: Bearer <token>`, not a cookie. A Tauri
 *     window is not same-origin with the API, so the httpOnly
 *     SameSite=Strict session cookie the web app uses never applies here —
 *     the backend already supports a Bearer header as the documented
 *     "transition/API clients" path (see api/src/lib/auth.ts resolveToken).
 *     The token itself lives in the OS credential vault (lib/secureToken.ts)
 *     and is only ever held in memory here (see setAuthToken).
 *  2. Requests go through @tauri-apps/plugin-http's `fetch`, which runs on
 *     the Rust side (reqwest), NOT the webview's own fetch — so this app is
 *     not subject to the webview's CORS checks and the existing Next.js API
 *     needs no CORS changes to serve it. See src-tauri/capabilities/default.json
 *     for the allow-listed origins and src-tauri/Cargo.toml for why.
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable ApiErrorBody.code, when the server sent one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Cross-cutting signals ────────────────────────────────────────────────────
// Mirrors app/src/lib/api.ts's API_DOWN_EVENT/API_UP_EVENT pattern: components
// report what they already know from traffic they were making anyway, instead
// of a background poller hammering the API from every window.
export const API_DOWN_EVENT = "al-asima-desktop-api-down";
export const API_UP_EVENT = "al-asima-desktop-api-up";
/** The current token was rejected (expired/revoked/user deactivated) — the
 *  AuthProvider listens for this to clear the stored token and bounce to
 *  /login, so this module never needs to import auth.tsx directly. */
export const UNAUTHORIZED_EVENT = "al-asima-desktop-unauthorized";

function signal(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

function isReachabilityFailure(status: number, code?: string): boolean {
  if (code === "MAINTENANCE") return false;
  return status === 0 || status >= 500;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Report a failed background hydration at the right volume — see
 *  app/src/lib/api.ts's twin for the full reasoning (86 spurious console
 *  errors measured from routine tab-navigation aborts, none actionable). */
export function reportHydrationFailure(label: string, err: unknown): void {
  if (isAbort(err)) return;
  if (err instanceof ApiError && err.status === 0) {
    console.warn(`${label} skipped — API unreachable:`, err.message);
    return;
  }
  console.error(`${label} failed:`, err);
}

// ── Token (in-memory only) ───────────────────────────────────────────────────
let authToken: string | null = null;

/** Set by AuthProvider after reading the OS credential vault on boot, and
 *  after every login/logout. Never persisted here — secureToken.ts owns that. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

/**
 * Typed fetch wrapper. Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await tauriFetch(`${BASE_URL}${path}`, {
      ...options,
      headers: buildHeaders(extraHeaders),
    });
  } catch (err) {
    if (isAbort(err) || options.signal?.aborted) throw err;
    signal(API_DOWN_EVENT);
    throw new ApiError(0, err instanceof Error ? err.message : "Network request failed");
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.message ?? message;
      code = typeof body.code === "string" ? body.code : undefined;
    } catch {
      /* ignore */
    }
    if (isReachabilityFailure(res.status, code)) signal(API_DOWN_EVENT);
    if (res.status === 401) signal(UNAUTHORIZED_EVENT);
    throw new ApiError(res.status, message, code);
  }

  signal(API_UP_EVENT);

  if (res.status === 204) return undefined as unknown as T;

  try {
    return (await res.json()) as T;
  } catch (err) {
    if (isAbort(err) || options.signal?.aborted) throw err;
    signal(API_DOWN_EVENT);
    throw new ApiError(0, err instanceof Error ? err.message : "Failed to read response body");
  }
}

// ── Convenience shorthands ───────────────────────────────────────────────────

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: "GET", signal });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE" });
}
