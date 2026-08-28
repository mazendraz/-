// notifyCustomer is now the ONE place that both records a customer-facing
// Notification row and fans out the push (see the service's own module
// comment) — these tests carry the two behaviours that matter: the write
// always happens (fail-open, never blocks the caller), and the marketing
// opt-out gates ONLY the push for MARKETING, never the row, and never any
// other type.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface NotificationRow {
  id: string;
  customerId: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: Date;
}

let notifications: NotificationRow[] = [];
let customers: Record<string, { marketingPushEnabled: boolean; marketingEmailEnabled: boolean }> = {};
let nextId = 1;

const db = {
  notification: {
    create: async ({ data }: { data: Omit<NotificationRow, "id" | "read" | "createdAt"> }) => {
      // A fixed base + the monotonic id (not `new Date()`) — two creates in
      // the same test can land in the same millisecond, which would make
      // "newest first" ordering flaky rather than deterministic.
      const row: NotificationRow = {
        id: String(nextId),
        read: false,
        createdAt: new Date(1700000000000 + nextId),
        ...data,
      };
      nextId += 1;
      notifications.push(row);
      return row;
    },
    findMany: async ({ where }: { where: { customerId: string } }) =>
      notifications
        .filter((n) => n.customerId === where.customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    count: async ({ where }: { where: { customerId: string; read: boolean } }) =>
      notifications.filter((n) => n.customerId === where.customerId && n.read === where.read).length,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; customerId: string; read?: boolean };
      data: { read: boolean };
    }) => {
      const matches = notifications.filter(
        (n) =>
          n.customerId === where.customerId &&
          (where.id === undefined || n.id === where.id) &&
          (where.read === undefined || n.read === where.read),
      );
      matches.forEach((n) => (n.read = data.read));
      return { count: matches.length };
    },
  },
  customerUser: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const prefs = customers[where.id];
      return prefs ? { marketingPushEnabled: prefs.marketingPushEnabled } : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const prefs = customers[where.id];
      if (!prefs) throw new Error("not found");
      return prefs;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<{ marketingPushEnabled: boolean; marketingEmailEnabled: boolean }>;
    }) => {
      customers[where.id] = { ...customers[where.id], ...data };
      return customers[where.id];
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const notifyCustomerDevices = vi.fn(async () => 1);
vi.mock("@/lib/services/expoPush.service", () => ({ notifyCustomerDevices }));

const svc = await import("@/lib/services/notifications.customer.service");
const { NotificationType } = await import("@/generated/prisma/enums");

beforeEach(() => {
  notifications = [];
  customers = { c1: { marketingPushEnabled: true, marketingEmailEnabled: true } };
  nextId = 1;
});

afterEach(() => {
  vi.clearAllMocks();
});

const PAYLOAD = { type: NotificationType.LEAD_STATUS, title: "تم التواصل معك", body: "AA-1 · تكييفات" };

describe("notifyCustomer", () => {
  it("writes a Notification row and pushes for a non-marketing type", async () => {
    await svc.notifyCustomer("c1", PAYLOAD);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ customerId: "c1", type: "LEAD_STATUS", read: false });
    expect(notifyCustomerDevices).toHaveBeenCalledTimes(1);
  });

  it("pushes MARKETING when the customer has it enabled", async () => {
    await svc.notifyCustomer("c1", { ...PAYLOAD, type: NotificationType.MARKETING });
    expect(notifyCustomerDevices).toHaveBeenCalledTimes(1);
  });

  it("still writes the row but skips the push when marketing is disabled", async () => {
    customers.c1.marketingPushEnabled = false;
    await svc.notifyCustomer("c1", { ...PAYLOAD, type: NotificationType.MARKETING });
    expect(notifications).toHaveLength(1);
    expect(notifyCustomerDevices).not.toHaveBeenCalled();
  });

  // Section 5's whole point: order/account notifications must keep working
  // no matter what a customer set their MARKETING preference to. Every
  // non-MARKETING type ignores marketingPushEnabled entirely — it's never
  // even read for these.
  it.each(["LEAD_CREATED", "LEAD_STATUS", "LEAD_COMPLETED", "CHAT_MESSAGE", "WAITLIST_NOTIFIED"] as const)(
    "%s still pushes even when the customer has marketingPushEnabled=false",
    async (type) => {
      customers.c1.marketingPushEnabled = false;
      await svc.notifyCustomer("c1", { ...PAYLOAD, type: NotificationType[type] });
      expect(notifyCustomerDevices).toHaveBeenCalledTimes(1);
    },
  );

  it("never throws when the customer row is missing", async () => {
    await expect(svc.notifyCustomer("ghost", { ...PAYLOAD, type: NotificationType.MARKETING })).resolves.toBeUndefined();
  });
});

describe("listNotifications", () => {
  it("returns notifications newest-first plus the unread count", async () => {
    await svc.notifyCustomer("c1", PAYLOAD);
    await svc.notifyCustomer("c1", { ...PAYLOAD, title: "second" });
    const res = await svc.listNotifications("c1");
    expect(res.notifications).toHaveLength(2);
    expect(res.notifications[0].title).toBe("second");
    expect(res.unreadCount).toBe(2);
  });
});

describe("markRead / markAllRead", () => {
  it("marks a single notification read, ownership-checked", async () => {
    await svc.notifyCustomer("c1", PAYLOAD);
    const id = notifications[0].id;
    await svc.markRead("c1", id);
    expect(notifications[0].read).toBe(true);
  });

  it("throws NotFoundError for another customer's notification", async () => {
    await svc.notifyCustomer("c1", PAYLOAD);
    const id = notifications[0].id;
    await expect(svc.markRead("c2", id)).rejects.toThrow();
  });

  it("marks every unread notification read", async () => {
    await svc.notifyCustomer("c1", PAYLOAD);
    await svc.notifyCustomer("c1", { ...PAYLOAD, title: "second" });
    await svc.markAllRead("c1");
    expect(notifications.every((n) => n.read)).toBe(true);
  });
});

describe("preferences", () => {
  it("round-trips a partial update", async () => {
    const updated = await svc.setPreferences("c1", { marketingPushEnabled: false });
    expect(updated).toEqual({ marketingPushEnabled: false, marketingEmailEnabled: true });
    expect(await svc.getPreferences("c1")).toEqual(updated);
  });
});
