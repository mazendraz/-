/**
 * Where the tokens live on-device.
 *
 * Shared by both apps — the customer client and the staff Business App both
 * hold a refresh token that can live for weeks (60 days for a customer, 30 for
 * staff; see api's customerSession.service / staffSession.service for why the
 * two differ). expo-secure-store, not AsyncStorage: it's backed by iOS
 * Keychain and Android Keystore — hardware-backed on most devices — rather
 * than a plain file any app with storage access could in principle read.
 * AsyncStorage is the wrong tier of trust for a credential that long-lived.
 *
 * Mirrors each app's own auth-state module (the website's customerAuth.ts,
 * this app's own customerAuth.ts / staffAuth.ts) one level down: that module
 * owns SESSION STATE (who is signed in, broadcasting changes to its own hook);
 * this owns STORAGE (getting bytes on and off the device) plus the small
 * cross-cutting pub/sub below that every consumer shares regardless of which
 * population it authenticates. The split matters here in a way it doesn't on
 * the web, because the web has exactly one storage primitive and a phone has
 * two — SecureStore for secrets, a plain key for the non-secret cached profile
 * — and mixing that concern into the state module would make it non-obvious
 * which write needs which.
 */
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "al-assema-access-token";
const REFRESH_TOKEN_KEY = "al-assema-refresh-token";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Web has no SecureStore ────────────────────────────────────────────────────
// expo-secure-store's own docs list its supported platforms as iOS, Android,
// tvOS and Expo Go — web is absent, deliberately (there is no OS keychain for
// a browser tab to call into). Every function below left unguarded would
// reject on web before a single network request went out: caught only by
// building a Playwright render check for the authenticated screens, which
// found every one of them landing back on sign-in with no visible error,
// because apiFetch's unguarded `await getAccessToken()` rejected before
// `fetch` was ever called.
//
// Expo Router treats web as a first-class export target (`expo export
// --platform web`, used for exactly this kind of render verification, and
// potentially a real companion site later) — so this isn't a test-only
// affordance.
//
// ── Why web now STORES the tokens instead of dropping them ──────────────────
// The previous version made every function here a no-op on web, on the theory
// that this degrades to "no persisted session across reloads". That was wrong,
// and it broke the web build outright: getAccessToken() returned null
// IMMEDIATELY — not just after a reload — so apiFetch never attached an
// Authorization header at all, while customerAuth's in-memory `customer` state
// still said "signed in". The UI therefore rendered the authenticated shell
// (Requests / Messages / Account tabs) while every request behind it came back
// 401 "Authentication required", which is exactly what a customer saw after
// signing in and placing an order. Worse, POST /leads accepts anonymous
// submissions (api's optionalCustomerId), so the order itself SUCCEEDED but
// was never linked to the account — it simply vanished from "My Requests".
//
// sessionStorage, not localStorage, and not AsyncStorage: the refresh token is
// good for up to 60 days (api's customerSession.service REFRESH_TTL_MS) and
// the module comment above is right that it deserves better than
// read-by-anything storage. sessionStorage keeps it out of persistent disk
// storage and scopes it to the one tab, which survives the page reloads that
// actually matter in development while narrowing the XSS exposure window to a
// single browsing session.
//
// ⚠️ If this app is ever deployed as a real public web build, this is NOT the
// end state: the website (app/) deliberately uses an httpOnly session cookie
// so no script can read the credential at all, and a shipped mobile-on-web
// build should move to the same mechanism rather than inherit this.
const SECURE_STORE_AVAILABLE = Platform.OS !== "web";

// Guarded for the prerender/SSR pass of `expo export --platform web`, which
// evaluates modules in Node where `window` does not exist.
function webStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage access can throw outright when cookies/site-data are blocked.
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  if (!SECURE_STORE_AVAILABLE) {
    const store = webStore();
    store?.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    store?.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    return;
  }
  // Sequential, not Promise.all: if the refresh token write fails after the
  // access token succeeds, the caller sees a rejection and can retry — one
  // partial state (access saved, refresh missing) is recoverable by re-running
  // this function, whereas the two writes racing is not a scenario that needs
  // to exist for no benefit.
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  if (!SECURE_STORE_AVAILABLE) return webStore()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (!SECURE_STORE_AVAILABLE) return webStore()?.getItem(REFRESH_TOKEN_KEY) ?? null;
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/** Update just the access token — what a successful refresh does. */
export async function saveAccessToken(accessToken: string): Promise<void> {
  if (!SECURE_STORE_AVAILABLE) {
    webStore()?.setItem(ACCESS_TOKEN_KEY, accessToken);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}

export async function clearTokens(): Promise<void> {
  if (!SECURE_STORE_AVAILABLE) {
    const store = webStore();
    store?.removeItem(ACCESS_TOKEN_KEY);
    store?.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ── "The session died out from under the app" ──────────────────────────────
// api.ts's refreshAccessToken clears the tokens itself when the server
// rejects the refresh token (expired, revoked, or reuse-detected) — but until
// this existed, that was the ENTIRE reaction: nothing told customerAuth.ts's
// in-memory `customer` snapshot the session was gone, because importing
// customerAuth from api.ts (to call setCustomer(null) directly) would be
// circular — customerAuth already imports FROM api.ts. The result was a
// signed-out access token paired with a UI that still believed it was signed
// in: the tab bar kept the authenticated shell up, Account/Requests/Messages
// stayed reachable, and every request behind them 401'd, recoverable only by
// force-quitting (see bootstrapSession, which is the only other place
// customer state gets cleared from a dead session — but only at the NEXT
// cold start).
//
// session.ts is the one module both api.ts and each app's own auth-state
// module (customerAuth.ts / staffAuth.ts) already import, so it's the natural
// place for the pub/sub between them — same shape as api.ts's own
// onReachabilityChange, one level down the dependency graph.
type AuthInvalidatedListener = () => void;
const invalidatedListeners = new Set<AuthInvalidatedListener>();

/** Subscribe to "the stored session was invalidated by the SERVER" — never
 *  fired by an intentional sign-out or account deletion, which already
 *  update the app's own auth state at their own call sites. */
export function onAuthInvalidated(listener: AuthInvalidatedListener): () => void {
  invalidatedListeners.add(listener);
  return () => invalidatedListeners.delete(listener);
}

/** Clear the stored tokens and tell every onAuthInvalidated subscriber the
 *  session is gone. Use this (not plain clearTokens()) specifically when the
 *  SERVER is the one that killed the session — a refresh call that came back
 *  rejected — as opposed to a flow the app itself initiated. */
export async function invalidateSession(): Promise<void> {
  await clearTokens();
  invalidatedListeners.forEach((l) => l());
}

// ── The signed-in subject, shared across every module in this package ──────
//
// liveEvents.ts and push.ts both need to know WHO is signed in — to point the
// SSE stream and the push-device registration at the right account — but
// neither can import the app's own auth-state module (customerAuth.ts in one
// app, staffAuth.ts in the other) without coupling this shared package to one
// specific population. That coupling is exactly what phase 1 of the mobile
// plan (docs/architecture/business-app/phase-1-shared-package.md) set out to
// remove.
//
// So the dependency runs the other way: each app's own auth-state module
// calls setAuthSubject() whenever its signed-in id changes (on sign-in,
// sign-out, and session bootstrap), and this package's own hooks read it back
// via useAuthSubject() — the same useSyncExternalStore shape every store in
// these apps already uses. Neither side needs to know the other's population;
// both just agree on "the current subject id, or null."
let authSubjectId: string | null = null;
const authSubjectListeners = new Set<() => void>();

/** Called by the app's own auth-state module whenever who's signed in
 *  changes. A no-op when nothing actually changed, so re-deriving this from
 *  a snapshot on every render costs nothing beyond the first call. */
export function setAuthSubject(id: string | null): void {
  if (id === authSubjectId) return;
  authSubjectId = id;
  authSubjectListeners.forEach((l) => l());
}

/** The current subject id outside a component — for the rare case a plain
 *  function needs it rather than a hook (mirrors getAccessToken's shape). */
export function getAuthSubject(): string | null {
  return authSubjectId;
}

function subscribeAuthSubject(listener: () => void): () => void {
  authSubjectListeners.add(listener);
  return () => authSubjectListeners.delete(listener);
}

/** The signed-in subject id (customer or staff, whichever app this is),
 *  reactive. liveEvents.ts and push.ts subscribe through this instead of
 *  importing either app's auth-state module directly. */
export function useAuthSubject(): string | null {
  return useSyncExternalStore(
    subscribeAuthSubject,
    () => authSubjectId,
    () => authSubjectId,
  );
}
