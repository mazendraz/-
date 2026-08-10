// Company business logic. Public reads implemented here (Phase 3); admin CRUD +
// status land in Phase 6.
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { serializeCompany, serializeCompanyAdmin, serializeCompanyCard } from "@/lib/utils/serialize";
import { uniqueSlug } from "@/lib/utils/slug";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import { recomputeAggregate } from "@/lib/services/reviews.service";
import { NotFoundError } from "@/lib/utils/errors";
import type { ApiCompany, ApiPage } from "@/lib/apiTypes";

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
// Cap reviews returned on a single profile so a company with a huge review count
// can't produce an unbounded payload. Most-recent first; the count badge still
// shows the true total (company.reviewCount).
const MAX_PROFILE_REVIEWS = 50;

/**
 * The same guard, for the two relations that never got one.
 *
 * Reviews were capped; projects and offerings were not, and both are embedded in
 * the company payload rather than fetched separately. Measured against a seeded
 * company: 3,000 projects produced a 1.41 MB response on the PUBLIC profile and
 * 1.42 MB on the admin company list (which embeds them for every company on the
 * page), and 2,000 offerings produced 1.29 MB. On a phone that is the whole page
 * budget spent on rows nobody scrolls to.
 *
 * Deliberately generous — a real portfolio is dozens of projects, not hundreds —
 * so this bounds the pathological case without truncating any plausible company.
 * If a genuine need for deeper access appears, the answer is a paginated endpoint
 * (as reviews already have at /companies/:slug/reviews), not a bigger number
 * here.
 */
const MAX_PROFILE_PROJECTS = 200;
const MAX_PROFILE_OFFERINGS = 200;

export type CompanySort =
  | "recommended"
  | "rating"
  | "projects"
  | "reviews"
  | "name";

export interface CompanyListQuery {
  page?: number;
  pageSize?: number;
  category?: string; // category slug
  search?: string;
  minRating?: number;
  sort?: CompanySort;
}

// Only windows that still matter — running or upcoming. Finished ones are
// history and nothing reads them; fetching them would grow this query without
// bound as the table ages.
const relevantBusyWindows = {
  where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
  orderBy: { startsAt: "asc" },
} satisfies Prisma.Company$busyWindowsArgs;

// Every category a company is linked to, plus which one is primary — shared by
// every include below. `orderBy: isPrimary desc` puts the primary link first,
// but companyScalars() (serialize.ts) still finds it explicitly rather than
// trusting array order.
const companyCategoriesInclude = {
  select: {
    isPrimary: true,
    category: { select: { slug: true, label: true, pricingMode: true } },
  },
  orderBy: { isPrimary: "desc" },
} satisfies Prisma.Company$categoriesArgs;

// Relations needed to serialize a full ApiCompany (detail route + admin list).
// Reviews are capped (most recent first) so one profile can't return tens of
// thousands of rows; the true total stays in company.reviewCount.
const companyInclude = {
  categories: companyCategoriesInclude,
  busyWindows: relevantBusyWindows,
  projects: { orderBy: { sortOrder: "asc" }, take: MAX_PROFILE_PROJECTS },
  reviews: { orderBy: { createdAt: "desc" }, take: MAX_PROFILE_REVIEWS },
  // Exact lead count per row. The admin company cards used to derive this by
  // filtering the browser's hydrated lead list — one capped page — so every
  // card under-reported once the platform passed a hundred leads. A COUNT
  // aggregate over the page being returned is cheap and can't drift.
  _count: { select: { leads: true } },
} satisfies Prisma.CompanyInclude;

// Public profile: only APPROVED projects are shown (provider submissions stay
// hidden until an admin approves them). Admin/provider views use companyInclude.

const publicTierInclude = {
  tiers: { where: { isPublished: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.OfferingInclude;

const publicCompanyInclude = {
  categories: companyCategoriesInclude,
  busyWindows: relevantBusyWindows,
  projects: { where: { status: "APPROVED" }, orderBy: { sortOrder: "asc" }, take: MAX_PROFILE_PROJECTS },
  reviews: { where: { approved: true }, orderBy: { createdAt: "desc" }, take: MAX_PROFILE_REVIEWS },
  // Published AND active only. `isPublished` is the approval gate (a draft has
  // never been reviewed); `isActive` is the provider's immediate on/off switch.
  // A row failing either must not reach a customer.
  offerings: {
    where: { isPublished: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: MAX_PROFILE_OFFERINGS,
    // Tiers are filtered too, not just the offering. A tier added to an
    // already-published offering starts as a draft awaiting its own approval,
    // and a tier price OVERRIDES the offering's for the line it matches — so an
    // unfiltered include here would put an unreviewed price on a public profile.
    include: publicTierInclude,
  },
  // The customer's basket total is reduced by these SERVER-side when the request
  // is priced (leadItems.service), so the profile has to be able to show the same
  // discount while they are still choosing. Without them the live estimate read
  // HIGHER than what was actually recorded on the lead, and the one incentive to
  // add another item was invisible at the moment it mattered.
  bundleRules: {
    where: { isPublished: true, isActive: true },
    orderBy: { minItems: "asc" },
  },
} satisfies Prisma.CompanyInclude;

// Card view (public list endpoints): only the category relation — NOT the heavy
// projects/reviews arrays. Pairs with serializeCompanyCard.
const companyCardInclude = {
  categories: companyCategoriesInclude,
  busyWindows: relevantBusyWindows,
} satisfies Prisma.CompanyInclude;

// Mirrors the frontend Companies page sorters (pages/Companies.tsx).
function orderBy(sort: CompanySort): Prisma.CompanyOrderByWithRelationInput[] {
  switch (sort) {
    case "rating":
      return [{ rating: "desc" }];
    case "projects":
      return [{ completedProjects: "desc" }];
    case "reviews":
      return [{ reviewCount: "desc" }];
    case "name":
      return [{ name: "asc" }];
    case "recommended":
    default:
      return [{ rating: "desc" }, { completedProjects: "desc" }];
  }
}

function buildWhere(
  query: CompanyListQuery,
  categorySlug?: string,
): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = { status: CompanyStatus.ACTIVE };

  const slug = categorySlug ?? query.category;
  // `some` — a company matches if ANY of its linked categories has this slug,
  // not just its primary. Compiles to an indexed EXISTS join through
  // CompanyCategory, single round trip.
  if (slug) where.categories = { some: { category: { slug } } };

  if (typeof query.minRating === "number" && query.minRating > 0) {
    where.rating = { gte: query.minRating };
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tagline: { contains: search, mode: "insensitive" } },
      { categories: { some: { category: { label: { contains: search, mode: "insensitive" } } } } },
      { services: { has: search } },
    ];
  }

  return where;
}

/**
 * One decimal, 0..5 — the same shape recompute() writes, applied to the manual
 * override path so both producers of this column agree on its precision.
 */
export function roundRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(5, Math.max(0, value)) * 10) / 10;
}

function clampPaging(query: CompanyListQuery): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

async function listActiveWhere(
  query: CompanyListQuery,
  categorySlug?: string,
): Promise<ApiPage<ApiCompany>> {
  const where = buildWhere(query, categorySlug);
  const { page, pageSize } = clampPaging(query);

  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: companyCardInclude,
      orderBy: orderBy(query.sort ?? "recommended"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: rows.map(serializeCompanyCard), meta: { total, page, pageSize } };
}

/** Public: paginated ACTIVE companies with filters. */
export function listActive(query: CompanyListQuery): Promise<ApiPage<ApiCompany>> {
  return listActiveWhere(query);
}

/** Public: ACTIVE companies within one category. */
export function listByCategory(
  categorySlug: string,
  query: CompanyListQuery,
): Promise<ApiPage<ApiCompany>> {
  return listActiveWhere(query, categorySlug);
}

/** Public: full profile by slug — 404 if missing or not ACTIVE. */
export async function getActiveBySlug(slug: string): Promise<ApiCompany> {
  const company = await prisma.company.findFirst({
    where: { slug, status: CompanyStatus.ACTIVE },
    include: publicCompanyInclude,
  });
  if (!company) throw new NotFoundError("Company");
  return serializeCompany(company);
}

// ── Admin (Phase 6) ───────────────────────────────────────────────────────────

export interface CompanyInput {
  categoryIds: string[];
  // Which of categoryIds is primary — see CompanyCategory. Defaults to
  // categoryIds[0] when omitted.
  primaryCategoryId?: string;
  name: string;
  tagline: string;
  about: string;
  logo: string;
  cover: string;
  services: string[];
  gallery: string[];
  badges: string[];
  phone: string;
  location: string;
  yearsExperience: number;
  responseTime: string;
  verifiedSince: string;
  completedProjects?: number;
  featured?: boolean;
  verified?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  email?: string;
  whatsapp?: string;
  // Manual rating override. When ratingOverridden is true, rating/reviewCount are
  // taken as-is and the review recompute leaves them alone; when false, they're
  // recomputed from the Review table (any rating/reviewCount sent is ignored).
  rating?: number;
  reviewCount?: number;
  ratingOverridden?: boolean;
  // When provided, the company's project list is replaced with these.
  projects?: CompanyProjectInput[];
}

export interface CompanyProjectInput {
  title: string;
  img: string;
  description: string;
  year: string;
  featured?: boolean;
}

function projectCreateData(projects: CompanyProjectInput[]) {
  return projects.map((p, i) => ({
    title: p.title,
    img: p.img,
    description: p.description,
    year: p.year,
    sortOrder: i,
    featured: p.featured ?? false,
    // Projects managed through the admin company editor are published directly.
    status: "APPROVED" as const,
  }));
}

export type CompanyStatusValue = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminCompanyListQuery extends CompanyListQuery {
  status?: CompanyStatusValue;
}

/** Throws NotFoundError naming the first missing id, if any. One round trip. */
async function assertCategoriesExist(categoryIds: string[]): Promise<void> {
  const found = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });
  if (found.length !== categoryIds.length) {
    const foundIds = new Set(found.map((c) => c.id));
    const missing = categoryIds.find((id) => !foundIds.has(id));
    throw new NotFoundError(`Category (${missing})`);
  }
}

/** Resolves the primary id, defaulting to the first category when unset. */
function resolvePrimaryCategoryId(categoryIds: string[], primaryCategoryId?: string): string {
  return primaryCategoryId ?? categoryIds[0];
}

/** Admin: paginated companies of ANY status, with optional filters. */
export async function listAll(
  query: AdminCompanyListQuery,
): Promise<ApiPage<ApiCompany>> {
  const where: Prisma.CompanyWhereInput = {};
  if (query.category) where.categories = { some: { category: { slug: query.category } } };
  if (query.status) where.status = query.status;
  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tagline: { contains: search, mode: "insensitive" } },
      { categories: { some: { category: { label: { contains: search, mode: "insensitive" } } } } },
      { services: { has: search } },
    ];
  }

  const { page, pageSize } = clampPaging(query);
  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: companyInclude,
      orderBy: orderBy(query.sort ?? "recommended"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serializeCompanyAdmin), meta: { total, page, pageSize } };
}

/** Admin: create a company. Slug is auto-generated from the name. */
export async function create(input: CompanyInput): Promise<ApiCompany> {
  await assertCategoriesExist(input.categoryIds);
  const primaryCategoryId = resolvePrimaryCategoryId(input.categoryIds, input.primaryCategoryId);
  const slug = await uniqueSlug(
    input.name,
    async (s) => (await prisma.company.count({ where: { slug: s } })) > 0,
  );

  const company = await prisma.company.create({
    data: {
      categories: {
        create: input.categoryIds.map((categoryId) => ({
          categoryId,
          isPrimary: categoryId === primaryCategoryId,
        })),
      },
      slug,
      name: input.name,
      tagline: input.tagline,
      about: input.about,
      logo: input.logo,
      cover: input.cover,
      services: input.services ?? [],
      gallery: input.gallery ?? [],
      badges: input.badges ?? [],
      phone: input.phone,
      location: input.location,
      yearsExperience: input.yearsExperience,
      responseTime: input.responseTime,
      verifiedSince: input.verifiedSince,
      completedProjects: input.completedProjects ?? 0,
      featured: input.featured ?? true,
      verified: input.verified ?? false,
      // Manual rating override on create (e.g. seeding a curated company that has
      // no real reviews yet). Without it, rating/reviewCount stay 0 until reviews.
      ratingOverridden: input.ratingOverridden ?? false,
      // Rounded on the way IN, to the same one decimal the review recompute
      // produces (see reviews.service). Without this, the override path was the
      // one way an unrounded float could enter the column — and every display
      // site printed the raw value.
      ...(input.ratingOverridden
        ? { rating: roundRating(input.rating ?? 0), reviewCount: input.reviewCount ?? 0 }
        : {}),
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      ...(input.projects
        ? { projects: { create: projectCreateData(input.projects) } }
        : {}),
    },
    include: companyInclude,
  });
  return serializeCompanyAdmin(company);
}

/** Admin: update a company. The slug stays stable to preserve existing links. */
export async function update(
  id: string,
  input: Partial<CompanyInput>,
): Promise<ApiCompany> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company");
  if (input.categoryIds) await assertCategoriesExist(input.categoryIds);
  const primaryCategoryId = input.categoryIds
    ? resolvePrimaryCategoryId(input.categoryIds, input.primaryCategoryId)
    : undefined;

  const scalarData = {
    name: input.name ?? undefined,
    tagline: input.tagline ?? undefined,
    about: input.about ?? undefined,
    logo: input.logo ?? undefined,
    cover: input.cover ?? undefined,
    services: input.services ?? undefined,
    gallery: input.gallery ?? undefined,
    badges: input.badges ?? undefined,
    phone: input.phone ?? undefined,
    location: input.location ?? undefined,
    yearsExperience: input.yearsExperience ?? undefined,
    responseTime: input.responseTime ?? undefined,
    verifiedSince: input.verifiedSince ?? undefined,
    completedProjects: input.completedProjects ?? undefined,
    featured: input.featured ?? undefined,
    verified: input.verified ?? undefined,
    ratingOverridden: input.ratingOverridden ?? undefined,
    // Only write rating/reviewCount when the override is being turned ON; otherwise
    // they're owned by the review recompute (and cleared back to it below).
    ...(input.ratingOverridden === true
      ? {
          rating: input.rating === undefined ? undefined : roundRating(input.rating),
          reviewCount: input.reviewCount ?? undefined,
        }
      : {}),
    metaTitle: input.metaTitle === undefined ? undefined : input.metaTitle,
    metaDescription: input.metaDescription === undefined ? undefined : input.metaDescription,
    email: input.email === undefined ? undefined : input.email,
    whatsapp: input.whatsapp === undefined ? undefined : input.whatsapp,
  };

  // When projects and/or categoryIds are supplied, replace those lists
  // atomically. Provider project submissions still awaiting moderation
  // (PENDING/REJECTED) are left untouched so an admin company edit never wipes
  // them. Categories are always a full replace-all (same pattern as projects) —
  // the multi-select editor always sends the complete membership, not a diff.
  const company = input.projects || input.categoryIds
    ? await prisma.$transaction(async (tx) => {
        if (input.projects) {
          await tx.project.deleteMany({ where: { companyId: id, status: "APPROVED" } });
        }
        if (input.categoryIds) {
          await tx.companyCategory.deleteMany({ where: { companyId: id } });
        }
        return tx.company.update({
          where: { id },
          data: {
            ...scalarData,
            ...(input.projects ? { projects: { create: projectCreateData(input.projects) } } : {}),
            ...(input.categoryIds
              ? {
                  categories: {
                    create: input.categoryIds.map((categoryId) => ({
                      categoryId,
                      isPrimary: categoryId === primaryCategoryId,
                    })),
                  },
                }
              : {}),
          },
          include: companyInclude,
        });
      })
    : await prisma.company.update({
        where: { id },
        data: scalarData,
        include: companyInclude,
      });

  // Override just cleared → restore rating/reviewCount from real reviews and return
  // the recomputed record (recompute now runs because the flag is false).
  if (input.ratingOverridden === false) {
    await recomputeAggregate(id);
    const fresh = await prisma.company.findUnique({ where: { id }, include: companyInclude });
    if (fresh) return serializeCompanyAdmin(fresh);
  }

  return serializeCompanyAdmin(company);
}

/** Admin: delete a company (cascades projects/reviews/leads). */
export async function remove(id: string): Promise<void> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company");
  await prisma.company.delete({ where: { id } });
}

export interface AvailabilityInput {
  busy: boolean;
  busyUntil?: number | null; // epoch ms; null clears the auto-reopen date
  busyNote?: string | null;
}

/**
 * Set a company's availability ("busy") state. Shared by the provider self-service
 * endpoint (scoped to their own company) and the admin endpoint. When busy is set
 * false we also clear busyUntil so a stale reopen date can't linger. busyUntil is
 * accepted as epoch ms (or null); the effective busy state is resolved at read time
 * (see serialize.isEffectivelyBusy), so no scheduling is needed.
 */
export async function setAvailability(
  id: string,
  input: AvailabilityInput,
): Promise<ApiCompany> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company");

  const busyUntil = !input.busy
    ? null // going available clears any reopen date
    : input.busyUntil == null
      ? null
      : new Date(input.busyUntil);

  const company = await prisma.company.update({
    where: { id },
    data: {
      busy: input.busy,
      busyUntil,
      // Only touch the note when explicitly provided; "" clears it.
      ...(input.busyNote === undefined
        ? {}
        : { busyNote: input.busyNote?.trim() || null }),
    },
    include: companyInclude,
  });
  return serializeCompanyAdmin(company);
}

/** Admin: change visibility status. */
export async function setStatus(
  id: string,
  status: CompanyStatusValue,
): Promise<ApiCompany> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Company");

  const company = await prisma.company.update({
    where: { id },
    data: { status },
    include: companyInclude,
  });
  return serializeCompanyAdmin(company);
}
