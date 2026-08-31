/**
 * App-version gate — reads api's GET /app-version (see api's own route.ts for
 * why it exists: a published app can't be "fixed by deploying" the way the
 * website can, so this is the one server-side lever to force old, broken, or
 * insecure builds to stop working). Previously fetched by nothing at all —
 * the endpoint existed on the server with no caller anywhere in this app.
 */
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet } from "./api";
import { getConfig } from "./config";

export interface ApiAppVersion {
  minimum: string;
  latest: string;
  iosUrl: string | null;
  androidUrl: string | null;
  message: string | null;
}

/** `config.appVersionQuery` (see config.ts) picks which env-var set the
 *  server reads — absent for the client app, "business" for the Business
 *  App, each a fully independent kill switch. */
export function fetchAppVersion(): Promise<ApiAppVersion> {
  const { appVersionQuery } = getConfig();
  const qs = appVersionQuery ? `?app=${encodeURIComponent(appVersionQuery)}` : "";
  return apiGet<ApiAppVersion>(`/app-version${qs}`);
}

/** This build's own version — same string app.json's `expo.version` sets. */
export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** Semver-ish compare: true when `current` is strictly below `threshold`.
 *  Plain numeric segment comparison — every version in play here is a
 *  three-part "major.minor.patch" string (app.json / APP_MIN_VERSION), no
 *  pre-release suffixes to worry about. */
export function isVersionBelow(current: string, threshold: string): boolean {
  const c = current.split(".").map((n) => parseInt(n, 10) || 0);
  const t = threshold.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(c.length, t.length); i++) {
    const cv = c[i] ?? 0;
    const tv = t[i] ?? 0;
    if (cv !== tv) return cv < tv;
  }
  return false;
}

// ── Dismissible soft-update nudge ───────────────────────────────────────────
// `/app-version` returns both `minimum` (the blocking gate, above) and
// `latest` — that route's own comment describes `latest` as "the app may
// suggest updating, dismissibly." Nothing here ever read it: this build's
// only reaction to being out of date used to be the full-screen blocking
// gate, reserved for a broken contract or a security fix, applied to every
// case including "there's a nicer version available." Keyed by the version
// string, not a one-time flag, so dismissing the nudge for 1.2.0 doesn't
// silently suppress it forever once 1.3.0 ships.
const DISMISSED_KEY = "al-assema-update-nudge-dismissed";

export async function isUpdateNudgeDismissed(latest: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISMISSED_KEY)) === latest;
  } catch {
    return false;
  }
}

export async function dismissUpdateNudge(latest: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, latest);
  } catch {
    /* best-effort — worst case the nudge reappears next launch */
  }
}
