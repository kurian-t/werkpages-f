import { test, expect } from "./base";

/**
 * A ghost manager is live, and reads as live.
 *
 * `ghost` is what a record gets the first time a signed-in user searches for a manager nobody has
 * added yet: auto-approved, public immediately, listed in the directory and the counts. The company
 * page was blurring its company and title anyway, purely for being a ghost - so somebody could add
 * a manager, go to that company to find them, and see an unreadable tile.
 *
 * The contribution gate withholds ratings. It does not withhold who someone is.
 */

const COMPANY = {
  id: 1,
  name: "Central Rock Gym",
  slug: "central-rock-gym",
  managerCount: 1,
  totalReviews: 0,
  avgRating: null,
  categoryAverages: {},
  managers: [
    {
      id: 91,
      name: "Kathryn Kaufman",
      title: "Chief Operations Officer",
      company: "Central Rock Gym",
      slug: "kathryn-kaufman",
      approvalStatus: "ghost",
      overallRating: null,
      reviewsCount: 0,
    },
  ],
};

async function openCompany(page: any, opts: { contributed: boolean }) {
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { id: "u1", name: "Test", role: "user", hasContributed: opts.contributed } }),
  );
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.goto(`/companies/${COMPANY.slug}`);
}

test.describe("Ghost managers on a company page", () => {
  test("a ghost manager's name is readable to a user who has not contributed", async ({ page }) => {
    await openCompany(page, { contributed: false });
    await expect(page.getByText("Kathryn Kaufman").first()).toBeVisible({ timeout: 10_000 });
  });

  test("a ghost manager's title is readable, not blurred away", async ({ page }) => {
    // This is the regression. The title used to be replaced by a blurred placeholder purely
    // because the record was a ghost.
    await openCompany(page, { contributed: false });
    await expect(page.getByText("Chief Operations Officer").first()).toBeVisible({ timeout: 10_000 });
  });

  test("a ghost manager is still readable once the user has contributed", async ({ page }) => {
    await openCompany(page, { contributed: true });
    await expect(page.getByText("Kathryn Kaufman").first()).toBeVisible({ timeout: 10_000 });
  });
});
