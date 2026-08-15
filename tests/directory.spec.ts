import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGERS_LIST,
  MOCK_PENDING_SUBMISSION,
  mockDirectoryPage,
} from "./fixtures";

// Helper: open the filters panel if it's collapsed (mobile breakpoint)
async function openFilters(page: Parameters<typeof mockDirectoryPage>[0]) {
  const btn = page.getByRole("button", { name: /filters/i });
  if (await btn.isVisible()) await btn.click();
}

async function searchDirectory(
  page: Parameters<typeof mockDirectoryPage>[0],
  { firstName = "Alex", lastName = "Johnson", title = "Engineering Manager", company = "Acme Corp" } = {}
) {
  await openFilters(page);
  await page.getByPlaceholder("First name").fill(firstName);
  await page.getByPlaceholder("Last name").fill(lastName);
  await page.getByPlaceholder("Job title").fill(title);
  await page.getByPlaceholder("Company", { exact: true }).fill(company);
  await page.getByRole("button", { name: /^search$/i }).click();
}

test.describe("Directory — search, filters, and pending submissions", () => {
  test("loads manager cards on initial visit", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sarah Connor")).toBeVisible();
  });

  test("search input filters results", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

    // Open filters panel on mobile
    const filtersBtn = page.getByRole("button", { name: /filters/i });
    if (await filtersBtn.isVisible()) await filtersBtn.click();

    await page.getByPlaceholder("First name").fill("Sarah");
    await page.getByPlaceholder("Last name").fill("Connor");
    await page.getByPlaceholder("Job title").fill("Product Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Skynet Inc");
    await page.getByRole("button", { name: /^search$/i }).click();

    // Sarah should appear (name heading in her card), Alex should disappear
    await expect(page.getByRole("heading", { name: "Sarah Connor", exact: true }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true })).not.toBeVisible({ timeout: 5_000 });
  });

  test("empty search results show 'No results' CTA", async ({ page }) => {
    await mockDirectoryPage(page, { searchResultsEmpty: true });
    await page.goto("/directory");

    // Open filters panel on mobile
    const filtersBtn2 = page.getByRole("button", { name: /filters/i });
    if (await filtersBtn2.isVisible()) await filtersBtn2.click();

    await page.getByPlaceholder("First name").fill("No");
    await page.getByPlaceholder("Last name").fill("Such Person");
    await page.getByPlaceholder("Job title").fill("Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Unknown Corp");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(
      page.getByText(/no results for/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("pending submissions section hidden for anonymous user", async ({
    page,
  }) => {
    await mockDirectoryPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(
      page.getByText(/your pending submissions/i)
    ).not.toBeVisible();
  });

  test("pending submissions section hidden for logged-in user with no pending", async ({
    page,
  }) => {
    await mockDirectoryPage(page, { loggedIn: true, pendingSubmissions: [] });
    await page.goto("/directory");

    await expect(
      page.getByText(/your pending submissions/i)
    ).not.toBeVisible();
  });

  test("pending submissions visible only to the submitting user", async ({
    page,
  }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      pendingSubmissions: [MOCK_PENDING_SUBMISSION],
    });
    await page.goto("/directory");

    await expect(
      page.getByText(/your pending submissions/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Jane Smith")).toBeVisible();
    // Pending badge
    await expect(page.getByText("Pending").first()).toBeVisible();
  });

  test("rate a manager CTA button is present for non-contributors", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");

    // Lock gate shows "Rate a manager" for users who haven't contributed yet
    await expect(
      page.getByRole("button", { name: /rate a manager/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clicking a manager card navigates to their profile", async ({
    page,
  }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

    // Manager cards are links to /manager/:id
    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
  });

  test("empty search results show '+ Add {searchTerm}' button with the exact searched name", async ({
    page,
  }) => {
    await mockDirectoryPage(page, { searchResultsEmpty: true });
    await page.goto("/directory");

    // Open filters panel on mobile
    const filtersBtn3 = page.getByRole("button", { name: /filters/i });
    if (await filtersBtn3.isVisible()) await filtersBtn3.click();

    await page.getByPlaceholder("First name").fill("Zephyr");
    await page.getByPlaceholder("Last name").fill("Williams");
    await page.getByPlaceholder("Job title").fill("Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Corp");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(
      page.getByText(/\+ add zephyr williams/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("empty search results show 'Be the first to add them' message", async ({
    page,
  }) => {
    await mockDirectoryPage(page, { searchResultsEmpty: true });
    await page.goto("/directory");

    // Open filters panel on mobile
    const filtersBtn4 = page.getByRole("button", { name: /filters/i });
    if (await filtersBtn4.isVisible()) await filtersBtn4.click();

    await page.getByPlaceholder("First name").fill("Ghost");
    await page.getByPlaceholder("Last name").fill("Manager");
    await page.getByPlaceholder("Job title").fill("Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Corp");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(
      page.getByText(/be the first to add them/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test.describe("Back button — page number preserved in URL", () => {
    test("visiting /directory?page=2 sends offset=20 to the API", async ({ page }) => {
      let capturedOffset: string | null = null;

      await mockDirectoryPage(page);
      await page.route(/\/api\/managers\?/, (route) => {
        const url = new URL(route.request().url());
        capturedOffset = url.searchParams.get("offset");
        route.fulfill({ json: { data: [], total: 100 } });
      });

      await page.goto("/directory?page=2");
      await page.waitForTimeout(500);

      expect(capturedOffset).toBe("20");
    });

    test("navigating to a manager profile and back preserves directory page in URL", async ({ page }) => {
      await mockDirectoryPage(page);

      // Mock manager profile so navigation doesn't fail
      await page.route(/\/api\/managers\/[^?]+$/, (route) =>
        route.fulfill({ json: { id: "test-mgr", name: "Alex Johnson", approvalStatus: "approved", reviews: [] } })
      );

      await page.goto("/directory?page=3");
      await page.goto("/managers/test-mgr");
      await page.goBack();

      await expect(page).toHaveURL(/[?&]page=3/, { timeout: 5_000 });
    });
  });

  // ── Search name chip removal ───────────────────────────────────────────────
  // The grey pill that used to show "Alex Johnson · Engineering Manager @ Acme Corp ×"
  // next to the result count has been removed. These tests lock that in.

  test.describe("search name chip is not shown after searching", () => {
    test("no rounded-full chip appears containing the searched name", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);

      // The chip used to be a <span class="...rounded-full...bg-muted..."> containing the name.
      // It must no longer exist.
      const chip = page.locator('span[class*="rounded-full"]').filter({ hasText: /alex johnson/i });
      await expect(chip).not.toBeVisible({ timeout: 3_000 });
    });

    test("result count text is still visible after searching", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);

      await expect(
        page.getByText(/result.*for.*"alex johnson"/i).or(page.getByText(/\d+ result/i))
      ).toBeVisible({ timeout: 5_000 });
    });

    test("no chip separator character · appears near search results header", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);

      // The chip used "·" to separate name from title — this should not appear in any chip
      const chipWithSeparator = page.locator('span[class*="rounded-full"]').filter({ hasText: "·" });
      await expect(chipWithSeparator).not.toBeVisible({ timeout: 3_000 });
    });

    test("clear-all control is visible after search (no stale grey chip)", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);

      // After a search, "Clear all" must be visible — this is the primary active-filter indicator
      await expect(page.getByText("Clear all")).toBeVisible({ timeout: 3_000 });
      // No grey rounded-full chip containing the searched name should appear (it was removed)
      const greyChip = page.locator('span[class*="rounded-full"]').filter({ hasText: "Alex Johnson" });
      await expect(greyChip).not.toBeVisible({ timeout: 1_000 });
    });

    test("clear-all button still appears when search filters are active", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);

      await expect(page.getByText("Clear all")).toBeVisible({ timeout: 5_000 });
    });

    test("clear-all removes the search and result count disappears", async ({ page }) => {
      await mockDirectoryPage(page);
      await page.goto("/directory");
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

      await searchDirectory(page);
      await expect(page.getByText(/result.*for/i)).toBeVisible({ timeout: 5_000 });

      await page.getByText("Clear all").click();
      await expect(page.getByText(/result.*for/i)).not.toBeVisible({ timeout: 3_000 });
    });
  });
});
