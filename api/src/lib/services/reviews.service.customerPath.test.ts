// submitFromLeadId — the account-owned review path added for mobile/client.
//
// The property that matters: a signed-in customer can only review a lead
// Lead.customerId actually points at them. Everything else (completed-only,
// one-time claim) is shared with the pre-account path via claimAndCreate and
// already exercised there; this file is about the NEW boundary specifically.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface LeadRow {
  id: string;
  companyId: string;
  customerId: string | null;
  customerName: string;
  district: string;
  status: string;
  reviewedAt: Date | null;
}

let leads: LeadRow[] = [];
let reviews: { id: string; leadId: string; rating: number; text: string }[] = [];

const tx = {
  lead: {
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; reviewedAt: null };
      data: { reviewedAt: Date };
    }) => {
      const row = leads.find((l) => l.id === where.id && l.reviewedAt === null);
      if (!row) return { count: 0 };
      row.reviewedAt = data.reviewedAt;
      return { count: 1 };
    },
  },
  review: {
    create: async ({
      data,
    }: {
      data: { leadId: string; companyId: string; rating: number; text: string };
    }) => {
      const row = { id: `r${reviews.length + 1}`, leadId: data.leadId, rating: data.rating, text: data.text };
      reviews.push(row);
      return row;
    },
    // Used by recompute() inside the same transaction — this test isn't
    // exercising the rating-aggregate math, just that the write completes.
    aggregate: async () => ({ _avg: { rating: 5 }, _count: reviews.length }),
  },
  company: {
    findUnique: async () => ({ ratingOverridden: false }),
    update: async () => ({}),
  },
};

const db = {
  lead: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      leads.find((l) => l.id === where.id) ?? null,
  },
  $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/services/notifications.service", () => ({
  notifyAdminsReviewSubmitted: async () => false,
}));
vi.mock("@/lib/services/push.service", () => ({ notifyAdmins: async () => 0 }));
vi.mock("@/lib/utils/afterResponse", () => ({ runAfterResponse: (fn: () => unknown) => fn() }));

const { submitFromLeadId } = await import("@/lib/services/reviews.service");

const OWNER = "customer-owner";
const STRANGER = "customer-stranger";

beforeEach(() => {
  leads = [
    {
      id: "l1",
      companyId: "co1",
      customerId: OWNER,
      customerName: "عميل",
      district: "R7",
      status: "COMPLETED",
      reviewedAt: null,
    },
  ];
  reviews = [];
});

describe("ownership", () => {
  it("lets the owning customer review their own completed lead", async () => {
    const review = await submitFromLeadId("l1", OWNER, 5, "ممتازين");
    expect(review).toMatchObject({ rating: 5, text: "ممتازين" });
    expect(reviews).toHaveLength(1);
  });

  it("REFUSES a different customer, even with a valid lead id", async () => {
    await expect(submitFromLeadId("l1", STRANGER, 5, "")).rejects.toThrow(/not found/i);
    expect(reviews).toHaveLength(0);
  });

  it("gives an unknown lead id and someone-else's lead the SAME error", async () => {
    // Neither response should let a caller learn which lead ids exist.
    const unknown = await submitFromLeadId("no-such-lead", OWNER, 5, "").catch(
      (e: Error) => e.message,
    );
    const stranger = await submitFromLeadId("l1", STRANGER, 5, "").catch(
      (e: Error) => e.message,
    );
    expect(unknown).toBe(stranger);
  });

  it("refuses a lead with no account attached at all (customerId null)", async () => {
    // A pre-account lead has no owner to match against — must not be
    // reachable through the account-based path just because SOME id was
    // guessed correctly.
    leads[0]!.customerId = null;
    await expect(submitFromLeadId("l1", OWNER, 5, "")).rejects.toThrow(/not found/i);
  });
});

describe("state rules shared with the pre-account path", () => {
  it("refuses a lead that isn't completed", async () => {
    leads[0]!.status = "IN_PROGRESS";
    await expect(submitFromLeadId("l1", OWNER, 5, "")).rejects.toThrow(/only completed/i);
  });

  it("refuses a second review for the same lead", async () => {
    await submitFromLeadId("l1", OWNER, 5, "");
    await expect(submitFromLeadId("l1", OWNER, 4, "تاني")).rejects.toThrow(/already been reviewed/i);
    expect(reviews).toHaveLength(1);
  });
});
