import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Extreme-data stress matrix.
 *
 * The existing ui-audit suite measures the real seeded database, where every
 * company name is ~20 characters, every count is two digits and every image
 * loads. That proves the layout survives PLEASANT data. It says nothing about
 * what the platform looks like at 1,000 companies with 500-character Arabic
 * names, nine-figure counts, missing images and empty result sets — which is
 * the state it will actually be in a year from now.
 *
 * So this suite serves the payloads instead of the database: every response is
 * intercepted, so the cases are deterministic, need no seeding, and can encode
 * values no sane admin would type but a real dataset eventually contains
 * anyway (a pasted description, an unbroken URL, a company that imported its
 * whole service list).
 *
 * 320px is included deliberately — the narrowest phone still in real use, and
 * the width below which "it looks fine on my iPhone" stops being evidence.
 */

const LOCALE_STORAGE_KEY = "al-assema-locale";

/**
 * The full width range, not a representative sample.
 *
 * Each of these caught something the neighbouring width did not: 320 found the
 * bottom nav, 390 found the tagline overflow, 768 found the flex `min-width:
 * auto` trap. Sampling every other size would have missed two of the three.
 */
const VIEWPORTS = [
  { name: "320", width: 320, height: 800 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "414", width: 414, height: 896 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1920", width: 1920, height: 1080 },
];

const LOCALES = ["ar", "en"] as const;
type Locale = (typeof LOCALES)[number];

// ── Adversarial values ───────────────────────────────────────────────────────

/** 500 characters of Arabic prose — long, but full of legal break opportunities. */
const LONG_AR = "شركة التشطيبات والديكور الفاخر للعاصمة الإدارية الجديدة والمناطق المحيطة بها ".repeat(7);
/** The nastier case: no spaces at all, so nothing can wrap it without help. */
const UNBREAKABLE = "ااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااااا";
/** The other unbreakable case a real user actually pastes. */
const LONG_URL = "https://www.example-contracting-company-new-administrative-capital.com/portfolio/residential/2026/project-details";
/** Emoji + RTL/LTR mixing in one string — the bidi worst case. */
const MIXED_BIDI = "AURA ✨ للتشطيبات 🏗️ Interiors & Fit-Out (2026) — R7 District";

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "stress-1",
    slug: "stress-co",
    name: "Aura Interiors",
    tagline: "Turnkey interior finishing",
    about: "About text.",
    logo: "/img/missing-logo.jpg",
    cover: "/img/missing-cover.jpg",
    category: "interior-finishing",
    categoryLabel: "Interior Finishing",
    categories: [{ slug: "interior-finishing", label: "Interior Finishing", pricingMode: "QUOTE_ONLY", isPrimary: true }],
    categoryPricingMode: "QUOTE_ONLY",
    services: ["Design", "Fit-out"],
    rating: 4.8,
    reviewCount: 42,
    completedProjects: 87,
    gallery: [],
    projects: [],
    reviews: [],
    offerings: [],
    bundleRules: [],
    phone: "+201012345678",
    location: "R7 District",
    yearsExperience: 8,
    responseTime: "within 2 hours",
    verifiedSince: "2021",
    badges: ["Licensed"],
    featured: true,
    verified: true,
    busy: false,
    busyUntil: null,
    busyNote: null,
    nextAvailableAt: null,
    upcomingBusyFrom: null,
    busyReason: null,
    metaTitle: null,
    metaDescription: null,
    ...overrides,
  };
}

/** The set that has historically broken cards, one company per failure mode. */
const STRESS_COMPANIES = [
  company({
    id: "s1", slug: "s1",
    name: LONG_AR.slice(0, 500),
    tagline: LONG_AR,
    categoryLabel: LONG_AR.slice(0, 120),
  }),
  company({
    id: "s2", slug: "s2",
    name: UNBREAKABLE,
    tagline: LONG_URL,
    categoryLabel: UNBREAKABLE.slice(0, 40),
  }),
  company({
    id: "s3", slug: "s3",
    name: MIXED_BIDI,
    tagline: MIXED_BIDI,
    // Nine-figure counts: the platform stores these as plain integers with no
    // display cap, so nothing stops an admin typing one.
    completedProjects: 999_999_999,
    reviewCount: 987_654_321,
    rating: 5,
  }),
  company({
    id: "s4", slug: "s4",
    // Everything empty or missing that the API permits.
    name: "A",
    tagline: "",
    categoryLabel: "",
    logo: "",
    cover: "",
    services: [],
    badges: [],
    rating: 0,
    reviewCount: 0,
    completedProjects: 0,
    verified: false,
  }),
  company({
    id: "s5", slug: "s5",
    name: "Busy Co — مشغولة",
    busy: true,
    busyNote: LONG_AR.slice(0, 200),
    busyReason: LONG_AR.slice(0, 200),
    nextAvailableAt: Date.now() + 86_400_000 * 30,
  }),
  // Enough rows to fill a full grid page at every breakpoint.
  ...Array.from({ length: 7 }, (_, i) =>
    company({ id: `f${i}`, slug: `f${i}`, name: `Filler ${i}`, completedProjects: 10 ** i })),
];

const CATEGORIES = [
  {
    slug: "interior-finishing", label: "Interior Finishing", description: "d",
    icon: "chair", cover: "", count: 12, pricingMode: "QUOTE_ONLY",
    metaTitle: null, metaDescription: null,
  },
  {
    // A category label long enough to test the filter chip row / dropdown.
    slug: "long-cat", label: LONG_AR.slice(0, 90), description: "d",
    icon: "construction", cover: "", count: 3, pricingMode: "QUOTE_ONLY",
    metaTitle: null, metaDescription: null,
  },
];

// ── Interception ─────────────────────────────────────────────────────────────

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const isPath = (p: string) => (url: URL) => url.pathname.endsWith(p);

/**
 * Serve the stress catalogue for every list/detail read. Images are left to
 * fail on purpose — a broken `src` is one of the states being tested, and the
 * layout must hold its shape without the intrinsic size an image would give it.
 */
async function stubCatalog(page: Page, data: unknown[], total = data.length) {
  await page.route(isPath("/api/companies"), (route) =>
    json(route, { data, meta: { total, page: 1, pageSize: 12 } }));
  await page.route(isPath("/api/categories"), (route) => json(route, CATEGORIES));
  await page.route(isPath("/api/projects/featured"), (route) => json(route, []));
  await page.route(isPath("/api/site-reviews"), (route) =>
    json(route, { data: [], meta: { total: 0, page: 1, pageSize: 10 } }));
}

async function gotoLocalized(page: Page, path: string, locale: Locale) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [LOCALE_STORAGE_KEY, locale] as [string, string],
  );
  await page.goto(path, { waitUntil: "load" });

  // Wait for the app to actually PAINT, rather than for a fixed number of
  // milliseconds. A flat timeout measured the dev server's module-compile time
  // as much as the app's: at 600ms the empty-catalogue case was still blank and
  // reported "the empty state rendered nothing", which was the test racing the
  // first render rather than a real blank screen.
  await page
    .waitForFunction(() => (document.body.innerText ?? "").trim().length > 0, undefined, {
      timeout: 15_000,
    })
    .catch(() => {
      /* genuinely blank after 15s — let the assertion report it as the failure it is */
    });
  // Then let layout settle: two identical node counts 250ms apart.
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { __n?: number; __t?: number };
        const n = document.getElementsByTagName("*").length;
        w.__t = n === w.__n ? (w.__t ?? 0) + 1 : 0;
        w.__n = n;
        return (w.__t ?? 0) >= 2;
      },
      undefined,
      { polling: 250, timeout: 10_000 },
    )
    .catch(() => {});
}

/**
 * Horizontal overflow, plus the specific elements responsible.
 *
 * Reported rather than just asserted: "scrollWidth 431 > 390" tells you a page
 * is broken and nothing about which of its four hundred nodes broke it, and
 * that gap is where a failing layout test goes unfixed for a month.
 */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const cw = doc.clientWidth;
    const label = (el: HTMLElement) =>
      `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 70)}`;

    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // RTL pushes the LEFT edge negative instead of the right edge over.
      if (r.right > cw + 2 || r.left < -2) {
        offenders.push(
          `PROTRUDES ${label(el)} [${Math.round(r.left)}..${Math.round(r.right)}] ` +
          `"${(el.textContent ?? "").trim().slice(0, 40)}"`,
        );
      }
    }

    // A protruding RECT is only one way to widen the page. An element can sit
    // fully inside the viewport and still have content wider than itself — the
    // page then scrolls with nothing visibly sticking out, which is exactly the
    // case the rect scan above reported as "no offenders" while the page was
    // demonstrably 20px too wide. Skip anything that scrolls ON PURPOSE.
    if (offenders.length === 0) {
      const wide = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
        if (el.scrollWidth <= el.clientWidth + 2 || el.clientWidth === 0) return false;
        const overflowX = getComputedStyle(el).overflowX;
        return overflowX !== "auto" && overflowX !== "scroll" && overflowX !== "hidden";
      });
      // Only the DEEPEST ones. Overflow propagates up, so an unfiltered list is
      // html → body → #root → … and names every ancestor before the one element
      // actually responsible — which is the only one worth reading.
      const deepest = wide.filter((el) => !wide.some((other) => other !== el && el.contains(other)));
      for (const el of deepest) {
        offenders.push(
          `OVERFLOWS ${label(el)} content=${el.scrollWidth} box=${el.clientWidth} ` +
          `"${(el.textContent ?? "").trim().slice(0, 40)}"`,
        );
      }
    }

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: cw,
      offenders: offenders.slice(0, 10),
    };
  });
}

// ── The matrix ───────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  for (const locale of LOCALES) {
    const suffix = `${viewport.name}-${locale}`;

    test(`companies list survives extreme data — ${suffix}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await stubCatalog(page, STRESS_COMPANIES);
      await gotoLocalized(page, "/companies", locale);

      const report = await overflowReport(page);
      expect(
        report.scrollWidth,
        `horizontal overflow at ${suffix}\n${report.offenders.join("\n")}`,
      ).toBeLessThanOrEqual(report.clientWidth + 1);
    });

    test(`company profile survives extreme data — ${suffix}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const profile = company({
        id: "p1", slug: "s1",
        name: LONG_AR.slice(0, 500),
        tagline: LONG_URL,
        about: `${LONG_AR}\n\n${UNBREAKABLE}\n\n${LONG_URL}`,
        completedProjects: 999_999_999,
        reviewCount: 987_654_321,
        badges: Array.from({ length: 12 }, (_, i) => `${UNBREAKABLE.slice(0, 20)}-${i}`),
        services: Array.from({ length: 40 }, (_, i) => `${LONG_AR.slice(0, 60)} ${i}`),
      });
      await stubCatalog(page, [profile]);
      await page.route(isPath("/api/companies/s1"), (route) => json(route, profile));
      await page.route(isPath("/api/companies/s1/reviews"), (route) =>
        json(route, { data: [], meta: { total: 0, page: 1, pageSize: 12 } }));
      await gotoLocalized(page, "/companies/s1", locale);

      const report = await overflowReport(page);
      expect(
        report.scrollWidth,
        `horizontal overflow at ${suffix}\n${report.offenders.join("\n")}`,
      ).toBeLessThanOrEqual(report.clientWidth + 1);
    });

    test(`no serious accessibility violations under extreme data — ${suffix}`, async ({ page }) => {
      // Run against the STRESS payload, not the seeded one. Long names, missing
      // images and huge numbers are exactly what breaks contrast, alt text and
      // name-from-content — a clean axe run on tidy data proves less.
      await page.setViewportSize(viewport);
      await stubCatalog(page, STRESS_COMPANIES);
      await gotoLocalized(page, "/companies", locale);

      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.html?.slice(0, 90) ?? ""}`);
      expect(serious, `axe violations at ${suffix}\n${serious.join("\n")}`).toEqual([]);
    });

    test(`empty catalogue renders a deliberate empty state — ${suffix}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await stubCatalog(page, [], 0);
      await gotoLocalized(page, "/companies", locale);

      // An empty result must be a designed state, not a blank region: something
      // has to tell the visitor the list is empty ON PURPOSE.
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length, "empty state rendered nothing at all").toBeGreaterThan(0);

      const report = await overflowReport(page);
      expect(
        report.scrollWidth,
        `horizontal overflow at ${suffix}\n${report.offenders.join("\n")}`,
      ).toBeLessThanOrEqual(report.clientWidth + 1);
    });
  }
}

/**
 * Regression: a page index left pointing past the end of a SHRUNKEN result set.
 *
 * Before the clamp in useServerSearch, nothing moved `page` back when `total`
 * fell: the browser kept asking for page 9 of an 8-page result, the server
 * correctly returned an empty slice, and the list rendered its "nothing found"
 * empty state on top of a dataset that was not empty — while the pager read
 * "97–96 of 96". Reachable in the admin dashboard by deleting the last row on
 * the last page; reproduced here on the public list, which uses the same hook.
 */
test("recovers when the current page falls off the end of a shrunken result set", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });

  const many = Array.from({ length: 12 }, (_, i) =>
    company({ id: `m${i}`, slug: `m${i}`, name: `Company ${i}` }));

  // Starts as a 100-row dataset (9 pages), then collapses to 4 rows — the shape
  // a bulk delete or a newly applied filter produces.
  let shrunk = false;
  await page.route(isPath("/api/companies"), (route) => {
    const requested = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
    if (!shrunk) return json(route, { data: many, meta: { total: 100, page: requested, pageSize: 12 } });
    const data = requested === 1 ? many.slice(0, 4) : [];
    return json(route, { data, meta: { total: 4, page: requested, pageSize: 12 } });
  });
  await page.route(isPath("/api/categories"), (route) => json(route, CATEGORIES));

  await gotoLocalized(page, "/companies", "en");
  await expect(page.getByRole("heading", { name: "Company 0" })).toBeVisible();

  // Walk to a later page, then collapse the dataset underneath it.
  const next = page.getByRole("button", { name: /next/i });
  await next.click();
  await page.waitForTimeout(400);
  shrunk = true;
  await next.click();
  await page.waitForTimeout(1200);

  // The list must show the rows that DO exist rather than an empty state.
  await expect(page.getByRole("heading", { name: "Company 0" })).toBeVisible();

  // ...and the pager's range must read forwards, never "5–4 of 4".
  const range = await page.locator("text=/\\d+–\\d+/").first().innerText();
  const [from, to] = range.match(/(\d+)–(\d+)/)!.slice(1).map(Number);
  expect(from, `pager range runs backwards: "${range}"`).toBeLessThanOrEqual(to);
});
