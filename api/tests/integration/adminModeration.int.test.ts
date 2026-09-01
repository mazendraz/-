// business-app phase 9 (admin moderation queue): the five queues, against a
// real database. Covers the two flows the plan doc calls out explicitly —
// approving a change request applies the edit live, and approving a project
// flips its status — plus the createdAt fields added to the admin project/
// review payloads (serializeProjectAdmin/serializeReviewAdmin) so the
// mobile queue can show how long an item has waited, and a 403 sweep.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as changeRequestsGET } from "@/app/api/admin/change-requests/route";
import { PATCH as changeRequestPATCH } from "@/app/api/admin/change-requests/[id]/route";
import { GET as projectsGET } from "@/app/api/admin/projects/route";
import { PATCH as projectPATCH } from "@/app/api/admin/projects/[id]/route";
import { GET as reviewsGET } from "@/app/api/admin/reviews/route";
import { PATCH as reviewPATCH } from "@/app/api/admin/reviews/[id]/route";
import { GET as siteReviewsGET } from "@/app/api/admin/site-reviews/route";
import { GET as feedbackGET } from "@/app/api/admin/feedback/route";

const tag = `modq-${Date.now()}`;

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  const headers = new Headers({ "x-forwarded-for": "10.44.1.1" });
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let categoryId = "";
let companyId = "";
let adminToken = "";
let providerToken = "";
let changeRequestId = "";
let projectId = "";
let reviewId = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Moderation Q", description: "d", icon: "home" },
  });
  categoryId = category.id;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug: `${tag}-co`, name: "Moderation Co",
      tagline: "old tagline", about: "a", logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000006", location: "NC", yearsExperience: 1, responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: { email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A" },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });

  const provider = await prisma.user.create({
    data: { email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"), role: "PROVIDER", companyId, isActive: true, name: "P" },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });

  const cr = await prisma.changeRequest.create({
    data: {
      companyId,
      entity: "COMPANY",
      entityId: companyId,
      operation: "UPDATE",
      submittedById: provider.id,
      changes: { tagline: "new tagline" },
      snapshot: { tagline: "old tagline" },
      status: "PENDING",
    },
  });
  changeRequestId = cr.id;

  const project = await prisma.project.create({
    data: { companyId, title: "Test Project", img: "/p.jpg", description: "d", year: "2026", status: "PENDING" },
  });
  projectId = project.id;

  const review = await prisma.review.create({
    data: { companyId, author: "Reviewer", avatar: "R", rating: 5, text: "great", date: "2026", district: "R7", verified: true, approved: false },
  });
  reviewId = review.id;
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { companyId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.changeRequest.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("change requests", () => {
  it("approving applies the edit to the live company", async () => {
    const res = await changeRequestPATCH(
      req(`/api/admin/change-requests/${changeRequestId}`, { method: "PATCH", token: adminToken, body: { action: "approve" } }),
      ctx(changeRequestId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.request.status).toBe("APPROVED");
    expect(body.applied).toContain("tagline");

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { tagline: true } });
    expect(company?.tagline).toBe("new tagline");
  });
});

describe("projects", () => {
  it("lists PENDING projects with an admin-only createdAt", async () => {
    const res = await projectsGET(req("/api/admin/projects", { token: adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.data.find((p: { id: string }) => p.id === projectId);
    expect(row).toBeDefined();
    expect(typeof row.createdAt).toBe("number");
    expect(row.companyName).toBe("Moderation Co");
  });

  it("approving flips status to APPROVED", async () => {
    const res = await projectPATCH(
      req(`/api/admin/projects/${projectId}`, { method: "PATCH", token: adminToken, body: { status: "APPROVED" } }),
      ctx(projectId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("APPROVED");

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
    expect(project?.status).toBe("APPROVED");
  });
});

describe("reviews", () => {
  it("lists pending reviews with an admin-only createdAt", async () => {
    const res = await reviewsGET(req("/api/admin/reviews?status=pending", { token: adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.data.find((r: { id: string }) => r.id === reviewId);
    expect(row).toBeDefined();
    expect(typeof row.createdAt).toBe("number");
  });

  it("approving sets approved=true", async () => {
    const res = await reviewPATCH(
      req(`/api/admin/reviews/${reviewId}`, { method: "PATCH", token: adminToken, body: { approved: true } }),
      ctx(reviewId),
    );
    expect(res.status).toBe(200);
    const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { approved: true } });
    expect(review?.approved).toBe(true);
  });
});

describe("a PROVIDER token is 403 on every moderation route", () => {
  it("change requests", async () => {
    expect((await changeRequestsGET(req("/api/admin/change-requests", { token: providerToken }))).status).toBe(403);
  });
  it("projects", async () => {
    expect((await projectsGET(req("/api/admin/projects", { token: providerToken }))).status).toBe(403);
  });
  it("reviews", async () => {
    expect((await reviewsGET(req("/api/admin/reviews", { token: providerToken }))).status).toBe(403);
  });
  it("site reviews", async () => {
    expect((await siteReviewsGET(req("/api/admin/site-reviews", { token: providerToken }))).status).toBe(403);
  });
  it("feedback", async () => {
    expect((await feedbackGET(req("/api/admin/feedback", { token: providerToken }))).status).toBe(403);
  });
});
