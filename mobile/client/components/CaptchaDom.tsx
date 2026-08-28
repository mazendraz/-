import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { captchaConfigured, turnstileSiteKey } from "../lib/captcha";

/**
 * The DOM implementation of <Captcha>, used when the app runs in a browser
 * (expo start --web / expo export --platform web). <Captcha> switches to it on
 * `Platform.OS === "web"`; nothing here ever executes on a device.
 *
 * It exists because <Captcha> loads the Turnstile widget inside a
 * `react-native-webview`, and that library has no web implementation: on web
 * it renders the literal red string "React Native WebView does not support
 * this platform." in the middle of every form that has a captcha — the request
 * form, the waitlist, feedback and the site review — and since no token ever
 * arrives, submit stays blocked on "استنى ثانية لحد ما التحقق يخلص". Orders
 * simply could not be sent from a browser.
 *
 * A WebView on web is pointless anyway: the browser IS the web view. So this
 * mirrors the website's own Captcha.tsx — load Turnstile's script once and
 * render the real widget straight into the DOM node behind a <View>
 * (react-native-web's host node for a View is a plain <div>).
 */

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

/** Load the Turnstile script exactly once across the app. */
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
  const containerRef = useRef<View>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!captchaConfigured()) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        // react-native-web hands back the real DOM element for a View ref;
        // RN's own types can't express that, hence the cast.
        const el = containerRef.current as unknown as HTMLElement | null;
        if (cancelled || !el || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(el, {
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

  // Tokens are single-use: a retry after a failed submit needs a fresh one.
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onToken(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  if (!captchaConfigured()) return null;

  return <View ref={containerRef} style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { alignSelf: "center", marginVertical: 4, minHeight: 70 },
});
