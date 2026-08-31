// Device sessions for the Business App (staff): rotation, the dropped-response
// retry, and reuse detection. A direct mirror of customerSession.service.test.ts
// — see that file's own header for why both edges of rotation strictness are
// worth pinning. The one behavioural difference under test here is the TTL
// (30 days, not 60) and the audit action name.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

interface SessionRow {
  id: string;
  userId: string;
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
let userActive = true;
let nextId = 1;

function findByHash(hash: string): SessionRow | undefined {
  return rows.find((r) => r.tokenHash === hash || r.previousTokenHash === hash);
}

const db = {
  staffSession: {
    create: async ({ data }: { data: Partial<SessionRow> }) => {
      const row: SessionRow = {
        id: `s${nextId++}`,
        userId: data.userId!,
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
      return row ? { ...row, user: { isActive: userActive } } : null;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = rows.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: { where: { userId: string } }) =>
      rows.filter((r) => r.userId === where.userId && r.revokedAt === null && r.expiresAt > new Date()),
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
        if (typeof where.userId === "string" && r.userId !== where.userId) return false;
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
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const before = rows.length;
      rows = rows.filter((r) => {
        const expired = where.expiresAt && (where.expiresAt as { lte: Date }).lte instanceof Date
          ? r.expiresAt <= (where.expiresAt as { lte: Date }).lte
          : false;
        const notRevoked = where.revokedAt === null ? r.revokedAt === null : true;
        return !(expired && notRevoked);
      });
      return { count: before - rows.length };
    },
  },
  // revokeAll moves the ACCOUNT-WIDE token floor alongside revoking the
  // session rows — see User.tokensValidFrom. Without that half, "sign out
  // everywhere" only killed refresh tokens and left every access token
  // already issued working until it expired.
  user: {
    update: async ({ where, data }: { where: { id: string }; data: { tokensValidFrom?: Date } }) => {
      if (data.tokensValidFrom) tokenFloors.set(where.id, data.tokensValidFrom);
      return { id: where.id };
    },
  },
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
};

/** userId -> the floor revokeAll set, for assertions. */
const tokenFloors = new Map<string, Date>();

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const recorded: string[] = [];
vi.mock("@/lib/services/audit.service", () => ({
  recordAuth: async (e: { action: string }) => {
    recorded.push(e.action);
  },
}));

const svc = await import("@/lib/services/staffSession.service");

const USER = "user-1";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => {
  rows = [];
  recorded.length = 0;
  nextId = 1;
  userActive = true;
  tokenFloors.clear();
});

describe("issuing", () => {
  it("returns a token and stores only its hash", async () => {
    const { refreshToken } = await svc.issue(USER, { platform: "ios" });
    expect(refreshToken).toBeTruthy();
    expect(rows[0]!.tokenHash).toBe(sha(refreshToken));
    expect(rows[0]!.tokenHash).not.toBe(refreshToken);
  });

  it("truncates client-supplied device labels", async () => {
    await svc.issue(USER, { deviceName: "x".repeat(500) });
    expect(rows[0]!.deviceName!.length).toBe(80);
  });
});

describe("rotation", () => {
  it("issues a new token and retires the old one", async () => {
    const { refreshToken: first } = await svc.issue(USER);
    const { refreshToken: second } = await svc.refresh(first);

    expect(second).not.toBe(first);
    expect(rows[0]!.tokenHash).toBe(sha(second));
    expect(rows[0]!.previousTokenHash).toBe(sha(first));
  });

  it("keeps working across many rotations", async () => {
    let token = (await svc.issue(USER)).refreshToken;
    for (let i = 0; i < 5; i += 1) {
      token = (await svc.refresh(token)).refreshToken;
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha(token));
  });

  it("extends the expiry on each use, to the 30-day TTL", async () => {
    const { refreshToken } = await svc.issue(USER);
    rows[0]!.expiresAt = new Date(Date.now() + 60_000); // nearly done
    await svc.refresh(refreshToken);
    // An app in daily use never expires; one abandoned for a month does.
    // Half of the customer session's 60-day window — a staff credential
    // carries more authority and staff turnover is a real revocation event.
    const days30 = 30 * 24 * 60 * 60 * 1000;
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + days30 - 60_000);
    expect(rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + days30 + 5_000);
  });
});

describe("the dropped-response retry", () => {
  it("answers a just-rotated token with a working one instead of a sign-out", async () => {
    const { refreshToken: first } = await svc.issue(USER);
    await svc.refresh(first); // response never arrives

    const retried = await svc.refresh(first);
    expect(retried.refreshToken).toBeTruthy();
    expect(rows[0]!.revokedAt).toBeNull();
    expect(recorded).not.toContain("auth.staff.session.reuse");
  });
});

describe("REUSE DETECTION — a retired token presented after the grace window", () => {
  it("revokes the whole session", async () => {
    const { refreshToken: stolen } = await svc.issue(USER);
    await svc.refresh(stolen);

    // Walk past the grace window.
    rows[0]!.previousUsableTo = new Date(Date.now() - 1000);

    await expect(svc.refresh(stolen)).rejects.toThrow(/session expired/i);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(recorded).toContain("auth.staff.session.reuse");
  });

  it("also locks out the CURRENT token — the legitimate device included", async () => {
    const { refreshToken: stolen } = await svc.issue(USER);
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
    const { refreshToken } = await svc.issue(USER);
    await svc.revokeAll(USER);
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("rejects an expired session", async () => {
    const { refreshToken } = await svc.issue(USER);
    rows[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("rejects a session whose account was deactivated", async () => {
    // The kill-switch has to reach the refresh path too, or a deactivated
    // staff account keeps minting access tokens for up to 30 days.
    const { refreshToken } = await svc.issue(USER);
    userActive = false;
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/session expired/i);
  });

  it("says the same thing for every one of them", async () => {
    const { refreshToken: revoked } = await svc.issue(USER);
    await svc.revokeAll(USER);
    const { refreshToken: expired } = await svc.issue(USER);
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
    const a = await svc.issue(USER, { deviceName: "phone" });
    const b = await svc.issue(USER, { deviceName: "tablet" });

    await svc.revoke(USER, a.sessionId);

    await expect(svc.refresh(a.refreshToken)).rejects.toThrow();
    await expect(svc.refresh(b.refreshToken)).resolves.toBeDefined();
  });

  it("never lets one account revoke another's session", async () => {
    const mine = await svc.issue("someone-else", { deviceName: "their phone" });
    await svc.revoke(USER, mine.sessionId); // guessed id, wrong owner
    await expect(svc.refresh(mine.refreshToken)).resolves.toBeDefined();
  });

  it("signs out everywhere", async () => {
    await svc.issue(USER);
    await svc.issue(USER);
    expect(await svc.revokeAll(USER)).toBe(2);
    expect(await svc.listActive(USER)).toHaveLength(0);
  });

  it("moves the account token floor, not just the session rows", async () => {
    const before = Date.now();
    await svc.issue(USER);
    await svc.revokeAll(USER);

    const floor = tokenFloors.get(USER);
    expect(floor).toBeInstanceOf(Date);
    expect(floor!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("does NOT move the floor when revoking a single device", async () => {
    const { sessionId } = await svc.issue(USER);
    await svc.revoke(USER, sessionId);
    expect(tokenFloors.has(USER)).toBe(false);
  });

  it("revokes by token — what the app's own sign-out calls", async () => {
    const { refreshToken } = await svc.issue(USER);
    await svc.revokeByToken(refreshToken);
    await expect(svc.refresh(refreshToken)).rejects.toThrow();
  });

  it("is idempotent and silent about whether the token matched", async () => {
    await expect(svc.revokeByToken("never-issued")).resolves.toBeUndefined();
  });
});

describe("listActive", () => {
  it("hides revoked and expired sessions", async () => {
    const live = await svc.issue(USER, { deviceName: "phone" });
    const gone = await svc.issue(USER, { deviceName: "old" });
    await svc.revoke(USER, gone.sessionId);

    const list = await svc.listActive(USER);
    expect(list.map((s) => s.id)).toEqual([live.sessionId]);
  });

  it("never returns anything resembling the token", async () => {
    await svc.issue(USER, { deviceName: "phone" });
    const [session] = await svc.listActive(USER);
    expect(session).not.toHaveProperty("tokenHash");
    expect(session).not.toHaveProperty("previousTokenHash");
  });
});

describe("sweepExpired", () => {
  it("removes only expired, non-revoked rows", async () => {
    const stale = await svc.issue(USER);
    rows[0]!.expiresAt = new Date(Date.now() - 1000);
    await svc.issue(USER); // still live

    const removed = await svc.sweepExpired();
    expect(removed).toBe(1);
    expect(rows.some((r) => r.tokenHash === sha(stale.refreshToken))).toBe(false);
    expect(rows).toHaveLength(1);
  });
});
