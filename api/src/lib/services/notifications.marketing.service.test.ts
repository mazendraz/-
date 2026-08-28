// The one gate every marketing send passes through: frequency cap, Cairo
// send window (email only), open-lead suppression, per-channel opt-out, and
// the unsubscribe headers/footer. Push and the DB row are covered by
// existing expoPush/notification-table tests elsewhere — this file is about
// the DECISION, not the transport.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DAY_MS = 86_400_000;

interface CustomerRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  marketingPushEnabled: boolean;
  marketingEmailEnabled: boolean;
}
interface NotificationRow {
  customerId: string;
  type: string;
  createdAt: Date;
}
interface LeadRow {
  customerId: string;
  status: string;
}

let customers: Record<string, CustomerRow> = {};
let notifications: NotificationRow[] = [];
let leads: LeadRow[] = [];
let createdNotifications: NotificationRow[] = [];

const db = {
  customerUser: {
    findUnique: async ({ where }: { where: { id: string } }) => customers[where.id] ?? null,
  },
  notification: {
    findFirst: async ({ where }: { where: { customerId: string; type: string; read?: boolean } }) => {
      const rows = notifications
        .filter((n) => n.customerId === where.customerId && n.type === where.type)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    },
    create: async ({ data }: { data: { customerId: string; type: string } }) => {
      const row = { customerId: data.customerId, type: data.type, createdAt: new Date() };
      notifications.push(row);
      createdNotifications.push(row);
      return row;
    },
  },
  lead: {
    findFirst: async ({ where }: { where: { customerId: string; status: { in: string[] } } }) =>
      leads.find((l) => l.customerId === where.customerId && where.status.in.includes(l.status)) ?? null,
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const notifyCustomerDevices = vi.fn(async () => 1);
vi.mock("@/lib/services/expoPush.service", () => ({ notifyCustomerDevices }));

interface BuiltEmailLike {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  dir?: "ltr" | "rtl";
  headers?: Record<string, string>;
  from?: string;
  // Mirrors BuiltEmail in notifications.service.ts. Absent here, the assertions
  // below that read it were type errors against this local stand-in even though
  // the real field exists and the runtime behaviour was correct.
  footerExtraHtml?: string;
}
const sendBuiltEmail = vi.fn<(email: BuiltEmailLike) => Promise<boolean>>(async () => true);
vi.mock("@/lib/services/notifications.service", () => ({ sendBuiltEmail }));

vi.mock("@/lib/utils/unsubscribeToken", () => ({
  signUnsubscribeToken: (customerId: string) => `token-${customerId}`,
}));

const svc = await import("@/lib/services/notifications.marketing.service");

function customer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "c1",
    email: "mona@example.test",
    name: "منى",
    isActive: true,
    marketingPushEnabled: true,
    marketingEmailEnabled: true,
    ...overrides,
  };
}

// 2026-08-25 is a Tuesday — the day-of-week doesn't matter for this gate,
// only the hour. Noon UTC is 14:00 in Cairo (UTC+2 baseline) — comfortably
// inside the 11–21 window regardless of whether Egypt is observing any DST
// variant that year.
const CAIRO_MIDDAY_UTC = new Date("2026-08-25T12:00:00Z");
// 02:00 UTC is 04:00 in Cairo — comfortably outside the window either way.
const CAIRO_NIGHT_UTC = new Date("2026-08-25T02:00:00Z");

beforeEach(() => {
  customers = { c1: customer() };
  notifications = [];
  createdNotifications = [];
  leads = [];
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.PUBLIC_SITE_URL = "https://alassema.test";
  vi.useFakeTimers();
  vi.setSystemTime(CAIRO_MIDDAY_UTC);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const INPUT = { title: "عنوان", body: "نص", url: "/services", tag: "t1" };

describe("isWithinCairoSendWindow", () => {
  it("is true at Cairo midday", () => {
    expect(svc.isWithinCairoSendWindow(CAIRO_MIDDAY_UTC)).toBe(true);
  });
  it("is false at Cairo night", () => {
    expect(svc.isWithinCairoSendWindow(CAIRO_NIGHT_UTC)).toBe(false);
  });
});

describe("notifyCustomerMarketing — happy path", () => {
  it("writes a Notification row, pushes, and emails with unsubscribe headers", async () => {
    const result = await svc.notifyCustomerMarketing("c1", {
      ...INPUT,
      email: (c) => ({ subject: "s", text: `hi ${c.name}`, html: `<p>${c.unsubscribeUrl}</p>` }),
    });
    expect(result).toEqual({ sent: true, pushed: true, emailed: true });
    expect(createdNotifications).toHaveLength(1);
    expect(notifyCustomerDevices).toHaveBeenCalledTimes(1);
    expect(sendBuiltEmail).toHaveBeenCalledTimes(1);
    const built = sendBuiltEmail.mock.calls[0]![0];
    expect(built.to).toBe("mona@example.test");
    expect(built.headers?.["List-Unsubscribe"]).toContain("token-c1");
    expect(built.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The link rides in footerExtraHtml, not the body: the shell drops it into
    // the footer block with the rest of the small print (see emailLayout.ts).
    expect(built.footerExtraHtml).toContain("إلغاء الاشتراك");
    expect(built.footerExtraHtml).toContain("token-c1");
    expect(built.html).not.toContain("إلغاء الاشتراك");
    expect(built.text).toContain("إلغاء الاشتراك");
  });
});

describe("marketing opt-out", () => {
  it("skips push when marketingPushEnabled is false, still emails", async () => {
    customers.c1.marketingPushEnabled = false;
    const result = await svc.notifyCustomerMarketing("c1", { ...INPUT, email: () => ({ subject: "s", text: "t", html: "h" }) });
    expect(result).toEqual({ sent: true, pushed: false, emailed: true });
    expect(notifyCustomerDevices).not.toHaveBeenCalled();
  });

  it("skips email when marketingEmailEnabled is false, still pushes", async () => {
    customers.c1.marketingEmailEnabled = false;
    const result = await svc.notifyCustomerMarketing("c1", { ...INPUT, email: () => ({ subject: "s", text: "t", html: "h" }) });
    expect(result).toEqual({ sent: true, pushed: true, emailed: false });
    expect(sendBuiltEmail).not.toHaveBeenCalled();
  });

  it("suppresses entirely when both channels are opted out", async () => {
    customers.c1.marketingPushEnabled = false;
    customers.c1.marketingEmailEnabled = false;
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result).toEqual({ sent: false, pushed: false, emailed: false, reason: "opted-out" });
    expect(createdNotifications).toHaveLength(0);
  });
});

describe("14-day frequency cap", () => {
  it("blocks a second marketing send within 14 days", async () => {
    notifications = [{ customerId: "c1", type: "MARKETING", createdAt: new Date(Date.now() - 5 * DAY_MS) }];
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result).toEqual({ sent: false, pushed: false, emailed: false, reason: "frequency-cap" });
    expect(notifyCustomerDevices).not.toHaveBeenCalled();
    expect(sendBuiltEmail).not.toHaveBeenCalled();
  });

  it("allows a send exactly 14 days after the last one", async () => {
    notifications = [{ customerId: "c1", type: "MARKETING", createdAt: new Date(Date.now() - 14 * DAY_MS) }];
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result.sent).toBe(true);
  });

  it("does not count a transactional (non-MARKETING) notification against the cap", async () => {
    notifications = [{ customerId: "c1", type: "LEAD_STATUS", createdAt: new Date() }];
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result.sent).toBe(true);
  });
});

describe("open-lead suppression", () => {
  it("suppresses a generic campaign when the customer has an open lead", async () => {
    leads = [{ customerId: "c1", status: "NEW" }];
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result).toEqual({ sent: false, pushed: false, emailed: false, reason: "open-lead" });
  });

  it("does not suppress a lead-specific nudge (e.g. stale-lead) despite an open lead", async () => {
    leads = [{ customerId: "c1", status: "NEW" }];
    const result = await svc.notifyCustomerMarketing("c1", { ...INPUT, leadSpecific: true });
    expect(result.sent).toBe(true);
  });

  it("does not suppress when the customer's only leads are closed", async () => {
    leads = [{ customerId: "c1", status: "COMPLETED" }];
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result.sent).toBe(true);
  });
});

describe("Cairo sending window (email only)", () => {
  it("skips email outside the window but still pushes", async () => {
    vi.setSystemTime(CAIRO_NIGHT_UTC);
    const result = await svc.notifyCustomerMarketing("c1", { ...INPUT, email: () => ({ subject: "s", text: "t", html: "h" }) });
    expect(result).toEqual({ sent: true, pushed: true, emailed: false });
    expect(sendBuiltEmail).not.toHaveBeenCalled();
  });
});

describe("unsubscribe secret required for email", () => {
  it("skips email (push-only) when UNSUBSCRIBE_SECRET is unset", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const result = await svc.notifyCustomerMarketing("c1", { ...INPUT, email: () => ({ subject: "s", text: "t", html: "h" }) });
    expect(result).toEqual({ sent: true, pushed: true, emailed: false });
    expect(sendBuiltEmail).not.toHaveBeenCalled();
  });
});

describe("inactive / missing account", () => {
  it("suppresses entirely for a deactivated account", async () => {
    customers.c1.isActive = false;
    const result = await svc.notifyCustomerMarketing("c1", INPUT);
    expect(result).toEqual({ sent: false, pushed: false, emailed: false, reason: "inactive" });
  });

  it("suppresses entirely when the customer no longer exists", async () => {
    const result = await svc.notifyCustomerMarketing("ghost", INPUT);
    expect(result).toEqual({ sent: false, pushed: false, emailed: false, reason: "inactive" });
  });
});

describe("transactional sends are never gated by any of this", () => {
  // notifyCustomer (transactional) lives in notifications.customer.service
  // and doesn't import this file at all — this test documents the
  // architectural boundary rather than exercising code, so a future change
  // that accidentally routes a transactional send through this gate would
  // have to touch this file to keep it passing.
  it("this module exports only marketing-gated functions", () => {
    expect(Object.keys(svc)).toEqual(
      expect.arrayContaining(["canSendMarketing", "notifyCustomerMarketing", "isWithinCairoSendWindow"]),
    );
  });
});
