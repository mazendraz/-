// Frontend auth: login/logout against the API, JWT stored in localStorage
// (al-assema-token — the same key api.ts reads to send `Authorization: Bearer`).
// Auth is only enforced when the API is configured (VITE_API_URL); in the
// localStorage/demo mode the dashboards stay open as before.
import { useEffect, useState } from "react";
import { apiGet, apiPost, isApiConfigured } from "./api";

const TOKEN_KEY = "al-assema-token";
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

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiPost<{ token: string; user: AuthUser }>("/auth/login", {
    email,
    password,
  });
  setSession(res.token, res.user);
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
