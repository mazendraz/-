/**
 * Customer session state — the mobile counterpart of app's lib/customerAuth.ts.
 *
 * Same split as the website: this module owns WHO is signed in and broadcasts
 * changes; lib/session.ts owns the on-device bytes. The event mechanism is the
 * one thing that has to differ — there's no `window` to dispatch a
 * CustomEvent on — so this uses `useSyncExternalStore`, React's own primitive
 * for exactly this (external state a component subscribes to).
 *
 * Sends `device` on every sign-in call, which is what makes the SERVER issue a
 * refresh token at all (see api's customerSignIn.ts) — the website omits it and
 * gets only a cookie. That one field is the entire fork between "this is a
 * phone" and "this is a browser" as far as the backend is concerned.
 */
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import type { ApiCustomer } from "@alassema/core";
import { apiGet, apiPost, isApiConfigured, ApiError } from "./api";
import { clearTokens, getRefreshToken, onAuthInvalidated, saveTokens } from "./session";
import { claimDeviceLeads } from "./customerLeads";
import { unregisterPush } from "./push";

export type Customer = ApiCustomer;
export type SignInOutcome = "created" | "linked" | "returning";

interface CustomerAuthResponse {
  token: string;
  refreshToken?: string;
  customer: Customer;
  outcome: SignInOutcome;
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface Snapshot {
  customer: Customer | null;
  loading: boolean;
}

let snapshot: Snapshot = { customer: null, loading: true };
const listeners = new Set<() => void>();

// useSyncExternalStore requires getSnapshot to return the SAME reference when
// nothing changed, or React re-renders forever (it re-subscribes every render
// believing the store changed). A fresh `{ customer, loading }` object on every
// call would silently break that contract, so state only ever changes by
// replacing this one object — never by mutating its fields in place.
function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function setCustomer(next: Customer | null) {
  setSnapshot({ customer: next });
}

function setLoading(next: boolean) {
  setSnapshot({ loading: next });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The server-side counterpart of a dead session (a rejected refresh token —
// see session.ts's invalidateSession, which api.ts's refreshAccessToken calls
// instead of clearing tokens silently). Module-level, not inside a hook: this
// has to fire regardless of which — if any — component holding
// useCustomerAuth() happens to be mounted at the moment the refresh fails.
onAuthInvalidated(() => setCustomer(null));

// Device descriptor sent with every sign-in — see the module comment. A real
// device name (Constants.deviceName) is what the /account devices list shows;
// Platform.OS is the "ios" | "android" the schema stores. deviceName isn't
// guaranteed non-null on every runtime, so it's optional to the API too.
//
// `platform` is sent ONLY when it really is one of those two. Under
// `expo start --web` (the render-verification surface — see lib/session.ts)
// Platform.OS is "web", which the API's deviceSchema rejects outright:
// `z.enum(["ios","android"])`. The previous `Platform.OS as "ios" | "android"`
// cast silenced TypeScript about exactly that case, so every sign-in and
// registration from the web build failed with a 400 "Validation failed" and no
// hint as to why. The field is optional server-side, so omitting it keeps the
// `device` object present — which is what signals "issue a refresh token" —
// without lying about which platform this is.
function deviceInfo() {
  const os = Platform.OS;
  const platform = os === "ios" || os === "android" ? os : undefined;
  return {
    deviceName: Constants.deviceName ?? (os === "web" ? "Web" : undefined),
    platform,
  };
}

async function applySignIn(res: CustomerAuthResponse): Promise<SignInOutcome> {
  // refreshToken is only ABSENT if the server didn't get `device` — which every
  // call site below always sends, so its absence here would mean the request
  // shape and the server's expectation have drifted, not a normal case to
  // silently tolerate.
  if (!res.refreshToken) {
    throw new Error("Server did not issue a refresh token for a device sign-in.");
  }
  await saveTokens({ accessToken: res.token, refreshToken: res.refreshToken });
  setCustomer(res.customer);
  // Fire-and-forget, AFTER the tokens are stored (it makes an authenticated
  // call) and deliberately not awaited: attaching this device's past requests
  // to the account is a recovery nicety, and sign-in must not wait on it or
  // fail because of it. See claimDeviceLeads for why the app needs this at all.
  void claimDeviceLeads();
  return res.outcome;
}

/** Exchange a verified Google ID token for a session. */
export async function signInWithGoogle(idToken: string): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/google", {
    idToken,
    device: deviceInfo(),
  });
  return applySignIn(res);
}

/**
 * Exchange an Apple identity token for our session.
 *
 * Four fields where Google needs one. `rawNonce` is what the server hashes to
 * check against the nonce Apple signed into the token — see appleAuth.ts.
 * `fullName` is present ONLY on a customer first authorization; Apple never
 * sends it again, so it is passed through when present and absent thereafter.
 * `authorizationCode` has nothing to do with signing in — the server trades it
 * for the token it needs to revoke this app's access if the account is ever
 * deleted. All of them are forwarded as-is; the server decides what to do with
 * them.
 */
export async function signInWithApple(payload: {
  identityToken: string;
  rawNonce: string;
  fullName?: string;
  authorizationCode?: string;
}): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/apple", {
    ...payload,
    device: deviceInfo(),
  });
  return applySignIn(res);
}

export interface RegisterResult {
  verificationSent: boolean;
}

/** Create a password account. No session — inert until the emailed link is
 *  clicked (see api's customerPassword.service). */
export async function registerWithPassword(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  return apiPost<RegisterResult>("/auth/customer/register", input);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/login", {
    email,
    password,
    device: deviceInfo(),
  });
  return applySignIn(res);
}

/** Complete verification from the emailed link's token (deep-linked in from
 *  the mail client — see the AASA file from phase 0). Signs in on success. */
export async function verifyEmailToken(token: string): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/verify", {
    token,
    device: deviceInfo(),
  });
  return applySignIn(res);
}

/**
 * Ask for another verification link. Resolves to whether the mail actually
 * went out — `false` means the server accepted the request but the mail
 * transport refused it, so the caller must NOT tell the customer to go check
 * an inbox. See api's resend-verification route for why an unknown address
 * still reports `true`.
 */
export async function resendVerification(email: string): Promise<boolean> {
  const res = await apiPost<{ sent?: boolean }>("/auth/customer/resend-verification", { email });
  // Defaults to true so an older API build (which returned `{sent:true}`
  // unconditionally, or no body at all) keeps its previous behaviour rather
  // than reading as a failure.
  return res?.sent !== false;
}

/** Start a password reset — always resolves, whether or not the address has
 *  an account, so the caller can show the same "check your inbox" copy. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiPost("/auth/customer/forgot-password", { email });
}

/** Complete a password reset from the emailed link's token (deep-linked in,
 *  same mechanism as verifyEmailToken above). Signs in on success and revokes
 *  every other device's session — see api's resetPassword for why. */
export async function resetPassword(token: string, password: string): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/reset-password", {
    token,
    password,
    device: deviceInfo(),
  });
  return applySignIn(res);
}

export async function customerLogout(): Promise<void> {
  // Forget this phone's push token BEFORE the access token is cleared below —
  // the unregister route requires auth (see push-device/route.ts's DELETE),
  // and without this the previous owner of a shared phone keeps receiving
  // notifications for an account they've just signed out of.
  await unregisterPush().catch(() => {});
  try {
    const refreshToken = await getRefreshToken();
    // Tells the server to revoke THIS device's session — without it, sign-out
    // would only forget the token locally and leave a 60-day credential live
    // on the server for anyone who captured it before the local wipe.
    await apiPost("/auth/customer/logout", refreshToken ? { refreshToken } : {});
  } catch {
    /* best-effort — tokens are cleared locally regardless */
  }
  // Leave for a screen that does not need an account BEFORE clearing the state
  // that the account gates watch. The gates are focus-scoped (see
  // authGate.ts's useRequireAccount), so whichever screen is on top when
  // `customer` goes null is the one that decides where the customer ends up —
  // and signing out should put them in the guest app, not back at a sign-in
  // form. Doing it in the other order made sign-out a round trip to the very
  // screen the user was trying to leave.
  router.replace("/home");
  await clearTokens();
  setCustomer(null);
}

/**
 * Resolve the current session from whatever token is on disk. Called once at
 * app launch (see app/_layout.tsx) — NOT a hook, because it has to run before
 * the first screen decides whether to show the signed-in or signed-out shell,
 * and a hook can't block a router redirect decision the way an awaited call
 * during launch can.
 */
export async function bootstrapSession(): Promise<void> {
  if (!isApiConfigured()) {
    setLoading(false);
    return;
  }
  try {
    const fresh = await apiGet<Customer>("/customer/me");
    setCustomer(fresh);
  } catch (err) {
    // No stored token, or a 401 that survived apiFetch's own refresh attempt —
    // either way, there is no session. Anything else (offline) is NOT evidence
    // of that, so a customer opening the app with no signal just sees the
    // signed-out shell rather than a false one clearing a still-good session.
    if (err instanceof ApiError && err.status !== 401 && err.status !== 0) {
      console.warn("Session bootstrap failed:", err.message);
    }
    setCustomer(null);
  } finally {
    setLoading(false);
  }
}

export interface CustomerSession {
  id: string;
  deviceName: string | null;
  platform: string | null;
  lastUsedAt: number;
  createdAt: number;
}

export function fetchSessions(): Promise<CustomerSession[]> {
  return apiGet<CustomerSession[]>("/customer/sessions");
}

/** End one device's session, or every one when `sessionId` is omitted. */
export async function revokeSessions(sessionId?: string): Promise<number> {
  const { revoked } = await apiPost<{ revoked: number }>(
    "/customer/sessions",
    sessionId ? { sessionId } : {},
  );
  return revoked;
}

export interface DeletionSummary {
  leadsDetached: number;
  sessionsRevoked: number;
}

/**
 * Delete the account. Irreversible. `confirmEmail` must match exactly — the
 * session already proves who is asking; this proves they meant it. Same rule
 * as the website's Account.tsx.
 */
export async function deleteAccount(confirmEmail: string): Promise<DeletionSummary> {
  const summary = await apiPost<DeletionSummary>("/customer/delete", { confirmEmail });
  await clearTokens();
  setCustomer(null);
  return summary;
}

/** Subscribe to the customer session. */
export function useCustomerAuth(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
