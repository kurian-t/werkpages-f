import { test, expect } from "./base";
import { MOCK_MY_REVIEW, MOCK_USER, mockAccountSettingsPage } from "./fixtures";

/**
 * The work-timeline step of the review editor, and deleting a review from the list.
 *
 * The timeline is where a review is anchored to a period, and every guard on it exists because the
 * alternative is a claim nobody can check: a review of a manager somebody never reported to, two
 * reviews of the same manager covering the same months, a period that ends before it starts, a date
 * in a month that has not happened. None of those guards ran.
 *
 * The row-level delete is the other gap. It is a second, entirely separate delete path from the one
 * inside the editor - different handler, different confirmation - and it is destructive with a
 * 30-day consequence attached.
 */

const MANAGER_ID = MOCK_MY_REVIEW.managerId;

/** The review under edit, with its dates overridable per test. */
function review(over: Record<string, unknown> = {}) {
  return { ...MOCK_MY_REVIEW, ...over };
}

async function openTimeline(page: any, reviews = [review()]) {
  await mockAccountSettingsPage(page, { reviews });
  await page.goto("/settings");
  await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Edit$/ }).first().click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Work timeline" })).toBeVisible();
}

/** The four date selects, in DOM order: from-month, from-year, to-month, to-year. */
const dates = (page: any) => page.locator("select");

test.describe("Anchoring a review to a period", () => {
  test("the end date stays shut until a start date is given", async ({ page }) => {
    /*
      An end with no beginning describes nothing, and the pair is read as a range everywhere it is
      used. Disabling rather than validating means the impossible state is never entered.
    */
    await openTimeline(page, [review({ workedFrom: null, workedUntil: null })]);

    await expect(dates(page).nth(2)).toBeDisabled();
    await expect(dates(page).nth(3)).toBeDisabled();
    await expect(page.getByRole("checkbox")).toBeDisabled();
  });

  test("a start date opens the rest of the step", async ({ page }) => {
    await openTimeline(page, [review({ workedFrom: null, workedUntil: null })]);

    await dates(page).nth(0).selectOption("03");
    await dates(page).nth(1).selectOption("2022");

    await expect(dates(page).nth(2)).toBeEnabled();
    await expect(page.getByRole("checkbox")).toBeEnabled();
  });

  test("a start after the end is refused in place, not on save", async ({ page }) => {
    /*
      Stated next to the fields and the save disabled, rather than accepted and rejected by a toast
      afterwards - by then the reader has to work out which of the four selects was wrong.
    */
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" })]);

    await dates(page).nth(1).selectOption("2023");

    await expect(page.getByText("The 'from' date cannot be after the 'to' date.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  test("correcting the dates clears the refusal", async ({ page }) => {
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" })]);
    await dates(page).nth(1).selectOption("2023");
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();

    await dates(page).nth(3).selectOption("2024");

    await expect(page.getByText("The 'from' date cannot be after the 'to' date.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  test("still being in the role replaces the end date rather than guessing one", async ({ page }) => {
    // An open-ended period is a real answer. Filling today's date instead would assert the role
    // ended this month, which is the opposite of what the reader said.
    await openTimeline(page);

    await page.getByRole("checkbox").check();

    await expect(dates(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  test("an open-ended period is sent as no end date at all", async ({ page }) => {
    /*
      Null, not an empty string or today. The read side treats null as "still there" and renders it
      as Present; anything else there would print a date nobody gave.
    */
    let sent: any = null;
    await openTimeline(page);
    await page.route(new RegExp("/api/managers/.+/reviews/.+"), (r: any) => {
      if (r.request().method() !== "PUT") return r.continue();
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { ...MOCK_MY_REVIEW } });
    });

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.workedUntil).toBeNull();
    expect(sent.workedFrom).toBe("2021-01");
  });
});

test.describe("Two reviews of the same manager", () => {
  /*
    One review per manager per period. Overlapping periods would let one person's account of one
    stretch of time be counted twice in that manager's average, which is the cheapest way to move a
    rating and the reason the rule exists at all.
  */

  const EARLIER = review({ id: "review-2", workedFrom: "2019-01", workedUntil: "2020-06" });

  test("a period covering one already claimed is refused", async ({ page }) => {
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" }), EARLIER]);

    await dates(page).nth(1).selectOption("2019");

    await expect(page.getByText(/already have a review that overlaps this period/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  test("a period that merely abuts another is allowed", async ({ page }) => {
    // Ends June 2020, next begins July 2020. Adjacent is not overlapping, and an off-by-one in the
    // comparison would make an accurate pair of reviews unsaveable.
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" }), EARLIER]);

    await dates(page).nth(0).selectOption("07");
    await dates(page).nth(1).selectOption("2020");

    await expect(page.getByText(/already have a review that overlaps/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  test("the same period under a different manager is not an overlap", async ({ page }) => {
    /*
      Two managers at once is ordinary - a dotted line, a transfer mid-quarter. The rule is about
      double-counting one manager, so it has to be keyed on the manager and not on the dates alone.
    */
    const otherManager = review({ id: "review-3", managerId: MANAGER_ID + 99, workedFrom: "2019-01", workedUntil: "2020-06" });
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" }), otherManager]);

    await dates(page).nth(0).selectOption("01");
    await dates(page).nth(1).selectOption("2019");
    await dates(page).nth(2).selectOption("06");
    await dates(page).nth(3).selectOption("2020");

    await expect(page.getByText(/already have a review that overlaps/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  test("a review does not overlap itself", async ({ page }) => {
    // The obvious way to write this check catches the review being edited and makes its own dates
    // unsaveable, so opening an edit and changing nothing else would refuse to save.
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" })]);

    await expect(page.getByText(/already have a review that overlaps/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  test("an open-ended period overlaps everything after its start", async ({ page }) => {
    // "Still there" has no end, so anything from its start onward is inside it. Treating the missing
    // end as zero rather than as unbounded would let a later review slip past the check.
    const later = review({ id: "review-4", workedFrom: "2023-01", workedUntil: "2023-06" });
    await openTimeline(page, [review({ workedFrom: "2021-01", workedUntil: "2022-12" }), later]);

    await page.getByRole("checkbox").check();

    await expect(page.getByText(/already have a review that overlaps this period/i)).toBeVisible();
  });
});

test.describe("Deleting a review from the list", () => {
  /*
    A separate path from the delete inside the editor - its own handler, its own confirmation
    rendered inline on the row rather than as a dialog. Destructive, and it starts a 30-day
    cooldown the reader cannot undo, so the warning and the outcome both have to be right.
  */

  async function openList(page: any) {
    await mockAccountSettingsPage(page, { reviews: [review()] });
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
  }

  const trash = (page: any) => page.getByTitle("Delete review");

  test("the row asks before it deletes, and says what it costs", async ({ page }) => {
    await openList(page);

    await trash(page).click();

    await expect(page.getByText("Delete this review?")).toBeVisible();
    await expect(page.getByText(/won't be able to submit a new one for this manager for 30 days/i))
      .toBeVisible();
  });

  test("keeping it leaves the review and restores the row", async ({ page }) => {
    await openList(page);
    await trash(page).click();

    await page.getByRole("button", { name: "Keep it" }).click();

    await expect(page.getByText("Delete this review?")).toHaveCount(0);
    await expect(page.getByText("Alex Johnson").first()).toBeVisible();
    await expect(trash(page)).toBeVisible();
  });

  test("confirming removes the review from the list", async ({ page }) => {
    await openList(page);
    await trash(page).click();

    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.getByText("Review deleted.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Alex Johnson")).toHaveCount(0);
  });

  test("a failed delete says so and keeps the review", async ({ page }) => {
    /*
      The row is removed from local state on success rather than by refetching, so a failure that
      was reported as success would take the review off the screen while it still exists - and the
      reader would find it back on the next visit, having been told it was gone.
    */
    await openList(page);
    await page.route(new RegExp("/api/managers/.+/reviews/.+"), (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 500, json: {} })
        : r.continue());

    await trash(page).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.getByText(/Failed to delete review/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Alex Johnson").first()).toBeVisible();
  });
});

test.describe("A suspended account", () => {
  test("can still read what it wrote but cannot change it", async ({ page }) => {
    /*
      Read access is deliberate: a suspension stops somebody adding to the record, it does not hide
      their own account from them. Both controls are disabled rather than removed, and both say why
      - a button that silently vanishes reads as a bug rather than a decision.
    */
    await mockAccountSettingsPage(page, {
      reviews: [review()],
      user: { ...MOCK_USER, isBanned: true },
    });
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /^Edit$/ }).first()).toBeDisabled();
    await expect(page.getByTitle("Delete review")).toBeDisabled();
    await expect(page.getByTitle("Your account has been suspended").first()).toBeVisible();
  });
});
