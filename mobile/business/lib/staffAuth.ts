/**
 * Staff session state — this app's counterpart of mobile/client's
 * customerAuth.ts, and of the website's own lib/customerAuth.ts one level up
 * again. Same split as both: this module owns WHO is signed in and
 * broadcasts changes; @alassema/mobile-shared's session.ts owns the
 * on-device bytes.
 *
 * ── Why this is simpler than the client app's customerAuth.ts ──────────────
 * The client app supports GUEST browsing — most screens work signed out, a
 * few gate on sign-in, and customerAuth.ts's comments describe real bugs from
 * getting that multi-gate, focus-scoped dance wrong (racing redirects, a
 * sign-out that couldn't land anywhere guest-accessible). None of that exists
 * here: every screen in this app requires a signed-in staff account, so there
 * is exactly ONE gate — the root layout — and it can render the sign-in
 * screen directly whenever `user` is null rather than redirecting through
 * expo-router at all. See app/_layout.tsx.
 *
 * Sends `device` on every sign-in call, which is what makes the SERVER issue
 * a refresh token at all (see api's staffSession.service.ts /
 * docs/architecture/business-app/phase-0-backend-sessions.md) — the web
 * dashboard omits it and gets only a cookie.
 */
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { ApiUser } from "@alassema/core";
import {
  apiGet,
  apiPost,
  isApiConfigured,
  ApiError,
  clearTokens,
  getRefreshToken,
  onAuthInvalidated,
  saveTokens,
  setAuthSubject,
  unregisterPush,
} from "@alassema/mobile-shared";

export type StaffUser = ApiUser;

// ── Store ─────────────────────────────────────────────────────────────────────
interface Snapshot {
  user: StaffUser | null;
  loading: boolean;
}

let snapshot: Snapshot = { user: null, loading: true };
const listeners = new Set<() => void>();

// useSyncExternalStore requires getSnapshot to return the SAME reference when
// nothing changed, or React re-renders forever. State only ever changes by
// replacing this one object — never by mutating its fields in place. Same
// contract as customerAuth.ts's identical comment.
function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function setUser(next: StaffUser | null) {
  setSnapshot({ user: next });
  // Tells @alassema/mobile-shared's liveEvents.ts and push.ts who (if
  // anyone) is signed in — see session.ts's own comment on why that
  // dependency runs this direction.
  setAuthSubject(next?.id ?? null);
}

function setLoading(next: boolean) {
  setSnapshot({ loading: next });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The server-side counterpart of a dead session (a rejected refresh token —
// see mobile-shared's session.ts invalidateSession, which api.ts's
// refreshAccessToken calls instead of clearing tokens silently). Module-
// level, not inside a hook: this has to fire regardless of which — if any —
// component holding useStaffAuth() happens to be mounted at the moment the
// refresh fails.
onAuthInvalidated(() => setUser(null));

// Device descriptor sent with every sign-in — see the module comment.
// `platform` is sent ONLY when it really is "ios" | "android"; under
// `expo start --web` Platform.OS is "web", which the API's deviceSchema
// rejects outright (z.enum(["ios","android"])). Sending it as undefined
// keeps the `device` object present — which is what signals "issue a
// refresh token" — without lying about which platform this is. Identical
// reasoning to mobile/client's customerAuth.ts deviceInfo().
function deviceInfo() {
  const os = Platform.OS;
  const platform = os === "ios" || os === "android" ? os : undefined;
  return {
    deviceName: Constants.deviceName ?? (os === "web" ? "Web" : undefined),
    platform,
  };
}

interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: StaffUser;
}

/**
 * Sign in with email and password — the only entry point for this app.
 * Staff are provisioned by an admin; there is no self-registration and no
 * third-party sign-in to offer.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const res = await apiPost<LoginResponse>("/auth/login", {
    email,
    password,
    device: deviceInfo(),
  });
  // refreshToken is only ABSENT if the server didn't get `device` — which
  // this call always sends, so its absence here would mean the request
  // shape and the server's expectation have drifted, not a normal case to
  // silently tolerate. Identical guard to customerAuth.ts's applySignIn.
  if (!res.refreshToken) {
    throw new Error("Server did not issue a refresh token for a device sign-in.");
  }
  await saveTokens({ accessToken: res.token, refreshToken: res.refreshToken });
  setUser(res.user);
}

export async function signOut(): Promise<void> {
  // Forget this phone's push token BEFORE the access token is cleared below
  // — the unregister route requires auth, and without this the previous
  // owner of a shared phone keeps receiving notifications for an account
  // they've just signed out of. Safe even before push registration is wired
  // (phase 4): unregisterPush() is a no-op when nothing was ever registered.
  await unregisterPush().catch(() => {});
  try {
    const refreshToken = await getRefreshToken();
    // Tells the server to revoke THIS device's session — without it,
    // sign-out would only forget the token locally and leave a 30-day
    // credential live on the server for anyone who captured it before the
    // local wipe.
    await apiPost("/auth/logout", refreshToken ? { refreshToken } : {});
  } catch {
    /* best-effort — tokens are cleared locally regardless */
  }
  await clearTokens();
  setUser(null);
}

/**
 * Resolve the current session from whatever token is on disk. Called once
 * at app launch (see app/_layout.tsx) — NOT a hook, because it has to run
 * before the first screen decides whether to show the signed-in shell or
 * the sign-in screen, and a hook can't block that decision the way an
 * awaited call during launch can.
 */
export async function bootstrapSession(): Promise<void> {
  if (!isApiConfigured()) {
    setLoading(false);
    return;
  }
  try {
    const fresh = await apiGet<StaffUser>("/auth/me");
    setUser(fresh);
  } catch (err) {
    // No stored token, or a 401 that survived apiFetch's own refresh attempt
    // — either way, there is no session. Anything else (offline) is NOT
    // evidence of that, so opening the app with no signal just shows the
    // sign-in screen rather than a false one clearing a still-good session.
    if (err instanceof ApiError && err.status !== 401 && err.status !== 0) {
      console.warn("Session bootstrap failed:", err.message);
    }
    setUser(null);
  } finally {
    setLoading(false);
  }
}

export interface StaffSession {
  id: string;
  deviceName: string | null;
  platform: string | null;
  lastUsedAt: number;
  createdAt: number;
}

export function fetchSessions(): Promise<StaffSession[]> {
  return apiGet<StaffSession[]>("/auth/sessions");
}

/** End one device's session, or every one when `sessionId` is omitted. */
export async function revokeSessions(sessionId?: string): Promise<number> {
  const { revoked } = await apiPost<{ revoked: number }>(
    "/auth/sessions",
    sessionId ? { sessionId } : {},
  );
  return revoked;
}

/** Subscribe to the staff session. */
export function useStaffAuth(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
