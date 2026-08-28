// Attaching past requests to an account.
//
// Two properties carry this feature, and both are about what must NOT happen:
// a claim must never grant access the caller didn't already have, and it must
// never take a request away from an account that already holds it.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface LeadRow {
  id: string;
  refNumber: string;
  trackingToken: string | null;
  phone: string;
  customerId: string | null;
}

let leads: LeadRow[] = [];

const db = {
  lead: {
    findUnique: async ({ where }: { where: { refNumber: string } }) =>
      leads.find((l) => l.refNumber === where.refNumber) ?? null,
    findMany: async ({ where }: { where: { customerId: string } }) =>
      leads.filter((l) => l.customerId === where.customerId),
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; customerId: null };
      data: { customerId: string };
    }) => {
      const row = leads.find((l) => l.id === where.id && l.customerId === null);
      if (!row) return { count: 0 };
      row.customerId = data.customerId;
      return { count: 1 };
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// The serializer walks relations the fake rows don't have; the claim path never
// touches it, and listForCustomer's serialization is not what these test.
vi.mock("@/lib/utils/serialize", () => ({
  serializeLead: (l: LeadRow) => ({ refNumber: l.refNumber }),
  leadStatusFromLabel: () => undefined,
}));

const { claimLeads, listForCustomer } = await import(
  "@/lib/services/customerLeads.service"
);

const ME = "customer-me";
const SOMEONE_ELSE = "customer-other";

beforeEach(() => {
  leads = [
    {
      id: "l1",
      refNumber: "AA-20260101-AAAA",
      trackingToken: "token-one",
      phone: "+201001234567",
      customerId: null,
    },
    {
      id: "l2",
      refNumber: "AA-20260101-BBBB",
      trackingToken: null, // legacy: predates tracking tokens
      phone: "+201009876543",
      customerId: null,
    },
  ];
});

async function claim(ref: string, secret: { token?: string; phone?: string }, who = ME) {
  const [result] = await claimLeads(who, [{ refNumber: ref, ...secret }]);
  return result!.outcome;
}

describe("a valid claim", () => {
  it("attaches the request to the account", async () => {
    expect(await claim("AA-20260101-AAAA", { token: "token-one" })).toBe("claimed");
    expect(leads[0]!.customerId).toBe(ME);
  });

  // Deliberately changed: this path used to accept the phone-tail fallback that
  // /leads/track still allows for legacy leads. Claiming is a BATCH operation
  // (50 references per call), and a batch turns a phone number — which is not a
  // secret, and which an attacker targeting someone already has — into a
  // practical way to enumerate that person's requests. A legacy lead stays
  // reachable one at a time; it just cannot be claimed. See ClaimCandidate.
  it("refuses a phone tail for a legacy request — a batch takes tokens only", async () => {
    expect(await claim("AA-20260101-BBBB", { phone: "+201009876543" } as never)).toBe("rejected");
    expect(leads[1]!.customerId).toBeNull();
  });

  it("refuses a legacy request even with the correct phone and no token at all", async () => {
    expect(await claim("AA-20260101-BBBB", {})).toBe("rejected");
    expect(leads[1]!.customerId).toBeNull();
  });

  it("normalizes the reference — case and whitespace are typing, not identity", async () => {
    const [result] = await claimLeads(ME, [
      { refNumber: "  aa-20260101-aaaa  ", token: "token-one" },
    ]);
    expect(result!.outcome).toBe("claimed");
  });

  it("reports a repeat claim as `already`, not a failure", async () => {
    await claim("AA-20260101-AAAA", { token: "token-one" });
    // The device re-sends its whole history on every sign-in. This is the
    // ordinary case, and it must not look like an error to the client.
    expect(await claim("AA-20260101-AAAA", { token: "token-one" })).toBe("already");
  });
});

describe("refusals — all indistinguishable", () => {
  it("refuses an unknown reference", async () => {
    expect(await claim("AA-19990101-ZZZZ", { token: "token-one" })).toBe("rejected");
  });

  it("refuses a wrong token", async () => {
    expect(await claim("AA-20260101-AAAA", { token: "wrong" })).toBe("rejected");
    expect(leads[0]!.customerId).toBeNull();
  });

  it("refuses a missing secret", async () => {
    expect(await claim("AA-20260101-AAAA", {})).toBe("rejected");
  });

  it("refuses a phone tail on a request that HAS a token", async () => {
    // The token supersedes the phone fallback. Accepting the phone here would
    // reopen the guessable-credential path the token was introduced to close.
    expect(await claim("AA-20260101-AAAA", { phone: "+201001234567" })).toBe("rejected");
  });

  it("REFUSES to take a request already owned by another account", async () => {
    // Two people can legitimately hold the same reference. First claim stands —
    // otherwise the second silently inherits the first's history and their
    // conversation with the provider.
    leads[0]!.customerId = SOMEONE_ELSE;
    expect(await claim("AA-20260101-AAAA", { token: "token-one" })).toBe("rejected");
    expect(leads[0]!.customerId).toBe(SOMEONE_ELSE);
  });

  it("tells none of them apart", async () => {
    leads[0]!.customerId = SOMEONE_ELSE;
    const outcomes = [
      await claim("AA-19990101-ZZZZ", { token: "token-one" }), // no such ref
      await claim("AA-20260101-AAAA", { token: "wrong" }), // wrong secret
      await claim("AA-20260101-AAAA", { token: "token-one" }), // someone else's
    ];
    // One value across all three: a caller must not be able to use this endpoint
    // to learn which reference numbers exist.
    expect(new Set(outcomes)).toEqual(new Set(["rejected"]));
  });
});

describe("batches", () => {
  it("reports each item independently instead of failing the whole call", async () => {
    const results = await claimLeads(ME, [
      { refNumber: "AA-20260101-AAAA", token: "token-one" },
      { refNumber: "AA-19990101-ZZZZ", token: "nope" },
      // Legacy (no token): rejected now that the batch path takes tokens only.
      { refNumber: "AA-20260101-BBBB" },
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["claimed", "rejected", "rejected"]);
  });
});

describe("listForCustomer", () => {
  it("returns only this account's requests", async () => {
    leads[0]!.customerId = ME;
    leads[1]!.customerId = SOMEONE_ELSE;
    const mine = await listForCustomer(ME);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ refNumber: "AA-20260101-AAAA" });
  });

  it("never returns the per-request tracking token", async () => {
    // The account is the credential now. Re-emitting the request secret would
    // put a second, longer-lived key into browser storage for nothing.
    leads[0]!.customerId = ME;
    const [lead] = await listForCustomer(ME);
    expect(lead).not.toHaveProperty("trackingToken");
  });
});
