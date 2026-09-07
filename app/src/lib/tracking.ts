/**
 * First-party funnel analytics — the client half of POST /api/track.
 *
 * Why this exists: until it did, nothing on this site counted anybody. "How
 * many people came, and where did they stop" had no answer at all, so every
 * conversation about the drop-off between a visit and a sent request was
 * guesswork. This is the smallest thing that answers it honestly.
 *
 * Why not Google Analytics / Clarity / any third-party tag: the deployed CSP
 * is `script-src 'self'` and enforced (deploy/Caddyfile, security audit finding
 * M-01). Every hosted analytics script needs that widened, plus a connect-src
 * allowance, plus a consent banner for the cookie it sets — three real costs
 * for data that would then live in someone else's account. This posts to our
 * own origin, so it needs no CSP change and no banner.
 *
 * What it deliberately does NOT collect: no cookie, no localStorage, no IP
 * (the server drops it), no user agent, no customer id, no query strings, no
 * full referrer URL. The only identifier is a random per-TAB id that dies with
 * the tab — enough to count people instead of page loads, not enough to follow
 * anyone between visits.
 */
import { isApiConfigured, streamUrl } from "./api";
import { trackMetaPixel } from "./metaPixel";

/** The funnel stages, mirroring api/src/lib/validation/siteEvents.ts. */
export type FunnelStage =
  | "page_view"
  | "category_view"
  | "company_view"
  | "request_form_open"
  | "request_form_start"
  | "request_signin_wall"
  | "request_submit"
  | "request_success"
  | "request_error";

const SESSION_KEY = "al-assema-analytics-session";
const SOURCE_KEY = "al-assema-analytics-source";

// Staff traffic is not customer traffic. Counting our own dashboard sessions in
// the same funnel is how a site "grows" 30% the week the admin was busy.
const INTERNAL_PREFIXES = ["/admin", "/provider"];

/**
 * Random id for THIS tab, kept in sessionStorage: a new tab is a new visit and
 * closing the tab forgets it. sessionStorage (not localStorage) is the whole
 * privacy argument — there is no identifier here that survives the visit.
 */
function sessionId(): string | null {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 32)
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Private mode / storage blocked. No id means no event: an uncounted visit
    // is a smaller problem than a crashed one.
    return null;
  }
}

/**
 * Where this visit came from, resolved ONCE at the start and reused for every
 * later event — by the third page the referrer is our own site, and a funnel
 * that re-reads it would credit every deep visit to "direct".
 *
 * HOST only (or the ref/utm_source value): a full referrer URL can carry
 * someone's private link, and we have no business storing it.
 */
function visitSource(): string | undefined {
  try {
    const cached = sessionStorage.getItem(SOURCE_KEY);
    if (cached !== null) return cached || undefined;

    const params = new URLSearchParams(window.location.search);
    const tagged = params.get("utm_source") ?? params.get("ref");
    let value = "";
    if (tagged) {
      value = tagged.slice(0, 120);
    } else if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      // Our own pages are not a traffic source.
      if (host && host !== window.location.hostname) value = host.slice(0, 120);
    }
    sessionStorage.setItem(SOURCE_KEY, value);
    return value || undefined;
  } catch {
    return undefined;
  }
}

// StrictMode mounts every effect twice in development, and a "back" that lands
// on the same route re-fires its effect too. Without this, page_view is counted
// twice for one arrival — which inflates the top of the funnel and makes every
// stage below it look worse than it is.
let lastEvent = "";
let lastEventAt = 0;
const DEDUPE_MS = 1000;

/**
 * Send one funnel event. Fire-and-forget: never awaited, never throws, and the
 * server answers 202 whatever happens (see api/src/app/api/track/route.ts).
 */
export function track(stage: FunnelStage, options: { path?: string; target?: string } = {}): void {
  if (typeof window === "undefined" || !isApiConfigured()) return;

  // Query string stripped: it is where tokens and phone numbers end up, and the
  // route alone is what the funnel reads.
  const path = (options.path ?? window.location.pathname).slice(0, 300);
  if (INTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  const now = Date.now();
  const key = `${stage}:${path}:${options.target ?? ""}`;
  if (key === lastEvent && now - lastEventAt < DEDUPE_MS) return;
  lastEvent = key;
  lastEventAt = now;

  // Mirrored here, not instrumented separately, so "what counts as a
  // conversion" is defined once. A no-op unless a Meta Pixel id is configured.
  trackMetaPixel(stage);

  const id = sessionId();
  if (!id) return;

  const url = streamUrl("/track");
  if (!url) return;

  const payload = JSON.stringify({
    name: stage,
    path,
    sessionId: id,
    source: visitSource(),
    target: options.target,
  });

  try {
    // sendBeacon survives the page being closed mid-flight — which is exactly
    // the moment the most interesting events (the ones before someone leaves)
    // are sent. Falls back to keepalive fetch where it is unavailable.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never be able to break the page it is measuring.
  }
}
