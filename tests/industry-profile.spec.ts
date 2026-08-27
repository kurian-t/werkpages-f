import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

const CATEGORY_AVERAGES = {
  "Communication Style": 4.5,
  "Perceived Approachability": 4.2,
  "Perceived Clarity of Expectations": 3.9,
  "Feedback Style": 4.1,
  "Perceived Supportiveness": 4.4,
  "Decision Making Style": 3.8,
  "Organization and Planning Style": 4.0,
  "Delegation Style": 3.7,
  "Perceived Professional Demeanor": 4.6,
  "Overall Working Experience": 4.3,
};

const MOCK_PROFILE = {
  industry: "Technology",
  slug: "technology",
  companyCount: 2,
  managerCount: 5,
  totalReviews: 30,
  avgRating: 4.2,
  categoryAverages: CATEGORY_AVERAGES,
  companies: [
    { name: "TopCo",  slug: "topco",  managerCount: 3, totalReviews: 20, avgRating: 4.8 }, // top rated (>=4.5)
    { name: "MidCo",  slug: "midco",  managerCount: 2, totalReviews: 10, avgRating: 3.9 },
  ],
};

async function mockProfile(page: any, opts: { hasContributed?: boolean; profile?: any; status?: number } = {}) {
  const { hasContributed = true, profile = MOCK_PROFILE, status } = opts;
  await page.route("**/api/auth/me", (route: any) => route.fulfill({ json: { ...MOCK_USER, hasContributed } }));
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), { ...MOCK_USER, hasContributed });
  await page.route(/\/api\/industries\/by-slug\//, (route: any) =>
    status ? route.fulfill({ status, json: { message: "Industry not found" } })
           : route.fulfill({ json: profile }));
  await page.route(/\/api\/companies\/by-(name|slug)/, (route: any) =>
    route.fulfill({ json: { name: "TopCo", slug: "topco", managerCount: 3, totalReviews: 20, categoryAverages: {}, managers: [] } }));
}

test.describe("Industry profile page (/industries/:slug)", () => {
  test("renders header stats and the 10-category breakdown", async ({ page }) => {
    await mockProfile(page);
    await page.goto("/industries/technology");

    await expect(page.getByRole("heading", { name: "Technology" })).toBeVisible({ timeout: 10_000 });
    // Scoped to the hero: the search sidebar now also renders an "N companies" count.
    await expect(page.locator("section").getByText("2 companies")).toBeVisible();
    await expect(page.locator("section").getByText("5 managers")).toBeVisible();

    await expect(page.getByText(/how this industry rates across the 10 categories/i)).toBeVisible();
    // A couple of the category rows + their values
    await expect(page.getByText("Communication Style")).toBeVisible();
    await expect(page.getByText("Perceived Professional Demeanor")).toBeVisible();
  });

  test("unlocked (contributed): company tiles show real ratings and a Top rated badge", async ({ page }) => {
    await mockProfile(page, { hasContributed: true });
    await page.goto("/industries/technology");
    await expect(page.getByRole("heading", { name: "TopCo" })).toBeVisible({ timeout: 10_000 });
    // Top-rated badge on the >=4.5 company
    await expect(page.getByText(/top rated/i)).toBeVisible();
    // A real rating value is shown
    await expect(page.getByText("4.8")).toBeVisible();
  });

  test("locked (not contributed): ratings blurred, unlock banner shown, no Top rated badge", async ({ page }) => {
    await mockProfile(page, { hasContributed: false });
    await page.goto("/industries/technology");
    await expect(page.getByRole("heading", { name: "TopCo" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
    await expect(page.getByText(/top rated/i)).toHaveCount(0);

    // The unlock banner's CTA routes to the add-manager flow.
    await page.getByRole("button", { name: /rate a manager/i }).click();
    await expect(page).toHaveURL(/\/add/);
  });

  test("clicking a company tile navigates to that company", async ({ page }) => {
    await mockProfile(page, { hasContributed: true });
    await page.goto("/industries/technology");
    await page.getByRole("heading", { name: "TopCo" }).click();
    await expect(page).toHaveURL(/\/companies\/topco/);
  });

  test("'All industries' back link returns to the browse page", async ({ page }) => {
    await mockProfile(page);
    await page.route("**/api/industries/listing", (route: any) => route.fulfill({ json: { data: [] } }));
    await page.goto("/industries/technology");
    await page.getByRole("link", { name: /all industries/i }).click();
    await expect(page).toHaveURL(/\/industries$/);
  });

  test("unknown industry (404) shows a not-found message", async ({ page }) => {
    await mockProfile(page, { status: 404 });
    await page.goto("/industries/not-a-real-industry");
    await expect(page.getByText(/industry not found/i)).toBeVisible({ timeout: 10_000 });
  });
});
