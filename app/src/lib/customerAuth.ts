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
import { AUTH_EXPIRED_EVENT, apiGet, apiPost, isApiConfigured, ApiError } from "./api";
import { clearGoogleAutoSelect } from "./googleSignIn";
import { forgetAccountLeads } from "./requests";
import { forgetAccountWaitlistEntries } from "./availability";
import { invalidateThreadSummaries } from "./chat";

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

/**
 * End the local session AND everything it pulled onto this device.
 *
 * The account's requests, waiting-list joins and conversation summaries are
 * folded into the same device-local caches this browser uses when signed out —
 * that sharing is deliberate (see absorbAccountLeads) and it is what lets every
 * screen stay account-agnostic. The cost is that signing out has to unpick it,
 * or the next person to open the site reads the last person's history off a
 * page that says "sign in". Anything this device submitted itself stays: it was
 * here before the account was.
 */
function clearSession() {
  localStorage.removeItem(CUSTOMER_KEY);
  forgetAccountLeads();
  forgetAccountWaitlistEntries();
  invalidateThreadSummaries();
  window.dispatchEvent(new CustomEvent(EVENT));
}

// A 401 on any /customer/* route proves the customer cookie is dead — see
// AUTH_EXPIRED_EVENT in api.ts. Until this existed, only revalidate()'s
// mount-time /customer/me check could notice, so a cookie that expired while the
// tab sat open left the signed-in shell up over a session every request rejected.
//
// Note what this does NOT react to: a 5xx or a network failure. Those are not
// evidence the session ended, and treating them as such would sign people out
// every time the backend hiccuped — the same distinction revalidate() below
// already makes, and the reason this listens for an explicitly-401 event rather
// than for any failure.
if (typeof window !== "undefined") {
  window.addEventListener(AUTH_EXPIRED_EVENT, (event) => {
    const detail = (event as CustomEvent<{ audience?: string }>).detail;
    if (detail?.audience !== "customer") return;
    if (!getCurrentCustomer()) return;
    console.warn("[al-assema] Customer session expired — signing out.");
    clearSession();
  });
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
}): Promise<{ verificationSent: boolean }> {
  return apiPost<{ verificationSent: boolean }>("/auth/customer/register", input);
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

/**
 * Ask for a fresh verification link. Resolves to whether the mail actually
 * went out.
 *
 * The server still answers identically for every ADDRESS (unknown, verified,
 * deactivated and throttled all report `true`) — what `false` reports is that
 * the mail transport itself refused, so the caller must not say "check your
 * inbox" over an email that was never accepted. See api's
 * resend-verification route.
 */
export async function resendVerification(email: string): Promise<boolean> {
  const res = await apiPost<{ sent?: boolean }>("/auth/customer/resend-verification", { email });
  // Defaults to true so an older API build (which always returned
  // `{sent:true}`) keeps its previous behaviour rather than reading as failure.
  return res?.sent !== false;
}

/**
 * Start a password reset. Resolves the same way for every address — the server
 * answers `{ ok: true }` whether or not an account exists, is Google-only, or is
 * deactivated, so there is nothing here to branch on and nothing to leak. The UI
 * shows one "check your inbox" screen regardless.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiPost("/auth/customer/forgot-password", { email });
}

/**
 * Finish a password reset with the token from the emailed link.
 *
 * Signs them in on success — same reasoning as verifyEmailToken above: the link
 * came out of the inbox they are proving they control, which is the evidence a
 * sign-in would ask for anyway. Every other session on the account is revoked
 * server-side first, so a device that was riding the OLD password is dropped
 * rather than carried past the reset.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<SignInOutcome> {
  const res = await apiPost<CustomerAuthResponse>("/auth/customer/reset-password", {
    token,
    password,
  });
  setSession(res.customer);
  return res.outcome;
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
    // The CUSTOMER logout, not /auth/logout — that one is the staff route and
    // clears the staff cookie. They were interchangeable only while both
    // populations shared a single cookie name; now that they don't, calling the
    // wrong one would leave the customer session standing (and sign an admin out
    // of the dashboard instead).
    await apiPost("/auth/customer/logout", {});
  } catch {
    /* best-effort — the local session is cleared either way */
  }
  clearGoogleAutoSelect();
  clearSession();
}

/**
 * ONE /customer/me revalidation per page load, shared by every hook instance.
 *
 * useCustomerAuth() is mounted by the nav, the messages screen, the requests
 * screen and the account-sync hook, and React's StrictMode double-invokes
 * effects in development — so a per-instance fetch meant half a dozen identical
 * calls on a single page view, every one of them a 401 for an anonymous
 * visitor. Same shape as the shared thread-summary fetch in lib/chat.ts, and for
 * the same reason.
 */
let meInFlight: Promise<Customer | null> | null = null;
let meCheckedAt = 0;
/** Long enough to cover one page load's worth of mounts, short enough that a
 *  session ended in another tab is noticed almost immediately. */
const ME_TTL_MS = 30_000;

function revalidate(): Promise<Customer | null> {
  // Join the call already in the air rather than starting a second one.
  if (meInFlight) return meInFlight;
  // Answered within the window: whatever is cached was checked moments ago.
  if (Date.now() - meCheckedAt < ME_TTL_MS) return Promise.resolve(getCurrentCustomer());

  const promise = apiGet<Customer>("/customer/me")
    .then((fresh) => {
      setSession(fresh);
      return fresh;
    })
    .catch((err) => {
      // 401 means the cookie is gone or the account was deactivated — drop the
      // stale profile. Anything else (offline, 500) is NOT evidence the session
      // ended, so the cached profile stays and the user is left signed in.
      if (err instanceof ApiError && err.status === 401) clearSession();
      return getCurrentCustomer();
    })
    .finally(() => {
      meCheckedAt = Date.now();
      if (meInFlight === promise) meInFlight = null;
    });

  meInFlight = promise;
  return promise;
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

    // Asked EVEN WITH NO CACHED PROFILE, because the cached profile is not the
    // session — the httpOnly cookie is, and the two can legitimately come apart.
    // Clearing site data, a browser pruning localStorage, or opening the site in
    // a context where the copy never got written all leave a perfectly valid
    // cookie behind a signed-out shell. The customer then sees a sign-in page
    // for an account they are already signed into, and none of their requests or
    // conversations. Deduplicated across instances (see revalidate) and not
    // blocking (see `loading` above), so a genuinely signed-out visitor waits
    // for nothing and pays for one call, not one per component.
    void revalidate()
      .then((fresh) => {
        if (active) setCustomer(fresh);
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
