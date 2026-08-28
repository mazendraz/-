// The order state machine: LeadStatus (NEW → CONTACTED → IN_PROGRESS →
// COMPLETED / CANCELLED) and the transitions into and out of it.
//
// Two distinct questions:
//
//   1. Which transitions are ALLOWED? The product treats COMPLETED as terminal
//      in a way that has real consequences: reviews.service gates the one-time
//      review on it, leadCompletion.submitCompletion sets it alongside a
//      recorded final amount, and finance recognizes commission off the
//      verification that follows. A lead that can walk back out of COMPLETED —
//      or into it from CANCELLED — makes all three of those inconsistent.
//
//   2. What happens when two people transition it AT ONCE? A provider marking a
//      job done while the customer cancels is not an exotic scenario; it is
//      Tuesday. The final state has to be one of the two, deterministically, and
//      it has to be the one the audit trail and the notifications agree with.
//
// Note that these tests go through the ADMIN path (PATCH /api/leads/[id] with an
// admin token) wherever they need to reach COMPLETED directly. That is not a
// shortcut around a guard: `requireCompletion` is deliberately false for admins
// (see updateStatus's comment), so this is the shipped admin capability.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";
import { POST as completePOST } from "@/app/api/provider/leads/[id]/complete/route";
import { burst, createFixture, ctx, destroyFixture, makeTag, read, req, statusTally, uniquePhone, type Fixture } from "./helpers";

const tag = makeTag("sm");
let f: Fixture;

beforeAll(async () => {
  f = await createFixture(tag);
});

afterAll(async () => {
  await destroyFixture(f);
});

async function makeLead(status: "NEW" | "CONTACTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" = "NEW") {
  return prisma.lead.create({
    data: {
      companyId: f.companyId,
      refNumber: `AA-${tag}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      trackingToken: `tok-${Math.random().toString(36).slice(2, 18)}`,
      customerName: "Test Customer",
      phone: uniquePhone(),
      district: "R7",
      service: "Full apartment finishing",
      budget: "",
      description: "d",
      status,
    },
  });
}

function patch(id: string, status: string, token: string, ip = "10.20.0.1") {
  return leadPATCH(
    req(`/api/leads/${id}`, { method: "PATCH", body: { status }, token, ip }),
    ctx({ id }),
  );
}

describe("lead status — invalid transitions", () => {
  it("refuses to move a COMPLETED lead back to New", async () => {
    // A completed lead may have a recorded final amount, a client verification,
    // a recognized commission and a submitted review hanging off it. Reopening
    // it as "New" puts it back in the provider's unactioned queue while all of
    // that stays attached.
    const lead = await makeLead("COMPLETED");
    const res = await read(await patch(lead.id, "New", f.adminToken));
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    expect(
      after.status,
      `COMPLETED → New returned ${res.status}; lead is now ${after.status}`,
    ).toBe("COMPLETED");
  });

  it("refuses to move a COMPLETED lead to Cancelled", async () => {
    const lead = await makeLead("COMPLETED");
    const res = await read(await patch(lead.id, "Cancelled", f.adminToken));
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    expect(
      after.status,
      `COMPLETED → Cancelled returned ${res.status}; lead is now ${after.status}`,
    ).toBe("COMPLETED");
  });

  it("refuses to resurrect a CANCELLED lead as Completed", async () => {
    // The worst of the set: it manufactures a completed job — and therefore a
    // billable, commission-bearing one — out of a request the customer called off.
    const lead = await makeLead("CANCELLED");
    const res = await read(await patch(lead.id, "Completed", f.adminToken));
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    expect(
      after.status,
      `CANCELLED → Completed returned ${res.status}; lead is now ${after.status}`,
    ).toBe("CANCELLED");
  });

  it("refuses to reopen a CANCELLED lead as In Progress", async () => {
    const lead = await makeLead("CANCELLED");
    const res = await read(await patch(lead.id, "In Progress", f.adminToken));
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    expect(
      after.status,
      `CANCELLED → In Progress returned ${res.status}; lead is now ${after.status}`,
    ).toBe("CANCELLED");
  });

  it("allows the forward path NEW → Contacted → In Progress (control)", async () => {
    // The transitions the pipeline is FOR must keep working — this is what
    // stops the four tests above from being satisfiable by refusing everything.
    const lead = await makeLead("NEW");
    expect((await read(await patch(lead.id, "Contacted", f.providerToken))).status).toBe(200);
    expect((await read(await patch(lead.id, "In Progress", f.providerToken))).status).toBe(200);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });
    expect(after.status).toBe("IN_PROGRESS");
  });
});

describe("lead status — the provider's route to COMPLETED", () => {
  it("blocks a provider setting Completed without the completion form (control)", async () => {
    // The documented backstop for the browser-side guard. Passing here confirms
    // the harness reaches the real guard stack, so the failures above are
    // findings and not a mis-wired test.
    const lead = await makeLead("IN_PROGRESS");
    const res = await read(await patch(lead.id, "Completed", f.providerToken));

    expect(res.status).toBe(409);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });
    expect(after.status).toBe("IN_PROGRESS");
  });

  it("refuses to complete a CANCELLED lead through the completion form", async () => {
    // Same business rule as "CANCELLED → Completed" above, reached through the
    // door providers actually use — and this one also books money: submitting
    // the form records a providerAmount and arms the client's verification,
    // which is what recognizes commission.
    const lead = await makeLead("CANCELLED");
    const res = await read(
      await completePOST(
        req(`/api/provider/leads/${lead.id}/complete`, {
          method: "POST",
          body: { providerAmount: 50_000, additionalWork: null },
          token: f.providerToken,
          ip: "10.21.0.1",
        }),
        ctx({ id: lead.id }),
      ),
    );

    const after = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: { status: true, completion: { select: { providerAmount: true } } },
    });
    expect(
      { status: after.status, completion: after.completion },
      `completing a CANCELLED lead returned ${res.status}`,
    ).toEqual({ status: "CANCELLED", completion: null });
  });
});

describe("lead status — simultaneous transitions", () => {
  it("settles deterministically when a provider completes while an admin cancels", async () => {
    const lead = await makeLead("IN_PROGRESS");

    const [completeRes, cancelRes] = await Promise.allSettled([
      completePOST(
        req(`/api/provider/leads/${lead.id}/complete`, {
          method: "POST",
          body: { providerAmount: 50_000, additionalWork: null },
          token: f.providerToken,
          ip: "10.22.0.1",
        }),
        ctx({ id: lead.id }),
      ),
      patch(lead.id, "Cancelled", f.adminToken, "10.22.0.2"),
    ]);

    const after = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: { status: true, completion: { select: { providerAmount: true, verificationStatus: true } } },
    });

    const completeStatus = completeRes.status === "fulfilled" ? completeRes.value.status : "threw";
    const cancelStatus = cancelRes.status === "fulfilled" ? cancelRes.value.status : "threw";

    // The state must not be self-contradictory: a lead is either cancelled with
    // NO recorded final amount, or completed WITH one. "Cancelled, and here is
    // the money you owe" is the combination that must never persist — it leaves
    // a PENDING verification the customer is prompted to confirm for a job that
    // was called off.
    const contradictory = after.status === "CANCELLED" && after.completion !== null;
    expect(
      contradictory,
      `complete→${completeStatus} / cancel→${cancelStatus} left status=${after.status} ` +
        `with completion=${JSON.stringify(after.completion)}`,
    ).toBe(false);
  });

  it("records exactly one completion when a provider double-taps Mark as done", async () => {
    // leadId is UNIQUE on LeadCompletion, so this is the one path in the product
    // with a database-level guarantee behind it. Asserted because that guarantee
    // is what the money depends on.
    const lead = await makeLead("IN_PROGRESS");

    const results = await burst(5, () =>
      completePOST(
        req(`/api/provider/leads/${lead.id}/complete`, {
          method: "POST",
          body: { providerAmount: 50_000, additionalWork: null },
          token: f.providerToken,
          ip: "10.23.0.1",
        }),
        ctx({ id: lead.id }),
      ),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);

    const completions = await prisma.leadCompletion.findMany({ where: { leadId: lead.id } });
    expect(completions.length, `5-way concurrent completion (statuses: ${JSON.stringify(tally)})`).toBe(1);
    expect(tally["201"], "exactly one request may be told it succeeded").toBe(1);
  });

  // NOTE ON WHAT CHANGED HERE.
  //
  // This started as one test asserting that two simultaneous writers must not
  // both receive 200. That assertion was right against the code as it stood — a
  // blind last-write-wins `update` — but it is the wrong question once a state
  // machine exists, and keeping it would have pinned down a behaviour nobody
  // wants.
  //
  // With transitions enforced, "Contacted then Cancelled" is not a lost update:
  // both moves are legal, they applied in a legal order, and the stored result is
  // a state the lead could have reached by a human doing the same two things a
  // second apart. Demanding a 409 there would reject ordinary pipeline work.
  //
  // What genuinely must not happen is two writers reaching INCOMPATIBLE ends, so
  // the pair below splits along exactly that line.

  it("applies two compatible simultaneous transitions to a legal end state", async () => {
    const lead = await makeLead("NEW");

    const [a, b] = await Promise.all([
      patch(lead.id, "Contacted", f.adminToken, "10.24.0.1"),
      patch(lead.id, "In Progress", f.adminToken, "10.24.0.2"),
    ]);
    const [ra, rb] = [await read(a), await read(b)];
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    // Whatever the interleaving, the lead must land on one of the two requested
    // states — never back on NEW, and never on something neither writer asked for.
    expect(
      ["CONTACTED", "IN_PROGRESS"],
      `writers got ${ra.status}/${rb.status}; lead settled on ${after.status}`,
    ).toContain(after.status);
  });

  it("lets only ONE of two conflicting terminal transitions win", async () => {
    // Completed and Cancelled are both terminal and mutually exclusive. Two
    // operators racing to opposite ends is the real conflict: exactly one may be
    // told it succeeded, and the other has to learn that it did not.
    const lead = await makeLead("IN_PROGRESS");

    const [a, b] = await Promise.all([
      patch(lead.id, "Completed", f.adminToken, "10.24.1.1"),
      patch(lead.id, "Cancelled", f.adminToken, "10.24.1.2"),
    ]);
    const [ra, rb] = [await read(a), await read(b)];
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });

    const accepted = [ra.status, rb.status].filter((s) => s === 200).length;
    expect(
      accepted,
      `Completed→${ra.status} / Cancelled→${rb.status}; lead is ${after.status} — ` +
        `both operators were told their opposite decision stuck`,
    ).toBe(1);
    expect(["COMPLETED", "CANCELLED"]).toContain(after.status);
  });
});
