import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_STATE, PROVIDER_STATE } from "./authState";

// Phase 0 of the UI/UX audit safety net (FIX-PROMPT.md, UI-UX-AUDIT.md).
// This suite is NOT meant to be green right now — it exists to correctly FAIL
// on the problems the audit already found (overflow on /saved, /requests,
// /messages; various axe violations; etc.), so later phases can't silently
// regress once they fix them. See playwright.ui-audit.config.ts for the
// runner setup (separate from playwright.config.ts's e2e/ suite) and
// tests/__baseline__/ for the screenshot baselines.
//
// Phase 0 of the DASHBOARD audit (DASHBOARD-MOBILE-AUDIT.md § DM-01) extended
// it to the real /admin and /provider tabs. Those two routes were previously
// listed but unauthenticated, so every dashboard baseline was a screenshot of
// a login form and the four assertions below measured nothing. They now run
// against the actual dashboards and are expected to fail on DM-06 (touch
// targets), DM-09/DM-10 (overflow and clipping) and DM-18.

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

/** Which saved session a route needs, if any. */
type Auth = "admin" | "provider" | undefined;
const STATE_FOR: Record<"admin" | "provider", string> = {
  admin: ADMIN_STATE,
  provider: PROVIDER_STATE,
};

const ROUTES: { name: string; path: string; auth?: Auth }[] = [
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

  // The login screen itself is still worth measuring — it's the first thing
  // both roles see on a phone — so it keeps a slot, just no longer under the
  // names "admin"/"provider" (which now mean the real dashboards).
  { name: "admin-login", path: "/admin" },

  // ── Admin dashboard (real nested routes, see AdminLayout.tsx) ──
  { name: "admin-overview", path: "/admin/overview", auth: "admin" },
  { name: "admin-leads", path: "/admin/leads", auth: "admin" },
  { name: "admin-companies", path: "/admin/companies", auth: "admin" },
  { name: "admin-services", path: "/admin/services", auth: "admin" },
  { name: "admin-reviews", path: "/admin/reviews", auth: "admin" },
  { name: "admin-changes", path: "/admin/changes", auth: "admin" },
  { name: "admin-chat", path: "/admin/chat", auth: "admin" },
  { name: "admin-team", path: "/admin/team", auth: "admin" },
  { name: "admin-settings", path: "/admin/settings", auth: "admin" },

  // ── Provider dashboard (real nested routes since DM-02) ──
  { name: "provider-overview", path: "/provider/overview", auth: "provider" },
  { name: "provider-leads", path: "/provider/leads", auth: "provider" },
  { name: "provider-messages", path: "/provider/messages", auth: "provider" },
  { name: "provider-projects", path: "/provider/projects", auth: "provider" },
  { name: "provider-reviews", path: "/provider/reviews", auth: "provider" },
  { name: "provider-analytics", path: "/provider/analytics", auth: "provider" },
  { name: "provider-availability", path: "/provider/availability", auth: "provider" },
  { name: "provider-profile", path: "/provider/profile", auth: "provider" },
  { name: "provider-settings", path: "/provider/settings", auth: "provider" },
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
  // connection alive that never goes idle.
  //
  // A fixed 2s window was enough for the public pages but NOT for the
  // dashboards, which fetch their lists after mount: measured on 2026-08-03,
  // `admin-services` reported 0 undersized controls on one run and 11 on the
  // next with identical code, purely because the category rows had or hadn't
  // arrived. A count that swings with the network makes before/after
  // comparison worthless, which is the entire point of this suite.
  //
  // So: settle briefly, then wait for the DOM to stop growing — two identical
  // node counts 250ms apart — before measuring anything.
  await page.waitForTimeout(1000);
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { __lastCount?: number; __stableTicks?: number };
        const n = document.getElementsByTagName("*").length;
        w.__stableTicks = n === w.__lastCount ? (w.__stableTicks ?? 0) + 1 : 0;
        w.__lastCount = n;
        return (w.__stableTicks ?? 0) >= 2;
      },
      undefined,
      { polling: 250, timeout: 8000 },
    )
    // A page that genuinely never settles (an animated skeleton that adds and
    // removes nodes forever) shouldn't fail the whole case — fall through and
    // measure what's there, exactly as the old fixed wait did.
    .catch(() => {});
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      const caseName = `${route.name}-${viewport.name}-${locale}`;

      test.describe(caseName, () => {
        // Applies the saved session for routes that need one. Public routes
        // pass `undefined`, which Playwright reads as "no stored state" — the
        // same anonymous context the suite has always used for them.
        test.use(route.auth ? { storageState: STATE_FOR[route.auth] } : {});

      test(caseName, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoLocalized(page, route.path, locale);

        await test.step("no horizontal overflow", async () => {
          const dims = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          if (dims.scrollWidth > dims.clientWidth + 1) {
            const wide = await page.evaluate(() => {
              const cw = document.documentElement.clientWidth;
              const bad: string[] = [];
              for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
                const r = el.getBoundingClientRect();
                // RTL: a stray element can push the LEFT edge negative
                // instead of the right edge past the viewport — check both.
                if (r.right > cw + 2 || r.left < -2) {
                  bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 60)} left=${Math.round(r.left)} right=${Math.round(r.right)} text="${(el.textContent ?? "").slice(0, 50)}"`);
                }
              }
              return bad.slice(0, 8);
            });
            console.log(`OVERFLOW on ${caseName}:`, JSON.stringify(wide, null, 2));
          }
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
              // Skip the screen-reader-only idiom (Tailwind `sr-only`): a 1×1
              // clipped element that is deliberately not a touch target — the
              // SkipLink, and the real <input> behind every styled toggle
              // switch, where the visible <label> is what gets tapped.
              // Without this, EVERY dashboard route reports the same two
              // bogus 1x1 offenders, and a check that always fails the same
              // way is a check people learn to ignore.
              if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") continue;
              // A checkbox/radio inside a label is tapped via the LABEL, which
              // is the actual target under WCAG 2.5.5 — a 16px box inside a
              // 44px row is correct, and inflating the box itself would be a
              // visual regression, not a fix. Only exempt it when the wrapping
              // label really is big enough.
              const label = el.closest("label");
              if (label && label !== el) {
                const lr = label.getBoundingClientRect();
                if (lr.width >= 44 && lr.height >= 44) continue;
              }
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

        // DM-05: on a phone, a scrollable region nested inside another
        // scrollable region is the broken-master-detail signature — you have
        // to scroll past a list that scrolls internally to reach a thread that
        // also scrolls internally (admin/ChatTab.tsx, components/ProviderChat.tsx
        // below their breakpoints). Phone width only: the same nesting is a
        // legitimate two-pane layout on desktop.
        if (viewport.width <= 430) {
          await test.step("no nested scroll containers", async () => {
            const nested = await page.evaluate(() => {
              const scrollers = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
                const s = getComputedStyle(el);
                const scrollable = /auto|scroll/.test(s.overflowY);
                return scrollable && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0;
              });
              const label = (el: HTMLElement) =>
                `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 50)}`;
              return scrollers
                .filter((el) => scrollers.some((other) => other !== el && other.contains(el)))
                .map((el) => label(el));
            });
            expect.soft(nested).toEqual([]);
          });
        }

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
      });
    }
  }
}
