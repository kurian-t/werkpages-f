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

/**
 * A company thin enough to draw teaser slots, seen by somebody who has not contributed.
 *
 * <p>Six real managers and three "there could be more here" slots, which is the arrangement the
 * bugs below were reported on.
 */
const LOCKED_COMPANY = {
  ...COMPANY,
  managerCount: 6,
  managers: [1, 2, 3, 4, 5, 6].map(i => ({
    id: 100 + i, name: `Locked Person${i}`, slug: `locked-person${i}`,
    title: "Director", overallRating: 4.1, reviewsCount: 4,
    company: "Loblaw Companies Limited",
  })),
};

async function mockLockedCompany(page: any, submitted: any[] = []) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: false });
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { ...MOCK_USER, hasContributed: false } }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/users/me/submitted-managers", (r: any) =>
    r.fulfill({ json: { data: submitted } }));
  const serve = (r: any) => r.fulfill({ json: LOCKED_COMPANY });
  await page.route("**/api/companies/**", serve);
  await page.route("**/api/companies/by-slug/**", serve);
  await page.goto("/industries/retail/companies/loblaw-companies-limited");
}

/** A manager this user submitted, awaiting an admin. `companyId` is what scopes it to a page. */
const PENDING_HERE = {
  id: 501, name: "Awaiting Review", company: "Loblaw Companies Limited", companyId: 1,
  title: "Store Manager", approvalStatus: "pending_approval", reviews: 0, overallRating: 0,
};
const PENDING_ELSEWHERE = { ...PENDING_HERE, id: 502, name: "Other Employer", company: "Sobeys", companyId: 2 };

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

  /*
    Every tile names the employer.

    Past the third tile the company page passed blurCompany, which greyed out the entire company
    row - so three cards showed a name and nothing else, beside six that named the employer, on a
    page whose own heading is that employer. Hiding it withheld nothing and only looked broken.
    Ratings are what the contribution gate is for.
  */
  test("every manager tile on a company page names the company", async ({ page }) => {
    await mockLockedCompany(page);
    await expect(page.getByText("Locked Person6")).toBeVisible({ timeout: 10_000 });

    for (const i of [1, 2, 3, 4, 5, 6]) {
      // A plain string, not /…\b/: hasText matches textContent, which has no newlines, so the
      // name runs straight into the company and there is no word boundary after the digit.
      const card = page.getByTestId("manager-tile").filter({ hasText: `Locked Person${i}` });
      await expect(card.getByText("Loblaw Companies Limited")).toBeVisible();
    }
  });

  /*
    One tile implementation, one size.

    CompanyProfile carried its own GhostManagerCard for the teaser slots - a copy of
    LockedManagerCard's markup, whose comments claimed in three places to match it. It did not:
    the teasers stood visibly taller than the managers beside them in the same grid. Both are now
    drawn by the same component through the same shell, so this cannot drift again without
    failing here.
  */
  test("teaser slots are the same size as real manager tiles", async ({ page }) => {
    await mockLockedCompany(page);
    await expect(page.getByText("Locked Person1")).toBeVisible({ timeout: 10_000 });

    const boxes = await page.getByTestId("manager-tile").all();
    expect(boxes.length).toBeGreaterThanOrEqual(9);   // 6 managers + 3 teasers
    const sizes = [];
    for (const b of boxes) sizes.push(await b.boundingBox());

    const heights = sizes.map(s => s!.height);
    const widths  = sizes.map(s => s!.width);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
  });

  /*
    Your own pending submission belongs on the company's page, exactly as it appears on /directory.

    Adding a manager from a company page used to leave that page looking completely unchanged -
    the row is pending, and pending is invisible to the public listing. So the obvious next move
    was to add them again. It is visible to the person who filed it and to nobody else.
  */
  test("your pending submission shows as a Pending tile on its company page", async ({ page }) => {
    await mockLockedCompany(page, [PENDING_HERE]);

    const card = page.getByTestId("manager-tile").filter({ hasText: "Awaiting Review" });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText("Pending")).toBeVisible();
    await expect(page.getByText("Your Pending Submissions")).toBeVisible();
  });

  /*
    ...and only on that company's page.

    Scoped on the company id, never the name. A submission filed as "Revvity Inc." belongs on the
    Revvity page, and string matching is not a safe way to decide that - it drops tiles from the
    page they belong on and, worse, can put one on a page it does not.
  */
  test("a pending submission at another company does not appear here", async ({ page }) => {
    await mockLockedCompany(page, [PENDING_ELSEWHERE]);
    await expect(page.getByText("Locked Person1")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Other Employer")).toHaveCount(0);
    await expect(page.getByText("Your Pending Submissions")).toHaveCount(0);
  });
});