// The two rules POST /api/leads must enforce that only the CLIENTS enforced
// before: a company that is currently unavailable does not receive direct
// requests (they belong on the waiting list), and a signed-in customer with an
// unconfirmed final amount settles that first.
//
// Both were previously UI-only — the mobile app swaps the CTA / raises a
// full-screen gate, the website does the same — so a patched bundle or a plain
// curl with the session's Bearer token ignored them entirely.
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOUR = 3_600_000;

interface CompanyRow {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  busy: boolean;
  busyUntil: Date | null;
  busyWindows: { startsAt: Date; endsAt: Date | null }[];
}

let company: CompanyRow;
let pendingVerificationLead: { id: string; refNumber: string } | null = null;
let recentDuplicate: { id: string } | null = null;
/** Set when the code gets all the way past both gates to the actual insert. */
let reachedInsert = false;

// A distinctive failure thrown from lead.create: it carries no Prisma `code`,
// so createLeadRecord's retry loop rethrows it untouched. Its arrival is proof
// the gates let the request through — far cheaper than mocking the entire
// notification fan-out just to observe a success.
const INSERT_SENTINEL = "reached-the-insert";

const db = {
  company: {
    findFirst: async () => company,
  },
  lead: {
    // create() calls findFirst twice: once for the pending-verification gate
    // (a `completion` filter) and once for the 5-minute duplicate window (a
    // `phone` filter). Distinguished by the shape of `where`, since both are
    // the same model.
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      "completion" in where ? pendingVerificationLead : recentDuplicate,
    create: async () => {
      reachedInsert = true;
      throw new Error(INSERT_SENTINEL);
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// upsertClientForLead runs before the insert and is fail-open at its call site;
// stubbed so it neither needs a mock model nor logs a caught error per test.
vi.mock("@/lib/services/clients.service", () => ({ upsertClientForLead: vi.fn(async () => null) }));

const { create, assertNoPendingVerification } = await import("@/lib/services/leads.service");

const payload = {
  companySlug: "al-nour",
  companyName: "شركة النور",
  service: "Full Interior Design",
  name: "Mona Adel",
  phone: "+201012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "I need a full fit-out for a 3-bedroom apartment.",
};

beforeEach(() => {
  company = {
    id: "co1",
    name: "شركة النور",
    email: "owner@nour.test",
    whatsapp: null,
    busy: false,
    busyUntil: null,
    busyWindows: [],
  };
  pendingVerificationLead = null;
  recentDuplicate = null;
  reachedInsert = false;
});

describe("create — availability is enforced server-side", () => {
  it("refuses a direct request to a company with the manual switch on", async () => {
    company.busy = true;

    await expect(create(payload)).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: ["COMPANY_BUSY"] },
    });
    expect(reachedInsert).toBe(false);
  });

  it("refuses a direct request during a scheduled busy window", async () => {
    company.busyWindows = [{ startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) }];

    await expect(create(payload)).rejects.toMatchObject({ statusCode: 409 });
    expect(reachedInsert).toBe(false);
  });

  it("refuses during an open-ended window (no end date)", async () => {
    company.busyWindows = [{ startsAt: new Date(Date.now() - HOUR), endsAt: null }];

    await expect(create(payload)).rejects.toMatchObject({ statusCode: 409 });
    expect(reachedInsert).toBe(false);
  });

  // The busy flag auto-expires at read time — no cron. The write path has to
  // agree with the read path about that, or a company whose busyUntil passed
  // would keep refusing work it can now take.
  it("accepts once busyUntil has passed, even with busy still true", async () => {
    company.busy = true;
    company.busyUntil = new Date(Date.now() - HOUR);

    await expect(create(payload)).rejects.toThrow(INSERT_SENTINEL);
    expect(reachedInsert).toBe(true);
  });

  it("accepts when a window is scheduled but has not started", async () => {
    company.busyWindows = [{ startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) }];

    await expect(create(payload)).rejects.toThrow(INSERT_SENTINEL);
    expect(reachedInsert).toBe(true);
  });

  it("accepts when a window has already finished", async () => {
    company.busyWindows = [{ startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) }];

    await expect(create(payload)).rejects.toThrow(INSERT_SENTINEL);
    expect(reachedInsert).toBe(true);
  });
});

describe("create — an unconfirmed final amount blocks a new request", () => {
  it("refuses a signed-in customer who still owes a verification", async () => {
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };

    await expect(create(payload, "cust-1")).rejects.toMatchObject({
      statusCode: 409,
      details: {
        reason: ["PENDING_VERIFICATION"],
        // The client needs to know WHICH request to open the gate on.
        leadId: ["lead-9"],
        refNumber: ["AA-20260826-7F3K"],
      },
    });
    expect(reachedInsert).toBe(false);
  });

  it("lets the same customer through once nothing is pending", async () => {
    await expect(create(payload, "cust-1")).rejects.toThrow(INSERT_SENTINEL);
    expect(reachedInsert).toBe(true);
  });

  // The gate is keyed on the ACCOUNT. A guest has none, so there is nothing to
  // owe and nothing to check — and POST /leads still accepts guests today
  // (optionalCustomerId), so this path must stay open.
  it("does not run the check at all for a guest submission", async () => {
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };

    await expect(create(payload)).rejects.toThrow(INSERT_SENTINEL);
    expect(reachedInsert).toBe(true);
  });

  it("checks availability BEFORE the account gate, so a guest still sees the busy message", async () => {
    company.busy = true;
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };

    await expect(create(payload, "cust-1")).rejects.toMatchObject({
      details: { reason: ["COMPANY_BUSY"] },
    });
  });
});

describe("assertNoPendingVerification", () => {
  it("resolves when the customer has nothing pending", async () => {
    await expect(assertNoPendingVerification("cust-1")).resolves.toBeUndefined();
  });

  it("throws a 409 naming the request that needs confirming", async () => {
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };
    await expect(assertNoPendingVerification("cust-1")).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
      details: { reason: ["PENDING_VERIFICATION"] },
    });
  });
});
