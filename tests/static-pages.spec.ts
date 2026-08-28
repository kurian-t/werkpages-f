import { test, expect } from "./base";

// Static/informational pages - no auth or API mocking needed.

test.describe("Static pages", () => {
  test("homepage loads with hero content", async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, json: {} })
    );
    await page.goto("/");

    // The homepage should have something meaningful visible
    await expect(
      page.getByRole("heading").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Privacy Policy page loads", async ({ page }) => {
    await page.goto("/privacy");

    await expect(
      page.getByText(/privacy/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Terms of Service page loads", async ({ page }) => {
    await page.goto("/terms");

    await expect(
      page.getByText(/terms/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("About page loads", async ({ page }) => {
    await page.goto("/about");

    await expect(
      page.getByText(/about/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Support page loads", async ({ page }) => {
    await page.goto("/support");

    await expect(
      page.getByRole("heading").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("404 page loads for unknown route", async ({ page }) => {
    await page.goto("/no-such-page-xyz-123");

    await expect(
      page.getByText(/not found|404/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
