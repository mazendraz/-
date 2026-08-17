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
  status: string;
  customerId: string | null;
  convertedLeadId: string | null;
  createdAt: Date;
}

let entries: EntryRow[] = [];
let nextId = 1;
const COMPANY = { id: "co1", slug: "acme", name: "شركة أكمي" };

const db = {
  company: {
    findFirst: async ({ where }: { where: { slug: string; status: string } }) =>
      where.slug === COMPANY.slug ? { id: COMPANY.id } : null,
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
