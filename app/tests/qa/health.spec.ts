import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { ADMIN_STATE, PROVIDER_STATE } from "../authState";
import { ROUTES, VIEWPORTS, LOCALES, type Locale } from "./routes";

// CTO QA sweep — Pass 1 (health).
//
// Complements tests/ui-audit.spec.ts, which measures LAYOUT (overflow, touch
// targets, axe, pixel diffs). This pass measures whether the page actually
// WORKS: does it throw, does any request fail, does the wrong language leak
// through, is the document direction right, did the crash net catch anything.
//
// Every check is expect.soft so one route's failure never hides the next
// route's, and the console output names the exact offender.

const LOCALE_STORAGE_KEY = "al-assema-locale";
const STATE_FOR = { admin: ADMIN_STATE, provider: PROVIDER_STATE } as const;

/** Console noise that is expected and not a defect. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Service ?Worker/i,
  /favicon/i,
  /React Router Future Flag/i,
  // The runner has no outbound internet, so every Google-hosted font 404s and
  // the browser logs it. Environmental, not a defect — though it is worth
  // knowing that Cairo (the ARABIC face, i.e. the default locale's body font)
  // is fetched from gstatic at runtime, so a visitor who cannot reach Google
  // gets a fallback face rather than the designed one.
  /fonts\.(gstatic|googleapis)\.com/i,
  /Failed to load resource.*404/i,
];

/** Requests that are allowed to fail in a local dev environment. */
const IGNORED_REQUEST = [
  /\/favicon/i,
  /sw\.js/i,
  /\.map$/i,
  /googleapis|gstatic|unsplash|placeholder/i,
];

type Collected = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

function collect(page: Page): Collected {
  const c: Collected = { consoleErrors: [], pageErrors: [], failedRequests: [] };

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    // Only errors are failures; warnings are recorded for the report but
    // prefixed so the summary can separate them.
    c.consoleErrors.push(`[${msg.type()}] ${text.slice(0, 300)}`);
  });

  page.on("pageerror", (err) => {
    c.pageErrors.push(`${err.name}: ${err.message}`.slice(0, 300));
  });

  page.on("response", (res) => {
    const url = res.url();
    if (res.status() < 400) return;
    if (IGNORED_REQUEST.some((re) => re.test(url))) return;
    c.failedRequests.push(`${res.status()} ${res.request().method()} ${url.replace("http://localhost:5173", "").replace("http://localhost:3000", "")}`);
  });

  return c;
}

async function gotoLocalized(page: Page, path: string, locale: Locale) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [LOCALE_STORAGE_KEY, locale] as [string, string],
  );
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page
    .waitForFunction(
      () => {
        // Node count alone is NOT enough: a lazy route's Suspense fallback is a
        // bare spinner whose node count is trivially stable, so the loop used to
        // exit while the chunk was still downloading and every text-based check
        // below measured an empty page (seen on /provider/settings). Require
        // real text on screen first, THEN wait for the tree to stop growing.
        const w = window as unknown as { __n?: number; __ticks?: number };
        if (document.body.innerText.trim().length < 20) return false;
        const n = document.getElementsByTagName("*").length;
        w.__ticks = n === w.__n ? (w.__ticks ?? 0) + 1 : 0;
        w.__n = n;
        return (w.__ticks ?? 0) >= 2;
      },
      undefined,
      { polling: 250, timeout: 8000 },
    )
    .catch(() => {});
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      const caseName = `${route.name} · ${viewport.name} · ${locale}`;

      test.describe(caseName, () => {
        test.use(route.auth ? { storageState: STATE_FOR[route.auth] } : {});

        test(caseName, async ({ page }) => {
          const errs = collect(page);
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await gotoLocalized(page, route.path, locale);

          await test.step("page rendered, crash net not triggered", async () => {
            // CrashScreen / ErrorPage signatures — both render a reload button
            // and neither renders the app chrome.
            const crashed = await page.evaluate(() => {
              const body = document.body.innerText;
              return /Something went wrong|حصل خطأ غير متوقع/.test(body);
            });
            expect.soft(crashed, "ErrorBoundary/CrashScreen rendered").toBe(false);

            const bodyText = (await page.locator("body").innerText()).trim();
            expect.soft(bodyText.length, "page body is empty (blank render)").toBeGreaterThan(20);
          });

          await test.step("document direction and lang match locale", async () => {
            const html = await page.evaluate(() => ({
              dir: document.documentElement.getAttribute("dir"),
              lang: document.documentElement.getAttribute("lang"),
            }));
            expect.soft(html.dir, `<html dir> for ${locale}`).toBe(locale === "ar" ? "rtl" : "ltr");
            expect.soft(html.lang, `<html lang> for ${locale}`).toBe(locale);
          });

          await test.step("no wrong-language text leaking through the chrome", async () => {
            // Scoped to <nav> and <footer> ON PURPOSE.
            //
            // The obvious version — "no Arabic anywhere while locale=en" — is
            // unusable against a real database: every customer name, company
            // name, lead service and review body a seeded Arabic-market site
            // contains is legitimately Arabic in both locales, and the check
            // reported all of them. That is user CONTENT, not a missed
            // translation, and no DOM-level heuristic separates the two.
            //
            // Nav and footer are pure chrome — every string in them comes from
            // t() — so Arabic there is a genuine i18n miss and nothing else.
            // Missing translations are covered far more completely by the
            // static guarantees anyway: `t()` is typed to StringKey so tsc
            // rejects an unknown key, and the en/ar dictionaries are verified
            // key-for-key identical (1360 each).
            if (locale !== "en") return;
            const arabic = await page.evaluate(() => {
              const bad: string[] = [];
              for (const root of Array.from(document.querySelectorAll("nav, footer"))) {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let node: Node | null;
                while ((node = walker.nextNode())) {
                  const text = node.textContent?.trim();
                  if (!text || !/[؀-ۿ]/.test(text)) continue;
                  const parent = node.parentElement;
                  if (!parent) continue;
                  const style = getComputedStyle(parent);
                  if (style.display === "none" || style.visibility === "hidden") continue;
                  // The language toggle deliberately names the OTHER language.
                  if (parent.closest("[aria-label*='language' i], [title*='language' i]")) continue;
                  if (parent.getAttribute("lang") === "ar") continue;
                  bad.push(`${parent.tagName.toLowerCase()}.${(parent.getAttribute("class") ?? "").slice(0, 40)} :: ${text.slice(0, 60)}`);
                }
              }
              return [...new Set(bad)];
            });
            expect.soft(arabic, "Arabic UI text in nav/footer while locale=en").toEqual([]);
          });

          await test.step("no raw placeholder values rendered", async () => {
            const junk = await page.evaluate(() => {
              const body = document.body.innerText;
              const hits: string[] = [];
              for (const pattern of ["undefined", "NaN", "[object Object]", "null,", "Invalid Date"]) {
                if (body.includes(pattern)) {
                  const i = body.indexOf(pattern);
                  hits.push(`${pattern} → …${body.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ")}…`);
                }
              }
              return hits;
            });
            expect.soft(junk, "raw undefined/NaN/[object Object] in visible text").toEqual([]);
          });

          await test.step("no uncaught JS errors", async () => {
            expect.soft(errs.pageErrors, "uncaught exceptions").toEqual([]);
          });

          await test.step("no failed network requests", async () => {
            expect.soft(errs.failedRequests, "requests returning >= 400").toEqual([]);
          });

          await test.step("no console errors", async () => {
            const hard = errs.consoleErrors.filter((e) => e.startsWith("[error]"));
            expect.soft(hard, "console.error output").toEqual([]);
          });
        });
      });
    }
  }
}
