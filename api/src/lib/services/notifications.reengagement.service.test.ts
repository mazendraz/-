// Every cron-swept nudge in notifications.reengagement.service.ts. The
// marketing gate itself (frequency cap, opt-out, Cairo window, open-lead
// suppression) is tested in notifications.marketing.service.test.ts — this
// file only has to prove each sweep finds the RIGHT rows, sets the RIGHT
// idempotency marker, and calls notifyCustomerMarketing with the right
// content/leadSpecific flag. notifyCustomerMarketing itself is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ── Fake DB ──────────────────────────────────────────────────────────────────
interface CompletionRow {
  id: string;
  verificationStatus: string;
  verifiedAt: Date | null;
  reviewRequestSentAt: Date | null;
  lead: {
    id: string;
    refNumber: string;
    service: string;
    customerId: string | null;
    reviewedAt: Date | null;
    company: { name: string };
  };
}
interface LeadRow {
  id: string;
  companyId: string;
  refNumber: string;
  service: string;
  status: string;
  customerId: string | null;
  createdAt: Date;
  staleNudgeSentAt: Date | null;
  conversation: { id: string } | null;
}
interface CustomerRow {
  id: string;
  name: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  firstServiceNudgeSentAt: Date | null;
  lastViewedCategorySlug: string | null;
  lastViewedCategoryLabel: string | null;
  lastViewedCategoryAt: Date | null;
  leadCount: number; // stand-in for the leads:{none:{}} relation filter
}
interface CompanyRow {
  id: string;
  name: string;
  email: string | null;
  status: string;
  lastMonthlySummaryPeriod: string | null;
}
interface MessageRow {
  conversationId: string;
  sender: string;
  createdAt: Date;
}
interface NotificationRow {
  customerId: string;
  url: string | null;
}

let completions: CompletionRow[] = [];
let leads: LeadRow[] = [];
let customers: CustomerRow[] = [];
let companies: CompanyRow[] = [];
let messages: MessageRow[] = [];
let notifications: NotificationRow[] = [];

const db = {
  leadCompletion: {
    findMany: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { verifiedAt: "asc" } }) => {
      let rows = completions.filter((c) => {
        if (c.verificationStatus === "PENDING") return false;
        if (where.reviewRequestSentAt === null && c.reviewRequestSentAt !== null) return false;
        const lte = (where.verifiedAt as { lte: Date } | undefined)?.lte;
        if (lte && !(c.verifiedAt && c.verifiedAt.getTime() <= lte.getTime())) return false;
        const leadWhere = where.lead as
          | { customerId?: { not: null }; customer?: { firstServiceNudgeSentAt: null } }
          | undefined;
        if (leadWhere?.customerId && c.lead.customerId === null) return false;
        if (leadWhere?.customer) {
          const cust = customers.find((x) => x.id === c.lead.customerId);
          if (cust && cust.firstServiceNudgeSentAt !== null) return false;
        }
        return true;
      });
      if (orderBy?.verifiedAt === "asc") {
        rows = [...rows].sort((a, b) => (a.verifiedAt?.getTime() ?? 0) - (b.verifiedAt?.getTime() ?? 0));
      }
      return rows;
    },
    update: async ({ where, data }: { where: { id: string }; data: { reviewRequestSentAt: Date } }) => {
      const row = completions.find((c) => c.id === where.id)!;
      row.reviewRequestSentAt = data.reviewRequestSentAt;
      return row;
    },
  },
  lead: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      leads.filter((l) => {
        const statusIn = (where.status as { in: string[] } | undefined)?.in;
        if (statusIn && !statusIn.includes(l.status)) return false;
        if (where.staleNudgeSentAt === null && l.staleNudgeSentAt !== null) return false;
        if (where.customerId && l.customerId === null) return false;
        const lte = (where.createdAt as { lte: Date; gte?: Date } | undefined)?.lte;
        if (lte && !(l.createdAt.getTime() <= lte.getTime())) return false;
        if (where.companyId && l.companyId !== where.companyId) return false;
        const range = where.createdAt as { gte?: Date; lt?: Date } | undefined;
        if (range?.gte && l.createdAt.getTime() < range.gte.getTime()) return false;
        if (range?.lt && l.createdAt.getTime() >= range.lt.getTime()) return false;
        return true;
      }),
    update: async ({ where, data }: { where: { id: string }; data: { staleNudgeSentAt: Date } }) => {
      const row = leads.find((l) => l.id === where.id)!;
      row.staleNudgeSentAt = data.staleNudgeSentAt;
      return row;
    },
  },
  customerUser: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      customers.filter((c) => {
        if (where.isActive && !c.isActive) return false;
        if ("lastViewedCategorySlug" in where && c.lastViewedCategorySlug === null) return false;
        const viewLte = (where.lastViewedCategoryAt as { lte: Date } | undefined)?.lte;
        if (viewLte && !(c.lastViewedCategoryAt && c.lastViewedCategoryAt.getTime() <= viewLte.getTime())) return false;
        if ((where.leads as { none: object } | undefined) && c.leadCount > 0) return false;
        const or = where.OR as Array<Record<string, unknown>> | undefined;
        if (or) {
          const matches = or.some((cond) => {
            if ("lastLoginAt" in cond && cond.lastLoginAt !== null) {
              const lte = (cond.lastLoginAt as { lte: Date }).lte;
              return c.lastLoginAt !== null && c.lastLoginAt.getTime() <= lte.getTime();
            }
            if ("lastLoginAt" in cond && cond.lastLoginAt === null) {
              const lte = (cond.createdAt as { lte: Date }).lte;
              return c.lastLoginAt === null && c.createdAt.getTime() <= lte.getTime();
            }
            return false;
          });
          if (!matches) return false;
        }
        const notif = where.notifications as { none: { url: string } } | undefined;
        if (notif) {
          const already = notifications.some((n) => n.customerId === c.id && n.url === notif.none.url);
          if (already) return false;
        }
        return true;
      }),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = customers.find((c) => c.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  },
  company: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      companies.filter((c) => {
        if (where.status && c.status !== where.status) return false;
        const notEq = (where.lastMonthlySummaryPeriod as { not: string } | undefined)?.not;
        if (notEq !== undefined && c.lastMonthlySummaryPeriod === notEq) return false;
        return true;
      }),
    update: async ({ where, data }: { where: { id: string }; data: { lastMonthlySummaryPeriod: string } }) => {
      const row = companies.find((c) => c.id === where.id)!;
      row.lastMonthlySummaryPeriod = data.lastMonthlySummaryPeriod;
      return row;
    },
  },
  message: {
    findMany: async ({ where }: { where: { conversationId: { in: string[] }; sender: string } }) =>
      messages
        .filter((m) => where.conversationId.in.includes(m.conversationId) && m.sender === where.sender)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

interface MarketingResultLike {
  sent: boolean;
  pushed: boolean;
  emailed: boolean;
  reason?: string;
}
const notifyCustomerMarketing = vi.fn(
  async (): Promise<MarketingResultLike> => ({ sent: true, pushed: true, emailed: true }),
);
vi.mock("@/lib/services/notifications.marketing.service", () => ({ notifyCustomerMarketing }));

const sendProviderMonthlySummaryEmail = vi.fn(async () => true);
vi.mock("@/lib/services/notifications.service", () => ({
  buildReviewRequestEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  buildStaleLeadEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  build7DayPostServiceEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  build14DayInactiveBrowsingEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  build3045DayInactivityEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  buildSeasonalCampaignEmailContent: vi.fn(() => ({ subject: "s", text: "t", html: "h" })),
  sendProviderMonthlySummaryEmail,
}));

let activeCampaigns: Array<{ key: string; title: string; body: string; ctaUrl: string; ctaLabel: string }> = [];
vi.mock("@/lib/config/seasonalCampaigns.config", () => ({
  activeSeasonalCampaigns: () => activeCampaigns,
}));

const svc = await import("@/lib/services/notifications.reengagement.service");

function completion(overrides: Partial<CompletionRow> & { verifiedAt: Date | null }): CompletionRow {
  return {
    id: "comp-1",
    verificationStatus: "CONFIRMED",
    reviewRequestSentAt: null,
    lead: {
      id: "lead-1",
      refNumber: "AA-1",
      service: "تكييفات",
      customerId: "c1",
      reviewedAt: null,
      company: { name: "شركة النور" },
    },
    ...overrides,
  };
}
function lead(overrides: Partial<LeadRow>): LeadRow {
  return {
    id: "lead-1",
    companyId: "co1",
    refNumber: "AA-1",
    service: "تكييفات",
    status: "NEW",
    customerId: "c1",
    createdAt: new Date(),
    staleNudgeSentAt: null,
    conversation: null,
    ...overrides,
  };
}
function customer(overrides: Partial<CustomerRow>): CustomerRow {
  return {
    id: "c1",
    name: "مازن",
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    firstServiceNudgeSentAt: null,
    lastViewedCategorySlug: null,
    lastViewedCategoryLabel: null,
    lastViewedCategoryAt: null,
    leadCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  completions = [];
  leads = [];
  customers = [];
  companies = [];
  messages = [];
  notifications = [];
  activeCampaigns = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sweepReviewRequests", () => {
  it("notifies and marks a row verified more than 24h ago", async () => {
    completions = [completion({ verifiedAt: new Date(Date.now() - 25 * HOUR_MS) })];
    const res = await svc.sweepReviewRequests();
    expect(res).toEqual({ sent: 1, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).toHaveBeenCalledTimes(1);
    expect(notifyCustomerMarketing).toHaveBeenCalledWith("c1", expect.objectContaining({ url: "/requests" }));
    expect(completions[0].reviewRequestSentAt).not.toBeNull();
  });

  it("does not sweep a row still under 24h old", async () => {
    completions = [completion({ verifiedAt: new Date(Date.now() - 1 * HOUR_MS) })];
    const res = await svc.sweepReviewRequests();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("counts a gate-suppressed send separately from too-late", async () => {
    notifyCustomerMarketing.mockResolvedValueOnce({ sent: false, pushed: false, emailed: false, reason: "frequency-cap" });
    completions = [completion({ verifiedAt: new Date(Date.now() - 25 * HOUR_MS) })];
    const res = await svc.sweepReviewRequests();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 1 });
  });

  it("marks a guest lead (no customerId) done without notifying", async () => {
    completions = [
      completion({
        verifiedAt: new Date(Date.now() - 25 * HOUR_MS),
        lead: { ...completion({ verifiedAt: null }).lead, customerId: null },
      }),
    ];
    await svc.sweepReviewRequests();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
    expect(completions[0].reviewRequestSentAt).not.toBeNull();
  });

  it("marks an already-reviewed lead done without notifying", async () => {
    completions = [
      completion({
        verifiedAt: new Date(Date.now() - 25 * HOUR_MS),
        lead: { ...completion({ verifiedAt: null }).lead, reviewedAt: new Date() },
      }),
    ];
    await svc.sweepReviewRequests();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("marks a very old row done without notifying (past the grace window)", async () => {
    completions = [completion({ verifiedAt: new Date(Date.now() - 200 * HOUR_MS) })];
    const res = await svc.sweepReviewRequests();
    expect(res).toEqual({ sent: 0, skippedTooLate: 1, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("never re-sweeps a row that already has reviewRequestSentAt set", async () => {
    completions = [
      completion({ verifiedAt: new Date(Date.now() - 25 * HOUR_MS), reviewRequestSentAt: new Date() }),
    ];
    await svc.sweepReviewRequests();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });
});

describe("sweepStaleLeads", () => {
  it("notifies and marks a NEW lead older than 48h, lead-specific", async () => {
    leads = [lead({ createdAt: new Date(Date.now() - 49 * HOUR_MS) })];
    const res = await svc.sweepStaleLeads();
    expect(res).toEqual({ sent: 1, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ leadSpecific: true, url: "/chat/lead-1" }),
    );
    expect(leads[0].staleNudgeSentAt).not.toBeNull();
  });

  it("sweeps CONTACTED the same as NEW", async () => {
    leads = [lead({ status: "CONTACTED", createdAt: new Date(Date.now() - 49 * HOUR_MS) })];
    await svc.sweepStaleLeads();
    expect(notifyCustomerMarketing).toHaveBeenCalledTimes(1);
  });

  it("does not sweep a lead under 48h old", async () => {
    leads = [lead({ createdAt: new Date(Date.now() - 2 * HOUR_MS) })];
    const res = await svc.sweepStaleLeads();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("never sweeps a COMPLETED lead", async () => {
    leads = [lead({ status: "COMPLETED", createdAt: new Date(Date.now() - 49 * HOUR_MS) })];
    await svc.sweepStaleLeads();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("filters out a guest lead (no customerId) at the query layer", async () => {
    leads = [lead({ createdAt: new Date(Date.now() - 49 * HOUR_MS), customerId: null })];
    const res = await svc.sweepStaleLeads();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("marks a very old lead done without notifying (past the grace window)", async () => {
    leads = [lead({ createdAt: new Date(Date.now() - 400 * HOUR_MS) })];
    const res = await svc.sweepStaleLeads();
    expect(res).toEqual({ sent: 0, skippedTooLate: 1, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
    expect(leads[0].staleNudgeSentAt).not.toBeNull();
  });
});

describe("sweepFirstServiceNudges", () => {
  it("notifies once, 7+ days after the customer's first verified completion", async () => {
    customers = [customer({ id: "c1" })];
    completions = [completion({ verifiedAt: new Date(Date.now() - 8 * DAY_MS) })];
    const res = await svc.sweepFirstServiceNudges();
    expect(res).toEqual({ sent: 1, skippedTooLate: 0, suppressed: 0 });
    expect(customers[0].firstServiceNudgeSentAt).not.toBeNull();
  });

  it("skips a customer whose marker is already set", async () => {
    customers = [customer({ id: "c1", firstServiceNudgeSentAt: new Date() })];
    completions = [completion({ verifiedAt: new Date(Date.now() - 8 * DAY_MS) })];
    await svc.sweepFirstServiceNudges();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("only counts the earliest completion once when a customer has several in-batch", async () => {
    // Both still within the grace window (7d delay + 3d grace = 10d) — this
    // isolates the DEDUP behavior from the separate "too old to still be
    // relevant" behavior covered by the grace-window test below.
    customers = [customer({ id: "c1" })];
    completions = [
      completion({ id: "comp-1", verifiedAt: new Date(Date.now() - 9 * DAY_MS) }),
      completion({ id: "comp-2", verifiedAt: new Date(Date.now() - 8 * DAY_MS) }),
    ];
    await svc.sweepFirstServiceNudges();
    expect(notifyCustomerMarketing).toHaveBeenCalledTimes(1);
  });

  it("marks the customer done without notifying when their earliest qualifying completion is past the grace window, even if a later one would still be in range", async () => {
    // The nudge is specifically about the customer's FIRST service — if
    // that one is already stale, falling through to a later order would be
    // factually wrong copy ("your first service" about an order that
    // wasn't first). Marked done either way so it's never rescanned.
    customers = [customer({ id: "c1" })];
    completions = [
      completion({ id: "comp-1", verifiedAt: new Date(Date.now() - 20 * DAY_MS) }),
      completion({ id: "comp-2", verifiedAt: new Date(Date.now() - 8 * DAY_MS) }),
    ];
    const res = await svc.sweepFirstServiceNudges();
    expect(res).toEqual({ sent: 0, skippedTooLate: 1, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
    expect(customers[0].firstServiceNudgeSentAt).not.toBeNull();
  });

  it("does not sweep under 7 days", async () => {
    customers = [customer({ id: "c1" })];
    completions = [completion({ verifiedAt: new Date(Date.now() - 1 * DAY_MS) })];
    const res = await svc.sweepFirstServiceNudges();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 0 });
  });
});

describe("sweepInactiveBrowsing", () => {
  it("notifies a customer who viewed a category 14+ days ago and never ordered", async () => {
    customers = [
      customer({
        id: "c1",
        lastViewedCategorySlug: "landscape",
        lastViewedCategoryLabel: "تنسيق حدائق",
        lastViewedCategoryAt: new Date(Date.now() - 15 * DAY_MS),
        leadCount: 0,
      }),
    ];
    const res = await svc.sweepInactiveBrowsing();
    expect(res).toEqual({ sent: 1, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).toHaveBeenCalledWith("c1", expect.objectContaining({ url: "/services/landscape" }));
  });

  it("skips a customer who has ever submitted a lead", async () => {
    customers = [
      customer({
        id: "c1",
        lastViewedCategorySlug: "landscape",
        lastViewedCategoryAt: new Date(Date.now() - 15 * DAY_MS),
        leadCount: 1,
      }),
    ];
    await svc.sweepInactiveBrowsing();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("skips a customer who viewed a category recently", async () => {
    customers = [
      customer({ id: "c1", lastViewedCategorySlug: "landscape", lastViewedCategoryAt: new Date() }),
    ];
    await svc.sweepInactiveBrowsing();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });
});

describe("sweepInactiveCustomers", () => {
  it("notifies a customer inactive 30+ days", async () => {
    customers = [customer({ id: "c1", lastLoginAt: new Date(Date.now() - 31 * DAY_MS) })];
    const res = await svc.sweepInactiveCustomers();
    expect(res).toEqual({ sent: 1, skippedTooLate: 0, suppressed: 0 });
  });

  it("skips a recently-active customer", async () => {
    customers = [customer({ id: "c1", lastLoginAt: new Date() })];
    await svc.sweepInactiveCustomers();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });
});

describe("sweepSeasonalCampaigns", () => {
  it("notifies every eligible customer for each active campaign", async () => {
    activeCampaigns = [
      { key: "summer-ac-2026", title: "t", body: "b", ctaUrl: "/services?campaign=summer-ac-2026", ctaLabel: "go" },
    ];
    customers = [customer({ id: "c1" }), customer({ id: "c2" })];
    const res = await svc.sweepSeasonalCampaigns();
    expect(res).toEqual({ sent: 2, skippedTooLate: 0, suppressed: 0 });
  });

  it("skips a customer who already received this exact campaign", async () => {
    activeCampaigns = [
      { key: "summer-ac-2026", title: "t", body: "b", ctaUrl: "/services?campaign=summer-ac-2026", ctaLabel: "go" },
    ];
    customers = [customer({ id: "c1" })];
    notifications = [{ customerId: "c1", url: "/services?campaign=summer-ac-2026" }];
    await svc.sweepSeasonalCampaigns();
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });

  it("is a no-op with no active campaigns", async () => {
    activeCampaigns = [];
    customers = [customer({ id: "c1" })];
    const res = await svc.sweepSeasonalCampaigns();
    expect(res).toEqual({ sent: 0, skippedTooLate: 0, suppressed: 0 });
    expect(notifyCustomerMarketing).not.toHaveBeenCalled();
  });
});

describe("sweepProviderMonthlySummaries", () => {
  const now = new Date("2026-09-03T10:00:00Z");

  it("computes stats and sends for a company with activity last month", async () => {
    companies = [{ id: "co1", name: "النور", email: "owner@nour.test", status: "ACTIVE", lastMonthlySummaryPeriod: null }];
    leads = [
      lead({ id: "l1", companyId: "co1", status: "COMPLETED", createdAt: new Date("2026-08-05T10:00:00Z"), conversation: { id: "conv1" } }),
      lead({ id: "l2", companyId: "co1", status: "NEW", createdAt: new Date("2026-08-10T10:00:00Z"), conversation: { id: "conv2" } }),
    ];
    messages = [
      { conversationId: "conv1", sender: "PROVIDER", createdAt: new Date("2026-08-05T11:00:00Z") }, // 60 min
      { conversationId: "conv2", sender: "PROVIDER", createdAt: new Date("2026-08-10T10:30:00Z") }, // 30 min
    ];
    const res = await svc.sweepProviderMonthlySummaries(now);
    expect(res).toEqual({ sent: 1, skipped: 0 });
    expect(sendProviderMonthlySummaryEmail).toHaveBeenCalledWith(
      "owner@nour.test",
      "النور",
      expect.objectContaining({ requestsReceived: 2, requestsCompleted: 1, avgResponseMinutes: 45 }),
    );
    expect(companies[0].lastMonthlySummaryPeriod).toBe("2026-08");
  });

  it("marks the period but skips the email for zero activity", async () => {
    companies = [{ id: "co1", name: "النور", email: "owner@nour.test", status: "ACTIVE", lastMonthlySummaryPeriod: null }];
    const res = await svc.sweepProviderMonthlySummaries(now);
    expect(res).toEqual({ sent: 0, skipped: 1 });
    expect(sendProviderMonthlySummaryEmail).not.toHaveBeenCalled();
    expect(companies[0].lastMonthlySummaryPeriod).toBe("2026-08");
  });

  it("never resends the same period twice", async () => {
    companies = [{ id: "co1", name: "النور", email: "owner@nour.test", status: "ACTIVE", lastMonthlySummaryPeriod: "2026-08" }];
    const res = await svc.sweepProviderMonthlySummaries(now);
    expect(res).toEqual({ sent: 0, skipped: 0 });
    expect(sendProviderMonthlySummaryEmail).not.toHaveBeenCalled();
  });

  it("skips an inactive company", async () => {
    companies = [{ id: "co1", name: "النور", email: "owner@nour.test", status: "SUSPENDED", lastMonthlySummaryPeriod: null }];
    const res = await svc.sweepProviderMonthlySummaries(now);
    expect(res).toEqual({ sent: 0, skipped: 0 });
  });
});
