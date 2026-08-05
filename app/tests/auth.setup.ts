import { test as setup, expect } from "@playwright/test";
import { ADMIN_STATE, PROVIDER_STATE } from "./authState";

// Phase 0 of the dashboard mobile audit (DASHBOARD-FIX-PROMPT.md).
//
// ui-audit.spec.ts listed `/admin` and `/provider` from day one, but never
// created a session — so AuthGate rendered its standalone LoginScreen and every
// admin-*/provider-* baseline was a screenshot of a LOGIN FORM. The suite
// reported green while measuring nothing (DM-01).
//
// This runs as a Playwright *setup project* the audit projects depend on: it
// logs each role in through the real form once, and saves the resulting session
// to disk for the audit tests to reuse.
//
// Credentials come from api/prisma/seed-test-users.ts — run `npm run
// seed:test-users` in api/ first (see that file for why they're checked in).

const TEST_ADMIN = { email: "e2e-admin@local.test", password: "e2e-admin-pass-2026" };
const TEST_PROVIDER = { email: "e2e-provider@local.test", password: "e2e-provider-pass-2026" };

/**
 * Drive the real login form rather than POSTing /auth/login and injecting the
 * result. The session is an httpOnly cookie (api/src/lib/auth.ts) PLUS a
 * non-secret profile cache in localStorage under `al-assema-user`, which
 * `getCurrentUser()` reads synchronously to decide whether to render the
 * dashboard at all. Logging in for real is the only way to get both halves
 * consistent — and it means a broken login flow fails here, loudly, instead of
 * showing up as 30 confusing screenshot diffs.
 */
async function signIn(
  page: import("@playwright/test").Page,
  route: string,
  creds: { email: string; password: string },
  statePath: string,
) {
  await page.goto(route);

  // AuthGate resolves the existing session via /auth/me before deciding what to
  // render, so the form is not in the DOM on first paint.
  const email = page.locator('input[type="email"]');
  await expect(email).toBeVisible({ timeout: 15_000 });

  await email.fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').click();

  // The dashboard shell renders a <main id="main"> that the login screen does
  // not — a positive signal that we're actually through, rather than a
  // negative "the form went away" (which is also true while it's submitting).
  await expect(page.locator("#main")).toBeVisible({ timeout: 15_000 });
  // Guard against a silent failure mode: a wrong-role or deactivated user gets
  // AccessDenied, which also has no form. That screen has no sidebar nav.
  await expect(page.locator('nav a, nav button').first()).toBeVisible({ timeout: 15_000 });

  await page.context().storageState({ path: statePath });
}

setup("authenticate as admin", async ({ page }) => {
  await signIn(page, "/admin", TEST_ADMIN, ADMIN_STATE);
});

setup("authenticate as provider", async ({ page }) => {
  await signIn(page, "/provider", TEST_PROVIDER, PROVIDER_STATE);
});
