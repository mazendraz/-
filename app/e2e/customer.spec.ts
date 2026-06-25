import { expect, test } from "@playwright/test";

// Customer journey against the live API (catalog hydrated from the backend).
// The companies come from the seed (cd ../api && npm run seed).
test.describe("customer journey", () => {
  test("browses the directory and opens a company profile", async ({ page }) => {
    await page.goto("/companies");

    // A seeded company should appear once the catalog hydrates from the API.
    const company = page.getByText("Aura Interiors", { exact: false }).first();
    await expect(company).toBeVisible({ timeout: 15_000 });

    await company.click();
    await expect(page).toHaveURL(/\/companies\/aura-interiors/);

    // The profile renders the company's details (services / reviews from the API).
    await expect(
      page.getByRole("heading", { name: /Aura Interiors/i }),
    ).toBeVisible();
  });
});
