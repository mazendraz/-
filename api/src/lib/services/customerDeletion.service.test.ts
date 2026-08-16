// Account deletion.
//
// The assertion that matters is the one about what SURVIVES. Deleting a login
// must not take a provider's business records with it — every request in the
// system predates accounts existing, and a company cannot lose its books
// because a customer removed a sign-in method.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface CustomerRow { id: string; email: string }
interface LeadRow { id: string; customerId: string | null }
interface SessionRow { id: string; customerId: string; revokedAt: Date | null }
interface IdentityRow { customerId: string }

let customers: CustomerRow[] = [];
let leads: LeadRow[] = [];
let sessions: SessionRow[] = [];
let identities: IdentityRow[] = [];

const db = {
  customerUser: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      customers.find((c) => c.id === where.id) ?? null,
    delete: async ({ where }: { where: { id: string } }) => {
      const row = customers.find((c) => c.id === where.id);
      if (!row) throw new Error("not found");
      customers = customers.filter((c) => c.id !== where.id);
      // Exactly what the schema declares: identities and sessions CASCADE,
      // leads SET NULL. Modelled here so the test fails if the service ever
      // starts hand-rolling deletion that disagrees with it.
      identities = identities.filter((i) => i.customerId !== where.id);
      sessions = sessions.filter((s) => s.customerId !== where.id);
      leads.forEach((l) => {
        if (l.customerId === where.id) l.customerId = null;
      });
      return row;
    },
  },
  lead: {
    count: async ({ where }: { where: { customerId: string } }) =>
      leads.filter((l) => l.customerId === where.customerId).length,
  },
  customerSession: {
    count: async ({ where }: { where: { customerId: string } }) =>
      sessions.filter((s) => s.customerId === where.customerId && s.revokedAt === null).length,
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const recorded: { action: string; email: string; meta?: Record<string, unknown> }[] = [];
vi.mock("@/lib/services/audit.service", () => ({
  recordAuth: async (e: { action: string; email: string; meta?: Record<string, unknown> }) => {
    recorded.push(e);
  },
}));

const { deleteAccount } = await import("@/lib/services/customerDeletion.service");

const ME = "cust-1";
const OTHER = "cust-2";

beforeEach(() => {
  customers = [
    { id: ME, email: "me@example.com" },
    { id: OTHER, email: "other@example.com" },
  ];
  leads = [
    { id: "l1", customerId: ME },
    { id: "l2", customerId: ME },
    { id: "l3", customerId: OTHER },
    { id: "l4", customerId: null }, // predates accounts entirely
  ];
  sessions = [
    { id: "s1", customerId: ME, revokedAt: null },
    { id: "s2", customerId: OTHER, revokedAt: null },
  ];
  identities = [{ customerId: ME }, { customerId: OTHER }];
  recorded.length = 0;
});

describe("what is removed", () => {
  it("removes the account, its identities and its sessions", async () => {
    await deleteAccount(ME);
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
    expect(identities).toEqual([{ customerId: OTHER }]);
    expect(sessions.map((s) => s.id)).toEqual(["s2"]);
  });

  it("touches nothing belonging to another account", async () => {
    await deleteAccount(ME);
    expect(leads.find((l) => l.id === "l3")!.customerId).toBe(OTHER);
    expect(sessions).toHaveLength(1);
  });
});

describe("what SURVIVES — the provider's records", () => {
  it("keeps every request and only severs the account link", async () => {
    await deleteAccount(ME);

    // Still four requests. A company's record of work it quoted, carried out
    // and invoiced is not the customer's account data to erase.
    expect(leads).toHaveLength(4);
    expect(leads.filter((l) => l.customerId === ME)).toHaveLength(0);
    // They revert to exactly what they were before accounts existed.
    expect(leads.find((l) => l.id === "l1")!.customerId).toBeNull();
  });
});

describe("the audit trail", () => {
  it("records the deletion with the email, before the row is gone", async () => {
    await deleteAccount(ME);
    const entry = recorded.find((r) => r.action === "auth.customer.deleted");
    // Written first on purpose: afterwards there is nothing left to name it by.
    expect(entry?.email).toBe("me@example.com");
    expect(entry?.meta).toMatchObject({ leadsDetached: 2, sessionsRevoked: 1 });
  });
});

describe("a missing account", () => {
  it("is a 404, not a silent success", async () => {
    await expect(deleteAccount("no-such-customer")).rejects.toThrow(/not found/i);
  });
});
