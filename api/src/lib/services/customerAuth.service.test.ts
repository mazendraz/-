// Account resolution for a verified identity: create, link, or refuse.
//
// The refusal is the reason this file exists. Everything else here is ordinary
// find-or-create; the branch where an account already holds the address and the
// provider will NOT vouch for it is the one where getting it wrong hands a
// stranger someone else's requests and conversations.
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory stand-in for the two tables ────────────────────────────────────
interface CustomerRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  isActive: boolean;
}
interface IdentityRow {
  customerId: string;
  provider: string;
  subject: string;
}

let customers: CustomerRow[] = [];
let identities: IdentityRow[] = [];
let nextId = 1;

// Split from `db` below so `$transaction`'s callback can be typed against the
// tables without the object referencing its own type inside its initializer.
const tables = {
  customerIdentity: {
    findUnique: async ({ where }: { where: { provider_subject: { provider: string; subject: string } } }) => {
      const { provider, subject } = where.provider_subject;
      const row = identities.find((i) => i.provider === provider && i.subject === subject);
      if (!row) return null;
      const customer = customers.find((c) => c.id === row.customerId) ?? null;
      return { customer };
    },
    create: async ({ data }: { data: IdentityRow }) => {
      if (identities.some((i) => i.provider === data.provider && i.subject === data.subject)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      identities.push({ ...data });
      return data;
    },
  },
  customerUser: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
      customers.find((c) => (where.email ? c.email === where.email : c.id === where.id)) ?? null,
    create: async ({ data }: { data: Partial<CustomerRow> }) => {
      if (customers.some((c) => c.email === data.email)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row: CustomerRow = {
        id: `c${nextId++}`,
        name: data.name ?? "",
        email: data.email!,
        avatarUrl: data.avatarUrl ?? null,
        emailVerified: data.emailVerified ?? false,
        isActive: true,
      };
      customers.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<CustomerRow> }) => {
      const row = customers.find((c) => c.id === where.id)!;
      Object.assign(row, {
        name: data.name ?? row.name,
        avatarUrl: data.avatarUrl ?? row.avatarUrl,
        emailVerified: data.emailVerified ?? row.emailVerified,
      });
      return row;
    },
  },
};

// The service wraps creation in a transaction; the callback gets the same client.
const db = {
  ...tables,
  $transaction: async <T>(fn: (tx: typeof tables) => Promise<T>) => fn(tables),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const recorded: { action: string; meta?: Record<string, unknown> }[] = [];
vi.mock("@/lib/services/audit.service", () => ({
  recordAuth: async (entry: { action: string; meta?: Record<string, unknown> }) => {
    recorded.push({ action: entry.action, meta: entry.meta });
  },
}));

const { signInWithIdentity } = await import("@/lib/services/customerAuth.service");

function identity(over: Partial<Parameters<typeof signInWithIdentity>[0]> = {}) {
  return {
    provider: "GOOGLE" as const,
    subject: "google-sub-1",
    email: "customer@example.com",
    emailVerified: true,
    name: "عميل",
    avatarUrl: null,
    ...over,
  };
}

beforeEach(() => {
  customers = [];
  identities = [];
  recorded.length = 0;
  nextId = 1;
});

describe("first sign-in", () => {
  it("creates the account and its identity together", async () => {
    const res = await signInWithIdentity(identity());
    expect(res.outcome).toBe("created");
    expect(customers).toHaveLength(1);
    expect(identities).toHaveLength(1);
    expect(res.customer.email).toBe("customer@example.com");
    expect(recorded.map((r) => r.action)).toContain("auth.customer.created");
  });
});

describe("returning sign-in", () => {
  it("finds the account by SUBJECT, not email", async () => {
    await signInWithIdentity(identity());
    // Google address changed; the immutable `sub` did not. The customer must land
    // on the same account, not a second one.
    const res = await signInWithIdentity(identity({ email: "new-address@example.com" }));
    expect(res.outcome).toBe("returning");
    expect(customers).toHaveLength(1);
    expect(res.customer.id).toBe("c1");
  });

  it("refreshes the cached profile from the provider", async () => {
    await signInWithIdentity(identity({ name: "الاسم القديم" }));
    const res = await signInWithIdentity(identity({ name: "الاسم الجديد" }));
    expect(res.customer.name).toBe("الاسم الجديد");
  });

  it("refuses a deactivated account", async () => {
    await signInWithIdentity(identity());
    customers[0]!.isActive = false;
    await expect(signInWithIdentity(identity())).rejects.toThrow(/sign-in failed/i);
  });
});

describe("linking a second provider", () => {
  it("attaches the new identity to the existing account on a VERIFIED email", async () => {
    await signInWithIdentity(identity());
    const res = await signInWithIdentity(
      identity({ provider: "APPLE", subject: "apple-sub-1", emailVerified: true }),
    );
    expect(res.outcome).toBe("linked");
    expect(customers).toHaveLength(1); // linked, not duplicated
    expect(identities).toHaveLength(2);
    expect(recorded.map((r) => r.action)).toContain("auth.customer.linked");
  });

  it("REFUSES to link on an unverified email — the account-takeover path", async () => {
    // Someone asserting an address they don't control must not inherit the
    // account that already holds it.
    await signInWithIdentity(identity());
    await expect(
      signInWithIdentity(
        identity({ provider: "APPLE", subject: "attacker-sub", emailVerified: false }),
      ),
    ).rejects.toThrow(/sign-in failed/i);

    expect(identities).toHaveLength(1); // nothing attached
    expect(customers).toHaveLength(1); // and nothing duplicated
    expect(recorded.map((r) => r.action)).toContain("auth.customer.blocked");
  });

  it("does not leak that the account exists — same message as any other failure", async () => {
    await signInWithIdentity(identity());
    const refusal = await signInWithIdentity(
      identity({ provider: "APPLE", subject: "attacker-sub", emailVerified: false }),
    ).catch((e: Error) => e.message);

    customers[0]!.isActive = false;
    const deactivated = await signInWithIdentity(identity()).catch((e: Error) => e.message);

    expect(refusal).toBe(deactivated);
  });
});

describe("concurrent first sign-in", () => {
  it("resolves the loser of the race to the account the winner created", async () => {
    // Two devices, same brand-new account, same moment: both miss the lookups and
    // both try to create. One loses the unique index — and must still get a
    // session, not an error.
    const [a, b] = await Promise.all([
      signInWithIdentity(identity()),
      signInWithIdentity(identity()),
    ]);
    expect(customers).toHaveLength(1);
    expect(a.customer.id).toBe(b.customer.id);
  });
});
