// Integration tests: invoke real route handlers against the Docker Postgres,
// covering the backend-plan §12 key scenarios. Self-contained fixtures (unique
// slugs/emails) created in beforeAll and torn down in afterAll.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as leadsPOST } from "@/app/api/leads/route";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";
import { GET as providerLeadsGET } from "@/app/api/provider/leads/route";
import { GET as companyGET } from "@/app/api/companies/[slug]/route";
import { DELETE as categoryDELETE } from "@/app/api/admin/categories/[id]/route";
import { POST as reviewPOST } from "@/app/api/admin/companies/[id]/reviews/route";

const tag = `int-${Date.now()}`;

function req(
  url: string,
  opts: { method?: string; body?: unknown; token?: string; ip?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

function companyData(slug: string, status: "ACTIVE" | "SUSPENDED", categoryId: string) {
  return {
    categoryId,
    slug,
    name: `Co ${slug}`,
    tagline: "tag",
    about: "about",
    logo: "/img/l.jpg",
    cover: "/img/c.jpg",
    services: ["S1"],
    gallery: [],
    badges: [],
    phone: "0223456789",
    location: "New Cairo",
    yearsExperience: 3,
    responseTime: "within 2 hours",
    verifiedSince: "2022",
    completedProjects: 5,
    rating: 0,
    reviewCount: 0,
    featured: true,
    verified: false,
    status,
  };
}

let categoryId: string;
let activeSlug: string;
let activeId: string;
let suspendedSlug: string;
let otherId: string;
let adminId: string;
let providerId: string;
let adminToken: string;
let providerToken: string;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Int Cat", description: "", icon: "x", isActive: true },
  });
  categoryId = category.id;

  activeSlug = `${tag}-active`;
  suspendedSlug = `${tag}-susp`;
  const active = await prisma.company.create({ data: companyData(activeSlug, "ACTIVE", categoryId) });
  const suspended = await prisma.company.create({ data: companyData(suspendedSlug, "SUSPENDED", categoryId) });
  const other = await prisma.company.create({ data: companyData(`${tag}-other`, "ACTIVE", categoryId) });
  activeId = active.id;
  otherId = other.id;

  const passwordHash = await hashPassword("Secret123!");
  const admin = await prisma.user.create({
    data: { name: "Int Admin", email: `${tag}-admin@test`, passwordHash, role: "ADMIN" },
  });
  const provider = await prisma.user.create({
    data: { name: "Int Prov", email: `${tag}-prov@test`, passwordHash, role: "PROVIDER", companyId: activeId },
  });
  adminId = admin.id;
  providerId = provider.id;
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId: activeId });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [adminId, providerId] } } });
  await prisma.company.deleteMany({ where: { categoryId } });
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.$disconnect();
});

function leadBody(companySlug: string, companyName = "X") {
  return {
    companySlug,
    companyName,
    service: "Design",
    name: "Customer One",
    phone: "01012345678",
    district: "R7",
    budget: "EGP 100k",
    description: "I need a full fit-out for my apartment please.",
  };
}

describe("POST /leads", () => {
  it("creates a lead for an ACTIVE company (201, refNumber, epoch createdAt)", async () => {
    const res = await leadsPOST(req("/api/leads", { method: "POST", body: leadBody(activeSlug), ip: "10.0.0.1" }));
    expect(res.status).toBe(201);
    const lead = await res.json();
    expect(lead.refNumber).toMatch(/^AA-\d{8}-[A-Z0-9]{4}$/);
    expect(lead.status).toBe("New");
    expect(typeof lead.createdAt).toBe("number");
    expect(lead.companySlug).toBe(activeSlug);
  });

  it("rejects submission to a SUSPENDED company (404)", async () => {
    const res = await leadsPOST(req("/api/leads", { method: "POST", body: leadBody(suspendedSlug), ip: "10.0.0.2" }));
    expect(res.status).toBe(404);
  });

  it("trips the rate limit after 5 requests/min/IP (429)", async () => {
    const ip = "10.0.0.99";
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await leadsPOST(req("/api/leads", { method: "POST", body: leadBody(activeSlug), ip }));
      codes.push(res.status);
    }
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});

describe("provider lead access", () => {
  it("lists only the provider's own company leads, and blocks cross-company PATCH (403)", async () => {
    // A lead on the OTHER company (created via service directly to avoid rate limit).
    const otherLead = await prisma.lead.create({
      data: {
        companyId: otherId,
        refNumber: `AA-20260101-${tag.slice(-4).toUpperCase()}X`,
        service: "S",
        customerName: "C",
        phone: "01012345678",
        district: "R7",
        budget: "x",
        description: "other company lead",
        status: "NEW",
      },
    });

    const listRes = await providerLeadsGET(req("/api/provider/leads", { token: providerToken }), undefined as never);
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed.data.every((l: { companySlug: string }) => l.companySlug === activeSlug)).toBe(true);

    const patchRes = await leadPATCH(
      req(`/api/leads/${otherLead.id}`, { method: "PATCH", body: { status: "Contacted" }, token: providerToken }),
      ctx({ id: otherLead.id }),
    );
    expect(patchRes.status).toBe(403);
  });
});

describe("admin catalog rules", () => {
  it("refuses to delete a non-empty category (409 CONFLICT)", async () => {
    const res = await categoryDELETE(
      req(`/api/admin/categories/${categoryId}`, { method: "DELETE", token: adminToken }),
      ctx({ id: categoryId }),
    );
    expect(res.status).toBe(409);
  });

  it("recomputes company rating/reviewCount when a review is added", async () => {
    await reviewPOST(
      req(`/api/admin/companies/${activeId}/reviews`, {
        method: "POST",
        body: { author: "Rev1", rating: 4, text: "good", date: "May 2026", district: "R7" },
        token: adminToken,
      }),
      ctx({ id: activeId }),
    );
    await reviewPOST(
      req(`/api/admin/companies/${activeId}/reviews`, {
        method: "POST",
        body: { author: "Rev2", rating: 5, text: "great", date: "May 2026", district: "R7" },
        token: adminToken,
      }),
      ctx({ id: activeId }),
    );

    const res = await companyGET(req(`/api/companies/${activeSlug}`), ctx({ slug: activeSlug }));
    const company = await res.json();
    expect(company.reviewCount).toBe(2);
    expect(company.rating).toBe(4.5); // (4 + 5) / 2
  });
});
