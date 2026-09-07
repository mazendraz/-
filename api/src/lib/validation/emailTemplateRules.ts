/**
 * Local copy of packages/core/src/emailTemplates.ts's runtime rules.
 *
 * Why duplicated instead of imported: api/next.config.ts pins Turbopack's
 * project root to api/ itself (see the comment there — without it Turbopack
 * mis-detects the monorepo root and OOMs). That pin means Turbopack can only
 * resolve files inside api/, so a runtime `import ... from "@alassema/core"`
 * (which lives outside api/) fails to build — this broke production on
 * 2026-09-07 (commit e1eb6e8) once these functions started being imported for
 * real instead of just for types. api/tsconfig.json's `@alassema/core` path
 * alias is TYPE-ONLY for exactly this reason (erased at compile time, never
 * hits the bundler) — see the comment there.
 *
 * If you change the rules in packages/core/src/emailTemplates.ts, mirror the
 * change here too.
 */

/** Every token the API knows how to substitute (notifications.service leadVars). */
export const EMAIL_TEMPLATE_TOKENS = [
  "company",
  "refNumber",
  "service",
  "customer",
  "phone",
  "district",
  "budget",
  "details",
  "receivedAt",
] as const;

export type EmailTemplateToken = (typeof EMAIL_TEMPLATE_TOKENS)[number];

/** The four editable fields, as named in ApiEmailTemplates. */
export type EmailTemplateField =
  | "providerSubject"
  | "providerBody"
  | "adminSubject"
  | "adminBody";

/**
 * What each field must carry to be worth sending at all.
 *
 * The provider's email is the operational record — the message they act on — so
 * it needs the service, who the customer is, and how to reach them. The admin's
 * copy is a heads-up that deliberately carries no customer PII (see
 * buildAdminAlertEmail), so it only has to identify the lead and the company. A
 * subject needs the reference either way: that is what makes the mail findable
 * later and tells it apart from the twenty others in the inbox.
 */
export const REQUIRED_EMAIL_TOKENS: Record<EmailTemplateField, readonly EmailTemplateToken[]> = {
  providerSubject: ["refNumber"],
  providerBody: ["refNumber", "service", "customer", "phone"],
  adminSubject: ["refNumber"],
  adminBody: ["refNumber", "company", "service"],
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

/** The distinct {{token}} names used in a template body or subject. */
export function tokensUsed(value: string): string[] {
  const seen = new Set<string>();
  for (const m of value.matchAll(TOKEN_RE)) {
    if (m[1]) seen.add(m[1]);
  }
  return [...seen];
}

/**
 * Why this template can't be saved, or null if it's fine.
 *
 * A blank field is always fine: blank means "use the built-in email", which is
 * the good outcome, not a missing configuration.
 */
export function checkEmailTemplate(field: EmailTemplateField, value: string): string | null {
  const v = value.trim();
  if (v === "") return null;

  const used = tokensUsed(v);
  const known = EMAIL_TEMPLATE_TOKENS as readonly string[];

  const unknown = used.filter((tok) => !known.includes(tok));
  if (unknown.length > 0) {
    const list = unknown.map((tok) => `{{${tok}}}`).join(", ");
    const avail = EMAIL_TEMPLATE_TOKENS.map((tok) => `{{${tok}}}`).join(" ");
    return `Unknown token${unknown.length > 1 ? "s" : ""} ${list} — replaced with nothing when the email is sent. Available: ${avail}`;
  }

  const missing = REQUIRED_EMAIL_TOKENS[field].filter((tok) => !used.includes(tok));
  if (missing.length > 0) {
    const list = missing.map((tok) => `{{${tok}}}`).join(", ");
    return `Missing ${list} — without ${missing.length > 1 ? "these" : "it"} the email can't be acted on. Leave the field blank to send the built-in email instead.`;
  }

  return null;
}

/**
 * Why this subject/body PAIR can't be saved, or null if it's fine.
 *
 * Separate from checkEmailTemplate because it is a cross-field rule: the API
 * uses an override only when subject AND body are both non-blank, so filling in
 * one of the two changes nothing.
 */
export function checkEmailTemplatePair(
  subject: string,
  body: string,
): { field: "subject" | "body"; message: string } | null {
  const s = subject.trim();
  const b = body.trim();
  if (s === "" && b !== "") {
    return {
      field: "subject",
      message: "A body with no subject is ignored — fill both, or clear both to send the built-in email.",
    };
  }
  if (s !== "" && b === "") {
    return {
      field: "body",
      message: "A subject with no body is ignored — fill both, or clear both to send the built-in email.",
    };
  }
  return null;
}
