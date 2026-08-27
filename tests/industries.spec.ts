import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

const MOCK_INDUSTRIES = [
  { industry: "Technology",         slug: "technology",         companyCount: 12, managerCount: 40, totalReviews: 120, avgRating: 4.2 },
  { industry: "Financial Services", slug: "financial-services", companyCount: 6,  managerCount: 15, totalReviews: 44,  avgRating: 3.7 },
  { industry: "Nonprofit",          slug: "nonprofit",          companyCount: 1,  managerCount: 1,  totalReviews: 0,   avgRating: null },
];

async function mockIndustries(page: any, industries: any[] = MOCK_INDUSTRIES) {
  await page.route("**/api/auth/me", (route: any) => route.fulfill({ json: { ...MOCK_USER, hasContributed: true } }));
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  await page.route("**/api/industries/listing", (route: any) => route.fulfill({ json: { data: industries } }));
}

test.describe("Industries browse page (/industries)", () => {
  test("renders header and one tile per industry with stats", async ({ page }) => {
    await mockIndustries(page);
    await page.goto("/industries");

    await expect(page.getByRole("heading", { name: /compare workplace experiences by industry/i })).toBeVisible({ timeout: 10_000 });
    // No count in the header — it lives beside the sidebar search instead.
    await expect(page.locator("section").getByText(/\d+ industries/i)).not.toBeVisible();

    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financial Services" })).toBeVisible();
    // stats on a tile — scoped to the grid, since the sidebar also renders an "N companies"
    // style count and an unscoped getByText would match both under strict mode.
    await expect(page.locator("button").getByText("12 companies")).toBeVisible();
    await expect(page.getByText("40 managers")).toBeVisible();
  });

  test("industry with no ratings shows 'No ratings yet'", async ({ page }) => {
    await mockIndustries(page);
    await page.goto("/industries");
    await expect(page.getByText("No ratings yet")).toBeVisible();
  });

  test("renders the industry insights hero image", async ({ page }) => {
    await mockIndustries(page);
    await page.goto("/industries");
    // Same decorative hero-image treatment as the Companies tab. Two copies live in
    // the DOM (mobile stacked / desktop side-by-side); exactly one is shown per
    // breakpoint while the other is display:none.
    await expect(page.locator('img[src="/industry-insights-v1.png"]')).toHaveCount(2);
    await expect(page.locator('img[src="/industry-insights-v1.png"]:visible')).toHaveCount(1, { timeout: 10_000 });
  });

  test("clicking a tile navigates to that industry profile", async ({ page }) => {
    await mockIndustries(page);
    await page.route(/\/api\/industries\/by-slug\//, (route: any) =>
      route.fulfill({ json: { industry: "Technology", slug: "technology", companyCount: 12, managerCount: 40, totalReviews: 120, avgRating: 4.2, categoryAverages: {}, companies: [] } }));
    await page.goto("/industries");
    await page.getByRole("heading", { name: "Technology" }).click();
    await expect(page).toHaveURL(/\/industries\/technology/);
  });

  test("empty state when there are no industries", async ({ page }) => {
    await mockIndustries(page, []);
    await page.goto("/industries");
    await expect(page.getByText(/no industries yet/i)).toBeVisible({ timeout: 10_000 });
  });

  test("industry count sits beside the search, not in the header", async ({ page }) => {
    await mockIndustries(page, [MOCK_INDUSTRIES[0]]);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });
    // Still absent from the hero header...
    await expect(page.locator("section").getByText(/^\d+ industr(y|ies)$/i)).not.toBeVisible();
    // ...and present in the search sidebar, singular for one result.
    await expect(page.locator("aside").getByText("1 industry")).toBeVisible();
  });

  test("industry rated at or above the threshold shows a Top rated badge", async ({ page }) => {
    await mockIndustries(page, [{ ...MOCK_INDUSTRIES[0], industry: "Technology", avgRating: 4.7 }]);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/top rated/i)).toBeVisible();
  });

  test("industry below the threshold shows no Top rated badge", async ({ page }) => {
    await mockIndustries(page, [{ ...MOCK_INDUSTRIES[0], industry: "Technology", avgRating: 4.4 }]);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/top rated/i)).not.toBeVisible();
  });

  test("industry with no rating shows no Top rated badge", async ({ page }) => {
    await mockIndustries(page, [{ ...MOCK_INDUSTRIES[0], industry: "Technology", avgRating: null }]);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/top rated/i)).not.toBeVisible();
  });

  test("search filters the industry list and updates the count", async ({ page }) => {
    await mockIndustries(page);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/search for an industry/i).fill("financ");

    await expect(page.getByRole("heading", { name: "Financial Services" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technology" })).not.toBeVisible();
    await expect(page.locator("aside").getByText("1 industry")).toBeVisible();
  });

  test("search with no matches shows a no-results message", async ({ page }) => {
    await mockIndustries(page);
    await page.goto("/industries");
    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/search for an industry/i).fill("zzzzz");

    await expect(page.getByText(/no industries match/i)).toBeVisible();
    await expect(page.locator("aside").getByText("0 industries")).toBeVisible();
  });
});
