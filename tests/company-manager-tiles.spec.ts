import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Manager tiles on a company profile.
 *
 * A tile has two states - rated and not yet rated - and they have to look like the same component.
 * The rated branch renders its stars in a div, so the review count below falls onto its own line;
 * the unrated branch rendered an inline span, so the margin was silently dropped and the two ran
 * together as "No ratings yet0 reviews". Nothing threw and no test covered it, so it shipped.
 *
 * Asserted on geometry rather than on text. getByText matches an element's whole subtree, so a
 * parent holding two correctly separated lines still reads as one concatenated string - the exact
 * assertion that looks like it tests this and does not.
 */

const RATED = {
  id: 11, name: "Scott Mcdougall", slug: "scott-mcdougall",
  title: "Manager", overallRating: 4.8, reviewsCount: 3,
};

const UNRATED = {
  id: 12, name: "Christine Brady", slug: "christine-brady",
  title: "Assistant Store Manager", overallRating: 0, reviewsCount: 0,
};

const COMPANY = {
  id: 1, name: "Loblaw Companies Limited", slug: "loblaw-companies-limited",
  industry: "Retail", industrySlug: "retail",
  managerCount: 2, totalReviews: 3, avgRating: 3.9, categoryAverages: {},
  managers: [RATED, UNRATED],
};

async function mockCompany(page: any) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: true });
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { ...MOCK_USER, hasContributed: true } }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  const serve = (r: any) => r.fulfill({ json: COMPANY });
  await page.route("**/api/companies/**", serve);
  await page.route("**/api/companies/by-slug/**", serve);

  await page.goto("/industries/retail/companies/loblaw-companies-limited");
}

const tile = (page: any, name: string) => page.getByRole("link", { name: new RegExp(name) });

test.describe("Manager tiles on a company profile", () => {
  test("an unrated manager's count sits below the label, not beside it", async ({ page }) => {
    await mockCompany(page);
    const card = tile(page, "Christine Brady");
    await expect(card).toBeVisible({ timeout: 10_000 });

    const label = await card.getByText("No ratings yet").boundingBox();
    const count = await card.getByText("0 reviews").boundingBox();
    expect(label).not.toBeNull();
    expect(count).not.toBeNull();
    // Starts at or below where the label ends: two lines, not one run of text.
    expect(count!.y).toBeGreaterThanOrEqual(label!.y + label!.height - 1);
  });

  test("the unrated tile lays out like the rated one", async ({ page }) => {
    // Both counts are the last line of their tile and should sit on the same baseline, which is
    // what "looks like all the other tiles" actually means here.
    await mockCompany(page);
    await expect(tile(page, "Scott Mcdougall")).toBeVisible({ timeout: 10_000 });

    const rated = await tile(page, "Scott Mcdougall").getByText("3 reviews").boundingBox();
    const unrated = await tile(page, "Christine Brady").getByText("0 reviews").boundingBox();
    expect(rated).not.toBeNull();
    expect(unrated).not.toBeNull();
    expect(Math.abs(rated!.y - unrated!.y)).toBeLessThanOrEqual(2);
  });

  test("a rated manager still shows its rating and count", async ({ page }) => {
    // The branch that was already correct, so the fix to the other one cannot quietly break it.
    await mockCompany(page);
    const card = tile(page, "Scott Mcdougall");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText("4.8")).toBeVisible();
    await expect(card.getByText("3 reviews")).toBeVisible();
    await expect(card.getByText("No ratings yet")).toHaveCount(0);
  });
});
