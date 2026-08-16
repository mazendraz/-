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
import Constants from "expo-constants";
import type { ApiCustomer } from "@alassema/core";
import { apiGet, apiPost, isApiConfigured, ApiError } from "./api";
import { clearTokens, getRefreshToken, saveTokens } from "./session";

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

// Device descriptor sent with every sign-in — see the module comment. A real
// device name (Constants.deviceName) is what the /account devices list shows;
// Platform.OS is the "ios" | "android" the schema stores. deviceName isn't
// guaranteed non-null on every runtime, so it's optional to the API too.
function deviceInfo() {
  return {
    deviceName: Constants.deviceName ?? undefined,
    platform: Platform.OS as "ios" | "android",
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

export async function resendVerification(email: string): Promise<void> {
  await apiPost("/auth/customer/resend-verification", { email });
}

export async function customerLogout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    // Tells the server to revoke THIS device's session — without it, sign-out
    // would only forget the token locally and leave a 60-day credential live
    // on the server for anyone who captured it before the local wipe.
    await apiPost("/auth/customer/logout", refreshToken ? { refreshToken } : {});
  } catch {
    /* best-effort — tokens are cleared locally regardless */
  }
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

/** Subscribe to the customer session. */
export function useCustomerAuth(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
