import { describe, expect, it, vi, beforeEach } from "vitest";

// The service reads the catalogue straight off prisma. These tests are about the
// SCORING cost and the query bound, not about the queries — so the client is
// stubbed with a fixed, generously-sized catalogue and the timing is measured
// around the pure JS that follows.
const category = (i: number) => ({
  id: `cat-${i}`,
  slug: `cat-${i}`,
  label: `Category ${i}`,
  labelAr: `تصنيف ${i}`,
  description: `Description for category ${i}`,
  descriptionAr: `وصف التصنيف ${i}`,
  cover: null,
});

const company = (i: number) => ({
  id: `co-${i}`,
  slug: `co-${i}`,
  name: `United Finishing Works ${i}`,
  nameAr: `شركة الإنشاءات المتحدة ${i}`,
  tagline: `Tagline for company ${i}`,
  logo: null,
  services: [`service-a-${i}`, `service-b-${i}`],
  categories: [{ category: { label: `Category ${i % 7}`, labelAr: `تصنيف ${i % 7}` } }],
});

const offering = (i: number) => ({
  id: `of-${i}`,
  name: `Wall Painting ${i}`,
  nameAr: `دهانات حوائط ${i}`,
  description: `A longer description of offering ${i}`,
  descriptionAr: `وصف أطول للخدمة ${i}`,
  tags: [`tag-${i}`],
  kind: "SERVICE",
  image: null,
  company: {
    slug: `co-${i}`,
    name: `United Finishing Works ${i}`,
    nameAr: `شركة الإنشاءات المتحدة ${i}`,
    categories: [{ category: { label: `Category ${i % 7}`, labelAr: `تصنيف ${i % 7}` } }],
  },
});

const CATALOG_SIZE = 2000;
const categories = Array.from({ length: 50 }, (_, i) => category(i));
const companies = Array.from({ length: CATALOG_SIZE }, (_, i) => company(i));
const offerings = Array.from({ length: CATALOG_SIZE }, (_, i) => offering(i));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: { findMany: vi.fn(async () => categories) },
    company: { findMany: vi.fn(async () => companies) },
    offering: { findMany: vi.fn(async () => offerings) },
  },
}));

import { searchCatalog } from "@/lib/services/catalogSearch.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchCatalog — query length is bounded", () => {
  // The regression this guards. Before MAX_QUERY_LENGTH, matchTier's fuzzy
  // fallback rebuilt a bigram Set sized by the QUERY once per candidate string,
  // so cost was O(|q| x rows) of fully-blocked event loop on a single PM2 fork.
  // A ~15,000-char query measured at ~1.8s against a 5,000-row catalogue; that
  // is an unauthenticated denial of service, not a slow search.
  it("scores a pathological 20,000-character query in ordinary time", async () => {
    const started = Date.now();
    const results = await searchCatalog("a".repeat(20_000));
    const elapsed = Date.now() - started;

    expect(results).toEqual([]);
    // Deliberately loose — this is a cliff detector, not a benchmark. The
    // unbounded version does not come close to finishing this fast.
    expect(
      elapsed,
      `${elapsed}ms to score a 20k-char query over ${CATALOG_SIZE * 2 + 50} rows`,
    ).toBeLessThan(500);
  });

  it("a long query scores no slower than a short one", async () => {
    const time = async (q: string) => {
      const t = Date.now();
      await searchCatalog(q);
      return Date.now() - t;
    };
    // Warm the JIT so the first call doesn't pay for both.
    await time("finishing");

    const short = await time("finishing");
    const long = await time("finishing".repeat(2_000));

    // Truncation makes these the same amount of work; without it the second is
    // orders of magnitude worse.
    expect(long).toBeLessThan(Math.max(short * 8, 400));
  });

  it("truncates rather than rejecting — a long query still matches its prefix", async () => {
    // 80 chars of a real term, then padding. The term survives the cut, so this
    // must still find the companies it names.
    const results = await searchCatalog("United Finishing Works 1" + " ".repeat(200) + "zzz");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("searchCatalog — unchanged behaviour", () => {
  it("returns nothing below the minimum query length", async () => {
    expect(await searchCatalog("a")).toEqual([]);
    expect(await searchCatalog("")).toEqual([]);
  });

  it("still folds Arabic hamza variants (the reason there is no DB-side filter)", async () => {
    const withHamza = await searchCatalog("الإنشاءات");
    const without = await searchCatalog("الانشاءات");
    expect(withHamza.length).toBeGreaterThan(0);
    expect(without.length).toBe(withHamza.length);
  });

  it("ranks an exact name match above a merely related one", async () => {
    const results = await searchCatalog("Wall Painting 3");
    expect(results[0]?.name).toBe("Wall Painting 3");
  });

  it("caps the result count at MAX_LIMIT however large `limit` is", async () => {
    expect((await searchCatalog("United", 10_000)).length).toBeLessThanOrEqual(50);
  });
});
