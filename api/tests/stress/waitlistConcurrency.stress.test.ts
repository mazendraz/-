// Waiting-list concurrency.
//
// Two separate promises are under test here, and the second is the more
// expensive one to break:
//
//   1. join()  carries the same (company + phone + service) de-duplication guard
//      as POST /leads. waitlist.service's own comment argues it matters MORE
//      here: "a duplicate lead is visibly duplicated in the pipeline today,
//      while a duplicate queued entry sits unnoticed until someone accepts both."
//
//   2. convertToLead() is documented as "Idempotent: a waitlist entry can only
//      ever be converted once... this is what 'no duplicate records' requires."
//      Accepting is a provider tapping a button in a dashboard — the single most
//      double-clicked control in the product — and the result is a real order
//      with a real customer expecting one phone call about it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as waitlistJoinPOST } from "@/app/api/companies/[slug]/waitlist/route";
import { PATCH as waitlistPATCH } from "@/app/api/provider/waitlist/[id]/route";
import { burst, createFixture, ctx, destroyFixture, makeTag, read, req, statusTally, uniquePhone, type Fixture } from "./helpers";

const tag = makeTag("wl");
let f: Fixture;

beforeAll(async () => {
  f = await createFixture(tag);
});

afterAll(async () => {
  await destroyFixture(f);
});

function joinPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Waiting Customer",
    phone: uniquePhone(),
    service: "Full apartment finishing",
    note: "Call me when a slot opens.",
    district: "R7",
    budget: "",
    ...overrides,
  };
}

/** Create a WAITING entry directly, so the accept tests start from a clean one. */
async function makeEntry() {
  return prisma.waitlistEntry.create({
    data: {
      companyId: f.companyId,
      name: "Waiting Customer",
      phone: uniquePhone(),
      service: "Full apartment finishing",
      note: "Call me when a slot opens.",
      district: "R7",
      budget: "",
      status: "WAITING",
    },
  });
}

describe("POST /api/companies/[slug]/waitlist — concurrent joins", () => {
  it("double-tap on Join creates exactly ONE queue entry", async () => {
    const payload = joinPayload();

    const results = await burst(2, () =>
      waitlistJoinPOST(
        req(`/api/companies/${f.companySlug}/waitlist`, { method: "POST", body: payload, ip: "10.6.0.1" }),
        ctx({ slug: f.companySlug }),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await prisma.waitlistEntry.findMany({
      where: { companyId: f.companyId, phone: payload.phone as string },
    });
    expect(
      rows.length,
      `double-tap produced ${rows.length} queue entries (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });

  it("a 10-way concurrent join creates exactly ONE queue entry", async () => {
    const payload = joinPayload();

    const results = await burst(10, (i) =>
      waitlistJoinPOST(
        req(`/api/companies/${f.companySlug}/waitlist`, { method: "POST", body: payload, ip: `10.7.0.${i + 1}` }),
        ctx({ slug: f.companySlug }),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await prisma.waitlistEntry.findMany({
      where: { companyId: f.companyId, phone: payload.phone as string },
    });
    expect(
      rows.length,
      `10-way concurrent join produced ${rows.length} queue entries (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });

  it("rejects a sequential re-join with 409 (control)", async () => {
    const payload = joinPayload();
    const first = await read(
      await waitlistJoinPOST(
        req(`/api/companies/${f.companySlug}/waitlist`, { method: "POST", body: payload, ip: "10.8.0.1" }),
        ctx({ slug: f.companySlug }),
      ),
    );
    const second = await read(
      await waitlistJoinPOST(
        req(`/api/companies/${f.companySlug}/waitlist`, { method: "POST", body: payload, ip: "10.8.0.1" }),
        ctx({ slug: f.companySlug }),
      ),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });
});

describe("PATCH /api/provider/waitlist/[id] — concurrent accept", () => {
  it("double-tap on Accept converts the entry into exactly ONE lead", async () => {
    const entry = await makeEntry();

    const results = await burst(2, () =>
      waitlistPATCH(
        req(`/api/provider/waitlist/${entry.id}`, {
          method: "PATCH",
          body: { status: "CONVERTED" },
          token: f.providerToken,
          ip: "10.9.0.1",
        }),
        ctx({ id: entry.id }),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const leads = await prisma.lead.findMany({
      where: { companyId: f.companyId, phone: entry.phone },
      select: { id: true, refNumber: true },
    });
    expect(
      leads.length,
      `double-tap on Accept produced ${leads.length} leads (statuses: ${JSON.stringify(tally)}); ` +
        `refs: ${leads.map((l) => l.refNumber).join(", ")}`,
    ).toBe(1);
  });

  it("a 5-way concurrent accept converts the entry into exactly ONE lead", async () => {
    const entry = await makeEntry();

    const results = await burst(5, () =>
      waitlistPATCH(
        req(`/api/provider/waitlist/${entry.id}`, {
          method: "PATCH",
          body: { status: "CONVERTED" },
          token: f.providerToken,
          ip: "10.9.0.2",
        }),
        ctx({ id: entry.id }),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const leads = await prisma.lead.findMany({
      where: { companyId: f.companyId, phone: entry.phone },
      select: { id: true, refNumber: true },
    });
    expect(
      leads.length,
      `5-way concurrent Accept produced ${leads.length} leads (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });

  it("leaves no converted lead that its own waitlist entry has forgotten", async () => {
    // The integrity consequence of the two tests above, stated as its own
    // property: WaitlistEntry.convertedLeadId is the ONLY link back from an
    // accepted entry to the order it became. A lead created by an accept that
    // then lost the race to write that column is invisible from the waiting
    // list — it exists in the pipeline, and in the provider's inbox, with
    // nothing pointing at it.
    const entries = await prisma.waitlistEntry.findMany({
      where: { companyId: f.companyId, status: "CONVERTED" },
      select: { id: true, phone: true, convertedLeadId: true },
    });

    const orphaned: string[] = [];
    for (const e of entries) {
      const leads = await prisma.lead.findMany({
        where: { companyId: f.companyId, phone: e.phone },
        select: { id: true, refNumber: true },
      });
      for (const l of leads) {
        if (l.id !== e.convertedLeadId) orphaned.push(`${l.refNumber} (entry ${e.id})`);
      }
    }
    expect(orphaned, "leads created by an accept that no waitlist entry points to").toEqual([]);
  });

  it("re-accepting an already-converted entry returns the SAME lead (control)", async () => {
    // Sequential, so idempotency is reached the way the code intends: the second
    // call sees convertedLeadId set and returns the existing lead.
    const entry = await makeEntry();

    const first = await read(
      await waitlistPATCH(
        req(`/api/provider/waitlist/${entry.id}`, { method: "PATCH", body: { status: "CONVERTED" }, token: f.providerToken, ip: "10.9.0.3" }),
        ctx({ id: entry.id }),
      ),
    );
    const second = await read(
      await waitlistPATCH(
        req(`/api/provider/waitlist/${entry.id}`, { method: "PATCH", body: { status: "CONVERTED" }, token: f.providerToken, ip: "10.9.0.3" }),
        ctx({ id: entry.id }),
      ),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const leads = await prisma.lead.findMany({ where: { companyId: f.companyId, phone: entry.phone } });
    expect(leads.length, "a sequential re-accept must reuse the existing lead").toBe(1);
  });
});
