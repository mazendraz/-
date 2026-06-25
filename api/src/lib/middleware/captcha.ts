// CAPTCHA verification for public submit endpoints (lead/site-review/review).
// Supports Cloudflare Turnstile (preferred — free, privacy-friendly) or Google
// reCAPTCHA. When NEITHER secret is configured it's a NO-OP, so the feature can
// be switched on entirely via env — the honeypot + rate limit guard until then.
//
// NOTE: enabling a secret REQUIRES the frontend to render the matching widget
// and send its token, or every submit will be rejected for a missing token.
import { ValidationError } from "@/lib/utils/errors";

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

interface Provider {
  secret: string;
  url: string;
}

function provider(): Provider | null {
  if (TURNSTILE_SECRET) {
    return {
      secret: TURNSTILE_SECRET,
      url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    };
  }
  if (RECAPTCHA_SECRET) {
    return {
      secret: RECAPTCHA_SECRET,
      url: "https://www.google.com/recaptcha/api/siteverify",
    };
  }
  return null;
}

/** True when a CAPTCHA secret is configured (so the frontend must send a token). */
export function captchaEnabled(): boolean {
  return provider() !== null;
}

/**
 * Verify a CAPTCHA token. No-op when unconfigured. When configured, a missing or
 * invalid token throws a 400. If the verifier itself is unreachable we fail OPEN
 * (the honeypot + rate limit still apply) rather than block legitimate users.
 */
export async function verifyCaptcha(
  token: string | undefined,
  ip?: string,
): Promise<void> {
  const p = provider();
  if (!p) return; // not configured

  if (!token || typeof token !== "string") {
    throw new ValidationError("CAPTCHA verification required", {
      captcha: ["Missing CAPTCHA token"],
    });
  }

  let success = false;
  try {
    const body = new URLSearchParams({ secret: p.secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(p.url, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    success = data.success === true;
  } catch (err) {
    console.error("[captcha] verifier unreachable — allowing through:", err);
    return; // fail open
  }

  if (!success) {
    throw new ValidationError("CAPTCHA verification failed", {
      captcha: ["Invalid CAPTCHA — please try again"],
    });
  }
}
