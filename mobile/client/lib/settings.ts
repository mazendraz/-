/**
 * Platform settings (branding, contact details) — the mobile counterpart of
 * the website's lib/settings.ts. Fetched once per app session and cached in
 * memory: every screen that mounts a <Logo> (phase 2) would otherwise refetch
 * /settings on every screen focus, and this is public, slow-changing data
 * with no need for that. Reactive across every mounted caller — whichever
 * screen triggers the first fetch, every other <Logo> on screen updates the
 * moment it resolves, same as the website's event-driven useSettings().
 */
import { useEffect, useState } from "react";
import type { ApiPlatformSettings } from "@alassema/core";
import { fetchPlatformSettings } from "./pages";

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
