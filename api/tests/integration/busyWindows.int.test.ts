// Feature F integration tests. These cover what only a real database can show:
// the open-ended-window rules, the admin/provider permission split, and that a
// window changes what the PUBLIC profile reports without anything scheduled.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { GET as listGET, POST as createPOST } from "@/app/api/provider/busy-windows/route";
import { PATCH as updatePATCH, DELETE as removeDELETE } from "@/app/api/provider/busy-windows/[id]/route";
import { POST as adminCreatePOST } from "@/app/api/admin/companies/[id]/busy-windows/route";
import { DELETE as adminDELETE } from "@/app/api/admin/companies/[id]/busy-windows/[windowId]/route";
import { GET as publicCompanyGET } from "@/app/api/companies/[slug]/route";

const tag = `bw-${Date.now()}`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (off: number) => Date.now() + off;

function req(body?: unknown, token?: string): NextRequest {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/provider/busy-windows", {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let categoryId = "", companyId = "", slug = "", providerToken = "", adminToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;
  slug = `${tag}-co`;
  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug, name: "Busy Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = company.id;
  const provider = await prisma.user.create({
    data: { email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", isActive: true, name: "P", companyId },
  });
  const admin = await prisma.user.create({
    data: { email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A" },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.busyWindow.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

beforeEach(async () => {
  await prisma.busyWindow.deleteMany({ where: { companyId } });
  await prisma.company.update({ where: { id: companyId }, data: { busy: false, busyUntil: null } });
});

async function create(body: unknown, token = providerToken) {
  const res = await createPOST(req(body, token), undefined as never);
  return { status: res.status, body: await res.json() };
}

async function publicBusy() {
  const res = await publicCompanyGET(req(undefined) as never, ctx({ slug }));
  const company = await res.json();
  return {
    busy: company.busy,
    nextAvailableAt: company.nextAvailableAt,
    upcomingBusyFrom: company.upcomingBusyFrom,
    busyReason: company.busyReason,
  };
}

describe("scheduling", () => {
  it("creates a window", async () => {
    const { status, body } = await create({ startsAt: at(DAY), endsAt: at(2 * DAY), note: "Eid" });
    expect(status).toBe(201);
    expect(body.note).toBe("Eid");
    expect(body.createdByAdmin).toBe(false);
  });

  it("rejects an end before the start", async () => {
    const { status } = await create({ startsAt: at(2 * DAY), endsAt: at(DAY) });
    expect(status).toBe(400);
  });

  it("rejects a start far in the past", async () => {
    const { status } = await create({ startsAt: at(-30 * DAY), endsAt: at(DAY) });
    expect(status).toBe(400);
  });

  it("rejects overlapping windows", async () => {
    await create({ startsAt: at(DAY), endsAt: at(3 * DAY) });
    const { status } = await create({ startsAt: at(2 * DAY), endsAt: at(4 * DAY) });
    expect(status).toBe(400);
  });

  it("allows back-to-back windows that only touch", async () => {
    const boundary = at(3 * DAY);
    await create({ startsAt: at(DAY), endsAt: boundary });
    const { status } = await create({ startsAt: boundary, endsAt: at(5 * DAY) });
    expect(status).toBe(201);
  });
});

// An open-ended window overlaps every future window forever, so this needs its
// own rules or scheduling becomes impossible after the first one.
describe("open-ended windows", () => {
  it("keeps at most ONE open-ended window per company", async () => {
    await create({ startsAt: at(-HOUR), endsAt: null, note: "first" });
    await create({ startsAt: at(0), endsAt: null, note: "second" });
    const open = await prisma.busyWindow.findMany({ where: { companyId, endsAt: null } });
    expect(open).toHaveLength(1);
    expect(open[0].note).toBe("second");
  });

  it("closes the previous open window rather than rejecting the new one", async () => {
    const { body: first } = await create({ startsAt: at(-HOUR), endsAt: null, note: "first" });
    const { status } = await create({ startsAt: at(0), endsAt: null, note: "second" });
    expect(status).toBe(201);
    const closed = await prisma.busyWindow.findUnique({ where: { id: first.id } });
    expect(closed?.endsAt).not.toBeNull();
  });

  it("blocks a bounded window that starts inside an open-ended one", async () => {
    await create({ startsAt: at(-HOUR), endsAt: null });
    const { status } = await create({ startsAt: at(5 * DAY), endsAt: at(6 * DAY) });
    expect(status).toBe(400);
  });
});

describe("permissions", () => {
  it("lets an admin create a window on any company", async () => {
    const res = await adminCreatePOST(
      req({ startsAt: at(DAY), endsAt: at(2 * DAY), note: "Admin hold" }, adminToken),
      ctx({ id: companyId }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).createdByAdmin).toBe(true);
  });

  it("REFUSES to let the provider delete an admin-created window", async () => {
    const created = await (await adminCreatePOST(
      req({ startsAt: at(DAY), endsAt: at(2 * DAY) }, adminToken),
      ctx({ id: companyId }),
    )).json();

    const res = await removeDELETE(
      req(undefined, providerToken), ctx({ id: created.id }),
    );
    expect(res.status).toBe(403);
    expect(await prisma.busyWindow.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("REFUSES to let the provider edit an admin-created window", async () => {
    const created = await (await adminCreatePOST(
      req({ startsAt: at(DAY), endsAt: at(2 * DAY) }, adminToken),
      ctx({ id: companyId }),
    )).json();
    const res = await updatePATCH(
      req({ startsAt: at(5 * DAY), endsAt: at(6 * DAY) }, providerToken),
      ctx({ id: created.id }),
    );
    expect(res.status).toBe(403);
  });

  it("lets the admin delete their own window", async () => {
    const created = await (await adminCreatePOST(
      req({ startsAt: at(DAY), endsAt: at(2 * DAY) }, adminToken),
      ctx({ id: companyId }),
    )).json();
    const res = await adminDELETE(
      req(undefined, adminToken), ctx({ id: companyId, windowId: created.id }),
    );
    expect(res.status).toBe(200);
  });

  it("lets the provider delete their OWN window", async () => {
    const { body } = await create({ startsAt: at(DAY), endsAt: at(2 * DAY) });
    const res = await removeDELETE(req(undefined, providerToken), ctx({ id: body.id }));
    expect(res.status).toBe(200);
  });
});

// The whole point of the design: availability is derived on read, so a period
// starts and ends with nothing scheduled to run.
describe("effect on the public profile", () => {
  it("reports available with nothing scheduled", async () => {
    expect((await publicBusy()).busy).toBe(false);
  });

  it("reports BUSY while a window is running, with an end date and reason", async () => {
    await create({ startsAt: at(-HOUR), endsAt: at(2 * HOUR), note: "Large project" });
    const state = await publicBusy();
    expect(state.busy).toBe(true);
    expect(state.busyReason).toBe("Large project");
    expect(state.nextAvailableAt).toBeGreaterThan(Date.now());
  });

  it("reports available again once the window has passed — no job ran", async () => {
    // Written straight to the database: the API refuses to schedule in the past,
    // but a window created legitimately days ago must expire by itself.
    await prisma.busyWindow.create({
      data: { companyId, startsAt: new Date(at(-3 * DAY)), endsAt: new Date(at(-DAY)) },
    });
    expect((await publicBusy()).busy).toBe(false);
  });

  it("stays available but advertises an upcoming period", async () => {
    await create({ startsAt: at(5 * DAY), endsAt: at(6 * DAY) });
    const state = await publicBusy();
    expect(state.busy).toBe(false);
    expect(state.upcomingBusyFrom).toBeGreaterThan(Date.now());
  });

  it("is busy from the manual switch even with no windows", async () => {
    await prisma.company.update({ where: { id: companyId }, data: { busy: true, busyNote: "Manual" } });
    const state = await publicBusy();
    expect(state.busy).toBe(true);
    expect(state.busyReason).toBe("Manual");
  });
});

describe("listing", () => {
  it("returns running and upcoming windows only", async () => {
    await prisma.busyWindow.create({
      data: { companyId, startsAt: new Date(at(-5 * DAY)), endsAt: new Date(at(-4 * DAY)) },
    });
    await create({ startsAt: at(DAY), endsAt: at(2 * DAY) });

    const res = await listGET(req(undefined, providerToken), undefined as never);
    const rows = await res.json();
    // The finished one is history — nothing reads it, and returning it would
    // grow this response without bound as the table ages.
    expect(rows).toHaveLength(1);
    expect(rows[0].startsAt).toBeGreaterThan(Date.now());
  });
});
