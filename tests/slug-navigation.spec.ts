import { test, expect } from "./base";
import {
  TEST_MANAGER_SLUG,
  TEST_COMPANY_SLUG,
  MOCK_MANAGER,
  MOCK_COMPANY_PROFILE,
  mockManagerPage,
} from "./fixtures";

test.describe("Slug URL navigation", () => {
  test.describe("Manager profile via slug URL", () => {
    test.beforeEach(async ({ page }) => {
      await mockManagerPage(page);
    });

    test("navigating to /companies/:companySlug/managers/:managerSlug renders manager profile", async ({
      page,
    }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Alex Johnson", exact: true })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("page title contains manager name and company on slug URL", async ({ page }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Alex Johnson", exact: true })
      ).toBeVisible({ timeout: 10_000 });

      await expect(page).toHaveTitle(/Alex Johnson/, { timeout: 5_000 });
      await expect(page).toHaveTitle(/Werkpages/, { timeout: 1_000 });
    });

    test("page has meta description on slug URL", async ({ page }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Alex Johnson", exact: true })
      ).toBeVisible({ timeout: 10_000 });

      const desc = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(desc).toBeTruthy();
      expect(desc!.length).toBeGreaterThan(20);
    });

    test("legacy /manager/:id URL redirects to slug URL", async ({ page }) => {
      await mockManagerPage(page);
      await page.goto(`/manager/${MOCK_MANAGER.id}`);

      // After the redirect effect fires, URL should change to the slug URL
      await page.waitForURL(
        `**/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`,
        { timeout: 8_000 }
      );
      await expect(
        page.getByRole("heading", { name: "Alex Johnson", exact: true })
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Company profile via slug URL", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );
      await page.route(`**/api/companies/by-slug/${TEST_COMPANY_SLUG}`, (route) =>
        route.fulfill({ json: MOCK_COMPANY_PROFILE })
      );
    });

    test("navigating to /companies/:companySlug renders company profile", async ({
      page,
    }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Acme Corp", exact: true })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("company page title contains company name", async ({ page }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Acme Corp", exact: true })
      ).toBeVisible({ timeout: 10_000 });

      await expect(page).toHaveTitle(/Acme Corp/, { timeout: 5_000 });
      await expect(page).toHaveTitle(/Werkpages/, { timeout: 1_000 });
    });

    test("company page has meta description", async ({ page }) => {
      await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
      await expect(
        page.getByRole("heading", { name: "Acme Corp", exact: true })
      ).toBeVisible({ timeout: 10_000 });

      const desc = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(desc).toBeTruthy();
      expect(desc!).toContain("Acme Corp");
    });
  });

  test.describe("/what-is-werkpages page", () => {
    test("page loads with FAQ content", async ({ page }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );

      await page.goto("/what-is-werkpages");
      await expect(page.locator("h1").filter({ hasText: "What is Werkpages?" })).toBeVisible({
        timeout: 8_000,
      });

      await expect(page.getByText(/frequently asked questions/i)).toBeVisible();
    });

    test("page title is set correctly", async ({ page }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );

      await page.goto("/what-is-werkpages");
      await expect(page.locator("h1").filter({ hasText: "What is Werkpages?" })).toBeVisible({
        timeout: 8_000,
      });

      await expect(page).toHaveTitle(/Werkpages/, { timeout: 5_000 });
    });
  });
});
