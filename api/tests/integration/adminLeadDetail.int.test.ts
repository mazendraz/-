// GET /admin/leads/[id] (B6, business-app phase 8): the admin counterpart of
// provider/leads/[id] — an admin lead-detail screen previously had no way to
// open a lead that wasn't already sitting in an already-fetched page of
// GET /admin/leads. Also covers DELETE on the same route, which had no
// dedicated test before this phase touched the file.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as adminLeadGET, DELETE as adminLeadDELETE } from "@/app/api/admin/leads/[id]/route";

const tag = `admlead-${Date.now()}`;

function req(url: string, opts: { method?: string; token?: string } = {}): NextRequest {
  const headers = new Headers({ "x-forwarded-for": "10.66.1.1" });
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, { method: opts.method ?? "GET", headers });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let categoryId = "";
let companyId = "";
let adminToken = "";
let providerToken = "";
let leadId = "";
let conversationId = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Admin Lead Detail", description: "d", icon: "home" },
  });
  categoryId = category.id;

  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug: `${tag}-co`, name: "Admin Lead Co",
      tagline: "t", about: "a", logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000005", location: "NC", yearsExperience: 1, responseTime: "1h", verifiedSince: "2024",
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

  const lead = await prisma.lead.create({
    data: {
      companyId,
      refNumber: `AA-${tag}`,
      trackingToken: `tok-${tag}`,
      customerName: "Test Customer",
      phone: "+201012345000",
      district: "R7",
      service: "Painting",
      budget: "",
      description: "d",
      status: "NEW",
      conversation: { create: { companyId } },
    },
    include: { conversation: true },
  });
  leadId = lead.id;
  conversationId = lead.conversation!.id;
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("GET /api/admin/leads/[id]", () => {
  it("returns the lead for an admin", async () => {
    const res = await adminLeadGET(req(`/api/admin/leads/${leadId}`, { token: adminToken }), ctx(leadId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(leadId);
    expect(body.name).toBe("Test Customer");
  });

  it("403s a provider token, even for its own company's lead", async () => {
    const res = await adminLeadGET(req(`/api/admin/leads/${leadId}`, { token: providerToken }), ctx(leadId));
    expect(res.status).toBe(403);
  });

  it("404s an id that doesn't exist", async () => {
    const res = await adminLeadGET(req("/api/admin/leads/does-not-exist", { token: adminToken }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("401s with no token", async () => {
    const res = await adminLeadGET(req(`/api/admin/leads/${leadId}`), ctx(leadId));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/admin/leads/[id]", () => {
  it("removes the lead and its conversation", async () => {
    const before = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(before).not.toBeNull();

    const res = await adminLeadDELETE(req(`/api/admin/leads/${leadId}`, { method: "DELETE", token: adminToken }), ctx(leadId));
    expect(res.status).toBe(204);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead).toBeNull();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conv).toBeNull();
  });
});
