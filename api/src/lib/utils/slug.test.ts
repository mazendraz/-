import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/utils/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Aura Interiors")).toBe("aura-interiors");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("  Smith & Co. — Builders!! ")).toBe("smith-co-builders");
  });

  it("removes diacritics", () => {
    expect(slugify("Café Déco")).toBe("cafe-deco");
  });

  it("returns empty string for non-Latin-only input", () => {
    expect(slugify("شركة")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when free", async () => {
    const slug = await uniqueSlug("Aura Interiors", async () => false);
    expect(slug).toBe("aura-interiors");
  });

  it("appends an incrementing suffix on collisions", async () => {
    const taken = new Set(["aura-interiors", "aura-interiors-2"]);
    const slug = await uniqueSlug("Aura Interiors", async (s) => taken.has(s));
    expect(slug).toBe("aura-interiors-3");
  });

  it("falls back to 'item' for empty base", async () => {
    const slug = await uniqueSlug("شركة", async () => false);
    expect(slug).toBe("item");
  });
});
