import { describe, expect, it } from "vitest";
import { generateRefNumber, REF_NUMBER_PATTERN } from "@/lib/utils/refNumber";

describe("generateRefNumber", () => {
  it("matches the AA-YYYYMMDD-XXXX pattern", () => {
    expect(generateRefNumber()).toMatch(REF_NUMBER_PATTERN);
  });

  it("encodes the given date", () => {
    const ref = generateRefNumber(new Date(2026, 5, 21)); // 21 Jun 2026 (month is 0-based)
    expect(ref.startsWith("AA-20260621-")).toBe(true);
  });

  it("zero-pads single-digit months and days", () => {
    const ref = generateRefNumber(new Date(2026, 0, 5)); // 5 Jan 2026
    expect(ref.startsWith("AA-20260105-")).toBe(true);
  });

  it("is reasonably unique across calls", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generateRefNumber()));
    // 200 random 4-char base36 suffixes should essentially never all collide.
    expect(refs.size).toBeGreaterThan(190);
  });
});
