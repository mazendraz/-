// Company business logic. Public reads implemented here (Phase 3); admin CRUD +
// status land in Phase 6.
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { serializeCompany } from "@/lib/utils/serialize";
import { uniqueSlug } from "@/lib/utils/slug";
import { NotFoundError } from "@/lib/utils/errors";
import type { ApiCompany, ApiPage } from "@/lib/apiTypes";

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

// Relations needed to serialize a full ApiCompany.
const companyInclude = {
  category: { select: { slug: true, label: true } },
  projects: { orderBy: { sortOrder: "asc" } },
  reviews: { orderBy: { createdAt: "desc" } },
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
  if (slug) where.category = { slug };

  if (typeof query.minRating === "number" && query.minRating > 0) {
    where.rating = { gte: query.minRating };
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tagline: { contains: search, mode: "insensitive" } },
      { category: { label: { contains: search, mode: "insensitive" } } },
      { services: { has: search } },
    ];
  }

  return where;
}

function clampPaging(query: CompanyListQuery): { page: number; pageSize: number } {
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const rawSize = Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, pageSize };
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
      include: companyInclude,
      orderBy: orderBy(query.sort ?? "recommended"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { data: rows.map(serializeCompany), meta: { total, page, pageSize } };
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
    include: companyInclude,
  });
  if (!company) throw new NotFoundError("Company");
  return serializeCompany(company);
}

// ── Admin (Phase 6) ───────────────────────────────────────────────────────────

export interface CompanyInput {
  categoryId: string;
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
  email?: string;
  whatsapp?: string;
  // When provided, the company's project list is replaced with these.
  projects?: CompanyProjectInput[];
}

export interface CompanyProjectInput {
  title: string;
  img: string;
  description: string;
  year: string;
}

function projectCreateData(projects: CompanyProjectInput[]) {
  return projects.map((p, i) => ({
    title: p.title,
    img: p.img,
    description: p.description,
    year: p.year,
    sortOrder: i,
  }));
}

export type CompanyStatusValue = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminCompanyListQuery extends CompanyListQuery {
  status?: CompanyStatusValue;
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new NotFoundError("Category");
}

/** Admin: paginated companies of ANY status, with optional filters. */
export async function listAll(
  query: AdminCompanyListQuery,
): Promise<ApiPage<ApiCompany>> {
  const where: Prisma.CompanyWhereInput = {};
  if (query.category) where.category = { slug: query.category };
  if (query.status) where.status = query.status;
  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tagline: { contains: search, mode: "insensitive" } },
      { category: { label: { contains: search, mode: "insensitive" } } },
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
  return { data: rows.map(serializeCompany), meta: { total, page, pageSize } };
}

/** Admin: create a company. Slug is auto-generated from the name. */
export async function create(input: CompanyInput): Promise<ApiCompany> {
  await assertCategoryExists(input.categoryId);
  const slug = await uniqueSlug(
    input.name,
    async (s) => (await prisma.company.count({ where: { slug: s } })) > 0,
  );

  const company = await prisma.company.create({
    data: {
      categoryId: input.categoryId,
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
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      ...(input.projects
        ? { projects: { create: projectCreateData(input.projects) } }
        : {}),
    },
    include: companyInclude,
  });
  return serializeCompany(company);
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
  if (input.categoryId) await assertCategoryExists(input.categoryId);

  const scalarData = {
    categoryId: input.categoryId ?? undefined,
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
    email: input.email === undefined ? undefined : input.email,
    whatsapp: input.whatsapp === undefined ? undefined : input.whatsapp,
  };

  // When projects are supplied, replace the whole list atomically.
  const company = input.projects
    ? await prisma.$transaction(async (tx) => {
        await tx.project.deleteMany({ where: { companyId: id } });
        return tx.company.update({
          where: { id },
          data: {
            ...scalarData,
            projects: { create: projectCreateData(input.projects!) },
          },
          include: companyInclude,
        });
      })
    : await prisma.company.update({
        where: { id },
        data: scalarData,
        include: companyInclude,
      });

  return serializeCompany(company);
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
  return serializeCompany(company);
}
