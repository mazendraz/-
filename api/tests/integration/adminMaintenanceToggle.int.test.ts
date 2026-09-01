// business-app phase 11: PUT /admin/maintenance is described as "the single
// most consequential control in the app" — this pins the actual end-to-end
// behavior the plan's own test requirement calls for: enabling it makes a
// public WRITE route return { code: "MAINTENANCE" } / 503, and disabling it
// restores normal behavior. Uses POST /feedback as the public write target
// — withMaintenance() wraps it as the OUTERMOST check, so it throws before
// the body is even validated, meaning this test needs no valid payload.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { PUT as maintenancePUT } from "@/app/api/admin/maintenance/route";
import { POST as feedbackPOST } from "@/app/api/feedback/route";

const tag = `maint-${Date.now()}`;

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  const headers = new Headers({ "x-forwarded-for": "10.90.9.9" });
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const noParamsCtx = { params: Promise.resolve({}) };

let adminToken = "";

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"), role: "ADMIN", isActive: true, name: "A" },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterEach(async () => {
  // Always leave maintenance OFF, whatever happened in the test — the single
  // highest-cost thing this test suite could get wrong is leaving the real
  // local site down for the next thing that runs against it.
  await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: false } }), noParamsCtx);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
});

describe("maintenance mode gates public writes end to end", () => {
  it("enabling it makes a public write route return 503 MAINTENANCE", async () => {
    const enableRes = await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: true } }), noParamsCtx);
    expect(enableRes.status).toBe(200);
    expect((await enableRes.json()).enabled).toBe(true);

    const writeRes = await feedbackPOST(req("/api/feedback", { method: "POST", body: {} }));
    expect(writeRes.status).toBe(503);
    const body = await writeRes.json();
    expect(body.code).toBe("MAINTENANCE");
  });

  it("disabling it restores normal validation behavior (400, not 503)", async () => {
    await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: true } }), noParamsCtx);
    const disableRes = await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: false } }), noParamsCtx);
    expect(disableRes.status).toBe(200);
    expect((await disableRes.json()).enabled).toBe(false);

    // An empty body now reaches real validation instead of the maintenance
    // gate — a 400 (not 503) is the proof the gate actually lifted.
    const writeRes = await feedbackPOST(req("/api/feedback", { method: "POST", body: {} }));
    expect(writeRes.status).toBe(400);
  });

  it("a partial PUT (only `enabled`) leaves title/message untouched — genuinely safe, see phase-11's own doc correction", async () => {
    await maintenancePUT(
      req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: false, title_ar: "PUT test title", message_ar: "PUT test message" } }),
      noParamsCtx,
    );
    const res = await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { enabled: true } }), noParamsCtx);
    const body = await res.json();
    expect(body.title_ar).toBe("PUT test title");
    expect(body.message_ar).toBe("PUT test message");

    // Leave title/message exactly as this test found them (blank), not just
    // `enabled` — this test is the one place in the file that writes them.
    await maintenancePUT(req("/api/admin/maintenance", { method: "PUT", token: adminToken, body: { title_ar: "", message_ar: "" } }), noParamsCtx);
  });
});
