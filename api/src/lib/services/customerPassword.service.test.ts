// Password registration / sign-in, and the way it interlocks with the Google
// flow.
//
// The takeover test in the last describe block is the reason this file exists.
// Everything else is ordinary auth plumbing; that one case is where two
// individually-reasonable rules — "you can register with a password" and "a
// verified provider email links to an existing account" — combine into an
// account handover if the interlock between them is ever removed.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  isActive: boolean;
  emailVerifyTokenHash: string | null;
  emailVerifyExpires: Date | null;
}

let rows: Row[] = [];
let identities: { customerId: string; provider: string; subject: string }[] = [];
let nextId = 1;

function match(where: Record<string, unknown>, row: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "emailVerifyExpires" && v && typeof v === "object" && "gt" in v) {
      const gt = (v as { gt: Date }).gt;
      return row.emailVerifyExpires !== null && row.emailVerifyExpires > gt;
    }
    return (row as unknown as Record<string, unknown>)[k] === v;
  });
}

const tables = {
  customerUser: {
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => match(where, r)) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => match(where, r)) ?? null,
    create: async ({ data }: { data: Partial<Row> }) => {
      if (rows.some((r) => r.email === data.email)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row: Row = {
        id: `c${nextId++}`,
        email: data.email!,
        name: data.name ?? "",
        avatarUrl: data.avatarUrl ?? null,
        passwordHash: data.passwordHash ?? null,
        emailVerified: data.emailVerified ?? false,
        isActive: true,
        emailVerifyTokenHash: data.emailVerifyTokenHash ?? null,
        emailVerifyExpires: data.emailVerifyExpires ?? null,
      };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      for (const [k, v] of Object.entries(data)) {
        (row as unknown as Record<string, unknown>)[k] = v;
      }
      return row;
    },
  },
  customerIdentity: {
    findUnique: async ({
      where,
    }: {
      where: { provider_subject: { provider: string; subject: string } };
    }) => {
      const { provider, subject } = where.provider_subject;
      const id = identities.find((i) => i.provider === provider && i.subject === subject);
      if (!id) return null;
      return { customer: rows.find((r) => r.id === id.customerId) ?? null };
    },
    create: async ({ data }: { data: { customerId: string; provider: string; subject: string } }) => {
      identities.push({ ...data });
      return data;
    },
  },
};

const db = {
  ...tables,
  $transaction: async <T>(fn: (tx: typeof tables) => Promise<T>) => fn(tables),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/audit.service", () => ({ recordAuth: async () => {} }));

// Capture the token instead of mailing it — the test needs the value a real
// customer would receive by clicking, and nothing else about delivery.
let sentTokens: string[] = [];
vi.mock("@/lib/services/notifications.service", () => ({
  sendCustomerVerificationEmail: async (_to: string, _name: string, token: string) => {
    sentTokens.push(token);
    return true;
  },
}));

const svc = await import("@/lib/services/customerPassword.service");
const { signInWithIdentity } = await import("@/lib/services/customerAuth.service");

const GOOD_PASSWORD = "correct horse battery";
const OTHER_PASSWORD = "another lengthy passphrase";

beforeEach(() => {
  rows = [];
  identities = [];
  sentTokens = [];
  nextId = 1;
});

async function registerAndVerify(email: string, password = GOOD_PASSWORD) {
  await svc.register({ name: "عميل", email, password });
  return svc.verifyEmail(sentTokens.at(-1)!);
}

describe("registration", () => {
  it("creates an account that is NOT usable until verified", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailVerified).toBe(false);
    // The password is right, and it still must not get in.
    await expect(
      svc.loginWithPassword("a@example.com", GOOD_PASSWORD),
    ).rejects.toThrow(/confirm your email/i);
  });

  it("stores a hash, never the password", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });
    expect(rows[0]!.passwordHash).toBeTruthy();
    expect(rows[0]!.passwordHash).not.toBe(GOOD_PASSWORD);
  });

  it("stores a HASH of the verification token, not the token", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });
    const stored = rows[0]!.emailVerifyTokenHash!;
    expect(stored).toBeTruthy();
    expect(stored).not.toBe(sentTokens[0]);
  });

  it("refuses a password derived from the email address", async () => {
    await expect(
      svc.register({ name: "عميل", email: "mazendraz@example.com", password: "mazendraz2026!" }),
    ).rejects.toThrow(/part of your email/i);
  });

  it("refuses to register over a VERIFIED account", async () => {
    await registerAndVerify("a@example.com");
    await expect(
      svc.register({ name: "someone", email: "a@example.com", password: OTHER_PASSWORD }),
    ).rejects.toThrow(/already has an account/i);
  });

  it("re-arms an UNVERIFIED account, replacing the earlier password and token", async () => {
    // The attacker-registered-first case. The real owner registers, and the link
    // that reaches THEIR inbox must activate THEIR password, not the squatter's.
    await svc.register({ name: "squatter", email: "a@example.com", password: OTHER_PASSWORD });
    const squatterToken = sentTokens[0]!;

    await svc.register({ name: "owner", email: "a@example.com", password: GOOD_PASSWORD });
    const ownerToken = sentTokens[1]!;

    expect(rows).toHaveLength(1); // re-armed, not duplicated
    // The squatter's link is dead — it was overwritten, not kept alongside.
    await expect(svc.verifyEmail(squatterToken)).rejects.toThrow(/invalid or has expired/i);

    await svc.verifyEmail(ownerToken);
    await expect(svc.loginWithPassword("a@example.com", GOOD_PASSWORD)).resolves.toBeDefined();
    await expect(svc.loginWithPassword("a@example.com", OTHER_PASSWORD)).rejects.toThrow();
  });
});

describe("verification", () => {
  it("signs the account in and burns the token", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });
    const token = sentTokens[0]!;

    const customer = await svc.verifyEmail(token);
    expect(customer.emailVerified).toBe(true);

    // Single use — a link recovered from an inbox later must not work again.
    await expect(svc.verifyEmail(token)).rejects.toThrow(/invalid or has expired/i);
  });

  it("rejects an expired token", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });
    rows[0]!.emailVerifyExpires = new Date(Date.now() - 1000);
    await expect(svc.verifyEmail(sentTokens[0]!)).rejects.toThrow(/invalid or has expired/i);
  });

  it("rejects a token that was never issued", async () => {
    await expect(svc.verifyEmail("made-up-token")).rejects.toThrow(/invalid or has expired/i);
  });
});

describe("password sign-in", () => {
  it("accepts the right password on a verified account", async () => {
    await registerAndVerify("a@example.com");
    await expect(svc.loginWithPassword("a@example.com", GOOD_PASSWORD)).resolves.toMatchObject({
      email: "a@example.com",
    });
  });

  it("rejects the wrong password", async () => {
    await registerAndVerify("a@example.com");
    await expect(svc.loginWithPassword("a@example.com", OTHER_PASSWORD)).rejects.toThrow(
      /incorrect email or password/i,
    );
  });

  it("gives an unknown address and a wrong password the SAME answer", async () => {
    await registerAndVerify("a@example.com");
    const unknown = await svc
      .loginWithPassword("nobody@example.com", GOOD_PASSWORD)
      .catch((e: Error) => e.message);
    const wrong = await svc
      .loginWithPassword("a@example.com", OTHER_PASSWORD)
      .catch((e: Error) => e.message);
    expect(unknown).toBe(wrong);
  });

  it("gives a GOOGLE-ONLY account the same answer too", async () => {
    // No passwordHash at all. Any different response here would tell an attacker
    // which addresses are worth attacking with a password and which to phish
    // through Google instead.
    await signInWithIdentity({
      provider: "GOOGLE",
      subject: "sub-1",
      email: "g@example.com",
      emailVerified: true,
      name: "عميل",
      avatarUrl: null,
    });

    const googleOnly = await svc
      .loginWithPassword("g@example.com", GOOD_PASSWORD)
      .catch((e: Error) => e.message);
    const unknown = await svc
      .loginWithPassword("nobody@example.com", GOOD_PASSWORD)
      .catch((e: Error) => e.message);
    expect(googleOnly).toBe(unknown);
  });

  it("refuses a deactivated account", async () => {
    await registerAndVerify("a@example.com");
    rows[0]!.isActive = false;
    await expect(svc.loginWithPassword("a@example.com", GOOD_PASSWORD)).rejects.toThrow();
  });
});

describe("THE TAKEOVER PATH — a planted password account must never be inherited", () => {
  it("Google CLAIMS an unverified account and destroys the planted password", async () => {
    // 1. An attacker registers an address they do not own, choosing the password.
    await svc.register({
      name: "attacker",
      email: "victim@gmail.com",
      password: OTHER_PASSWORD,
    });
    expect(rows[0]!.emailVerified).toBe(false);
    expect(rows[0]!.passwordHash).toBeTruthy();

    // 2. The real owner signs in with Google. Google proves they own the address.
    const res = await signInWithIdentity({
      provider: "GOOGLE",
      subject: "victim-google-sub",
      email: "victim@gmail.com",
      emailVerified: true,
      name: "الضحية",
      avatarUrl: null,
    });
    expect(res.outcome).toBe("linked");

    // 3. The account is now the owner's: verified, and the planted password gone.
    expect(rows[0]!.emailVerified).toBe(true);
    expect(rows[0]!.passwordHash).toBeNull();
    expect(rows[0]!.emailVerifyTokenHash).toBeNull();

    // 4. The attacker's password no longer opens anything. THIS is the assertion
    //    that fails if the claim branch is ever reduced back to a plain link.
    await expect(
      svc.loginWithPassword("victim@gmail.com", OTHER_PASSWORD),
    ).rejects.toThrow(/incorrect email or password/i);
  });

  it("a pending verification link is dead after Google claims the account", async () => {
    // Otherwise the attacker's original link would still flip emailVerified and
    // could re-arm their access after the claim.
    await svc.register({ name: "attacker", email: "victim@gmail.com", password: OTHER_PASSWORD });
    const attackerLink = sentTokens[0]!;

    await signInWithIdentity({
      provider: "GOOGLE",
      subject: "victim-google-sub",
      email: "victim@gmail.com",
      emailVerified: true,
      name: "الضحية",
      avatarUrl: null,
    });

    await expect(svc.verifyEmail(attackerLink)).rejects.toThrow(/invalid or has expired/i);
  });

  it("leaves a VERIFIED account's password alone when Google links to it", async () => {
    // The legitimate case: same person, both methods. Linking must not log them
    // out of the password they set and proved.
    await registerAndVerify("both@example.com");

    await signInWithIdentity({
      provider: "GOOGLE",
      subject: "both-sub",
      email: "both@example.com",
      emailVerified: true,
      name: "عميل",
      avatarUrl: null,
    });

    expect(rows[0]!.passwordHash).toBeTruthy();
    await expect(
      svc.loginWithPassword("both@example.com", GOOD_PASSWORD),
    ).resolves.toBeDefined();
  });
});

describe("resendVerification", () => {
  it("issues a fresh token and kills the previous one", async () => {
    await svc.register({ name: "عميل", email: "a@example.com", password: GOOD_PASSWORD });
    const first = sentTokens[0]!;

    await svc.resendVerification("a@example.com");
    const second = sentTokens[1]!;

    expect(second).not.toBe(first);
    await expect(svc.verifyEmail(first)).rejects.toThrow(/invalid or has expired/i);
    await expect(svc.verifyEmail(second)).resolves.toBeDefined();
  });

  it("is a silent no-op for unknown, verified, and provider-only addresses", async () => {
    await svc.resendVerification("nobody@example.com");
    await registerAndVerify("done@example.com");
    const before = sentTokens.length;
    await svc.resendVerification("done@example.com");
    expect(sentTokens).toHaveLength(before);
  });
});
