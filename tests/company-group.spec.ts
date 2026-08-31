import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Corporate structure on a company profile: Zehrs is part of Loblaw.
 *
 * The thing worth protecting here is the difference between a group and a merge. Zehrs keeps its
 * own page and its own rating; being owned by Loblaw adds a link and a list, and changes no number
 * on either page.
 */

const ZEHRS = {
  id: 2, name: "Zehrs Markets", slug: "zehrs-markets", industry: "Retail", industrySlug: "retail",
  managerCount: 4, totalReviews: 9, avgRating: 3.4, categoryAverages: {}, managers: [],
  partOf: { id: 1, name: "Loblaw Companies", slug: "loblaw-companies" },
};

const LOBLAW = {
  id: 1, name: "Loblaw Companies", slug: "loblaw-companies", industry: "Retail", industrySlug: "retail",
  managerCount: 6, totalReviews: 21, avgRating: 3.8, categoryAverages: {}, managers: [],
  companiesInGroup: [
    { id: 2, name: "Zehrs Markets", slug: "zehrs-markets", managerCount: 4, totalReviews: 9, avgRating: 3.4 },
    { id: 3, name: "No Frills", slug: "no-frills", managerCount: 2, totalReviews: 5, avgRating: 3.6 },
    { id: 4, name: "Quiet Brand", slug: "quiet-brand", managerCount: 0, totalReviews: 0 },
  ],
};

/**
 * Serves whichever company the request actually asked for.
 *
 * Returning one fixed company for every request looks simpler and is wrong: the profile page
 * rewrites the URL to the canonical path for the company it loaded, so navigating to Zehrs while
 * the mock answers with Loblaw bounces straight back to Loblaw. That made the navigation test pass
 * or fail on timing rather than on behaviour.
 */
async function mockCompany(page: any, company: any, contributed = true) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: contributed });
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: { ...MOCK_USER, hasContributed: contributed } }));

  const known = [company, ZEHRS, LOBLAW];
  const serve = (route: any) => {
    const url = decodeURIComponent(route.request().url());
    const match = known.find(c => c.slug && url.includes(c.slug))
               ?? known.find(c => url.includes(encodeURIComponent(c.name)) || url.includes(c.name))
               ?? company;
    route.fulfill({ json: match });
  };
  await page.route("**/api/companies/**", serve);
  await page.route("**/api/companies/by-slug/**", serve);
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
}

test.describe("Corporate structure on a company profile", () => {
  test("a subsidiary says what it is part of", async ({ page }) => {
    await mockCompany(page, ZEHRS);
    await page.goto("/industries/retail/companies/zehrs-markets");

    await expect(page.getByText(/Part of/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Loblaw Companies")).toBeVisible();
  });

  test("the subsidiary keeps its own rating, not its parent's", async ({ page }) => {
    // The whole distinction from a merge. Zehrs is 3.4; Loblaw is 3.8. Being owned changes neither.
    await mockCompany(page, ZEHRS);
    await page.goto("/industries/retail/companies/zehrs-markets");

    await expect(page.getByText("Zehrs Markets").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("3.4").first()).toBeVisible();
    await expect(page.getByText("3.8")).toHaveCount(0);
  });

  test("a parent lists the companies in its group, each with its own score", async ({ page }) => {
    await mockCompany(page, LOBLAW);
    await page.goto("/industries/retail/companies/loblaw-companies");

    await expect(page.getByRole("heading", { name: /Companies in this group/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Zehrs Markets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No Frills" })).toBeVisible();
    // Each carries its own number rather than inheriting one.
    await expect(page.getByText("3.4")).toBeVisible();
    await expect(page.getByText("3.6")).toBeVisible();
  });

  test("a brand with no managers yet is still shown in the group", async ({ page }) => {
    // Membership is not decided by having stats. A brand nobody has reviewed is still part of it.
    await mockCompany(page, LOBLAW);
    await page.goto("/industries/retail/companies/loblaw-companies");

    await expect(page.getByRole("heading", { name: "Quiet Brand" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("No ratings yet")).toBeVisible();
  });

  test("a company in no group shows neither section", async ({ page }) => {
    await mockCompany(page, { ...ZEHRS, partOf: undefined });
    await page.goto("/industries/retail/companies/zehrs-markets");

    await expect(page.getByText("Zehrs Markets").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Part of/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Companies in this group/i })).toHaveCount(0);
  });

  test("clicking a company in the group opens it", async ({ page }) => {
    await mockCompany(page, LOBLAW);
    await page.goto("/industries/retail/companies/loblaw-companies");

    await page.getByRole("heading", { name: "Zehrs Markets" }).click();
    await expect(page).toHaveURL(/zehrs-markets/);
  });
});
