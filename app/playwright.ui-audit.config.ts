import { defineConfig, devices } from "@playwright/test";

// Phase 0 of the UI/UX audit safety net (FIX-PROMPT.md). Separate from
// playwright.config.ts (testDir "./e2e") on purpose: that suite exercises
// user flows against the API; this one is a route × viewport × locale matrix
// that should currently FAIL — see tests/ui-audit.spec.ts. Same prerequisites
// as the e2e config: local Postgres up + migrated + seeded, and
// app/.env.local pointing VITE_API_URL at the local API.
//
// Dashboard-audit addendum (DASHBOARD-FIX-PROMPT.md Phase 0): the matrix now
// covers the real /admin and /provider tabs, which need a session — hence the
// "setup" project below and one extra prerequisite:
//   cd ../api && npm run seed:test-users    (creates the two fixed accounts)
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
  projects: [
    // Logs both roles in once and writes tests/.auth/*.json. Everything else
    // depends on it, so a login regression fails here — loudly and once —
    // instead of surfacing as a wall of unexplained screenshot diffs.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /ui-audit(-modals)?\.spec\.ts/,
    },
    // The extreme-data matrix gets its OWN project, with no dependency on
    // "setup". It intercepts every API read rather than measuring the seeded
    // database, so it needs neither a session nor fixtures — and making it wait
    // on a login it never uses would mean a broken seed could hide a real
    // layout regression behind an unrelated red.
    {
      name: "stress",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /ui-audit-stress\.spec\.ts/,
    },
    // NO "standalone" project here, deliberately. DM-04 (safe-area insets)
    // would ideally be verified with non-zero insets, but Chromium cannot
    // emulate them: `--force-display-mode-standalone` and `--safe-area-insets`
    // were both tried and measured on 2026-08-03 — `env(safe-area-inset-top)`
    // still computes to 0px and `(display-mode: standalone)` still reports
    // false. A project using them would have passed unconditionally while
    // measuring nothing, which is precisely the DM-01 failure this whole phase
    // exists to remove.
    //
    // DM-04 is therefore verified in Phase 2 instead, by routing the insets
    // through CSS custom properties (`--safe-top: env(safe-area-inset-top)`)
    // that a test CAN override — see DASHBOARD-FIX-PROMPT.md Phase 2.2.
  ],
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
