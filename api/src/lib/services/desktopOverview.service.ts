// Business Control Center — the desktop Overview screen's combined payload
// (KPI row + trend badges + chart series + funnel + recent activity +
// "Needs Your Attention" cards). Composes existing aggregates rather than
// introducing a new source of truth for any of these numbers.
import { prisma } from "@/lib/prisma";
import {
  TransactionStatus,
  TransactionType,
  LeadStatus,
  LeadVerificationStatus,
} from "@/generated/prisma/enums";
import { financeOverview } from "@/lib/services/finance.service";
import type { ApiDesktopOverview } from "@/lib/apiTypes";

export interface DesktopOverviewQuery {
  /** Window in days for the KPI row (mirrors the Today/This Week/This Month
   *  tabs in the mockup — the caller translates the selected tab to a day
   *  count; see parseDesktopOverviewQuery in query.ts). */
  days?: number;
}

const RECENT_ACTIVITY_LIMIT = 10;

function clampDays(value: number | undefined): number {
  const n = Math.trunc(value ?? 1) || 1;
  return Math.min(365, Math.max(1, n));
}

/** Window aggregates shared by both the current and previous period — kept as
 *  one function so the two calls can never accidentally diverge in what they
 *  count. */
async function windowStats(from: number, to: number) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const [newClients, newRequests, completedServices, finance] = await Promise.all([
    prisma.client.count({ where: { firstSeenAt: { gte: fromDate, lt: toDate } } }),
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lt: toDate } } }),
    // "Completed" here = the provider marked it done within the window
    // (LeadCompletion.submittedAt), regardless of whether the client has
    // verified yet — matches the mockup's "Completed Services" card, which
    // sits alongside a SEPARATE "Awaiting Verification" card.
    prisma.leadCompletion.count({ where: { submittedAt: { gte: fromDate, lt: toDate } } }),
    financeOverview({ from, to }),
  ]);
  return {
    newClients,
    newRequests,
    completedServices,
    serviceValue: finance.serviceValueProcessed,
    alAsimaRevenue: finance.recognizedRevenue,
    expenses: finance.totalExpenses,
  };
}

/** % change from `previous` to `current`. null (not 0 or Infinity) when
 *  `previous` is zero — "undefined" is the honest answer, not "+∞%" or a
 *  misleading "+100%" against a zero base. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── Chart series ─────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" (daily bucket) or "YYYY-MM-DDTHH" (hourly bucket) in the
 *  server's local time zone — matches the coarseness Date/toLocaleString
 *  already uses elsewhere in this codebase (no Intl.DateTimeFormat timezone
 *  plumbing here; see stats.service.ts's `timezone` field for the one place
 *  that already needed to be that precise). */
function bucketKey(d: Date, hourly: boolean): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (!hourly) return `${y}-${m}-${day}`;
  return `${y}-${m}-${day}T${String(d.getHours()).padStart(2, "0")}`;
}

/** Dense series of {date, serviceValue, revenue} across [from, to) — every
 *  bucket present even at 0, so the chart doesn't silently skip quiet hours.
 *  Reads the SAME two signals financeOverview does (LeadCompletion.verifiedAt
 *  for service value, Transaction.occurredAt for revenue) so this chart and
 *  the KPI row above it can never show numbers that don't add up against
 *  each other. */
async function chartSeries(from: number, to: number, days: number) {
  const hourly = days <= 1;
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const [completions, transactions] = await Promise.all([
    prisma.leadCompletion.findMany({
      where: { verifiedAt: { not: null, gte: fromDate, lt: toDate } },
      select: { verifiedAt: true, clientAmount: true },
    }),
    prisma.transaction.findMany({
      where: {
        type: TransactionType.COMMISSION_INCOME,
        status: { not: TransactionStatus.VOID },
        occurredAt: { gte: fromDate, lt: toDate },
      },
      select: { occurredAt: true, amount: true },
    }),
  ]);

  const buckets = new Map<string, { serviceValue: number; revenue: number }>();
  // Pre-seed every bucket in range so the series has no gaps.
  const stepMs = hourly ? 3_600_000 : 86_400_000;
  for (let t = from; t < to; t += stepMs) {
    buckets.set(bucketKey(new Date(t), hourly), { serviceValue: 0, revenue: 0 });
  }
  for (const c of completions) {
    const key = bucketKey(c.verifiedAt as Date, hourly);
    const bucket = buckets.get(key);
    if (bucket) bucket.serviceValue += c.clientAmount ?? 0;
  }
  for (const t of transactions) {
    const key = bucketKey(t.occurredAt, hourly);
    const bucket = buckets.get(key);
    if (bucket) bucket.revenue += t.amount;
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));
}

// ── Funnel ────────────────────────────────────────────────────────────────────

/**
 * Lead-status funnel for leads CREATED in the window — deliberately NOT the
 * mockup's "Website Visitors" → "Requests Started" pre-submission steps: this
 * platform has no visitor/session analytics, so there is no real number for
 * "someone opened the request form and left" (a Lead row is only created once
 * a request is actually submitted). Flagged rather than invented.
 */
async function requestFunnel(from: number, to: number) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const [submitted, contacted, inProgress, completed] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: fromDate, lt: toDate } } }),
    prisma.lead.count({
      where: {
        createdAt: { gte: fromDate, lt: toDate },
        status: { in: [LeadStatus.CONTACTED, LeadStatus.IN_PROGRESS, LeadStatus.COMPLETED] },
      },
    }),
    prisma.lead.count({
      where: {
        createdAt: { gte: fromDate, lt: toDate },
        status: { in: [LeadStatus.IN_PROGRESS, LeadStatus.COMPLETED] },
      },
    }),
    prisma.lead.count({
      where: { createdAt: { gte: fromDate, lt: toDate }, status: LeadStatus.COMPLETED },
    }),
  ]);
  return { submitted, contacted, inProgress, completed };
}

// ── Recent activity ───────────────────────────────────────────────────────────

export type ActivityEvent = ApiDesktopOverview["recentActivity"][number];

/**
 * Merges four real, independently-timestamped signals into one feed — there
 * is no single activity-log table this reads from (AuditLog records ADMIN
 * actions, not business events like "a client verified a price"). Each
 * source is capped to `limit` rows BEFORE merging, so the total read is
 * bounded (4 × limit) regardless of table size, then the merged set is
 * re-sorted and sliced to `limit`.
 *
 * Exported (not just used by desktopOverview() below) — the Notification
 * Center (Phase 14) reuses this SAME merged feed rather than a second
 * activity-log table: see admin/notifications/route.ts.
 */
export async function recentActivity(limit: number): Promise<ActivityEvent[]> {
  const [newRequests, completions, disputes, collected, newClients] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, refNumber: true, service: true, customerName: true, createdAt: true },
    }),
    prisma.leadCompletion.findMany({
      orderBy: { submittedAt: "desc" },
      take: limit,
      select: {
        id: true,
        submittedAt: true,
        providerAmount: true,
        additionalWorkAmount: true,
        lead: { select: { refNumber: true, service: true } },
      },
    }),
    prisma.leadCompletion.findMany({
      where: { verificationStatus: LeadVerificationStatus.DISCREPANCY, verifiedAt: { not: null } },
      orderBy: { verifiedAt: "desc" },
      take: limit,
      select: {
        id: true,
        verifiedAt: true,
        clientAmount: true,
        lead: { select: { refNumber: true, service: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { type: TransactionType.COMMISSION_INCOME, status: TransactionStatus.COLLECTED },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        updatedAt: true,
        amount: true,
        company: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      orderBy: { firstSeenAt: "desc" },
      take: limit,
      select: { id: true, name: true, firstSeenAt: true },
    }),
  ]);

  const events: ActivityEvent[] = [
    ...newRequests.map((l) => ({
      id: `lead:${l.id}`,
      type: "new_request" as const,
      label: `New request — ${l.service} (${l.customerName})`,
      occurredAt: l.createdAt.getTime(),
      amount: null,
    })),
    ...completions.map((c) => ({
      id: `completion:${c.id}`,
      type: "service_completed" as const,
      label: `${c.lead.refNumber} — ${c.lead.service}`,
      occurredAt: c.submittedAt.getTime(),
      amount: c.providerAmount + (c.additionalWorkAmount ?? 0),
    })),
    ...disputes.map((d) => ({
      id: `dispute:${d.id}`,
      type: "dispute_raised" as const,
      label: `${d.lead.refNumber} — ${d.lead.service}`,
      occurredAt: (d.verifiedAt as Date).getTime(),
      amount: d.clientAmount,
    })),
    ...collected.map((t) => ({
      id: `collected:${t.id}`,
      type: "commission_collected" as const,
      label: t.company ? `Provider: ${t.company.name}` : "Commission collected",
      occurredAt: t.updatedAt.getTime(),
      amount: t.amount,
    })),
    ...newClients.map((c) => ({
      id: `client:${c.id}`,
      type: "new_client" as const,
      label: `Client: ${c.name}`,
      occurredAt: c.firstSeenAt.getTime(),
      amount: null,
    })),
  ];

  events.sort((a, b) => b.occurredAt - a.occurredAt);
  return events.slice(0, limit);
}

export async function desktopOverview(query: DesktopOverviewQuery): Promise<ApiDesktopOverview> {
  const days = clampDays(query.days);
  const windowMs = days * 86_400_000;
  const now = Date.now();

  const [current, previous, disputed, awaitingResponse, outstandingCount, series, funnel, activity] =
    await Promise.all([
      windowStats(now - windowMs, now),
      // The equal-length window immediately before the current one — "This
      // Week" compares to the week before it, "Today" to yesterday.
      windowStats(now - 2 * windowMs, now - windowMs),
      // "Discrepancies require review" — open (unresolved) disputes, not a
      // point-in-time count of everything ever disputed. Not window-scoped: an
      // unresolved dispute from three weeks ago still needs review today.
      prisma.transaction.count({ where: { type: TransactionType.COMMISSION_INCOME, status: TransactionStatus.DISPUTED } }),
      // "Requests waiting for provider response" — proxy: leads still in NEW
      // (nobody has moved them to Contacted/In Progress yet).
      prisma.lead.count({ where: { status: LeadStatus.NEW } }),
      prisma.transaction.count({ where: { type: TransactionType.COMMISSION_INCOME, status: TransactionStatus.PENDING } }),
      chartSeries(now - windowMs, now, days),
      requestFunnel(now - windowMs, now),
      recentActivity(RECENT_ACTIVITY_LIMIT),
    ]);

  return {
    newClients: current.newClients,
    newRequests: current.newRequests,
    completedServices: current.completedServices,
    serviceValue: current.serviceValue,
    alAsimaRevenue: current.alAsimaRevenue,
    expenses: current.expenses,
    needsAttention: {
      discrepanciesRequiringReview: disputed,
      requestsAwaitingProviderResponse: awaitingResponse,
      outstandingCommissionCount: outstandingCount,
    },
    trend: {
      newClientsPercent: percentChange(current.newClients, previous.newClients),
      newRequestsPercent: percentChange(current.newRequests, previous.newRequests),
      completedServicesPercent: percentChange(current.completedServices, previous.completedServices),
      serviceValuePercent: percentChange(current.serviceValue, previous.serviceValue),
      alAsimaRevenuePercent: percentChange(current.alAsimaRevenue, previous.alAsimaRevenue),
      expensesPercent: percentChange(current.expenses, previous.expenses),
    },
    series,
    funnel,
    recentActivity: activity,
  };
}
