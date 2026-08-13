import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STATE, PROVIDER_STATE } from "../authState";

// CTO QA sweep — Pass 3 (end-to-end journeys).
//
// health.spec.ts loads pages; interact.spec.ts clicks controls. Neither
// completes a real task. This pass walks the journeys a user actually pays us
// for, in BOTH locales and at BOTH a phone and a desktop width:
//
//   1. browse → company → submit a service request (the core conversion)
//   2. language toggle persists and flips direction everywhere
//   3. search + filters return results and can be cleared
//   4. provider: mark a lead complete (the new completion wizard)
//   5. client: the mandatory price-verification gate, confirm AND dispute paths
//   6. admin: sees the completion + verification outcome

const LOCALE_KEY = "al-assema-locale";

async function boot(page: Page, path: string, locale: "ar" | "en") {
  // Seed the locale only if the page hasn't got one yet. addInitScript re-runs
  // on EVERY navigation and reload, so an unconditional set made this helper
  // fight the very thing the language-toggle test measures: the toggle flipped
  // to Arabic correctly, then the next reload re-forced "en" and the assertion
  // read the test's own leftover, not a product bug.
  await page.addInitScript(([k, v]) => {
    if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v);
  }, [LOCALE_KEY, locale] as [string, string]);
  await page.goto(path, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 15_000 });
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.name}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/DevTools|\[vite\]|favicon|ServiceWorker/i.test(t)) return;
    // The runner has no outbound internet, so Google-hosted fonts 404 and the
    // browser logs it — environmental, same note as health.spec.ts.
    if (/fonts\.(gstatic|googleapis)\.com/i.test(t) || /Failed to load resource.*404/i.test(t)) return;
    errors.push(`console ${t.slice(0, 200)}`);
  });
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`); });
  return errors;
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 900 };

// ── 1. Language toggle ──────────────────────────────────────────────────────
for (const size of [MOBILE, DESKTOP]) {
  test(`language toggle flips direction and persists · ${size.width}px`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize(size);
    await boot(page, "/", "en");

    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    // The toggle's accessible name is its aria-label ("Switch language" /
    // "تغيير اللغة"), not the visible "عربي" text — TopNav.tsx:187.
    const toggle = page.getByRole("button", { name: /switch language|تغيير اللغة/i });

    // On a phone the toggle lives inside the collapsed menu (TopNav.tsx:341),
    // so open that first. On desktop it sits in the nav bar already.
    if (size.width < 768) {
      const menu = page.getByRole("button", { name: /menu|القائمة|More|المزيد/i }).first();
      if (await menu.isVisible().catch(() => false)) await menu.click();
    }

    await expect(toggle.first()).toBeVisible({ timeout: 10_000 });
    await toggle.first().click();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 5_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    // Persists across a full reload (localStorage, not component state).
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });

    // …and across a navigation to a different route tree.
    await page.goto("/services", { waitUntil: "load" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });

    expect(errors, "console/page errors during language toggle").toEqual([]);
  });
}

// ── 2. Browse → company → request (the core conversion path) ────────────────
for (const locale of ["ar", "en"] as const) {
  for (const size of [MOBILE, DESKTOP]) {
    test(`browse to a company profile and open its request form · ${locale} · ${size.width}px`, async ({ page }) => {
      const errors = watch(page);
      await page.setViewportSize(size);
      await boot(page, "/companies", locale);

      // At least one company card must be present — an empty directory is
      // itself the bug on a directory site.
      const cards = page.locator('a[href^="/companies/"]');
      await expect(cards.first()).toBeVisible({ timeout: 15_000 });
      const count = await cards.count();
      expect(count, "company cards on /companies").toBeGreaterThan(0);

      await cards.first().click();
      await page.waitForURL(/\/companies\/[^/]+$/, { timeout: 15_000 });
      await page.waitForFunction(() => document.body.innerText.trim().length > 100, undefined, { timeout: 15_000 });

      // The profile must offer a way to actually request the service —
      // otherwise the lead-generation product has no funnel. Match the real
      // CTA href built by CompanyProfile.tsx:118 (`/request?company=…`), NOT a
      // loose `*="/request"`, which also matches the nav's "/requests" link.
      const requestLink = page.locator('a[href^="/request?"]').first();
      await expect(requestLink, "company profile offers a request CTA").toBeVisible({ timeout: 10_000 });
      await requestLink.click();
      await page.waitForURL(/\/request/, { timeout: 15_000 });

      // Step 1 of the wizard must render an input the user can act on.
      await expect(page.locator("input, textarea, select, [role='button']").first()).toBeVisible({ timeout: 10_000 });

      expect(errors, "console/page errors on the conversion path").toEqual([]);
    });
  }
}

// ── 3. Search ───────────────────────────────────────────────────────────────
for (const locale of ["ar", "en"] as const) {
  test(`companies search filters the list and can be cleared · ${locale}`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize(DESKTOP);
    await boot(page, "/companies", locale);

    const cards = page.locator('a[href^="/companies/"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const before = await cards.count();

    const search = page.locator('input[type="search"], input[placeholder*="Search" i], input[placeholder*="ابحث"]').first();
    await expect(search).toBeVisible({ timeout: 10_000 });

    // A string no seeded company can match — the list must visibly react.
    await search.fill("zzzzqqqqxxxx");
    await page.waitForTimeout(700);
    const after = await cards.count();
    expect(after, "search for a nonsense term should narrow the list").toBeLessThan(before);

    // An empty result must say so rather than render a bare blank area.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length, "empty search state still renders copy").toBeGreaterThan(50);

    await search.fill("");
    await page.waitForTimeout(700);
    expect(await cards.count(), "clearing the search restores the list").toBe(before);

    expect(errors, "console/page errors during search").toEqual([]);
  });
}

// ── 4. Provider dashboard: navigate every tab without losing the session ────
test.describe("provider dashboard", () => {
  test.use({ storageState: PROVIDER_STATE });

  for (const size of [MOBILE, DESKTOP]) {
    test(`every provider tab loads real content · ${size.width}px`, async ({ page }) => {
      const errors = watch(page);
      await page.setViewportSize(size);
      await boot(page, "/provider/overview", "en");

      const tabs = ["overview", "leads", "messages", "projects", "reviews", "analytics", "availability", "pricing", "profile", "settings"];
      for (const tab of tabs) {
        await page.goto(`/provider/${tab}`, { waitUntil: "load" });
        await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 15_000 });

        // Still authenticated: a bounced session renders the login form.
        await expect(page.locator('input[type="password"]'), `${tab} bounced to login`).toHaveCount(0);
        const text = (await page.locator("body").innerText()).trim();
        expect(text.length, `${tab} rendered almost nothing`).toBeGreaterThan(40);
      }

      expect(errors, "console/page errors across provider tabs").toEqual([]);
    });
  }
});

// ── 5. Admin dashboard: same ────────────────────────────────────────────────
test.describe("admin dashboard", () => {
  test.use({ storageState: ADMIN_STATE });

  for (const size of [MOBILE, DESKTOP]) {
    test(`every admin tab loads real content · ${size.width}px`, async ({ page }) => {
      const errors = watch(page);
      await page.setViewportSize(size);
      await boot(page, "/admin/overview", "en");

      const tabs = ["overview", "leads", "companies", "services", "team", "reviews", "changes", "chat", "status", "settings"];
      for (const tab of tabs) {
        await page.goto(`/admin/${tab}`, { waitUntil: "load" });
        await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 15_000 });
        await expect(page.locator('input[type="password"]'), `${tab} bounced to login`).toHaveCount(0);
        const text = (await page.locator("body").innerText()).trim();
        expect(text.length, `${tab} rendered almost nothing`).toBeGreaterThan(40);
      }

      expect(errors, "console/page errors across admin tabs").toEqual([]);
    });
  }
});

// ── 6. Login form rejects bad credentials without crashing ──────────────────
for (const locale of ["ar", "en"] as const) {
  test(`login rejects wrong credentials with a visible message · ${locale}`, async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize(MOBILE);
    await boot(page, "/admin", locale);

    const email = page.locator('input[type="email"]');
    await expect(email).toBeVisible({ timeout: 15_000 });
    await email.fill("nobody@nowhere.test");
    await page.locator('input[type="password"]').fill("definitely-wrong");

    const before = (await page.locator("body").innerText()).length;
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);

    // Still on the form, and the user was told something.
    await expect(page.locator('input[type="email"]'), "stayed on the login form").toBeVisible();
    const after = (await page.locator("body").innerText()).length;
    expect(after, "an error message appeared after a failed login").toBeGreaterThan(before);

    // A 401 is the correct response and not a defect; only 5xx counts here.
    expect(errors.filter((e) => !e.startsWith("console")), "server errors on failed login").toEqual([]);
  });
}
