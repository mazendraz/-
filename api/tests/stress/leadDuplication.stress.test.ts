// Duplicate-submission stress for the ONE write that is this product's whole
// point: POST /api/leads.
//
// A lead is an order. The business promise around it is stated in
// leads.service.ts's own comment on DEDUP_WINDOW_MS — "collapse an identical
// (company + phone + service) re-submit within this window into a 409" — and
// repeated in the waitlist service, which copies the guard so "a double-click is
// [not] a duplicate on one path and not the other".
//
// These tests take that promise literally and ask whether it survives the
// conditions that actually produce a re-submit in the field. Every one of them
// is a real user action, not a synthetic torture case:
//
//   • the customer taps "Send" twice because the spinner is not obviously moving
//   • the phone drops to 3G mid-POST, the client times out, and retries
//   • the same account is open on the phone and on a laptop
//
// The control test at the bottom (sequential re-submit) proves the guard itself
// works, so a failure above it can only be about concurrency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as leadsPOST } from "@/app/api/leads/route";
import { burst, createFixture, destroyFixture, leadPayload, makeTag, read, req, statusTally, type Fixture } from "./helpers";

const tag = makeTag("dup");
let f: Fixture;

beforeAll(async () => {
  f = await createFixture(tag);
});

afterAll(async () => {
  await destroyFixture(f);
});

/** Every lead this company received for one phone number. */
async function leadsFor(phone: string) {
  return prisma.lead.findMany({
    where: { companyId: f.companyId, phone },
    select: { id: true, refNumber: true, service: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

describe("POST /api/leads — identical concurrent submissions", () => {
  it("double-tap on Send creates exactly ONE lead", async () => {
    const payload = leadPayload(f.companySlug);

    // Two requests in flight at once, one IP, one device — a double-tap.
    const results = await burst(2, () =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.1.0.1" })),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await leadsFor(payload.phone as string);
    expect(
      rows.length,
      `double-tap produced ${rows.length} leads (statuses: ${JSON.stringify(tally)}); ` +
        `refs: ${rows.map((r) => r.refNumber).join(", ")}`,
    ).toBe(1);
    // The loser must be told why, not handed a second order confirmation.
    expect(tally["201"]).toBe(1);
    expect(tally["409"]).toBe(1);
  });

  it("a 5-tap burst from one device creates exactly ONE lead", async () => {
    // 5 is the per-IP cap for this route, so every one of these is *allowed*
    // through the rate limiter and reaches the de-duplication logic — which is
    // the layer under test.
    const payload = leadPayload(f.companySlug);

    const results = await burst(5, () =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.1.0.2" })),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await leadsFor(payload.phone as string);
    expect(
      rows.length,
      `5-tap burst produced ${rows.length} leads (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });

  it("the same request from 20 devices/networks creates exactly ONE lead", async () => {
    // Distinct IPs: a retry storm across a reconnecting mobile network, or one
    // account open on several devices. The per-IP limiter cannot see this —
    // de-duplication is the only thing standing between it and 20 orders.
    const payload = leadPayload(f.companySlug);

    const results = await burst(20, (i) =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: `10.2.0.${i + 1}` })),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await leadsFor(payload.phone as string);
    expect(
      rows.length,
      `20-way concurrent submit produced ${rows.length} leads (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });

  it("mobile and web submitting together create exactly ONE lead", async () => {
    // The narrowest real race: two clients, two networks, same instant.
    const payload = leadPayload(f.companySlug);

    const results = await burst(2, (i) =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: i === 0 ? "10.3.0.1" : "10.3.0.2" })),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const rows = await leadsFor(payload.phone as string);
    expect(
      rows.length,
      `mobile+web produced ${rows.length} leads (statuses: ${JSON.stringify(tally)})`,
    ).toBe(1);
  });
});

describe("POST /api/leads — the de-duplication guard itself", () => {
  it("rejects a sequential re-submit with 409 (control)", async () => {
    // Not concurrent: the second request starts only after the first has fully
    // committed. This is the guard working as designed — if this passes while
    // the tests above fail, the defect is exclusively in the concurrent path.
    const payload = leadPayload(f.companySlug);

    const first = await read(await leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.4.0.1" })));
    expect(first.status).toBe(201);

    const second = await read(await leadsPOST(req("/api/leads", { method: "POST", body: payload, ip: "10.4.0.1" })));
    expect(second.status).toBe(409);

    const rows = await leadsFor(payload.phone as string);
    expect(rows.length).toBe(1);
  });

  it("keeps genuinely different requests from the same customer", async () => {
    // The guard must not over-collapse: a customer who orders a second, DIFFERENT
    // service ten seconds later has placed a second real order.
    const phone = leadPayload(f.companySlug).phone as string;

    const a = await read(
      await leadsPOST(req("/api/leads", { method: "POST", body: leadPayload(f.companySlug, { phone, service: "Kitchen fit-out" }), ip: "10.4.0.2" })),
    );
    const b = await read(
      await leadsPOST(req("/api/leads", { method: "POST", body: leadPayload(f.companySlug, { phone, service: "Bathroom renovation" }), ip: "10.4.0.2" })),
    );

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const rows = await leadsFor(phone);
    expect(rows.length).toBe(2);
  });
});

describe("POST /api/leads — data integrity after a concurrent burst", () => {
  it("never issues the same reference number twice", async () => {
    // refNumber is the customer-facing identifier printed in the confirmation
    // email and used to track the request. generateRefNumber() is random with a
    // 5-attempt collision retry; this asserts the retry actually holds under
    // simultaneous creation.
    const results = await burst(30, (i) =>
      leadsPOST(req("/api/leads", { method: "POST", body: leadPayload(f.companySlug), ip: `10.5.0.${i + 1}` })),
    );
    const created = results.filter((r) => r.status === "fulfilled" && r.value.status === 201);
    expect(created.length, "expected all 30 distinct submissions to be accepted").toBe(30);

    const rows = await prisma.lead.findMany({
      where: { companyId: f.companyId },
      select: { refNumber: true },
    });
    const refs = rows.map((r) => r.refNumber);
    expect(new Set(refs).size, "duplicate refNumber issued").toBe(refs.length);
  });

  it("gives every created lead exactly one chat thread", async () => {
    // createLeadRecord opens the conversation in the same nested write as the
    // lead, so a lead with zero threads (or two) means the write was not atomic.
    const leads = await prisma.lead.findMany({
      where: { companyId: f.companyId },
      select: { id: true, refNumber: true, conversation: { select: { id: true } } },
    });
    const threadless = leads.filter((l) => !l.conversation);
    expect(threadless.map((l) => l.refNumber), "leads with no chat thread").toEqual([]);
  });

  it("leaves no lead with a dangling client link", async () => {
    // Lead.clientId is SetNull and resolved outside the lead's transaction
    // (upsertClientForLead) — a concurrent burst is exactly when that
    // best-effort upsert could point at a row that no longer exists.
    const orphans = await prisma.lead.findMany({
      where: { companyId: f.companyId, clientId: { not: null }, client: { is: null } },
      select: { refNumber: true },
    });
    expect(orphans.map((l) => l.refNumber), "leads referencing a missing Client").toEqual([]);
  });
});
