// Company <-> Category: one-to-many -> many-to-many. A company can now belong
// to several categories at once (e.g. "Interior Finishing" AND "Landscaping")
// without a duplicate company record. This exercises the full journey end to
// end: create a company in 2 categories -> it appears on BOTH category pages
// -> search finds it exactly once -> updating categories (replace-all,
// re-primary) -> the Offerings catalog gate is a permissive union over every
// linked category -> deleting a category never deletes a company, only the
// link, and is blocked if it would leave any company with zero categories.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as adminCompaniesPOST } from "@/app/api/admin/companies/route";
import { PUT as adminCompanyPUT } from "@/app/api/admin/companies/[id]/route";
import { GET as categoryCompaniesGET } from "@/app/api/categories/[slug]/companies/route";
import { GET as publicCompaniesGET } from "@/app/api/companies/route";
import { GET as adminCategoriesGET, POST as adminCategoriesPOST } from "@/app/api/admin/categories/route";
import { DELETE as adminCategoryDELETE } from "@/app/api/admin/categories/[id]/route";
import { POST as adminOfferingsPOST } from "@/app/api/admin/companies/[id]/offerings/route";

const tag = `catm2m-${Date.now()}`;

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

const baseCompanyFields = {
  tagline: "t", about: "a", logo: "/l.jpg", cover: "/c.jpg",
  services: [], gallery: [], badges: [], phone: "0100000000", location: "NC",
  yearsExperience: 1, responseTime: "1h", verifiedSince: "2024",
};

let interiorId = "";
let interiorSlug = "";
let landscapeId = "";
let landscapeSlug = "";
let adminToken = "";
const createdCompanyIds: string[] = [];
// Categories created mid-test that must outlive their `it()` block (e.g. a
// rejected delete leaves the category AND its company link both in place) —
// collected here instead of deleted inline, so cleanup can always remove the
// companies (and their CompanyCategory rows, via onDelete: Cascade) BEFORE the
// categories (onDelete: Restrict — deleting a still-linked category 404s/fails).
const createdCategoryIds: string[] = [];

beforeAll(async () => {
  interiorSlug = `${tag}-interior`;
  landscapeSlug = `${tag}-landscape`;
  const interior = await prisma.category.create({
    data: { slug: interiorSlug, label: "Interior M2M", description: "d", icon: "home", pricingMode: "FIXED_CATALOG" },
  });
  interiorId = interior.id;
  const landscape = await prisma.category.create({
    data: { slug: landscapeSlug, label: "Landscape M2M", description: "d", icon: "park" },
  });
  landscapeId = landscape.id;

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  // Order matters: companies (and their CompanyCategory links) must go before
  // categories, or a still-linked category's onDelete: Restrict FK blocks it.
  await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.category.deleteMany({ where: { id: { in: [interiorId, landscapeId, ...createdCategoryIds] } } });
});

describe("a company in multiple categories", () => {
  let companyId = "";

  it("POST /admin/companies with 2 categoryIds creates one company linked to both", async () => {
    const res = await adminCompaniesPOST(
      req("/api/admin/companies", {
        method: "POST", token: adminToken,
        body: {
          ...baseCompanyFields, name: "Dual Category Co",
          categoryIds: [interiorId, landscapeId], primaryCategoryId: interiorId,
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    companyId = body.id;
    createdCompanyIds.push(companyId);

    expect(body.category).toBe(interiorSlug); // primary
    expect(body.categories).toHaveLength(2);
    expect(body.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(
      [interiorSlug, landscapeSlug].sort(),
    );
    expect(body.categories.find((c: { slug: string }) => c.slug === interiorSlug).isPrimary).toBe(true);
    expect(body.categories.find((c: { slug: string }) => c.slug === landscapeSlug).isPrimary).toBe(false);

    // Exactly one Company row and exactly two junction rows — no duplicate record.
    expect(await prisma.company.count({ where: { id: companyId } })).toBe(1);
    expect(await prisma.companyCategory.count({ where: { companyId } })).toBe(2);
  });

  it("appears on BOTH category pages, not duplicated within either", async () => {
    const interiorPage = await (
      await categoryCompaniesGET(req(`/api/categories/${interiorSlug}/companies`), ctx({ slug: interiorSlug }))
    ).json();
    const landscapePage = await (
      await categoryCompaniesGET(req(`/api/categories/${landscapeSlug}/companies`), ctx({ slug: landscapeSlug }))
    ).json();

    expect(interiorPage.data.filter((c: { id: string }) => c.id === companyId)).toHaveLength(1);
    expect(landscapePage.data.filter((c: { id: string }) => c.id === companyId)).toHaveLength(1);
  });

  it("a global search finds it exactly once, not once per category", async () => {
    const res = await publicCompaniesGET(req(`/api/companies?search=${encodeURIComponent("Dual Category Co")}`));
    const body = await res.json();
    expect(body.data.filter((c: { id: string }) => c.id === companyId)).toHaveLength(1);
  });

  it("PUT replaces the category set and can move the primary", async () => {
    const res = await adminCompanyPUT(
      req(`/api/admin/companies/${companyId}`, {
        method: "PUT", token: adminToken,
        body: { categoryIds: [landscapeId], primaryCategoryId: landscapeId },
      }),
      ctx({ id: companyId }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(1);
    expect(body.category).toBe(landscapeSlug);

    // It dropped off the interior category page entirely.
    const interiorPage = await (
      await categoryCompaniesGET(req(`/api/categories/${interiorSlug}/companies`), ctx({ slug: interiorSlug }))
    ).json();
    expect(interiorPage.data.some((c: { id: string }) => c.id === companyId)).toBe(false);

    // Restore both for the rest of the suite.
    await adminCompanyPUT(
      req(`/api/admin/companies/${companyId}`, {
        method: "PUT", token: adminToken,
        body: { categoryIds: [interiorId, landscapeId], primaryCategoryId: interiorId },
      }),
      ctx({ id: companyId }),
    );
  });

  it("gets the Offerings catalog via ANY linked FIXED_CATALOG category, even when the primary is QUOTE_ONLY", async () => {
    // Landscape (QUOTE_ONLY) is primary; interior (FIXED_CATALOG) is secondary.
    await adminCompanyPUT(
      req(`/api/admin/companies/${companyId}`, {
        method: "PUT", token: adminToken,
        body: { categoryIds: [interiorId, landscapeId], primaryCategoryId: landscapeId },
      }),
      ctx({ id: companyId }),
    );
    const res = await adminOfferingsPOST(
      req(`/api/admin/companies/${companyId}/offerings`, {
        method: "POST", token: adminToken,
        body: { name: "Full finishing", pricingModel: "RANGE", priceMin: 10000, priceMax: 20000 },
      }),
      ctx({ id: companyId }),
    );
    expect(res.status).toBe(201);
  });

  it("POST /admin/companies rejects an empty categoryIds array", async () => {
    const res = await adminCompaniesPOST(
      req("/api/admin/companies", {
        method: "POST", token: adminToken,
        body: { ...baseCompanyFields, name: "No Category Co", categoryIds: [] },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("deleting a category never deletes a company", () => {
  it("is blocked when a company's ONLY category is the one being deleted", async () => {
    const soloSlug = `${tag}-solo-cat`;
    const solo = await prisma.category.create({
      data: { slug: soloSlug, label: "Solo Cat", description: "d", icon: "home" },
    });
    const company = await prisma.company.create({
      data: {
        ...baseCompanyFields, name: "Solo Co", slug: `${tag}-solo-co`,
        categories: { create: [{ categoryId: solo.id, isPrimary: true }] },
      },
    });
    createdCompanyIds.push(company.id);

    const res = await adminCategoryDELETE(
      req(`/api/admin/categories/${solo.id}`, { method: "DELETE", token: adminToken }),
      ctx({ id: solo.id }),
    );
    expect(res.status).toBe(409);

    // The category and the link both survive the rejected delete.
    expect(await prisma.category.findUnique({ where: { id: solo.id } })).not.toBeNull();
    expect(await prisma.companyCategory.count({ where: { companyId: company.id } })).toBe(1);

    // Still linked to `company` — can't delete it here (onDelete: Restrict);
    // the file-level afterAll deletes the company first, then this category.
    createdCategoryIds.push(solo.id);
  });

  it("succeeds for a multi-category company, only removing that link and re-promoting primary if needed", async () => {
    const extraSlug = `${tag}-extra-cat`;
    const extra = await prisma.category.create({
      data: { slug: extraSlug, label: "Extra Cat", description: "d", icon: "home" },
    });
    const company = await prisma.company.create({
      data: {
        ...baseCompanyFields, name: "Multi Co", slug: `${tag}-multi-co`,
        categories: {
          create: [
            { categoryId: extra.id, isPrimary: true },
            { categoryId: landscapeId, isPrimary: false },
          ],
        },
      },
    });
    createdCompanyIds.push(company.id);

    const res = await adminCategoryDELETE(
      req(`/api/admin/categories/${extra.id}`, { method: "DELETE", token: adminToken }),
      ctx({ id: extra.id }),
    );
    expect(res.status).toBe(204);

    // The company survives, with exactly its remaining category, now primary.
    const remaining = await prisma.companyCategory.findMany({ where: { companyId: company.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].categoryId).toBe(landscapeId);
    expect(remaining[0].isPrimary).toBe(true);
    expect(await prisma.company.findUnique({ where: { id: company.id } })).not.toBeNull();
  });
});

describe("admin category list", () => {
  it("publishedOfferingCompanyCount only counts companies with no OTHER FIXED_CATALOG category", async () => {
    const soleSlug = `${tag}-sole-cat`;
    const sole = await prisma.category.create({
      data: { slug: soleSlug, label: "Sole Cat", description: "d", icon: "home", pricingMode: "FIXED_CATALOG" },
    });
    // Company A: ONLY this FIXED_CATALOG category -> would lose access, counts.
    const companyA = await prisma.company.create({
      data: {
        ...baseCompanyFields, name: "Sole Enabled Co", slug: `${tag}-sole-a`,
        categories: { create: [{ categoryId: sole.id, isPrimary: true }] },
        offerings: { create: { name: "x", pricingModel: "RANGE", priceMin: 1, priceMax: 2, isPublished: true } },
      },
    });
    // Company B: this FIXED_CATALOG category AND another FIXED_CATALOG one
    // (interior) -> would NOT lose access, does not count.
    const companyB = await prisma.company.create({
      data: {
        ...baseCompanyFields, name: "Double Enabled Co", slug: `${tag}-sole-b`,
        categories: {
          create: [
            { categoryId: sole.id, isPrimary: true },
            { categoryId: interiorId, isPrimary: false },
          ],
        },
        offerings: { create: { name: "x", pricingModel: "RANGE", priceMin: 1, priceMax: 2, isPublished: true } },
      },
    });
    createdCompanyIds.push(companyA.id, companyB.id);

    const rows = await (await adminCategoriesGET(req("/api/admin/categories", { token: adminToken }), undefined as never)).json();
    expect(rows.find((c: { id: string }) => c.id === sole.id).publishedOfferingCompanyCount).toBe(1);

    // Still linked to companyA/companyB — can't delete it here (onDelete:
    // Restrict); the file-level afterAll deletes the companies first.
    createdCategoryIds.push(sole.id);
  });
});

describe("category creation smoke test", () => {
  it("POST /admin/categories still works unaffected by the schema change", async () => {
    const res = await adminCategoriesPOST(
      req("/api/admin/categories", {
        method: "POST", token: adminToken,
        body: { label: `${tag} Fresh Cat`, description: "d", icon: "home" },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.publishedOfferingCompanyCount).toBe(0);
    await prisma.category.delete({ where: { id: body.id } }).catch(() => {});
  });
});
