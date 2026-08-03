import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 0 of the UI/UX audit safety net (FIX-PROMPT.md, UI-UX-AUDIT.md).
// This suite is NOT meant to be green right now — it exists to correctly FAIL
// on the problems the audit already found (overflow on /saved, /requests,
// /messages; various axe violations; etc.), so later phases can't silently
// regress once they fix them. See playwright.ui-audit.config.ts for the
// runner setup (separate from playwright.config.ts's e2e/ suite) and
// tests/__baseline__/ for the screenshot baselines.

type Locale = "en" | "ar";

// Matches the real localStorage key/format LocaleContext.tsx reads on boot —
// NOT JSON-encoded, a plain "ar"/"en" string under "al-assema-locale".
const LOCALE_STORAGE_KEY = "al-assema-locale";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1366", width: 1366, height: 900 },
];

const LOCALES: Locale[] = ["ar", "en"];

// Real seeded records from the local dev DB (docker-compose.dev.yml /
// api/.env pointed at localhost:5433) — chosen so the dynamic routes render
// actual content instead of an empty/error state.
const REAL_COMPANY_SLUG = "nextech-living";
const REAL_CATEGORY_SLUG = "construction";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "services", path: "/services" },
  { name: "service-category", path: `/services/${REAL_CATEGORY_SLUG}` },
  { name: "companies", path: "/companies" },
  { name: "company-profile", path: `/companies/${REAL_COMPANY_SLUG}` },
  { name: "guided-start", path: "/start" },
  { name: "saved", path: "/saved" },
  { name: "my-requests", path: "/requests" },
  { name: "messages", path: "/messages" },
  { name: "request-form", path: "/request" },
  { name: "terms", path: "/terms" },
  { name: "privacy", path: "/privacy" },
  { name: "not-found", path: "/this-route-does-not-exist" },
  // No auth session is created for these two — RequireAuth (AuthGate.tsx)
  // renders a real, standalone LoginScreen when unauthenticated, which is a
  // perfectly valid thing for this suite to check (overflow/axe/touch
  // targets/font size/screenshot all still apply to it).
  { name: "admin", path: "/admin" },
  { name: "provider", path: "/provider" },
];

async function gotoLocalized(page: Page, path: string, locale: Locale) {
  await page.addInitScript(
    ([localeKey, localeValue, savedKey, savedValue]) => {
      window.localStorage.setItem(localeKey, localeValue);
      // A fresh anonymous session has zero saved/requested/unread items, so
      // PersonalTabs (Saved/Requests/Messages) renders with no count badges
      // and stays narrow — RESP-01's overflow only shows up once a badge
      // widens it (confirmed: seeding this alone reproduces the /saved
      // overflow; requestCount/unread counts come from the real API and
      // aren't reproducible client-side without creating real lead data, so
      // this is a partial but honest repro, not a full one).
      window.localStorage.setItem(savedKey, savedValue);
    },
    [LOCALE_STORAGE_KEY, locale, "al-assema-saved", JSON.stringify(["seed-a", "seed-b", "seed-c"])] as [
      string, string, string, string
    ]
  );
  await page.goto(path, { waitUntil: "load" });
  // Not networkidle: /messages and similar keep a long-poll/websocket-ish
  // connection alive that never goes idle. A fixed settle window after
  // "load" is what the manual verification during Phase 10 used successfully.
  await page.waitForTimeout(2000);
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      const caseName = `${route.name}-${viewport.name}-${locale}`;

      test(caseName, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoLocalized(page, route.path, locale);

        await test.step("no horizontal overflow", async () => {
          const dims = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect
            .soft(dims.scrollWidth, `scrollWidth=${dims.scrollWidth} clientWidth=${dims.clientWidth}`)
            .toBeLessThanOrEqual(dims.clientWidth + 1);
        });

        await test.step("axe: no serious/critical violations", async () => {
          const results = await new AxeBuilder({ page }).analyze();
          const serious = results.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`);
          expect.soft(serious).toEqual([]);
        });

        await test.step("touch targets >= 44x44px", async () => {
          const tooSmall = await page.evaluate(() => {
            const els = Array.from(
              document.querySelectorAll('a, button, [role="button"], input, select')
            );
            const bad: string[] = [];
            for (const el of els) {
              const style = getComputedStyle(el);
              if (style.display === "none" || style.visibility === "hidden") continue;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) continue; // not actually rendered
              if (rect.width < 44 || rect.height < 44) {
                const cls = (el.getAttribute("class") ?? "").slice(0, 60);
                bad.push(`${el.tagName.toLowerCase()}.${cls} = ${Math.round(rect.width)}x${Math.round(rect.height)}`);
              }
            }
            return bad;
          });
          expect.soft(tooSmall).toEqual([]);
        });

        await test.step("no text smaller than 12px", async () => {
          const tooSmall = await page.evaluate(() => {
            const bad = new Set<string>();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              if (!node.textContent?.trim()) continue;
              const parent = node.parentElement;
              if (!parent) continue;
              const style = getComputedStyle(parent);
              if (style.display === "none" || style.visibility === "hidden") continue;
              const size = parseFloat(style.fontSize);
              if (size < 12) {
                const cls = (parent.getAttribute("class") ?? "").slice(0, 60);
                bad.add(`${parent.tagName.toLowerCase()}.${cls} = ${size}px "${node.textContent.trim().slice(0, 30)}"`);
              }
            }
            return [...bad];
          });
          expect.soft(tooSmall).toEqual([]);
        });

        await test.step("screenshot diff vs baseline", async () => {
          // Longer-than-default stability timeout: several routes (home,
          // services, companies, ...) lazy-load images via IntersectionObserver,
          // and a fullPage screenshot's scroll-to-capture can trigger those
          // loads mid-shot, so the first couple of stability checks see real
          // pixel movement that has nothing to do with CSS animation.
          await expect.soft(page).toHaveScreenshot(`${caseName}.png`, {
            fullPage: true,
            animations: "disabled",
            timeout: 30_000,
          });
        });
      });
    }
  }
}
