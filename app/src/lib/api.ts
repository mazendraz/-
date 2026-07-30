/**
 * Core HTTP client for the Al Assema backend API.
 *
 * Usage:
 *   Set VITE_API_URL in .env.local to enable live API calls.
 *   Without it, all callers fall back to localStorage / mock data.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const API_KEY  = import.meta.env.VITE_API_KEY ?? "";

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

// ── Backend reachability signal ──────────────────────────────────────────────
// The "backend is down" screen must NOT come from a timer that polls forever —
// that would hammer /api/ready (a real `SELECT 1`) once per tab for every visitor
// for zero benefit while everything is fine. Instead the client reports what it
// already knows from traffic it was making anyway, and useBackendHealth() only
// starts probing after it hears about a failure.
export const API_DOWN_EVENT = "al-assema-api-down";
export const API_UP_EVENT = "al-assema-api-up";

function signal(name: string): void {
  // Guard for non-DOM contexts (tests, SSR).
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name));
}

/**
 * Does this failure mean "the backend is unreachable"?
 *
 * A maintenance rejection is also a 503, but it proves the exact opposite — the
 * server answered, and answered deliberately. Treating it as "down" would swap the
 * maintenance screen (which explains what is happening and when we're back) for
 * the offline screen (which says something is broken). Same status code, opposite
 * meaning; the code field is what separates them.
 */
function isReachabilityFailure(status: number, code?: string): boolean {
  if (code === "MAINTENANCE") return false;
  return status === 0 || status >= 500;
}

/** A deliberate cancellation, not a failure. Callers should swallow these. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Returns true when VITE_API_URL is set — callers use this to decide whether to hit the API. */
export function isApiConfigured(): boolean {
  return Boolean(BASE_URL);
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  // Auth travels in the httpOnly session cookie (sent via credentials: "include"),
  // not a JS-readable token — so XSS can't exfiltrate the session.
  return h;
}

/**
 * Typed fetch wrapper.
 * Throws ApiError on non-2xx responses.
 * Throws if VITE_API_URL is not set (callers should guard with isApiConfigured()).
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  if (!BASE_URL) throw new ApiError(0, "VITE_API_URL is not configured");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: buildHeaders(extraHeaders),
      credentials: "include", // send the httpOnly session cookie
    });
  } catch (err) {
    // An abort is US cancelling, not the server failing. Treating it as
    // unreachability would flash the offline screen every time a caller
    // superseded its own request (a search keystroke) or unmounted mid-flight.
    if (isAbort(err) || options.signal?.aborted) throw err;
    // Otherwise fetch only rejects on a network-level failure (server
    // unreachable, DNS, connection reset) — the case the offline screen exists for.
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
    } catch { /* ignore */ }
    if (isReachabilityFailure(res.status, code)) signal(API_DOWN_EVENT);
    throw new ApiError(res.status, message, code);
  }

  signal(API_UP_EVENT);

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Convenience shorthands ───────────────────────────────────────────────────

/**
 * `signal` lets a caller actually cancel an in-flight request — a superseded
 * search keystroke, or a component unmounting. Without it a debounced list view
 * could only discard late responses, leaving the connections themselves running.
 */
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

/**
 * Multipart upload (e.g. POST /admin/upload). Sends auth + API key but lets the
 * browser set the multipart Content-Type with its boundary — so it does NOT go
 * through apiFetch, which forces application/json.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  if (!BASE_URL) throw new ApiError(0, "VITE_API_URL is not configured");

  const headers: Record<string, string> = {};
  if (API_KEY) headers["X-Api-Key"] = API_KEY;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include", // send the httpOnly session cookie
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}
