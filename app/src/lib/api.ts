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

// ── Session-expiry signal ────────────────────────────────────────────────────
// Staff tokens expire FLAT at JWT_TTL (1d by default — api/src/lib/auth.ts says
// so explicitly: "Staff sessions have no such renewal and still expire flat"),
// and useAuth() only revalidates on mount. A dashboard tab is a long-lived
// mount, so nothing ever re-checked: after 24h every request 401'd, every panel
// rendered its own generic error, and the sidebar carried on showing the
// signed-in shell. The only way out was a reload the UI never suggested — the
// textbook "works after reload".
//
// This is the missing signal. api.ts is the one place that sees every 401.
export const AUTH_EXPIRED_EVENT = "al-assema-auth-expired";

/** Which population's session a 401 on this path proves is dead. */
export type SessionAudience = "staff" | "customer";

/**
 * Classify a 401 by path prefix, or null when we can't be sure.
 *
 * There are TWO independent httpOnly cookies (al-assema-session for staff,
 * al-assema-customer-session for customers) and one browser can legitimately
 * hold both — an admin who also submitted a request from their own machine is a
 * case the lead cache already goes out of its way to support. So a 401 must
 * clear the session it actually belongs to and leave the other one alone.
 *
 * Deliberately conservative: only prefixes that are unambiguously guarded by one
 * audience are classified, and anything else returns null and changes nothing.
 * A method-dependent route like PATCH /leads/:id (staff-only, while POST /leads
 * is public) can't be told apart from a path prefix, so it isn't tried — the
 * dashboards issue enough /admin/* and /provider/* calls that an expired staff
 * session is caught within moments regardless.
 */
function audienceFor401(path: string): SessionAudience | null {
  if (path.startsWith("/customer/")) return "customer";
  if (path.startsWith("/admin/") || path.startsWith("/provider/")) return "staff";
  if (path === "/auth/me") return "staff";
  return null;
}

function signal(name: string, detail?: unknown): void {
  // Guard for non-DOM contexts (tests, SSR).
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
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

// ── Request timeout ──────────────────────────────────────────────────────────
// `fetch()` has no built-in timeout, and a promise that never settles is not an
// error any caller can catch — it is a caller that never runs its `catch` or its
// `finally` at all. Against a host that ACCEPTS the connection and then answers
// nothing (a captive portal, a black-holed route after a Wi-Fi↔cellular switch, a
// half-open socket, a wedged upstream) the request simply hangs.
//
// That is survivable when it stalls one panel. It was not survivable here,
// because RootLayout holds the ENTIRE public site behind three of these
// (maintenance, leads hydration, account sync) and every one of them releases its
// gate from a `.finally()` — which never runs. The whole site sat on a spinner
// with no error, no retry and nothing a reload could fix.
//
// This is a straight port of mobile/client/lib/api.ts's withTimeout(), which has
// been carrying exactly this fix on the phone for a while (its comment describes
// the same failure: "That single hung call used to freeze the WHOLE app"). Kept
// deliberately similar so the two clients still read as counterparts.
//
// 15s, not mobile's 12s: this client also drives the admin dashboard, whose
// slowest legitimate read is /admin/companies?pageSize=200 on a cold cache. Long
// enough that no real request is ever cut off, short enough that a hang resolves
// while the user is still looking at the screen.
const REQUEST_TIMEOUT_MS = 15_000;

// Uploads get their own, far longer budget. MAX_VIDEO_UPLOAD_BYTES is 50MB (see
// api's upload.service.ts) and a gallery video on a slow uplink legitimately
// takes minutes — capping that at REQUEST_TIMEOUT_MS would abort real work.
// Still bounded, because "no timeout" is the bug this whole block exists for.
const UPLOAD_TIMEOUT_MS = 120_000;

interface Deadline {
  /** Pass to fetch. Fires on OUR timeout or the caller's own cancellation. */
  signal: AbortSignal;
  /** Always call in a `finally` — clears the timer. */
  finish: () => void;
  /** True when the abort came from us, not from the caller. */
  isOurTimeout: () => boolean;
}

/**
 * Compose the caller's AbortSignal (if any) with an internal deadline.
 *
 * The two have to stay distinguishable: a caller-initiated abort is a superseded
 * search keystroke or an unmounting component and must keep surfacing as a real
 * AbortError so every existing `isAbort()` check goes on ignoring it. OUR timeout
 * is a failed request and must flow into the same ApiError/API_DOWN_EVENT path as
 * any other dropped connection.
 */
function withTimeout(externalSignal: AbortSignal | null | undefined, ms: number): Deadline {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  let detach = () => {};
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });
      // Removed in finish() rather than relying on `once` alone: a caller can
      // reuse one long-lived signal across many requests, and each of those
      // would otherwise leave a listener on it until the signal finally fires.
      detach = () => externalSignal.removeEventListener("abort", onAbort);
    }
  }

  return {
    signal: controller.signal,
    finish: () => { clearTimeout(timer); detach(); },
    isOurTimeout: () => timedOut,
  };
}

/**
 * Report a failed BACKGROUND hydration (the `hydrateXFromApi` family) at the
 * right volume.
 *
 * These all used to `console.error` unconditionally, and the dominant cause is
 * not a bug: navigating away rejects the in-flight fetch, which on a dashboard
 * happens every time the user clicks the next tab before the last one settled.
 * Measured across ten admin tab navigations: 86 console errors, none of them
 * actionable. That volume is how an error channel stops being read.
 *
 *   • abort            → silent. We cancelled it.
 *   • ApiError status 0 → warn. Unreachability, which apiFetch has ALREADY
 *                         announced via API_DOWN_EVENT; useBackendHealth owns
 *                         telling the user, so a second louder report adds
 *                         nothing.
 *   • anything else     → error. A real API failure, still worth shouting about.
 */
export function reportHydrationFailure(label: string, err: unknown): void {
  if (isAbort(err)) return;
  if (err instanceof ApiError && err.status === 0) {
    console.warn(`${label} skipped — API unreachable:`, err.message);
    return;
  }
  console.error(`${label} failed:`, err);
}

/** Returns true when VITE_API_URL is set — callers use this to decide whether to hit the API. */
export function isApiConfigured(): boolean {
  return Boolean(BASE_URL);
}

/**
 * Absolute URL for a streaming endpoint.
 *
 * EventSource takes a URL, not the (path, options) pair apiFetch works with, so
 * it needs the base applied here rather than inside the fetch helper. Returns
 * null when the API isn't configured, which is the demo/offline mode every
 * other caller also guards on.
 */
export function streamUrl(path: string): string | null {
  return BASE_URL ? `${BASE_URL}${path}` : null;
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

  // The deadline covers the WHOLE exchange — headers AND body — and is cleared
  // in the `finally` at the end of this function. Headers arriving is not a
  // promise the body will: aborting mid-stream is a real failure mode, and the
  // res.json() below is inside the same guarded window for that reason.
  const deadline = withTimeout(options.signal, REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal: deadline.signal,
        headers: buildHeaders(extraHeaders),
        credentials: "include", // send the httpOnly session cookie
      });
    } catch (err) {
      // An abort is US cancelling, not the server failing. Treating it as
      // unreachability would flash the offline screen every time a caller
      // superseded its own request (a search keystroke) or unmounted mid-flight.
      // Our OWN timeout firing is the opposite — a request that failed — so it
      // deliberately falls through to the ApiError path below.
      if (!deadline.isOurTimeout() && (isAbort(err) || options.signal?.aborted)) throw err;
      // Otherwise fetch only rejects on a network-level failure (server
      // unreachable, DNS, connection reset) — the case the offline screen exists for.
      signal(API_DOWN_EVENT);
      throw new ApiError(
        0,
        deadline.isOurTimeout()
          ? "Request timed out"
          : err instanceof Error ? err.message : "Network request failed",
      );
    }

    return await readBody<T>(path, res, options, deadline);
  } finally {
    deadline.finish();
  }
}

/**
 * Split out of apiFetch purely so the deadline's `try`/`finally` above stays
 * readable — this is the second half of the same request.
 */
async function readBody<T>(
  path: string,
  res: Response,
  options: RequestInit,
  deadline: Deadline,
): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.message ?? message;
      code = typeof body.code === "string" ? body.code : undefined;
    } catch { /* ignore */ }
    if (isReachabilityFailure(res.status, code)) signal(API_DOWN_EVENT);
    // The session behind this request is gone. lib/auth.ts and lib/customerAuth.ts
    // each listen and clear their OWN state — see audienceFor401 for why this is
    // addressed rather than broadcast. Sign-in and sign-out routes are excluded
    // by that classifier: a wrong password on the login form is a 401 that must
    // NOT be read as "your session ended".
    const audience = res.status === 401 ? audienceFor401(path) : null;
    if (audience) signal(AUTH_EXPIRED_EVENT, { audience });
    throw new ApiError(res.status, message, code);
  }

  signal(API_UP_EVENT);

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as unknown as T;

  // The body read gets the SAME protection as the fetch above. Headers arriving
  // does not mean the body will: a connection dropped (or the page navigated
  // away) mid-response rejects res.json() with a bare TypeError, which escaped
  // this function unwrapped — breaking the contract every caller is written
  // against ("throws ApiError"), so `err instanceof ApiError` checks fell
  // through to their generic branch, and API_DOWN_EVENT was never signalled for
  // a failure that genuinely was unreachability. Surfaced under parallel load,
  // where hydration callers logged raw "TypeError: Failed to fetch".
  try {
    return (await res.json()) as T;
  } catch (err) {
    // Same split as the fetch above: a caller cancelling stays an AbortError,
    // our own deadline expiring mid-body is a failed request.
    if (!deadline.isOurTimeout() && (isAbort(err) || options.signal?.aborted)) throw err;
    signal(API_DOWN_EVENT);
    throw new ApiError(
      0,
      deadline.isOurTimeout()
        ? "Request timed out"
        : err instanceof Error ? err.message : "Failed to read response body",
    );
  }
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

  // This path bypasses apiFetch (it must let the browser set the multipart
  // Content-Type with its boundary), and it used to bypass everything apiFetch
  // does AROUND the request too: no deadline, no error `code`, no reachability
  // signal, and an unguarded body read. So an upload that failed because the
  // backend was unreachable never told useBackendHealth — the admin got a bare
  // error on a page that still looked perfectly healthy.
  const deadline = withTimeout(null, UPLOAD_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        body: form,
        headers,
        signal: deadline.signal,
        credentials: "include", // send the httpOnly session cookie
      });
    } catch (err) {
      signal(API_DOWN_EVENT);
      throw new ApiError(
        0,
        deadline.isOurTimeout()
          ? "Upload timed out"
          : err instanceof Error ? err.message : "Upload failed",
      );
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
    try {
      return (await res.json()) as T;
    } catch (err) {
      signal(API_DOWN_EVENT);
      throw new ApiError(0, err instanceof Error ? err.message : "Failed to read upload response");
    }
  } finally {
    deadline.finish();
  }
}
