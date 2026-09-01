/**
 * Platform settings (branding, contact details) — shared by both mobile
 * apps, and the mobile counterpart of the website's own lib/settings.ts.
 *
 * Previously lived only in mobile/client/lib/settings.ts, duplicated for
 * the Business App's own <Logo> (which had none — it hardcoded a literal
 * "العاصمة" text wordmark in its sign-in/offline/maintenance/update-required
 * screens instead, the one thing the website and the client app never do).
 * `GET /settings` is public and role-agnostic — same reasoning as this
 * package's own maintenance.ts, moved here a phase earlier for the
 * identical reason ("nothing app-specific left to duplicate").
 *
 * Fetched once per app session and cached in memory: every screen that
 * mounts a <Logo> would otherwise refetch /settings on every screen focus,
 * and this is public, slow-changing data with no need for that. Reactive
 * across every mounted caller — whichever screen triggers the first fetch,
 * every other <Logo> on screen updates the moment it resolves, same as the
 * website's event-driven useSettings().
 */
import { useEffect, useState } from "react";
import type { ApiPlatformSettings } from "@alassema/core";
import { apiGet } from "./api";

/** Public: site-wide settings (branding, contact, socials). */
export function fetchPlatformSettings(): Promise<ApiPlatformSettings> {
  return apiGet<ApiPlatformSettings>("/settings");
}

const DEFAULTS: ApiPlatformSettings = {
  site_name: "العاصمة",
  support_email: "",
  public_phone: "",
  address: "",
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_linkedin: "",
  districts: "",
  budgets: "",
  hero_title_en: "",
  hero_title_ar: "",
  hero_subtitle_en: "",
  hero_subtitle_ar: "",
  logo_url: "",
  favicon_url: "",
  logo_scale: "",
  hero_image_url: "",
};

let cached: ApiPlatformSettings | null = null;
let inFlight: Promise<ApiPlatformSettings> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<ApiPlatformSettings> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetchPlatformSettings()
    .then((s) => {
      cached = s;
      listeners.forEach((l) => l());
      return s;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Discard the cached copy and fetch again, notifying every mounted useSettings().
 *
 * The cache above is deliberately per-app-session, which was fine when nothing
 * ever asked it to change — but "once per session" means an admin editing the
 * site name, logo, hero copy or contact details on the website never reached a
 * phone that had the app open, no matter how long it stayed open. Call from
 * screens that use useRefreshOnFocus, so branding follows the same
 * refresh-when-you-come-back rule as everything else.
 *
 * Never rejects — a failed refresh keeps the previous values on screen rather
 * than blanking branding back to DEFAULTS.
 */
export function refreshSettings(): Promise<void> {
  // `.catch` on BOTH branches, not just the one that starts a request — see
  // this function's own history: joining an in-flight fetch used to return
  // `inFlight.then(() => {})` bare, which inherits the rejection. The shared
  // promise is already guarded for the caller that created it (load()'s own
  // consumer catches), but this derived one is a NEW promise with no
  // handler, which React Native surfaces as a full-screen red box on an
  // unreachable API.
  if (inFlight) return inFlight.then(() => {}).catch(() => {});
  return fetchPlatformSettings()
    .then((s) => {
      cached = s;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

/** Site-wide settings (branding, contact) — sensible defaults while loading,
 *  the real values once the first fetch (from any caller) resolves. */
export function useSettings(): ApiPlatformSettings {
  const [settings, setSettings] = useState<ApiPlatformSettings>(cached ?? DEFAULTS);

  useEffect(() => {
    const listener = () => {
      if (cached) setSettings(cached);
    };
    listeners.add(listener);
    load().then(listener).catch(() => {});
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return settings;
}

/** Split a newline-separated settings value into a trimmed list, or the
 *  fallback when blank (admin hasn't overridden the built-in default) — the
 *  mobile counterpart of the website's lib/settings.ts parseLines(). */
export function parseLines(raw: string, fallback: readonly string[]): string[] {
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length > 0 ? lines : [...fallback];
}
