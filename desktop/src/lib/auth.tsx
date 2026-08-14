// Desktop auth: the OS credential vault (see secureToken.ts) holds the JWT
// that api/src/app/api/auth/login/route.ts issues; this context is the only
// thing that reads/writes it. The backend stays authoritative — every
// permission check here is a UX convenience (hide a nav item, skip a
// pointless request); the real enforcement is desktopOnly() on the server,
// which a 403 response here always respects (see ProtectedRoute below).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiGet, apiPost, setAuthToken, ApiError, UNAUTHORIZED_EVENT } from "./api";
import { getToken, storeToken, clearToken } from "./secureToken";
import { hasPermission, type DesktopPermission } from "./permissions";
import type { ApiAuthResponse, ApiUser } from "./apiTypes";

interface AuthState {
  /** null while resolving the stored token on boot; also null when signed out. */
  user: ApiUser | null;
  /** True only during the initial boot check — NOT during login()/logout(). */
  booting: boolean;
  loginError: string | null;
  loggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: DesktopPermission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() used outside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  // getToken()/apiGet("/auth/me") both resolve after unmount is possible
  // (window closed mid-request never happens for a desktop shell, but a fast
  // login-then-logout double click does) — guard state writes with this.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const signOut = useCallback(() => {
    setAuthToken(null);
    void clearToken();
    setUser(null);
  }, []);

  // Boot: hydrate the token from the OS vault, then re-validate it against
  // the server (an active user may have been deactivated, or the token may
  // have simply expired since last launch).
  useEffect(() => {
    (async () => {
      const token = await getToken().catch(() => null);
      if (!token) {
        if (mounted.current) setBooting(false);
        return;
      }
      setAuthToken(token);
      try {
        const me = await apiGet<ApiUser>("/auth/me");
        if (mounted.current) setUser(me);
      } catch {
        signOut();
      } finally {
        if (mounted.current) setBooting(false);
      }
    })();
  }, [signOut]);

  // The API client fires this on ANY 401 — a token that expired mid-session,
  // or a user deactivated while the app was open. Respond the same way as a
  // failed boot check: drop back to the login screen.
  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [signOut]);

  const login = useCallback(async (email: string, password: string) => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await apiPost<ApiAuthResponse>("/auth/login", { email, password });
      setAuthToken(res.token);
      // The login response's `user` is intentionally minimal (see
      // ApiAuthResponse) and omits desktopPermissions — /auth/me is the one
      // place that returns the full ApiUser, so it's the source of truth for
      // what this account may actually see in here.
      const me = await apiGet<ApiUser>("/auth/me");
      await storeToken(res.token);
      if (mounted.current) setUser(me);
    } catch (err) {
      setAuthToken(null);
      const message =
        err instanceof ApiError ? err.message : "Couldn't reach the server. Check your connection and try again.";
      if (mounted.current) setLoginError(message);
      throw err;
    } finally {
      if (mounted.current) setLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => signOut(), [signOut]);

  const can = useCallback(
    (permission: DesktopPermission) => hasPermission(user?.desktopPermissions, permission),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, booting, loginError, loggingIn, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Route guard. Three gates, in order:
 *   1. Signed in at all → else /login.
 *   2. role === "ADMIN" → else a plain "staff only" screen (a PROVIDER account
 *      is valid on the marketplace but has no business in here).
 *   3. `permission` (when given) is in desktopPermissions → else a "no access
 *      to this module" screen with the same wording the API's 403 would
 *      produce, so direct URL entry (typing the route, not just hiding the
 *      nav link) can't see a page it has no grant for.
 */
export function ProtectedRoute({
  permission,
  children,
}: {
  permission?: DesktopPermission;
  children: ReactNode;
}) {
  const { user, booting, can } = useAuth();
  const location = useLocation();

  if (booting) return null; // <AppBoot> above already shows a full-screen loader
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== "ADMIN") return <StaffOnlyScreen />;
  if (permission && !can(permission)) return <NoAccessScreen permission={permission} />;
  return <>{children}</>;
}

function StaffOnlyScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <span className="material-symbols-outlined text-error text-[40px]">block</span>
        <h1 className="font-headline-sm text-headline-sm text-primary mt-4">Staff access only</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
          The Business Control Center is an internal tool for Al Asima administrators. Your account doesn&apos;t have
          access to it.
        </p>
      </div>
    </div>
  );
}

function NoAccessScreen({ permission }: { permission: DesktopPermission }) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <span className="material-symbols-outlined text-secondary text-[40px]">lock</span>
        <h1 className="font-headline-sm text-headline-sm text-primary mt-4">No access to this module</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
          Your account isn&apos;t granted <code className="font-mono-data text-mono-data">{permission}</code>. Ask
          another administrator to grant it from Team settings.
        </p>
      </div>
    </div>
  );
}
