// The waiting list, end to end against a real database: join -> admin accepts ->
// a real Lead exists in the normal pipeline -> it can be driven through lead
// status transitions like any other lead -> a second accept never creates a
// duplicate Lead.
//
// Two bugs live under these tests. The first: accepting used to only flip
// WaitlistEntry.status, so no Lead was ever created and the "accepted" request
// could never enter the CRM pipeline at all. The second, which the tests at the
// bottom cover: a waiting-list join only ever collected a name and a phone
// number, so being told "they're busy" cost the customer the whole request they
// had come to make — district, description, chosen services and the price they
// were quoted. A join is now the same full request form, and accepting one must
// produce a Lead indistinguishable from one submitted directly.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as joinWaitlistPOST } from "@/app/api/companies/[slug]/waitlist/route";
import { PATCH as adminWaitlistPATCH } from "@/app/api/admin/companies/[id]/waitlist/[entryId]/route";
import { GET as adminLeadsGET } from "@/app/api/admin/leads/route";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";
import { GET as providerLeadGET } from "@/app/api/provider/leads/[id]/route";

const tag = `wlconv-${Date.now()}`;

// `ip` matters for the public join route only: it is rate-limited to 5 per
// minute per client IP, and every request built here would otherwise share one
// bucket — so tests would start 429ing purely because of how many ran before
// them, in an order nothing guarantees.
function req(url: string, opts: { method?: string; body?: unknown; token?: string; ip?: string } = {}): NextRequest {
  const headers = new Headers();
  headers.set("x-forwarded-for", opts.ip ?? `10.77.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`);
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
let providerToken = "";
let otherProviderToken = "";
let otherCompanyId = "";

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

  // This company's own provider, plus an unrelated one — the accepted lead has
  // to be reachable by the first and invisible to the second.
  const provider = await prisma.user.create({
    data: {
      email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", companyId, isActive: true, name: "P",
    },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });

  const otherCompany = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug: `${tag}-other`, name: "Other Co",
      tagline: "t", about: "a", logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000004", location: "NC", yearsExperience: 1, responseTime: "1h", verifiedSince: "2024",
    },
  });
  otherCompanyId = otherCompany.id;
  const otherProvider = await prisma.user.create({
    data: {
      email: `${tag}-op@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", companyId: otherCompanyId, isActive: true, name: "O",
    },
  });
  otherProviderToken = await signToken({ sub: otherProvider.id, role: "PROVIDER", companyId: otherCompanyId });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { companyId } });
  await prisma.waitlistEntry.deleteMany({ where: { companyId } });
  await prisma.offering.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId: otherCompanyId } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
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

  it("falls back to a placeholder district for an entry from the old short form", async () => {
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
    // District is NOT NULL on Lead and this entry genuinely never collected one,
    // so a placeholder is the only option.
    expect(lead!.district).toBeTruthy();
    // Budget gets "" rather than a placeholder — that is exactly what a request
    // submitted directly carries, since the form stopped collecting a budget.
    expect(lead!.budget).toBe("");
    expect(lead!.description).toBeTruthy();
  });

  // ── The whole request survives the wait ────────────────────────────────────
  // A join carries the same form a direct request does. What comes out of an
  // accept must therefore be indistinguishable from a request submitted that
  // day — same district, same description, same chosen services, same price.
  it("carries the full request — district, description, items and estimate — onto the Lead", async () => {
    const offering = await prisma.offering.create({
      data: {
        companyId, name: "Marble counter", pricingModel: "FIXED",
        priceMin: 5000, priceMax: 5000, isPublished: true, isActive: true,
      },
    });

    const joinRes = await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: {
          name: "Mazen Draz",
          phone: "01099995555",
          district: "R5",
          note: "Third floor, no lift",
          items: [{ offeringId: offering.id, qty: 2 }],
        },
      }),
      ctx({ slug: companySlug }),
    );
    expect(joinRes.status).toBe(201);
    const entry = await joinRes.json();

    // The entry itself already shows the customer what they ordered and what it
    // costs — the provider decides whether to accept from exactly this.
    expect(entry.district).toBe("R5");
    expect(entry.items).toHaveLength(1);
    expect(entry.items[0].nameSnapshot).toBe("Marble counter");
    expect(entry.items[0].qty).toBe(2);
    expect(entry.estimatedMin).toBe(10000);
    // Item names become the service summary, same substitution a lead gets.
    expect(entry.service).toBe("Marble counter ×2");

    const acceptRes = await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    const acceptedEntry = await acceptRes.json();

    const lead = await prisma.lead.findUnique({
      where: { id: acceptedEntry.convertedLeadId },
      include: { items: true },
    });
    // Not one placeholder anywhere: this is the point of the feature.
    expect(lead!.district).toBe("R5");
    expect(lead!.description).toBe("Third floor, no lift");
    expect(lead!.service).toBe("Marble counter ×2");
    expect(lead!.estimatedMin).toBe(10000);
    expect(lead!.estimatedMax).toBe(10000);
    expect(lead!.items).toHaveLength(1);
    expect(lead!.items[0]!.offeringId).toBe(offering.id);
    expect(lead!.items[0]!.nameSnapshot).toBe("Marble counter");
    expect(lead!.items[0]!.qty).toBe(2);
    expect(lead!.items[0]!.lineMin).toBe(10000);
  });

  // The estimate is frozen when the customer submits, not when the provider gets
  // around to accepting. Someone who waits three weeks is owed the price they
  // were quoted, not whatever the catalogue says on the day their turn comes.
  it("quotes the price frozen at join time, even after the catalogue changes", async () => {
    const offering = await prisma.offering.create({
      data: {
        companyId, name: "Wardrobe", pricingModel: "FIXED",
        priceMin: 3000, priceMax: 3000, isPublished: true, isActive: true,
      },
    });

    const entry = await (await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: { name: "Hana Ali", phone: "01099994444", district: "R7", items: [{ offeringId: offering.id }] },
      }),
      ctx({ slug: companySlug }),
    )).json();
    expect(entry.estimatedMin).toBe(3000);

    // The provider raises their price while this customer is still waiting.
    await prisma.offering.update({
      where: { id: offering.id },
      data: { priceMin: 9000, priceMax: 9000 },
    });

    const acceptedEntry = await (await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    )).json();

    const lead = await prisma.lead.findUnique({
      where: { id: acceptedEntry.convertedLeadId },
      include: { items: true },
    });
    expect(lead!.estimatedMin).toBe(3000);
    expect(lead!.items[0]!.unitPriceMin).toBe(3000);
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

// The provider's dashboard reaches leads through one capped list fetch
// (GET /provider/leads?pageSize=100), taken when the dashboard loaded. A lead
// accepted off the waiting list is created AFTER that, so a page addressed by
// lead id — the completion form — had nothing to render from once the router
// state behind it was gone (a reload, or the URL opened directly) and told the
// provider the lead did not exist. It plainly did. This endpoint is the
// single-record read that was missing.
describe("GET /api/provider/leads/[id] — reaching one lead by id", () => {
  /**
   * Join, then accept, and hand back the id of the Lead that came out.
   *
   * A distinct phone per caller: joining twice with the same phone for the same
   * service inside the dedup window is a 409 by design (the double-submit
   * guard), which has nothing to do with what these tests are checking.
   */
  let n = 0;
  async function acceptedLeadId(name: string): Promise<string> {
    n += 1;
    const joinRes = await joinWaitlistPOST(
      req(`/api/companies/${companySlug}/waitlist`, {
        method: "POST",
        body: {
          name, phone: `0105555${String(4000 + n).padStart(4, "0")}`,
          service: `Roof insulation ${n}`, district: "R7", note: "Top floor",
        },
      }),
      ctx({ slug: companySlug }),
    );
    expect(joinRes.status).toBe(201);
    const entry = await joinRes.json();
    const acceptRes = await adminWaitlistPATCH(
      req(`/api/admin/companies/${companyId}/waitlist/${entry.id}`, {
        method: "PATCH", token: adminToken, body: { status: "CONVERTED" },
      }),
      ctx({ id: companyId, entryId: entry.id }),
    );
    return (await acceptRes.json()).convertedLeadId as string;
  }

  it("serves a lead the provider's cached list was never going to contain", async () => {
    const leadId = await acceptedLeadId("Hala Fouad");

    const res = await providerLeadGET(req(`/api/provider/leads/${leadId}`, { token: providerToken }), ctx({ id: leadId }));
    expect(res.status).toBe(200);

    const lead = await res.json();
    expect(lead.id).toBe(leadId);
    expect(lead.name).toBe("Hala Fouad");
    expect(lead.district).toBe("R7");
    expect(lead.status).toBe("New");
    expect(lead.refNumber).toMatch(/^AA-/);
  });

  it("refuses another company's lead — the id is not a way around ownership", async () => {
    const leadId = await acceptedLeadId("Omar Zaki");

    const res = await providerLeadGET(
      req(`/api/provider/leads/${leadId}`, { token: otherProviderToken }),
      ctx({ id: leadId }),
    );
    expect([403, 404]).toContain(res.status);
  });

  it("404s on an id that is not a lead at all", async () => {
    const res = await providerLeadGET(
      req(`/api/provider/leads/11111111-1111-4111-8111-111111111111`, { token: providerToken }),
      ctx({ id: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(res.status).toBe(404);
  });

  it("requires a session — an anonymous caller gets 401, not the lead", async () => {
    const leadId = await acceptedLeadId("Sara Nabil");

    const res = await providerLeadGET(req(`/api/provider/leads/${leadId}`), ctx({ id: leadId }));
    expect(res.status).toBe(401);
  });
});
