// Provider notifications on new leads (post-MVP). Email via Resend's HTTP API
// (no SDK dependency). Designed to FAIL OPEN: a missing key, missing provider
// email, or a send error never throws — lead creation must never break or block
// because of notifications.
import type { ApiLead } from "@/lib/apiTypes";
import { getEmailTemplates } from "@/lib/services/settings.service";

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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

async function sendViaResend(apiKey: string, email: BuiltEmail): Promise<void> {
  const from = process.env.RESEND_FROM ?? "Al Assema <onboarding@resend.dev>";
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
      html: email.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
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

    const subject = "Confirm your email — Al Assema";
    const text =
      `Hi ${name},\n\n` +
      `Confirm your email address to finish setting up your Al Assema account:\n\n` +
      `${link}\n\n` +
      `This link expires in 24 hours.\n\n` +
      `If you didn't create an account, you can ignore this email — nothing will happen ` +
      `until the link above is used.`;
    const html =
      `<h2>Confirm your email</h2>` +
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Confirm your email address to finish setting up your Al Assema account.</p>` +
      `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#005578;` +
      `color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">` +
      `Confirm email</a></p>` +
      `<p style="color:#6b7278;font-size:13px">This link expires in 24 hours.</p>` +
      `<p style="color:#6b7278;font-size:13px">If you didn't create an account, you can ignore ` +
      `this email — nothing will happen until the link above is used.</p>`;

    await sendViaResend(apiKey, { to, subject, text, html });
    return true;
  } catch (err) {
    console.error("[notify] customer verification email failed:", err);
    return false;
  }
}
