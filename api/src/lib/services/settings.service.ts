// Platform settings — admin-editable, public-facing config stored as key/value
// rows in AppSetting (the same table that backs site_reviews_enabled). This is the
// general "manage it from the dashboard, not the source code" store: site name,
// contact details, social links. Reads merge stored values over defaults, so a
// fresh deployment is fully functional before an admin touches anything.
import { prisma } from "@/lib/prisma";
import type {
  ApiEmailTemplates,
  ApiLegalPages,
  ApiMaintenanceStatus,
  ApiPlatformSettings,
} from "@/lib/apiTypes";

export const PLATFORM_SETTING_KEYS = [
  "site_name",
  "support_email",
  "public_phone",
  "address",
  "social_facebook",
  "social_instagram",
  "social_twitter",
  "social_linkedin",
  // Newline-separated request-form option lists; blank = the frontend's built-in
  // defaults (so these stay optional admin overrides, not a second source of truth).
  "districts",
  "budgets",
  // Homepage hero copy, per locale; blank = the localized i18n defaults.
  "hero_title_en",
  "hero_title_ar",
  "hero_subtitle_en",
  "hero_subtitle_ar",
  // Branding — uploaded image URLs; blank = the built-in /logo.png + favicon.
  "logo_url",
  "favicon_url",
  // Logo size as a percentage of the built-in size; blank = 100%.
  "logo_scale",
  // Homepage hero background image URL; blank = the built-in skyline render.
  "hero_image_url",
] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

const DEFAULTS: ApiPlatformSettings = {
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

function isKey(k: string): k is PlatformSettingKey {
  return (PLATFORM_SETTING_KEYS as readonly string[]).includes(k);
}

/** All platform settings, stored values merged over defaults. */
export async function getPlatformSettings(): Promise<ApiPlatformSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...PLATFORM_SETTING_KEYS] } },
  });
  const result: ApiPlatformSettings = { ...DEFAULTS };
  for (const row of rows) {
    if (isKey(row.key)) result[row.key] = row.value;
  }
  return result;
}

// ── Email templates (admin-only — NOT exposed on the public /api/settings) ──────
// Blank = use the built-in default in notifications.service. Token substitution:
// {{company}} {{refNumber}} {{service}} {{customer}} {{phone}} {{district}}
// {{budget}} {{details}} {{receivedAt}}.
const EMAIL_TEMPLATE_KEYS: Record<keyof ApiEmailTemplates, string> = {
  providerSubject: "email_provider_subject",
  providerBody: "email_provider_body",
  adminSubject: "email_admin_subject",
  adminBody: "email_admin_body",
};

const EMPTY_TEMPLATES: ApiEmailTemplates = {
  providerSubject: "",
  providerBody: "",
  adminSubject: "",
  adminBody: "",
};

/**
 * Admin/internal: the customized email templates (blank where not overridden).
 * FAIL-SOFT — on any DB error returns blanks, so notifications fall back to the
 * built-in defaults rather than breaking.
 */
export async function getEmailTemplates(): Promise<ApiEmailTemplates> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(EMAIL_TEMPLATE_KEYS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const result = { ...EMPTY_TEMPLATES };
    for (const field of Object.keys(EMAIL_TEMPLATE_KEYS) as (keyof ApiEmailTemplates)[]) {
      result[field] = byKey.get(EMAIL_TEMPLATE_KEYS[field]) ?? "";
    }
    return result;
  } catch (err) {
    console.error("[settings] getEmailTemplates failed — using defaults:", err);
    return { ...EMPTY_TEMPLATES };
  }
}

/** Admin: upsert email-template keys; returns the full set. */
export async function updateEmailTemplates(
  patch: Partial<ApiEmailTemplates>,
): Promise<ApiEmailTemplates> {
  const entries = (Object.keys(patch) as (keyof ApiEmailTemplates)[])
    .filter((f) => f in EMAIL_TEMPLATE_KEYS && typeof patch[f] === "string")
    .map((f) => [EMAIL_TEMPLATE_KEYS[f], patch[f] as string] as const);
  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
  }
  return getEmailTemplates();
}

// ── Legal pages (Terms / Privacy) — public content, fetched on demand ───────────
// Large, rarely-viewed text, so kept OUT of the global /api/settings payload.
const LEGAL_KEYS: Record<keyof ApiLegalPages, string> = {
  terms: "legal_terms",
  privacy: "legal_privacy",
};

/** Public/admin: the legal page content (plain text; "" = not published yet). */
export async function getLegalPages(): Promise<ApiLegalPages> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(LEGAL_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    terms: byKey.get(LEGAL_KEYS.terms) ?? "",
    privacy: byKey.get(LEGAL_KEYS.privacy) ?? "",
  };
}

/** Admin: upsert legal page content; returns the full set. */
export async function updateLegalPages(patch: Partial<ApiLegalPages>): Promise<ApiLegalPages> {
  const entries = (Object.keys(patch) as (keyof ApiLegalPages)[])
    .filter((f) => f in LEGAL_KEYS && typeof patch[f] === "string")
    .map((f) => [LEGAL_KEYS[f], patch[f] as string] as const);
  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
  }
  return getLegalPages();
}

// ── Maintenance / site status ──────────────────────────────────────────────────
// Kept OUT of PLATFORM_SETTING_KEYS on purpose: getPlatformSettings() feeds the
// public /api/settings, which is served via okCached() with a 30s/60s/300s cache.
// Maintenance has to take effect immediately, so it gets its own uncached read
// (/api/status) and its own admin endpoint (/api/admin/maintenance).
const MAINTENANCE_KEYS = {
  enabled: "maintenance_enabled",
  title_en: "maintenance_title_en",
  title_ar: "maintenance_title_ar",
  message_en: "maintenance_message_en",
  message_ar: "maintenance_message_ar",
  eta: "maintenance_eta",
} as const;

/** Field names an admin may write (everything except the derived read shape). */
export type MaintenancePatch = Partial<{
  enabled: boolean;
  title_en: string;
  title_ar: string;
  message_en: string;
  message_ar: string;
  /** Epoch ms, or null to clear the countdown. */
  eta: number | null;
}>;

const MAINTENANCE_OFF: ApiMaintenanceStatus = {
  enabled: false,
  title_en: "",
  title_ar: "",
  message_en: "",
  message_ar: "",
  eta: null,
};

/**
 * Public: current maintenance state.
 *
 * FAIL-SOFT — on any DB error this returns "not in maintenance" rather than
 * throwing. If the database is down, the maintenance flag is unknowable, and the
 * right screen for that is the `offline` one driven by /api/ready. Throwing here
 * would turn a DB blip into a hard failure on a route whose whole job is to
 * report status.
 */
export async function getMaintenanceStatus(): Promise<ApiMaintenanceStatus> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(MAINTENANCE_KEYS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const rawEta = byKey.get(MAINTENANCE_KEYS.eta) ?? "";
    const eta = /^\d+$/.test(rawEta) ? Number(rawEta) : NaN;
    return {
      enabled: byKey.get(MAINTENANCE_KEYS.enabled) === "true",
      title_en: byKey.get(MAINTENANCE_KEYS.title_en) ?? "",
      title_ar: byKey.get(MAINTENANCE_KEYS.title_ar) ?? "",
      message_en: byKey.get(MAINTENANCE_KEYS.message_en) ?? "",
      message_ar: byKey.get(MAINTENANCE_KEYS.message_ar) ?? "",
      eta: Number.isFinite(eta) ? eta : null,
    };
  } catch (err) {
    console.error("[settings] getMaintenanceStatus failed — assuming live:", err);
    return { ...MAINTENANCE_OFF };
  }
}

/**
 * Just the gate flag, for `withMaintenance`. Same fail-soft contract: a DB error
 * means writes stay OPEN. Failing closed would mean a transient DB hiccup silently
 * rejects every public submission with a "we're doing maintenance" message that
 * isn't true — worse than letting the write attempt through and failing honestly.
 */
export async function isMaintenanceEnabled(): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: MAINTENANCE_KEYS.enabled },
    });
    return row?.value === "true";
  } catch (err) {
    console.error("[settings] isMaintenanceEnabled failed — allowing writes:", err);
    return false;
  }
}

/** Admin: upsert the provided maintenance fields; returns the full status. */
export async function updateMaintenanceStatus(
  patch: MaintenancePatch,
): Promise<ApiMaintenanceStatus> {
  const entries: [string, string][] = [];
  if (patch.enabled !== undefined) entries.push([MAINTENANCE_KEYS.enabled, String(patch.enabled)]);
  if (patch.title_en !== undefined) entries.push([MAINTENANCE_KEYS.title_en, patch.title_en]);
  if (patch.title_ar !== undefined) entries.push([MAINTENANCE_KEYS.title_ar, patch.title_ar]);
  if (patch.message_en !== undefined) entries.push([MAINTENANCE_KEYS.message_en, patch.message_en]);
  if (patch.message_ar !== undefined) entries.push([MAINTENANCE_KEYS.message_ar, patch.message_ar]);
  // null clears the countdown; "" is stored so the row exists and reads as "no ETA".
  if (patch.eta !== undefined) entries.push([MAINTENANCE_KEYS.eta, patch.eta === null ? "" : String(patch.eta)]);

  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
  }
  return getMaintenanceStatus();
}

/** Admin: upsert the provided keys (others left unchanged); returns the full set. */
export async function updatePlatformSettings(
  patch: Partial<ApiPlatformSettings>,
): Promise<ApiPlatformSettings> {
  const entries = Object.entries(patch).filter(
    (e): e is [PlatformSettingKey, string] => isKey(e[0]) && typeof e[1] === "string",
  );
  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.appSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
  }
  return getPlatformSettings();
}
