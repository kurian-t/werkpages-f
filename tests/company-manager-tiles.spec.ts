import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Manager tiles on a company profile.
 *
 * An unrated manager used to get two lines of nothing: "No ratings yet" above "0 reviews". Both
 * were true and neither was worth the space - a tile whose only content is a report of its own
 * emptiness. The tile now says nothing at all until there is something to say.
 *
 * Asserted on geometry as well as text, because the earlier bug here was a layout one: the two
 * strings ran together as "No ratings yet0 reviews" when the label was rendered inline.
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
  test("an unrated manager advertises nothing", async ({ page }) => {
    await mockCompany(page);
    const card = tile(page, "Christine Brady");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText("No ratings yet")).toHaveCount(0);
    await expect(card.getByText("0 reviews")).toHaveCount(0);
  });

  test("a rated manager still shows its rating and count", async ({ page }) => {
    // The branch that carries real information is untouched.
    await mockCompany(page);
    const card = tile(page, "Scott Mcdougall");
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.getByText("4.8")).toBeVisible();
    await expect(card.getByText("3 reviews")).toBeVisible();
  });

  test("dropping the text does not collapse the tile", async ({ page }) => {
    // The row height reserves the space, so an empty tile still lines up with a full one. This is
    // the regression the earlier layout complaints were about.
    await mockCompany(page);
    await expect(tile(page, "Scott Mcdougall")).toBeVisible({ timeout: 10_000 });

    const rated = await tile(page, "Scott Mcdougall").boundingBox();
    const unrated = await tile(page, "Christine Brady").boundingBox();
    expect(rated).not.toBeNull();
    expect(unrated).not.toBeNull();
    expect(Math.abs(rated!.height - unrated!.height)).toBeLessThanOrEqual(2);
  });
});
