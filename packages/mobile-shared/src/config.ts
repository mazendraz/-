/**
 * Per-app configuration for this package.
 *
 * Everything in here differs between the customer client and the staff
 * Business App: which server route refreshes a token, which one opens the
 * live-event stream, which one registers a push device, and (should it ever
 * be needed) the base URL and shared-secret header. Each app calls configure()
 * once, at startup, before any other module in this package is used — the
 * client app's index.ts / _layout.tsx and the business app's own entry point
 * both do this, mirroring how each app already wires its own EXPO_PUBLIC_*
 * env vars into its own bundle.
 *
 * A module-level singleton, not React context: api.ts, liveEvents.ts and
 * push.ts are called from plain async functions as often as from components,
 * and a value only reachable inside the component tree can't serve those.
 */
export interface MobileConfig {
  /** e.g. "https://al-assema.tech/api/v1" — no trailing slash. */
  baseUrl: string;
  /** Optional shared-secret header value (X-Api-Key) — empty string when unset. */
  apiKey: string;
  /**
   * Origin that serves root-relative media ("/img/seed-15.jpg") — see
   * assetUrl.ts's own header comment. Empty string (the default) means
   * "derive it from baseUrl", which is correct for the production
   * single-origin deploy; only local dev (API and images on different
   * ports) needs this set explicitly, same as each app's own
   * EXPO_PUBLIC_ASSET_URL .env.example entry already documents.
   */
  assetUrl: string;
  /** Exchanges a refresh token for a new pair. Client: "/auth/customer/refresh".
   *  Business App: "/auth/refresh". */
  refreshPath: string;
  /** Opens the live-event SSE stream. Client: "/customer/stream".
   *  Business App: "/provider/stream" (the route both PROVIDER and ADMIN use). */
  streamPath: string;
  /** Registers/unregisters this device's push token. Client:
   *  "/customer/push-device". Business App: "/push/device". */
  devicePath: string;
  /**
   * Transforms a push payload's `url` (a server-chosen path, e.g.
   * "/provider?tab=messages") into the path this app's router should
   * actually navigate to, before push.ts's tap handler calls it.
   *
   * Optional, defaulting to the identity function. The client app's own
   * routes already match what the server sends, so it never needs one. The
   * Business App does: server payloads still name WEB dashboard paths (see
   * phase 4's deepLinks.ts, docs/architecture/business-app/
   * phase-4-realtime-push.md), which match no native route in that app —
   * without a mapper, a tap would call router.push with a path that exists
   * nowhere and land on a blank screen.
   */
  mapNotificationUrl?: (url: string) => string;
  /**
   * Sent as `?app=` on GET /app-version — see api's own route.ts B5. Absent
   * for the client app (its own call, unchanged); "business" for the
   * Business App, which reads a fully separate set of
   * APP_MIN_VERSION_BUSINESS-suffixed env vars server-side rather than
   * falling back onto the client's thresholds. See
   * docs/architecture/business-app/phase-4-realtime-push.md's B5 for why a
   * fallback would be wrong: the two apps ship unrelated version numbers.
   */
  appVersionQuery?: string;
}

let config: MobileConfig | null = null;

/** Call once, at app startup, before anything else in this package runs. */
export function configure(next: MobileConfig): void {
  config = next;
}

/** Throws with a clear message rather than a confusing downstream failure —
 *  every caller in this package is only reachable after an app has started,
 *  by which point configure() has always already run. A thrown error here
 *  means a NEW entry point forgot to call it, not a runtime edge case to
 *  handle gracefully. */
export function getConfig(): MobileConfig {
  if (!config) {
    throw new Error(
      "@alassema/mobile-shared: configure() was never called. " +
        "Call it once at app startup before using api/liveEvents/push.",
    );
  }
  return config;
}
