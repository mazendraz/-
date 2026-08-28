import { describe, expect, it } from "vitest";
import { isValidCronSecret } from "@/lib/utils/cronAuth";

describe("isValidCronSecret", () => {
  it("accepts the exact configured secret", () => {
    expect(isValidCronSecret("abc123", "abc123")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isValidCronSecret("wrong", "abc123")).toBe(false);
  });

  it("rejects a missing header (null)", () => {
    expect(isValidCronSecret(null, "abc123")).toBe(false);
  });

  it("rejects every request when no secret is configured — no 'auth disabled' mode", () => {
    expect(isValidCronSecret("anything", undefined)).toBe(false);
    expect(isValidCronSecret(null, undefined)).toBe(false);
    expect(isValidCronSecret("", "")).toBe(false);
  });

  it("rejects a secret that's merely a prefix/suffix of the real one", () => {
    expect(isValidCronSecret("abc12", "abc123")).toBe(false);
    expect(isValidCronSecret("abc1234", "abc123")).toBe(false);
  });
});
