import { test, expect } from "./base";

test.describe("Smoke tests", () => {
  test("homepage loads and has key content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Werkpages/i);
    // Hero section or main CTA should be visible
    await expect(
      page.getByRole("link", { name: /directory/i }).or(
        page.getByText(/rate.*manager/i).first()
      )
    ).toBeVisible({ timeout: 10_000 });
  });

  test("directory page loads and shows search/filter UI", async ({ page }) => {
    // Mock the managers API to avoid a real DB call
    await page.route("**/api/managers*", (route) => {
      route.fulfill({
        json: {
          data: [
            {
              id: "dir-1",
              slug: "dir-1",
              name: "Jordan Smith",
              title: "Product Manager",
              company: "Globex",
              status: "active",
              approvalStatus: "approved",
              overallRating: 4.2,
              totalRatings: 7,
              image: "J",
            },
          ],
          total: 1,
        },
      });
    });

    await page.goto("/directory");
    await expect(page.getByText("Jordan Smith")).toBeVisible({ timeout: 10_000 });
    // Search/filter UI should exist - on desktop it's a visible textbox, on mobile it's the Filters button
    await expect(
      page.getByRole("button", { name: /filters/i }).or(page.getByRole("textbox").first())
    ).toBeVisible();
  });

  test("navigating to a non-existent route shows something reasonable", async ({
    page,
  }) => {
    const response = await page.goto("/this-route-does-not-exist-xyz");
    // Either a 404 page or the app handles it gracefully (SPA routing)
    await expect(page.locator("body")).not.toBeEmpty();
    // Should not show an unhandled error
    await expect(page.getByText(/internal server error/i)).not.toBeVisible();
  });
});
