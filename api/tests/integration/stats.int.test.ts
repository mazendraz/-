// Dashboard aggregates.
//
// The regression these guard: every KPI, chart and leaderboard used to be
// computed in the browser from a 100-row lead hydration, so past 100 leads the
// Overview froze while the paginated Leads tab beside it showed the truth. The
// assertions below all turn on counting MORE than one page.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as adminStatsGET } from "@/app/api/admin/stats/route";
import { GET as providerStatsGET } from "@/app/api/provider/stats/route";

const tag = `stats-${Date.now()}`;
// Deliberately above the 100-row page cap that produced the bug.
const LEAD_COUNT = 120;
const COMPLETED = 30;

function req(url: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost${url}`, { headers });
}

let categoryId = "";
let companyId = "";
let otherCompanyId = "";
let adminToken = "";
let providerToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;

  const companyData = (slug: string, name: string) => ({
    categories: { create: [{ categoryId, isPrimary: true }] }, slug, name, tagline: "t", about: "a",
    logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
    phone: "0100000000", location: "NC", yearsExperience: 1,
    responseTime: "1h", verifiedSince: "2024",
  });
  companyId = (await prisma.company.create({ data: companyData(`${tag}-a`, "Stats A") })).id;
  otherCompanyId = (await prisma.company.create({ data: companyData(`${tag}-b`, "Stats B") })).id;

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  const provider = await prisma.user.create({
    data: {
      email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", isActive: true, name: "P", companyId,
    },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });

  // Spread across today and yesterday so the daily series has two live buckets.
  await prisma.lead.createMany({
    data: Array.from({ length: LEAD_COUNT }, (_, i) => ({
      companyId,
      refNumber: `${tag}-${i}`,
      service: "s", customerName: "c", phone: "0100000000",
      district: "R7", budget: "b", description: "d",
      status: i < COMPLETED ? ("COMPLETED" as const) : ("NEW" as const),
      createdAt: new Date(Date.now() - (i % 2) * 86_400_000),
    })),
  });
  // One lead on the other company, so scoping is actually observable.
  await prisma.lead.create({
    data: {
      companyId: otherCompanyId, refNumber: `${tag}-other`,
      service: "s", customerName: "c", phone: "0100000000",
      district: "R7", budget: "b", description: "d",
    },
  });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { refNumber: { startsWith: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("provider stats", () => {
  it("counts the whole table, not one page", async () => {
    const body = await (await providerStatsGET(req("/api/provider/stats", providerToken), undefined as never)).json();

    expect(body.total).toBe(LEAD_COUNT);
    expect(body.byStatus.Completed).toBe(COMPLETED);
    expect(body.byStatus.New).toBe(LEAD_COUNT - COMPLETED);
    // Every status keyed even at zero, so no caller has to guard.
    expect(body.byStatus.Cancelled).toBe(0);
  });

  it("returns a dense daily series that sums to the leads inside it", async () => {
    const body = await (await providerStatsGET(req("/api/provider/stats?days=7", providerToken), undefined as never)).json();

    expect(body.perDay).toHaveLength(7);
    // Dense: quiet days are present as zeros rather than missing, so a chart
    // cannot draw a straight line across them as if they never happened.
    expect(body.perDay.every((d: { date: string }) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    const summed = body.perDay.reduce((s: number, d: { count: number }) => s + d.count, 0);
    expect(summed).toBe(LEAD_COUNT);
    expect(body.timezone).toBe("Africa/Cairo");
  });

  it("scopes to the caller's own company and exposes no per-company breakdown", async () => {
    const body = await (await providerStatsGET(req("/api/provider/stats", providerToken), undefined as never)).json();
    // The other company's lead must not be counted.
    expect(body.total).toBe(LEAD_COUNT);
    expect(body.byCompany).toEqual([]);
  });

  it("clamps an absurd window instead of building thousands of buckets", async () => {
    const body = await (await providerStatsGET(req("/api/provider/stats?days=99999", providerToken), undefined as never)).json();
    expect(body.perDay.length).toBeLessThanOrEqual(90);
  });
});

describe("admin stats", () => {
  it("aggregates across companies and ranks them by volume", async () => {
    const res = await adminStatsGET(req("/api/admin/stats", adminToken), undefined as never);
    const body = await res.json();

    expect(body.total).toBeGreaterThanOrEqual(LEAD_COUNT + 1);

    const mine = body.byCompany.find((c: { companyId: string }) => c.companyId === companyId);
    expect(mine.leads).toBe(LEAD_COUNT);
    expect(mine.completed).toBe(COMPLETED);
    // Conversion over the FULL table — the number the old client-side version
    // got wrong, because its denominator was whatever fitted in one page.
    expect(mine.conversion).toBe(Math.round((COMPLETED / LEAD_COUNT) * 100));
  });

  it("rejects a provider token", async () => {
    const res = await adminStatsGET(req("/api/admin/stats", providerToken), undefined as never);
    expect(res.status).toBe(403);
  });

  it("rejects an anonymous caller", async () => {
    const res = await adminStatsGET(req("/api/admin/stats"), undefined as never);
    expect(res.status).toBe(401);
  });
});
