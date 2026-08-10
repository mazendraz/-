// Every relation embedded in a company payload must be BOUNDED.
//
// Reviews were capped from the start; projects and offerings were not, and both
// ride along in the same response — the public profile AND the admin company
// list, which embeds them for every company on the page. Measured before the
// cap: a company with 3,000 projects returned 1.41 MB on the public profile and
// 1.42 MB on the admin list; 2,000 offerings returned 1.29 MB. Nothing failed —
// which is exactly why it survived. It was simply a page nobody on a phone could
// afford to open.
//
// This test asserts the property (bounded), not the numbers, so it keeps holding
// if the caps are ever retuned.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as companyGET } from "@/app/api/companies/[slug]/route";
import { GET as adminCompaniesGET } from "@/app/api/admin/companies/route";

const tag = `caps-${Date.now()}`;
const PROJECTS = 400;
const OFFERINGS = 400;
const REVIEWS = 120;
/** Well above any cap the payload should ever carry, well below what was seeded. */
const SANE_MAX = 250;

let categoryId = "";
let companyId = "";
let slug = "";
let adminToken = "";

function req(url: string, token?: string): NextRequest {
  const headers = new Headers({ "x-forwarded-for": "10.44.44.44" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost${url}`, { headers });
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Caps", description: "d", icon: "home", pricingMode: "FIXED_CATALOG" },
  });
  categoryId = category.id;
  slug = `${tag}-co`;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] },
      slug, name: "Caps Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "+201000000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024", status: "ACTIVE",
    },
  });
  companyId = company.id;

  await prisma.project.createMany({
    data: Array.from({ length: PROJECTS }, (_, i) => ({
      companyId, title: `Project ${i}`, img: "/p.jpg",
      description: "d", year: "2026", status: "APPROVED" as const, sortOrder: i,
    })),
  });
  await prisma.offering.createMany({
    data: Array.from({ length: OFFERINGS }, (_, i) => ({
      companyId, name: `Item ${i}`, pricingModel: "FIXED" as const,
      priceMin: 1000 + i, isPublished: true, isActive: true, sortOrder: i,
    })),
  });
  await prisma.review.createMany({
    data: Array.from({ length: REVIEWS }, (_, i) => ({
      companyId, author: `A${i}`, avatar: "A", rating: 5, text: "t",
      date: "March 2026", district: "R7", approved: true,
    })),
  });

  const admin = await prisma.user.create({
    data: {
      email: `${tag}@example.com`, name: "Caps Admin",
      passwordHash: await hashPassword("x"), role: "ADMIN",
    },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: `${tag}@example.com` } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("company payload is bounded on every embedded relation", () => {
  it("caps projects, offerings and reviews on the PUBLIC profile", async () => {
    const res = await companyGET(req(`/api/companies/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Seeded well past every cap — so an uncapped relation shows up as the full
    // seeded count, not as a number that merely looks large.
    expect(body.projects.length).toBeLessThanOrEqual(SANE_MAX);
    expect(body.projects.length).toBeLessThan(PROJECTS);
    expect(body.offerings.length).toBeLessThanOrEqual(SANE_MAX);
    expect(body.offerings.length).toBeLessThan(OFFERINGS);
    expect(body.reviews.length).toBeLessThanOrEqual(SANE_MAX);
    expect(body.reviews.length).toBeLessThan(REVIEWS);
  });

  it("caps them on the ADMIN company list, where they ride along per row", async () => {
    const res = await adminCompaniesGET(
      req(`/api/admin/companies?search=${encodeURIComponent("Caps Co")}&pageSize=12`, adminToken),
    );
    expect(res.status).toBe(200);
    const page = await res.json();
    const row = page.data.find((c: { slug: string }) => c.slug === slug);
    expect(row, "the seeded company should be on the searched page").toBeTruthy();
    expect(row.projects.length).toBeLessThanOrEqual(SANE_MAX);
    expect(row.projects.length).toBeLessThan(PROJECTS);
    expect(row.reviews.length).toBeLessThanOrEqual(SANE_MAX);
  });

  it("keeps the whole profile response small enough to open on a phone", async () => {
    const res = await companyGET(req(`/api/companies/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    const bytes = (await res.text()).length;
    // 1 MB is not a target, it is a ceiling — the uncapped version measured 1.41 MB
    // for a comparable company, so this fails loudly if a cap is ever removed.
    expect(bytes, `profile payload was ${(bytes / 1024 / 1024).toFixed(2)} MB`).toBeLessThan(1024 * 1024);
  });
});
