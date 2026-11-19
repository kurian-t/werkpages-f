import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

/**
 * The three pills over the rating breakdown.
 *
 * Ten categories at once is a wall, and the two a reader actually wants - what this manager is
 * best at and worst at - are buried in the middle of it. Three pills expose all three views
 * without hiding two of them behind a dropdown.
 */
test.describe("Filtering the rating breakdown", () => {
  /*
    Deliberately varied. The shared fixture rates every category 4, which makes "highest" and
    "lower" indistinguishable - a filter that did nothing at all would pass against it.
  */
  const SPREAD: Record<string, number> = {
    "Communication Style": 3.0,
    "Perceived Approachability": 3.4,
    "Perceived Clarity of Expectations": 5.0,
    "Feedback Style": 2.0,
    "Perceived Supportiveness": 2.6,
    "Decision Making Style": 3.8,
    "Organization and Planning Style": 4.8,
    "Delegation Style": 3.2,
    "Perceived Professional Demeanor": 4.6,
    "Overall Working Experience": 4.0,
  };

  /* The category labels also appear in the Strongest/Weakest cards above and inside each
     expanded review, so every assertion here is scoped to the breakdown itself. */
  const breakdown = (page: any) => page.getByTestId("rating-breakdown");

  async function openBreakdown(page: any) {
    await mockManagerPage(page, {
      loggedIn: true,
      user: { ...MOCK_USER, hasContributed: true },
      existingUserReviews: [],
    });
    // After the fixture, so this answers the reviews feed the averages are computed from.
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() !== "GET") return r.fulfill({ status: 200, json: { success: true } });
      return r.fulfill({
        json: {
          data: [{ ...MOCK_EXISTING_REVIEW, id: "rv-spread", ratings: SPREAD }],
          total: 1,
        },
      });
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
  }

  /*
    CHANGED DELIBERATELY. Six tests for an All / Highest / Lower filter were here.

    The pills are gone from the manager profile: RatingBreakdown still offers them behind
    `filterable`, and the profile no longer passes it, because the ten categories are the point of
    that section and a filter that hid seven by default asked the reader to go looking for what
    they came for. Strongest and Weakest are stated above it instead.

    What is left to guarantee is that the breakdown shows all of it, unfiltered.
  */

  test("every category is shown, with nothing narrowing the list", async ({ page }) => {
    await openBreakdown(page);

    for (const category of Object.keys(SPREAD)) {
      await expect(breakdown(page).getByText(category, { exact: true })).toBeVisible();
    }
    // The regression this guards: re-introducing a control that hides most of the section.
    await expect(page.getByRole("tablist", { name: "Filter categories" })).toHaveCount(0);
  });


  test("a locked reader is not offered controls over data they cannot see", async ({ page }) => {
    // Operating a filter over withheld placeholders answers nothing, and offering it implies the
    // bars behind the blur are real.
    await mockManagerPage(page, { loggedIn: true, user: { ...MOCK_USER, hasContributed: false } });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tablist", { name: "Filter categories" })).toHaveCount(0);
  });
});
