// Zod schema for PUT /admin/settings. All keys optional (partial update). Emails
// and social URLs accept "" (to clear) or a valid value. Values are HTML-stripped.
import { z } from "zod";
import { checkEmailTemplate, type EmailTemplateField } from "@/lib/validation/emailTemplateRules";
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
    // Meta pixel ids are numeric (15-16 digits today). Checked rather than
    // accepted as free text because a wrong value here is silent: the pixel
    // just never reports, and the first sign is a campaign that never learns.
    meta_pixel_id: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{8,20}$/.test(v), "Must be a numeric Pixel ID, or blank"),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one setting is required" });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// PUT /admin/email-templates. Plain text with {{tokens}}; blank = built-in default.
//
// These four fields OVERRIDE the built-in provider/admin new-lead emails
// (notifications.service.ts). They used to be validated as nothing but
// length-capped text, which is how a subject of "what" over a body of
// "fuafjasfja" reached production and became the ONLY thing every provider was
// told about every lead. Length was never the property that mattered: a lead
// notification is useless unless it carries the reference, and the provider's
// copy is useless unless it carries the customer's contact details.
//
// The rule itself lives in @alassema/core so the admin screen can show the same
// message inline instead of surfacing it only as a failed save. THIS is the
// gate, though — a direct PUT must not get past it.
export const updateEmailTemplatesSchema = z
  .object({
    providerSubject: text(200),
    providerBody: text(5000),
    adminSubject: text(200),
    adminBody: text(5000),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one template field is required" })
  .superRefine((o, ctx) => {
    for (const [field, value] of Object.entries(o)) {
      if (typeof value !== "string") continue;
      const problem = checkEmailTemplate(field as EmailTemplateField, value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: problem });
    }
  });

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

// PUT /admin/maintenance — the "site is down for maintenance" screen.
// Separate from updateSettingsSchema because maintenance is NOT part of the cached
// public /api/settings payload (see ApiMaintenanceStatus for why).
export const updateMaintenanceSchema = z
  .object({
    enabled: z.boolean(),
    title_en: text(160),
    title_ar: text(160),
    message_en: text(1000),
    message_ar: text(1000),
    // Epoch ms for the countdown; null clears it. Bounded so a mistyped value
    // can't render a countdown decades out (or in the past, which reads as broken).
    eta: z
      .number()
      .int()
      .positive()
      .max(4102444800000, "ETA is unreasonably far in the future") // 2100-01-01
      .nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" });

export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;

// PUT /admin/notification-settings — admin's chat-notification mute switch.
export const updateAdminNotificationSettingsSchema = z
  .object({ chatEnabled: z.boolean() })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" });

export type UpdateAdminNotificationSettingsInput = z.infer<
  typeof updateAdminNotificationSettingsSchema
>;
