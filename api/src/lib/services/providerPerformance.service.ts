// Business Control Center — Provider Performance. Aggregation over Company +
// Lead + LeadCompletion — zero new schema (Company.rating already exists).
import { prisma } from "@/lib/prisma";
import { CompanyStatus, LeadStatus, LeadVerificationStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type {
  ApiPage,
  ApiProviderPerformance,
  ApiProviderPerformanceQuery,
  ApiProviderPerformanceSummary,
} from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// A company crosses into "REVIEW" status once its discrepancy rate (among its
// OWN verified jobs) exceeds this — an explicit, documented v1 threshold, not
// a tuned business rule. Easy to move to an AppSetting later if Al Asima wants
// it adjustable without a redeploy.
const DISCREPANCY_REVIEW_THRESHOLD_PERCENT = 3;

function clampPaging(query: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function leadDateRange(from?: number, to?: number): Prisma.LeadWhereInput {
  if (from == null && to == null) return {};
  return {
    createdAt: {
      ...(from != null ? { gte: new Date(from) } : {}),
      ...(to != null ? { lte: new Date(to) } : {}),
    },
  };
}

/** Admin: the Provider Performance directory. */
export async function providerPerformance(
  query: ApiProviderPerformanceQuery,
): Promise<ApiPage<ApiProviderPerformance>> {
  const { page, pageSize } = clampPaging(query);
  const search = query.search?.trim();
  const where: Prisma.CompanyWhereInput = {
    ...(query.category ? { categories: { some: { category: { slug: query.category } } } } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [total, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        rating: true,
        categories: {
          where: { isPrimary: true },
          take: 1,
          select: { category: { select: { label: true } } },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  if (companies.length === 0) return { data: [], meta: { total, page, pageSize } };

  const ids = companies.map((c) => c.id);
  const dateRange = leadDateRange(query.from, query.to);

  const [requestCounts, completedCounts, completions] = await Promise.all([
    prisma.lead.groupBy({
      by: ["companyId"],
      where: { companyId: { in: ids }, ...dateRange },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["companyId"],
      where: { companyId: { in: ids }, status: "COMPLETED", ...dateRange },
      _count: { _all: true },
    }),
    prisma.leadCompletion.findMany({
      where: {
        verifiedAt: { not: null },
        lead: { companyId: { in: ids }, ...dateRange },
      },
      select: { clientAmount: true, verificationStatus: true, lead: { select: { companyId: true } } },
    }),
  ]);

  const requestsByCompany = new Map(requestCounts.map((r) => [r.companyId, r._count._all]));
  const completedByCompany = new Map(completedCounts.map((r) => [r.companyId, r._count._all]));

  const valueByCompany = new Map<string, number>();
  const verifiedByCompany = new Map<string, number>();
  const discrepancyByCompany = new Map<string, number>();
  for (const c of completions) {
    const companyId = c.lead.companyId;
    valueByCompany.set(companyId, (valueByCompany.get(companyId) ?? 0) + (c.clientAmount ?? 0));
    verifiedByCompany.set(companyId, (verifiedByCompany.get(companyId) ?? 0) + 1);
    if (c.verificationStatus === "DISCREPANCY") {
      discrepancyByCompany.set(companyId, (discrepancyByCompany.get(companyId) ?? 0) + 1);
    }
  }

  const data: ApiProviderPerformance[] = companies.map((c) => {
    const requestsHandled = requestsByCompany.get(c.id) ?? 0;
    const completedServices = completedByCompany.get(c.id) ?? 0;
    const verified = verifiedByCompany.get(c.id) ?? 0;
    const discrepancies = discrepancyByCompany.get(c.id) ?? 0;
    // Discrepancy rate is over this company's own VERIFIED jobs (the only
    // population where a discrepancy could even occur), not over every
    // request it has ever received.
    const discrepancyRatePercent = verified > 0 ? Math.round((discrepancies / verified) * 1000) / 10 : 0;
    return {
      companyId: c.id,
      companySlug: c.slug,
      companyName: c.name,
      logo: c.logo,
      categoryLabel: c.categories[0]?.category.label ?? "",
      requestsHandled,
      completedServices,
      completionRatePercent: requestsHandled > 0 ? Math.round((completedServices / requestsHandled) * 1000) / 10 : 0,
      serviceValue: valueByCompany.get(c.id) ?? 0,
      avgRating: c.rating,
      discrepancyRatePercent,
      status: discrepancyRatePercent > DISCREPANCY_REVIEW_THRESHOLD_PERCENT ? "REVIEW" : "ACTIVE",
    };
  });

  return { data, meta: { total, page, pageSize } };
}

/**
 * Admin: the Provider Performance screen's top KPI row — an all-companies
 * snapshot (not the current page), so it doesn't shift as the table below is
 * paginated. Company counts on this platform are small (a local B2B
 * marketplace, not a mass consumer one), so reading every row here — rather
 * than the paginated screen below — is the right tradeoff, same call
 * clientsService.overview already makes for the Clients screen.
 */
export async function providerPerformanceSummary(): Promise<ApiProviderPerformanceSummary> {
  const [totalProviders, activeProviders, avgRatingAgg, completedServicesTotal, verifiedCount, discrepancyCount] =
    await Promise.all([
      prisma.company.count(),
      // "Active Now" = live on the marketplace (Company.status), a different
      // signal from this screen's own computed per-row status (ACTIVE/REVIEW,
      // which is driven by discrepancy rate, not marketplace visibility).
      prisma.company.count({ where: { status: CompanyStatus.ACTIVE } }),
      prisma.company.aggregate({ _avg: { rating: true } }),
      prisma.lead.count({ where: { status: LeadStatus.COMPLETED } }),
      // Two counts instead of fetching every verified completion row into
      // memory just to .length/.filter() it — avoids an unbounded read that
      // grows with total platform activity (was prisma.leadCompletion.findMany
      // with no `take`, no date bound).
      prisma.leadCompletion.count({ where: { verifiedAt: { not: null } } }),
      prisma.leadCompletion.count({
        where: { verifiedAt: { not: null }, verificationStatus: LeadVerificationStatus.DISCREPANCY },
      }),
    ]);

  return {
    totalProviders,
    activeProviders,
    completedServicesTotal,
    avgRating: avgRatingAgg._avg.rating ?? 0,
    discrepancyRatePercent: verifiedCount > 0 ? Math.round((discrepancyCount / verifiedCount) * 1000) / 10 : 0,
  };
}
