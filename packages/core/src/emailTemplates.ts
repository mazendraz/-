/**
 * The admin-editable new-lead email templates: which {{tokens}} exist, and what
 * each field cannot be sent without.
 *
 * Runtime values, not types, which is why this is its own file rather than
 * living in apiTypes.ts — that file is re-exported as `export type *` in three
 * places, and a const array folded in there is silently erased at compile time.
 * Same reasoning as districts.ts.
 *
 * Shared rather than duplicated because the rule has to hold in two places at
 * once: the API rejects a bad template (the actual gate — a direct PUT must not
 * get past it), and the admin screen shows the same message inline so nobody
 * discovers the problem via a failed save. Those two drifting apart is exactly
 * how the field list in SettingsTab.tsx had already drifted from the token map
 * in notifications.service.ts.
 *
 * The history this exists to prevent: `email_provider_subject` was "what" and
 * `email_provider_body` was "fuafjasfja" in production. The templates override
 * the built-in provider email entirely, so for as long as those two rows sat
 * there, every provider's only notification of every lead was two nonsense
 * words — no reference, no service, no customer, no phone number. Validation
 * was length-only, so nothing objected.
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
    // The capture group is non-optional in the pattern, but the compiler's
    // noUncheckedIndexedAccess doesn't know that.
    if (m[1]) seen.add(m[1]);
  }
  return [...seen];
}

/**
 * Why this template can't be saved, or null if it's fine.
 *
 * A blank field is always fine: blank means "use the built-in email", which is
 * the good outcome, not a missing configuration.
 *
 * The unknown-token half matters as much as the missing half. Substitution
 * collapses an unrecognised `{{refNumer}}` to the empty string without
 * complaining, so a typo doesn't fail loudly — it ships an email with a hole
 * where the reference number should have been, which reads as a bug in the
 * platform rather than a typo in a settings screen.
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
 * one of the two changes nothing. Without this check the admin saves, sees the
 * field persisted, and keeps receiving the built-in email with no explanation.
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
