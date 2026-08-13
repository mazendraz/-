import { defineConfig, devices } from "@playwright/test";

// CTO QA sweep (tests/qa/). Separate config so it neither inherits the
// ui-audit suite's screenshot baselines nor its "expected to fail" posture:
// everything here is a real defect signal.
//
// Prerequisites (same as the other two configs):
//   1. local Postgres up + migrated + seeded
//   2. cd ../api && npm run seed:test-users
//   3. app/.env.local → VITE_API_URL=/api
export default defineConfig({
  testDir: "./tests/qa",
  timeout: 90_000,
  fullyParallel: true,
  workers: 4,
  // Artifacts go OUTSIDE the Vite project root, deliberately. Playwright's
  // default `app/test-results/` sits inside the dev server's watch scope, so
  // every trace and screenshot written during a run triggered an HMR full
  // reload — which re-executed main.tsx on an already-mounted container
  // ("calling createRoot() on a container that has already been passed to
  // createRoot()") and, when a reload landed mid-navigation, painted the error
  // page. The crawl reported both as product defects until this moved out.
  outputDir: "../.qa-artifacts/test-results",
  reporter: [["list"], ["json", { outputFile: "../.qa-artifacts/qa-results.json" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, testDir: "./tests" },
    {
      name: "qa",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
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
