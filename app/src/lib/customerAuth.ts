/**
 * CUSTOMER session on the website — the person who submits requests.
 *
 * Deliberately a separate module from lib/auth.ts, which handles STAFF (admin /
 * provider) sessions. The two are different populations against different backend
 * tables and different endpoints, and the tokens are not interchangeable: the
 * backend stamps an audience into each and refuses the wrong one (see api's
 * auth.ts). Sharing one module here would invite sharing one state, and the first
 * bug would be a customer's session satisfying a dashboard guard.
 *
 * The session itself lives in an httpOnly cookie the browser sends automatically.
 * What is kept in localStorage is a NON-secret copy of the profile, purely so the
 * page can render the signed-in shell before /customer/me answers.
 */
import { useEffect, useState } from "react";
import { apiGet, apiPost, isApiConfigured, ApiError } from "./api";
import { clearGoogleAutoSelect } from "./googleSignIn";

const CUSTOMER_KEY = "al-assema-customer";
const EVENT = "al-assema-customer-changed";

export interface Customer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

/** What the sign-in did — the page branches its next step on this. */
export type SignInOutcome = "created" | "linked" | "returning";

interface CustomerAuthResponse {
  customer: Customer;
  outcome: SignInOutcome;
}

export function getCurrentCustomer(): Customer | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? (JSON.parse(raw) as Customer) : null;
  } catch {
    return null;
  }
}

function setSession(customer: Customer) {
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function clearSession() {
  localStorage.removeItem(CUSTOMER_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Exchange a Google ID token for a session.
 *
 * The token is passed straight through — nothing is read off it here. It is a
 * JWT and its claims are readable, which is exactly the temptation to avoid:
 * anything decoded client-side is attacker-controlled until the server has
 * checked the signature. The `customer` in the response is the server's answer,
 * and that is what gets stored.
 */
export async function signInWithGoogle(idToken: string): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/google", { idToken });
  setSession(res.customer);
  return res.outcome;
}

/**
 * Create an account with a password. Returns NO session on purpose — the server
 * refuses to sign in an unverified address, so the UI's next screen is "check
 * your inbox", not the signed-in shell.
 */
export async function registerWithPassword(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  await apiPost<{ verificationSent: boolean }>("/auth/customer/register", input);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/login", {
    email,
    password,
  });
  setSession(res.customer);
  return res.outcome;
}

/** Complete verification from the emailed link. Signs them in on success. */
export async function verifyEmailToken(token: string): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/verify", { token });
  setSession(res.customer);
  return res.outcome;
}

/** Ask for a fresh verification link. Always resolves — the server answers the
 *  same way for every address, so there is no result to branch on. */
export async function resendVerification(email: string): Promise<void> {
  await apiPost("/auth/customer/resend-verification", { email });
}

/** A device that can currently sign in to this account. */
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
 * Delete the account. Irreversible.
 *
 * `confirmEmail` must match the account's address exactly — the session already
 * proves who is asking, and this proves they meant it. Clears the local session
 * on success, since the account behind it no longer exists.
 */
export async function deleteAccount(confirmEmail: string): Promise<DeletionSummary> {
  const summary = await apiPost<DeletionSummary>("/customer/delete", { confirmEmail });
  clearGoogleAutoSelect();
  clearSession();
  return summary;
}

export async function customerLogout(): Promise<void> {
  try {
    await apiPost("/auth/logout", {});
  } catch {
    /* best-effort — the local session is cleared either way */
  }
  clearGoogleAutoSelect();
  clearSession();
}

/**
 * Current customer session. Revalidates against /customer/me on mount, so a
 * deactivated account or an expired cookie clears the cached profile instead of
 * leaving the UI showing a signed-in shell that every request then rejects.
 */
export function useCustomerAuth(): {
  customer: Customer | null;
  loading: boolean;
  enforced: boolean;
} {
  const enforced = isApiConfigured();
  const [customer, setCustomer] = useState<Customer | null>(() => getCurrentCustomer());
  // Only block on the check when there is a cached profile to verify. With no
  // session there is nothing to wait for, and showing a spinner to a signed-out
  // visitor delays the very button they came for.
  const [loading, setLoading] = useState<boolean>(enforced && Boolean(getCurrentCustomer()));

  useEffect(() => {
    if (!enforced) {
      setLoading(false);
      return;
    }

    let active = true;
    const sync = () => setCustomer(getCurrentCustomer());
    window.addEventListener(EVENT, sync);

    if (!getCurrentCustomer()) {
      setLoading(false);
      return () => window.removeEventListener(EVENT, sync);
    }

    apiGet<Customer>("/customer/me")
      .then((fresh) => {
        if (!active) return;
        setSession(fresh);
        setCustomer(fresh);
      })
      .catch((err) => {
        if (!active) return;
        // 401 means the cookie is gone or the account was deactivated — drop the
        // stale profile. Anything else (offline, 500) is NOT evidence the session
        // ended, so the cached profile stays and the user is left signed in.
        if (err instanceof ApiError && err.status === 401) clearSession();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.removeEventListener(EVENT, sync);
    };
  }, [enforced]);

  return { customer, loading, enforced };
}
