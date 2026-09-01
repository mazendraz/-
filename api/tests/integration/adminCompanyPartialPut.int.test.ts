// business-app phase 10: PUT /admin/companies/[id] and PUT /admin/categories/[id]
// are full-representation writes by convention, but a caller CAN send a
// partial body — and until this fix, doing so silently reset any field with
// a Zod `.default(...)` (services/gallery/badges/featured/verified/
// completedProjects on companies; description/isActive/pricingMode on
// categories) to that default, because `.partial()` alone does not stop Zod
// applying a default when a field is omitted. companies.service.ts's
// `update()` (and categories.service.ts's) then write "?? undefined" —
// correct IF the parsed value is really `undefined`, which it wasn't.
//
// Found live while building phase 10's company editor: a PUT with only
// `{ tagline }` reset a real seeded company's 6-image gallery to `[]`,
// verified to false, and completedProjects to 0. Fixed in
// validation/companies.ts and validation/categories.ts by re-declaring
// those specific fields on the update schema with no default. This test
// pins the fix so it can't regress silently again.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { signToken, hashPassword } from "@/lib/auth";
import { PUT as companyPUT } from "@/app/api/admin/companies/[id]/route";
import { PUT as categoryPUT } from "@/app/api/admin/categories/[id]/route";

const tag = `partialput-${Date.now()}`;

function req(url: string, body: unknown, token: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-forwarded-for": "10.55.5.5" },
    body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let categoryId = "";
let companyId = "";
let adminToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      slug: `${tag}-cat`, label: "Partial PUT Cat", description: "d", icon: "home",
      pricingMode: "FIXED_CATALOG", isActive: true,
    },
  });
  categoryId = category.id;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] },
      slug: `${tag}-co`, name: "Partial PUT Co", tagline: "original tagline", about: "a",
      logo: "/l.jpg", cover: "/c.jpg",
      services: ["Painting", "Plumbing"], gallery: ["/g1.jpg", "/g2.jpg", "/g3.jpg"], badges: ["Verified"],
      phone: "0100000007", location: "NC", yearsExperience: 3, responseTime: "1h", verifiedSince: "2024",
      verified: true, completedProjects: 42, featured: true,
    },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: { email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A" },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("PUT /admin/companies/[id] — a partial body must not reset defaulted fields", () => {
  it("changing only tagline leaves gallery/services/badges/verified/completedProjects/featured untouched", async () => {
    const res = await companyPUT(req(`/api/admin/companies/${companyId}`, { tagline: "new tagline" }, adminToken), ctx(companyId));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tagline).toBe("new tagline");
    expect(body.gallery).toEqual(["/g1.jpg", "/g2.jpg", "/g3.jpg"]);
    expect(body.services).toEqual(["Painting", "Plumbing"]);
    expect(body.badges).toEqual(["Verified"]);
    expect(body.verified).toBe(true);
    expect(body.completedProjects).toBe(42);
    expect(body.featured).toBe(true);
  });
});

describe("PUT /admin/categories/[id] — a partial body must not reset defaulted fields", () => {
  it("changing only the icon leaves description/isActive/pricingMode untouched", async () => {
    const res = await categoryPUT(req(`/api/admin/categories/${categoryId}`, { icon: "new-icon" }, adminToken), ctx(categoryId));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.icon).toBe("new-icon");
    expect(body.description).toBe("d");
    expect(body.isActive).toBe(true);
    expect(body.pricingMode).toBe("FIXED_CATALOG");
  });
});
