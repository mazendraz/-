/**
 * Frontend CAPTCHA (Cloudflare Turnstile) config — the mobile counterpart of
 * the website's lib/captcha.ts. The widget only renders when
 * EXPO_PUBLIC_TURNSTILE_SITE_KEY is set — otherwise it's a no-op and forms
 * submit exactly as before (the backend honeypot + rate limit still apply).
 * When the key IS set, it must pair with the backend's TURNSTILE_SECRET_KEY,
 * or submits are rejected — see api's captcha.ts.
 *
 * Confirmed via api/src/lib/middleware/captcha.ts that Turnstile is the
 * server's preferred/actually-used provider (the website never renders a
 * reCAPTCHA widget at all) — this only implements Turnstile.
 */
const SITE_KEY = (process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

/** True when a Turnstile site key is configured (so the widget should render). */
export function captchaConfigured(): boolean {
  return Boolean(SITE_KEY);
}

export function turnstileSiteKey(): string {
  return SITE_KEY;
}

/**
 * The origin the Turnstile widget must believe it is running on.
 *
 * A site key is bound to a DOMAIN LIST in the Cloudflare dashboard, and the
 * widget checks `location.hostname` against it before it will issue a token.
 * The native <Captcha> renders its HTML inside a WebView, and an HTML string
 * with no base URL loads as `about:blank` — hostname "" — which matches
 * nothing, so Turnstile answered every render with error 110200 ("domain not
 * allowed"), the error-callback fired instead of the token callback, and the
 * request form stayed stuck on "استنى ثانية لحد ما التحقق يخلص" forever. That
 * is the "I can't send a request, there's a Cloudflare problem" report: with
 * a secret configured server-side, no token means a 400, so there was no way
 * through at all on a device.
 *
 * Derived from the configured API URL rather than hardcoded so it cannot
 * drift from whatever host this build actually talks to — the same
 * "strip the /api/vN suffix" rule assetUrl.ts uses for media.
 *
 * NOTE: the host this returns must be listed on the site key in Cloudflare's
 * dashboard (Turnstile → the widget → Domain Management), exactly as the
 * website's own host already is.
 */
export function captchaOrigin(): string {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();
  const origin = base.replace(/\/api(\/v\d+)?\/?$/, "").replace(/\/$/, "");
  return /^https?:\/\//.test(origin) ? origin : "";
}
