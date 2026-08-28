// The account-aware half of waitlist.service.ts added for mobile/client:
// `join()` optionally attaching `customerId`, and the new `listForCustomer()`
// read. Mirrors reviews.service.customerPath.test.ts's approach (mocked
// prisma, no real DB) — the property under test is data-shape, not SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface EntryRow {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  service: string | null;
  note: string | null;
  district?: string | null;
  budget?: string | null;
  itemsSnapshot?: unknown;
  status: string;
  customerId: string | null;
  convertedLeadId: string | null;
  createdAt: Date;
}

let entries: EntryRow[] = [];
let nextId = 1;
// Set by the one test that needs join() to hit the pending-verification guard;
// every other test leaves it null, i.e. "this customer owes nothing".
let pendingVerificationLead: { id: string; refNumber: string } | null = null;
const COMPANY = { id: "co1", slug: "acme", name: "شركة أكمي" };

const db = {
  company: {
    findFirst: async ({ where }: { where: { slug: string; status: string } }) =>
      where.slug === COMPANY.slug ? { id: COMPANY.id } : null,
  },
  // join() now refuses to queue new work for a customer who still has a final
  // amount to confirm (leadsService.assertNoPendingVerification).
  lead: {
    findFirst: async () => pendingVerificationLead,
  },
  waitlistEntry: {
    create: async ({ data }: { data: Omit<EntryRow, "id" | "createdAt" | "convertedLeadId"> }) => {
      const row: EntryRow = {
        id: `w${nextId++}`,
        createdAt: new Date(Date.now() + nextId), // monotonically increasing per insert
        convertedLeadId: null,
        ...data,
      };
      entries.push(row);
      return { ...row, company: COMPANY };
    },
    // join() rejects a near-identical re-submit inside a 5-minute window (the
    // same guard POST /leads applies). Every entry these tests create differs by
    // phone, so this only has to be present, not clever.
    findFirst: async ({ where }: { where: { companyId: string; phone: string; service: string | null } }) =>
      entries.find(
        (e) =>
          e.companyId === where.companyId &&
          e.phone === where.phone &&
          e.service === where.service,
      ) ?? null,
    findMany: async ({ where }: { where: { customerId: string } }) =>
      entries
        .filter((e) => e.customerId === where.customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((e) => ({ ...e, company: COMPANY })),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const { join, listForCustomer } = await import("@/lib/services/waitlist.service");

const OWNER = "customer-owner";
const OTHER = "customer-other";

beforeEach(() => {
  entries = [];
  nextId = 1;
  pendingVerificationLead = null;
});

describe("join — an unconfirmed final amount blocks new work", () => {
  // The waiting list is the other way to start something, so the rule that
  // guards POST /leads has to guard this too — otherwise the check there is a
  // one-click detour rather than a rule. See leadsService.assertNoPendingVerification.
  it("refuses a signed-in customer who still owes a price verification", async () => {
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };

    await expect(
      join(COMPANY.slug, { name: "عميل", phone: "+201234567890" }, OWNER),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: ["PENDING_VERIFICATION"] },
    });

    expect(entries).toHaveLength(0);
  });

  it("still lets a GUEST join — there is no account to owe anything", async () => {
    pendingVerificationLead = { id: "lead-9", refNumber: "AA-20260826-7F3K" };

    await join(COMPANY.slug, { name: "عميل", phone: "+201234567890" });
    expect(entries).toHaveLength(1);
    expect(entries[0].customerId).toBeNull();
  });
});

describe("join — customerId is optional and additive", () => {
  it("attaches the signed-in customer's id when given", async () => {
    const entry = await join(COMPANY.slug, { name: "عميل", phone: "+201234567890" }, OWNER);
    expect(entries[0]!.customerId).toBe(OWNER);
    expect(entry.companySlug).toBe(COMPANY.slug);
  });

  it("stays anonymous (customerId null) when no session is present", async () => {
    await join(COMPANY.slug, { name: "زائر", phone: "+201234567891" });
    expect(entries[0]!.customerId).toBeNull();
  });
});

describe("listForCustomer", () => {
  it("returns only the calling customer's own entries, newest first", async () => {
    await join(COMPANY.slug, { name: "a", phone: "1" }, OWNER);
    await join(COMPANY.slug, { name: "b", phone: "2" }, OTHER);
    await join(COMPANY.slug, { name: "c", phone: "3" }, OWNER);

    const mine = await listForCustomer(OWNER);
    expect(mine.map((e) => e.name)).toEqual(["c", "a"]);
    expect(mine.every((e) => e.companySlug === COMPANY.slug)).toBe(true);
  });

  it("returns nothing for a customer with no waitlist joins", async () => {
    await join(COMPANY.slug, { name: "a", phone: "1" }, OTHER);
    expect(await listForCustomer(OWNER)).toEqual([]);
  });
});
