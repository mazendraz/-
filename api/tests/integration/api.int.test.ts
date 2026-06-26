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
import { GET as companiesListGET } from "@/app/api/companies/route";
import { DELETE as categoryDELETE } from "@/app/api/admin/categories/[id]/route";
import { POST as reviewPOST } from "@/app/api/admin/companies/[id]/reviews/route";
import { POST as customerReviewPOST } from "@/app/api/reviews/route";
import { PATCH as companyStatusPATCH } from "@/app/api/admin/companies/[id]/status/route";
import { GET as auditLogsGET } from "@/app/api/admin/audit-logs/route";
import { GET as leadTrackGET } from "@/app/api/leads/track/route";

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
  // Audit rows aren't FK-linked (append-only), so clean this run's by actor.
  await prisma.auditLog.deleteMany({ where: { actorEmail: `${tag}-admin@test` } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, providerId] } } });
  await prisma.company.deleteMany({ where: { categoryId } });
  await prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.$disconnect();
});

function leadBody(
  companySlug: string,
  companyName = "X",
  extra: Partial<Record<string, string>> = {},
) {
  return {
    companySlug,
    companyName,
    service: "Design",
    name: "Customer One",
    phone: "01012345678",
    district: "R7",
    budget: "EGP 100k",
    description: "I need a full fit-out for my apartment please.",
    ...extra,
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
      // Unique service per request so the de-dup guard doesn't intervene — this
      // test isolates rate-limit behavior, not de-dup.
      const res = await leadsPOST(
        req("/api/leads", { method: "POST", body: leadBody(activeSlug, "X", { service: `Design ${i}` }), ip }),
      );
      codes.push(res.status);
    }
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("rejects an identical re-submit within the de-dup window (409)", async () => {
    // Distinct phone/service/IP so it's independent of the other tests' leads and
    // the per-IP rate limit. Same body twice → first 201, second 409.
    const body = leadBody(activeSlug, "X", { phone: "01099000011", service: "Dedup Job" });
    const first = await leadsPOST(req("/api/leads", { method: "POST", body, ip: "10.0.50.1" }));
    expect(first.status).toBe(201);
    const second = await leadsPOST(req("/api/leads", { method: "POST", body, ip: "10.0.50.2" }));
    expect(second.status).toBe(409);
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

  it("public list returns lightweight cards (no reviews/projects); detail returns them", async () => {
    // The list endpoint must NOT embed reviews/projects (scale guard) but keeps
    // the aggregate counts cards display; the detail route returns the full arrays.
    const listRes = await companiesListGET(req(`/api/companies?pageSize=100`));
    const listed = (await listRes.json()).data as Array<{
      slug: string; reviews: unknown[]; projects: unknown[]; reviewCount: number;
    }>;
    const card = listed.find((c) => c.slug === activeSlug)!;
    expect(card.reviews).toEqual([]);
    expect(card.projects).toEqual([]);
    expect(card.reviewCount).toBe(2); // aggregate count still present

    const detail = await (await companyGET(req(`/api/companies/${activeSlug}`), ctx({ slug: activeSlug }))).json();
    expect(detail.reviews).toHaveLength(2);
  });
});

describe("lead tracking (token replaces phone as the secret)", () => {
  it("tracks by the issued token; the phone no longer works once a token exists", async () => {
    const createRes = await leadsPOST(
      req("/api/leads", { method: "POST", body: leadBody(activeSlug, "X", { service: "Token Job", phone: "01077000022" }), ip: "10.0.77.1" }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(typeof created.trackingToken).toBe("string");
    expect(created.trackingToken.length).toBeGreaterThan(20);

    // Correct token → 200.
    const okRes = await leadTrackGET(
      req(`/api/leads/track?ref=${created.refNumber}&token=${encodeURIComponent(created.trackingToken)}`, { ip: "10.0.77.2" }),
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).refNumber).toBe(created.refNumber);

    // Correct phone but the lead has a token → phone fallback is disabled → 404.
    const phoneRes = await leadTrackGET(
      req(`/api/leads/track?ref=${created.refNumber}&phone=01077000022`, { ip: "10.0.77.3" }),
    );
    expect(phoneRes.status).toBe(404);

    // Wrong token → 404.
    const badRes = await leadTrackGET(
      req(`/api/leads/track?ref=${created.refNumber}&token=not-the-real-token`, { ip: "10.0.77.4" }),
    );
    expect(badRes.status).toBe(404);
  });
});

describe("audit log", () => {
  it("records a company.status change and exposes it via /admin/audit-logs", async () => {
    const company = await prisma.company.create({
      data: companyData(`${tag}-audit`, "ACTIVE", categoryId),
    });

    const patchRes = await companyStatusPATCH(
      req(`/api/admin/companies/${company.id}/status`, {
        method: "PATCH", body: { status: "SUSPENDED" }, token: adminToken,
      }),
      ctx({ id: company.id }),
    );
    expect(patchRes.status).toBe(200);

    const logsRes = await auditLogsGET(
      req(`/api/admin/audit-logs?entity=Company&pageSize=200`, { token: adminToken }),
      undefined as never,
    );
    expect(logsRes.status).toBe(200);
    const logs = (await logsRes.json()).data as Array<{
      action: string; entityId: string; actorEmail: string; meta: { status?: string } | null;
    }>;
    const entry = logs.find((l) => l.entityId === company.id && l.action === "company.status");
    expect(entry).toBeTruthy();
    expect(entry!.meta?.status).toBe("SUSPENDED");
    expect(entry!.actorEmail).toBe(`${tag}-admin@test`);
  });

  it("denies the audit log to providers (403)", async () => {
    const res = await auditLogsGET(req(`/api/admin/audit-logs`, { token: providerToken }), undefined as never);
    expect(res.status).toBe(403);
  });
});

describe("customer review (one per completed lead)", () => {
  // Dedicated company so the verified review doesn't pollute activeId's aggregates
  // (and so test ordering can't affect the rating assertion above).
  it("creates exactly one verified review under concurrent submits (no double-review race)", async () => {
    const company = await prisma.company.create({
      data: companyData(`${tag}-revrace`, "ACTIVE", categoryId),
    });
    const phone = "01080000001";
    const lead = await prisma.lead.create({
      data: {
        companyId: company.id,
        refNumber: `AA-20260626-${tag.slice(-4).toUpperCase()}`,
        service: "S",
        customerName: "Race Tester",
        phone,
        district: "R7",
        budget: "x",
        description: "completed job to review",
        status: "COMPLETED",
      },
    });

    const body = { ref: lead.refNumber, phone, rating: 5, text: "excellent work" };
    // Two concurrent submits for the SAME lead, distinct IPs (so neither trips the
    // per-IP rate limit). The atomic claim must let exactly one through.
    const [a, b] = await Promise.all([
      customerReviewPOST(req("/api/reviews", { method: "POST", body, ip: "203.0.113.50" })),
      customerReviewPOST(req("/api/reviews", { method: "POST", body, ip: "203.0.113.51" })),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);

    // The DB holds exactly one review, linked to the lead, and the lead is stamped.
    const reviews = await prisma.review.findMany({ where: { leadId: lead.id } });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.verified).toBe(true);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after!.reviewedAt).not.toBeNull();

    // A later attempt on the now-reviewed lead is rejected (fast-path 409).
    const again = await customerReviewPOST(
      req("/api/reviews", { method: "POST", body, ip: "203.0.113.52" }),
    );
    expect(again.status).toBe(409);
  });
});
