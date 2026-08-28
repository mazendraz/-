// Integration coverage for the two entry points in leadCompletion.service.ts
// (submitCompletion, verify/verifyOwned) — specifically the notification
// fan-out, which had no test coverage before this file: "the provider
// always gets notified, a CONFIRMED decision also emails the customer a
// summary, a DISCREPANCY decision also reaches admins (email+push+
// Telegram) — and none of that ever fires twice for the same verification."
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface LeadRow {
  id: string;
  refNumber: string;
  companyId: string;
  customerId: string | null;
  customerName: string;
  service: string;
  status: string;
  trackingToken: string | null;
  phone: string;
  district: string;
  budget: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  estimatedMin: number | null;
  estimatedMax: number | null;
  discountPercent: number;
  hasOnInspection: boolean;
}
interface CompletionRow {
  id: string;
  leadId: string;
  providerAmount: number;
  additionalWorkDescription: string | null;
  additionalWorkAmount: number | null;
  notes: string | null;
  attachments: string[];
  submittedAt: Date;
  verificationStatus: string;
  clientAmount: number | null;
  discrepancyNote: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reviewRequestSentAt: Date | null;
}

const COMPANY = { id: "co1", name: "شركة النور", email: "owner@nour.test", whatsapp: null, slug: "al-nour" };

let leads: LeadRow[] = [];
let completions: CompletionRow[] = [];
let customers: Record<string, { email: string }> = {};
let admins: { email: string }[] = [];

function leadInclude(l: LeadRow) {
  return {
    ...l,
    company: { slug: COMPANY.slug, name: COMPANY.name },
    items: [],
    completion: completions.find((c) => c.leadId === l.id) ?? null,
  };
}

const db = {
  leadCompletion: {
    findUnique: async ({ where }: { where: { leadId: string } }) =>
      completions.find((c) => c.leadId === where.leadId) ?? null,
    create: async ({ data }: { data: Partial<CompletionRow> & { leadId: string } }) => {
      const row: CompletionRow = {
        id: `comp-${completions.length + 1}`,
        verificationStatus: "PENDING",
        clientAmount: null,
        discrepancyNote: null,
        verifiedAt: null,
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewRequestSentAt: null,
        additionalWorkDescription: null,
        additionalWorkAmount: null,
        notes: null,
        attachments: [],
        providerAmount: 0,
        ...data,
      } as CompletionRow;
      completions.push(row);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { leadId: string; verificationStatus: string };
      data: Partial<CompletionRow>;
    }) => {
      const row = completions.find(
        (c) => c.leadId === where.leadId && c.verificationStatus === where.verificationStatus,
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  lead: {
    findUnique: async ({ where }: { where: { id?: string; refNumber?: string } }) => {
      const l = leads.find((x) => (where.id ? x.id === where.id : x.refNumber === where.refNumber));
      return l ? leadInclude(l) : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const l = leads.find((x) => x.id === where.id);
      if (!l) throw new Error("not found");
      return leadInclude(l);
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<LeadRow> }) => {
      const l = leads.find((x) => x.id === where.id)!;
      Object.assign(l, data);
      return leadInclude(l);
    },
    // submitCompletion CLAIMS the move to COMPLETED with a conditional
    // updateMany, so the double has to honour the predicate: a lead outside
    // COMPLETABLE_FROM must match zero rows. Ignoring `where.status` here would
    // let a completion of a cancelled lead pass this file silently — the exact
    // defect the claim was added to close.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: { in: string[] } };
      data: Partial<LeadRow>;
    }) => {
      const matched = leads.filter(
        (x) => x.id === where.id && (where.status === undefined || where.status.in.includes(x.status)),
      );
      for (const l of matched) Object.assign(l, data);
      return { count: matched.length };
    },
  },
  customerUser: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      customers[where.id] ? { email: customers[where.id].email } : null,
  },
  user: {
    findMany: async () => admins,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `typeof db` inside db's own initializer is circular for TS
  $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/finance.service", () => ({ recognizeCommission: vi.fn(async () => {}) }));
vi.mock("@/lib/utils/afterResponse", () => ({ runAfterResponse: (fn: () => unknown) => fn() }));
vi.mock("@/lib/services/realtime.service", () => ({
  publishAll: vi.fn(),
  channelForCustomer: (id: string) => `customer:${id}`,
}));
vi.mock("@/lib/services/notifications.customer.service", () => ({ notifyCustomer: vi.fn(async () => {}) }));
vi.mock("@/lib/services/push.service", () => ({
  notifyCompanyProviders: vi.fn(async () => 1),
  notifyAdmins: vi.fn(async () => 1),
}));
vi.mock("@/lib/services/telegram.service", () => ({
  notifyProviderChatTelegram: vi.fn(async () => true),
  notifyAdminChatTelegram: vi.fn(async () => true),
}));
vi.mock("@/lib/services/notifications.service", () => ({
  notifyProviderAmountConfirmed: vi.fn(async () => true),
  notifyProviderAmountDiscrepancy: vi.fn(async () => true),
  notifyAdminsAmountDiscrepancy: vi.fn(async () => true),
  notifyCustomerServiceSummary: vi.fn(async () => true),
}));

const svc = await import("@/lib/services/leadCompletion.service");
const { notifyCustomer } = await import("@/lib/services/notifications.customer.service");
const {
  notifyProviderAmountConfirmed,
  notifyProviderAmountDiscrepancy,
  notifyAdminsAmountDiscrepancy,
  notifyCustomerServiceSummary,
} = await import("@/lib/services/notifications.service");
const { notifyCompanyProviders, notifyAdmins: pushAdmins } = await import("@/lib/services/push.service");
const { notifyProviderChatTelegram, notifyAdminChatTelegram } = await import("@/lib/services/telegram.service");

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-1",
    refNumber: "AA-1",
    companyId: COMPANY.id,
    customerId: "c1",
    customerName: "منى",
    service: "تكييفات",
    status: "COMPLETED",
    trackingToken: "secret-token",
    phone: "01000000000",
    district: "R7",
    budget: "",
    description: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewedAt: null,
    estimatedMin: null,
    estimatedMax: null,
    discountPercent: 0,
    hasOnInspection: false,
    ...overrides,
  };
}

// A tick to let the (mocked, synchronously-run) runAfterResponse closure's
// own internal awaits (customer/admin lookups) resolve before assertions —
// see leadCompletion.service.ts's applyVerification for why those aren't
// synchronous with the outer call the way the always-fired notifies are.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  leads = [];
  completions = [];
  customers = { c1: { email: "mona@test.com" } };
  admins = [{ email: "admin@alassema.com" }];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("submitCompletion", () => {
  it("creates the completion, flips status to COMPLETED, and notifies the customer (LEAD_COMPLETED)", async () => {
    leads = [lead({ status: "NEW" })];
    await svc.submitCompletion("lead-1", { providerAmount: 45000, additionalWork: null });
    expect(completions).toHaveLength(1);
    expect(leads[0].status).toBe("COMPLETED");
    expect(notifyCustomer).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ type: "LEAD_COMPLETED" }),
    );
  });

  it("skips the customer notification for a guest lead (no customerId)", async () => {
    leads = [lead({ status: "NEW", customerId: null })];
    await svc.submitCompletion("lead-1", { providerAmount: 45000, additionalWork: null });
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("refuses a second completion for the same lead", async () => {
    leads = [lead({ status: "NEW" })];
    await svc.submitCompletion("lead-1", { providerAmount: 45000, additionalWork: null });
    await expect(
      svc.submitCompletion("lead-1", { providerAmount: 99999, additionalWork: null }),
    ).rejects.toThrow(/already been marked/);
    expect(completions).toHaveLength(1); // no second row created
  });
});

describe("verify — confirmed", () => {
  beforeEach(() => {
    leads = [lead()];
    completions = [
      {
        id: "comp-1",
        leadId: "lead-1",
        providerAmount: 45000,
        additionalWorkDescription: null,
        additionalWorkAmount: null,
        notes: null,
        attachments: [],
        submittedAt: new Date(),
        verificationStatus: "PENDING",
        clientAmount: null,
        discrepancyNote: null,
        verifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewRequestSentAt: null,
      },
    ];
  });

  it("claims PENDING → CONFIRMED exactly once and notifies the provider + customer summary", async () => {
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "confirmed" });
    await flush();

    expect(completions[0].verificationStatus).toBe("CONFIRMED");
    expect(completions[0].clientAmount).toBe(45000);

    expect(notifyProviderAmountConfirmed).toHaveBeenCalledTimes(1);
    expect(notifyCompanyProviders).toHaveBeenCalledTimes(1);
    expect(notifyProviderChatTelegram).toHaveBeenCalledTimes(1);
    expect(notifyCustomerServiceSummary).toHaveBeenCalledTimes(1);
    expect(notifyCustomerServiceSummary).toHaveBeenCalledWith(
      expect.anything(),
      "mona@test.com",
      "منى",
      "شركة النور",
    );

    // A confirmed amount closes the order quietly — admins are NOT paged.
    expect(notifyAdminsAmountDiscrepancy).not.toHaveBeenCalled();
    expect(pushAdmins).not.toHaveBeenCalled();
    expect(notifyAdminChatTelegram).not.toHaveBeenCalled();
    expect(notifyProviderAmountDiscrepancy).not.toHaveBeenCalled();
  });

  it("skips the customer summary for a guest lead (no customerId)", async () => {
    leads[0].customerId = null;
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "confirmed" });
    await flush();
    expect(notifyCustomerServiceSummary).not.toHaveBeenCalled();
  });

  it("refuses a second verify on the same lead — and does not re-notify", async () => {
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "confirmed" });
    await flush();
    vi.clearAllMocks();

    await expect(
      svc.verify({ ref: "AA-1", token: "secret-token", decision: "confirmed" }),
    ).rejects.toThrow(/already been verified/);
    await flush();
    expect(notifyProviderAmountConfirmed).not.toHaveBeenCalled();
    expect(notifyCustomerServiceSummary).not.toHaveBeenCalled();
  });

  it("404s (not a validation error) for a wrong tracking token — same as an unknown ref", async () => {
    const unknown = await svc
      .verify({ ref: "NO-SUCH-REF", token: "x", decision: "confirmed" })
      .catch((e: Error) => e.message);
    const wrongToken = await svc
      .verify({ ref: "AA-1", token: "wrong-token", decision: "confirmed" })
      .catch((e: Error) => e.message);
    expect(unknown).toBe(wrongToken);
    expect(notifyProviderAmountConfirmed).not.toHaveBeenCalled();
  });
});

describe("verify — discrepancy", () => {
  beforeEach(() => {
    leads = [lead()];
    completions = [
      {
        id: "comp-1",
        leadId: "lead-1",
        providerAmount: 45000,
        additionalWorkDescription: null,
        additionalWorkAmount: null,
        notes: null,
        attachments: [],
        submittedAt: new Date(),
        verificationStatus: "PENDING",
        clientAmount: null,
        discrepancyNote: null,
        verifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewRequestSentAt: null,
      },
    ];
  });

  it("notifies the provider AND admins (email + push + Telegram), never the customer summary", async () => {
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "discrepancy", clientAmount: 40000, note: "أقل من المتفق" });
    await flush();

    expect(completions[0].verificationStatus).toBe("DISCREPANCY");
    expect(completions[0].clientAmount).toBe(40000);

    expect(notifyProviderAmountDiscrepancy).toHaveBeenCalledTimes(1);
    expect(notifyAdminsAmountDiscrepancy).toHaveBeenCalledTimes(1);
    expect(notifyAdminsAmountDiscrepancy).toHaveBeenCalledWith(
      expect.anything(),
      "شركة النور",
      ["admin@alassema.com"],
    );
    expect(pushAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdminChatTelegram).toHaveBeenCalledTimes(1);

    expect(notifyProviderAmountConfirmed).not.toHaveBeenCalled();
    expect(notifyCustomerServiceSummary).not.toHaveBeenCalled();
  });

  // `clientAmount` is the one money value in this flow a CUSTOMER chooses, and
  // recognizeCommission derives Al Asima's revenue from it. Before the bound,
  // any non-negative integer was accepted: a 45,000 EGP job could be disputed
  // as 2,000,000,000, writing a ~200,000,000 EGP commission row into the
  // ledger — or, above int4, failing the write as an unhandled 500.
  it("refuses a disputed amount implausible for the job, and books no commission", async () => {
    const { recognizeCommission } = await import("@/lib/services/finance.service");

    await expect(
      svc.verify({
        ref: "AA-1",
        token: "secret-token",
        decision: "discrepancy",
        clientAmount: 50_000_000, // job was 45,000
        note: "",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(completions[0].verificationStatus).toBe("PENDING");
    expect(completions[0].clientAmount).toBeNull();
    expect(recognizeCommission).not.toHaveBeenCalled();
    expect(notifyAdminsAmountDiscrepancy).not.toHaveBeenCalled();
  });

  it("still accepts an ordinary disagreement in either direction", async () => {
    // Both well inside the floor — a real dispute is relative and small.
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "discrepancy", clientAmount: 62_000, note: "" });
    expect(completions[0].clientAmount).toBe(62_000);
  });

  it("accepts any modest amount when the provider reported nothing", async () => {
    // finalTotal 0 makes a pure multiple meaningless — and a provider reporting
    // 0 against a customer who says they paid is exactly the case this feature
    // exists to capture, so the floor has to let it through.
    completions[0].providerAmount = 0;
    await svc.verify({ ref: "AA-1", token: "secret-token", decision: "discrepancy", clientAmount: 8_000, note: "" });
    expect(completions[0].clientAmount).toBe(8_000);
  });

  it("never sends the admin alert twice, even if two requests race for the same lead", async () => {
    const [a, b] = await Promise.allSettled([
      svc.verify({ ref: "AA-1", token: "secret-token", decision: "discrepancy", clientAmount: 40000, note: "" }),
      svc.verify({ ref: "AA-1", token: "secret-token", decision: "discrepancy", clientAmount: 38000, note: "" }),
    ]);
    await flush();
    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(["fulfilled", "rejected"]);
    expect(notifyAdminsAmountDiscrepancy).toHaveBeenCalledTimes(1);
  });
});

describe("verifyOwned", () => {
  beforeEach(() => {
    leads = [lead()];
    completions = [
      {
        id: "comp-1",
        leadId: "lead-1",
        providerAmount: 45000,
        additionalWorkDescription: null,
        additionalWorkAmount: null,
        notes: null,
        attachments: [],
        submittedAt: new Date(),
        verificationStatus: "PENDING",
        clientAmount: null,
        discrepancyNote: null,
        verifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewRequestSentAt: null,
      },
    ];
  });

  it("verifies for the owning customer", async () => {
    await svc.verifyOwned("lead-1", "c1", { decision: "confirmed" });
    expect(completions[0].verificationStatus).toBe("CONFIRMED");
  });

  it("404s for a different customer — same as a missing lead", async () => {
    const stranger = await svc.verifyOwned("lead-1", "someone-else", { decision: "confirmed" }).catch((e: Error) => e.message);
    const missing = await svc.verifyOwned("no-such-lead", "c1", { decision: "confirmed" }).catch((e: Error) => e.message);
    expect(stranger).toBe(missing);
  });
});
