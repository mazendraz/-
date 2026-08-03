// Category business logic. Public read (Phase 3) + admin CRUD (Phase 6).
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { serializeCategory, serializeCategoryAdmin } from "@/lib/utils/serialize";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { ConflictError, NotFoundError } from "@/lib/utils/errors";
import type { ApiAdminCategory, ApiCategory, ApiCategoryPricingMode } from "@/lib/apiTypes";

/**
 * Public: active categories, each with a LIVE count of its ACTIVE companies.
 * Ordered alphabetically by label.
 */
export async function listActive(): Promise<ApiCategory[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
    include: {
      _count: { select: { companies: { where: { company: { status: CompanyStatus.ACTIVE } } } } },
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
  pricingMode?: ApiCategoryPricingMode;
  metaTitle?: string;
  metaDescription?: string;
}

/**
 * For every category: how many of its companies would actually LOSE catalog
 * access if that category stopped being FIXED_CATALOG — i.e. companies with a
 * published Offering for whom this is their ONLY linked FIXED_CATALOG category
 * (the gate in offerings.service.ts assertCatalogEnabled is a permissive union
 * over ALL of a company's categories, so a company with a SECOND FIXED_CATALOG
 * category keeps its catalog regardless of what happens to this one). One query
 * for every company with a published offering, counted in application code —
 * bounded by "companies that actually publish", not the whole platform.
 */
async function companiesSolelyEnabledByCategory(): Promise<Map<string, number>> {
  const companies = await prisma.company.findMany({
    where: { offerings: { some: { isPublished: true } } },
    select: {
      categories: { select: { categoryId: true, category: { select: { pricingMode: true } } } },
    },
  });
  const counts = new Map<string, number>();
  for (const company of companies) {
    const fixedCatalogIds = company.categories
      .filter((cc) => cc.category.pricingMode === "FIXED_CATALOG")
      .map((cc) => cc.categoryId);
    // Exactly one FIXED_CATALOG category → that one is the sole enabler.
    // Zero or two+ → no single category's toggle would change this company's
    // catalog access, so it doesn't count against any of them.
    if (fixedCatalogIds.length === 1) {
      const id = fixedCatalogIds[0];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Admin: all categories (active and not), each with its TOTAL company count
 * and how many of those companies would lose catalog access if this category's
 * FIXED_CATALOG were switched off — the count the CategoryEditor's "switching
 * off affects N companies" warning needs. One extra grouped query for the
 * whole list, not one per category.
 */
export async function listAll(): Promise<ApiAdminCategory[]> {
  const [categories, catalogCountByCategory] = await Promise.all([
    prisma.category.findMany({
      orderBy: { label: "asc" },
      include: { _count: { select: { companies: true } } },
    }),
    companiesSolelyEnabledByCategory(),
  ]);
  return categories.map((c) =>
    serializeCategoryAdmin(c, c._count.companies, catalogCountByCategory.get(c.id) ?? 0),
  );
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
      pricingMode: input.pricingMode ?? undefined, // undefined → schema default (QUOTE_ONLY)
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
    },
  });
  // A brand-new category has no companies yet, so nothing can have a
  // published Offering in it — no query needed to know that count is 0.
  return serializeCategoryAdmin(category, 0, 0);
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
      pricingMode: input.pricingMode ?? undefined,
      metaTitle: input.metaTitle === undefined ? undefined : input.metaTitle,
      metaDescription: input.metaDescription === undefined ? undefined : input.metaDescription,
    },
    include: { _count: { select: { companies: true } } },
  });
  // Computed AFTER the mutation, against final state — if pricingMode just
  // switched off, this correctly comes back 0 for THIS category (nothing solely
  // depends on it anymore because it no longer offers FIXED_CATALOG).
  const catalogCount = (await companiesSolelyEnabledByCategory()).get(id) ?? 0;
  return serializeCategoryAdmin(category, category._count.companies, catalogCount);
}

/**
 * Admin: delete a category. NEVER deletes a company as a side effect — a
 * company can be linked to several categories, so deleting one category must
 * only remove that one link.
 *
 * Every company must keep at least one category (a hard product invariant), so
 * if any company's ONLY link is to this category, deletion is blocked with a
 * CONFLICT naming them — the admin must reassign those companies first. Every
 * OTHER affected company just loses this one link; if it was their primary,
 * another of their remaining categories is auto-promoted to primary so no
 * company is ever left without one (see CompanyCategory's one-primary
 * invariant, enforced at the DB level too).
 */
export async function remove(id: string): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new NotFoundError("Category");

  // Companies whose ONLY category link is this one — `every` reads "every one
  // of this company's links has categoryId = id", which (since every company
  // has >=1 category by invariant) can only be true when this is their sole
  // category. Capped so a huge orphan set can't blow up the error payload.
  const orphaned = await prisma.company.findMany({
    where: { categories: { every: { categoryId: id } } },
    select: { name: true },
    take: 21,
  });
  if (orphaned.length > 0) {
    const names = orphaned.slice(0, 20).map((c) => c.name).join(", ");
    const suffix = orphaned.length > 20 ? "+" : "";
    throw new ConflictError(
      `Cannot delete category: ${orphaned.length}${suffix} compan${orphaned.length === 1 ? "y" : "ies"} ` +
        `would be left with no category (${names}). Reassign them to another category first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Companies whose PRIMARY link is this category need a replacement primary
    // once this category's links are gone — every one of them is guaranteed to
    // have another category left (the orphan check above already ruled out the
    // only-this-category case).
    const needsPromotion = await tx.companyCategory.findMany({
      where: { categoryId: id, isPrimary: true },
      select: { companyId: true },
    });

    await tx.companyCategory.deleteMany({ where: { categoryId: id } });

    for (const { companyId } of needsPromotion) {
      const replacement = await tx.companyCategory.findFirst({
        where: { companyId },
        orderBy: { createdAt: "asc" },
      });
      if (replacement) {
        await tx.companyCategory.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      }
    }

    await tx.category.delete({ where: { id } });
  });
}

// Re-exported for callers/tests that want the slug helper alongside the service.
export { slugify };
