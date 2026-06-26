// Platform settings — admin-editable, public-facing config stored as key/value
// rows in AppSetting (the same table that backs site_reviews_enabled). This is the
// general "manage it from the dashboard, not the source code" store: site name,
// contact details, social links. Reads merge stored values over defaults, so a
// fresh deployment is fully functional before an admin touches anything.
import { prisma } from "@/lib/prisma";
import type { ApiEmailTemplates, ApiLegalPages, ApiPlatformSettings } from "@/lib/apiTypes";

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
