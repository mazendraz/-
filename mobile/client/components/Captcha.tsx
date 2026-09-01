import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors, type } from "@alassema/core";
import { rowStart } from "@alassema/mobile-shared";
import CaptchaDom from "./CaptchaDom";
import Icon from "./Icon";
import { captchaConfigured, captchaOrigin, turnstileSiteKey } from "../lib/captcha";

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
 * ── The `baseUrl`, which is the whole reason this used to fail ─────────────
 * A site key is bound to a domain list, and the widget refuses to issue a
 * token unless `location.hostname` is on it. An HTML string handed to a
 * WebView with no base URL loads as `about:blank` — hostname "" — so on a
 * real device Turnstile answered every single render with error 110200 and
 * no token ever arrived. With a secret configured server-side that is a hard
 * block: the request form could not be submitted at all. `baseUrl` makes the
 * WebView report the real site origin (see lib/captcha.ts's captchaOrigin),
 * which is already on the key's domain list because the website itself runs
 * there.
 *
 * ── And a way out when it still fails ─────────────────────────────────────
 * A silently-failing challenge is indistinguishable from a slow one, which is
 * how "the form just never lets me send" happened. So a failure (or a
 * challenge that never answers at all) now says so in Arabic and offers
 * "أعد المحاولة" instead of leaving a blank box above a button that will
 * never enable.
 *
 * `resetSignal`: bumping it remounts the WebView (via `key`) for a fresh
 * challenge/token, since Turnstile tokens are single-use — simpler and more
 * reliable across RN WebView versions than trying to call the JS-side
 * `turnstile.reset()` through a second round of postMessage plumbing.
 *
 * On web, none of that applies and react-native-webview has no implementation
 * at all — it renders the red "React Native WebView does not support this
 * platform." string and no token ever arrives, which blocks every form that
 * uses it. So the browser gets CaptchaDom instead, which renders the real
 * Turnstile widget into the DOM.
 *
 * The switch is an explicit `Platform.OS` branch rather than a `Captcha.web.tsx`
 * platform-extension file: the extension is the idiomatic form, but resolving
 * it depends on Metro picking up a NEWLY ADDED file, which a warm dev-server
 * cache does not do until it is restarted with --clear. A branch inside the
 * one module both platforms already import cannot miss.
 */

/** How long a challenge may stay silent before it is treated as broken. The
 *  real widget resolves in well under a second on any working connection;
 *  this only exists so a challenge that will NEVER answer stops looking like
 *  one that is still thinking. */
const WATCHDOG_MS = 12000;

export default function Captcha({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const [height, setHeight] = useState(70);
  /** Bumped by the retry button — combined with `resetSignal` into the
   *  WebView's `key`, so either source of a reset remounts it. */
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const settled = useRef(false);

  const attempt = `${resetSignal}-${retry}`;

  // One watchdog per attempt. Cleared as soon as the challenge answers either
  // way; if it never does, the customer gets the retry affordance rather than
  // an eternally disabled submit button.
  useEffect(() => {
    if (!captchaConfigured() || Platform.OS === "web") return;
    settled.current = false;
    setFailed(null);
    const t = setTimeout(() => {
      if (!settled.current) setFailed("التحقق من Cloudflare مش راضي يخلّص.");
    }, WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [attempt]);

  if (!captchaConfigured()) return null;
  if (Platform.OS === "web") return <CaptchaDom onToken={onToken} resetSignal={resetSignal} />;

  function fail(message: string) {
    settled.current = true;
    setFailed(message);
    onToken(null);
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const data = JSON.parse(e.nativeEvent.data) as {
        type: string;
        token?: string | null;
        code?: string;
      };
      if (data.type === "token") {
        settled.current = true;
        setFailed(null);
        onToken(data.token ?? null);
        return;
      }
      if (data.type === "expired") {
        // Not a failure — the token simply aged out. Clearing it lets the
        // widget hand over a fresh one on its own.
        onToken(null);
        return;
      }
      if (data.type === "error") {
        // 110200 is Turnstile's "this hostname is not on the site key's
        // domain list" — the exact failure `baseUrl` above exists to avoid,
        // so name it rather than showing the same generic line as a dropped
        // connection would.
        fail(
          data.code === "110200"
            ? "نطاق التحقق مش مسموح به على مفتاح Cloudflare."
            : "التحقق من Cloudflare فشل.",
        );
      }
    } catch {
      /* malformed message — ignore, same as a failed/expired challenge */
    }
  }

  if (failed) {
    return (
      <View style={styles.failBox}>
        <Icon name="report_problem" size={18} color={colors.onErrorContainer} />
        <Text style={styles.failText}>{failed} جرّب تاني.</Text>
        <Pressable
          onPress={() => setRetry((n) => n + 1)}
          accessibilityRole="button"
          accessibilityLabel="إعادة محاولة التحقق"
          hitSlop={8}
          style={({ pressed }) => [styles.retryBtn, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>أعد المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        key={attempt}
        // `baseUrl` is load-bearing — see this file's header comment.
        source={{ html: buildHtml(turnstileSiteKey()), baseUrl: captchaOrigin() }}
        onMessage={onMessage}
        // The content is served under the site's own origin (baseUrl above),
        // and Turnstile's widget script pulls in its own challenge iframe
        // from Cloudflare's domain — both need to be allowed to load.
        // Nothing else does: this WebView has exactly one job, and pinning it
        // stops the widget's script (or a compromised/malicious CDN response)
        // from navigating this surface to an arbitrary page.
        // onShouldStartLoadWithRequest below is the one that actually blocks
        // disallowed navigation; this only controls which origins the WebView
        // itself will render into.
        originWhitelist={["about:*", captchaOrigin(), "https://challenges.cloudflare.com"]}
        onShouldStartLoadWithRequest={(request) =>
          request.url.startsWith("about:") ||
          request.url.startsWith(`${captchaOrigin()}/`) ||
          request.url === captchaOrigin() ||
          /^https:\/\/([a-z0-9-]+\.)*cloudflare\.com\//.test(request.url)
        }
        // No legitimate reason for this widget to open a new window/tab —
        // disabling it closes off window.open() as an escape from the
        // navigation pin above.
        setSupportMultipleWindows={false}
        style={styles.webview}
        scrollEnabled={false}
        // The widget's own background is transparent; without this the
        // WebView paints an opaque white rectangle even before content loads.
        containerStyle={{ backgroundColor: "transparent" }}
        onError={() => fail("تعذّر تحميل التحقق.")}
        onHttpError={() => fail("تعذّر تحميل التحقق.")}
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
  // The script itself failing to load is silent otherwise — the onload
  // callback simply never runs and the box sits empty forever.
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName === 'SCRIPT') post({ type: 'error', code: 'script' });
  }, true);
  window.onloadTurnstileCallback = function () {
    if (!window.turnstile) { post({ type: 'error', code: 'noapi' }); return; }
    try {
      turnstile.render('#cf-turnstile', {
        sitekey: '${siteKey}',
        callback: function (token) { post({ type: 'token', token: token }); },
        'expired-callback': function () { post({ type: 'expired' }); },
        // Turnstile passes the numeric error code here (110200 = the
        // hostname is not on this site key's domain list) — relaying it is
        // what lets the RN side say which failure this is.
        'error-callback': function (code) { post({ type: 'error', code: String(code) }); }
      });
    } catch (err) {
      post({ type: 'error', code: 'render' });
    }
  };
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { alignSelf: "stretch", backgroundColor: "transparent" },
  webview: { backgroundColor: "transparent" },
  failBox: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.errorContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  failText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: type.caption.fontSize,
    color: colors.onErrorContainer,
    textAlign: "right",
    lineHeight: 18,
  },
  retryBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceContainerLowest,
  },
  retryPressed: { opacity: 0.7 },
  retryText: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.caption.fontSize,
    color: colors.onErrorContainer,
  },
});
