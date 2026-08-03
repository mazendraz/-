// Bug fix under test: accepting a waitlisted request (PATCH status -> CONVERTED)
// used to only flip WaitlistEntry.status — no Lead was ever created, so the
// "accepted" request could never enter the normal CRM pipeline (Contacted,
// Qualified/In Progress, Completed, etc). This exercises the full journey:
// join waitlist -> admin accepts -> a real Lead exists in the normal pipeline ->
// it can be driven through lead status transitions like any other lead -> a
// second accept never creates a duplicate Lead.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as joinWaitlistPOST } from "@/app/api/companies/[slug]/waitlist/route";
import { PATCH as adminWaitlistPATCH } from "@/app/api/admin/companies/[id]/waitlist/[entryId]/route";
import { GET as adminLeadsGET } from "@/app/api/admin/leads/route";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";

const tag = `wlconv-${Date.now()}`;

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
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let categoryId = "";
let companyId = "";
let companySlug = "";
let adminToken = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "WL Conv", description: "d", icon: "home" },
  });
  categoryId = category.id;

  companySlug = `${tag}-co`;
  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug: companySlug, name: "WL Conv Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000003", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
      busy: true, // the scenario this whole feature exists for
    },
  });
  companyId = company.id;

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { companyId } });
  await prisma.waitlistEntry.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("accepting a waitlist entry", () => {
  it("creates a real Lead (status NEW), not just a status label change", async () => {
    const joinRes = await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: { name: "Nada Samir", phone: "01099998888", service: "Kitchen fit-out", note: "Wants marble counters" },
      }),
      ctx({ slug: companySlug }),
    );
    expect(joinRes.status).toBe(201);
    const entry = await joinRes.json();
    expect(entry.status).toBe("WAITING");
    expect(entry.convertedLeadId).toBeNull();

    const beforeLeadCount = await prisma.lead.count({ where: { companyId } });

    const acceptRes = await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    expect(acceptRes.status).toBe(200);
    const acceptedEntry = await acceptRes.json();
    expect(acceptedEntry.status).toBe("CONVERTED");
    expect(acceptedEntry.convertedLeadId).toBeTruthy();

    // The real assertion: an actual Lead row now exists, using the exact same
    // shape/fields as a normally-created lead — not a relabeled waitlist row.
    const lead = await prisma.lead.findUnique({ where: { id: acceptedEntry.convertedLeadId } });
    expect(lead).not.toBeNull();
    expect(lead!.status).toBe("NEW");
    expect(lead!.customerName).toBe("Nada Samir");
    expect(lead!.phone).toBe("01099998888");
    expect(lead!.service).toBe("Kitchen fit-out");
    expect(lead!.description).toBe("Wants marble counters"); // preserved from the waitlist note
    expect(lead!.companyId).toBe(companyId);
    expect(lead!.refNumber).toMatch(/^AA-/);

    const afterLeadCount = await prisma.lead.count({ where: { companyId } });
    expect(afterLeadCount).toBe(beforeLeadCount + 1);

    // Appears in the normal admin leads list — "everywhere normal leads appear".
    const list = await (await adminLeadsGET(req(`/api/admin/leads?companyId=${companyId}`, { token: adminToken }), undefined as never)).json();
    expect(list.data.some((l: { id: string }) => l.id === lead!.id)).toBe(true);

    // Full pipeline: the converted lead supports every normal lead-status action.
    for (const status of ["Contacted", "In Progress", "Completed"]) {
      const res = await leadPATCH(
        req(`/api/leads/${lead!.id}`, { method: "PATCH", token: adminToken, body: { status } }),
        ctx({ id: lead!.id }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe(status);
    }

    // Idempotency: accepting again must NOT create a second Lead.
    const secondAccept = await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    expect(secondAccept.status).toBe(200);
    expect((await secondAccept.json()).convertedLeadId).toBe(acceptedEntry.convertedLeadId);
    expect(await prisma.lead.count({ where: { companyId } })).toBe(afterLeadCount);
  });

  it("falls back to placeholder district/budget when the waitlist entry never collected them", async () => {
    const joinRes = await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: { name: "Omar Adel", phone: "01099997777" },
      }),
      ctx({ slug: companySlug }),
    );
    const entry = await joinRes.json();

    const acceptRes = await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    const acceptedEntry = await acceptRes.json();
    const lead = await prisma.lead.findUnique({ where: { id: acceptedEntry.convertedLeadId } });
    expect(lead!.district).toBeTruthy();
    expect(lead!.budget).toBeTruthy();
    expect(lead!.description).toBeTruthy();
  });

  it("other status transitions (WAITING/NOTIFIED/CANCELLED) still never create a Lead", async () => {
    const joinRes = await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: { name: "Sara Fouad", phone: "01099996666" },
      }),
      ctx({ slug: companySlug }),
    );
    const entry = await joinRes.json();
    const before = await prisma.lead.count({ where: { companyId } });

    await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "NOTIFIED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CANCELLED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );

    expect(await prisma.lead.count({ where: { companyId } })).toBe(before);
  });
});
