// Category business logic. Public read (Phase 3) + admin CRUD (Phase 6).
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { serializeCategory, serializeCategoryAdmin } from "@/lib/utils/serialize";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import type { ApiAdminCategory, ApiCategory } from "@/lib/apiTypes";

/**
 * Public: active categories, each with a LIVE count of its ACTIVE companies.
 * Ordered alphabetically by label.
 */
export async function listActive(): Promise<ApiCategory[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
    include: {
      _count: { select: { companies: { where: { status: CompanyStatus.ACTIVE } } } },
    },
  });

  return categories.map((c) => serializeCategory(c, c._count.companies));
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface CategoryInput {
  label: string;
  description: string;
  icon: string;
  cover?: string;
  isActive?: boolean;
  metaTitle?: string;
  metaDescription?: string;
}

/** Admin: all categories (active and not), each with its TOTAL company count. */
export async function listAll(): Promise<ApiAdminCategory[]> {
  const categories = await prisma.category.findMany({
    orderBy: { label: "asc" },
    include: { _count: { select: { companies: true } } },
  });
  return categories.map((c) => serializeCategoryAdmin(c, c._count.companies));
}

async function slugTaken(slug: string): Promise<boolean> {
  return (await prisma.category.count({ where: { slug } })) > 0;
}

/** Admin: create a category. Slug is auto-generated from the label. */
export async function create(input: CategoryInput): Promise<ApiAdminCategory> {
  const slug = await uniqueSlug(input.label, slugTaken);
  const category = await prisma.category.create({
    data: {
      slug,
      label: input.label,
      description: input.description,
      icon: input.icon,
      cover: input.cover ?? null,
      isActive: input.isActive ?? true,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
    },
  });
  return serializeCategoryAdmin(category, 0);
}

/**
 * Admin: update a category. The slug stays stable (to preserve existing links)
 * unless it would still be unique under the new label — we leave it as-is here.
 */
export async function update(
  id: string,
  input: Partial<CategoryInput>,
): Promise<ApiAdminCategory> {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Category");

  const category = await prisma.category.update({
    where: { id },
    data: {
      label: input.label ?? undefined,
      description: input.description ?? undefined,
      icon: input.icon ?? undefined,
      cover: input.cover === undefined ? undefined : input.cover,
      isActive: input.isActive ?? undefined,
      metaTitle: input.metaTitle === undefined ? undefined : input.metaTitle,
      metaDescription: input.metaDescription === undefined ? undefined : input.metaDescription,
    },
    include: { _count: { select: { companies: true } } },
  });
  return serializeCategoryAdmin(category, category._count.companies);
}

/** Admin: delete a category — fails with CONFLICT if it still has companies. */
export async function remove(id: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { companies: true } } },
  });
  if (!category) throw new NotFoundError("Category");
  if (category._count.companies > 0) {
    throw new ConflictError("Cannot delete a category that still has companies");
  }
  await prisma.category.delete({ where: { id } });
}

// Re-exported for callers/tests that want the slug helper alongside the service.
export { slugify };
