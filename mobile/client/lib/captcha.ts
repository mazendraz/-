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
