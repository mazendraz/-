// Accepting a queued request must produce a Lead indistinguishable from one the
// customer sent directly — same items, same estimate, same district, same
// description. That promise is the whole feature: waiting costs the customer the
// wait, not their order. These tests pin it, plus the two legacy/idempotency
// paths around it.
//
// Mocked prisma + leadsService (no real DB), same approach as
// waitlist.customerPath.test.ts: what's under test is what convertToLead HANDS
// createLeadRecord, not SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";

const COMPANY = { id: "co1", slug: "acme", name: "شركة أكمي", email: "a@b.co", whatsapp: null };

interface EntryRow {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  service: string | null;
  note: string | null;
  district: string | null;
  budget: string | null;
  itemsSnapshot: unknown;
  status: string;
  customerId: string | null;
  convertedLeadId: string | null;
  createdAt: Date;
}

let entries: EntryRow[] = [];

const db = {
  waitlistEntry: {
    findFirst: async ({ where }: { where: { id: string; companyId: string } }) =>
      entries.find((e) => e.id === where.id && e.companyId === where.companyId) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = entries.find((e) => e.id === where.id);
      if (!row) throw new Error("not found");
      return { ...row, company: COMPANY };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<EntryRow> }) => {
      const row = entries.find((e) => e.id === where.id)!;
      Object.assign(row, data);
      return { ...row, company: COMPANY };
    },
    // Models the CONDITIONAL semantics, not just the write: convertToLead claims
    // the conversion with an updateMany whose predicate is the whole guarantee
    // (only the first concurrent caller matches a row). A double that ignored the
    // predicate and always updated would let a broken claim pass these tests.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; companyId: string; convertedLeadId?: null; status?: { not: string } };
      data: Partial<EntryRow>;
    }) => {
      const matched = entries.filter(
        (e) =>
          e.id === where.id &&
          e.companyId === where.companyId &&
          (where.convertedLeadId === undefined || e.convertedLeadId === null) &&
          (where.status === undefined || e.status !== where.status.not),
      );
      for (const row of matched) Object.assign(row, data);
      return { count: matched.length };
    },
  },
  company: {
    findUniqueOrThrow: async () => COMPANY,
  },
};

// Every call, so a test can assert on the exact input createLeadRecord received.
const createLeadRecord = vi.fn(async (input: Record<string, unknown>) => ({
  id: "lead1",
  refNumber: "AA-0001",
  ...input,
}));
const getById = vi.fn(async (id: string) => ({ id, refNumber: "AA-0001" }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/leads.service", () => ({
  createLeadRecord: (...args: unknown[]) => createLeadRecord(...(args as [Record<string, unknown>])),
  getById: (...args: unknown[]) => getById(...(args as [string])),
  DEDUP_WINDOW_MS: 300_000,
}));

const { convertToLead } = await import("@/lib/services/waitlist.service");

// What waitlist.service.join freezes onto the row — a ResolvedRequest, whole.
const SNAPSHOT = {
  lines: [
    {
      offeringId: "off1",
      nameSnapshot: "تنظيف شقة",
      tierLabel: "٣ غرف",
      qty: 2,
      pricingModel: "FIXED",
      unitPriceMin: 500,
      unitPriceMax: 500,
      lineMin: 1000,
      lineMax: 1000,
    },
  ],
  estimatedMin: 900,
  estimatedMax: 900,
  discountPercent: 10,
  hasOnInspection: false,
  serviceSummary: "تنظيف شقة ×2",
};

function seed(overrides: Partial<EntryRow> = {}): EntryRow {
  const row: EntryRow = {
    id: "w1",
    companyId: COMPANY.id,
    name: "مازن",
    phone: "+201234567890",
    service: "تنظيف شقة ×2",
    note: "الشقة في الحي الخامس، الدور التالت",
    district: "الحي الخامس",
    budget: "",
    itemsSnapshot: SNAPSHOT,
    status: "WAITING",
    customerId: "cust1",
    convertedLeadId: null,
    createdAt: new Date(),
    ...overrides,
  };
  entries.push(row);
  return row;
}

beforeEach(() => {
  entries = [];
  createLeadRecord.mockClear();
  getById.mockClear();
});

describe("convertToLead — the queued request survives the wait intact", () => {
  it("hands createLeadRecord every field the customer filled in", async () => {
    seed();
    await convertToLead(COMPANY.id, "w1");

    expect(createLeadRecord).toHaveBeenCalledTimes(1);
    expect(createLeadRecord.mock.calls[0]![0]).toMatchObject({
      service: "تنظيف شقة ×2",
      customerName: "مازن",
      phone: "+201234567890",
      district: "الحي الخامس",
      description: "الشقة في الحي الخامس، الدور التالت",
      // No placeholder anywhere: this is the point of the feature.
      resolved: SNAPSHOT,
      // The account keeps the request, so the accepted lead lands in the same
      // "My Requests" the customer watched it from.
      customerId: "cust1",
    });
  });

  it("carries the estimate frozen at join time, not a fresh one", async () => {
    seed();
    await convertToLead(COMPANY.id, "w1");

    const resolved = createLeadRecord.mock.calls[0]![0].resolved as typeof SNAPSHOT;
    expect(resolved.estimatedMin).toBe(900);
    expect(resolved.discountPercent).toBe(10);
    expect(resolved.lines[0]!.unitPriceMin).toBe(500);
  });

  it("marks the entry CONVERTED and links the lead it became", async () => {
    seed();
    await convertToLead(COMPANY.id, "w1");

    expect(entries[0]!.status).toBe("CONVERTED");
    expect(entries[0]!.convertedLeadId).toBe("lead1");
  });

  it("falls back to placeholders only for an entry from the old short form", async () => {
    seed({ district: null, budget: null, itemsSnapshot: null, service: "سباكة", note: null });
    await convertToLead(COMPANY.id, "w1");

    expect(createLeadRecord.mock.calls[0]![0]).toMatchObject({
      service: "سباكة",
      district: "Not specified",
      resolved: null,
    });
    expect(createLeadRecord.mock.calls[0]![0].description).toContain("waiting list");
  });

  it("is idempotent — a second accept reuses the lead instead of creating another", async () => {
    seed({ status: "CONVERTED", convertedLeadId: "lead1" });
    const lead = await convertToLead(COMPANY.id, "w1");

    expect(createLeadRecord).not.toHaveBeenCalled();
    expect(lead.id).toBe("lead1");
  });

  it("settles the status of an entry that has a lead but was left un-converted", async () => {
    seed({ status: "WAITING", convertedLeadId: "lead1" });
    await convertToLead(COMPANY.id, "w1");

    expect(createLeadRecord).not.toHaveBeenCalled();
    expect(entries[0]!.status).toBe("CONVERTED");
  });
});
