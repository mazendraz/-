import { test } from "@playwright/test";

// Admin journey (manage catalog, view leads). The backend admin endpoints are
// live and covered by the API integration suite (api/tests/integration), but the
// frontend has no login UI yet and admin catalog writes are not cut over to the
// API (see backend-build-plan Phase 9 notes). Unskip once those land.
test.describe("admin journey", () => {
  test.skip("logs in, edits a company, and sees a submitted lead", async () => {
    // 1. Go to /admin, authenticate (POST /auth/login → Bearer token).
    // 2. Edit a company (PUT /admin/companies/[id]) and verify it persists.
    // 3. Open the leads view (GET /admin/leads) and assert a submitted lead shows.
  });
});
