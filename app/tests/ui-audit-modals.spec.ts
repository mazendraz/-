import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STATE, PROVIDER_STATE } from "./authState";

// Phase 0 of the dashboard audit left a hole, recorded in
// DASHBOARD-FIX-NOTES.md: ui-audit.spec.ts measures each route exactly as it
// first renders, so anything behind an interaction is invisible to it. That
// covers DM-09 (the CompanyEditor sub-tabs overflow) and the modal-gated half
// of DM-06 — findings that could have been "fixed" with nothing verifying it.
//
// This file opens the modals and runs the same overflow + touch-target checks
// against the state that actually contains the defect.

const LOCALE_STORAGE_KEY = "al-assema-locale";

test.use({ storageState: ADMIN_STATE, viewport: { width: 390, height: 844 } });

async function gotoAr(page: Page, path: string) {
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [LOCALE_STORAGE_KEY, "ar"] as [string, string],
  );
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1500);
}

/** Nothing on the page may extend past the viewport horizontally. */
async function expectNoOverflow(page: Page, label: string) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect
    .soft(dims.scrollWidth, `${label}: scrollWidth=${dims.scrollWidth} clientWidth=${dims.clientWidth}`)
    .toBeLessThanOrEqual(dims.clientWidth + 1);
}

/**
 * The dialog itself must not scroll sideways either. A `overflow-x-auto` strip
 * INSIDE the dialog is fine and expected (that's the DM-09 fix) — what's not
 * fine is the dialog's own content box being wider than the dialog.
 */
async function expectDialogFits(page: Page, label: string) {
  const over = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return "no dialog";
    const dw = dialog.getBoundingClientRect().width;
    const bad: string[] = [];
    for (const el of Array.from(dialog.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(el);
      // Skip the deliberate scrollers — those are allowed to be wider inside.
      if (/auto|scroll/.test(s.overflowX)) continue;
      if (el.getBoundingClientRect().width > dw + 1) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 45)}`);
      }
    }
    return bad;
  });
  expect.soft(over, `${label}: elements wider than their dialog`).toEqual([]);
}

test("DM-09: company editor sub-tabs do not overflow the modal", async ({ page }) => {
  await gotoAr(page, "/admin/companies");

  // Open the first company's editor. The button is labelled "تعديل" (edit).
  await page.getByRole("button", { name: /تعديل/ }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);

  await expectNoOverflow(page, "company editor open");
  await expectDialogFits(page, "company editor");

  // The tab strip must be the thing that scrolls — proving the fix is real and
  // not just "the labels wrapped", which would also produce no overflow but is
  // the wrong outcome.
  const strip = dialog.locator('[role="tablist"]');
  await expect(strip).toBeVisible();
  const scrolls = await strip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { overflowX: s.overflowX, scrollable: el.scrollWidth > el.clientWidth };
  });
  expect.soft(scrolls.overflowX, "tablist must be a horizontal scroller").toMatch(/auto|scroll/);
});

/**
 * DM-04. Chromium cannot emulate safe-area insets — `--safe-area-insets` and
 * `--force-display-mode-standalone` were both measured on 2026-08-03 and leave
 * `env(safe-area-inset-top)` at 0px. That is exactly why index.css routes the
 * insets through `--safe-top` / `--safe-bottom`: overriding the variables here
 * reproduces a notched device faithfully enough to assert against, and a fix
 * that didn't actually consume them would fail this test.
 */
const NOTCH = ":root{--safe-top:59px;--safe-bottom:34px}";

test("DM-04: topbar controls clear the status bar in standalone", async ({ page }) => {
  await gotoAr(page, "/admin/leads");
  await page.addStyleTag({ content: NOTCH });
  await page.waitForTimeout(300);

  // Nothing interactive may sit in the top 59px — that band is the notch.
  const intruders = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select"))) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (s.clip === "rect(0px, 0px, 0px, 0px)") continue; // sr-only
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.top < 59) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 40)} top=${Math.round(r.top)}`);
    }
    return bad;
  });
  expect.soft(intruders, "controls overlapping the status bar / notch").toEqual([]);
});

test("DM-04: settings save bar clears the home indicator", async ({ page }) => {
  await gotoAr(page, "/admin/settings");
  await page.addStyleTag({ content: NOTCH });
  await page.waitForTimeout(300);

  // The bar is `sticky bottom-0` inside the scrollable <main>. Unscrolled, it
  // sits at its natural position far below the fold and is not yet pinned —
  // measuring there says nothing. Scroll to the bottom, which is both where
  // sticky actually engages and where a user finishes filling the form.
  await page.evaluate(() => {
    const main = document.querySelector("#main");
    if (main && main.scrollHeight > main.clientHeight) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(400);

  const save = page.getByRole("button", { name: /حفظ/ }).last();
  await expect(save).toBeVisible();
  const gap = await save.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom);
  // The button's bottom edge must sit above the 34px home-indicator band.
  expect.soft(Math.round(gap), "gap between Save button and viewport bottom").toBeGreaterThanOrEqual(34);
});

test("DM-10: lead detail modal fields stack on a phone", async ({ page }) => {
  await gotoAr(page, "/admin/leads");

  // The mobile lead card opens the detail modal.
  await page.getByRole("button", { name: /التفاصيل/ }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);

  await expectNoOverflow(page, "lead modal open");
  await expectDialogFits(page, "lead modal");
});

// ── DM-02: provider tabs are real routes ─────────────────────────────────────
// The behaviour this whole refactor exists for. Asserted explicitly because
// "the Back button works" is invisible to a screenshot diff and to every other
// check in this suite.

test.describe("DM-02 provider routing", () => {
  test.use({ storageState: PROVIDER_STATE });

  test("back moves between tabs instead of leaving the dashboard", async ({ page }) => {
    await gotoAr(page, "/provider/overview");
    await expect(page).toHaveURL(/\/provider\/overview/);

    // Navigate the way a phone user actually does: the sidebar is drawer-only
    // below md:, so open the drawer first. This also exercises DM-07's two-tap
    // cost — every tab switch on mobile goes through here.
    await page.getByRole("button", { name: /القائمة|menu/i }).first().click();
    // Scoped to the drawer, and by href rather than by name: the desktop
    // <aside> renders the same links first in DOM order (hidden at this width),
    // and the nav label carries an unread-count badge that varies with seed
    // data, so its accessible name is "الطلبات 13".
    await page.getByRole("dialog").locator('a[href="/provider/leads"]').click();
    await expect(page).toHaveURL(/\/provider\/leads/, { timeout: 10_000 });

    await page.goBack();
    // The old `useState` version left the dashboard entirely here.
    await expect(page).toHaveURL(/\/provider\/overview/, { timeout: 10_000 });
    await expect(page.locator("#main")).toBeVisible();
  });

  test("a tab survives a reload instead of snapping back to overview", async ({ page }) => {
    await gotoAr(page, "/provider/analytics");
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/provider\/analytics/);
  });

  test("legacy ?tab= deep links still resolve (push notification payloads)", async ({ page }) => {
    // The server bakes /provider?tab=messages into chat push notifications —
    // dropping the parameter would silently break every existing one.
    await gotoAr(page, "/provider?tab=messages");
    await expect(page).toHaveURL(/\/provider\/messages/, { timeout: 10_000 });
  });
});

// ── DM-05: chat as push navigation on mobile ─────────────────────────────────
// Both admin/ChatTab.tsx and components/ProviderChat.tsx used to stack a
// scrollable conversation list ON TOP OF a scrollable thread below their
// desktop breakpoint — the classic broken master-detail: reading a reply
// meant scrolling an internally-scrolling list to reach a thread that also
// scrolled internally. Real conversations exist in the seeded dev DB (10 on
// Aura Interiors, the e2e-provider test user's own company), so these open a
// real one rather than asserting against an empty state.

/** No scrollable element may be nested inside another scrollable element —
 *  the exact defect DM-05 fixes. Mirrors the check in ui-audit.spec.ts. */
async function expectNoNestedScroll(page: Page, label: string) {
  const nested = await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const s = getComputedStyle(el);
      return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0;
    });
    return scrollers
      .filter((el) => scrollers.some((other) => other !== el && other.contains(el)))
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 50)}`);
  });
  expect.soft(nested, label).toEqual([]);
}

test.describe("DM-05 chat push-navigation — admin", () => {
  test("opening a conversation on mobile fills the screen with a working back button", async ({ page }) => {
    await gotoAr(page, "/admin/chat");
    const firstRow = page.locator("div.divide-y button").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    // Selecting pushes ?c=<id> — the URL-addressable half of DM-05.
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });
    // The list is gone; the thread (message input) is what's on screen.
    await expect(page.locator("div.divide-y")).toBeHidden();
    await expect(page.locator('textarea[placeholder]')).toBeVisible({ timeout: 10_000 });
    await expectNoOverflow(page, "admin chat thread open");
    await expectNoNestedScroll(page, "admin chat thread open");

    // The in-UI back control closes it.
    await page.getByRole("button", { name: "رجوع" }).click();
    await expect(page).not.toHaveURL(/[?&]c=/);
    await expect(page.locator("div.divide-y")).toBeVisible();
  });

  test("browser Back closes the thread instead of leaving the tab", async ({ page }) => {
    await gotoAr(page, "/admin/chat");
    await page.locator("div.divide-y button").first().click();
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });

    await page.goBack();
    // `?lang=ar` (from gotoAr's own init) legitimately survives — only `c=`
    // should be gone.
    await expect(page).not.toHaveURL(/[?&]c=/, { timeout: 10_000 });
    await expect(page.locator("div.divide-y")).toBeVisible();
  });

  test("desktop keeps both columns regardless of selection", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await gotoAr(page, "/admin/chat");
    const list = page.locator("div.divide-y");
    await expect(list).toBeVisible();
    await list.locator("button").first().click();
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });
    // Unlike mobile, the list must NOT disappear once a conversation is picked.
    await expect(list).toBeVisible();
    await expect(page.locator('textarea[placeholder]')).toBeVisible();
  });
});

test.describe("DM-05 chat push-navigation — provider", () => {
  test.use({ storageState: PROVIDER_STATE });

  test("opening a conversation on mobile fills the screen with a working back button", async ({ page }) => {
    await gotoAr(page, "/provider/messages");
    const firstRow = page.locator("div.divide-y button").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });
    await expect(page.locator("div.divide-y")).toBeHidden();
    await expect(page.locator('textarea[placeholder]')).toBeVisible({ timeout: 10_000 });
    await expectNoOverflow(page, "provider chat thread open");
    await expectNoNestedScroll(page, "provider chat thread open");

    await page.getByRole("button", { name: "رجوع" }).click();
    await expect(page).not.toHaveURL(/[?&]c=/);
    await expect(page.locator("div.divide-y")).toBeVisible();
  });

  test("browser Back closes the thread instead of leaving the tab", async ({ page }) => {
    await gotoAr(page, "/provider/messages");
    await page.locator("div.divide-y button").first().click();
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]c=/, { timeout: 10_000 });
    await expect(page.locator("div.divide-y")).toBeVisible();
  });

  test("desktop keeps both columns regardless of selection", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await gotoAr(page, "/provider/messages");
    const list = page.locator("div.divide-y");
    await expect(list).toBeVisible();
    await list.locator("button").first().click();
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 10_000 });
    await expect(list).toBeVisible();
    await expect(page.locator('textarea[placeholder]')).toBeVisible();
  });
});

// ── DM-07: role-aware bottom nav for the dashboards ──────────────────────────
// Below md:, changing tabs used to always be hamburger → drawer → tap → close,
// for all 10 tabs alike. This checks the bar itself shows the right 4 tabs per
// role, badges agree with the sidebar's own numbers (nothing new invented),
// and — the thing Phase 2's sticky-bar fix would be silently undone by — the
// bar doesn't sit on top of the settings Save button.

test.describe("DM-07 bottom nav", () => {
  test("admin: shows exactly the 4 tabs, hidden on desktop", async ({ page }) => {
    await gotoAr(page, "/admin/overview");
    const nav = page.getByRole("navigation", { name: "تنقّل سريع" });
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(4);
    for (const href of ["/admin/overview", "/admin/leads", "/admin/chat", "/admin/changes"]) {
      await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(nav).toBeHidden();
  });

  test("admin: leads badge matches the sidebar's own count", async ({ page }) => {
    await gotoAr(page, "/admin/overview");
    await page.getByRole("button", { name: /القائمة|menu/i }).first().click();
    const sidebarBadgeText = await page.getByRole("dialog").locator('a[href="/admin/leads"]').innerText();
    // useDialogA11y makes everything outside an open dialog `inert` (correct
    // a11y behavior) — the bottom nav is excluded from the accessibility tree
    // while the drawer is open, so `getByRole` can't see it until it's closed.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    const bottomBadgeText = await page.getByRole("navigation", { name: "تنقّل سريع" }).locator('a[href="/admin/leads"]').innerText();
    // Compare the trailing NUMBER only, not the raw text: BottomNav.tsx and
    // SidebarNav.tsx render icon/label/badge in a different DOM order (badge
    // before the label vs. after it) — cosmetic, not a bug — so a full-string
    // comparison sees a false mismatch even when both show the same count.
    const digits = (s: string) => s.match(/\d+/)?.[0] ?? "";
    expect(digits(bottomBadgeText)).toBe(digits(sidebarBadgeText));
  });

  test("does not cover the settings Save button", async ({ page }) => {
    await gotoAr(page, "/admin/settings");
    await page.evaluate(() => {
      const main = document.querySelector("#main");
      if (main) main.scrollTop = main.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(400);

    const save = page.getByRole("button", { name: /حفظ/ }).last();
    const nav = page.getByRole("navigation", { name: "تنقّل سريع" });
    await expect(save).toBeVisible();
    await expect(nav).toBeVisible();
    const [saveBox, navBox] = await Promise.all([save.boundingBox(), nav.boundingBox()]);
    expect(saveBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // The button's bottom edge must sit at or above the bar's top edge —
    // this is the plain (no notch) case; DM-04's own tests already cover the
    // notched case via the --safe-bottom override.
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  });

  test("public site bottom nav is unaffected by the dashboard rollout", async ({ page }) => {
    await gotoAr(page, "/");
    const nav = page.getByRole("navigation", { name: "المزيد" });
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(4);
    await expect(nav.locator('a[href="/saved"]')).toBeVisible();
  });
});

test.describe("DM-07 bottom nav — provider", () => {
  test.use({ storageState: PROVIDER_STATE });

  test("shows exactly the 4 tabs, hidden on desktop", async ({ page }) => {
    await gotoAr(page, "/provider/overview");
    const nav = page.getByRole("navigation", { name: "تنقّل سريع" });
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(4);
    for (const href of ["/provider/overview", "/provider/leads", "/provider/messages", "/provider/availability"]) {
      await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(nav).toBeHidden();
  });
});

// ── DM-15: drawer swipe-to-close ──────────────────────────────────────────
test("DM-15: drawer closes via swipe gesture (RTL — swipes right)", async ({ page }) => {
  await gotoAr(page, "/admin/overview");
  await page.getByRole("button", { name: /القائمة|menu/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const panel = dialog.locator(":scope > div").nth(1);
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (!box) throw new Error("drawer panel has no box");

  // RTL: the drawer is pinned to the right edge (`start-0` resolves to
  // `right: 0`), so swiping RIGHT — toward the edge it's attached to — is
  // what closes it.
  const y = box.y + 40;
  const startX = box.x + box.width / 2;
  const endX = startX + box.width * 0.6; // past the 30% close threshold

  const touch = (x: number) => ({ touches: [{ identifier: 0, clientX: x, clientY: y, pageX: x, pageY: y }] });
  await panel.dispatchEvent("touchstart", touch(startX));
  await panel.dispatchEvent("touchmove", touch(startX + (endX - startX) * 0.5));
  await panel.dispatchEvent("touchmove", touch(endX));
  await panel.dispatchEvent("touchend", { changedTouches: touch(endX).touches });

  await expect(dialog).toBeHidden({ timeout: 3000 });
});

test("DM-15: a short swipe springs back instead of closing", async ({ page }) => {
  await gotoAr(page, "/admin/overview");
  await page.getByRole("button", { name: /القائمة|menu/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const panel = dialog.locator(":scope > div").nth(1);
  const box = await panel.boundingBox();
  if (!box) throw new Error("drawer panel has no box");

  const y = box.y + 40;
  const startX = box.x + box.width / 2;
  const endX = startX + box.width * 0.1; // under the 30% threshold

  const touch = (x: number) => ({ touches: [{ identifier: 0, clientX: x, clientY: y, pageX: x, pageY: y }] });
  await panel.dispatchEvent("touchstart", touch(startX));
  await panel.dispatchEvent("touchmove", touch(endX));
  await panel.dispatchEvent("touchend", { changedTouches: touch(endX).touches });

  // Still open — and still usable, not stuck at some dragged-open offset.
  await page.waitForTimeout(400); // past the 220ms spring-back
  await expect(dialog).toBeVisible();
  const linkInDrawer = panel.locator('a[href="/admin/leads"]');
  await expect(linkInDrawer).toBeVisible();
});

// ── DM-16: topbar refresh button ──────────────────────────────────────────
test("DM-16: refresh button actually refetches the current tab's data", async ({ page }) => {
  await gotoAr(page, "/admin/leads");
  let requestCount = 0;
  page.on("request", (req) => { if (req.url().includes("/admin/leads")) requestCount++; });
  await page.waitForTimeout(500);
  const before = requestCount;

  const button = page.getByRole("button", { name: "تحديث" });
  await expect(button).toBeVisible();
  await button.click();

  // Visual feedback: the icon spins immediately...
  await expect(button.locator(".animate-spin")).toBeVisible();
  // ...and a real network request for this tab's data actually went out —
  // proof this isn't just a decorative spin with nothing behind it.
  await expect.poll(() => requestCount, { timeout: 3000 }).toBeGreaterThan(before);
  // The spin clears and an accessible confirmation lands for screen-reader
  // users who can't see the animation.
  await expect(button.locator(".animate-spin")).toBeHidden({ timeout: 2000 });
  // Scoped by text, not just role="status" — LeadsPage's own "N طلب" count
  // is a second status region on this same route.
  await expect(page.getByText("تم التحديث")).toBeAttached();
});
