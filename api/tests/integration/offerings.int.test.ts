// Feature B integration tests. The point of this file is the PUBLISH RULE:
// the row's own state decides the write path, a published offering never
// flickers out of the public profile during review, and a draft cannot be
// swapped underneath an admin who is reviewing it.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as offeringPOST, GET as offeringsGET } from "@/app/api/provider/offerings/route";
import { PATCH as offeringPATCH, DELETE as offeringDELETE } from "@/app/api/provider/offerings/[id]/route";
import { POST as publishPOST } from "@/app/api/provider/offerings/[id]/publish/route";
import { PATCH as visibilityPATCH } from "@/app/api/provider/offerings/[id]/visibility/route";
import { POST as tierPOST } from "@/app/api/provider/offerings/[id]/tiers/route";
import { DELETE as tierDELETE } from "@/app/api/provider/offerings/[id]/tiers/[tierId]/route";
import { DELETE as crCancelDELETE } from "@/app/api/provider/change-requests/[id]/route";
import { PATCH as adminReviewPATCH } from "@/app/api/admin/change-requests/[id]/route";
import { GET as publicCompanyGET } from "@/app/api/companies/[slug]/route";

const tag = `off-${Date.now()}`;

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
      categoryId, slug, name: "Off Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = company.id;
  const provider = await prisma.user.create({
    data: {
      email: `${tag}-p@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "PROVIDER", isActive: true, name: "P", companyId,
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `${tag}-a@test.local`, passwordHash: await hashPassword("pw12345678"),
      role: "ADMIN", isActive: true, name: "A",
    },
  });
  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({ where: { companyId } });
  await prisma.offering.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function createOffering(body: Record<string, unknown>) {
  const res = await offeringPOST(
    req("/api/provider/offerings", { method: "POST", token: providerToken, body }),
    undefined as never,
  );
  return { status: res.status, body: await res.json() };
}

const validRange = { name: "Full finishing", pricingModel: "RANGE", priceMin: 10000, priceMax: 20000 };

describe("pricing validation", () => {
  it("rejects a price on an ON_INSPECTION offering", async () => {
    const { status } = await createOffering({
      name: "Quoted after visit", pricingModel: "ON_INSPECTION", priceMin: 5000,
    });
    expect(status).toBe(400);
  });

  it("accepts ON_INSPECTION with no price", async () => {
    const { status } = await createOffering({ name: "Quoted", pricingModel: "ON_INSPECTION" });
    expect(status).toBe(201);
  });

  it("rejects a RANGE whose max is below its min", async () => {
    const { status } = await createOffering({
      name: "Backwards", pricingModel: "RANGE", priceMin: 9000, priceMax: 100,
    });
    expect(status).toBe(400);
  });

  it("rejects a RANGE missing one bound", async () => {
    const { status } = await createOffering({ name: "Half", pricingModel: "RANGE", priceMin: 100 });
    expect(status).toBe(400);
  });

  it("rejects PER_UNIT without a unit", async () => {
    const { status } = await createOffering({
      name: "Per what", pricingModel: "PER_UNIT", priceMin: 2500,
    });
    expect(status).toBe(400);
  });

  it("accepts PER_UNIT with a unit", async () => {
    const { status } = await createOffering({
      name: "Per sqm", pricingModel: "PER_UNIT", priceMin: 2500, unit: "SQM",
    });
    expect(status).toBe(201);
  });
});

describe("draft lifecycle", () => {
  it("creates offerings as unpublished drafts", async () => {
    const { body } = await createOffering(validRange);
    expect(body.isPublished).toBe(false);
  });

  it("keeps drafts off the public profile", async () => {
    const res = await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }));
    const company = await res.json();
    expect(company.offerings).toEqual([]);
  });

  it("allows direct edits to a free draft", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Editable draft" });
    const res = await offeringPATCH(
      req(`/api/provider/offerings/${draft.id}`, {
        method: "PATCH", token: providerToken, body: { name: "Edited directly" },
      }),
      ctx({ id: draft.id }),
    );
    const out = await res.json();
    expect(res.status).toBe(200);
    expect(out.path).toBe("direct");
    expect(out.offering.name).toBe("Edited directly");
  });
});

// The security property this whole feature rests on.
describe("publish lock", () => {
  let draftId = "";
  let crId = "";

  it("files a PUBLISH request", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Pending publish" });
    draftId = draft.id;
    const res = await publishPOST(
      req(`/api/provider/offerings/${draftId}/publish`, { method: "POST", token: providerToken }),
      ctx({ id: draftId }),
    );
    expect(res.status).toBe(201);
    crId = (await res.json()).changeRequestId;
  });

  // Without this, a provider could submit clean content, wait for the admin to
  // read it, rewrite the price to 1 EGP, and have the approval publish the
  // rewrite. The admin would have approved one thing and shipped another.
  it("REFUSES edits to a draft with a publish request pending", async () => {
    const res = await offeringPATCH(
      req(`/api/provider/offerings/${draftId}`, {
        method: "PATCH", token: providerToken, body: { priceMin: 1, priceMax: 1 },
      }),
      ctx({ id: draftId }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("REFUSES deletion while a publish request is pending", async () => {
    const res = await offeringDELETE(
      req(`/api/provider/offerings/${draftId}`, { method: "DELETE", token: providerToken }),
      ctx({ id: draftId }),
    );
    expect(res.status).toBe(409);
  });

  it("still allows isActive/sortOrder — the operational escape hatch", async () => {
    const res = await visibilityPATCH(
      req(`/api/provider/offerings/${draftId}/visibility`, {
        method: "PATCH", token: providerToken, body: { isActive: false },
      }),
      ctx({ id: draftId }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).isActive).toBe(false);
  });

  it("unlocks the draft once the request is withdrawn", async () => {
    await crCancelDELETE(
      req(`/api/provider/change-requests/${crId}`, { method: "DELETE", token: providerToken }),
      ctx({ id: crId }),
    );
    const res = await offeringPATCH(
      req(`/api/provider/offerings/${draftId}`, {
        method: "PATCH", token: providerToken, body: { name: "Now editable" },
      }),
      ctx({ id: draftId }),
    );
    expect(res.status).toBe(200);
  });
});

describe("publish approval integrity", () => {
  // The second line of defence: even if the lock were bypassed by a race, what
  // gets published must be what the admin actually reviewed.
  it("refuses to publish when the draft changed after submission", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Drifting draft" });
    const pub = await publishPOST(
      req(`/api/provider/offerings/${draft.id}/publish`, { method: "POST", token: providerToken }),
      ctx({ id: draft.id }),
    );
    const { changeRequestId } = await pub.json();

    // Simulate the race the lock cannot cover: mutate the row directly.
    await prisma.offering.update({ where: { id: draft.id }, data: { priceMin: 1, priceMax: 1 } });

    const res = await adminReviewPATCH(
      req(`/api/admin/change-requests/${changeRequestId}`, {
        method: "PATCH", token: adminToken, body: { action: "approve" },
      }),
      ctx({ id: changeRequestId }),
    );
    expect(res.status).toBe(409);

    const row = await prisma.offering.findUnique({ where: { id: draft.id } });
    expect(row?.isPublished).toBe(false); // nothing was published
  });

  it("publishes an unchanged draft and it appears publicly", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Clean publish" });
    const pub = await publishPOST(
      req(`/api/provider/offerings/${draft.id}/publish`, { method: "POST", token: providerToken }),
      ctx({ id: draft.id }),
    );
    const { changeRequestId } = await pub.json();

    const res = await adminReviewPATCH(
      req(`/api/admin/change-requests/${changeRequestId}`, {
        method: "PATCH", token: adminToken, body: { action: "approve" },
      }),
      ctx({ id: changeRequestId }),
    );
    expect(res.status).toBe(200);

    const profile = await (await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }))).json();
    const names = profile.offerings.map((o: { name: string }) => o.name);
    expect(names).toContain("Clean publish");
  });
});

describe("published offerings go through review", () => {
  let publishedId = "";

  beforeAll(async () => {
    const row = await prisma.offering.findFirst({
      where: { companyId, name: "Clean publish", isPublished: true },
    });
    publishedId = row!.id;
  });

  it("does NOT touch the row — it files a change request instead", async () => {
    const res = await offeringPATCH(
      req(`/api/provider/offerings/${publishedId}`, {
        method: "PATCH", token: providerToken, body: { priceMin: 15000, priceMax: 25000 },
      }),
      ctx({ id: publishedId }),
    );
    const out = await res.json();
    expect(out.path).toBe("review");

    const row = await prisma.offering.findUnique({ where: { id: publishedId } });
    expect(row?.priceMin).toBe(10000); // unchanged
  });

  // The reason there is no review status on the row itself.
  it("keeps the published offering visible during review", async () => {
    const profile = await (await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }))).json();
    const names = profile.offerings.map((o: { name: string }) => o.name);
    expect(names).toContain("Clean publish");
  });

  it("applies the change once approved", async () => {
    const cr = await prisma.changeRequest.findFirst({
      where: { entity: "OFFERING", entityId: publishedId, status: "PENDING" },
    });
    await adminReviewPATCH(
      req(`/api/admin/change-requests/${cr!.id}`, {
        method: "PATCH", token: adminToken, body: { action: "approve" },
      }),
      ctx({ id: cr!.id }),
    );
    const row = await prisma.offering.findUnique({ where: { id: publishedId } });
    expect(row?.priceMin).toBe(15000);
    expect(row?.priceUpdatedAt).not.toBeNull();
  });

  it("hides an offering immediately via isActive, no approval needed", async () => {
    await visibilityPATCH(
      req(`/api/provider/offerings/${publishedId}/visibility`, {
        method: "PATCH", token: providerToken, body: { isActive: false },
      }),
      ctx({ id: publishedId }),
    );
    const profile = await (await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }))).json();
    const names = profile.offerings.map((o: { name: string }) => o.name);
    expect(names).not.toContain("Clean publish");

    // restore for later assertions
    await visibilityPATCH(
      req(`/api/provider/offerings/${publishedId}/visibility`, {
        method: "PATCH", token: providerToken, body: { isActive: true },
      }),
      ctx({ id: publishedId }),
    );
  });
});

describe("tiers", () => {
  // A live offering of this block's own. The publish FLOW is covered above; here
  // it is only a fixture, so it is published directly.
  let liveId = "";
  beforeAll(async () => {
    const { body } = await createOffering({ ...validRange, name: "Live bands" });
    liveId = body.id;
    await prisma.offering.update({ where: { id: liveId }, data: { isPublished: true } });
  });

  it("rejects overlapping quantity ranges", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Tiered" });
    const first = await tierPOST(
      req(`/api/provider/offerings/${draft.id}/tiers`, {
        method: "POST", token: providerToken,
        body: { label: "1-3 rooms", qtyMin: 1, qtyMax: 3, priceMin: 5000 },
      }),
      ctx({ id: draft.id }),
    );
    expect(first.status).toBe(201);

    // 3 is covered by both bands — which price applies would be a coin toss.
    const clash = await tierPOST(
      req(`/api/provider/offerings/${draft.id}/tiers`, {
        method: "POST", token: providerToken,
        body: { label: "3-5 rooms", qtyMin: 3, qtyMax: 5, priceMin: 9000 },
      }),
      ctx({ id: draft.id }),
    );
    expect(clash.status).toBe(400);

    const ok = await tierPOST(
      req(`/api/provider/offerings/${draft.id}/tiers`, {
        method: "POST", token: providerToken,
        body: { label: "4-5 rooms", qtyMin: 4, qtyMax: 5, priceMin: 9000 },
      }),
      ctx({ id: draft.id }),
    );
    expect(ok.status).toBe(201);
  });

  it("publishes a band added to a DRAFT offering straight through", async () => {
    const { body: draft } = await createOffering({ ...validRange, name: "Draft bands" });
    const res = await tierPOST(
      req(`/api/provider/offerings/${draft.id}/tiers`, {
        method: "POST", token: providerToken,
        body: { label: "1-2", qtyMin: 1, qtyMax: 2, priceMin: 4000 },
      }),
      ctx({ id: draft.id }),
    );
    const body = await res.json();
    expect(body.path).toBe("direct");
    expect(body.changeRequestId).toBeUndefined();
    // Written published so it goes live WITH its parent — the admin reviews the
    // offering's whole content at PUBLISH time, bands included.
    expect(body.offering.tiers[0].isPublished).toBe(true);
  });

  // The regression this whole flag exists for. A tier price OVERRIDES the
  // offering's for the line it matches, so a band added to a live offering used
  // to change public pricing with no review at all — the one Feature B write
  // path that skipped the gate.
  it("holds a band added to a PUBLISHED offering for review, and keeps it off the public profile", async () => {
    const res = await tierPOST(
      req(`/api/provider/offerings/${liveId}/tiers`, {
        method: "POST", token: providerToken,
        body: { label: "sneaky 1-1", qtyMin: 1, qtyMax: 1, priceMin: 1 },
      }),
      ctx({ id: liveId }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.path).toBe("review");
    expect(body.changeRequestId).toBeTruthy();

    const stored = await prisma.offeringTier.findFirst({ where: { label: "sneaky 1-1" } });
    expect(stored?.isPublished).toBe(false);

    // The customer-facing profile must not carry it.
    const profile = await (await publicCompanyGET(req(`/api/companies/${slug}`), ctx({ slug }))).json();
    const live = profile.offerings.find((o: { id: string }) => o.id === liveId);
    expect(live.tiers.map((t: { label: string }) => t.label)).not.toContain("sneaky 1-1");

    // ...and once an admin approves, it does.
    await adminReviewPATCH(
      req(`/api/admin/change-requests/${body.changeRequestId}`, {
        method: "PATCH", token: adminToken, body: { action: "approve" },
      }),
      ctx({ id: body.changeRequestId }),
    );
    const after = await prisma.offeringTier.findFirst({ where: { label: "sneaky 1-1" } });
    expect(after?.isPublished).toBe(true);
  });

  it("files a delete request for a published band instead of removing it", async () => {
    const tier = await prisma.offeringTier.findFirst({
      where: { offeringId: liveId, label: "sneaky 1-1" },
    });
    const res = await tierDELETE(
      req(`/api/provider/offerings/${liveId}/tiers/${tier!.id}`, {
        method: "DELETE", token: providerToken,
      }),
      ctx({ id: liveId, tierId: tier!.id }),
    );
    const body = await res.json();
    expect(body.path).toBe("review");
    // Still quotable until an admin acts — a live price list does not change
    // under customers mid-review.
    expect(await prisma.offeringTier.findUnique({ where: { id: tier!.id } })).not.toBeNull();
  });
});

describe("ownership", () => {
  it("lists only this company's offerings", async () => {
    const res = await offeringsGET(
      req("/api/provider/offerings", { token: providerToken }),
      undefined as never,
    );
    const list = await res.json();
    expect(list.every((o: { companyId: string }) => o.companyId === companyId)).toBe(true);
  });
});
