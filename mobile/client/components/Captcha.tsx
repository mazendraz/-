import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { captchaConfigured, turnstileSiteKey } from "../lib/captcha";

/**
 * Cloudflare Turnstile widget — the mobile counterpart of the website's
 * Captcha.tsx. Renders nothing when no site key is configured
 * (captchaConfigured() === false), so without EXPO_PUBLIC_TURNSTILE_SITE_KEY
 * set this is a no-op and forms behave exactly as before (the backend
 * honeypot + rate limit still apply — see api's captcha.ts).
 *
 * There is no official Turnstile SDK for React Native, so this loads the
 * real widget inside a small WebView — the standard workaround (Cloudflare's
 * own docs point at embedding the web widget for non-browser clients) — and
 * relays the token back via `window.ReactNativeWebView.postMessage`.
 *
 * `resetSignal`: bumping it remounts the WebView (via `key`) for a fresh
 * challenge/token, since Turnstile tokens are single-use — simpler and more
 * reliable across RN WebView versions than trying to call the JS-side
 * `turnstile.reset()` through a second round of postMessage plumbing.
 */
export default function Captcha({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const [height, setHeight] = useState(70);

  if (!captchaConfigured()) return null;

  function onMessage(e: WebViewMessageEvent) {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { type: string; token?: string | null };
      if (data.type === "token") onToken(data.token ?? null);
    } catch {
      /* malformed message — ignore, same as a failed/expired challenge */
    }
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        key={resetSignal}
        source={{ html: buildHtml(turnstileSiteKey()) }}
        onMessage={onMessage}
        originWhitelist={["*"]}
        style={styles.webview}
        scrollEnabled={false}
        // The widget's own background is transparent; without this the
        // WebView paints an opaque white rectangle even before content loads.
        containerStyle={{ backgroundColor: "transparent" }}
        onError={() => onToken(null)}
        // A slightly taller box on first paint so a compact-theme widget
        // (Turnstile decides its own size server-side, per site key config)
        // isn't clipped; harmless if the real widget renders shorter.
        onLoadEnd={() => setHeight(80)}
      />
    </View>
  );
}

function buildHtml(siteKey: string): string {
  // The site key is a public, non-secret identifier (same trust level as a
  // Google OAuth client id) — safe to inline directly, no escaping beyond
  // what a normal alphanumeric key needs.
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin:0; padding:0; background:transparent; }
  body { display:flex; align-items:center; justify-content:center; }
</style>
</head>
<body>
<div id="cf-turnstile"></div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
<script>
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  window.onloadTurnstileCallback = function () {
    if (!window.turnstile) return;
    turnstile.render('#cf-turnstile', {
      sitekey: '${siteKey}',
      callback: function (token) { post({ type: 'token', token: token }); },
      'expired-callback': function () { post({ type: 'token', token: null }); },
      'error-callback': function () { post({ type: 'token', token: null }); }
    });
  };
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { alignSelf: "stretch", backgroundColor: "transparent" },
  webview: { backgroundColor: "transparent" },
});
