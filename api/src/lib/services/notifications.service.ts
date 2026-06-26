// Provider notifications on new leads (post-MVP). Email via Resend's HTTP API
// (no SDK dependency). Designed to FAIL OPEN: a missing key, missing provider
// email, or a send error never throws — lead creation must never break or block
// because of notifications.
import type { ApiLead } from "@/lib/apiTypes";

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
  const rows: [string, string][] = [
    ["Reference", lead.refNumber],
    ["Service", lead.service],
    ["Customer", lead.name],
    ["Phone", lead.phone],
    ["District", lead.district],
    ["Budget", lead.budget],
    ["Details", lead.description],
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
    const email = buildNewLeadEmail(lead, target);
    if (!email) return false; // no provider email on file

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
 * Build the admin-alert email body (without `to`), or null if there are no rows.
 * Same data as the provider email, framed for an admin watching all companies.
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
    ["Customer", lead.name],
    ["Phone", lead.phone],
    ["District", lead.district],
    ["Budget", lead.budget],
    ["Details", lead.description],
  ];

  const text =
    `A new lead was submitted on Al Assema.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nReceived: ${new Date(lead.createdAt).toISOString()}`;

  const html =
    `<h2>New lead — ${escapeHtml(companyName)}</h2><table>` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>`;

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

    const body = buildAdminAlertEmail(lead, companyName);
    await sendViaResend(apiKey, { to: recipients, ...body });
    return true;
  } catch (err) {
    console.error(`[notify] admin alert failed for lead ${lead.refNumber}:`, err);
    return false;
  }
}
