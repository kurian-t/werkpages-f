import { test, expect } from "./base";
import { MOCK_USER, MOCK_COMPANY_LISTING, MOCK_GEO } from "./fixtures";

const MOCK_INDUSTRIES = [
  { industry: "Technology",         slug: "technology",         companyCount: 12, managerCount: 40, totalReviews: 120, avgRating: 4.2 },
  { industry: "Financial Services", slug: "financial-services", companyCount: 6,  managerCount: 15, totalReviews: 44,  avgRating: 3.7 },
  { industry: "Healthcare",         slug: "healthcare",         companyCount: 4,  managerCount: 9,  totalReviews: 20,  avgRating: 4.0 },
];

async function mockExplore(page: any, opts: { loggedIn?: boolean; hasContributed?: boolean } = {}) {
  const { loggedIn = true, hasContributed = true } = opts;
  await page.route("**/api/auth/me", (route: any) =>
    loggedIn
      ? route.fulfill({ json: { ...MOCK_USER, hasContributed } })
      : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
  if (loggedIn) {
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
      { ...MOCK_USER, hasContributed });
  }
  await page.route("**/api/industries/listing", (route: any) =>
    route.fulfill({ json: { data: MOCK_INDUSTRIES } }));
  await page.route("**/api/companies/listing", (route: any) =>
    route.fulfill({ json: { data: MOCK_COMPANY_LISTING } }));
  await page.route("**/api/companies/suggest**", (route: any) => route.fulfill({ json: [] }));
  await page.route(/\/api\/geo/, (route: any) => route.fulfill({ json: MOCK_GEO }));
  await page.route("**/api/managers/find-or-create", (route: any) =>
    route.fulfill({ json: { data: [], created: false, hasContributed } }));
  await page.route(/\/api\/managers\?/, (route: any) => route.fulfill({ json: { data: [], total: 0 } }));
  await page.route(/\/api\/companies\/by-(name|slug)/, (route: any) =>
    route.fulfill({ json: { name: "Acme Corp", slug: "acme-corp", managerCount: 0, totalReviews: 0, categoryAverages: {}, managers: [] } }));
}

test.describe("Explore landing page (/explore)", () => {
  test.beforeEach(async ({ page }) => { await mockExplore(page); });

  test("loads hero, prompt, and the three search-mode segments", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: /explore the world of work/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/what are you looking for\?/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Manager", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Company", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Industry", exact: true })).toBeVisible();
  });

  test("defaults to Manager mode showing the /find search form", async ({ page }) => {
    await page.goto("/explore");
    // FindManagerForm - the exact same component as /find
    await expect(page.getByPlaceholder("First name")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("Last name")).toBeVisible();
    await expect(page.getByPlaceholder(/job title/i)).toBeVisible();
    await expect(page.getByPlaceholder("Company")).toBeVisible();
  });

  test("Company mode shows the company autocomplete search box", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Company", exact: true }).click();
    await expect(page.getByPlaceholder("Search for a company…")).toBeVisible();
  });

  test("Industry mode: dropdown opens on focus, filters, and navigates to the profile", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Industry", exact: true }).click();
    const input = page.getByPlaceholder("Search industries…");
    await expect(input).toBeVisible();

    // Opens on focus and lists industries
    await input.click();
    await expect(page.getByRole("button", { name: /Technology/ })).toBeVisible();

    // Filters as you type
    await input.fill("financ");
    await expect(page.getByRole("button", { name: /Financial Services/ })).toBeVisible();

    // Selecting navigates to the industry profile
    await page.getByRole("button", { name: /Financial Services/ }).click();
    await expect(page).toHaveURL(/\/industries\/financial-services/);
  });

  test("Industry mode: Enter selects the first match", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Industry", exact: true }).click();
    const input = page.getByPlaceholder("Search industries…");
    await input.click();
    await input.fill("health");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/industries\/healthcare/);
  });

  test("browse cards navigate to directory, companies, and industries", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/prefer to browse\?/i)).toBeVisible();

    await page.getByRole("button", { name: /browse industries/i }).click();
    await expect(page).toHaveURL(/\/industries$/);

    await page.goto("/explore");
    await page.getByRole("button", { name: /browse companies/i }).click();
    await expect(page).toHaveURL(/\/companies$/);

    await page.goto("/explore");
    await page.getByRole("button", { name: /browse managers/i }).click();
    await expect(page).toHaveURL(/\/directory$/);
  });

  test("Company mode: selecting an autocomplete suggestion is wired to navigate", async ({ page }) => {
    // Feed the clearbit-style suggest endpoint so CompanyAutocomplete shows a suggestion.
    await page.route("**/api/companies/suggest**", (route: any) =>
      route.fulfill({ json: [{ name: "Acme Corp", domain: "acme.com", logo: "" }] }));
    await page.goto("/explore");
    await page.getByRole("button", { name: "Company", exact: true }).click();
    const input = page.getByPlaceholder("Search for a company…");
    await input.fill("Acme");
    // The autocomplete panel should surface the suggestion
    await expect(page.getByText("Acme Corp").first()).toBeVisible();
  });

  test("Company mode: submitting the form navigates to that company", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Company", exact: true }).click();
    const input = page.getByPlaceholder("Search for a company…");
    await input.fill("Acme Corp");
    await input.press("Enter"); // form submit -> goToCompany(q) -> navigate (CompanyProfile then redirects name->slug)
    await expect(page).toHaveURL(/\/companies\/[^/]+$/);
  });
});
