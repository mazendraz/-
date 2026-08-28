// Device sessions: rotation, the dropped-response retry, and reuse detection.
//
// Rotation is easy to write and easy to get subtly wrong in two opposite
// directions. Too strict and a single lost response signs the customer out —
// common enough on a mobile network that it would read as "the app keeps logging
// me out". Too loose and a stolen refresh token keeps working forever beside the
// real device, silently. The tests below pin both edges.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

interface SessionRow {
  id: string;
  customerId: string;
  tokenHash: string;
  previousTokenHash: string | null;
  previousUsableTo: Date | null;
  deviceName: string | null;
  platform: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

let rows: SessionRow[] = [];
let customerActive = true;
let nextId = 1;

function findByHash(hash: string): SessionRow | undefined {
  return rows.find((r) => r.tokenHash === hash || r.previousTokenHash === hash);
}

const db = {
  customerSession: {
    create: async ({ data }: { data: Partial<SessionRow> }) => {
      const row: SessionRow = {
        id: `s${nextId++}`,
        customerId: data.customerId!,
        tokenHash: data.tokenHash!,
        previousTokenHash: null,
        previousUsableTo: null,
        deviceName: data.deviceName ?? null,
        platform: data.platform ?? null,
        lastUsedAt: new Date(),
        expiresAt: data.expiresAt!,
        revokedAt: null,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: { OR: { tokenHash?: string; previousTokenHash?: string }[] } }) => {
      const hash = where.OR[0]!.tokenHash ?? where.OR[1]!.previousTokenHash!;
      const row = findByHash(hash);
      return row ? { ...row, customer: { isActive: customerActive } } : null;
    },
    findMany: async ({ where }: { where: { customerId: string } }) =>
      rows.filter(
        (r) => r.customerId === where.customerId && r.revokedAt === null && r.expiresAt > new Date(),
      ),
    update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<SessionRow>;
    }) => {
      const matches = rows.filter((r) => {
        if (where.revokedAt === null && r.revokedAt !== null) return false;
        if (typeof where.id === "string" && r.id !== where.id) return false;
        if (typeof where.customerId === "string" && r.customerId !== where.customerId) return false;
        if (Array.isArray(where.OR)) {
          const hashes = (where.OR as { tokenHash?: string; previousTokenHash?: string }[])
            .map((o) => o.tokenHash ?? o.previousTokenHash)
            .filter(Boolean) as string[];
          if (!hashes.some((h) => r.tokenHash === h || r.previousTokenHash === h)) return false;
        }
        return true;
      });
      matches.forEach((r) => Object.assign(r, data));
      return { count: matches.length };
    },
  },
  // revokeAll now moves the ACCOUNT-WIDE token floor alongside revoking the
  // session rows — see CustomerUser.tokensValidFrom. Without that half, "sign
  // out everywhere" only killed refresh tokens and left every access token
  // already issued working until it expired.
  customerUser: {
    update: async ({ where, data }: { where: { id: string }; data: { tokensValidFrom?: Date } }) => {
      if (data.tokensValidFrom) tokenFloors.set(where.id, data.tokensValidFrom);
      return { id: where.id };
    },
  },
  // The two writes above are one transaction so a crash between them cannot
  // leave the sessions revoked and the floor unmoved. Prisma's array form
  // resolves the promises it is handed, which is all this needs to mirror.
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
};

/** customerId -> the floor revokeAll set, for assertions. */
const tokenFloors = new Map<string, Date>();

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const recorded: string[] = [];
vi.mock("@/lib/services/audit.service", () => ({
  recordAuth: async (e: { action: string }) => {
    recorded.push(e.action);
  },
}));

const svc = await import("@/lib/services/customerSession.service");

const CUSTOMER = "cust-1";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => {
  rows = [];
  recorded.length = 0;
  nextId = 1;
  customerActive = true;
  tokenFloors.clear();
});

describe("issuing", () => {
  it("returns a token and stores only its hash", async () => {
    const { refreshToken } = await svc.issue(CUSTOMER, { platform: "ios" });
    expect(refreshToken).toBeTruthy();
    expect(rows[0]!.tokenHash).toBe(sha(refreshToken));
    expect(rows[0]!.tokenHash).not.toBe(refreshToken);
  });

  it("truncates client-supplied device labels", async () => {
    await svc.issue(CUSTOMER, { deviceName: "x".repeat(500) });
    expect(rows[0]!.deviceName!.length).toBe(80);
  });
});

describe("rotation", () => {
  it("issues a new token and retires the old one", async () => {
    const { refreshToken: first } = await svc.issue(CUSTOMER);
    const { refreshToken: second } = await svc.refresh(first);

    expect(second).not.toBe(first);
    expect(rows[0]!.tokenHash).toBe(sha(second));
    expect(rows[0]!.previousTokenHash).toBe(sha(first));
  });

  it("keeps working across many rotations", async () => {
    let token = (await svc.issue(CUSTOMER)).refreshToken;
    for (let i = 0; i < 5; i += 1) {
      token = (await svc.refresh(token)).refreshToken;
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha(token));
  });

  it("extends the expiry on each use", async () => {
    const { refreshToken } = await svc.issue(CUSTOMER);
    rows[0]!.expiresAt = new Date(Date.now() + 60_000); // nearly done
    await svc.refresh(refreshToken);
    // An app in daily use never expires; one abandoned for two months does.
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
  });
});

describe("the dropped-response retry", () => {
  it("answers a just-rotated token with a working one instead of a sign-out", async () => {
    // The server rotated, the reply was lost, the app retries with what it has.
    const { refreshToken: first } = await svc.issue(CUSTOMER);
    await svc.refresh(first); // response never arrives

    const retried = await svc.refresh(first);
    expect(retried.refreshToken).toBeTruthy();
    expect(rows[0]!.revokedAt).toBeNull();
    expect(recorded).not.toContain("auth.customer.session.reuse");
  });
});

describe("REUSE DETECTION — a retired token presented after the grace window", () => {
  it("revokes the whole session", async () => {
    // The real device rotated past this token long ago. A second party holding
    // a copy is the only explanation left.
    const { refreshToken: stolen } = await svc.issue(CUSTOMER);
    await svc.refresh(stolen);

    // Walk past the grace window.
    rows[0]!.previousUsableTo = new Date(Date.now() - 1000);

    await expect(svc.refresh(stolen)).rejects.toThrow(/session expired/i);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(recorded).toContain("auth.customer.session.reuse");
  });

  it("also locks out the CURRENT token — the legitimate device included", async () => {
    // Deliberate. Once a copy is proven to exist we cannot tell which holder is
    // the real one, and leaving the session alive would let the thief keep
    // refreshing beside its owner. The owner signs in again; the thief cannot.
    const { refreshToken: stolen } = await svc.issue(CUSTOMER);
    const { refreshToken: live } = await svc.refresh(stolen);
    rows[0]!.previousUsableTo = new Date(Date.now() - 1000);

    await svc.refresh(stolen).catch(() => {});
    await expect(svc.refresh(live)).rejects.toThrow(/session expired/i);
  });
});

describe("refusals — all indistinguishable", () => {
  it("rejects an unknown token", async () => {
    await expect(svc.refresh("never-issued")).rejects.toThrow(/session expired/i);
  });

  it("rejects a revoked session", async () => {
    const { refreshToken } = await svc.issue(CUSTOMER);
    await svc.revokeAll(CUSTOMER);
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("rejects an expired session", async () => {
    const { refreshToken } = await svc.issue(CUSTOMER);
    rows[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("rejects a session whose account was deactivated", async () => {
    // The kill-switch has to reach the refresh path too, or a deactivated
    // account keeps minting access tokens for up to 60 days.
    const { refreshToken } = await svc.issue(CUSTOMER);
    customerActive = false;
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("says the same thing for every one of them", async () => {
    const { refreshToken: revoked } = await svc.issue(CUSTOMER);
    await svc.revokeAll(CUSTOMER);
    const { refreshToken: expired } = await svc.issue(CUSTOMER);
    rows[1]!.expiresAt = new Date(Date.now() - 1000);

    const messages = [
      await svc.refresh("never-issued").catch((e: Error) => e.message),
      await svc.refresh(revoked).catch((e: Error) => e.message),
      await svc.refresh(expired).catch((e: Error) => e.message),
    ];
    expect(new Set(messages).size).toBe(1);
  });
});

describe("revocation", () => {
  it("signs out one device without touching the others", async () => {
    const a = await svc.issue(CUSTOMER, { deviceName: "phone" });
    const b = await svc.issue(CUSTOMER, { deviceName: "tablet" });

    await svc.revoke(CUSTOMER, a.sessionId);

    await expect(svc.refresh(a.refreshToken)).rejects.toThrow();
    await expect(svc.refresh(b.refreshToken)).resolves.toBeDefined();
  });

  it("never lets one account revoke another's session", async () => {
    const mine = await svc.issue("someone-else", { deviceName: "their phone" });
    await svc.revoke(CUSTOMER, mine.sessionId); // guessed id, wrong owner
    await expect(svc.refresh(mine.refreshToken)).resolves.toBeDefined();
  });

  it("signs out everywhere", async () => {
    await svc.issue(CUSTOMER);
    await svc.issue(CUSTOMER);
    expect(await svc.revokeAll(CUSTOMER)).toBe(2);
    expect(await svc.listActive(CUSTOMER)).toHaveLength(0);
  });

  // Revoking the session rows kills REFRESH tokens. It does nothing to an
  // access token already in circulation — that is a stateless JWT — so without
  // the floor, "sign out everywhere" left a thief's token working until it
  // expired, which is the one scenario someone taps that button in.
  it("moves the account token floor, not just the session rows", async () => {
    const before = Date.now();
    await svc.issue(CUSTOMER);
    await svc.revokeAll(CUSTOMER);

    const floor = tokenFloors.get(CUSTOMER);
    expect(floor).toBeInstanceOf(Date);
    expect(floor!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("does NOT move the floor when revoking a single device", async () => {
    // One lost phone must not sign out every other device — that case is
    // carried by the token's `sid` claim instead.
    const { sessionId } = await svc.issue(CUSTOMER);
    await svc.revoke(CUSTOMER, sessionId);
    expect(tokenFloors.has(CUSTOMER)).toBe(false);
  });

  it("revokes by token — what an app's own sign-out calls", async () => {
    const { refreshToken } = await svc.issue(CUSTOMER);
    await svc.revokeByToken(refreshToken);
    await expect(svc.refresh(refreshToken)).rejects.toThrow();
  });

  it("is idempotent and silent about whether the token matched", async () => {
    await expect(svc.revokeByToken("never-issued")).resolves.toBeUndefined();
  });
});

describe("listActive", () => {
  it("hides revoked and expired sessions", async () => {
    const live = await svc.issue(CUSTOMER, { deviceName: "phone" });
    const gone = await svc.issue(CUSTOMER, { deviceName: "old" });
    await svc.revoke(CUSTOMER, gone.sessionId);

    const list = await svc.listActive(CUSTOMER);
    expect(list.map((s) => s.id)).toEqual([live.sessionId]);
  });

  it("never returns anything resembling the token", async () => {
    await svc.issue(CUSTOMER, { deviceName: "phone" });
    const [session] = await svc.listActive(CUSTOMER);
    expect(session).not.toHaveProperty("tokenHash");
    expect(session).not.toHaveProperty("previousTokenHash");
  });
});
