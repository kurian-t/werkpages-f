import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

/**
 * The states of a manager profile that only some people ever see.
 *
 * The existing view spec covers the page as a reader meets it. What it does not reach is every
 * branch that depends on *who* is looking and *what they have already done*: the admin editor and
 * its career-history controls, the banner that tells an author their rating is saved but not
 * published, the difference between the three hold states, and reporting a profile.
 *
 * Those branches are where a mistake is invisible in testing and obvious in production - an author
 * told their rating is live when it is held, or an admin control rendered for somebody who is not
 * one.
 */

const HELD_REVIEW = { ...MOCK_EXISTING_REVIEW, disposition: "held" };

/**
 * Answers the proof-challenge lookup the banner reads.
 *
 * Registered after mockManagerPage, because Playwright matches routes in reverse registration
 * order and the fixture's own catch-alls would otherwise win.
 */
async function withChallenge(page: any, challenge: unknown) {
  await page.route("**/api/managers/*/proof-challenge*", (r: any) =>
    r.fulfill({ json: { challenge } }));
}

test.describe("A rating that is saved but not published", () => {
  /*
    Only its author sees this banner. It is the difference between "saved" and "published", which
    the page otherwise gives them no way to tell apart - and somebody who believes they have posted
    a rating that nobody can see will not come back.
  */

  test("a hold with a self-serve path offers the way through it", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true, existingUserReviews: [HELD_REVIEW],
    });
    await withChallenge(page, { id: "c1", status: "open", reason: "high_profile" });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByText("Your rating is saved but not published yet."))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toBeVisible();
  });

  test("a hold already being read says so, and offers nothing to do", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, existingUserReviews: [HELD_REVIEW] });
    await withChallenge(page, { id: "c1", status: "admin_review", reason: "high_profile" });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByText(/being verified/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toHaveCount(0);
  });

  test("a hold with no self-serve path never offers a link that goes nowhere", async ({ page }) => {
    /*
      This branch used to read `challenge?.status !== "admin_review"`, which is also true when the
      challenge is undefined - still loading, failed, or absent - so "we don't know yet" landed in
      the affirmative case and the link rendered with nothing behind it.
    */
    await mockManagerPage(page, { loggedIn: true, existingUserReviews: [HELD_REVIEW] });
    await withChallenge(page, null);
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByText(/waiting on a review by our team/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toHaveCount(0);
  });

  test("nobody else sees another person's hold", async ({ page }) => {
    // It names a rating and its state. Showing it to a reader would out its author.
    await mockManagerPage(page, { loggedIn: true, existingUserReviews: [] });
    await withChallenge(page, { id: "c1", status: "open", reason: "high_profile" });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/saved but not published/)).toHaveCount(0);
    await expect(page.getByText(/waiting on a review by our team/)).toHaveCount(0);
  });
});

test.describe("A profile awaiting approval", () => {
  test("says so, rather than looking like an ordinary live profile", async ({ page }) => {
    await mockManagerPage(page, {
      manager: { ...MOCK_MANAGER, approvalStatus: "pending_approval" },
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByText(/Profile under review/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The admin editor", () => {
  test("its controls are for admins only", async ({ page }) => {
    // The page is public. An edit control rendered for everybody is an invitation to try it.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("admin-edit-button")).toHaveCount(0);
  });

  test("an admin gets the editor, pre-filled with what is on the profile", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByTestId("admin-edit-button").click();

    // Pre-filled matters here for a specific reason: an admin editing only the title must not
    // submit an empty company, so the form seeds every field from the row as it stands.
    const inputs = page.locator("input[type='text']");
    await expect(inputs.first()).toHaveValue(MOCK_MANAGER.name);
  });

  test("an admin edit is sent as the admin's own change", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    let sent: any = null;
    // /api/admin/managers/:id, not /api/managers/:id - an admin edit goes through the admin
    // endpoint, which applies it directly instead of filing it as a pending edit for review.
    await page.route(new RegExp(`/api/admin/managers/${TEST_MANAGER_ID}$`), (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByTestId("admin-edit-button").click();
    const title = page.locator("input[type='text']").nth(1);
    await title.fill("Director of Engineering");
    await page.getByRole("button", { name: /^Save/ }).first().click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.title).toBe("Director of Engineering");
    // The company goes with it even though it was not touched - the seeded selection is what
    // stops an untouched field arriving empty and blanking the row.
    expect(sent.company).toBe(MOCK_MANAGER.company);
  });

  test("cancelling an admin edit changes nothing", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    let sent = false;
    await page.route(new RegExp(`/api/admin/managers/${TEST_MANAGER_ID}$`), (r: any) => {
      sent = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByTestId("admin-edit-button").click();
    await page.locator("input[type='text']").nth(1).fill("Something else");
    await page.getByRole("button", { name: /^Cancel/ }).first().click();

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true })).toBeVisible();
    expect(sent).toBe(false);
  });
});

test.describe("Reporting a profile", () => {
  test("a reader can report, and is told it was received", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.route("**/api/managers/*/report", (r: any) =>
      r.fulfill({ status: 200, json: { success: true } }));

    const report = page.getByRole("button", { name: /Report this profile/i });
    await expect(report).toBeVisible({ timeout: 10_000 });
    await report.click();

    // Whatever the flow does next, the control acknowledges the click rather than sitting inert.
    await expect(page.getByText(/Report/i).first()).toBeVisible();
  });

  test("a profile this reader already flagged says so instead of asking again", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.route("**/api/managers/*/report", (r: any) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: { reported: true } })
        : r.fulfill({ status: 200, json: { success: true } }));
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Managing a review you wrote", () => {
  test("the author gets the controls for their own review and nobody else's", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, existingUserReviews: [MOCK_EXISTING_REVIEW] });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
    // Having reviewed, the page offers to change it rather than to write another.
    await expect(page.getByRole("button", { name: /write a review/i })).toHaveCount(0);
  });

  test("somebody who has not reviewed is asked to", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, existingUserReviews: [] });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("button", { name: /write a review/i }).first())
      .toBeVisible({ timeout: 10_000 });
  });
});

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

  test("all three views are offered without opening anything", async ({ page }) => {
    // The argument for pills over a dropdown: with exactly three states, every one of them is
    // visible and one click away.
    await openBreakdown(page);

    const tabs = page.getByRole("tablist", { name: "Filter categories" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab")).toHaveCount(3);
  });

  test("it opens on every category, in the order they are asked", async ({ page }) => {
    await openBreakdown(page);

    await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    await expect(breakdown(page).getByText("Communication Style", { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText("Feedback Style", { exact: true })).toBeVisible();
  });

  test("Highest narrows to the three best, best first", async ({ page }) => {
    await openBreakdown(page);

    await page.getByRole("tab", { name: /^Highest/ }).click();

    await expect(breakdown(page).getByText("Perceived Clarity of Expectations", { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText("Organization and Planning Style", { exact: true })).toBeVisible();
    // And the weakest is no longer among them, which is the point of having asked.
    await expect(breakdown(page).getByText("Feedback Style", { exact: true })).toHaveCount(0);
  });

  test("Lower narrows to the three worst", async ({ page }) => {
    await openBreakdown(page);

    await page.getByRole("tab", { name: /^Lower/ }).click();

    await expect(breakdown(page).getByText("Feedback Style", { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText("Perceived Supportiveness", { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText("Perceived Clarity of Expectations", { exact: true })).toHaveCount(0);
  });

  test("no category is shown as both a strength and a weakness", async ({ page }) => {
    // The overlap bug, asserted through the UI: a naive top-3 and bottom-3 over a short list
    // returns the same rows in both, and a profile once listed three categories as both.
    await openBreakdown(page);

    await page.getByRole("tab", { name: /^Highest/ }).click();
    const strengthRows = breakdown(page).getByTestId("breakdown-row-label");
    await expect(strengthRows).toHaveCount(3);
    const strengths = await strengthRows.allInnerTexts();

    await page.getByRole("tab", { name: /^Lower/ }).click();
    const weaknessRows = breakdown(page).getByTestId("breakdown-row-label");
    await expect(weaknessRows).toHaveCount(3);
    const weaknesses = await weaknessRows.allInnerTexts();

    expect(strengths.filter((s) => weaknesses.includes(s))).toEqual([]);
  });

  test("going back to All restores every category", async ({ page }) => {
    await openBreakdown(page);
    await page.getByRole("tab", { name: /^Highest/ }).click();
    await expect(breakdown(page).getByText("Feedback Style", { exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: /^All/ }).click();

    await expect(breakdown(page).getByText("Feedback Style", { exact: true })).toBeVisible();
    await expect(breakdown(page).getByText("Perceived Clarity of Expectations", { exact: true })).toBeVisible();
  });

  test("the Strongest / Weakest cards are gone - the filter replaced them", async ({ page }) => {
    /*
      They restated three high and three low categories in big rectangles directly above a
      breakdown that then listed the very same figures again. Every number appeared twice, in two
      different visual languages. The pills do that job now within one chart, so a reader learns
      one way of reading instead of two.
    */
    await openBreakdown(page);

    await expect(page.getByText("Strongest Areas")).toHaveCount(0);
    await expect(page.getByText("Weakest Areas")).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Filter categories" })).toBeVisible();
  });

  test("a ranked view is ordered, which is what tells the reader it is a ranking", async ({ page }) => {
    /*
      No 1/2/3 column. A sorted list of three already reads as a ranking - the order says it and
      the bar lengths say it again - so numbering restates what is on screen and spends a column
      of width doing it. What has to hold is the ordering itself, which is asserted here instead.
    */
    await openBreakdown(page);

    await page.getByRole("tab", { name: /^Highest/ }).click();
    await expect(breakdown(page).locator("span.tabular-nums")).toHaveCount(3);
    const best = await breakdown(page).locator("span.tabular-nums").allInnerTexts();
    const bestScores = best.map(Number).filter((n) => !Number.isNaN(n));
    expect(bestScores).toEqual([...bestScores].sort((a, b) => b - a));

    await page.getByRole("tab", { name: /^Lower/ }).click();
    await expect(breakdown(page).locator("span.tabular-nums")).toHaveCount(3);
    const worst = await breakdown(page).locator("span.tabular-nums").allInnerTexts();
    const worstScores = worst.map(Number).filter((n) => !Number.isNaN(n));
    expect(worstScores).toEqual([...worstScores].sort((a, b) => a - b));
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
