import { test, expect } from "./base";

test.describe("Smoke tests", () => {
  test("homepage loads and has key content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Werkpages/i);

    /*
      The hero, asserted through what every viewport shows.

      This used to be `getByRole("link", {name: /directory/i}).or(getByText(/rate.*manager/i))`.
      The link's accessible name is "Just browsing? Search managers without signing in →", which
      does not contain "directory" - only its href does - so the first half never matched, and
      `.first()` on the second half picked a desktop-only panel that is hidden at phone width.
      A homepage smoke test failing on mobile looked alarming and meant nothing.

      The h1 is the page's key content by definition, and it is the same element on both.
    */
    await expect(
      page.getByRole("heading", { level: 1, name: /manager/i })
    ).toBeVisible({ timeout: 10_000 });
    // filter to the visible one: the header keeps a desktop copy of this link in the DOM at
    // phone width, and it is the first in document order.
    await expect(
      page.locator('a[href="/directory"]').filter({ visible: true }).first()
    ).toBeVisible();
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
