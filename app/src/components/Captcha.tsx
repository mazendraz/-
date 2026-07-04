// Cloudflare Turnstile widget. Renders nothing when no site key is configured
// (captchaConfigured() === false), so in localStorage/demo mode and any deploy
// without VITE_TURNSTILE_SITE_KEY this is a no-op and forms behave exactly as
// before. When configured it loads the Turnstile script once, renders the widget,
// and reports the token to the parent via onToken (null on expiry/error).
//
// Bump `resetSignal` to reset the widget after a failed submit — Turnstile tokens
// are single-use, so a retry needs a fresh challenge.
import { useEffect, useRef } from "react";
import { captchaConfigured, turnstileSiteKey } from "../lib/captcha";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

// Load the Turnstile script exactly once across the app.
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function Captcha({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Render the widget once on mount (only when configured).
  useEffect(() => {
    if (!captchaConfigured()) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey(),
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the widget (and clear the consumed token) when the parent asks.
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onToken(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  if (!captchaConfigured()) return null;
  return <div ref={containerRef} className="flex justify-center my-1" />;
}
