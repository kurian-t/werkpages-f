import { test, expect } from "./base";
import {
  MOCK_MANAGER,
  MOCK_USER,
  TEST_MANAGER_ID,
  TEST_MANAGER_SLUG,
  TEST_COMPANY_SLUG,
  mockManagerPage,
} from "./fixtures";

/**
 * How a manager profile is addressed, and what it does when it cannot be shown.
 *
 * A manager has had several URLs over the life of the product - an id, a flat company/manager
 * pair, and now one with the industry in front of it - and every one of them is in somebody's
 * bookmarks, in a link they sent a colleague, and in a search index. All of them still have to
 * resolve, and then quietly correct themselves, so the page has one address rather than four.
 *
 * The correction is deliberately a replace rather than a push: an old link should not leave an
 * extra entry in history that sends somebody straight back to it when they press Back.
 *
 * None of the redirects ran, and neither did the page that says a manager cannot be found - which
 * is the one a bad link actually lands on.
 */

/*
  The industry segment is not pinned here. It is descriptive, the fixture manager carries none, and
  the app substitutes "other" - pinning it would make this spec a test of the fallback rather than
  of the redirect. What matters is the company and the manager, which are what identify the page.
*/
const CANONICAL = new RegExp(
  `/industries/[^/]+/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`,
);

test.describe("Addressing a manager", () => {
  test("an id-based link resolves and corrects itself to the named URL", async ({ page }) => {
    /*
      The oldest form of the link, and the one the product still generates internally after a
      submission. Left as an id, the address bar shows a number to somebody about to share the page
      with a colleague.
    */
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page).toHaveURL(CANONICAL, { timeout: 10_000 });
    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible();
  });

  test("the correction replaces the old entry rather than stacking on it", async ({ page }) => {
    // Pushed instead of replaced, Back would return to the id URL, which immediately redirects
    // forward again - a Back button that does nothing, twice.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto("/directory");
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page).toHaveURL(CANONICAL, { timeout: 10_000 });

    await page.goBack();

    await expect(page).toHaveURL(/\/directory/);
  });

  test("a link without the industry segment still resolves", async ({ page }) => {
    /*
      The industry is descriptive rather than identifying - it can go stale simply because somebody
      reclassified the company. A link that 404s because of a segment the reader never chose and
      cannot see is a link the product broke on its own.
    */
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);

    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });
  });

  test("a stale industry segment resolves and is corrected in place", async ({ page }) => {
    // Reclassifying a company must not invalidate every link anybody has ever shared to its
    // managers. The old segment resolves, then the URL quietly becomes the right one.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });

    await page.goto(`/industries/something-else/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);

    await expect(page).toHaveURL(CANONICAL, { timeout: 10_000 });
  });

  test("the canonical URL is left alone", async ({ page }) => {
    // The redirect has to know when it is already home. A correction that fires unconditionally is
    // a navigation on every render, which is a loop rather than a redirect.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });

    await page.goto(
      `/industries/other/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`,
    );
    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });

    await expect(page).toHaveURL(CANONICAL);
  });
});

test.describe("When the manager cannot be shown", () => {
  test("a link to nobody says so plainly", async ({ page }) => {
    /*
      The page a wrong or retired link lands on. It is also what somebody sees after a manager is
      deleted, so it has to read as an ordinary answer rather than as a fault.
    */
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) =>
      r.fulfill({ status: 404, json: { error: "not_found" } }));
    await page.route(/\/api\/managers\/by-slug\//, (r: any) =>
      r.fulfill({ status: 404, json: { error: "not_found" } }));

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Manager Not Found" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/doesn't exist/i)).toBeVisible();
  });

  test("it offers a way back rather than a dead end", async ({ page }) => {
    // A page with nothing on it and no exit is where a session ends. Back is the one destination
    // that is always right, because it is wherever they actually came from.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.route(/\/api\/managers\/by-slug\//, (r: any) => r.fulfill({ status: 404, json: {} }));
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) =>
      r.fulfill({ status: 404, json: {} }));
    await page.goto("/directory");
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Manager Not Found" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Go Back" }).click();

    await expect(page).toHaveURL(/\/directory/);
  });

  test("a server fault reads the same way as a missing manager", async ({ page }) => {
    /*
      Deliberately not a stack trace or a raw status. From the reader's side a 500 and a 404 are
      the same event - the page they asked for is not here - and the difference is ours to handle,
      not theirs to interpret.
    */
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) =>
      r.fulfill({ status: 500, json: {} }));
    await page.route(/\/api\/managers\/by-slug\//, (r: any) => r.fulfill({ status: 500, json: {} }));

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Manager Not Found" })).toBeVisible({ timeout: 10_000 });
  });
});

/*
  A failed manager edit is not covered here. edit-manager-outcomes.spec.ts already asserts that the
  request says so and keeps the form open - and it reaches the change-request path, which is the
  one an ordinary contributor takes; the admin write-through path has its own coverage there too.
*/
