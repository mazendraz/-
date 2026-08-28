/**
 * "Continue with Apple" via expo-apple-authentication.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 * App Store Review guideline 4.8: an app that offers any third-party sign-in
 * must also offer Sign in with Apple. This app offers Google. So Apple sign-in
 * is not a feature choice here — without it the iOS build is rejected, and the
 * rejection arrives after the whole submission round-trip.
 *
 * ── Shape, versus googleAuth.ts ───────────────────────────────────────────
 * Google's flow is a hook, because it round-trips through a browser redirect and
 * the answer arrives asynchronously in a `response` object. Apple's is a native
 * modal that resolves a promise, so this is a plain async function and the
 * calling screen needs no effect and no ready-state.
 *
 * ── The name problem, which the backend also has to know about ────────────
 * Apple hands over the user's name EXACTLY ONCE, on the first authorization —
 * not on any later sign-in, not after a reinstall, not after the app is deleted.
 * It is never in the identity token, so the server cannot verify it and cannot
 * recover it later. That is why this returns the name as a separate field and
 * why api's appleIdentity.service treats it as untrusted decoration with a
 * fallback. Anything not captured on that first call is gone for good.
 *
 * ── The nonce ─────────────────────────────────────────────────────────────
 * Generated here, hashed before it goes to Apple, and sent to our server in its
 * original form. Apple embeds our hash in the token; the server hashes what we
 * sent it and checks the two match. That binds the token to this request, so a
 * token captured on its own cannot be replayed. See assertNonceMatches in
 * api/src/lib/services/appleIdentity.service.ts for the other half.
 *
 * ── What is NOT verified ──────────────────────────────────────────────────
 * This machine has no iPhone attached, and Sign in with Apple cannot run on
 * anything but a real iOS device or simulator with an Apple ID signed in. This
 * compiles against the shipped types in node_modules/expo-apple-authentication
 * (read directly, not from the docs page), but the round-trip has not been
 * exercised. See the setup note at the bottom of this file.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

/** What the sign-in screen posts to POST /api/v1/auth/apple. */
export interface AppleSignInPayload {
  identityToken: string;
  rawNonce: string;
  /** Present on a first authorization only — see the header. */
  fullName?: string;
  /**
   * Apple's one-time authorization code, valid for five minutes.
   *
   * NOT what signs the customer in — the identity token does that, and the
   * server would ignore this field entirely for that purpose. It exists so the
   * server can trade it (using the private key we never ship in the app) for a
   * refresh token, whose only job is to call Apple's /auth/revoke when the
   * customer deletes their account. Apple requires that call; see
   * api/src/lib/services/appleServerAuth.service.ts.
   *
   * Typed optional because the library types it nullable. Sign-in works fine
   * without it — the account simply has no revocable token on file until some
   * later sign-in supplies one.
   */
  authorizationCode?: string;
}

/**
 * Whether to render the Apple button.
 *
 * `isAvailableAsync()` is false on Android and on iOS below 13, and the button
 * component itself renders nothing when the native module is missing — so this
 * gates the surrounding layout (the divider, the spacing) rather than the button
 * alone, which would otherwise leave a gap on Android.
 */
export function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Run Apple's sign-in sheet.
 *
 * Resolves to `null` when the user dismisses the sheet — a cancel is a normal
 * outcome of a login screen, not an error worth showing a message for. Every
 * other failure throws.
 */
export async function signInWithApple(): Promise<AppleSignInPayload | null> {
  // The value the server will verify against. Hashed on the way to Apple,
  // original kept here — Apple echoes back exactly what it is given.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (isCancellation(err)) return null;
    throw err;
  }

  if (!credential.identityToken) {
    // Documented as nullable, and there is nothing to send without it. Fail with
    // a message a customer can act on rather than posting an empty token and
    // letting the server answer 401.
    throw new Error("مقدرناش نكمل مع Apple. جرّب تاني.");
  }

  return {
    identityToken: credential.identityToken,
    rawNonce,
    fullName: formatName(credential.fullName),
    // Unlike identityToken above, a missing code is NOT worth failing on: the
    // customer can sign in perfectly well without it, and refusing here would
    // trade a working login for a revocation nicety.
    authorizationCode: credential.authorizationCode ?? undefined,
  };
}

/**
 * Apple rejects with `ERR_REQUEST_CANCELED` when the sheet is dismissed.
 *
 * Matched on the `code` property rather than the message: the message is
 * localized to the device language, so a string match would work in English and
 * silently start surfacing "sign-in failed" alerts on an Arabic phone — which is
 * every phone this app is built for.
 */
function isCancellation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}

/**
 * Assemble the display name from Apple's tokenized parts.
 *
 * `formatFullName` is the library's locale-aware formatter, and it is used
 * rather than joining given + family by hand because the ordering is not
 * universal. Every part can be null even when the scope was granted, so an empty
 * result becomes `undefined` — "we have no name" — and the server picks a
 * fallback. Sending `""` instead would land in the same place but say something
 * different on the wire.
 */
function formatName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): string | undefined {
  if (!fullName) return undefined;
  const formatted = AppleAuthentication.formatFullName(fullName).trim();
  return formatted || undefined;
}

/*
 * ── Setup note: what has to be true before this works on a device ────────────
 *   1. app.json → ios.usesAppleSignIn: true. This is what makes the prebuild add
 *      the Sign in with Apple entitlement; without it the sheet fails at launch
 *      with an authorization error and nothing here can tell you why.
 *   2. The App ID (com.alassema.client) has the Sign in with Apple capability
 *      enabled in the Apple Developer portal, and the provisioning profile was
 *      regenerated AFTER that was turned on. EAS handles the regeneration.
 *   3. The server has APPLE_CLIENT_IDS set to include com.alassema.client, or
 *      the route answers 400 "not available" and the button is hidden.
 *   3b. For `authorizationCode` to be worth anything, the server also needs
 *      APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY /
 *      APPLE_TOKEN_ENCRYPTION_KEY. Without them sign-in still works and the code
 *      is simply discarded — but account deletion cannot notify Apple, which is
 *      its own review problem. See api/.env.example.
 *   4. It cannot be tested in Expo Go — the entitlement only exists in a build
 *      of this app. Use a development build.
 */
