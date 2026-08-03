// Integration tests for the change-request approval flow, against real Postgres.
// The unit tests cover the allowlist and conflict maths; these cover the parts
// that only exist in the database: the partial unique index, merge-inside-a-
// transaction, and "does the public profile actually stay unchanged".
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as submitPOST, GET as providerListGET } from "@/app/api/provider/change-requests/route";
import { DELETE as cancelDELETE } from "@/app/api/provider/change-requests/[id]/route";
import { GET as profileGET } from "@/app/api/provider/profile/route";
import { GET as adminListGET } from "@/app/api/admin/change-requests/route";
import { GET as adminDetailGET, PATCH as adminReviewPATCH } from "@/app/api/admin/change-requests/[id]/route";
import { GET as publicCompanyGET } from "@/app/api/companies/[slug]/route";

const tag = `cr-${Date.now()}`;

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

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

let categoryId = "";
let companyId = "";
let slug = "";
let providerToken = "";
let adminToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;
  slug = `${tag}-co`;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug, name: "Original Name", tagline: "Original tagline",
      about: "Original about", logo: "/img/l.jpg", cover: "/img/c.jpg",
      services: ["S1"], gallery: ["/img/g1.jpg"], badges: ["Licensed"],
      phone: "0100000000", location: "New Capital", yearsExperience: 5,
      responseTime: "within 2 hours", verifiedSince: "2021", verified: false,
    },
  });
  companyId = company.id;

  const provider = await prisma.user.create({
    data: {
      email: `${tag}-provider@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", isActive: true, name: "P", companyId,
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `${tag}-admin@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function submit(changes: Record<string, unknown>, note?: string) {
  const res = await submitPOST(
    req("/api/provider/change-requests", {
      method: "POST", token: providerToken,
      body: { entity: "COMPANY", entityId: companyId, changes, note },
    }),
    undefined as never,
  );
  return { status: res.status, body: await res.json() };
}

describe("provider submits a change request", () => {
  it("does NOT change the public profile", async () => {
    const { status } = await submit({ tagline: "Brand new tagline" });
    expect(status).toBe(201);

    const res = await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }));
    const body = await res.json();
    expect(body.tagline).toBe("Original tagline");

    const row = await prisma.company.findUnique({ where: { id: companyId } });
    expect(row?.tagline).toBe("Original tagline");
  });

  it("rejects a field outside the allowlist with 400", async () => {
    const { status, body } = await submit({ verified: true });
    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a forbidden field even alongside a legitimate one", async () => {
    const { status } = await submit({ tagline: "ok", featured: true });
    expect(status).toBe(400);
  });

  // The partial unique index is what makes this true under a double-click, not
  // just a service-level "is there one already?" check.
  it("keeps exactly ONE pending request after repeated submissions", async () => {
    await submit({ phone: "0111111111" });
    await submit({ about: "Second edit" });
    await submit({ location: "Third edit" });

    const pending = await prisma.changeRequest.findMany({
      where: { entity: "COMPANY", entityId: companyId, status: "PENDING" },
    });
    expect(pending).toHaveLength(1);
  });

  // Replacing instead of merging would silently drop the earlier edits.
  it("MERGES successive edits instead of replacing them", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    await submit({ phone: "0122222222" });
    await submit({ about: "Merged about" });

    const pending = await prisma.changeRequest.findFirst({
      where: { entityId: companyId, status: "PENDING" },
    });
    const changes = pending?.changes as Record<string, unknown>;
    expect(changes.phone).toBe("0122222222");  // survived the second submit
    expect(changes.about).toBe("Merged about");
  });

  it("marks the superseded request CANCELLED, not left dangling", async () => {
    const cancelled = await prisma.changeRequest.findMany({
      where: { companyId, status: "CANCELLED" },
    });
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it("exposes the pending request on /api/provider/profile", async () => {
    const res = await profileGET(req("/api/provider/profile", { token: providerToken }), undefined as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).not.toBeNull();
    expect(body.company.slug).toBe(slug);
  });
});

describe("admin review", () => {
  it("applies the change and writes an AuditLog row on approve", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ tagline: "Approved tagline" });

    const res = await adminReviewPATCH(
      req(`/api/admin/change-requests/${created.id}`, {
        method: "PATCH", token: adminToken, body: { action: "approve" },
      }),
      ctx({ id: created.id }),
    );
    expect(res.status).toBe(200);

    const row = await prisma.company.findUnique({ where: { id: companyId } });
    expect(row?.tagline).toBe("Approved tagline");

    const log = await prisma.auditLog.findFirst({
      where: { entity: "ChangeRequest", entityId: created.id, action: "company.change_request.approve" },
    });
    expect(log).not.toBeNull();
  });

  it("supports partial approval — applies only the named fields", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ tagline: "Take this", about: "Skip this" });

    const res = await adminReviewPATCH(
      req(`/api/admin/change-requests/${created.id}`, {
        method: "PATCH", token: adminToken,
        body: { action: "approve", fields: ["tagline"] },
      }),
      ctx({ id: created.id }),
    );
    const body = await res.json();
    expect(body.applied).toEqual(["tagline"]);
    expect(body.skipped).toEqual(["about"]);

    const row = await prisma.company.findUnique({ where: { id: companyId } });
    expect(row?.tagline).toBe("Take this");
    expect(row?.about).not.toBe("Skip this");
  });

  it("leaves the company untouched on reject and stores the reason", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const before = await prisma.company.findUnique({ where: { id: companyId } });
    const { body: created } = await submit({ tagline: "Should not land" });

    await adminReviewPATCH(
      req(`/api/admin/change-requests/${created.id}`, {
        method: "PATCH", token: adminToken,
        body: { action: "reject", reviewNote: "Tagline is misleading" },
      }),
      ctx({ id: created.id }),
    );

    const after = await prisma.company.findUnique({ where: { id: companyId } });
    expect(after?.tagline).toBe(before?.tagline);
    const row = await prisma.changeRequest.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe("REJECTED");
    expect(row?.reviewNote).toBe("Tagline is misleading");
  });

  it("refuses to review the same request twice", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ tagline: "Once only" });
    await adminReviewPATCH(
      req(`/api/admin/change-requests/${created.id}`, { method: "PATCH", token: adminToken, body: { action: "approve" } }),
      ctx({ id: created.id }),
    );
    const second = await adminReviewPATCH(
      req(`/api/admin/change-requests/${created.id}`, { method: "PATCH", token: adminToken, body: { action: "approve" } }),
      ctx({ id: created.id }),
    );
    expect(second.status).toBe(400);
  });

  it("flags a field the admin edited directly after submission", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ tagline: "Provider version" });
    // Admin edits the same field straight on the row while the request waits.
    await prisma.company.update({ where: { id: companyId }, data: { tagline: "Admin version" } });

    const res = await adminDetailGET(
      req(`/api/admin/change-requests/${created.id}`, { token: adminToken }),
      ctx({ id: created.id }),
    );
    const body = await res.json();
    expect(body.conflicts).toContain("tagline");
  });

  it("does NOT flag an unchanged gallery as a conflict", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ gallery: ["/img/new.jpg"] });

    const res = await adminDetailGET(
      req(`/api/admin/change-requests/${created.id}`, { token: adminToken }),
      ctx({ id: created.id }),
    );
    const body = await res.json();
    // gallery is unchanged on the live row, so despite being an array it must not
    // be reported — reference comparison would have flagged it every time.
    expect(body.conflicts).not.toContain("gallery");
  });

  it("lists pending requests for the admin queue", async () => {
    const res = await adminListGET(
      req("/api/admin/change-requests?status=PENDING", { token: adminToken }),
      undefined as never,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("provider cancels", () => {
  it("withdraws its own pending request", async () => {
    await prisma.changeRequest.deleteMany({ where: { companyId } });
    const { body: created } = await submit({ tagline: "Never mind" });

    const res = await cancelDELETE(
      req(`/api/provider/change-requests/${created.id}`, { method: "DELETE", token: providerToken }),
      ctx({ id: created.id }),
    );
    expect(res.status).toBe(200);

    const row = await prisma.changeRequest.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe("CANCELLED");
  });

  it("frees the slot so a new request can be filed", async () => {
    const { status } = await submit({ tagline: "Fresh start" });
    expect(status).toBe(201);
  });

  it("returns the provider's own requests only", async () => {
    const res = await providerListGET(
      req("/api/provider/change-requests", { token: providerToken }),
      undefined as never,
    );
    const body = await res.json();
    expect(body.every((r: { companyId: string }) => r.companyId === companyId)).toBe(true);
  });
});

describe("entity dispatch", () => {
  // Feature B wired OFFERING (and the tier/bundle entities) into the dispatch
  // map, so this is no longer rejected as unsupported — it now fails the way any
  // request against a missing row does.
  it("accepts OFFERING as a known entity and 404s on an unknown id", async () => {
    const res = await submitPOST(
      req("/api/provider/change-requests", {
        method: "POST", token: providerToken,
        body: { entity: "OFFERING", entityId: "does-not-exist", changes: { name: "x" } },
      }),
      undefined as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("ENTITY_NOT_SUPPORTED");
  });

  it("still rejects an entity outside the enum", async () => {
    const res = await submitPOST(
      req("/api/provider/change-requests", {
        method: "POST", token: providerToken,
        body: { entity: "NOT_A_THING", entityId: "x", changes: { name: "x" } },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
  });
});
