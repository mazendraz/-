// Provider notifications on new leads (post-MVP). Email via Resend's HTTP API
// (no SDK dependency). Designed to FAIL OPEN: a missing key, missing provider
// email, or a send error never throws — lead creation must never break or block
// because of notifications.
import type { ApiLead } from "@/lib/apiTypes";
import { getEmailTemplates, getPlatformSettings } from "@/lib/services/settings.service";
import {
  emailButton,
  emailDataTable,
  emailHeading,
  emailLink,
  emailMuted,
  emailNotice,
  emailParagraph,
  escapeHtml,
  renderEmailDocument,
  type EmailFooterInfo,
} from "@/lib/utils/emailLayout";

export interface LeadNotificationTarget {
  /** Provider contact email (Company.email). Null/absent → email skipped. */
  email: string | null;
  /** Provider WhatsApp number (Company.whatsapp), for the optional channel. */
  whatsapp?: string | null;
  companyName: string;
}

export interface BuiltEmail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  /** Wrapper text direction — "rtl" for the Arabic customer-facing emails,
   *  default "ltr" for the (still-English) provider/admin operational ones.
   *  Only affects the wrapper's own alignment; each email's own `html` still
   *  controls its own markup. */
  dir?: "ltr" | "rtl";
  /** Raw email headers passed straight through to Resend — used for
   *  List-Unsubscribe / List-Unsubscribe-Post on marketing sends (see
   *  notifications.marketing.service.ts). Absent on every transactional
   *  email; there is nothing to unsubscribe FROM. */
  headers?: Record<string, string>;
  /** Inbox preview line — the grey text clients show next to the subject.
   *  Optional: without one the client scrapes the top of the body, which for
   *  a logo-first layout is whatever the logo's alt text happens to be. */
  preheader?: string;
  /** Extra HTML placed at the TOP of the shell's footer block, above the
   *  contact line — the marketing unsubscribe link is the only user. */
  footerExtraHtml?: string;
  /** Override the send-as address — marketing mail uses RESEND_MARKETING_FROM
   *  when configured (a subdomain like news.alassema.com, keeping a spam
   *  complaint on a campaign from ever touching the reputation of the
   *  domain verification/receipt mail sends from). Falls back to
   *  RESEND_FROM when unset, so this is purely additive. */
  from?: string;
}

// ── Admin-editable templates (token substitution) ───────────────────────────────

/** Token map for a lead — feeds both the provider and admin templates. */
function leadVars(lead: ApiLead, companyName: string): Record<string, string> {
  return {
    company: companyName,
    refNumber: lead.refNumber,
    service: lead.service,
    customer: lead.name,
    phone: lead.phone,
    district: lead.district,
    budget: lead.budget,
    details: lead.description,
    receivedAt: new Date(lead.createdAt).toISOString(),
  };
}

/** Replace {{token}} occurrences; unknown tokens collapse to "". */
function applyTokens(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

/**
 * Render a {subject, text, html} from admin templates. The whole substituted body
 * is HTML-escaped (values + literal text) and newlines become <br>, so a template
 * can never inject markup. Pure — unit-testable.
 */
export function buildFromTemplate(
  subject: string,
  body: string,
  vars: Record<string, string>,
): Omit<BuiltEmail, "to"> {
  const text = applyTokens(body, vars);
  const html = escapeHtml(text).replace(/\n/g, "<br>");
  return { subject: applyTokens(subject, vars), text, html };
}

/**
 * Build the new-lead email, or null if there's no provider email to send to.
 * Pure function — unit-testable without sending.
 */
export function buildNewLeadEmail(
  lead: ApiLead,
  target: LeadNotificationTarget,
): BuiltEmail | null {
  if (!target.email) return null;

  const subject = `New lead ${lead.refNumber} — ${lead.service}`;
  // Budget and details are optional on the request form now — a customer who
  // left them blank shouldn't produce a "Budget: " row with nothing after it.
  const rows: [string, string][] = [
    ["Reference", lead.refNumber],
    ["Service", lead.service],
    ["Customer", lead.name],
    ["Phone", lead.phone],
    ["District", lead.district],
    ...(lead.budget ? [["Budget", lead.budget]] as [string, string][] : []),
    ...(lead.description ? [["Details", lead.description]] as [string, string][] : []),
  ];

  const text =
    `You have a new lead for ${target.companyName}.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nReceived: ${new Date(lead.createdAt).toISOString()}`;

  const html =
    `<h2>New lead for ${escapeHtml(target.companyName)}</h2><table>` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>`;

  return { to: target.email, subject, text, html };
}

// Every outgoing email is branded the same way — wrapping it here, once, at the
// actual send boundary means every call site above (provider/admin alerts,
// verification, price-confirmation, and the order-placed email below) gets the
// logo automatically instead of each one having to remember to add it.
const SITE_URL = (process.env.PUBLIC_SITE_URL ?? "https://al-assema.tech").replace(/\/$/, "");
// A dedicated asset (app/public/email-logo.png), not the site header's
// /logo.png: an email logo has to be a raster at a fixed pixel width, trimmed
// of its transparent margin, and FLATTENED ONTO WHITE — a transparent PNG goes
// black-on-black the moment a client composites it on a dark background, and
// the brand mark is black line art. Regenerate it from app/public/favicon.png
// (the master brand lockup) with sharp: .trim().resize({width:264}).flatten
// ({background:"#ffffff"}) — 264px is 2× the 132px it renders at, for retina.
const DEFAULT_LOGO_URL = `${SITE_URL}/email-logo.png`;

interface EmailBranding {
  logoUrl: string;
  footer: EmailFooterInfo;
}

const FALLBACK_BRANDING: EmailBranding = {
  logoUrl: DEFAULT_LOGO_URL,
  footer: { siteName: "Al Assema", siteUrl: SITE_URL },
};

/**
 * Logo + footer identity for the shell, admin-uploaded logo and admin-entered
 * contact details preferred. Falls back to the built-in asset and a bare
 * name/URL footer on any DB error — the same fail-soft contract as
 * getEmailTemplates, so a settings-table hiccup degrades to default branding,
 * never to no email.
 */
async function resolveBranding(): Promise<EmailBranding> {
  try {
    const s = await getPlatformSettings();
    return {
      logoUrl: s.logo_url || DEFAULT_LOGO_URL,
      footer: {
        siteName: s.site_name || "Al Assema",
        siteUrl: SITE_URL,
        supportEmail: s.support_email || undefined,
        phone: s.public_phone || undefined,
        address: s.address || undefined,
      },
    };
  } catch {
    return FALLBACK_BRANDING;
  }
}

/** Put one email's body into the shared branded document (see emailLayout.ts).
 *  Kept as a thin named seam so every send in this file goes through the exact
 *  same frame — that is what makes "change the look" a one-file change. */
function wrapEmailHtml(
  bodyHtml: string,
  branding: EmailBranding,
  dir: "ltr" | "rtl" = "ltr",
  preheader?: string,
  footerExtraHtml?: string,
): string {
  return renderEmailDocument({
    bodyHtml,
    logoUrl: branding.logoUrl,
    dir,
    preheader,
    footer: branding.footer,
    footerExtraHtml,
  });
}

/**
 * Print a one-time account link (verify / reset) to the server console.
 *
 * DEVELOPMENT ONLY — hard-gated on NODE_ENV, because these links ARE the
 * credential: anyone who can read the log could activate an account or take
 * over a password with one. That is fine on a developer's own machine and
 * unacceptable anywhere else.
 *
 * Exists because the mail path has a failure mode that is invisible from the
 * client and blocks the whole signup funnel: Resend's shared test sender
 * (onboarding@resend.dev, the default when RESEND_FROM is unset) refuses every
 * recipient except the Resend account owner with a 403, so on a fresh dev setup
 * NOBODY can complete registration. Logged BEFORE the send attempt, not after,
 * precisely so it is there when the send is the thing that failed.
 */
function logDevLink(kind: string, to: string, link: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`\n[dev] ${kind} link for ${to}:\n${link}\n`);
}

async function sendViaResend(apiKey: string, email: BuiltEmail): Promise<void> {
  const from = email.from ?? process.env.RESEND_FROM ?? "Al Assema <onboarding@resend.dev>";
  const branding = await resolveBranding();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: wrapEmailHtml(email.html, branding, email.dir, email.preheader, email.footerExtraHtml),
      ...(email.headers ? { headers: email.headers } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}

/**
 * Send an already-built email. Never throws; returns whether it actually
 * went out. The shared tail every send* function in this file repeats
 * inline (check the key, send, catch) — exported so a caller that builds
 * its OWN BuiltEmail (notifications.marketing.service.ts's gate wraps
 * every marketing send) doesn't have to re-implement that boilerplate a
 * tenth time. Existing send* functions are left as they are; this is for
 * new call sites, not a retrofit.
 */
export async function sendBuiltEmail(email: BuiltEmail): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping email send");
      return false;
    }
    await sendViaResend(apiKey, email);
    return true;
  } catch (err) {
    console.error("[notify] email send failed:", err);
    return false;
  }
}

/**
 * Notify a provider of a new lead. Never throws. Returns true if an email was
 * actually dispatched, false if skipped (no key / no recipient).
 */
export async function notifyNewLead(
  lead: ApiLead,
  target: LeadNotificationTarget,
): Promise<boolean> {
  try {
    if (!target.email) return false; // no provider email on file

    // Admin-customized template when both fields are set; else the built-in default.
    const tpl = await getEmailTemplates();
    const email: BuiltEmail =
      tpl.providerSubject && tpl.providerBody
        ? { to: target.email, ...buildFromTemplate(tpl.providerSubject, tpl.providerBody, leadVars(lead, target.companyName)) }
        : buildNewLeadEmail(lead, target)!;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(
        `[notify] RESEND_API_KEY not set — skipping email for lead ${lead.refNumber}`,
      );
      return false;
    }

    await sendViaResend(apiKey, email);
    // Optional: WhatsApp/SMS (Twilio / WhatsApp Business API) could fire here when
    // target.whatsapp + provider credentials are configured.
    return true;
  } catch (err) {
    console.error(`[notify] failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Build the admin-alert email body (without `to`). This goes to EVERY admin as a
 * monitoring heads-up, so it deliberately OMITS customer PII (name, phone, budget,
 * description) — only the provider, who must act on the lead, gets those (see
 * buildNewLeadEmail). Admins open the dashboard for the full record.
 */
export function buildAdminAlertEmail(
  lead: ApiLead,
  companyName: string,
): Omit<BuiltEmail, "to"> {
  const subject = `New lead — ${companyName} — ${lead.refNumber}`;
  const rows: [string, string][] = [
    ["Company", companyName],
    ["Reference", lead.refNumber],
    ["Service", lead.service],
    ["District", lead.district],
  ];

  const text =
    `A new lead was submitted on Al Assema.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nReceived: ${new Date(lead.createdAt).toISOString()}` +
    `\n\nCustomer contact details are in the admin dashboard (omitted here for privacy).`;

  const html =
    `<h2>New lead — ${escapeHtml(companyName)}</h2><table>` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>` +
    `<p>Customer contact details are in the admin dashboard (omitted here for privacy).</p>`;

  return { subject, text, html };
}

/**
 * Notify all admins of a new lead, in one email with multiple recipients. Never
 * throws. Returns true if an email was dispatched, false if skipped (no key / no
 * recipients). Same fail-open philosophy as notifyNewLead.
 */
export async function notifyAdmins(
  lead: ApiLead,
  companyName: string,
  adminEmails: (string | null | undefined)[],
): Promise<boolean> {
  try {
    const recipients = [...new Set(adminEmails.filter((e): e is string => !!e))];
    if (recipients.length === 0) return false;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(
        `[notify] RESEND_API_KEY not set — skipping admin alert for lead ${lead.refNumber}`,
      );
      return false;
    }

    const tpl = await getEmailTemplates();
    const built =
      tpl.adminSubject && tpl.adminBody
        ? buildFromTemplate(tpl.adminSubject, tpl.adminBody, leadVars(lead, companyName))
        : buildAdminAlertEmail(lead, companyName);
    await sendViaResend(apiKey, { to: recipients, ...built });
    return true;
  } catch (err) {
    console.error(`[notify] admin alert failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Build the customer-facing order-received email, or null if there's no address
 * to send it to (guest leads with no signed-in account have none). Pure —
 * unit-testable without sending. Deliberately has no pricing/customer-PII table
 * like the provider email: this is a receipt, not the operational record.
 */
export function buildOrderPlacedEmail(
  lead: ApiLead,
  customerEmail: string | null,
  customerName: string,
  companyName: string,
): BuiltEmail | null {
  if (!customerEmail) return null;

  const subject = `تم استلام طلبك — ${lead.refNumber}`;
  const text =
    `أهلًا ${customerName}،\n\n` +
    `استلمنا طلبك لخدمة "${lead.service}" وبعتناه لـ${companyName}.\n\n` +
    `رقم الطلب: ${lead.refNumber}\n\n` +
    `تابع طلبك: ${SITE_URL}/requests\n\n` +
    `هيتواصلوا معاك قريب — تقدر كمان تكلّمهم مباشرة من التطبيق.`;
  const html =
    emailHeading("تم استلام طلبك") +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      `استلمنا طلبك وبعتناه لـ<strong>${escapeHtml(companyName)}</strong>.`,
    ) +
    emailDataTable([
      ["الخدمة", lead.service],
      ["رقم الطلب", lead.refNumber],
      ["الشركة", companyName],
    ]) +
    emailButton("تابع طلبك", `${SITE_URL}/requests`) +
    emailMuted("هيتواصلوا معاك قريب — تقدر كمان تكلّمهم مباشرة من التطبيق.");

  return {
    to: customerEmail,
    subject,
    text,
    html,
    dir: "rtl",
    preheader: `طلبك ${lead.refNumber} لخدمة ${lead.service} وصل لـ${companyName}`,
  };
}

/**
 * Notify the customer their order was received. Never throws. Returns true if
 * dispatched, false if skipped (no key / no signed-in account with an email —
 * a guest lead has neither).
 */
export async function notifyCustomerOrderPlaced(
  lead: ApiLead,
  customerEmail: string | null,
  customerName: string,
  companyName: string,
): Promise<boolean> {
  try {
    const email = buildOrderPlacedEmail(lead, customerEmail, customerName, companyName);
    if (!email) return false;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(
        `[notify] RESEND_API_KEY not set — skipping order-received email for lead ${lead.refNumber}`,
      );
      return false;
    }

    await sendViaResend(apiKey, email);
    return true;
  } catch (err) {
    console.error(`[notify] order-received email failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Notify all admins that a provider submitted (or edited) a portfolio project that
 * now needs approval. One email, multiple recipients. Never throws; returns true if
 * an email was dispatched, false if skipped (no key / no recipients).
 */
export async function notifyAdminsProjectSubmitted(params: {
  projectTitle: string;
  companyName: string;
  adminEmails: (string | null | undefined)[];
}): Promise<boolean> {
  try {
    const recipients = [...new Set(params.adminEmails.filter((e): e is string => !!e))];
    if (recipients.length === 0) return false;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping project-submission alert");
      return false;
    }

    const subject = `New project for review — ${params.companyName}`;
    const text =
      `${params.companyName} submitted a portfolio project "${params.projectTitle}" for approval.\n\n` +
      `Review it in the admin dashboard → Reviews & Feedback → Project approvals.`;
    const html =
      `<h2>New project for review</h2>` +
      `<p><strong>${escapeHtml(params.companyName)}</strong> submitted a portfolio project ` +
      `"<strong>${escapeHtml(params.projectTitle)}</strong>" for approval.</p>` +
      `<p>Review it in the admin dashboard → Reviews &amp; Feedback → Project approvals.</p>`;

    await sendViaResend(apiKey, { to: recipients, subject, text, html });
    return true;
  } catch (err) {
    console.error("[notify] project-submission alert failed:", err);
    return false;
  }
}

// ── Final price verification (Service Completion feature) ──────────────────────
// The client has no account/notification channel of their own (see
// leadCompletion.service.verify) — only the PROVIDER is notified here, once the
// client has responded to the amount the provider reported. Copy is deliberately
// neutral: a discrepancy is a recorded difference for admin review, never framed
// as fraud, dishonesty, or an accusation.

function formatEgp(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US")}`;
}

export function buildAmountConfirmedEmail(
  lead: ApiLead,
  target: LeadNotificationTarget,
): BuiltEmail | null {
  if (!target.email) return null;
  const amount = lead.completion ? formatEgp(lead.completion.finalTotal) : "";

  const subject = `Amount confirmed — ${lead.refNumber}`;
  const text =
    `${lead.name} confirmed the final amount of ${amount} for "${lead.service}" ` +
    `(${lead.refNumber}).\n\nThe order is now closed.`;
  const html =
    `<h2>Amount confirmed</h2>` +
    `<p><strong>${escapeHtml(lead.name)}</strong> confirmed the final amount of ` +
    `<strong>${escapeHtml(amount)}</strong> for "${escapeHtml(lead.service)}" (${escapeHtml(lead.refNumber)}).</p>` +
    `<p>The order is now closed.</p>`;

  return { to: target.email, subject, text, html };
}

export function buildAmountDiscrepancyEmail(
  lead: ApiLead,
  target: LeadNotificationTarget,
): BuiltEmail | null {
  if (!target.email) return null;
  const c = lead.completion;
  const providerAmount = c ? formatEgp(c.finalTotal) : "";
  const clientAmount = c?.clientAmount != null ? formatEgp(c.clientAmount) : "";

  const subject = `Amount discrepancy reported — ${lead.refNumber}`;
  const text =
    `The client reported a different final amount for this service.\n\n` +
    `Order: ${lead.refNumber} — ${lead.service}\n` +
    `You reported: ${providerAmount}\n` +
    `Client reported: ${clientAmount}` +
    (c?.discrepancyNote ? `\nClient note: ${c.discrepancyNote}` : "") +
    `\n\nThis has been recorded and is visible to admins. No action has been taken automatically.`;
  const html =
    `<h2>Amount discrepancy reported</h2>` +
    `<p>The client reported a different final amount for this service.</p>` +
    `<p><strong>Order:</strong> ${escapeHtml(lead.refNumber)} — ${escapeHtml(lead.service)}<br>` +
    `<strong>You reported:</strong> ${escapeHtml(providerAmount)}<br>` +
    `<strong>Client reported:</strong> ${escapeHtml(clientAmount)}` +
    (c?.discrepancyNote ? `<br><strong>Client note:</strong> ${escapeHtml(c.discrepancyNote)}` : "") +
    `</p><p>This has been recorded and is visible to admins. No action has been taken automatically.</p>`;

  return { to: target.email, subject, text, html };
}

/** Never throws. Returns true if dispatched, false if skipped (no key / no recipient). */
export async function notifyProviderAmountConfirmed(
  lead: ApiLead,
  target: LeadNotificationTarget,
): Promise<boolean> {
  try {
    const email = buildAmountConfirmedEmail(lead, target);
    if (!email) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set — skipping confirmation email for lead ${lead.refNumber}`);
      return false;
    }
    await sendViaResend(apiKey, email);
    return true;
  } catch (err) {
    console.error(`[notify] amount-confirmed email failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/** Never throws. Returns true if dispatched, false if skipped (no key / no recipient). */
export async function notifyProviderAmountDiscrepancy(
  lead: ApiLead,
  target: LeadNotificationTarget,
): Promise<boolean> {
  try {
    const email = buildAmountDiscrepancyEmail(lead, target);
    if (!email) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set — skipping discrepancy email for lead ${lead.refNumber}`);
      return false;
    }
    await sendViaResend(apiKey, email);
    return true;
  } catch (err) {
    console.error(`[notify] amount-discrepancy email failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Notify all admins that a client reported a different final amount than the
 * provider did — the one verification outcome that actually needs a human to
 * look at it (a confirmed amount just closes the order). One email, multiple
 * recipients; same neutral, non-accusatory copy as the provider-facing
 * version. Never throws; returns true if dispatched, false if skipped.
 */
export async function notifyAdminsAmountDiscrepancy(
  lead: ApiLead,
  companyName: string,
  adminEmails: (string | null | undefined)[],
): Promise<boolean> {
  try {
    const recipients = [...new Set(adminEmails.filter((e): e is string => !!e))];
    if (recipients.length === 0) return false;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set — skipping admin discrepancy alert for lead ${lead.refNumber}`);
      return false;
    }

    const c = lead.completion;
    const providerAmount = c ? formatEgp(c.finalTotal) : "";
    const clientAmount = c?.clientAmount != null ? formatEgp(c.clientAmount) : "";

    const subject = `Amount discrepancy — ${companyName} — ${lead.refNumber}`;
    const text =
      `A client reported a different final amount than the provider for this order.\n\n` +
      `Company: ${companyName}\n` +
      `Order: ${lead.refNumber} — ${lead.service}\n` +
      `Provider reported: ${providerAmount}\n` +
      `Client reported: ${clientAmount}` +
      (c?.discrepancyNote ? `\nClient note: ${c.discrepancyNote}` : "") +
      `\n\nReview it in the admin dashboard.`;
    const html =
      `<h2>Amount discrepancy</h2>` +
      `<p>A client reported a different final amount than the provider for this order.</p>` +
      `<p><strong>Company:</strong> ${escapeHtml(companyName)}<br>` +
      `<strong>Order:</strong> ${escapeHtml(lead.refNumber)} — ${escapeHtml(lead.service)}<br>` +
      `<strong>Provider reported:</strong> ${escapeHtml(providerAmount)}<br>` +
      `<strong>Client reported:</strong> ${escapeHtml(clientAmount)}` +
      (c?.discrepancyNote ? `<br><strong>Client note:</strong> ${escapeHtml(c.discrepancyNote)}` : "") +
      `</p><p>Review it in the admin dashboard.</p>`;

    await sendViaResend(apiKey, { to: recipients, subject, text, html });
    return true;
  } catch (err) {
    console.error(`[notify] admin discrepancy alert failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

/**
 * Notify all admins that a customer left a verified review for a company. One email,
 * multiple recipients. Never throws; returns true if dispatched, false if skipped.
 */
export async function notifyAdminsReviewSubmitted(params: {
  companyName: string;
  rating: number;
  author: string;
  adminEmails: (string | null | undefined)[];
}): Promise<boolean> {
  try {
    const recipients = [...new Set(params.adminEmails.filter((e): e is string => !!e))];
    if (recipients.length === 0) return false;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping review alert");
      return false;
    }

    const stars = "★".repeat(params.rating) + "☆".repeat(Math.max(0, 5 - params.rating));
    const subject = `New review to approve — ${params.companyName} (${params.rating}/5)`;
    const text =
      `${params.author} left a ${params.rating}/5 review for ${params.companyName} and it's awaiting approval.\n\n` +
      `Approve or delete it in the admin dashboard → Reviews & Feedback → Customer reviews.`;
    const html =
      `<h2>New review to approve</h2>` +
      `<p><strong>${escapeHtml(params.author)}</strong> left a ${escapeHtml(stars)} (${params.rating}/5) ` +
      `review for <strong>${escapeHtml(params.companyName)}</strong> — awaiting approval.</p>` +
      `<p>Approve or delete it in the admin dashboard → Reviews &amp; Feedback → Customer reviews.</p>`;

    await sendViaResend(apiKey, { to: recipients, subject, text, html });
    return true;
  } catch (err) {
    console.error("[notify] review alert failed:", err);
    return false;
  }
}

/**
 * Send a customer their email-verification link.
 *
 * Never throws — same fail-open contract as every send in this file. A mail
 * outage must not surface to the customer as "registration failed", because the
 * account WAS created; only the link is missing, and they can ask for another.
 *
 * Returns true if an email was dispatched, false if it was skipped or failed.
 * The caller ignores it deliberately: acting on the difference would tell the
 * browser whether a given address is deliverable.
 */
export async function sendCustomerVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Loud on purpose. Without a key, registration silently produces accounts
      // nobody can ever activate — a broken funnel that looks like nothing at
      // all in the logs unless this line is here.
      console.warn(
        "[notify] RESEND_API_KEY not set — customer verification email NOT sent. " +
          "Password registration cannot be completed until it is configured.",
      );
      return false;
    }

    const site = (process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    // encodeURIComponent even though the token is base64url (URL-safe by
    // construction): the guarantee belongs at the boundary that builds the URL,
    // not in an assumption about how the token was generated three files away.
    const link = `${site}/verify-email?token=${encodeURIComponent(token)}`;
    // Printed BEFORE the send is attempted, and only outside production — which
    // is what makes it useful in the case it exists for. A Resend account with
    // no verified domain refuses every recipient except the account owner's own
    // address (403), so local signup with any other address dead-ends at "we
    // couldn't send the email" with the link existing but unreachable. The
    // password-reset mail below has always logged its link this way; this one
    // not doing the same was an oversight, not a decision.
    logDevLink("verify-email", to, link);

    const subject = "تأكيد بريدك الإلكتروني — العاصمة";
    const text =
      `أهلًا ${name}،\n\n` +
      `أكّد بريدك الإلكتروني عشان تخلّص إعداد حسابك في العاصمة:\n\n` +
      `${link}\n\n` +
      `الرابط ده صالح لمدة 24 ساعة.\n\n` +
      `لو مش إنت اللي عملت الحساب، تجاهل الإيميل ده — مفيش حاجة هتحصل ` +
      `غير لو حد استخدم الرابط اللي فوق.`;
    const html =
      emailHeading("تأكيد بريدك الإلكتروني") +
      emailParagraph(`أهلًا ${escapeHtml(name)}،`) +
      emailParagraph("أكّد بريدك الإلكتروني عشان تخلّص إعداد حسابك في العاصمة.") +
      emailButton("تأكيد البريد الإلكتروني", link) +
      emailMuted("الرابط ده صالح لمدة 24 ساعة.") +
      // The full URL as text too: a client that strips the button (or a
      // forwarded copy) still leaves the user something they can copy.
      emailMuted(
        `لو الزرار مش شغال، انسخ الرابط ده في المتصفح:<br>` +
          `<span style="word-break:break-all;direction:ltr;display:inline-block">${escapeHtml(link)}</span>`,
      ) +
      emailMuted(
        "لو مش إنت اللي عملت الحساب، تجاهل الإيميل ده — مفيش حاجة هتحصل غير لو حد استخدم الرابط اللي فوق.",
      );

    await sendViaResend(apiKey, {
      to,
      subject,
      text,
      html,
      dir: "rtl",
      preheader: "خطوة واحدة كمان وحسابك يبقى جاهز — الرابط صالح 24 ساعة.",
    });
    return true;
  } catch (err) {
    console.error("[notify] customer verification email failed:", err);
    return false;
  }
}

/**
 * The forgot-password email. Same shape as sendCustomerVerificationEmail
 * above (same failure handling, same link-building rule), pointed at
 * /reset-password instead of /verify-email.
 *
 * `/reset-password` now resolves on both clients — app/src/pages/ResetPassword.tsx
 * on the website and mobile/client/app/reset-password.tsx in the app — so this
 * path is load-bearing: changing it here breaks every link already sitting in
 * someone's inbox. See customerPassword.service.ts's requestPasswordReset, the
 * one caller.
 */
export async function sendCustomerPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "[notify] RESEND_API_KEY not set — customer password-reset email NOT sent.",
      );
      return false;
    }

    const site = (process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const link = `${site}/reset-password?token=${encodeURIComponent(token)}`;
    logDevLink("reset-password", to, link);

    const subject = "إعادة تعيين كلمة السر — العاصمة";
    const text =
      `أهلًا ${name}،\n\n` +
      `وصلنا طلب لإعادة تعيين كلمة سر حسابك في العاصمة:\n\n` +
      `${link}\n\n` +
      `الرابط ده صالح لمدة ساعة واحدة، ويشتغل مرة واحدة بس.\n\n` +
      `لو مش إنت اللي طلبت ده، تجاهل الإيميل ده — كلمة السر مش هتتغيّر ` +
      `غير لو حد استخدم الرابط اللي فوق.`;
    const html =
      emailHeading("إعادة تعيين كلمة السر") +
      emailParagraph(`أهلًا ${escapeHtml(name)}،`) +
      emailParagraph("وصلنا طلب لإعادة تعيين كلمة سر حسابك في العاصمة.") +
      emailButton("إعادة تعيين كلمة السر", link) +
      emailMuted("الرابط ده صالح لمدة ساعة واحدة، ويشتغل مرة واحدة بس.") +
      emailMuted(
        `لو الزرار مش شغال، انسخ الرابط ده في المتصفح:<br>` +
          `<span style="word-break:break-all;direction:ltr;display:inline-block">${escapeHtml(link)}</span>`,
      ) +
      emailMuted(
        "لو مش إنت اللي طلبت ده، تجاهل الإيميل ده — كلمة السر مش هتتغيّر غير لو حد استخدم الرابط اللي فوق.",
      );

    await sendViaResend(apiKey, {
      to,
      subject,
      text,
      html,
      dir: "rtl",
      preheader: "رابط إعادة تعيين كلمة السر — صالح لمدة ساعة واحدة بس.",
    });
    return true;
  } catch (err) {
    console.error("[notify] customer password-reset email failed:", err);
    return false;
  }
}

/**
 * Welcome email — fires exactly once, the moment an account first becomes
 * usable: customerPassword.service.verifyEmail (password accounts) and
 * customerAuth.service's "new account" branch (Google/Apple — already
 * verified by the provider, so there's no separate activation step to wait
 * for). Never throws — same fail-open contract as every send in this file;
 * a mail hiccup must not make account creation look like it failed when the
 * account is sitting there created and usable.
 */
export async function sendCustomerWelcomeEmail(to: string, name: string): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping welcome email");
      return false;
    }

    const site = (process.env.PUBLIC_SITE_URL ?? "https://al-assema.tech").replace(/\/$/, "");

    const subject = "أهلًا بيك في العاصمة";
    const text =
      `أهلًا ${name}،\n\n` +
      `حسابك جاهز. من دلوقتي تقدر تطلب أي خدمة — تشطيبات، صيانة، نقل عفش، تنظيف — ` +
      `وتستقبل عروض من شركات موثّقة في نفس اليوم غالبًا.\n\n` +
      `ابدأ من هنا: ${site}\n\n` +
      `لو عندك أي سؤال، فريقنا موجود.`;
    const html =
      emailHeading("أهلًا بيك في العاصمة") +
      emailParagraph(`أهلًا ${escapeHtml(name)}،`) +
      emailParagraph(
        "حسابك جاهز. من دلوقتي تقدر تطلب أي خدمة — تشطيبات، صيانة، نقل عفش، تنظيف — " +
          "وتستقبل عروض من شركات موثّقة في نفس اليوم غالبًا.",
      ) +
      emailDataTable([
        ["اطلب خدمة", "من الموقع أو التطبيق في دقيقة"],
        ["استقبل عروض", "من شركات موثّقة في نفس اليوم غالبًا"],
        ["اختار وقارن", "بالتقييمات والأسعار قبل ما تقرّر"],
      ]) +
      emailButton("ابدأ دلوقتي", site) +
      emailMuted("لو عندك أي سؤال، فريقنا موجود.");

    await sendViaResend(apiKey, {
      to,
      subject,
      text,
      html,
      dir: "rtl",
      preheader: "حسابك جاهز — اطلب أي خدمة واستقبل عروض من شركات موثّقة.",
    });
    return true;
  } catch (err) {
    console.error("[notify] welcome email failed:", err);
    return false;
  }
}

// ── Final service summary (customer receipt, on CONFIRMED verification) ────────
// Sent once, from leadCompletion.service.ts's applyVerification — the CONFIRMED
// branch only (a discrepancy isn't a closed, agreed summary; the client already
// sees that outcome in-app via the price-verification screen itself). This is a
// TRANSACTIONAL receipt, not a Notification-center card: same shape as
// notifyCustomerOrderPlaced above (direct email, no Notification row, no
// marketing gate) — the "please verify" moment already produced the in-app
// card (LEAD_COMPLETED, via leadCompletion's submitCompletion); this is that
// story's closing email, one lead, one email, never duplicated because
// applyVerification's PENDING → CONFIRMED transition is itself claimed exactly
// once (see the conditional updateMany there).

export function buildServiceSummaryEmail(
  lead: ApiLead,
  customerEmail: string | null,
  customerName: string,
  companyName: string,
): BuiltEmail | null {
  if (!customerEmail) return null;
  const amount = lead.completion ? formatEgp(lead.completion.finalTotal) : "";

  const subject = `ملخص الخدمة — ${lead.refNumber}`;
  const text =
    `أهلًا ${customerName}،\n\n` +
    `تم تأكيد المبلغ النهائي لخدمة "${lead.service}" مع ${companyName}.\n\n` +
    `رقم الطلب: ${lead.refNumber}\n` +
    `المبلغ النهائي: ${amount}\n\n` +
    `تقدر تراجع تفاصيل الطلب أو تكلّم ${companyName} في أي وقت من التطبيق.`;
  const html =
    emailHeading("ملخص الخدمة") +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      `تم تأكيد المبلغ النهائي لخدمة "<strong>${escapeHtml(lead.service)}</strong>" ` +
        `مع <strong>${escapeHtml(companyName)}</strong>.`,
    ) +
    emailDataTable([
      ["رقم الطلب", lead.refNumber],
      ["الخدمة", lead.service],
      ["الشركة", companyName],
      ["المبلغ النهائي", amount],
    ]) +
    emailParagraph(
      `تقدر تراجع تفاصيل الطلب أو تكلّم ${escapeHtml(companyName)} في أي وقت من التطبيق.`,
    ) +
    emailButton("راجع طلباتك", `${SITE_URL}/requests`);

  return {
    to: customerEmail,
    subject,
    text,
    html,
    dir: "rtl",
    preheader: `المبلغ النهائي ${amount} — طلب ${lead.refNumber} مع ${companyName}`,
  };
}

/** Never throws. Returns true if dispatched, false if skipped (no key / no
 *  signed-in account with an email — a guest lead has neither). */
export async function notifyCustomerServiceSummary(
  lead: ApiLead,
  customerEmail: string | null,
  customerName: string,
  companyName: string,
): Promise<boolean> {
  try {
    const email = buildServiceSummaryEmail(lead, customerEmail, customerName, companyName);
    if (!email) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set — skipping service-summary email for lead ${lead.refNumber}`);
      return false;
    }
    await sendViaResend(apiKey, email);
    return true;
  } catch (err) {
    console.error(`[notify] service-summary email failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}

// ── New device login (security) ─────────────────────────────────────────────
// Fires from lib/utils/customerSignIn.ts — the ONE shared tail of every
// customer sign-in route — whenever a device session is opened for a device
// name this account has never seen before. Website sign-ins have no device
// session at all (see CustomerSession's own comment: no refresh token is ever
// issued to a browser), so this is mobile-only by construction, not a gap.
// Transactional/security: never gated by marketingEmailEnabled.

function formatLoginTimestamp(date: Date): string {
  return date.toLocaleString("ar-EG-u-nu-latn", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildNewDeviceLoginEmail(
  to: string,
  name: string,
  device: { deviceName: string | null; platform: string | null },
  at: Date,
): BuiltEmail {
  const platformLabel = device.platform === "ios" ? "iPhone" : device.platform === "android" ? "أندرويد" : "";
  const deviceLabel = [device.deviceName, platformLabel].filter(Boolean).join(" · ") || "جهاز جديد";
  const when = formatLoginTimestamp(at);

  const subject = "تسجيل دخول من جهاز جديد — العاصمة";
  const text =
    `أهلًا ${name}،\n\n` +
    `تم تسجيل الدخول لحسابك من جهاز جديد:\n\n` +
    `الجهاز: ${deviceLabel}\n` +
    `الوقت: ${when} (بتوقيت القاهرة)\n\n` +
    `لو إنت اللي عمل ده، مفيش حاجة تانية مطلوبة.\n\n` +
    `لو مش إنت، غيّر كلمة السر فورًا من التطبيق وسجّل خروج من كل الأجهزة ` +
    `(الحساب ← الأجهزة المسجّل دخولها ← تسجيل الخروج من كل الأجهزة).`;
  const html =
    emailHeading("تسجيل دخول من جهاز جديد") +
    emailParagraph(`أهلًا ${escapeHtml(name)}،`) +
    emailParagraph("تم تسجيل الدخول لحسابك من جهاز جديد:") +
    emailDataTable([
      ["الجهاز", deviceLabel],
      ["الوقت", `${when} (بتوقيت القاهرة)`],
    ]) +
    emailParagraph("لو إنت اللي عمل ده، مفيش حاجة تانية مطلوبة.") +
    emailNotice(
      `<strong>لو مش إنت،</strong> غيّر كلمة السر فورًا من التطبيق وسجّل خروج من كل الأجهزة ` +
        `(الحساب ← الأجهزة المسجّل دخولها ← تسجيل الخروج من كل الأجهزة).`,
    );

  return {
    to,
    subject,
    text,
    html,
    dir: "rtl",
    preheader: `${deviceLabel} — ${when} بتوقيت القاهرة. لو مش إنت، غيّر كلمة السر فورًا.`,
  };
}

/** Never throws. Returns true if dispatched, false if skipped (no key). */
export async function notifyCustomerNewDeviceLogin(
  to: string,
  name: string,
  device: { deviceName: string | null; platform: string | null },
  at: Date = new Date(),
): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping new-device-login email");
      return false;
    }
    await sendViaResend(apiKey, buildNewDeviceLoginEmail(to, name, device, at));
    return true;
  } catch (err) {
    console.error("[notify] new-device-login email failed:", err);
    return false;
  }
}

// ── Change request reviewed (provider) ──────────────────────────────────────
// One email per review decision — changeRequests.service.ts's `review()` calls
// this exactly once, from whichever of its four branches (reject / publish /
// delete / update) actually ran, right where it already calls audit.record for
// that same decision. Same language/tone as the sibling provider emails
// (new-lead, amount-confirmed/discrepancy) — English, matching the existing
// provider-facing convention rather than the newly-Arabized customer ones.

const ENTITY_LABEL: Record<string, string> = {
  COMPANY: "your company profile",
  OFFERING: "a service you offer",
  OFFERING_TIER: "a pricing tier",
  BUNDLE_RULE: "a bundle rule",
};

export function buildChangeRequestReviewedEmail(params: {
  to: string;
  companyName: string;
  entity: string;
  action: "approve" | "reject";
  reviewNote?: string | null;
}): BuiltEmail {
  const what = ENTITY_LABEL[params.entity] ?? "your requested change";
  const approved = params.action === "approve";
  const subject = approved
    ? `Change approved — ${params.companyName}`
    : `Change request rejected — ${params.companyName}`;

  const noteLine = params.reviewNote
    ? approved
      ? `Note from the reviewer: ${params.reviewNote}`
      : `Reason: ${params.reviewNote}`
    : "";

  const text =
    (approved
      ? `Your requested update to ${what} has been approved and is now live.`
      : `Your requested update to ${what} was not approved.`) +
    (noteLine ? `\n\n${noteLine}` : "") +
    `\n\nReview it in your provider dashboard.`;
  const html =
    `<h2>${approved ? "Change approved" : "Change request rejected"}</h2>` +
    `<p>${
      approved
        ? `Your requested update to <strong>${escapeHtml(what)}</strong> has been approved and is now live.`
        : `Your requested update to <strong>${escapeHtml(what)}</strong> was not approved.`
    }</p>` +
    (noteLine ? `<p>${escapeHtml(noteLine)}</p>` : "") +
    `<p>Review it in your provider dashboard.</p>`;

  return { to: params.to, subject, text, html };
}

/**
 * Notify the provider who filed a change request of the admin's decision.
 * Never throws. Returns true if dispatched, false if skipped (no key / no
 * recipient email on the submitting user's account).
 */
export async function notifyProviderChangeRequestReviewed(params: {
  to: string | null;
  companyName: string;
  entity: string;
  action: "approve" | "reject";
  reviewNote?: string | null;
}): Promise<boolean> {
  try {
    if (!params.to) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info("[notify] RESEND_API_KEY not set — skipping change-request-reviewed email");
      return false;
    }
    await sendViaResend(apiKey, buildChangeRequestReviewedEmail({ ...params, to: params.to }));
    return true;
  } catch (err) {
    console.error("[notify] change-request-reviewed email failed:", err);
    return false;
  }
}

// ── Provider monthly summary ────────────────────────────────────────────────
// Generated by notifications.reengagement.service.ts's
// sweepProviderMonthlySummaries — computed from real Lead/LeadCompletion/
// Message rows for the previous calendar month, never hand-triggered. English/
// LTR, matching every other provider-facing email in this file.

export interface ProviderMonthlySummaryStats {
  /** e.g. "August 2026". */
  periodLabel: string;
  requestsReceived: number;
  requestsCompleted: number;
  /** null when nothing in the period got a first provider reply to average. */
  avgResponseMinutes: number | null;
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function buildProviderMonthlySummaryEmail(
  to: string,
  companyName: string,
  stats: ProviderMonthlySummaryStats,
): BuiltEmail {
  const subject = `Your ${stats.periodLabel} summary — Al Assema`;
  const rows: [string, string][] = [
    ["Requests received", String(stats.requestsReceived)],
    ["Requests completed", String(stats.requestsCompleted)],
    [
      "Average response time",
      stats.avgResponseMinutes != null ? formatResponseTime(stats.avgResponseMinutes) : "No replies recorded",
    ],
  ];

  const text =
    `Hi ${companyName},\n\n` +
    `Here's your Al Assema summary for ${stats.periodLabel}:\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nOpen your provider dashboard for the full picture.`;
  const html =
    `<h2>Your ${escapeHtml(stats.periodLabel)} summary</h2>` +
    `<p>Hi ${escapeHtml(companyName)},</p><table>` +
    rows
      .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("") +
    `</table><p>Open your provider dashboard for the full picture.</p>`;

  return { to, subject, text, html };
}

/** Never throws. Returns true if dispatched, false if skipped (no key / no email). */
export async function sendProviderMonthlySummaryEmail(
  to: string | null,
  companyName: string,
  stats: ProviderMonthlySummaryStats,
): Promise<boolean> {
  try {
    if (!to) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.info(`[notify] RESEND_API_KEY not set — skipping monthly summary for ${companyName}`);
      return false;
    }
    await sendViaResend(apiKey, buildProviderMonthlySummaryEmail(to, companyName, stats));
    return true;
  } catch (err) {
    console.error(`[notify] monthly summary email failed for ${companyName}:`, err);
    return false;
  }
}

// ── Marketing / re-engagement email content ─────────────────────────────────
// Pure builders — {subject, text, html} only, no `to`/send logic. Consumed by
// notifications.reengagement.service.ts's cron sweeps via
// notifications.marketing.service.ts's notifyCustomerMarketing, which is what
// actually decides WHETHER to send (frequency cap, opt-out, send window,
// open-lead suppression) and attaches the unsubscribe footer + List-Unsubscribe
// headers — these functions only ever produce content, never a send.

export function buildReviewRequestEmailContent(
  customerName: string,
  companyName: string,
  service: string,
  refNumber: string,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}/requests`;
  const subject = `قيّم تجربتك مع ${companyName}`;
  const text =
    `أهلًا ${customerName}،\n\n` +
    `خلّصت طلبك "${service}" (${refNumber}) مع ${companyName}؟ تقييمك بيساعد ناس تانية تختار صح.\n\n` +
    `قيّم من هنا: ${url}`;
  const html =
    emailHeading("قيّم تجربتك") +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      `خلّصت طلبك "<strong>${escapeHtml(service)}</strong>" (${escapeHtml(refNumber)}) ` +
        `مع <strong>${escapeHtml(companyName)}</strong>؟ تقييمك بيساعد ناس تانية تختار صح.`,
    ) +
    emailButton("قيّم دلوقتي", url);
  return { subject, text, html };
}

export function buildStaleLeadEmailContent(
  refNumber: string,
  service: string,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}/messages`;
  const subject = `طلبك ${refNumber} لسه مفتوح`;
  const text =
    `طلبك "${service}" (${refNumber}) لسه مفتوح.\n\n` +
    `اتواصل مع الشركة على الشات لو محتاج تتابع: ${url}`;
  const html =
    emailHeading("طلبك لسه مفتوح") +
    emailParagraph(
      `طلبك "<strong>${escapeHtml(service)}</strong>" (${escapeHtml(refNumber)}) لسه مفتوح.`,
    ) +
    emailParagraph("اتواصل مع الشركة على الشات لو محتاج تتابع.") +
    emailButton("افتح المحادثة", url);
  return { subject, text, html };
}

export function build7DayPostServiceEmailContent(
  customerName: string,
  companyName: string | null,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}/requests`;
  const servicesUrl = `${SITE_URL}/services`;
  const companyLine = companyName ? ` مع ${companyName}` : "";
  const subject = "تمام كده مع خدمتك الأخيرة؟";
  const text =
    `أهلًا ${customerName}،\n\n` +
    `عدّى أسبوع على خدمتك الأخيرة${companyLine}. لو لسه مقيّمتهاش، تقييمك بيساعد ناس تانية.\n\n` +
    `قيّم من هنا: ${url}\n\n` +
    `ومحتاج حاجة تانية؟ تصفّح الخدمات: ${servicesUrl}`;
  const html =
    emailHeading("تمام كده مع خدمتك الأخيرة؟") +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      `عدّى أسبوع على خدمتك الأخيرة${companyName ? ` مع <strong>${escapeHtml(companyName)}</strong>` : ""}. ` +
        `لو لسه مقيّمتهاش، تقييمك بيساعد ناس تانية.`,
    ) +
    emailButton("قيّم الخدمة", url) +
    emailMuted(`محتاج حاجة تانية؟ ${emailLink("تصفّح الخدمات", servicesUrl)}`);
  return { subject, text, html };
}

export function build14DayInactiveBrowsingEmailContent(
  customerName: string,
  categoryLabel: string,
  categorySlug: string,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}/services/${categorySlug}`;
  const subject = `كنت بتدوّر على ${categoryLabel}؟`;
  const text =
    `أهلًا ${customerName}،\n\n` +
    `شركات في ${categoryLabel} بترد بسرعة وبتقدر تطلب سعر من غير أي التزام.\n\n` +
    `شوف الشركات: ${url}`;
  const html =
    emailHeading(`كنت بتدوّر على ${categoryLabel}؟`) +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      `شركات في <strong>${escapeHtml(categoryLabel)}</strong> بترد بسرعة وبتقدر تطلب سعر من غير أي التزام.`,
    ) +
    emailButton("شوف الشركات", url);
  return { subject, text, html };
}

export function build3045DayInactivityEmailContent(
  customerName: string,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}/services`;
  const subject = "العاصمة معاك لو محتاج حاجة";
  const text =
    `أهلًا ${customerName}،\n\n` +
    `صيانة، تشطيب، نقل، تنظيف — اطلب واستقبل عروض من شركات موثّقة في نفس اليوم غالبًا.\n\n` +
    `تصفّح الخدمات: ${url}`;
  const html =
    emailHeading("العاصمة معاك لو محتاج حاجة") +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(
      "صيانة، تشطيب، نقل، تنظيف — اطلب واستقبل عروض من شركات موثّقة في نفس اليوم غالبًا.",
    ) +
    emailButton("تصفّح الخدمات", url);
  return { subject, text, html };
}

/** Generic seasonal-campaign template — the campaign supplies its own copy;
 *  this only wraps it in the shared RTL layout. See notificationsSeasonal
 *  Campaigns.config.ts for the actual campaign list. */
export function buildSeasonalCampaignEmailContent(
  customerName: string,
  campaignTitle: string,
  campaignBody: string,
  ctaUrl: string,
  ctaLabel: string,
): { subject: string; text: string; html: string } {
  const url = `${SITE_URL}${ctaUrl}`;
  const text = `أهلًا ${customerName}،\n\n${campaignBody}\n\n${ctaLabel}: ${url}`;
  const html =
    emailHeading(campaignTitle) +
    emailParagraph(`أهلًا ${escapeHtml(customerName)}،`) +
    emailParagraph(escapeHtml(campaignBody)) +
    emailButton(ctaLabel, url);
  return { subject: campaignTitle, text, html };
}
