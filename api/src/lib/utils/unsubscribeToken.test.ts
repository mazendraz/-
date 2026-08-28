// Stateless HMAC unsubscribe tokens — no DB row, so correctness here IS the
// whole security model: a forged or tampered token must never verify, and a
// genuine one must keep working indefinitely (no expiry, matching CAN-SPAM/
// GDPR's "an unsubscribe link should keep working" expectation).
import { beforeEach, describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/utils/unsubscribeToken";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-value";
});

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trips: a signed token verifies back to the same customer id", () => {
    const token = signUnsubscribeToken("customer-123");
    expect(verifyUnsubscribeToken(token)).toBe("customer-123");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken("customer-123");
    process.env.UNSUBSCRIBE_SECRET = "a-different-secret";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects a tampered customer id (signature no longer matches)", () => {
    const token = signUnsubscribeToken("customer-123");
    const [, sig] = token.split(".");
    const tampered = `customer-999.${sig}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken("customer-123");
    const [id] = token.split(".");
    expect(verifyUnsubscribeToken(`${id}.notarealsignature`)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("no-dot-here")).toBeNull();
    expect(verifyUnsubscribeToken(".leading-dot")).toBeNull();
  });

  it("produces different tokens for different customers", () => {
    expect(signUnsubscribeToken("a")).not.toBe(signUnsubscribeToken("b"));
  });
});
