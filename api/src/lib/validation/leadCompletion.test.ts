import { describe, expect, it } from "vitest";
import {
  completeLeadSchema,
  verifyLeadSchema,
  verifyOwnedLeadSchema,
} from "@/lib/validation/leadCompletion";
import { MAX_MONEY_EGP } from "@/lib/validation/shared";

// Every money field here was `z.number().int().min(0)` with no upper bound, so
// anything up to Number.MAX_SAFE_INTEGER parsed. Two consequences, both real:
// the value reaches Transaction.amount (an int4) via recognizeCommission, and
// on the customer-facing dispute path it is the CLIENT choosing the number.
describe("money fields are bounded", () => {
  const verify = { ref: "AA-20260826-7F3K", token: "t".repeat(24), decision: "discrepancy" as const };

  it.each([
    ["verifyLeadSchema.clientAmount", (v: number) => verifyLeadSchema.safeParse({ ...verify, clientAmount: v })],
    ["verifyOwnedLeadSchema.clientAmount", (v: number) => verifyOwnedLeadSchema.safeParse({ decision: "discrepancy", clientAmount: v })],
    ["completeLeadSchema.providerAmount", (v: number) => completeLeadSchema.safeParse({ providerAmount: v, additionalWork: null })],
    ["completeLeadSchema.additionalWork.amount", (v: number) =>
      completeLeadSchema.safeParse({ providerAmount: 0, additionalWork: { description: "extra tiling", amount: v } })],
  ])("%s rejects an amount past the cap", (_label, parse) => {
    expect(parse(MAX_MONEY_EGP + 1).success).toBe(false);
    expect(parse(2_000_000_000).success).toBe(false);
    expect(parse(Number.MAX_SAFE_INTEGER).success).toBe(false);
  });

  it.each([
    ["verifyLeadSchema.clientAmount", (v: number) => verifyLeadSchema.safeParse({ ...verify, clientAmount: v })],
    ["verifyOwnedLeadSchema.clientAmount", (v: number) => verifyOwnedLeadSchema.safeParse({ decision: "discrepancy", clientAmount: v })],
    ["completeLeadSchema.providerAmount", (v: number) => completeLeadSchema.safeParse({ providerAmount: v, additionalWork: null })],
  ])("%s still accepts real amounts, including the ceiling itself", (_label, parse) => {
    expect(parse(0).success).toBe(true);
    expect(parse(45_000).success).toBe(true);
    expect(parse(MAX_MONEY_EGP).success).toBe(true);
  });

  it("keeps rejecting negatives and fractions", () => {
    expect(verifyLeadSchema.safeParse({ ...verify, clientAmount: -1 }).success).toBe(false);
    expect(verifyLeadSchema.safeParse({ ...verify, clientAmount: 1.5 }).success).toBe(false);
  });

  // The cap has to leave room for what the amount turns INTO, not just what it
  // is: finalTotal = providerAmount + additionalWorkAmount, and commission is a
  // percentage of clientAmount (validation/finance.ts caps that at 100).
  it("leaves every derived value inside int4", () => {
    const MAX_INT4 = 2_147_483_647;
    expect(MAX_MONEY_EGP * 2).toBeLessThan(MAX_INT4); // largest possible finalTotal
    expect(MAX_MONEY_EGP).toBeLessThan(MAX_INT4); // largest possible commission (100%)
  });
});

describe("verify schemas — unchanged rules", () => {
  it("requires a token or a phone", () => {
    expect(verifyLeadSchema.safeParse({ ref: "AA-1", decision: "confirmed" }).success).toBe(false);
    expect(verifyLeadSchema.safeParse({ ref: "AA-1", decision: "confirmed", token: "abc" }).success).toBe(true);
  });

  it("requires clientAmount exactly when the decision is a discrepancy", () => {
    expect(verifyLeadSchema.safeParse({ ref: "AA-1", token: "abc", decision: "discrepancy" }).success).toBe(false);
    expect(verifyOwnedLeadSchema.safeParse({ decision: "discrepancy" }).success).toBe(false);
    expect(verifyOwnedLeadSchema.safeParse({ decision: "confirmed" }).success).toBe(true);
  });
});
