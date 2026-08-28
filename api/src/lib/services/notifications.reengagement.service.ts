// Time-delayed customer/provider nudges — every scheduled notification lives
// here, run from POST /api/cron/notifications-sweep. Nothing in this file
// fires from a request; it is only ever called by the cron sweep, on a timer
// outside this codebase (see that route's own comment).
//
// Two families:
//   - Customer marketing (review-request, stale-lead, 7-day post-service,
//     14-day inactive-browsing, 30–45-day inactivity, seasonal campaigns) —
//     every one of these routes through notifications.marketing.service
//     .notifyCustomerMarketing, which is the ONE place the frequency cap,
//     Cairo send window, open-lead suppression, and opt-out are enforced.
//     Nothing here re-implements or bypasses those rules.
//   - Provider monthly summaries — not customer-facing, not marketing, no
//     opt-out; a company-level operational report, gated by its own
//     lastMonthlySummaryPeriod marker.
//
// Idempotency, sweep by sweep:
//   - review requests    → LeadCompletion.reviewRequestSentAt
//   - stale leads         → Lead.staleNudgeSentAt
//   - 7-day post-service  → CustomerUser.firstServiceNudgeSentAt (once ever)
//   - inactive browsing   → CustomerUser.lastViewedCategoryAt freshness (no
//                           marker: the timestamp only refreshes on a NEW
//                           view, so re-eligibility means "went quiet
//                           again", not "still quiet from before")
//   - 30–45 day inactive  → no marker; an ongoing STATE ("still inactive"),
//                           not a one-time event — the shared 14-day
//                           marketing cap is what throttles repeats
//   - seasonal campaigns  → dedup against the Notification table itself
//                           (has this customer already gotten THIS
//                           campaign's url)
//   - monthly summaries   → Company.lastMonthlySummaryPeriod
import { prisma } from "@/lib/prisma";
import { CompanyStatus, LeadStatus, LeadVerificationStatus, MessageSender } from "@/generated/prisma/enums";
import { notifyCustomerMarketing } from "@/lib/services/notifications.marketing.service";
import {
  buildReviewRequestEmailContent,
  buildStaleLeadEmailContent,
  build7DayPostServiceEmailContent,
  build14DayInactiveBrowsingEmailContent,
  build3045DayInactivityEmailContent,
  buildSeasonalCampaignEmailContent,
  sendProviderMonthlySummaryEmail,
} from "@/lib/services/notifications.service";
import { activeSeasonalCampaigns } from "@/lib/config/seasonalCampaigns.config";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const REVIEW_REQUEST_DELAY_MS = 1 * DAY_MS;
const STALE_LEAD_DELAY_MS = 2 * DAY_MS;
const FIRST_SERVICE_DELAY_MS = 7 * DAY_MS;
const INACTIVE_BROWSING_DELAY_MS = 14 * DAY_MS;
const INACTIVE_CUSTOMER_DELAY_MS = 30 * DAY_MS;

// Past this age, sending a nudge about the same event would read as a
// mistake ("why is this appearing now?") rather than a reminder — e.g. the
// cron was down for a while. Rows past delay+grace still get their marker
// set (never rescanned), they just don't get an actual send. Only applies
// to nudges tied to a specific past EVENT (review/stale/first-service) —
// the inactivity/browsing sweeps have no such expiry, since "still
// inactive" doesn't go stale the way a specific order does.
const GRACE_MS = 3 * DAY_MS;

// Caps one sweep's work per cron tick — shared PM2 fork with the request
// rate limiter (see ecosystem.config.cjs), so an unbounded backlog must
// never turn one tick into a multi-minute query. Whatever's left over stays
// eligible for the next tick (every 15–30 min per the route's own doc).
const BATCH_LIMIT = 200;
const COMPANY_BATCH_LIMIT = 50;

export interface SweepResult {
  sent: number;
  /** Event too old to still feel relevant — marker set, nothing sent. */
  skippedTooLate: number;
}

export interface MarketingSweepResult extends SweepResult {
  /** The marketing gate declined (frequency cap / open lead / opted out /
   *  inactive account) — distinct from skippedTooLate, which is an AGE
   *  check this file does before ever asking the gate. */
  suppressed: number;
}

/**
 * 24h after a completed order's price is verified (confirmed OR disputed —
 * the service happened either way), ask the customer to rate the company.
 * Skipped if they already left a review (Lead.reviewedAt) or the lead has no
 * account attached (a guest lead has no notification channel at all).
 */
export async function sweepReviewRequests(): Promise<MarketingSweepResult> {
  const now = Date.now();
  const rows = await prisma.leadCompletion.findMany({
    where: {
      verificationStatus: { not: LeadVerificationStatus.PENDING },
      reviewRequestSentAt: null,
      verifiedAt: { lte: new Date(now - REVIEW_REQUEST_DELAY_MS) },
    },
    select: {
      id: true,
      verifiedAt: true,
      lead: {
        select: {
          id: true,
          refNumber: true,
          service: true,
          customerId: true,
          reviewedAt: true,
          company: { select: { name: true } },
        },
      },
    },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let skippedTooLate = 0;
  let suppressed = 0;

  for (const row of rows) {
    const ageMs = now - (row.verifiedAt?.getTime() ?? now);
    const tooLate = ageMs > REVIEW_REQUEST_DELAY_MS + GRACE_MS;
    if (tooLate) {
      skippedTooLate += 1;
    } else if (row.lead.customerId && !row.lead.reviewedAt) {
      const result = await notifyCustomerMarketing(row.lead.customerId, {
        title: `قيّم تجربتك مع ${row.lead.company.name}`,
        body: `خلّصت طلبك "${row.lead.service}" (${row.lead.refNumber})؟ تقييمك بيساعد ناس تانية تختار صح.`,
        url: "/requests",
        tag: `review-request-${row.lead.id}`,
        email: (customer) =>
          buildReviewRequestEmailContent(customer.name, row.lead.company.name, row.lead.service, row.lead.refNumber),
      });
      if (result.sent) sent += 1;
      else suppressed += 1;
    }
    // Marked either way — a guest lead or an already-reviewed one is done
    // being eligible, not "still pending".
    await prisma.leadCompletion.update({
      where: { id: row.id },
      data: { reviewRequestSentAt: new Date() },
    });
  }

  return { sent, skippedTooLate, suppressed };
}

/**
 * 48h after submission, a request still sitting at NEW/CONTACTED hasn't
 * visibly moved from the customer's side — nudge them to open the chat and
 * check in with the company directly. (Not "send to two more companies":
 * this product sends one lead to one company by design; broadening that is
 * a real feature, not a notification.)
 *
 * Lead-specific: skips the marketing gate's open-lead suppression on
 * purpose — suppressing "your open request needs attention" BECAUSE the
 * customer has an open request would be backwards. Still respects the
 * frequency cap, opt-out, and (for email) the Cairo send window.
 */
export async function sweepStaleLeads(): Promise<MarketingSweepResult> {
  const now = Date.now();
  const rows = await prisma.lead.findMany({
    where: {
      status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED] },
      staleNudgeSentAt: null,
      customerId: { not: null },
      createdAt: { lte: new Date(now - STALE_LEAD_DELAY_MS) },
    },
    select: { id: true, refNumber: true, service: true, customerId: true, createdAt: true },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let skippedTooLate = 0;
  let suppressed = 0;

  for (const lead of rows) {
    const ageMs = now - lead.createdAt.getTime();
    const tooLate = ageMs > STALE_LEAD_DELAY_MS + GRACE_MS;
    if (tooLate) {
      skippedTooLate += 1;
    } else {
      const result = await notifyCustomerMarketing(lead.customerId!, {
        title: `طلبك ${lead.refNumber} لسه مفتوح`,
        body: `اتواصل مع الشركة على الشات بخصوص "${lead.service}" لو محتاج تتابع.`,
        url: `/chat/${lead.id}`,
        tag: `stale-lead-${lead.id}`,
        leadSpecific: true,
        email: () => buildStaleLeadEmailContent(lead.refNumber, lead.service),
      });
      if (result.sent) sent += 1;
      else suppressed += 1;
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { staleNudgeSentAt: new Date() } });
  }

  return { sent, skippedTooLate, suppressed };
}

/**
 * Seven days after a customer's FIRST completed+verified order (a one-time,
 * per-customer nudge, never re-armed — see CustomerUser
 * .firstServiceNudgeSentAt), ask for a review and mention coming back.
 * Ordered by verifiedAt ascending so the earliest qualifying completion per
 * customer is the one that gets referenced — the "first" the copy promises.
 */
export async function sweepFirstServiceNudges(): Promise<MarketingSweepResult> {
  const now = Date.now();
  const rows = await prisma.leadCompletion.findMany({
    where: {
      verificationStatus: { not: LeadVerificationStatus.PENDING },
      verifiedAt: { lte: new Date(now - FIRST_SERVICE_DELAY_MS) },
      lead: { customerId: { not: null }, customer: { firstServiceNudgeSentAt: null } },
    },
    select: {
      verifiedAt: true,
      lead: { select: { customerId: true, company: { select: { name: true } } } },
    },
    orderBy: { verifiedAt: "asc" },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let skippedTooLate = 0;
  let suppressed = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    const customerId = row.lead.customerId!;
    // Multiple qualifying completions for the same customer can land in one
    // batch — only the first (earliest, thanks to the orderBy) counts.
    if (seen.has(customerId)) continue;
    seen.add(customerId);

    const ageMs = now - (row.verifiedAt?.getTime() ?? now);
    const tooLate = ageMs > FIRST_SERVICE_DELAY_MS + GRACE_MS;
    if (tooLate) {
      skippedTooLate += 1;
    } else {
      const result = await notifyCustomerMarketing(customerId, {
        title: "تمام كده مع خدمتك الأولى؟",
        body: `قيّم تجربتك مع ${row.lead.company.name}`,
        url: "/requests",
        tag: `first-service-${customerId}`,
        email: (customer) => build7DayPostServiceEmailContent(customer.name, row.lead.company.name),
      });
      if (result.sent) sent += 1;
      else suppressed += 1;
    }
    await prisma.customerUser.update({
      where: { id: customerId },
      data: { firstServiceNudgeSentAt: new Date() },
    });
  }

  return { sent, skippedTooLate, suppressed };
}

/**
 * A customer browsed a category, then went quiet for 14 days, and never
 * submitted a single request — ever (leads: none). References the actual
 * category they looked at. No idempotency marker: lastViewedCategoryAt only
 * advances on a NEW view, so re-eligibility here means "went quiet again",
 * which is a legitimately new nudge-worthy moment, throttled by the shared
 * 14-day marketing cap like everything else.
 */
export async function sweepInactiveBrowsing(): Promise<MarketingSweepResult> {
  const now = Date.now();
  const rows = await prisma.customerUser.findMany({
    where: {
      isActive: true,
      lastViewedCategorySlug: { not: null },
      lastViewedCategoryAt: { lte: new Date(now - INACTIVE_BROWSING_DELAY_MS) },
      leads: { none: {} },
    },
    select: { id: true, name: true, lastViewedCategorySlug: true, lastViewedCategoryLabel: true },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let suppressed = 0;

  for (const row of rows) {
    const slug = row.lastViewedCategorySlug!;
    const label = row.lastViewedCategoryLabel ?? slug;
    const result = await notifyCustomerMarketing(row.id, {
      title: `كنت بتدوّر على ${label}؟`,
      body: "شركات بترد بسرعة وبتقدر تطلب سعر من غير أي التزام.",
      url: `/services/${slug}`,
      tag: `inactive-browsing-${row.id}`,
      email: (customer) => build14DayInactiveBrowsingEmailContent(customer.name, label, slug),
    });
    if (result.sent) sent += 1;
    else suppressed += 1;
  }

  return { sent, skippedTooLate: 0, suppressed };
}

/**
 * "Al Assema is here if you need anything" — targets customers inactive
 * (no login) for 30+ days. No upper bound and no dedicated marker: this is
 * an ongoing STATE, not a one-time event, so it stays eligible for as long
 * as the customer stays inactive; the shared 14-day marketing cap is the
 * only thing pacing repeats.
 */
export async function sweepInactiveCustomers(): Promise<MarketingSweepResult> {
  const now = Date.now();
  const rows = await prisma.customerUser.findMany({
    where: {
      isActive: true,
      OR: [
        { lastLoginAt: { lte: new Date(now - INACTIVE_CUSTOMER_DELAY_MS) } },
        { lastLoginAt: null, createdAt: { lte: new Date(now - INACTIVE_CUSTOMER_DELAY_MS) } },
      ],
    },
    select: { id: true, name: true },
    take: BATCH_LIMIT,
  });

  let sent = 0;
  let suppressed = 0;

  for (const row of rows) {
    const result = await notifyCustomerMarketing(row.id, {
      title: "العاصمة معاك لو محتاج حاجة",
      body: "صيانة، تشطيب، نقل، تنظيف — اطلب واستقبل عروض في نفس اليوم.",
      url: "/services",
      tag: `inactive-customer-${row.id}`,
      email: (customer) => build3045DayInactivityEmailContent(customer.name),
    });
    if (result.sent) sent += 1;
    else suppressed += 1;
  }

  return { sent, skippedTooLate: 0, suppressed };
}

/**
 * Seasonal campaigns (see seasonalCampaigns.config.ts) — every ACTIVE
 * campaign is sent to every active customer who hasn't already received
 * THAT campaign (deduped against the Notification table by its url, which
 * embeds the campaign key), through the exact same marketing gate as every
 * other send here. An empty/fully-disabled campaign list makes this a
 * no-op, by construction.
 */
export async function sweepSeasonalCampaigns(): Promise<MarketingSweepResult> {
  let sent = 0;
  let suppressed = 0;

  for (const campaign of activeSeasonalCampaigns()) {
    const rows = await prisma.customerUser.findMany({
      where: {
        isActive: true,
        notifications: { none: { url: campaign.ctaUrl } },
      },
      select: { id: true },
      take: BATCH_LIMIT,
    });

    for (const row of rows) {
      const result = await notifyCustomerMarketing(row.id, {
        title: campaign.title,
        body: campaign.body,
        url: campaign.ctaUrl,
        tag: `seasonal-${campaign.key}-${row.id}`,
        email: (customer) =>
          buildSeasonalCampaignEmailContent(customer.name, campaign.title, campaign.body, campaign.ctaUrl, campaign.ctaLabel),
      });
      if (result.sent) sent += 1;
      else suppressed += 1;
    }
  }

  return { sent, skippedTooLate: 0, suppressed };
}

/** "YYYY-MM" for the calendar month immediately before `now`. */
function previousMonthPeriod(now: Date): { label: string; start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { label, start, end };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function computeCompanyMonthlyStats(
  companyId: string,
  start: Date,
  end: Date,
): Promise<{ requestsReceived: number; requestsCompleted: number; avgResponseMinutes: number | null }> {
  const leads = await prisma.lead.findMany({
    where: { companyId, createdAt: { gte: start, lt: end } },
    select: { id: true, status: true, createdAt: true, conversation: { select: { id: true } } },
  });

  const requestsReceived = leads.length;
  const requestsCompleted = leads.filter((l) => l.status === LeadStatus.COMPLETED).length;

  const conversationIds = leads.map((l) => l.conversation?.id).filter((id): id is string => Boolean(id));
  let avgResponseMinutes: number | null = null;
  if (conversationIds.length > 0) {
    const providerMessages = await prisma.message.findMany({
      where: { conversationId: { in: conversationIds }, sender: MessageSender.PROVIDER },
      orderBy: { createdAt: "asc" },
      select: { conversationId: true, createdAt: true },
    });
    // First occurrence per conversation, thanks to ascending order — the
    // earliest PROVIDER reply, which is what "response time" means here.
    const firstReplyByConversation = new Map<string, Date>();
    for (const m of providerMessages) {
      if (!firstReplyByConversation.has(m.conversationId)) firstReplyByConversation.set(m.conversationId, m.createdAt);
    }
    const responseMinutes: number[] = [];
    for (const lead of leads) {
      const convoId = lead.conversation?.id;
      const firstReply = convoId ? firstReplyByConversation.get(convoId) : undefined;
      if (firstReply) responseMinutes.push((firstReply.getTime() - lead.createdAt.getTime()) / 60_000);
    }
    if (responseMinutes.length > 0) {
      avgResponseMinutes = responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length;
    }
  }

  return { requestsReceived, requestsCompleted, avgResponseMinutes };
}

export interface MonthlySummarySweepResult {
  sent: number;
  skipped: number;
}

/**
 * Once per company per calendar month (Company.lastMonthlySummaryPeriod),
 * on/after the 1st, summarize the PREVIOUS complete month's activity and
 * email it. Not customer-facing, no marketing gate — an operational report
 * a provider needs regardless of any opt-out.
 */
export async function sweepProviderMonthlySummaries(now: Date = new Date()): Promise<MonthlySummarySweepResult> {
  const period = previousMonthPeriod(now);
  const periodLabel = `${MONTH_NAMES[period.start.getUTCMonth()]} ${period.start.getUTCFullYear()}`;

  const companies = await prisma.company.findMany({
    where: {
      status: CompanyStatus.ACTIVE,
      lastMonthlySummaryPeriod: { not: period.label },
    },
    select: { id: true, name: true, email: true },
    take: COMPANY_BATCH_LIMIT,
  });

  let sent = 0;
  let skipped = 0;

  for (const company of companies) {
    const stats = await computeCompanyMonthlyStats(company.id, period.start, period.end);
    // A company with zero activity in the period still gets marked (nothing
    // to summarize, no point resending on every future tick), but doesn't
    // get an email — "you had 0 requests" isn't worth a send.
    if (stats.requestsReceived > 0) {
      const ok = await sendProviderMonthlySummaryEmail(company.email, company.name, {
        periodLabel,
        ...stats,
      });
      if (ok) sent += 1;
      else skipped += 1;
    } else {
      skipped += 1;
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { lastMonthlySummaryPeriod: period.label },
    });
  }

  return { sent, skipped };
}
