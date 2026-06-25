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
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Returns true when VITE_API_URL is set — callers use this to decide whether to hit the API. */
export function isApiConfigured(): boolean {
  return Boolean(BASE_URL);
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  const token = localStorage.getItem("al-assema-token");
  if (token) h["Authorization"] = `Bearer ${token}`;
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

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(extraHeaders),
  });

  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Convenience shorthands ───────────────────────────────────────────────────

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
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
  const token = localStorage.getItem("al-assema-token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: form, headers });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message ?? message; } catch { /* ignore */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}
