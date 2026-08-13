// Platform settings (site name, contact details, social links) — admin-managed,
// public-facing. Mirrors the catalog/site-reviews hydration pattern: a cached copy
// in localStorage, refreshed from the API, merged over defaults so the UI always
// renders something sensible. In demo mode (no API) the defaults are used.
import { useEffect, useState } from "react";
import { apiGet, apiPut, isApiConfigured, reportHydrationFailure } from "./api";

export interface PlatformSettings {
  site_name: string;
  support_email: string;
  public_phone: string;
  address: string;
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_linkedin: string;
  districts: string;
  budgets: string;
  hero_title_en: string;
  hero_title_ar: string;
  hero_subtitle_en: string;
  hero_subtitle_ar: string;
  logo_url: string;
  favicon_url: string;
  // Logo size as a percentage of the built-in size; "" = 100%.
  logo_scale: string;
  // Homepage hero background image; "" = the built-in skyline render.
  hero_image_url: string;
}

export const SETTINGS_DEFAULTS: PlatformSettings = {
  site_name: "Al Assema",
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

/** Split a newline-separated settings value into a trimmed list, or the fallback
 *  when blank (admin hasn't overridden the built-in defaults). */
export function parseLines(raw: string, fallback: string[]): string[] {
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length > 0 ? lines : fallback;
}

const KEY = "al-assema-settings";
const EVENT = "al-assema-settings-changed";

function read(): PlatformSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<PlatformSettings>) };
  } catch {
    /* ignore */
  }
  return SETTINGS_DEFAULTS;
}

function write(s: PlatformSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVENT));
}

// Swap the browser tab favicon to the admin-uploaded one (no-op when blank).
function applyFavicon(url: string) {
  if (!url || typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export async function hydrateSettingsFromApi(): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    const s = await apiGet<PlatformSettings>("/settings");
    write({ ...SETTINGS_DEFAULTS, ...s });
    applyFavicon(s.favicon_url);
  } catch (err) {
    reportHydrationFailure("Settings hydration from API", err);
  }
}

if (typeof window !== "undefined") void hydrateSettingsFromApi();

export function getSettings(): PlatformSettings {
  return read();
}

/** Admin: persist a partial update, then write-through the returned full set. */
export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const updated = await apiPut<PlatformSettings>("/admin/settings", patch);
  write({ ...SETTINGS_DEFAULTS, ...updated });
  return updated;
}

// ── Email templates (admin-only; not cached publicly) ──────────────────────────
export interface EmailTemplates {
  providerSubject: string;
  providerBody: string;
  adminSubject: string;
  adminBody: string;
}

export function fetchEmailTemplates(): Promise<EmailTemplates> {
  return apiGet<EmailTemplates>("/admin/email-templates");
}

export function saveEmailTemplates(patch: Partial<EmailTemplates>): Promise<EmailTemplates> {
  return apiPut<EmailTemplates>("/admin/email-templates", patch);
}

// ── Legal pages (Terms / Privacy) ───────────────────────────────────────────────
export interface LegalPages {
  terms: string;
  privacy: string;
}

/** Public: fetch Terms + Privacy content (on demand — not globally cached). */
export function fetchLegalPages(): Promise<LegalPages> {
  return apiGet<LegalPages>("/pages");
}

/** Admin: fetch for editing. */
export function fetchLegalPagesAdmin(): Promise<LegalPages> {
  return apiGet<LegalPages>("/admin/pages");
}

export function saveLegalPages(patch: Partial<LegalPages>): Promise<LegalPages> {
  return apiPut<LegalPages>("/admin/pages", patch);
}

// ── Maintenance / site status ──────────────────────────────────────────────────
// Read from /api/status, NOT /api/settings. /settings is served with a
// max-age=30 / s-maxage=60 / stale-while-revalidate=300 cache, so routing
// maintenance through it could delay taking the site down by up to five minutes.
// /status is `no-store`. One source of truth — never mirror these fields into
// PlatformSettings.
export interface MaintenanceStatus {
  enabled: boolean;
  title_en: string;
  title_ar: string;
  message_en: string;
  message_ar: string;
  /** Epoch ms for the "back in ..." countdown; null = no ETA. */
  eta: number | null;
}

export const MAINTENANCE_OFF: MaintenanceStatus = {
  enabled: false,
  title_en: "",
  title_ar: "",
  message_en: "",
  message_ar: "",
  eta: null,
};

/** Public: current maintenance state. */
export function fetchMaintenance(): Promise<MaintenanceStatus> {
  return apiGet<MaintenanceStatus>("/status");
}

/** Admin: fetch for editing. */
export function fetchMaintenanceAdmin(): Promise<MaintenanceStatus> {
  return apiGet<MaintenanceStatus>("/admin/maintenance");
}

export function saveMaintenance(patch: Partial<MaintenanceStatus>): Promise<MaintenanceStatus> {
  return apiPut<MaintenanceStatus>("/admin/maintenance", patch);
}

// ── Admin notification preferences ──────────────────────────────────────────────
// Chat only — leads always notify (both admin and provider); this is the
// admin-only mute switch for the far-noisier chat channel. Providers get no
// equivalent control — they keep every notification.
export interface AdminNotificationSettings {
  chatEnabled: boolean;
}

/** Admin: current chat-notification preference. */
export function fetchAdminNotificationSettings(): Promise<AdminNotificationSettings> {
  return apiGet<AdminNotificationSettings>("/admin/notification-settings");
}

export function saveAdminNotificationSettings(
  patch: Partial<AdminNotificationSettings>,
): Promise<AdminNotificationSettings> {
  return apiPut<AdminNotificationSettings>("/admin/notification-settings", patch);
}

/**
 * Maintenance state for the public shell.
 *
 * `loading` matters: RootLayout must not flash the real site for a moment before
 * the maintenance screen lands, nor blank the site while the first request is in
 * flight. Callers render nothing until loading resolves.
 *
 * Demo mode (no VITE_API_URL) has no backend to ask, so it is never in
 * maintenance — the screen is unreachable there by design.
 */
export function useMaintenance(): { status: MaintenanceStatus; loading: boolean } {
  const [status, setStatus] = useState<MaintenanceStatus>(MAINTENANCE_OFF);
  const [loading, setLoading] = useState(isApiConfigured());

  useEffect(() => {
    if (!isApiConfigured()) return;
    let alive = true;
    const load = () => {
      fetchMaintenance()
        .then((s) => { if (alive) setStatus(s); })
        // A failed /status read must not take the site down. If the backend is
        // unreachable, useBackendHealth() owns that story (offline screen).
        .catch(() => { if (alive) setStatus(MAINTENANCE_OFF); })
        .finally(() => { if (alive) setLoading(false); });
    };
    load();
    // Re-check when the tab regains focus, so someone who left a tab open sees
    // maintenance without a manual reload. No interval — no idle polling.
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { status, loading };
}

export function useSettings(): PlatformSettings {
  const [settings, setSettings] = useState<PlatformSettings>(read);
  useEffect(() => {
    const refresh = () => setSettings(read());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void hydrateSettingsFromApi();
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return settings;
}
