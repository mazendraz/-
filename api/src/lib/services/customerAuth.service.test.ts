// Account resolution for a verified identity: create, link, or refuse.
//
// The refusal is the reason this file exists. Everything else here is ordinary
// find-or-create; the branch where an account already holds the address and the
// provider will NOT vouch for it is the one where getting it wrong hands a
// stranger someone else's requests and conversations.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  refreshTokenEnc?: string | null;
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
    update: async ({
      where,
      data,
    }: {
      where: { provider_subject: { provider: string; subject: string } };
      data: { refreshTokenEnc?: string };
    }) => {
      const { provider, subject } = where.provider_subject;
      const row = identities.find((i) => i.provider === provider && i.subject === subject);
      // Prisma throws P2025 on an update that matches nothing — modelled so the
      // service's swallow-and-warn is exercised rather than assumed.
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      Object.assign(row, data);
      return row;
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
      // Prisma's own semantics, and this fake is worthless without them:
      // `undefined` means "leave this column alone", `null` means "write null".
      // Collapsing the two with `??` — which this did — makes the fake incapable
      // of ever showing a provider blanking a stored name, the single failure the
      // nullable-name contract in VerifiedIdentity exists to prevent.
      for (const key of ["name", "avatarUrl", "emailVerified"] as const) {
        if (data[key] !== undefined) Object.assign(row, { [key]: data[key] });
      }
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

const { signInWithIdentity, storeAppleRefreshToken } = await import(
  "@/lib/services/customerAuth.service"
);
const { open } = await import("@/lib/utils/secretBox");

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

describe("a provider that asserts no profile leaves the stored one alone", () => {
  // Apple is the reason this contract exists. It puts no name and no picture in
  // its token, and hands the client a name exactly once — on the first
  // authorization, never again, not even after a reinstall. So every Apple
  // sign-in after the first arrives with `name: null`.
  const apple = (over: Partial<Parameters<typeof signInWithIdentity>[0]> = {}) =>
    identity({
      provider: "APPLE" as const,
      subject: "001234.abcdef.0000",
      name: null,
      avatarUrl: null,
      ...over,
    });

  it("does NOT overwrite the name on the second Apple sign-in", async () => {
    // The bug this pins: writing `name` unconditionally turned a real name into
    // whatever fallback the route computed, silently, on the customer's next
    // sign-in — and the name is what the company they are messaging sees.
    await signInWithIdentity(apple({ name: "أحمد محمود", fallbackName: "أحمد محمود" }));
    expect(customers[0]!.name).toBe("أحمد محمود");

    const res = await signInWithIdentity(apple({ fallbackName: "مستخدم Apple" }));
    expect(res.outcome).toBe("returning");
    expect(customers[0]!.name).toBe("أحمد محمود");
  });

  it("does NOT clear an avatar a different provider set on the same account", async () => {
    await signInWithIdentity(
      identity({ email: "shared@example.com", avatarUrl: "https://pic.example/a.png" }),
    );
    expect(customers[0]!.avatarUrl).toBe("https://pic.example/a.png");

    // Same verified address, so Apple links to this account rather than making a
    // second one. Apple has no notion of a profile picture at all.
    const res = await signInWithIdentity(apple({ email: "shared@example.com" }));
    expect(res.outcome).toBe("linked");
    expect(customers[0]!.avatarUrl).toBe("https://pic.example/a.png");
  });

  it("uses fallbackName only when the row is being created", async () => {
    // A customer who authorized the app once, deleted their account, then came
    // back: Apple will not resend the name, so there is nothing to create the row
    // with. Without fallbackName the column would take the email's local part —
    // random hex for a Hide-My-Email address.
    const res = await signInWithIdentity(
      apple({ email: "k9x2m4h8t1@privaterelay.appleid.com", fallbackName: "مستخدم Apple" }),
    );
    expect(res.outcome).toBe("created");
    expect(customers[0]!.name).toBe("مستخدم Apple");
  });

  it("still updates emailVerified, which IS a live assertion every time", async () => {
    // The exception that proves the rule: this flag is asserted on every sign-in
    // by every provider, and pinning it would leave the linking rule trusting a
    // fact that has since expired.
    await signInWithIdentity(apple({ name: "أحمد", emailVerified: true }));
    await signInWithIdentity(apple({ emailVerified: false }));
    expect(customers[0]!.emailVerified).toBe(false);
  });
});

// ── Parking Apple's refresh token ───────────────────────────────────────────
// Written after a successful sign-in so that deleting the account can later call
// Apple's revocation endpoint (guideline 5.1.1(v)). Two rules carry it, and both
// fail silently if broken: it must never erase a good token with a failed
// exchange, and it must never turn a working sign-in into an error.
describe("storeAppleRefreshToken", () => {
  const ENC_KEY = Buffer.alloc(32, 3).toString("base64");
  const SUBJECT = "001234.apple.sub";

  beforeEach(() => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", ENC_KEY);
    customers = [
      {
        id: "c1",
        name: "Ahmed",
        email: "ahmed@example.com",
        avatarUrl: null,
        emailVerified: true,
        isActive: true,
      },
    ];
    identities = [{ customerId: "c1", provider: "APPLE", subject: SUBJECT }];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const appleRow = () => identities.find((i) => i.provider === "APPLE")!;

  it("stores the token ENCRYPTED, never in the clear", async () => {
    await storeAppleRefreshToken(SUBJECT, "r2.apple-refresh");

    const stored = appleRow().refreshTokenEnc!;
    expect(stored).not.toContain("r2.apple-refresh");
    // ...and it must still come back out, or revocation has nothing to send.
    expect(open(stored)).toBe("r2.apple-refresh");
  });

  it("leaves an existing token alone when the exchange produced nothing", async () => {
    // The rule that matters. An expired code or a slow Apple yields null, and
    // writing it would trade a working revocation for a broken one — silently,
    // and only discoverable at deletion time months later.
    await storeAppleRefreshToken(SUBJECT, "r2.good");
    const before = appleRow().refreshTokenEnc;

    await storeAppleRefreshToken(SUBJECT, null);
    expect(appleRow().refreshTokenEnc).toBe(before);
  });

  it("replaces the stored token when a later sign-in supplies a fresh one", async () => {
    await storeAppleRefreshToken(SUBJECT, "r2.first");
    await storeAppleRefreshToken(SUBJECT, "r2.second");
    expect(open(appleRow().refreshTokenEnc!)).toBe("r2.second");
  });

  it("stores nothing at all when no encryption key is configured", async () => {
    // Falling back to plaintext would defeat the reason the column is sealed.
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "");
    await storeAppleRefreshToken(SUBJECT, "r2.apple-refresh");
    expect(appleRow().refreshTokenEnc).toBeUndefined();
  });

  it("writes to the APPLE row, not whichever identity the account happens to have", async () => {
    // An account with both providers has two rows, and only Apple's token is one
    // Apple will accept. Keying on customerId would pick either.
    identities.push({ customerId: "c1", provider: "GOOGLE", subject: "google-sub" });

    await storeAppleRefreshToken(SUBJECT, "r2.apple-refresh");
    expect(identities.find((i) => i.provider === "GOOGLE")!.refreshTokenEnc).toBeUndefined();
    expect(appleRow().refreshTokenEnc).toBeTruthy();
  });

  it("swallows a write failure — the customer is already signed in", async () => {
    // Reached when the identity row vanished between sign-in and this write.
    // Losing revocability is not worth failing a completed login over.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      storeAppleRefreshToken("no-such-subject", "r2.apple-refresh"),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
