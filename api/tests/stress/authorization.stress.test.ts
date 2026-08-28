// Authorization: what happens when a caller sends a perfectly well-formed
// request for somebody else's data.
//
// The frontend never offers these actions, which is exactly why they are worth
// testing — the browser is not a security boundary, and every id in this system
// travels through a URL. Each test here is a request a curious (or malicious)
// user can make with the credentials they legitimately hold, changing only an id.
//
// Covered:
//   • provider → another provider's leads, waitlist, offerings (horizontal)
//   • provider → admin endpoints (vertical)
//   • customer token → staff endpoints, and the reverse (audience confusion)
//   • customer → another customer's request (horizontal, account-owned path)
//   • unauthenticated → everything above
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signCustomerToken } from "@/lib/auth";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";
import { POST as completePOST } from "@/app/api/provider/leads/[id]/complete/route";
import { PATCH as waitlistPATCH, DELETE as waitlistDELETE } from "@/app/api/provider/waitlist/[id]/route";
import { GET as adminLeadsGET } from "@/app/api/admin/leads/route";
import { GET as adminUsersGET } from "@/app/api/admin/users/route";
import { GET as adminStatsGET } from "@/app/api/admin/stats/route";
import { POST as customerVerifyPOST } from "@/app/api/customer/leads/[id]/verify/route";
import { GET as customerLeadsGET } from "@/app/api/customer/leads/route";
import { createFixture, ctx, destroyFixture, makeTag, read, req, uniquePhone, type Fixture } from "./helpers";

const tag = makeTag("authz");
let f: Fixture;

// A lead owned by the OTHER company — the target of every horizontal test.
let victimLeadId = "";
let victimEntryId = "";

// Two customer accounts, and a lead owned by the first.
let customerAToken = "";
let customerBToken = "";
let customerALeadId = "";

beforeAll(async () => {
  f = await createFixture(tag);

  const victimLead = await prisma.lead.create({
    data: {
      companyId: f.otherCompanyId,
      refNumber: `AA-${tag}-VICTIM`,
      trackingToken: `tok-${tag}-victim`,
      customerName: "Victim Customer",
      phone: uniquePhone(),
      district: "R7",
      service: "Full apartment finishing",
      budget: "",
      description: "d",
      status: "IN_PROGRESS",
    },
  });
  victimLeadId = victimLead.id;

  const victimEntry = await prisma.waitlistEntry.create({
    data: {
      companyId: f.otherCompanyId,
      name: "Victim Waiter",
      phone: uniquePhone(),
      service: "Kitchen",
      status: "WAITING",
    },
  });
  victimEntryId = victimEntry.id;

  const passwordHash = await hashPassword("customer-pass-123");
  const custA = await prisma.customerUser.create({
    data: { email: `${tag}-cust-a@test.local`, name: "Cust A", passwordHash, emailVerified: true, isActive: true },
  });
  const custB = await prisma.customerUser.create({
    data: { email: `${tag}-cust-b@test.local`, name: "Cust B", passwordHash, emailVerified: true, isActive: true },
  });
  customerAToken = await signCustomerToken({ sub: custA.id });
  customerBToken = await signCustomerToken({ sub: custB.id });

  const custALead = await prisma.lead.create({
    data: {
      companyId: f.companyId,
      refNumber: `AA-${tag}-CUSTA`,
      trackingToken: `tok-${tag}-custa`,
      customerName: "Cust A",
      phone: uniquePhone(),
      district: "R7",
      service: "Full apartment finishing",
      budget: "",
      description: "d",
      status: "COMPLETED",
      customerId: custA.id,
      completion: { create: { providerAmount: 90_000 } },
    },
  });
  customerALeadId = custALead.id;
});

afterAll(async () => {
  await destroyFixture(f);
});

const DENIED = [401, 403, 404];

describe("provider → another company's data (horizontal)", () => {
  it("cannot change the status of another company's lead", async () => {
    const res = await read(
      await leadPATCH(
        req(`/api/leads/${victimLeadId}`, { method: "PATCH", body: { status: "Cancelled" }, token: f.providerToken, ip: "10.30.0.1" }),
        ctx({ id: victimLeadId }),
      ),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: victimLeadId }, select: { status: true } });
    expect(after.status, "another company's lead was modified").toBe("IN_PROGRESS");
  });

  it("cannot mark another company's lead completed (and bill it)", async () => {
    const res = await read(
      await completePOST(
        req(`/api/provider/leads/${victimLeadId}/complete`, {
          method: "POST",
          body: { providerAmount: 999_999, additionalWork: null },
          token: f.providerToken,
          ip: "10.30.0.2",
        }),
        ctx({ id: victimLeadId }),
      ),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);

    const completion = await prisma.leadCompletion.findUnique({ where: { leadId: victimLeadId } });
    expect(completion, "a completion was recorded on another company's lead").toBeNull();
  });

  it("cannot accept another company's waitlist entry", async () => {
    const res = await read(
      await waitlistPATCH(
        req(`/api/provider/waitlist/${victimEntryId}`, { method: "PATCH", body: { status: "CONVERTED" }, token: f.providerToken, ip: "10.30.0.3" }),
        ctx({ id: victimEntryId }),
      ),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);

    const after = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: victimEntryId }, select: { status: true, convertedLeadId: true } });
    expect(after.status).toBe("WAITING");
    expect(after.convertedLeadId).toBeNull();
  });

  it("cannot delete another company's waitlist entry", async () => {
    const res = await read(
      await waitlistDELETE(
        req(`/api/provider/waitlist/${victimEntryId}`, { method: "DELETE", token: f.providerToken, ip: "10.30.0.4" }),
        ctx({ id: victimEntryId }),
      ),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);

    const still = await prisma.waitlistEntry.findUnique({ where: { id: victimEntryId } });
    expect(still, "another company's waitlist entry was deleted").not.toBeNull();
  });
});

describe("provider → admin endpoints (vertical)", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["GET /admin/leads", () => adminLeadsGET(req("/api/admin/leads", { token: f.providerToken, ip: "10.31.0.1" }), ctx({}))],
    ["GET /admin/users", () => adminUsersGET(req("/api/admin/users", { token: f.providerToken, ip: "10.31.0.2" }), ctx({}))],
    ["GET /admin/stats", () => adminStatsGET(req("/api/admin/stats", { token: f.providerToken, ip: "10.31.0.3" }), ctx({}))],
  ];

  for (const [name, call] of cases) {
    it(`refuses a provider token on ${name}`, async () => {
      const res = await read(await call());
      expect(DENIED, `${name} returned ${res.status}`).toContain(res.status);
    });
  }
});

describe("token audience confusion", () => {
  it("refuses a CUSTOMER token on a staff endpoint", async () => {
    // A customer token carries no role and no companyId by construction; this
    // asserts the guard rejects it on the `typ` claim rather than defaulting.
    const res = await read(await adminLeadsGET(req("/api/admin/leads", { token: customerAToken, ip: "10.32.0.1" }), ctx({})));
    expect(DENIED, `status ${res.status}`).toContain(res.status);
  });

  it("refuses a STAFF token on a customer endpoint", async () => {
    const res = await read(
      await customerLeadsGET(req("/api/customer/leads", { token: f.adminToken, ip: "10.32.0.2" }), ctx({})),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);
  });

  it("refuses a token signed with the wrong secret", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJzdGFmZiIsInJvbGUiOiJBRE1JTiIsInN1YiI6ImZha2UifQ.not-a-real-signature";
    const res = await read(await adminLeadsGET(req("/api/admin/leads", { token: forged, ip: "10.32.0.3" }), ctx({})));
    expect(DENIED, `status ${res.status}`).toContain(res.status);
  });

  it("refuses an unauthenticated request to a staff endpoint", async () => {
    const res = await read(await adminLeadsGET(req("/api/admin/leads", { ip: "10.32.0.4" }), ctx({})));
    expect(DENIED, `status ${res.status}`).toContain(res.status);
  });
});

describe("customer → another customer's request (horizontal)", () => {
  it("cannot verify the final amount on a request they do not own", async () => {
    // Confirming a final amount is a money decision: it closes the price
    // dispute window and recognizes commission. Customer B doing it for
    // Customer A's job is both a data-integrity and a privacy failure.
    const res = await read(
      await customerVerifyPOST(
        req(`/api/customer/leads/${customerALeadId}/verify`, {
          method: "POST",
          body: { decision: "confirmed" },
          token: customerBToken,
          ip: "10.33.0.1",
        }),
        ctx({ id: customerALeadId }),
      ),
    );
    expect(DENIED, `status ${res.status}`).toContain(res.status);

    const completion = await prisma.leadCompletion.findUniqueOrThrow({ where: { leadId: customerALeadId } });
    expect(completion.verificationStatus, "another customer resolved this verification").toBe("PENDING");
  });

  it("does not list another customer's requests", async () => {
    const res = await read(await customerLeadsGET(req("/api/customer/leads", { token: customerBToken, ip: "10.33.0.2" }), ctx({})));
    if (res.status === 200) {
      const ids: string[] = (res.body?.data ?? []).map((l: { id: string }) => l.id);
      expect(ids, "customer B can see customer A's request").not.toContain(customerALeadId);
    } else {
      expect(DENIED).toContain(res.status);
    }
  });

  it("lets the owner verify their own request (control)", async () => {
    const res = await read(
      await customerVerifyPOST(
        req(`/api/customer/leads/${customerALeadId}/verify`, {
          method: "POST",
          body: { decision: "confirmed" },
          token: customerAToken,
          ip: "10.33.0.3",
        }),
        ctx({ id: customerALeadId }),
      ),
    );
    expect(res.status, "the owning customer must be able to confirm").toBe(200);

    const completion = await prisma.leadCompletion.findUniqueOrThrow({ where: { leadId: customerALeadId } });
    expect(completion.verificationStatus).toBe("CONFIRMED");
    // A confirmed amount is always the provider's own total, never client-supplied.
    expect(completion.clientAmount).toBe(90_000);
  });
});

describe("verification is a one-shot money decision", () => {
  it("recognizes commission exactly once under a concurrent double-confirm", async () => {
    // Built fresh: the control test above already consumed customerALead.
    const cust = await prisma.customerUser.create({
      data: { email: `${tag}-cust-c@test.local`, name: "Cust C", passwordHash: await hashPassword("x-pass-123"), emailVerified: true, isActive: true },
    });
    const token = await signCustomerToken({ sub: cust.id });
    const lead = await prisma.lead.create({
      data: {
        companyId: f.companyId,
        refNumber: `AA-${tag}-DBL`,
        trackingToken: `tok-${tag}-dbl`,
        customerName: "Cust C",
        phone: uniquePhone(),
        district: "R7",
        service: "Full apartment finishing",
        budget: "",
        description: "d",
        status: "COMPLETED",
        customerId: cust.id,
        completion: { create: { providerAmount: 120_000 } },
      },
    });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        customerVerifyPOST(
          req(`/api/customer/leads/${lead.id}/verify`, {
            method: "POST",
            body: { decision: "confirmed" },
            token,
            ip: `10.34.0.${i + 1}`,
          }),
          ctx({ id: lead.id }),
        ),
      ),
    );
    const okCount = results.filter((r) => r.status === "fulfilled" && r.value.status === 200).length;

    const commissions = await prisma.transaction.findMany({
      where: { leadId: lead.id, type: "COMMISSION_INCOME" },
      select: { id: true, amount: true },
    });
    expect(
      commissions.length,
      `5 concurrent confirms → ${okCount} accepted, ${commissions.length} commission rows`,
    ).toBeLessThanOrEqual(1);
    expect(okCount, "only one confirm may be reported as successful").toBe(1);
  });
});
