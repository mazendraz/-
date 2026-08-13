import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STATE, PROVIDER_STATE } from "../authState";
import { ROUTES, LOCALES, type Locale } from "./routes";

// CTO QA sweep — Pass 2 (interaction).
//
// Pass 1 (health.spec.ts) only LOADS each page. This pass clicks every
// interactive control on it and asserts the app survives: no uncaught throw,
// no console.error, no 5xx, no crash screen, and — the failure mode that
// matters most on a phone — the click actually did something observable
// (navigated, opened a dialog, toggled state, or changed the DOM).
//
// Destructive controls are identified and REPORTED but not clicked: this runs
// against the real local database, and a sweep that deletes the seed data
// would make every subsequent case meaningless.

const LOCALE_STORAGE_KEY = "al-assema-locale";
const STATE_FOR = { admin: ADMIN_STATE, provider: PROVIDER_STATE } as const;

/** Controls we identify but never click — irreversible or session-ending. */
const DESTRUCTIVE = /delete|remove|حذف|إزالة|امسح|logout|log out|sign out|تسجيل الخروج|خروج|deactivate|تعطيل|reject|رفض|approve|قبول|موافقة|suspend|إيقاف|publish|نشر|send|إرسال|submit|إرسال الطلب|save|حفظ|pay|دفع|confirm|تأكيد/i;

/** Links that leave the app entirely. */
function isExternal(href: string | null): boolean {
  if (!href) return false;
  return /^(https?:\/\/(?!localhost)|mailto:|tel:|wa\.me|whatsapp:)/i.test(href);
}

const IGNORED_CONSOLE = [
  /Download the React DevTools/i, /\[vite\]/i, /Service ?Worker/i, /favicon/i, /React Router Future Flag/i,
  // No outbound internet in the runner, so the Google-hosted fonts 404 and the
  // browser logs it. Environmental — see the same note in health.spec.ts.
  /fonts\.(gstatic|googleapis)\.com/i,
  /Failed to load resource.*404/i,
];

type Problem = { control: string; kind: string; detail: string };

async function gotoLocalized(page: Page, path: string, locale: Locale) {
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [LOCALE_STORAGE_KEY, locale] as [string, string]);
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(700);
  await page
    .waitForFunction(
      () => {
        // Text-first, then stability — a lazy route's Suspense spinner has a
        // trivially stable node count (see health.spec.ts's note).
        const w = window as unknown as { __n?: number; __ticks?: number };
        if (document.body.innerText.trim().length < 20) return false;
        const n = document.getElementsByTagName("*").length;
        w.__ticks = n === w.__n ? (w.__ticks ?? 0) + 1 : 0;
        w.__n = n;
        return (w.__ticks ?? 0) >= 2;
      },
      undefined,
      { polling: 250, timeout: 6000 },
    )
    .catch(() => {});
}

/**
 * Stable-ish descriptors for every visible, enabled control on the page.
 * Returned as index-into-a-fresh-query rather than as handles, because each
 * click can re-render the tree and invalidate every handle we held.
 */
async function inventory(page: Page) {
  return page.evaluate(() => {
    const SELECTOR = 'a[href], button, [role="button"], [role="tab"], [role="switch"], summary, input[type="checkbox"], input[type="radio"], select';
    const out: { idx: number; tag: string; text: string; href: string | null; disabled: boolean; testId: string | null }[] = [];
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el, idx) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // The screen-reader-only idiom (Tailwind `sr-only`): a 1×1 clipped
      // element that only becomes a real target on keyboard focus — the
      // SkipLink, and the hidden <input> behind every styled toggle switch.
      // Clicking it always times out, which is correct behaviour, not a defect.
      if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") return;
      const label =
        (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 45) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("name") ||
        "";
      out.push({
        idx,
        tag: el.tagName.toLowerCase(),
        text: label,
        href: el.getAttribute("href"),
        disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
        testId: el.getAttribute("data-testid"),
      });
    });
    return out;
  });
}

for (const route of ROUTES) {
  for (const locale of LOCALES) {
    // Mobile is where broken controls actually hurt (bottom bars, drawers,
    // sticky CTAs) and desktop is where the widest layouts live. Tablet adds
    // no distinct control set, so this pass runs the two extremes.
    for (const viewport of [
      { name: "mobile", width: 390, height: 844 },
      { name: "desktop", width: 1366, height: 900 },
    ]) {
      const caseName = `click-all · ${route.name} · ${viewport.name} · ${locale}`;

      test.describe(caseName, () => {
        test.use(route.auth ? { storageState: STATE_FOR[route.auth] } : {});

        test(caseName, async ({ page }) => {
          const problems: Problem[] = [];
          const skipped: string[] = [];
          let clicked = 0;

          const pageErrors: string[] = [];
          const consoleErrors: string[] = [];
          const serverErrors: string[] = [];
          page.on("pageerror", (e) => pageErrors.push(`${e.name}: ${e.message}`.slice(0, 200)));
          page.on("console", (m) => {
            if (m.type() !== "error") return;
            const t = m.text();
            if (IGNORED_CONSOLE.some((re) => re.test(t))) return;
            consoleErrors.push(t.slice(0, 200));
          });
          page.on("response", (r) => {
            if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
          });

          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await gotoLocalized(page, route.path, locale);

          const controls = await inventory(page);
          expect.soft(controls.length, "page has zero interactive controls").toBeGreaterThan(0);

          const SELECTOR = 'a[href], button, [role="button"], [role="tab"], [role="switch"], summary, input[type="checkbox"], input[type="radio"], select';

          for (const control of controls) {
            const label = `${control.tag}"${control.text || control.href || control.testId || "?"}"`;

            if (control.disabled) { skipped.push(`${label} (disabled)`); continue; }
            if (isExternal(control.href)) { skipped.push(`${label} (external)`); continue; }
            if (DESTRUCTIVE.test(control.text) || (control.testId && DESTRUCTIVE.test(control.testId))) {
              skipped.push(`${label} (destructive — not clicked)`);
              continue;
            }
            if (control.tag === "select") { skipped.push(`${label} (native select)`); continue; }

            const beforeErrors = pageErrors.length + consoleErrors.length + serverErrors.length;

            // Re-resolve by index against a freshly-queried list: the previous
            // click may have re-rendered everything.
            const el = page.locator(SELECTOR).nth(control.idx);

            let visible = false;
            try { visible = await el.isVisible({ timeout: 500 }); } catch { /* detached */ }
            if (!visible) { skipped.push(`${label} (gone after earlier click)`); continue; }

            // Re-check enabled state HERE, not just at inventory time: an
            // earlier click can put the page into a busy state that correctly
            // disables other controls (the profile editor disables its sync and
            // close buttons while `saving`). Clicking those times out, which is
            // the button working, not failing.
            let enabled = false;
            try { enabled = await el.isEnabled({ timeout: 500 }); } catch { /* detached */ }
            if (!enabled) { skipped.push(`${label} (disabled by an earlier click)`); continue; }

            const before = await page.evaluate(() => ({
              url: location.pathname + location.search,
              nodes: document.getElementsByTagName("*").length,
              text: document.body.innerText.length,
              dialogs: document.querySelectorAll('[role="dialog"], dialog[open]').length,
              scrollY: Math.round(window.scrollY),
            }));

            try {
              await el.click({ timeout: 4000, trial: false });
              clicked++;
            } catch {
              // Playwright scrolls the MINIMUM distance to bring a control into
              // view, which parks it flush against the viewport edge — directly
              // under the fixed TopNav (z-50) or BottomNav (z-40). The trace
              // then blames "<nav …> subtree intercepts pointer events" for a
              // control a real user reaches by scrolling two more pixels.
              // Centre it and try once more; only a control that STILL can't be
              // clicked is a genuine finding.
              try {
                await el.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }));
                await page.waitForTimeout(150);
                await el.click({ timeout: 4000 });
                clicked++;
              } catch (e2) {
                problems.push({
                  control: label,
                  kind: "not-clickable",
                  detail: String(e2).split("\n")[0].slice(0, 160),
                });
                continue;
              }
            }

            await page.waitForTimeout(350);

            // Did the crash net catch anything?
            const crashed = await page.evaluate(() => /Something went wrong|حصل خطأ غير متوقع/.test(document.body.innerText));
            if (crashed) {
              problems.push({ control: label, kind: "CRASH", detail: "ErrorBoundary/CrashScreen rendered after click" });
              await gotoLocalized(page, route.path, locale);
              continue;
            }

            const afterErrors = pageErrors.length + consoleErrors.length + serverErrors.length;
            if (afterErrors > beforeErrors) {
              const fresh = [...pageErrors, ...consoleErrors, ...serverErrors].slice(beforeErrors);
              problems.push({ control: label, kind: "error-on-click", detail: fresh.join(" | ").slice(0, 220) });
            }

            const after = await page.evaluate(() => ({
              url: location.pathname + location.search,
              nodes: document.getElementsByTagName("*").length,
              text: document.body.innerText.length,
              dialogs: document.querySelectorAll('[role="dialog"], dialog[open]').length,
              scrollY: Math.round(window.scrollY),
            }));

            const didSomething =
              after.url !== before.url ||
              after.dialogs !== before.dialogs ||
              Math.abs(after.nodes - before.nodes) > 2 ||
              Math.abs(after.text - before.text) > 2;

            // A control that produces no observable change is a dead button —
            // reported, but at lower confidence than a crash, since a toggle
            // can legitimately change only a class.
            //
            // Two shapes are expected-inert and must NOT be reported, or the
            // real dead buttons drown in them:
            //   • a link to the page you are already on (the logo on /, the
            //     active nav item) — correctly a no-op
            //   • an in-page anchor / scroll button, which moves the viewport
            //     and changes no DOM the probe can see
            const hrefPath = control.href?.split("#")[0] ?? "";
            const selfLink = control.href != null && (control.href.startsWith("#") || hrefPath === "" || hrefPath === before.url.split("?")[0]);
            const scrolled = after.scrollY !== before.scrollY;
            if (!didSomething && !selfLink && !scrolled) {
              problems.push({ control: label, kind: "no-visible-effect", detail: `url/dialogs/nodes/text all unchanged` });
            }

            // Return to a known state: close any dialog, then re-navigate if
            // the click took us elsewhere.
            if (after.dialogs > before.dialogs) {
              await page.keyboard.press("Escape");
              await page.waitForTimeout(200);
              const stillOpen = await page.evaluate(() => document.querySelectorAll('[role="dialog"], dialog[open]').length);
              if (stillOpen > before.dialogs) {
                // Escape-to-close is NOT universal here, by design: the
                // offering/project editors pass `closeOnEscape: false`
                // (useDialogA11y) because a stray Escape would discard a
                // half-filled form and an uploaded image. Those dialogs are
                // correct — they keep the focus trap, the inerting and the
                // scroll lock, and are dismissed by their own Cancel/×.
                //
                // So the property worth asserting is not "Escape closes it" but
                // "the user is not trapped": there must be a visible way out.
                const hasExit = await page.evaluate(() => {
                  const dialog = document.querySelector('[role="dialog"], dialog[open]');
                  if (!dialog) return true;
                  const CLOSE = /close|cancel|dismiss|back|إغلاق|إلغاء|رجوع|تراجع/i;
                  return Array.from(dialog.querySelectorAll("button, [role='button']")).some((el) => {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return false;
                    const name = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`;
                    return CLOSE.test(name);
                  });
                });
                if (!hasExit) {
                  problems.push({
                    control: label,
                    kind: "dialog-inescapable",
                    detail: "Escape does not close it AND it has no visible close/cancel control",
                  });
                }
                await gotoLocalized(page, route.path, locale);
                continue;
              }
            }
            if (after.url !== before.url) {
              await gotoLocalized(page, route.path, locale);
            }
          }

          console.log(
            `\n=== ${caseName} ===\n` +
              `controls=${controls.length} clicked=${clicked} skipped=${skipped.length} problems=${problems.length}\n` +
              (problems.length ? problems.map((p) => `  [${p.kind}] ${p.control} :: ${p.detail}`).join("\n") : "  (clean)") +
              (skipped.length ? `\n  skipped: ${skipped.slice(0, 12).join(", ")}` : ""),
          );

          const blocking = problems.filter((p) => p.kind !== "no-visible-effect");
          expect.soft(blocking.map((p) => `[${p.kind}] ${p.control} :: ${p.detail}`), "controls that errored or crashed").toEqual([]);
          expect
            .soft(problems.filter((p) => p.kind === "no-visible-effect").map((p) => p.control), "controls with no observable effect")
            .toEqual([]);
        });
      });
    }
  }
}
