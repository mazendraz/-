// Frontend CAPTCHA (Cloudflare Turnstile) config. The widget only renders when
// VITE_TURNSTILE_SITE_KEY is set — otherwise it's a no-op and forms submit exactly
// as before (the backend honeypot + rate limit still apply). When the key IS set,
// it must pair with the backend's TURNSTILE_SECRET_KEY, or submits are rejected.
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();

/** True when a Turnstile site key is configured (so the widget should render). */
export function captchaConfigured(): boolean {
  return Boolean(SITE_KEY);
}

export function turnstileSiteKey(): string {
  return SITE_KEY;
}
