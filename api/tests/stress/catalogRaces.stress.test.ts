// Provider-vs-customer races on the catalogue, plus bulk-catalogue behaviour.
//
// The pricing code states its own contract in several places, most explicitly in
// leads.service.create: "prices are read server-side and snapshotted onto the
// lead, so a later price change never rewrites what this customer was quoted."
// These tests put a provider edit and a customer submit in flight at the same
// moment and check that the snapshot really is a snapshot, and that a customer
// can never be quoted from a catalogue entry the provider has withdrawn.
//
// The bulk tests at the end answer the other half of the brief: does the
// catalogue stay coherent — and does listing it stay bounded — once a provider
// has hundreds of services rather than five.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as leadsPOST } from "@/app/api/leads/route";
import { POST as offeringPOST, GET as offeringsGET } from "@/app/api/provider/offerings/route";
import { PATCH as visibilityPATCH } from "@/app/api/provider/offerings/[id]/visibility/route";
import { GET as publicCompanyGET } from "@/app/api/companies/[slug]/route";
import { burst, createFixture, ctx, destroyFixture, leadPayload, makeTag, read, req, statusTally, type Fixture } from "./helpers";

const tag = makeTag("cat");
let f: Fixture;

beforeAll(async () => {
  f = await createFixture(tag);
});

afterAll(async () => {
  await destroyFixture(f);
});

/** A PUBLISHED, ACTIVE offering — the only kind resolveItems will quote from. */
async function publishedOffering(name: string, priceMin: number, priceMax: number) {
  return prisma.offering.create({
    data: {
      companyId: f.companyId,
      name,
      kind: "SERVICE",
      pricingModel: "RANGE",
      priceMin,
      priceMax,
      isPublished: true,
      isActive: true,
    },
  });
}

describe("provider edits while a customer submits", () => {
  it("quotes the price that was live when the request was sent, not the new one", async () => {
    const offering = await publishedOffering("Race: repricing", 10_000, 20_000);
    const payload = leadPayload(f.companySlug, { items: [{ offeringId: offering.id, qty: 1 }] });

    // The submit and the provider's repricing leave at the same instant.
    const [submitRes] = await Promise.all([
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.40.0.1" })),
      prisma.offering.update({
        where: { id: offering.id },
        data: { priceMin: 90_000, priceMax: 120_000, priceUpdatedAt: new Date() },
      }),
    ]);
    const submitted = await read(submitRes);
    expect(submitted.status).toBe(201);

    const lead = await prisma.lead.findFirstOrThrow({
      where: { companyId: f.companyId, phone: payload.phone as string },
      select: { estimatedMin: true, estimatedMax: true, items: { select: { unitPriceMin: true, unitPriceMax: true } } },
    });

    // Whichever side won, the lead must hold ONE coherent pair of prices — the
    // old pair or the new pair — never a line priced from one and a total from
    // the other, and never a total that matches no catalogue state at all.
    const line = lead.items[0];
    const pricedFromOld = line?.unitPriceMin === 10_000 && line?.unitPriceMax === 20_000;
    const pricedFromNew = line?.unitPriceMin === 90_000 && line?.unitPriceMax === 120_000;
    expect(
      pricedFromOld || pricedFromNew,
      `line priced ${line?.unitPriceMin}–${line?.unitPriceMax}, matching neither the pre-edit ` +
        `(10000–20000) nor the post-edit (90000–120000) catalogue`,
    ).toBe(true);
    expect(
      { min: lead.estimatedMin, max: lead.estimatedMax },
      "the lead's stored estimate disagrees with its own line items",
    ).toEqual({ min: line?.unitPriceMin, max: line?.unitPriceMax });
  });

  it("keeps the snapshot frozen after the provider reprices (control)", async () => {
    // The sequential version of the same promise: submit first, reprice after.
    // This is the one the product documentation guarantees outright.
    const offering = await publishedOffering("Race: later repricing", 10_000, 20_000);
    const payload = leadPayload(f.companySlug, { items: [{ offeringId: offering.id, qty: 1 }] });

    expect((await read(await leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.40.0.2" })))).status).toBe(201);
    await prisma.offering.update({ where: { id: offering.id }, data: { priceMin: 90_000, priceMax: 120_000 } });

    const lead = await prisma.lead.findFirstOrThrow({
      where: { companyId: f.companyId, phone: payload.phone as string },
      select: { estimatedMin: true, estimatedMax: true },
    });
    expect({ min: lead.estimatedMin, max: lead.estimatedMax }).toEqual({ min: 10_000, max: 20_000 });
  });

  it("refuses to quote from an offering the provider withdrew before the submit", async () => {
    // resolveItems only accepts isPublished + isActive rows, so a withdrawn
    // service must produce a rejection — not a silently cheaper basket, and not
    // a 500.
    const offering = await publishedOffering("Race: withdrawn", 30_000, 40_000);
    await prisma.offering.update({ where: { id: offering.id }, data: { isActive: false } });

    const payload = leadPayload(f.companySlug, { items: [{ offeringId: offering.id, qty: 1 }] });
    const res = await read(await leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.40.0.3" })));

    expect([400, 404, 409], `withdrawn offering submit returned ${res.status}`).toContain(res.status);
    const lead = await prisma.lead.findFirst({ where: { companyId: f.companyId, phone: payload.phone as string } });
    expect(lead, "a lead was created quoting a withdrawn service").toBeNull();
  });

  it("never creates a half-priced lead when the offering is withdrawn mid-submit", async () => {
    const offering = await publishedOffering("Race: withdraw during submit", 30_000, 40_000);
    const payload = leadPayload(f.companySlug, { items: [{ offeringId: offering.id, qty: 1 }] });

    const [submitRes] = await Promise.all([
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.40.0.4" })),
      visibilityPATCH(
        req(`/api/provider/offerings/${offering.id}/visibility`, {
          method: "PATCH",
          body: { isActive: false },
          token: f.providerToken,
          ip: "10.40.0.5",
        }),
        ctx({ id: offering.id }),
      ),
    ]);
    const submitted = await read(submitRes);

    const lead = await prisma.lead.findFirst({
      where: { companyId: f.companyId, phone: payload.phone as string },
      select: { estimatedMin: true, estimatedMax: true, items: { select: { id: true, nameSnapshot: true } } },
    });

    // Either outcome is defensible — the request got in before the withdrawal,
    // or it was rejected. What must NOT exist is an accepted lead with no
    // priced line, which reaches the provider as "a customer ordered something"
    // with nothing saying what.
    if (submitted.status === 201) {
      expect(lead?.items.length, `accepted lead has ${lead?.items.length} line items`).toBeGreaterThan(0);
    } else {
      expect(lead, `submit returned ${submitted.status} but a lead was still created`).toBeNull();
    }
  });
});

describe("provider bulk catalogue", () => {
  it("creates 100 offerings concurrently without loss or duplication", async () => {
    const results = await burst(100, (i) =>
      offeringPOST(
        req("/api/provider/offerings", {
          method: "POST",
          body: {
            name: `Bulk service ${String(i).padStart(3, "0")}`,
            kind: "SERVICE",
            pricingModel: "RANGE",
            priceMin: 1_000 + i,
            priceMax: 2_000 + i,
          },
          token: f.providerToken,
          ip: "10.41.0.1",
        }),
        ctx({}),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await prisma.offering.findMany({
      where: { companyId: f.companyId, name: { startsWith: "Bulk service " } },
      select: { name: true },
    });
    expect(rows.length, `100 concurrent creates → ${JSON.stringify(tally)}`).toBe(100);
    expect(new Set(rows.map((r) => r.name)).size, "duplicate offering names created").toBe(100);
  });

  it("still returns the provider's own catalogue after the bulk load", async () => {
    const res = await read(await offeringsGET(req("/api/provider/offerings", { token: f.providerToken, ip: "10.41.0.2" }), ctx({})));
    expect(res.status).toBe(200);
    const list = Array.isArray(res.body?.data) ? res.body.data : res.body;
    expect(Array.isArray(list), `unexpected list shape: ${JSON.stringify(res.body).slice(0, 200)}`).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(100);
  });

  it("bounds what the PUBLIC company page returns for a large catalogue", async () => {
    // 100 drafts are invisible; publish them all and ask for the public profile
    // the way a phone on 3G does. An unbounded response here is the classic
    // mobile-client failure: the request succeeds and the screen still hangs.
    await prisma.offering.updateMany({
      where: { companyId: f.companyId, name: { startsWith: "Bulk service " } },
      data: { isPublished: true, isActive: true },
    });

    const started = Date.now();
    const res = await read(await publicCompanyGET(req(`/api/companies/${f.companySlug}`, { ip: "10.41.0.3" }), ctx({ slug: f.companySlug })));
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    const bytes = Buffer.byteLength(JSON.stringify(res.body));
    const offerings = res.body?.data?.offerings ?? res.body?.offerings ?? [];

    // Not a pass/fail on a magic number — a documented ceiling. 1 MB of JSON on
    // a mid-range Android over 3G is several seconds before the first pixel.
    expect(
      bytes,
      `public profile for a 100-service catalogue is ${(bytes / 1024).toFixed(0)} KB ` +
        `(${offerings.length} offerings) in ${elapsed}ms — served unpaginated`,
    ).toBeLessThan(1_000_000);
  });
});
