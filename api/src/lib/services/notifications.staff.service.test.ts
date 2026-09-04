// The staff notification center. Mirrors notifications.customer.service.test.ts
// — read that first; the mock shape is deliberately the same.
//
// The behaviours that matter here, and why each is worth a test rather than
// being obvious:
//  • record() writes one row PER recipient, because two of its three callers
//    fan out to a set (every provider at a company, every active admin).
//  • record() never throws. Every caller is a lead/chat/approval path that must
//    not fail because the notification record did — the fail-open contract every
//    notify* function in this codebase holds.
//  • markRead is scoped by userId in the WHERE, so another staff member's id is
//    indistinguishable from a missing one. That is the ownership gate, not a
//    convenience — a leak here would let one provider clear another's bell, and
//    confirm which ids exist on that account.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: Date;
}

let rows: Row[] = [];
let nextId = 1;

const db = {
  staffNotification: {
    createMany: async ({ data }: { data: Omit<Row, "id" | "read" | "createdAt">[] }) => {
      for (const d of data) {
        // Fixed base + monotonic id rather than new Date(): two writes in the
        // same millisecond would make "newest first" flaky, not deterministic.
        rows.push({ id: String(nextId), read: false, createdAt: new Date(1700000000000 + nextId), ...d });
        nextId += 1;
      }
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { userId: string } }) =>
      rows
        .filter((n) => n.userId === where.userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    count: async ({ where }: { where: { userId: string; read?: boolean } }) =>
      rows.filter((n) => n.userId === where.userId && (where.read === undefined || n.read === where.read))
        .length,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; userId: string; read?: boolean };
      data: { read: boolean };
    }) => {
      const matches = rows.filter(
        (n) =>
          n.userId === where.userId &&
          (where.id === undefined || n.id === where.id) &&
          (where.read === undefined || n.read === where.read),
      );
      matches.forEach((n) => (n.read = data.read));
      return { count: matches.length };
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const svc = await import("@/lib/services/notifications.staff.service");
const { StaffNotificationType } = await import("@/generated/prisma/enums");

const INPUT = {
  type: StaffNotificationType.LEAD_NEW,
  title: "New lead — Al Assema",
  body: "تشطيبات · R7 · AA-1",
  url: "/provider",
};

beforeEach(() => {
  rows = [];
  nextId = 1;
});

afterEach(() => vi.clearAllMocks());

describe("record", () => {
  it("writes one row per recipient", async () => {
    await svc.record(["u1", "u2", "u3"], INPUT);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.userId)).toEqual(["u1", "u2", "u3"]);
    expect(rows[0]).toMatchObject({ type: "LEAD_NEW", read: false, url: "/provider" });
  });

  it("is a no-op for an empty recipient set", async () => {
    await svc.record([], INPUT);
    expect(rows).toHaveLength(0);
  });

  it("stores a null url when none is given", async () => {
    await svc.record(["u1"], { type: StaffNotificationType.SYSTEM, title: "t", body: "b" });
    expect(rows[0].url).toBeNull();
  });

  it("never throws when the write fails — the caller must not fail with it", async () => {
    const boom = vi.spyOn(db.staffNotification, "createMany").mockRejectedValueOnce(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(svc.record(["u1"], INPUT)).resolves.toBeUndefined();
    expect(boom).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("listNotifications", () => {
  it("returns this user's rows newest first, with the unread count", async () => {
    await svc.record(["u1"], INPUT);
    await svc.record(["u1"], { ...INPUT, title: "second" });
    await svc.record(["u2"], { ...INPUT, title: "someone else's" });

    const res = await svc.listNotifications("u1");
    expect(res.notifications.map((n) => n.title)).toEqual(["second", "New lead — Al Assema"]);
    expect(res.unreadCount).toBe(2);
  });

  it("never returns another user's rows", async () => {
    await svc.record(["u2"], INPUT);
    const res = await svc.listNotifications("u1");
    expect(res.notifications).toEqual([]);
    expect(res.unreadCount).toBe(0);
  });

  it("serializes createdAt to epoch ms, matching the API contract", async () => {
    await svc.record(["u1"], INPUT);
    const res = await svc.listNotifications("u1");
    expect(typeof res.notifications[0].createdAt).toBe("number");
  });
});

describe("unreadCount", () => {
  it("counts only unread rows for this user", async () => {
    await svc.record(["u1"], INPUT);
    await svc.record(["u1"], INPUT);
    await svc.record(["u2"], INPUT);
    expect(await svc.unreadCount("u1")).toBe(2);

    await svc.markAllRead("u1");
    expect(await svc.unreadCount("u1")).toBe(0);
    // u2's row is untouched — mark-all is scoped to the caller.
    expect(await svc.unreadCount("u2")).toBe(1);
  });
});

describe("markRead", () => {
  it("marks one row read", async () => {
    await svc.record(["u1"], INPUT);
    await svc.markRead("u1", rows[0].id);
    expect(rows[0].read).toBe(true);
  });

  it("404s on another user's id — the ownership gate", async () => {
    await svc.record(["u2"], INPUT);
    const otherId = rows[0].id;
    await expect(svc.markRead("u1", otherId)).rejects.toThrow();
    // and did not flip it
    expect(rows[0].read).toBe(false);
  });

  it("404s on an id that does not exist at all, indistinguishably", async () => {
    await expect(svc.markRead("u1", "nope")).rejects.toThrow();
  });
});

describe("markAllRead", () => {
  it("clears every unread row for this user only", async () => {
    await svc.record(["u1", "u2"], INPUT);
    await svc.markAllRead("u1");
    expect(rows.find((r) => r.userId === "u1")!.read).toBe(true);
    expect(rows.find((r) => r.userId === "u2")!.read).toBe(false);
  });
});
