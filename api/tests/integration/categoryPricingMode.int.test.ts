// Phase 9 — the category pricing mode CONTRACT: it round-trips through the
// admin CRUD, defaults to QUOTE_ONLY for every category that predates it, and
// the derived ApiCompany.categoryPricingMode / ApiAdminCategory
// publishedOfferingCompanyCount fields are computed correctly. The actual
// write-path ENFORCEMENT is covered in offerings.int.test.ts — this file is
// about the data, not the gate.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as categoriesGET } from "@/app/api/categories/route";
import { GET as adminCategoriesGET } from "@/app/api/admin/categories/route";
import { PUT as adminCategoryPUT } from "@/app/api/admin/categories/[id]/route";
import { GET as publicCompanyGET } from "@/app/api/companies/[slug]/route";

const tag = `catmode-${Date.now()}`;

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

let categoryId = "";
let categorySlug = "";
let companyId = "";
let companySlug = "";
let adminToken = "";

beforeAll(async () => {
  categorySlug = `${tag}-cat`;
  // pricingMode omitted on purpose — this is the "existing category" case,
  // and the schema default is exactly what's under test.
  const category = await prisma.category.create({
    data: { slug: categorySlug, label: "Cat Mode", description: "d", icon: "home" },
  });
  categoryId = category.id;

  companySlug = `${tag}-co`;
  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug: companySlug, name: "Cat Mode Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000002", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.offering.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("defaults", () => {
  it("is QUOTE_ONLY on the public categories list for a category that predates this feature", async () => {
    const rows = await (await categoriesGET()).json();
    const row = rows.find((c: { slug: string }) => c.slug === categorySlug);
    expect(row.pricingMode).toBe("QUOTE_ONLY");
  });

  it("is QUOTE_ONLY on a company's ApiCompany.categoryPricingMode", async () => {
    const company = await (await publicCompanyGET(req(`/api/companies/${companySlug}`), ctx({ slug: companySlug }))).json();
    expect(company.categoryPricingMode).toBe("QUOTE_ONLY");
  });

  it("admin list shows 0 companies with published offerings for a fresh category", async () => {
    const rows = await (await adminCategoriesGET(req("/api/admin/categories", { token: adminToken }), undefined as never)).json();
    const row = rows.find((c: { id: string }) => c.id === categoryId);
    expect(row.pricingMode).toBe("QUOTE_ONLY");
    expect(row.publishedOfferingCompanyCount).toBe(0);
  });
});

describe("admin round-trip", () => {
  it("PUT /admin/categories/:id persists a pricingMode switch", async () => {
    const res = await adminCategoryPUT(
      req(`/api/admin/categories/${categoryId}`, {
        method: "PUT", token: adminToken, body: { pricingMode: "FIXED_CATALOG" },
      }),
      ctx({ id: categoryId }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).pricingMode).toBe("FIXED_CATALOG");

    const company = await (await publicCompanyGET(req(`/api/companies/${companySlug}`), ctx({ slug: companySlug }))).json();
    expect(company.categoryPricingMode).toBe("FIXED_CATALOG");
  });

  it("counts a company that would LOSE catalog access if switched off, and switching off never deletes the Offering itself", async () => {
    // Written directly — this file is about the data shape, not the write gate
    // (already covered in offerings.int.test.ts).
    const offering = await prisma.offering.create({
      data: { companyId, name: "Priced thing", pricingModel: "RANGE", priceMin: 100, priceMax: 200, isPublished: true },
    });

    // publishedOfferingCompanyCount means "companies who'd lose catalog access
    // if THIS category's FIXED_CATALOG were switched off" (companies.service.ts
    // companiesSolelyEnabledByCategory) — this company has only this one
    // FIXED_CATALOG category, so it counts.
    const withCatalog = await (await adminCategoriesGET(req("/api/admin/categories", { token: adminToken }), undefined as never)).json();
    expect(withCatalog.find((c: { id: string }) => c.id === categoryId).publishedOfferingCompanyCount).toBe(1);

    // Switching the mode off must not delete anything that already exists...
    await adminCategoryPUT(
      req(`/api/admin/categories/${categoryId}`, {
        method: "PUT", token: adminToken, body: { pricingMode: "QUOTE_ONLY" },
      }),
      ctx({ id: categoryId }),
    );
    expect(await prisma.offering.findUnique({ where: { id: offering.id } })).not.toBeNull();

    // ...but the count itself is a forward-looking "would lose access" signal,
    // not a historical publish count — once the category IS QUOTE_ONLY, nothing
    // could lose access to it anymore, so it correctly reads 0.
    const afterSwitch = await (await adminCategoriesGET(req("/api/admin/categories", { token: adminToken }), undefined as never)).json();
    const row = afterSwitch.find((c: { id: string }) => c.id === categoryId);
    expect(row.pricingMode).toBe("QUOTE_ONLY");
    expect(row.publishedOfferingCompanyCount).toBe(0);
  });
});
