// Business Control Center — Pricing Intelligence. Zero new schema: pure
// aggregation over Lead + LeadCompletion, which already carry everything the
// mockup needs (estimate, provider final, client-verified final, discrepancy
// flag). See the delivered architecture doc §5 — this is the one analytics
// screen that needed no gap-filling at all.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type {
  ApiPricingAnalytics,
  ApiPricingAnalyticsQuery,
  ApiPricingIntelligence,
  ApiPricingIntelligenceQuery,
} from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
// KPI aggregates (avg/discrepancy-rate/etc.) are computed in JS over the
// matching rows rather than SQL, since they need a per-row computed delta
// (final - estimate) that isn't a stored column. Capped defensively so a huge
// table can't blow up memory — at that point this should move to a raw
// $queryRaw with SQL CASE expressions, the same pattern stats.service.ts
// already uses for its bucket series. Not needed at today's data volumes
// (architecture doc §11).
const MAX_ROWS_FOR_KPIS = 5000;

function clampPaging(query: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function estimateMidpoint(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return Math.round((min + max) / 2);
  return min ?? max;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const completionSelect = {
  leadId: true,
  providerAmount: true,
  additionalWorkAmount: true,
  clientAmount: true,
  verificationStatus: true,
  lead: {
    select: {
      refNumber: true,
      service: true,
      estimatedMin: true,
      estimatedMax: true,
      customerName: true,
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.LeadCompletionSelect;

function finalTotalOf(r: {
  providerAmount: number;
  additionalWorkAmount: number | null;
  clientAmount: number | null;
}): number {
  // clientAmount is always set once verifiedAt is set (see leadCompletion.
  // service.verify) — the fallback below only guards a theoretical gap.
  return r.clientAmount ?? r.providerAmount + (r.additionalWorkAmount ?? 0);
}

/** Admin: the Pricing Intelligence screen — KPI row + Variance Ledger. */
export async function pricingIntelligence(
  query: ApiPricingIntelligenceQuery,
): Promise<ApiPricingIntelligence> {
  const { page, pageSize } = clampPaging(query);
  const where: Prisma.LeadCompletionWhereInput = {
    verifiedAt: {
      not: null,
      ...(query.from != null ? { gte: new Date(query.from) } : {}),
      ...(query.to != null ? { lte: new Date(query.to) } : {}),
    },
    ...(query.companyId ? { lead: { companyId: query.companyId } } : {}),
  };

  const [total, kpiRows, pageRows] = await Promise.all([
    prisma.leadCompletion.count({ where }),
    prisma.leadCompletion.findMany({ where, take: MAX_ROWS_FOR_KPIS, select: completionSelect }),
    prisma.leadCompletion.findMany({
      where,
      orderBy: { verifiedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: completionSelect,
    }),
  ]);

  let estSum = 0;
  let estCount = 0;
  let finalSum = 0;
  let discrepancies = 0;
  let additionalWorkInstances = 0;
  let highestDifference = 0;
  const increases: number[] = [];
  const decreases: number[] = [];

  for (const r of kpiRows) {
    const finalTotal = finalTotalOf(r);
    finalSum += finalTotal;
    const est = estimateMidpoint(r.lead.estimatedMin, r.lead.estimatedMax);
    if (est != null) {
      estSum += est;
      estCount += 1;
      const delta = finalTotal - est;
      if (delta > 0) increases.push(delta);
      else if (delta < 0) decreases.push(delta);
      highestDifference = Math.max(highestDifference, Math.abs(delta));
    }
    if (r.verificationStatus === "DISCREPANCY") discrepancies += 1;
    if (r.additionalWorkAmount != null && r.additionalWorkAmount > 0) additionalWorkInstances += 1;
  }

  const kpiCount = kpiRows.length;
  const avg = (sum: number, count: number) => (count > 0 ? Math.round(sum / count) : 0);

  return {
    avgEstimatedPrice: avg(estSum, estCount),
    avgFinalPrice: avg(finalSum, kpiCount),
    priceDiscrepancyRatePercent: kpiCount > 0 ? round1((discrepancies / kpiCount) * 100) : 0,
    avgPriceIncrease: avg(increases.reduce((a, b) => a + b, 0), increases.length),
    avgPriceDecrease: avg(decreases.reduce((a, b) => a + b, 0), decreases.length),
    additionalWorkFrequencyPercent: kpiCount > 0 ? round1((additionalWorkInstances / kpiCount) * 100) : 0,
    additionalWorkInstances,
    highestDifference,
    varianceTotal: total,
    variance: pageRows.map((r) => {
      const est = estimateMidpoint(r.lead.estimatedMin, r.lead.estimatedMax);
      const finalTotal = finalTotalOf(r);
      return {
        leadId: r.leadId,
        refNumber: r.lead.refNumber,
        service: r.lead.service,
        companyName: r.lead.company.name,
        clientName: r.lead.customerName,
        estimatedPrice: est,
        finalPrice: finalTotal,
        deltaPercent: est != null && est > 0 ? round1(((finalTotal - est) / est) * 100) : null,
        verificationStatus: r.verificationStatus === "DISCREPANCY" ? "DISCREPANCY" : "CONFIRMED",
      };
    }),
  };
}

// ── Pricing Analytics (Analytics module) ──────────────────────────────────────

function clampAnalyticsDays(value: number | undefined): number {
  const n = Math.trunc(value ?? 30) || 30;
  return Math.min(365, Math.max(1, n));
}

/** "YYYY-MM-DD" in the server's local time zone — same convention as
 *  desktopOverview.service.ts's localBucketKey, weekly instead of daily/hourly. */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const analyticsCompletionSelect = {
  providerAmount: true,
  additionalWorkAmount: true,
  clientAmount: true,
  verificationStatus: true,
  verifiedAt: true,
  lead: {
    select: {
      estimatedMin: true,
      estimatedMax: true,
      companyId: true,
      company: {
        select: {
          name: true,
          // A company's PRIMARY category only (categories[0]) — the same
          // simplification providerPerformance.service.ts's categoryLabel
          // already uses for a company with more than one.
          categories: { take: 1, select: { category: { select: { label: true } } } },
        },
      },
    },
  },
} satisfies Prisma.LeadCompletionSelect;

/**
 * Admin: the Analytics module's Pricing Analytics screen — same underlying
 * data as Pricing Intelligence (Lead + LeadCompletion, zero new schema), but
 * additionally broken out by week / category / provider, and keeping
 * "Provider Final Price" and "Client Confirmed Price" as two explicitly
 * separate averages (Pricing Intelligence's avgFinalPrice already collapses
 * them into one "final" number, which is right for THAT screen's variance
 * ledger but wrong for a screen whose whole point is highlighting that the
 * two prices differ).
 */
export async function pricingAnalytics(query: ApiPricingAnalyticsQuery): Promise<ApiPricingAnalytics> {
  const days = clampAnalyticsDays(query.days);
  const now = Date.now();
  const from = now - days * 86_400_000;
  const WEEK_MS = 7 * 86_400_000;
  const bucketCount = Math.max(1, Math.ceil(days / 7));

  const rows = await prisma.leadCompletion.findMany({
    where: { verifiedAt: { not: null, gte: new Date(from) } },
    take: MAX_ROWS_FOR_KPIS,
    select: analyticsCompletionSelect,
  });

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    date: localDateKey(new Date(from + i * WEEK_MS)),
    sumEst: 0,
    estCount: 0,
    sumProviderFinal: 0,
    providerCount: 0,
    sumClientConfirmed: 0,
    clientCount: 0,
  }));

  let estSum = 0;
  let estCount = 0;
  let providerFinalSum = 0;
  let clientConfirmedSum = 0;
  let clientConfirmedCount = 0;
  let discrepancies = 0;
  let additionalWorkInstances = 0;
  const diffs: number[] = [];
  const diffPercents: number[] = [];
  const categoryAgg = new Map<string, { sumPercent: number; count: number }>();
  const providerAgg = new Map<string, { name: string; sumPercent: number; count: number }>();

  for (const r of rows) {
    const providerFinal = r.providerAmount + (r.additionalWorkAmount ?? 0);
    providerFinalSum += providerFinal;
    const est = estimateMidpoint(r.lead.estimatedMin, r.lead.estimatedMax);
    if (est != null) {
      estSum += est;
      estCount += 1;
    }

    let diffPercent: number | null = null;
    if (r.clientAmount != null) {
      clientConfirmedSum += r.clientAmount;
      clientConfirmedCount += 1;
      if (est != null && est > 0) {
        diffs.push(r.clientAmount - est);
        diffPercent = ((r.clientAmount - est) / est) * 100;
        diffPercents.push(diffPercent);
      }
    }
    if (r.verificationStatus === "DISCREPANCY") discrepancies += 1;
    if (r.additionalWorkAmount != null && r.additionalWorkAmount > 0) additionalWorkInstances += 1;

    const idx = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor(((r.verifiedAt as Date).getTime() - from) / WEEK_MS)),
    );
    const b = buckets[idx];
    if (est != null) {
      b.sumEst += est;
      b.estCount += 1;
    }
    b.sumProviderFinal += providerFinal;
    b.providerCount += 1;
    if (r.clientAmount != null) {
      b.sumClientConfirmed += r.clientAmount;
      b.clientCount += 1;
    }

    if (diffPercent != null) {
      const categoryLabel = r.lead.company.categories[0]?.category.label ?? "Uncategorized";
      const catEntry = categoryAgg.get(categoryLabel) ?? { sumPercent: 0, count: 0 };
      catEntry.sumPercent += diffPercent;
      catEntry.count += 1;
      categoryAgg.set(categoryLabel, catEntry);

      const provEntry = providerAgg.get(r.lead.companyId) ?? { name: r.lead.company.name, sumPercent: 0, count: 0 };
      provEntry.sumPercent += diffPercent;
      provEntry.count += 1;
      providerAgg.set(r.lead.companyId, provEntry);
    }
  }

  const avg = (sum: number, count: number) => (count > 0 ? Math.round(sum / count) : 0);
  const kpiCount = rows.length;

  return {
    avgEstimatedPrice: avg(estSum, estCount),
    avgProviderFinalPrice: avg(providerFinalSum, kpiCount),
    avgClientConfirmedPrice: avg(clientConfirmedSum, clientConfirmedCount),
    avgDifference: avg(
      diffs.reduce((a, b) => a + b, 0),
      diffs.length,
    ),
    avgDifferencePercent:
      diffPercents.length > 0 ? round1(diffPercents.reduce((a, b) => a + b, 0) / diffPercents.length) : 0,
    additionalWorkFrequencyPercent: kpiCount > 0 ? round1((additionalWorkInstances / kpiCount) * 100) : 0,
    priceDiscrepancyRatePercent: kpiCount > 0 ? round1((discrepancies / kpiCount) * 100) : 0,
    trend: buckets.map((b) => ({
      date: b.date,
      avgEstimated: avg(b.sumEst, b.estCount),
      avgProviderFinal: avg(b.sumProviderFinal, b.providerCount),
      avgClientConfirmed: avg(b.sumClientConfirmed, b.clientCount),
    })),
    byCategory: [...categoryAgg.entries()]
      .map(([category, v]) => ({ category, avgDifferencePercent: round1(v.sumPercent / v.count), count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    byProvider: [...providerAgg.entries()]
      .map(([companyId, v]) => ({
        companyId,
        companyName: v.name,
        avgDifferencePercent: round1(v.sumPercent / v.count),
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
