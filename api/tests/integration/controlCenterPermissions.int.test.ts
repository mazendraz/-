// business-app phase 12 (Control Center mobile screens): the desktopOnly()
// permission boundary these screens rely on had NO integration coverage
// anywhere in the suite before this file — confirmed by search. Pins the
// three things the plan's own test requirement calls for: an ADMIN without
// the right permission 403s; a PROVIDER with a hand-set desktopPermissions
// array is STILL 403 (role is checked before permission — see
// withPermission.ts's own comment); and COMMISSION_INCOME can never be
// created through the exposed create-transaction path.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { GET as financeOverviewGET } from "@/app/api/admin/finance/overview/route";
import { GET as cashFlowGET } from "@/app/api/admin/finance/cash-flow/route";
import { GET as clientsGET } from "@/app/api/admin/clients/route";
import { POST as transactionsPOST } from "@/app/api/admin/finance/transactions/route";

const tag = `ctrlperm-${Date.now()}`;

// None of the routes here have a dynamic segment, but their GET/POST
// handlers still take a second `ctx` positionally (desktopOnly<Ctx>'s
// wrapper type) — same fix as phase 9's adminModeration.int.test.ts.
const noParamsCtx = { params: Promise.resolve({}) };

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  const headers = new Headers({ "x-forwarded-for": "10.66.6.6" });
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

let adminNoPermsToken = "";
let adminAnalyticsToken = "";
let adminFinanceToken = "";
let providerWithPermsToken = "";

beforeAll(async () => {
  const adminNoPerms = await prisma.user.create({
    data: { email: `${tag}-a1@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A1", desktopPermissions: [] },
  });
  adminNoPermsToken = await signToken({ sub: adminNoPerms.id, role: "ADMIN", companyId: null });

  const adminAnalytics = await prisma.user.create({
    data: { email: `${tag}-a2@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A2", desktopPermissions: ["analytics:read"] },
  });
  adminAnalyticsToken = await signToken({ sub: adminAnalytics.id, role: "ADMIN", companyId: null });

  const adminFinance = await prisma.user.create({
    data: { email: `${tag}-a3@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A3", desktopPermissions: ["finance:read"] },
  });
  adminFinanceToken = await signToken({ sub: adminFinance.id, role: "ADMIN", companyId: null });

  // A PROVIDER account with every desktop permission hand-set — proves the
  // role check, not just the permission check, is what's actually gating.
  const providerWithPerms = await prisma.user.create({
    data: {
      email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"), role: "PROVIDER", isActive: true, name: "P",
      desktopPermissions: ["overview:read", "operations:read", "business:read", "finance:read", "finance:write", "analytics:read", "reports:read", "settings:write"],
    },
  });
  providerWithPermsToken = await signToken({ sub: providerWithPerms.id, role: "PROVIDER", companyId: null });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
});

describe("desktopOnly permission gate", () => {
  it("an ADMIN with no desktop permissions is 403 on a finance:read route", async () => {
    const res = await financeOverviewGET(req("/api/admin/finance/overview", { token: adminNoPermsToken }), noParamsCtx);
    expect(res.status).toBe(403);
  });

  it("an ADMIN with only finance:read is 403 on a route that requires only reports:read/operations:read — no accidental broadening", async () => {
    // finance:read grants finance/overview and finance/cash-flow, but NOT
    // clients (business:read/analytics:read) — confirms grants are scoped,
    // not "any permission opens everything".
    const res = await clientsGET(req("/api/admin/clients", { token: adminFinanceToken }), noParamsCtx);
    expect(res.status).toBe(403);
  });

  it("a PROVIDER with every desktop permission hand-set is STILL 403 — role is checked, not just the array", async () => {
    const res = await financeOverviewGET(req("/api/admin/finance/overview", { token: providerWithPermsToken }), noParamsCtx);
    expect(res.status).toBe(403);
  });

  it("the ANY-of form: analytics:read alone is enough for finance/overview (also gated by finance:read)", async () => {
    const res = await financeOverviewGET(req("/api/admin/finance/overview", { token: adminAnalyticsToken }), noParamsCtx);
    expect(res.status).toBe(200);
  });

  it("but analytics:read alone is NOT enough for cash-flow (finance:read only, no ANY-of)", async () => {
    const res = await cashFlowGET(req("/api/admin/finance/cash-flow", { token: adminAnalyticsToken }), noParamsCtx);
    expect(res.status).toBe(403);
  });

  it("finance:read is enough for cash-flow", async () => {
    const res = await cashFlowGET(req("/api/admin/finance/cash-flow", { token: adminFinanceToken }), noParamsCtx);
    expect(res.status).toBe(200);
  });
});

describe("COMMISSION_INCOME cannot be created through any exposed path", () => {
  it("POST /admin/finance/transactions rejects type: COMMISSION_INCOME with a 400, not a 201", async () => {
    const adminWrite = await prisma.user.create({
      data: { email: `${tag}-a4@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A4", desktopPermissions: ["finance:write"] },
    });
    const token = await signToken({ sub: adminWrite.id, role: "ADMIN", companyId: null });

    const res = await transactionsPOST(
      req("/api/admin/finance/transactions", { method: "POST", token, body: { type: "COMMISSION_INCOME", amount: 1000 } }),
      noParamsCtx,
    );
    expect(res.status).toBe(400);

    const created = await prisma.transaction.findFirst({ where: { note: null, type: "COMMISSION_INCOME", amount: 1000, createdById: adminWrite.id } });
    expect(created).toBeNull();
  });
});
