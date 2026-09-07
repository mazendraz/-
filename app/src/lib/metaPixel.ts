/**
 * Meta Pixel — the one thing the first-party funnel (tracking.ts) cannot do.
 *
 * tracking.ts already answers "how many people came and where did they stop",
 * honestly and without a third party, and it stays the source of truth for
 * that. This is not a second analytics system: the Pixel exists so Meta can
 * OPTIMISE ad delivery toward the people who actually send a request. Without
 * it a campaign is buying clicks and guessing; with it, Meta learns from real
 * conversions. That is the entire justification, and it is why the Pixel is
 * fired from the same track() calls rather than being instrumented separately —
 * one definition of "what counts as a conversion", not two that drift.
 *
 * OFF BY DEFAULT, and off is genuinely off: with no `meta_pixel_id` configured
 * this module never injects a script, never opens a connection, and nothing
 * about the site changes. There is no "loaded but idle" state.
 *
 * Cost, stated plainly, since tracking.ts's header argues against exactly this:
 * enabling it widens the CSP (connect.facebook.net for the script,
 * facebook.com for the tracking pixel image) and sets Meta's cookies, which
 * means a cookie/consent notice is owed wherever one is required. Those costs
 * are worth paying only while ads are actually running — so the setting is a
 * switch, and turning it off is one blank field, not a redeploy.
 */

const SRC = "https://connect.facebook.net/en_US/fbevents.js";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...args: unknown[]) => void };

declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

let initializedFor: string | null = null;

/**
 * Meta's standard events, mapped from our own funnel stages.
 *
 * Only the three that mean something to an ad system are mapped. The rest of
 * the funnel is ours to reason about and is not worth sending to Meta — every
 * extra event is more data leaving the site for no gain in delivery.
 *
 * "Lead" fires on request_success, NOT on request_submit: a submit that failed
 * is not a lead, and training the optimiser on failed submits teaches it to
 * find people whose requests break.
 */
const STANDARD_EVENTS: Record<string, string> = {
  request_form_open: "InitiateCheckout",
  request_success: "Lead",
  company_view: "ViewContent",
};

/**
 * Load and initialise the Pixel, once, for a given id. Safe to call on every
 * settings change: a repeat call with the same id (or with none) does nothing.
 */
export function initMetaPixel(pixelId: string | undefined | null): void {
  const id = (pixelId ?? "").trim();
  if (typeof window === "undefined" || id === "" || initializedFor === id) return;
  // A second, DIFFERENT id would mean two pixels double-counting on one page.
  // The setting changing mid-session is a configuration event, not a user one —
  // the next full load picks it up cleanly.
  if (initializedFor !== null) return;
  initializedFor = id;

  // Meta's snippet, minus the inline <script> the site's CSP forbids: the stub
  // below queues calls made before fbevents.js arrives, and the real
  // implementation drains the queue when it loads.
  const stub: Fbq = function (...args: unknown[]) {
    if (stub.callMethod) stub.callMethod(...args);
    else (stub.queue ??= []).push(args);
  } as Fbq;
  stub.queue = [];
  stub.loaded = true;
  stub.version = "2.0";
  window.fbq ??= stub;
  window._fbq ??= window.fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = SRC;
  document.head.appendChild(script);

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

/**
 * Mirror one funnel stage to the Pixel. A no-op unless the Pixel is configured
 * AND the stage is one of the three that mean something to an ad system.
 */
export function trackMetaPixel(stage: string): void {
  if (initializedFor === null || typeof window === "undefined" || !window.fbq) return;
  const event = STANDARD_EVENTS[stage];
  if (event) window.fbq("track", event);
}
