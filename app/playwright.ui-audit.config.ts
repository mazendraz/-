import { defineConfig, devices } from "@playwright/test";

// Phase 0 of the UI/UX audit safety net (FIX-PROMPT.md). Separate from
// playwright.config.ts (testDir "./e2e") on purpose: that suite exercises
// user flows against the API; this one is a route × viewport × locale matrix
// that should currently FAIL — see tests/ui-audit.spec.ts. Same prerequisites
// as the e2e config: local Postgres up + migrated + seeded, and
// app/.env.local pointing VITE_API_URL at the local API.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  // Baselines live in tests/__baseline__/<name>.png, named by the `name` arg
  // passed to expect(page).toHaveScreenshot(name) — not Playwright's default
  // per-spec-file snapshot folder — so Phase 0's baseline location
  // (app/tests/__baseline__/) is a real, browsable directory.
  snapshotPathTemplate: "tests/__baseline__/{arg}{ext}",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../api",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
