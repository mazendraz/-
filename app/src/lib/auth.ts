// Frontend auth: login/logout against the API. The session lives in an httpOnly
// cookie the browser sends automatically (same-origin) — it is NOT readable by JS,
// so XSS can't steal it. We keep only a NON-secret copy of the user profile in
// localStorage (USER_KEY) as a UX cache; the cookie is the real credential and the
// server re-validates it on every request (and via /auth/me on mount).
// Auth is only enforced when the API is configured (VITE_API_URL); in the
// localStorage/demo mode the dashboards stay open as before.
import { useEffect, useState } from "react";
import { AUTH_EXPIRED_EVENT, apiGet, apiPost, isApiConfigured } from "./api";
import { forgetStaffLeads } from "./requests";

const USER_KEY = "al-assema-user";
const EVENT = "al-assema-auth-changed";

export type Role = "ADMIN" | "PROVIDER";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
}

// Demo-mode guard: with no API configured the dashboards are intentionally open
// (localStorage demo). If that happens on a real (non-localhost) host it's almost
// certainly a misconfigured deploy with VITE_API_URL unset — warn loudly, because
// authentication is NOT enforced in this mode.
if (typeof window !== "undefined" && !isApiConfigured()) {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (!isLocal) {
    console.warn(
      "[al-assema] VITE_API_URL is not set — running in demo mode with NO authentication. " +
        "If this is a production deploy, set VITE_API_URL and redeploy.",
    );
  }
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

// Optimistic, synchronous "is a user logged in?" based on the cached profile. The
// authoritative check is the httpOnly cookie, which the server validates on every
// request and which useAuth() revalidates via /auth/me on mount. UI gating only.
export function isAuthenticated(): boolean {
  return Boolean(getCurrentUser());
}

function setSession(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * End the staff session AND everything it pulled onto this device.
 *
 * This used to be one line — `removeItem(USER_KEY)` — while the customer side
 * (customerAuth.ts's clearSession) already unpicked its caches properly. That
 * asymmetry was the bug: a staff session writes considerably MORE to this
 * browser than a customer one does.
 *
 * `hydrateLeadsFromApi()` pulls a page of 100 leads — names, phone numbers,
 * districts, budgets, descriptions — into the shared lead cache. Leaving them
 * behind meant provider B, signing in on the same browser after provider A
 * signed out, rendered A's leads for the paint before their own hydration
 * landed. Same shape as the customer leak that `forgetAccountLeads` exists to
 * prevent, so it gets the same treatment: drop what the SESSION brought, keep
 * what this device submitted itself.
 *
 * The catalogue needs no cleanup here — it is now keyed by audience (see
 * catalog.ts's companiesKey), so an admin's list and the public list live in
 * different slots and a signed-out browser simply stops reading the admin one.
 */
function clearSession() {
  localStorage.removeItem(USER_KEY);
  forgetStaffLeads();
  window.dispatchEvent(new CustomEvent(EVENT));
}

// A 401 anywhere in the app proves the staff cookie is dead — see
// AUTH_EXPIRED_EVENT in api.ts. Registered at module scope, not inside useAuth:
// this has to fire regardless of which components happen to be mounted, and the
// dashboards are exactly where a session sits idle long enough to expire.
if (typeof window !== "undefined") {
  window.addEventListener(AUTH_EXPIRED_EVENT, (event) => {
    const detail = (event as CustomEvent<{ audience?: string }>).detail;
    if (detail?.audience !== "staff") return;
    // Guarded so a stray 401 on a browser with no staff session doesn't fire a
    // change event (and a re-render) for a session that was never there.
    if (!getCurrentUser()) return;
    console.warn("[al-assema] Staff session expired — signing out.");
    clearSession();
  });
}

export async function login(email: string, password: string): Promise<AuthUser> {
  // The server sets the httpOnly session cookie; we keep only the user profile.
  const res = await apiPost<{ user: AuthUser }>("/auth/login", { email, password });
  setSession(res.user);
  return res.user;
}

export async function logout(): Promise<void> {
  try {
    await apiPost("/auth/logout", {});
  } catch {
    /* best-effort; clear locally regardless */
  }
  clearSession();
}

/**
 * Current auth state. Validates the stored token against /auth/me on mount and
 * clears it if rejected. `enforced` is false in demo mode (no API configured).
 */
export function useAuth(): {
  user: AuthUser | null;
  loading: boolean;
  enforced: boolean;
} {
  const enforced = isApiConfigured();
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [loading, setLoading] = useState<boolean>(enforced && isAuthenticated());

  useEffect(() => {
    if (!enforced) {
      setLoading(false);
      return;
    }
    let active = true;
    const sync = () => setUser(getCurrentUser());
    window.addEventListener(EVENT, sync);

    if (isAuthenticated()) {
      apiGet<AuthUser>("/auth/me")
        .then((u) => {
          if (!active) return;
          localStorage.setItem(USER_KEY, JSON.stringify(u));
          setUser(u);
        })
        .catch(() => {
          if (!active) return;
          clearSession();
          setUser(null);
        })
        .finally(() => active && setLoading(false));
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
      window.removeEventListener(EVENT, sync);
    };
  }, [enforced]);

  return { user, loading, enforced };
}
