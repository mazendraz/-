import { describe, expect, it } from "vitest";
import { cleanParam, stripControlChars, stripHtml } from "@/lib/utils/sanitize";

// Built with fromCharCode rather than written as literals: a raw control
// character in a source file is invisible in every diff and every review, and
// this file exists precisely to reason about them.
const ch = (code: number) => String.fromCharCode(code);
const NUL = ch(0);
const BEL = ch(7);
const ESC = ch(27);
const DEL = ch(127);
const VT = ch(11);
const FF = ch(12);

// Regression: a NUL byte is a legal JavaScript string character and passes
// through the URL, JSON.parse and Zod untouched — but Postgres rejects it with
// `22021: invalid byte sequence for encoding "UTF8": 0x00`. Prisma forwards it,
// so the failure lands at the driver and withErrors can only render it as a
// generic 500.
//
// Verified against a live Postgres BEFORE the fix: one NUL in `?search=`
// produced an UNAUTHENTICATED 500 on /api/companies, on /api/companies?category=
// and on /api/companies/:slug/reviews — no account, no rate limit, one query
// string.
describe("stripControlChars", () => {
  it.each([
    ["NUL in the middle", `abc${NUL}def`, "abcdef"],
    ["NUL alone", NUL, ""],
    ["trailing NUL", `ok${NUL}`, "ok"],
    ["leading NUL", `${NUL}ok`, "ok"],
    ["repeated NULs", `${NUL}${NUL}a${NUL}${NUL}`, "a"],
    ["BEL and ESC", `a${BEL}b${ESC}c`, "abc"],
    ["DEL", `a${DEL}b`, "ab"],
    ["vertical tab and form feed", `a${VT}b${FF}c`, "abc"],
  ])("removes %s", (_label, input, expected) => {
    expect(stripControlChars(input)).toBe(expected);
  });

  it.each([
    ["tab", "a\tb"],
    ["line feed", "a\nb"],
    ["carriage return", "a\rb"],
    ["all three together", "a\tb\nc\rd"],
  ])("keeps %s — multi-line descriptions are real content", (_label, input) => {
    expect(stripControlChars(input)).toBe(input);
  });

  it.each([
    ["Arabic", "شركة التشطيبات"],
    ["emoji", "🏗️🔥"],
    ["mixed bidi", "AURA للتشطيبات 2026"],
    ["accents", "café naïve"],
  ])("leaves %s untouched", (_label, input) => {
    expect(stripControlChars(input)).toBe(input);
  });
});

describe("cleanParam", () => {
  it("returns undefined for absent values", () => {
    expect(cleanParam(null)).toBeUndefined();
    expect(cleanParam(undefined)).toBeUndefined();
  });

  it("returns undefined once a control-only value is cleaned away", () => {
    // The case that mattered: this used to reach Prisma as a NON-EMPTY string
    // containing a NUL, which is exactly what Postgres refuses.
    expect(cleanParam(NUL)).toBeUndefined();
    expect(cleanParam(`${NUL}${NUL}`)).toBeUndefined();
    expect(cleanParam("   ")).toBeUndefined();
  });

  it("cleans and trims a real search term", () => {
    expect(cleanParam(`  Finish${NUL}ing  `)).toBe("Finishing");
    expect(cleanParam(" التشطيبات ")).toBe("التشطيبات");
  });
});

describe("stripHtml also removes control characters", () => {
  it("cleans NUL as well as markup, so every validated WRITE path is covered too", () => {
    expect(stripHtml(`a${NUL}<b>bold</b>`)).toBe("abold");
  });

  it("still strips script blocks with their contents", () => {
    expect(stripHtml("keep<script>alert(1)</script>this")).toBe("keepthis");
  });
});
