/**
 * "Continue with Google" via expo-auth-session's Google provider.
 *
 * ── How this was found ────────────────────────────────────────────────────
 * This SDK version's docs page for auth-session shows a code example that
 * passes `clientSecret` into `exchangeCodeAsync`, directly beside a warning
 * that says never to embed a secret in app code — those two lines contradict
 * each other, and neither is what this file uses. Reading the ACTUAL shipped
 * type declarations (node_modules/expo-auth-session/build/providers/Google.d.ts)
 * instead of trusting the docs page turned up `useIdTokenAuthRequest`: a
 * Google-specific hook that returns `response.params.id_token` directly, with
 * no code exchange and no secret of any kind. It takes `webClientId` /
 * `iosClientId` / `androidClientId` — exactly the three client types Google
 * Cloud Console issues — and picks the right one for the running platform
 * internally.
 *
 * ── Where this lands ──────────────────────────────────────────────────────
 * Whatever token comes out, api's googleIdentity.service verifies it the same
 * way regardless of which client issued it (JWKS + audience check against
 * GOOGLE_CLIENT_IDS) — the backend needed zero mobile-specific code for this.
 *
 * ── What is NOT verified ──────────────────────────────────────────────────
 * This machine has no phone attached and no way to complete an OAuth browser
 * redirect. This compiles against the real shipped types, but the redirect
 * round-trip — and specifically whether Google accepts the redirect URI Expo
 * Go generates for the configured client — has not been exercised. See the
 * setup note at the bottom of this file for what to check on first run.
 */
import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";

// Required once per app load so the in-app browser sheet properly closes and
// hands control back to the app after Google redirects — without it a
// successful sign-in can leave the browser open on screen.
WebBrowser.maybeCompleteAuthSession();

// The Web client from phase 0 (api's GOOGLE_CLIENT_IDS) works as `webClientId`
// for Expo Go testing, but real iOS/Android clients should replace it before
// release — see the setup note below for why.
//
// `|| undefined` matters here, not just style: the .env template ships these
// as `""` (empty string) when unset, not absent. expo-auth-session's Google
// provider resolves the per-platform id as `config[iosClientId|androidClientId
// |webClientId] ?? config.clientId` — `??` only falls through on
// null/undefined, NOT on `""`. Left as `""`, iosClientId/androidClientId
// would be passed straight through as an empty string on a real device
// instead of falling back to the web client id, and Google's own web client
// ID request would be rejected downstream — silently, with no
// isGoogleSignInConfigured() signal, since `Boolean("")` is `false` there too
// but `""` still isn't `undefined` here. Normalizing blanks to `undefined` at
// the source makes both the visibility check AND the library's own fallback
// behave the way this file's comments already say they should.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || undefined;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;

export function isGoogleSignInConfigured(): boolean {
  return Boolean(WEB_CLIENT_ID || IOS_CLIENT_ID || ANDROID_CLIENT_ID);
}

export interface GoogleSignInHook {
  /** false until the auth request has finished building. */
  ready: boolean;
  /** Opens the Google sign-in browser sheet. */
  promptAsync: () => Promise<void>;
}

/**
 * `onToken` fires with a Google-signed ID token once the user completes the
 * flow. Nothing here reads the token's claims — same rule as the web client's
 * googleSignIn.ts: it is a JWT until OUR server checks its signature, and
 * anything decoded on-device before that point is attacker-controlled.
 */
export function useGoogleSignIn(onToken: (idToken: string) => void): GoogleSignInHook {
  // useIdTokenAuthRequest THROWS synchronously — during render, unconditionally
  // — if the client id for the RUNNING PLATFORM (iosClientId on iOS,
  // androidClientId on Android, webClientId elsewhere — see the library's
  // Platform.select in providers/Google.js) is undefined. That fires
  // regardless of whether the Google button is ever shown, because hooks can't
  // be called conditionally: this component always calls this hook, even when
  // isGoogleSignInConfigured() is false and the button is hidden.
  //
  // Caught by the render check, not by reading the docs: without a fallback,
  // ANY environment missing the Google env vars — a fresh dev checkout, this
  // very Playwright render — crashed the whole app on the sign-in screen,
  // Google button or not.
  //
  // The fix reads the same source: `config[platformProperty] ?? config.clientId`,
  // so a generic `clientId` is the fallback for every platform, not just one.
  // The placeholder is never used for a real request — promptAsync is only
  // reachable through the button that isGoogleSignInConfigured() hides.
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID ?? "unconfigured",
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success" && response.params.id_token) {
      onToken(response.params.id_token);
    }
    // `onToken` intentionally excluded: it's a fresh closure per render from
    // the caller, and re-running this effect for that would re-fire onToken
    // for a response object that hasn't actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    ready: request !== null,
    promptAsync: async () => {
      await promptAsync();
    },
  };
}

/**
 * ── Setup note — the one piece of phase 3 that needs a phone to finish ──────
 *
 * 1. Google Cloud Console → Credentials → Create an iOS client (bundle id
 *    com.alassema.client, matching app.json) and an Android client (package
 *    com.alassema.client, SHA-1 from `eas credentials` or the Expo Go dev
 *    keystore for testing). Neither has a secret — Google issues native
 *    clients as public/secretless by design.
 * 2. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / _ANDROID_CLIENT_ID in
 *    mobile/client/.env (EXPO_PUBLIC_GOOGLE_CLIENT_ID for the Web client, used
 *    as the Expo Go fallback).
 * 3. Add the SAME ids to the API's GOOGLE_CLIENT_IDS (api/.env) — the
 *    audience check in googleIdentity.service rejects tokens issued to a
 *    client it doesn't recognize, by design (see that file's comment).
 * 4. `npx expo start` → open in Expo Go → tap the sign-in button → confirm the
 *    browser sheet opens, completes, and returns to the app with a session.
 */
