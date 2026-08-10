// Feature C: multi-item requests. The property that matters most here is the
// PRICE SNAPSHOT — a submitted request is a record of what the customer was
// quoted, and nothing the provider does afterwards may rewrite it.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

import { POST as leadsPOST } from "@/app/api/leads/route";

const tag = `li-${Date.now()}`;

function req(body: unknown, ip = "10.9.9.9"): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": ip });
  return new NextRequest("http://localhost/api/leads", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

let categoryId = "";
let companyId = "";
let slug = "";
let fixedId = "";
let fixed2Id = "";
let fixed3Id = "";
let rangeId = "";
let inspectId = "";
let inspect2Id = "";
let hugeId = "";
let tierId = "";
let draftTierId = "";

const base = {
  companyName: "Items Co",
  service: "placeholder",
  name: "Test Customer",
  // E.164, not the local "01012345678" form. createLeadSchema validates new
  // submissions with libphonenumber's isValidPhoneNumber and no default region
  // (the frontend's PhoneInput normalizes before sending), so a bare local
  // number is rejected — see validation/leads.test.ts, which asserts exactly
  // that. This fixture predated that change and made every submit() here a 400.
  phone: "+201012345678",
  district: "R7",
  budget: "100k",
  description: "A description long enough to pass validation.",
};

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Cat", description: "d", icon: "home" },
  });
  categoryId = category.id;
  slug = `${tag}-co`;
  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] }, slug, name: "Items Co", tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "0100000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024",
    },
  });
  companyId = company.id;

  const mk = (data: Record<string, unknown>) =>
    prisma.offering.create({
      data: { companyId, isPublished: true, isActive: true, ...data } as never,
    });

  fixedId = (await mk({ name: "Fixed item", pricingModel: "FIXED", priceMin: 10000 })).id;
  rangeId = (await mk({ name: "Range item", pricingModel: "RANGE", priceMin: 5000, priceMax: 9000 })).id;
  inspectId = (await mk({ name: "Inspect item", pricingModel: "ON_INSPECTION" })).id;
  // Distinct twins of the two above. The bundle-threshold tests used to reach a
  // 3-item basket by naming the SAME offering three times — which is now
  // rejected outright (a basket can't list one service twice; see
  // leadItems.service), and was never something the request form could produce.
  // Same prices, so those tests keep their exact expected totals.
  fixed2Id = (await mk({ name: "Fixed item II", pricingModel: "FIXED", priceMin: 10000 })).id;
  fixed3Id = (await mk({ name: "Fixed item III", pricingModel: "FIXED", priceMin: 10000 })).id;
  inspect2Id = (await mk({ name: "Inspect item II", pricingModel: "ON_INSPECTION" })).id;
  // Priced at the schema's per-unit ceiling so a max-quantity line overflows
  // int4 — the column type every money field on Lead/LeadItem actually uses.
  hugeId = (await mk({ name: "Huge item", pricingModel: "FIXED", priceMin: 100_000_000 })).id;

  // isPublished explicit, like the offerings above: this fixture represents a
  // LIVE quotable band. Tiers default to draft now, because one added to an
  // already-published offering is a new public price and waits for review.
  const tier = await prisma.offeringTier.create({
    data: {
      offeringId: rangeId, label: "Bulk", qtyMin: 5, qtyMax: 20,
      priceMin: 4000, priceMax: 6000, isPublished: true,
    },
  });
  tierId = tier.id;

  const draft = await prisma.offeringTier.create({
    data: {
      offeringId: rangeId, label: "Unreviewed", qtyMin: 21, qtyMax: 40,
      priceMin: 1, priceMax: 1, isPublished: false,
    },
  });
  draftTierId = draft.id;
});

afterAll(async () => {
  await prisma.leadItem.deleteMany({ where: { lead: { companyId } } });
  await prisma.lead.deleteMany({ where: { companyId } });
  await prisma.offering.deleteMany({ where: { companyId } });
  await prisma.bundleRule.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

// Each call gets a unique phone. The duplicate-submit guard keys on
// (companyId, phone, service), and several tests deliberately submit the same
// item mix — without this they would collide with each other and 409.
let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  // E.164: +20 then a 10-digit Egyptian mobile starting 10 — the only form
  // createLeadSchema accepts (see `base.phone` above).
  return `+2010${10000000 + phoneSeq}`;
}

async function submit(items: unknown[], overrides: Record<string, unknown> = {}, ip?: string) {
  const res = await leadsPOST(
    req({ ...base, companySlug: slug, phone: nextPhone(), items, ...overrides }, ip),
  );
  return { status: res.status, body: await res.json() };
}

describe("multi-item requests", () => {
  it("prices a single item the same as the old single-service flow", async () => {
    const { status, body } = await submit([{ offeringId: fixedId, qty: 1 }], {}, "10.9.9.1");
    expect(status).toBe(201);
    expect(body.estimatedMin).toBe(10000);
    expect(body.estimatedMax).toBe(10000);
    expect(body.items).toHaveLength(1);
  });

  it("fills Lead.service with the item names so older screens keep working", async () => {
    const { body } = await submit(
      [{ offeringId: fixedId, qty: 2 }, { offeringId: rangeId, qty: 1 }], {}, "10.9.9.2",
    );
    expect(body.service).toContain("Fixed item");
    expect(body.service).toContain("×2");
  });

  it("multiplies by quantity and sums the lines", async () => {
    const { body } = await submit(
      [{ offeringId: fixedId, qty: 2 }, { offeringId: rangeId, qty: 1 }], {}, "10.9.9.3",
    );
    // 2×10000 + 1×(5000..9000)
    expect(body.estimatedMin).toBe(25000);
    expect(body.estimatedMax).toBe(29000);
  });

  it("uses the tier price instead of the offering price", async () => {
    const { body } = await submit([{ offeringId: rangeId, qty: 5, tierId }], {}, "10.9.9.4");
    expect(body.estimatedMin).toBe(20000); // 5 × 4000, not 5 × 5000
    expect(body.items[0].tierLabel).toBe("Bulk");
  });

  // A tier price OVERRIDES the offering's, so an unreviewed band must not be
  // reachable by naming its id — otherwise the review gate could be walked
  // straight past with a hand-made payload.
  it("refuses to quote from a tier that is still awaiting review", async () => {
    const { status } = await submit([{ offeringId: rangeId, qty: 25, tierId: draftTierId }]);
    expect(status).toBe(400);
  });

  it("shows a number plus the inspection flag when the basket mixes both", async () => {
    const { body } = await submit(
      [{ offeringId: fixedId, qty: 1 }, { offeringId: inspectId, qty: 1 }], {}, "10.9.9.5",
    );
    expect(body.estimatedMin).toBe(10000);
    expect(body.hasOnInspection).toBe(true);
  });

  // Rendering 0 here would read as "free" rather than "we'll quote you".
  it("produces NO estimate when every item is quoted on inspection", async () => {
    const { body } = await submit([{ offeringId: inspectId, qty: 1 }], {}, "10.9.9.6");
    expect(body.estimatedMin).toBeNull();
    expect(body.estimatedMax).toBeNull();
    expect(body.hasOnInspection).toBe(true);
  });

  it("rejects an offering that belongs to another company", async () => {
    const other = await prisma.company.findFirst({ where: { id: { not: companyId } } });
    const stranger = other
      ? await prisma.offering.findFirst({ where: { companyId: other.id } })
      : null;
    if (!stranger) return; // nothing to test against in this database
    const { status } = await submit([{ offeringId: stranger.id, qty: 1 }], {}, "10.9.9.7");
    expect(status).toBe(400);
  });

  it("rejects a draft offering — it was never on the public profile", async () => {
    const draft = await prisma.offering.create({
      data: { companyId, name: "Draft", pricingModel: "FIXED", priceMin: 1, isPublished: false },
    });
    const { status } = await submit([{ offeringId: draft.id, qty: 1 }], {}, "10.9.9.8");
    expect(status).toBe(400);
  });

  it("still accepts a request with no items at all", async () => {
    const { status, body } = await submit(
      undefined as never, { items: undefined, service: "Classic single service" }, "10.9.9.9",
    );
    expect(status).toBe(201);
    expect(body.items).toEqual([]);
    expect(body.service).toBe("Classic single service");
  });
});

describe("bundle discount", () => {
  beforeAll(async () => {
    await prisma.bundleRule.create({
      data: { companyId, minItems: 3, discountPercent: 15, isPublished: true, isActive: true },
    });
  });

  it("applies once when the item count reaches the threshold", async () => {
    const { body } = await submit([
      { offeringId: fixedId, qty: 1 },
      { offeringId: rangeId, qty: 1 },
      { offeringId: fixed2Id, qty: 1 },
    ], {}, "10.9.8.1");
    // subtotal 10000 + (5000..9000) + 10000 = 25000..29000, less 15%
    expect(body.discountPercent).toBe(15);
    expect(body.estimatedMin).toBe(21250);
  });

  it("counts inspection items toward the threshold but discounts only priced ones", async () => {
    const { body } = await submit([
      { offeringId: fixedId, qty: 1 },
      { offeringId: inspectId, qty: 1 },
      { offeringId: inspect2Id, qty: 1 },
    ], {}, "10.9.8.2");
    expect(body.discountPercent).toBe(15);
    expect(body.estimatedMin).toBe(8500); // 15% off the one priced item
  });

  it("ignores an unpublished rule", async () => {
    await prisma.bundleRule.updateMany({ where: { companyId }, data: { isPublished: false } });
    const { body } = await submit([
      { offeringId: fixedId, qty: 1 },
      { offeringId: fixed2Id, qty: 1 },
      { offeringId: fixed3Id, qty: 1 },
    ], {}, "10.9.8.3");
    expect(body.discountPercent).toBe(0);
    expect(body.estimatedMin).toBe(30000);
    await prisma.bundleRule.updateMany({ where: { companyId }, data: { isPublished: true } });
  });
});

// Both of these are reachable ONLY by hand-writing the payload — the request
// form cannot build either — which is exactly why they are enforced server-side.
// "The UI can't do that" is not a control; it is an assumption about the client.
describe("adversarial baskets", () => {
  it("rejects a basket that names the same offering twice", async () => {
    const { status, body } = await submit([
      { offeringId: fixedId, qty: 1 },
      { offeringId: fixedId, qty: 1 },
    ], {}, "10.9.6.1");
    expect(status).toBe(400);
    expect(body.message).toMatch(/more than once/i);
  });

  // The reason the rule above exists. calculateRequest takes the bundle
  // threshold from items.length, so a repeated line is a second "item" nobody
  // picked — enough on its own to trip a minItems:2 rule and write an unearned
  // discount onto the lead, which is what the provider then sees as the agreed
  // estimate.
  it("does not let a repeated line buy a bundle discount", async () => {
    const rule = await prisma.bundleRule.create({
      data: { companyId, minItems: 2, discountPercent: 50, isPublished: true, isActive: true },
    });
    try {
      const dup = await submit([
        { offeringId: fixedId, qty: 1 },
        { offeringId: fixedId, qty: 1 },
      ], {}, "10.9.6.2");
      expect(dup.status).toBe(400);

      // The same customer genuinely picking two DIFFERENT services still earns it.
      const real = await submit([
        { offeringId: fixedId, qty: 1 },
        { offeringId: fixed2Id, qty: 1 },
      ], {}, "10.9.6.3");
      expect(real.status).toBe(201);
      expect(real.body.discountPercent).toBe(50);
    } finally {
      await prisma.bundleRule.delete({ where: { id: rule.id } });
    }
  });

  // Lead.estimatedMin/Max and LeadItem.lineMin/Max are all Postgres INTEGER.
  // The per-unit cap (100,000,000) times the quantity cap (10,000) is ~465x
  // what int4 holds, so this used to reach the driver as a numeric overflow and
  // come back to a customer as a bare 500 on a public endpoint.
  it("rejects a basket whose total cannot fit an int4 column, with a 400 not a 500", async () => {
    const { status, body } = await submit(
      [{ offeringId: hugeId, qty: 10_000 }], {}, "10.9.6.4",
    );
    expect(status).toBe(400);
    expect(body.message).toMatch(/too large/i);
  });

  it("still accepts a large-but-storable basket", async () => {
    const { status, body } = await submit(
      [{ offeringId: hugeId, qty: 20 }], {}, "10.9.6.5",
    );
    expect(status).toBe(201);
    expect(body.estimatedMin).toBe(2_000_000_000); // just under int4's ceiling
  });
});

// The whole reason LeadItem duplicates data it could read back through the
// relation: a request records an agreement, not a live view of a price list.
describe("price snapshot", () => {
  it("does not change when the provider edits the price afterwards", async () => {
    const { body } = await submit([{ offeringId: fixedId, qty: 1 }], {}, "10.9.7.1");
    const before = body.items[0];

    await prisma.offering.update({
      where: { id: fixedId },
      data: { priceMin: 99999, name: "Renamed after the request" },
    });

    const after = await prisma.leadItem.findFirst({ where: { leadId: body.id } });
    expect(after?.unitPriceMin).toBe(before.unitPriceMin);
    expect(after?.nameSnapshot).toBe("Fixed item");

    await prisma.offering.update({
      where: { id: fixedId },
      data: { priceMin: 10000, name: "Fixed item" },
    });
  });

  it("keeps the line readable after the offering is deleted", async () => {
    const temp = await prisma.offering.create({
      data: { companyId, name: "Temporary item", pricingModel: "FIXED", priceMin: 7000, isPublished: true },
    });
    const { body } = await submit([{ offeringId: temp.id, qty: 1 }], {}, "10.9.7.2");

    await prisma.offering.delete({ where: { id: temp.id } });

    const line = await prisma.leadItem.findFirst({ where: { leadId: body.id } });
    expect(line?.offeringId).toBeNull();       // SetNull, not a cascade delete
    expect(line?.nameSnapshot).toBe("Temporary item");
    expect(line?.unitPriceMin).toBe(7000);
  });
});
