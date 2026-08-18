/**
 * Platform settings (branding, contact details) — the mobile counterpart of
 * the website's lib/settings.ts. Fetched once per app session and cached in
 * memory: every screen that mounts a <Logo> (phase 2) would otherwise refetch
 * /settings on every screen focus, and this is public, slow-changing data
 * with no need for that. Reactive across every mounted caller — whichever
 * screen triggers the first fetch, every other <Logo> on screen updates the
 * moment it resolves, same as the website's event-driven useSettings().
 */
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { ApiMaintenanceStatus, ApiPlatformSettings } from "@alassema/core";
import { fetchMaintenance, fetchPlatformSettings } from "./pages";

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

// ── Maintenance (phase 10) ───────────────────────────────────────────────────
// Deliberately its own /status call, not folded into ApiPlatformSettings —
// same reasoning as the website's useMaintenance: /settings is served with a
// max-age=30/s-maxage=60 cache, so routing maintenance through it could delay
// taking the app's traffic down by up to five minutes. /status is `no-store`.

export const MAINTENANCE_OFF: ApiMaintenanceStatus = {
  enabled: false,
  title_en: "",
  title_ar: "",
  message_en: "",
  message_ar: "",
  eta: null,
};

/**
 * Maintenance state for the app shell (see app/_layout.tsx, which renders
 * MaintenanceScreen in place of the whole Stack while `enabled`).
 *
 * `loading` matters the same way it does on the website: the real app must
 * not flash for a moment before the maintenance screen lands, so the caller
 * holds the splash screen until this resolves.
 *
 * Re-checks when the app returns to the foreground (the mobile equivalent of
 * the website's `visibilitychange` re-check) — otherwise a customer already
 * inside the app when maintenance is flipped on wouldn't see it until they
 * force-quit and reopen.
 */
export function useMaintenance(): { status: ApiMaintenanceStatus; loading: boolean; refetch: () => void } {
  const [status, setStatus] = useState<ApiMaintenanceStatus>(MAINTENANCE_OFF);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    alive.current = true;
    const load = () => {
      fetchMaintenance()
        .then((s) => {
          if (alive.current) setStatus(s);
        })
        // A failed /status read must not take the app down — same as the
        // website, backend reachability is a separate concern (lib/api.ts's
        // reachability signal).
        .catch(() => {
          if (alive.current) setStatus(MAINTENANCE_OFF);
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        });
    };
    loadRef.current = load;
    load();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });

    return () => {
      alive.current = false;
      sub.remove();
    };
  }, []);

  return { status, loading, refetch: () => loadRef.current() };
}
