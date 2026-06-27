// Zod schema for PUT /admin/settings. All keys optional (partial update). Emails
// and social URLs accept "" (to clear) or a valid value. Values are HTML-stripped.
import { z } from "zod";
import { stripHtml } from "@/lib/utils/sanitize";

const text = (max: number) => z.string().transform(stripHtml).pipe(z.string().max(max));
const emailOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Invalid email address");
const urlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "Must be a URL (https://…) or blank");
// Logo size percentage: blank (100%) or an integer in 50–200.
const scaleOrEmpty = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 50 && Number(v) <= 200),
    "Must be a whole number between 50 and 200, or blank",
  );

export const updateSettingsSchema = z
  .object({
    site_name: text(100),
    support_email: emailOrEmpty,
    public_phone: text(40),
    address: text(300),
    social_facebook: urlOrEmpty,
    social_instagram: urlOrEmpty,
    social_twitter: urlOrEmpty,
    social_linkedin: urlOrEmpty,
    districts: text(2000),
    budgets: text(1000),
    hero_title_en: text(160),
    hero_title_ar: text(160),
    hero_subtitle_en: text(300),
    hero_subtitle_ar: text(300),
    logo_url: urlOrEmpty,
    favicon_url: urlOrEmpty,
    logo_scale: scaleOrEmpty,
    hero_image_url: urlOrEmpty,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one setting is required" });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// PUT /admin/email-templates. Plain text with {{tokens}}; blank = built-in default.
export const updateEmailTemplatesSchema = z
  .object({
    providerSubject: text(200),
    providerBody: text(5000),
    adminSubject: text(200),
    adminBody: text(5000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one template field is required" });

export type UpdateEmailTemplatesInput = z.infer<typeof updateEmailTemplatesSchema>;

// PUT /admin/pages — Terms / Privacy content (plain text).
export const updateLegalPagesSchema = z
  .object({
    terms: text(40000),
    privacy: text(40000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one page is required" });

export type UpdateLegalPagesInput = z.infer<typeof updateLegalPagesSchema>;
