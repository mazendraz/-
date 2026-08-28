// The ONE gate every marketing/re-engagement send (push OR email) has to pass
// through — see the 2026-08-25 notifications work: frequency cap, Cairo send
// window, open-lead suppression, per-channel opt-out, and (for email) a
// working unsubscribe link. Built as a companion to notifications.customer
// .service.ts's notifyCustomer, not a replacement — that one still owns
// transactional sends (LEAD_CREATED/LEAD_STATUS/LEAD_COMPLETED/CHAT_MESSAGE/
// WAITLIST_NOTIFIED), which are never subject to any rule in this file.
import { prisma } from "@/lib/prisma";
import { LeadStatus, NotificationType } from "@/generated/prisma/enums";
import { notifyCustomerDevices } from "@/lib/services/expoPush.service";
import { sendBuiltEmail, type BuiltEmail } from "@/lib/services/notifications.service";
import { signUnsubscribeToken } from "@/lib/utils/unsubscribeToken";

const DAY_MS = 86_400_000;
const MARKETING_CAP_MS = 14 * DAY_MS;

const SITE_URL = (process.env.PUBLIC_SITE_URL ?? "https://al-assema.tech").replace(/\/$/, "");

/** The hour, 0–23, in Africa/Cairo local time — via Intl's own tz database
 *  (whatever DST rule Egypt is currently under is Node's ICU data's problem
 *  to get right, not this function's to hardcode and get wrong). */
function cairoHour(now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return parseInt(formatted, 10);
}

/** 11:00 (inclusive) through 21:00 (exclusive) Cairo time — "may only be sent
 *  between 11 AM and 9 PM". Emails only; push has no time-of-day rule. */
export function isWithinCairoSendWindow(now: Date = new Date()): boolean {
  const hour = cairoHour(now);
  return hour >= 11 && hour < 21;
}

/** Does this customer currently have a request in flight? NEW/CONTACTED/
 *  IN_PROGRESS all count — COMPLETED and CANCELLED don't (nothing left open). */
async function hasOpenLead(customerId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { customerId, status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.IN_PROGRESS] } },
    select: { id: true },
  });
  return lead !== null;
}

/**
 * "1 marketing message per customer every 14 days", shared across every
 * campaign type. Derived from the Notification table itself (the most
 * recent MARKETING row) rather than a separate counter column — every
 * marketing send already writes one, so this can't drift from what was
 * actually recorded as sent.
 */
async function withinFrequencyCap(customerId: string): Promise<boolean> {
  const last = await prisma.notification.findFirst({
    where: { customerId, type: NotificationType.MARKETING },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last) return true;
  return Date.now() - last.createdAt.getTime() >= MARKETING_CAP_MS;
}

export interface MarketingGateResult {
  /** Overall permission — false means nothing is written or sent at all. */
  send: boolean;
  sendPush: boolean;
  sendEmail: boolean;
  reason?: "inactive" | "frequency-cap" | "open-lead" | "opted-out" | "unconfigured";
}

/**
 * The single decision point every marketing send calls before doing
 * anything. `leadSpecific: true` is for nudges that are inherently ABOUT a
 * customer's own open request (the stale-lead nudge) — suppressing "your
 * open request needs attention" BECAUSE they have an open request would be
 * backwards, so those skip the open-lead check while still respecting the
 * frequency cap, opt-out, and send window like everything else.
 */
export async function canSendMarketing(
  customerId: string,
  opts: { leadSpecific?: boolean } = {},
): Promise<MarketingGateResult> {
  const customer = await prisma.customerUser.findUnique({
    where: { id: customerId },
    select: { isActive: true, marketingPushEnabled: true, marketingEmailEnabled: true },
  });
  if (!customer || !customer.isActive) {
    return { send: false, sendPush: false, sendEmail: false, reason: "inactive" };
  }

  if (!(await withinFrequencyCap(customerId))) {
    return { send: false, sendPush: false, sendEmail: false, reason: "frequency-cap" };
  }

  if (!opts.leadSpecific && (await hasOpenLead(customerId))) {
    return { send: false, sendPush: false, sendEmail: false, reason: "open-lead" };
  }

  // Email fails closed without a way to unsubscribe — sending marketing mail
  // that CAN'T carry a working unsubscribe link is the one thing every rule
  // in this file exists to prevent, so a missing secret degrades to
  // "push only", not "send anyway".
  const sendEmail =
    customer.marketingEmailEnabled && isWithinCairoSendWindow() && Boolean(process.env.UNSUBSCRIBE_SECRET);
  const sendPush = customer.marketingPushEnabled;

  if (!sendPush && !sendEmail) {
    return { send: false, sendPush: false, sendEmail: false, reason: "opted-out" };
  }
  return { send: true, sendPush, sendEmail };
}

export interface MarketingEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface NotifyCustomerMarketingInput {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  leadSpecific?: boolean;
  /** Only invoked when the gate actually allows an email — the unsubscribe
   *  URL is precomputed and handed in so every campaign's footer is
   *  identical instead of each builder re-deriving it. */
  email?: (customer: { email: string; name: string; unsubscribeUrl: string }) => MarketingEmailContent;
}

export interface NotifyCustomerMarketingResult {
  sent: boolean;
  pushed: boolean;
  emailed: boolean;
  reason?: MarketingGateResult["reason"];
}

/** Standard unsubscribe footer — every marketing email ends with this, in
 *  addition to the List-Unsubscribe/-Post headers (which cover one-click
 *  unsubscribe support; this covers every client that doesn't).
 *
 *  Handed to the shell as `footerExtraHtml` rather than glued onto the body:
 *  it belongs in the footer block with the rest of the small print, not
 *  hanging off the end of the campaign copy. */
function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  return (
    `<p style="margin:0 0 10px;font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;font-size:12px;` +
    `line-height:1.7;text-align:center">` +
    `<a href="${unsubscribeUrl}" style="color:#6b7278;text-decoration:underline">` +
    `إلغاء الاشتراك في العروض والاقتراحات</a></p>`
  );
}

function unsubscribeFooterText(unsubscribeUrl: string): string {
  return `\n\nإلغاء الاشتراك: ${unsubscribeUrl}`;
}

/**
 * Send (or suppress) one marketing notification. Never throws — same
 * fail-open contract as every notify* function in this codebase. Writes
 * exactly one Notification row when — and only when — the gate allows
 * SOMETHING to go out; a fully suppressed send (cap/open-lead/opt-out)
 * leaves no row, since nothing was actually sent to show a card for.
 */
export async function notifyCustomerMarketing(
  customerId: string,
  input: NotifyCustomerMarketingInput,
): Promise<NotifyCustomerMarketingResult> {
  try {
    const gate = await canSendMarketing(customerId, { leadSpecific: input.leadSpecific });
    if (!gate.send) {
      return { sent: false, pushed: false, emailed: false, reason: gate.reason };
    }

    await prisma.notification.create({
      data: {
        customerId,
        type: NotificationType.MARKETING,
        title: input.title,
        body: input.body,
        url: input.url ?? null,
      },
    });

    let pushed = false;
    if (gate.sendPush) {
      try {
        await notifyCustomerDevices(customerId, {
          title: input.title,
          body: input.body,
          url: input.url,
          tag: input.tag,
        });
        pushed = true;
      } catch (err) {
        console.error(`[marketing] push failed for customer ${customerId}:`, err);
      }
    }

    let emailed = false;
    if (gate.sendEmail && input.email) {
      const customer = await prisma.customerUser.findUnique({
        where: { id: customerId },
        select: { email: true, name: true },
      });
      if (customer) {
        const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${signUnsubscribeToken(customerId)}`;
        const content = input.email({ ...customer, unsubscribeUrl });
        const built: BuiltEmail = {
          to: customer.email,
          subject: content.subject,
          text: content.text + unsubscribeFooterText(unsubscribeUrl),
          html: content.html,
          footerExtraHtml: unsubscribeFooterHtml(unsubscribeUrl),
          dir: "rtl",
          from: process.env.RESEND_MARKETING_FROM || undefined,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
        emailed = await sendBuiltEmail(built);
      }
    }

    return { sent: true, pushed, emailed };
  } catch (err) {
    console.error(`[marketing] notifyCustomerMarketing failed for customer ${customerId}:`, err);
    return { sent: false, pushed: false, emailed: false };
  }
}
