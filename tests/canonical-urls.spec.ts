import { test, expect } from "./base";

/**
 * Canonical URL shape:
 *   /industries/:industrySlug/companies/:companySlug
 *   /industries/:industrySlug/companies/:companySlug/managers/:managerSlug
 *
 * Older shapes still resolve and redirect here. That matters beyond tidiness: those URLs are
 * in Google's index and in links people have already shared, so a regression that 404s them
 * loses real traffic silently. These tests pin every legacy entry point.
 */

const MANAGER = {
  id: 42,
  name: "Jane Doe",
  company: "Red Hat",
  title: "Engineering Manager",
  slug: "jane-doe",
  companySlug: "red-hat",
  industry: "Technology",
  industrySlug: "technology",
  overallRating: 4.2,
  reviewsCount: 3,
  reviews: 3,
  categoryAverages: {},
  careerHistory: [],
  createdAt: "2026-01-01T00:00:00Z",
  approvalStatus: "approved",
  status: "active",
};

const COMPANY = {
  id: 7,
  name: "Red Hat",
  slug: "red-hat",
  industry: "Technology",
  industrySlug: "technology",
  managerCount: 1,
  totalReviews: 3,
  avgRating: 4.2,
  categoryAverages: {},
  managers: [],
};

async function mockManagerAndCompany(page: any) {
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.route("**/api/managers/by-slug/**", (r: any) => r.fulfill({ json: MANAGER }));
  await page.route("**/api/managers/42", (r: any) => r.fulfill({ json: MANAGER }));
  await page.route("**/api/managers/42/reviews", (r: any) => r.fulfill({ json: { data: [] } }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
}

const CANONICAL_MANAGER = "/industries/technology/companies/red-hat/managers/jane-doe";
const CANONICAL_COMPANY = "/industries/technology/companies/red-hat";

test.describe("Canonical industry-nested URLs", () => {
  test("legacy /manager/:id redirects to the nested canonical path", async ({ page }) => {
    await mockManagerAndCompany(page);
    await page.goto("/manager/42");
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_MANAGER}$`), { timeout: 10_000 });
  });

  test("flat /companies/:c/managers/:m redirects to the nested canonical path", async ({ page }) => {
    await mockManagerAndCompany(page);
    await page.goto("/companies/red-hat/managers/jane-doe");
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_MANAGER}$`), { timeout: 10_000 });
  });

  test("a stale industry segment is corrected rather than 404ing", async ({ page }) => {
    // A company reclassified from Retail to Technology leaves old links pointing at the wrong
    // industry. The company and manager slugs still identify the page, so it resolves.
    await mockManagerAndCompany(page);
    await page.goto("/industries/retail/companies/red-hat/managers/jane-doe");
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_MANAGER}$`), { timeout: 10_000 });
  });

  test("the canonical manager URL is served without redirecting", async ({ page }) => {
    await mockManagerAndCompany(page);
    await page.goto(CANONICAL_MANAGER);
    await expect(page.getByRole("heading", { name: "Jane Doe", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_MANAGER}$`));
  });

  test("flat /companies/:slug redirects to the nested canonical path", async ({ page }) => {
    await mockManagerAndCompany(page);
    await page.goto("/companies/red-hat");
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_COMPANY}$`), { timeout: 10_000 });
  });

  test("the canonical company URL is served without redirecting", async ({ page }) => {
    await mockManagerAndCompany(page);
    await page.goto(CANONICAL_COMPANY);
    await expect(page).toHaveURL(new RegExp(`${CANONICAL_COMPANY}$`), { timeout: 10_000 });
  });
});
