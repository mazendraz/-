// Integration coverage for review()'s notification fan-out — the piece that
// had zero test coverage before this file. What has to hold across all four
// branches (reject / publish / delete / update): the provider who filed the
// request gets EXACTLY ONE email, reflecting the real decision, and a
// second review attempt on the same (already-resolved) request never fires
// a second one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";

interface ChangeRequestRow {
  id: string;
  companyId: string;
  entity: string;
  entityId: string;
  operation: string;
  submittedById: string;
  changes: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  note: string | null;
  status: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface CompanyRow {
  id: string;
  name: string;
  tagline: string;
}
interface UserRow {
  id: string;
  email: string;
}

let requests: ChangeRequestRow[] = [];
let companies: CompanyRow[] = [];
let users: UserRow[] = [];

function withCompany(r: ChangeRequestRow) {
  const company = companies.find((c) => c.id === r.companyId);
  return { ...r, company: company ? { name: company.name } : null };
}

const db = {
  changeRequest: {
    findUnique: async ({ where }: { where: { id: string } }) => requests.find((r) => r.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ChangeRequestRow>;
    }) => {
      const row = requests.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return withCompany(row);
    },
  },
  company: {
    findUnique: async ({ where }: { where: { id: string } }) => companies.find((c) => c.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<CompanyRow> }) => {
      const c = companies.find((x) => x.id === where.id)!;
      Object.assign(c, data);
      return c;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      companies = companies.filter((c) => c.id !== where.id);
      return {};
    },
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `typeof db` inside db's own initializer is circular for TS
  $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/audit.service", () => ({ record: vi.fn(async () => {}) }));
vi.mock("@/lib/utils/afterResponse", () => ({ runAfterResponse: (fn: () => unknown) => fn() }));
vi.mock("@/lib/services/notifications.service", () => ({
  notifyProviderChangeRequestReviewed: vi.fn(async () => true),
}));

const svc = await import("@/lib/services/changeRequests.service");
const { notifyProviderChangeRequestReviewed } = await import("@/lib/services/notifications.service");

const ACTOR: AuthUser = { id: "admin-1", email: "admin@alassema.com", role: "ADMIN" } as AuthUser;

function request(overrides: Partial<ChangeRequestRow> = {}): ChangeRequestRow {
  return {
    id: "cr-1",
    companyId: "co1",
    entity: "COMPANY",
    entityId: "co1",
    operation: "UPDATE",
    submittedById: "provider-1",
    changes: { tagline: "New tagline" },
    snapshot: { tagline: "Old tagline" },
    note: null,
    status: "PENDING",
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  requests = [request()];
  companies = [{ id: "co1", name: "شركة النور", tagline: "Old tagline" }];
  users = [{ id: "provider-1", email: "provider@nour.test" }];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("review — reject", () => {
  it("notifies the submitting provider exactly once, with the rejection reason", async () => {
    const result = await svc.review(ACTOR, "cr-1", { action: "reject", reviewNote: "Not on-brand" });
    await flush();
    expect(result.request.status).toBe("REJECTED");
    expect(notifyProviderChangeRequestReviewed).toHaveBeenCalledTimes(1);
    expect(notifyProviderChangeRequestReviewed).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "provider@nour.test",
        companyName: "شركة النور",
        action: "reject",
        reviewNote: "Not on-brand",
      }),
    );
  });

  it("refuses a second review and does not re-notify", async () => {
    await svc.review(ACTOR, "cr-1", { action: "reject", reviewNote: "first" });
    await flush();
    vi.clearAllMocks();

    await expect(svc.review(ACTOR, "cr-1", { action: "reject", reviewNote: "second" })).rejects.toThrow(
      /already been reviewed/,
    );
    await flush();
    expect(notifyProviderChangeRequestReviewed).not.toHaveBeenCalled();
  });
});

describe("review — approve (UPDATE)", () => {
  it("applies the change, notifies the provider exactly once with action=approve", async () => {
    const result = await svc.review(ACTOR, "cr-1", { action: "approve" });
    await flush();
    expect(result.request.status).toBe("APPROVED");
    expect(companies[0].tagline).toBe("New tagline");
    expect(notifyProviderChangeRequestReviewed).toHaveBeenCalledTimes(1);
    expect(notifyProviderChangeRequestReviewed).toHaveBeenCalledWith(
      expect.objectContaining({ to: "provider@nour.test", action: "approve" }),
    );
  });

  it("still notifies (to: null → the send fails open, not the review) when the submitter has no email on file", async () => {
    users = [];
    await svc.review(ACTOR, "cr-1", { action: "approve" });
    await flush();
    expect(notifyProviderChangeRequestReviewed).toHaveBeenCalledWith(expect.objectContaining({ to: null }));
  });

});
