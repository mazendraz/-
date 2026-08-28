// Account deletion.
//
// The assertion that matters is the one about what SURVIVES. Deleting a login
// must not take a provider's business records with it — every request in the
// system predates accounts existing, and a company cannot lose its books
// because a customer removed a sign-in method.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CustomerRow { id: string; email: string }
interface LeadRow { id: string; customerId: string | null }
interface SessionRow { id: string; customerId: string; revokedAt: Date | null }
interface IdentityRow {
  customerId: string;
  provider?: "GOOGLE" | "APPLE";
  refreshTokenEnc?: string | null;
}

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
  customerIdentity: {
    // Read BEFORE the delete cascades the row away — see appleRefreshTokenFor.
    findFirst: async ({ where }: { where: { customerId: string; provider: string } }) =>
      identities.find(
        (i) => i.customerId === where.customerId && i.provider === where.provider,
      ) ?? null,
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

// Apple's endpoint, stubbed. `revoked` is the assertion surface: it records what
// this service actually asked Apple to revoke, without a network call.
const revoked: { token: string; clientId: string }[] = [];
let revokeResult: boolean | Error = true;

vi.mock("@/lib/services/appleServerAuth.service", () => ({
  isAppleServerAuthConfigured: () => Boolean(process.env.APPLE_TEAM_ID),
  primaryAppleClientId: () => process.env.APPLE_CLIENT_IDS?.split(",")[0]?.trim() ?? null,
  revokeAppleRefreshToken: async (token: string, clientId: string) => {
    if (revokeResult instanceof Error) throw revokeResult;
    revoked.push({ token, clientId });
    return revokeResult;
  },
}));

const { deleteAccount } = await import("@/lib/services/customerDeletion.service");
const { seal } = await import("@/lib/utils/secretBox");

const APPLE_BUNDLE_ID = "com.alassema.client";
const ENC_KEY = Buffer.alloc(32, 7).toString("base64");

/** Give ME an Apple identity holding a sealed refresh token. */
function giveMeAnAppleToken(token = "r2.apple-refresh"): void {
  const row = identities.find((i) => i.customerId === ME)!;
  row.provider = "APPLE";
  row.refreshTokenEnc = seal(token);
}

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
  identities = [
    { customerId: ME, provider: "GOOGLE", refreshTokenEnc: null },
    { customerId: OTHER, provider: "GOOGLE", refreshTokenEnc: null },
  ];
  recorded.length = 0;
  revoked.length = 0;
  revokeResult = true;

  // A fully-configured deploy by default; the tests that care take pieces away.
  vi.stubEnv("APPLE_TEAM_ID", "SS923F3FW8");
  vi.stubEnv("APPLE_CLIENT_IDS", APPLE_BUNDLE_ID);
  vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", ENC_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what is removed", () => {
  it("removes the account, its identities and its sessions", async () => {
    await deleteAccount(ME);
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
    expect(identities.map((i) => i.customerId)).toEqual([OTHER]);
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

// ── The other half of guideline 5.1.1(v) ────────────────────────────────────
// Deleting our rows is only half the obligation for a Sign in with Apple user.
// Without the revocation call, the deleted account keeps appearing under
// Settings → Apple ID → Sign in with Apple forever, with no way to detach it.
//
// The far more important half of this suite is the second describe: NOTHING
// about Apple may prevent a deletion. A customer who asks to be deleted gets
// deleted, whatever Apple's endpoint is doing at the time.
describe("telling Apple", () => {
  it("revokes the customer's Apple token, decrypted, against the right client", async () => {
    giveMeAnAppleToken("r2.the-real-token");

    const summary = await deleteAccount(ME);

    expect(summary.appleRevocationScheduled).toBe(true);
    expect(revoked).toEqual([
      { token: "r2.the-real-token", clientId: APPLE_BUNDLE_ID },
    ]);
  });

  it("reads the token BEFORE the cascade destroys the row", async () => {
    // The ordering trap: CustomerIdentity cascades on delete, so reading it
    // afterwards finds nothing and the revocation silently never happens.
    giveMeAnAppleToken();
    await deleteAccount(ME);

    expect(identities.find((i) => i.customerId === ME)).toBeUndefined();
    expect(revoked).toHaveLength(1);
  });

  it("does not revoke for a Google-only account", async () => {
    // The common case. There is no Apple identity, so there is nothing to say.
    const summary = await deleteAccount(ME);
    expect(summary.appleRevocationScheduled).toBe(false);
    expect(revoked).toHaveLength(0);
  });

  it("does not revoke for an Apple sign-in that predates the token column", async () => {
    // Every account created before this shipped. Null is the ordinary state.
    const row = identities.find((i) => i.customerId === ME)!;
    row.provider = "APPLE";
    row.refreshTokenEnc = null;

    const summary = await deleteAccount(ME);
    expect(summary.appleRevocationScheduled).toBe(false);
    expect(revoked).toHaveLength(0);
  });

  it("records whether a revocation happened in the audit trail", async () => {
    giveMeAnAppleToken();
    await deleteAccount(ME);
    expect(recorded.find((r) => r.action === "auth.customer.deleted")?.meta)
      .toMatchObject({ appleRevocation: true });
  });

  it("revokes only the deleted customer's token, never a neighbour's", async () => {
    giveMeAnAppleToken("r2.mine");
    const other = identities.find((i) => i.customerId === OTHER)!;
    other.provider = "APPLE";
    other.refreshTokenEnc = seal("r2.theirs");

    await deleteAccount(ME);
    expect(revoked).toEqual([{ token: "r2.mine", clientId: APPLE_BUNDLE_ID }]);
  });
});

describe("Apple can never block a deletion", () => {
  it("deletes the account even when Apple rejects the revocation", async () => {
    giveMeAnAppleToken();
    revokeResult = false;

    await expect(deleteAccount(ME)).resolves.toBeDefined();
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
  });

  it("deletes the account even when Apple's endpoint throws", async () => {
    // THE case this design exists for. runAfterResponse isolates the failure;
    // if that ever regressed, this is where it would surface.
    giveMeAnAppleToken();
    revokeResult = new Error("ETIMEDOUT");

    await expect(deleteAccount(ME)).resolves.toBeDefined();
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
  });

  it("deletes normally on a deploy with no Apple key configured", async () => {
    // Sign-in works without the .p8; revocation is what does not. The delete
    // button must not be collateral damage of an incomplete configuration.
    giveMeAnAppleToken();
    vi.stubEnv("APPLE_TEAM_ID", "");

    const summary = await deleteAccount(ME);
    expect(summary.appleRevocationScheduled).toBe(false);
    expect(revoked).toHaveLength(0);
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
  });

  it("deletes normally when the token cannot be decrypted (a rotated key)", async () => {
    // Sealed under the old key, read under the new one. open() returns null
    // rather than throwing precisely so this stays a deletion, not a 500.
    giveMeAnAppleToken();
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));

    const summary = await deleteAccount(ME);
    expect(summary.appleRevocationScheduled).toBe(false);
    expect(customers.map((c) => c.id)).toEqual([OTHER]);
  });
});
