import { defineConfig, devices } from "@playwright/test";

// E2E against the live stack. Prerequisites:
//   1. Docker Postgres up + migrated + seeded (cd ../api && npm run seed)
//   2. Browsers installed once:  npx playwright install
//   3. app/.env.local has VITE_API_URL=http://localhost:3000/api
// Playwright starts both dev servers (api on :3000, web on :5173) automatically.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
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
