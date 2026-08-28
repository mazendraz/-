/**
 * One-shot cache invalidation for when a stored SHAPE changes.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * Every localStorage read in this app is `JSON.parse(raw) as T` inside a
 * try/catch that returns a default. That is solid against CORRUPTION — a
 * truncated or malformed value can never crash startup — and does nothing at all
 * about DRIFT. A payload written by an older build parses perfectly and yields an
 * object with the wrong fields: a renamed API field reads as `undefined`, a
 * removed one lingers, and the UI renders blanks or stale values with no error
 * anywhere. Nothing in the codebase could notice, because nothing recorded which
 * version wrote the data.
 *
 * Bumping CACHE_VERSION drops the affected caches once, on the next load, and
 * they refill from the API.
 *
 * ── WHEN TO BUMP ─────────────────────────────────────────────────────────────
 * Only when the SHAPE of something in DISPOSABLE_KEYS changes — a renamed or
 * removed field on Company, ServiceCategory or PlatformSettings. Not for content
 * changes, and not "just in case": every bump costs every returning visitor a
 * cold catalogue fetch.
 *
 * ── Why the list is this short ───────────────────────────────────────────────
 * Only data that can be RE-DERIVED from the server may be dropped here. Most of
 * this app's localStorage is not a cache at all — it is the only copy that
 * exists:
 *
 *   • al-assema-leads holds the refNumber, phone and trackingToken for requests
 *     submitted anonymously from this device. The tracking token is issued once,
 *     on creation, and never returned by any read endpoint (see the comments in
 *     lib/requests.ts). Clearing it would permanently cut this browser off from
 *     its own requests' status, chat and review — and refreshMyLeadsFromApi
 *     could not recover them, because it reads the refs to track FROM that
 *     cache.
 *   • al-assema-waitlist-entries is the same story for waiting-list joins.
 *   • al-assema-saved, -locale, -my-requests, -my-waitlist are user choices and
 *     device-local indexes, not server data.
 *   • al-assema-user / -customer are session profiles, revalidated on mount
 *     against /auth/me and /customer/me anyway.
 *
 * If a future migration genuinely needs to reshape one of those, it needs a real
 * migration function — reading the old shape and writing the new one — not a
 * delete. That is deliberately harder to do by accident than adding a key here.
 */

/** Bump ONLY when a DISPOSABLE_KEYS payload changes shape. See above. */
const CACHE_VERSION = "1";

const VERSION_KEY = "al-assema-cache-version";

/** Server-derived caches, safe to drop and refill. Nothing else belongs here. */
const DISPOSABLE_KEYS = [
  "al-assema-companies",
  "al-assema-companies-admin",
  "al-assema-categories",
  "al-assema-categories-admin",
  "al-assema-settings",
] as const;

/**
 * Drop the disposable caches when the stored version doesn't match this build.
 *
 * Exported for tests. In the app it runs as this module's own side effect at the
 * bottom of the file, and main.tsx imports it FIRST — that ordering is the whole
 * mechanism, and it is easy to break by accident.
 *
 * `import` declarations are hoisted and evaluated before any statement in the
 * importing module's body, so calling this from a line in main.tsx would run it
 * AFTER ./router had already been evaluated — and ./router pulls in
 * lib/catalog.ts and lib/settings.ts, both of which read these keys and start a
 * fetch at module scope. The stale value would already have been read once. A
 * side effect in the first-imported module is the only placement that actually
 * runs first.
 *
 * Never throws: storage can be unavailable outright (Safari private mode throws
 * on access, not just on write), and a cache-hygiene step must never be the
 * reason the app fails to start.
 */
export function purgeStaleCaches(): void {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored === CACHE_VERSION) return;

    for (const key of DISPOSABLE_KEYS) localStorage.removeItem(key);
    localStorage.setItem(VERSION_KEY, CACHE_VERSION);

    // Only worth a line when something was actually dropped — a first-ever visit
    // takes this branch too, and has nothing to report.
    if (stored !== null) {
      console.info(`[al-assema] Cache version ${stored} → ${CACHE_VERSION}; catalogue caches cleared.`);
    }
  } catch {
    /* storage unavailable — nothing cached, so nothing to invalidate */
  }
}

// Runs on import — see the note on purgeStaleCaches for why this is a module
// side effect rather than a call from main.tsx. Guarded for non-DOM contexts.
if (typeof window !== "undefined") purgeStaleCaches();
