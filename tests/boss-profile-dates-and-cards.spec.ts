import { test, expect } from "./base";
import {
  MOCK_MANAGER,
  MOCK_USER,
  TEST_MANAGER_ID,
  mockManagerPage,
  clickWriteAReview,
  advanceToDatesStep,
} from "./fixtures";

/**
 * The date selects on the two review forms, and the review cards themselves.
 *
 * The date pair has more behaviour in it than it looks: clearing the start has to clear the end
 * and the still-here checkbox with it, and choosing the current year has to drop a month that has
 * not happened yet. Both rules exist to make an impossible period unreachable rather than merely
 * invalid, and both are written twice - once in the review form and once in the editor - which is
 * exactly the shape that drifts.
 *
 * A review period is not cosmetic. It is what ties an opinion to a stretch of time somebody can be
 * held to, and it is the field the overlap rules are enforced against.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;
const THIS_YEAR = new Date().getFullYear();
const THIS_MONTH = new Date().getMonth() + 1;

async function openForm(page: any, opts: Record<string, unknown> = {}) {
  await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true, ...opts });
  await page.goto(URL);
  await clickWriteAReview(page);
  await advanceToDatesStep(page);
  await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
}

test.describe("Picking the period a review covers", () => {
  test("the end date only becomes reachable once a start is given", async ({ page }) => {
    // An end with no beginning is not a period. Making it unreachable beats validating it after
    // the fact, because there is no state to explain and nothing to undo.
    await openForm(page);

    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2022");

    await expect(page.getByRole("checkbox", { name: /current/i })).toBeEnabled();
  });

  test("clearing the start clears the end with it", async ({ page }) => {
    /*
      Otherwise an end date survives the start being removed, and the form holds a half-period
      nobody chose: an end with no beginning, carried quietly into the submit.
    */
    await openForm(page);
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2023");

    await page.getByLabel("From month").selectOption("");
    await page.getByLabel("From year").selectOption("");

    await expect(page.getByLabel("Until month")).toHaveValue("");
    await expect(page.getByLabel("Until year")).toHaveValue("");
  });

  test("clearing the start also unticks still-working-here", async ({ page }) => {
    // "Still here" is a claim about an open period, so it cannot outlive the start of that period.
    await openForm(page);
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /current/i }).check();

    await page.getByLabel("From month").selectOption("");
    await page.getByLabel("From year").selectOption("");

    await expect(page.getByRole("checkbox", { name: /current/i })).not.toBeChecked();
  });

  test("choosing this year drops a month that has not happened yet", async ({ page }) => {
    /*
      December of the current year is selectable in January only because the month list does not
      know what year it is paired with. Re-checking on the year change is what stops somebody
      claiming to have worked a period that is still in the future.
    */
    test.skip(THIS_MONTH === 12, "no future month exists to select in December");
    await openForm(page);
    await page.getByLabel("From month").selectOption("12");
    await page.getByLabel("From year").selectOption("2020");

    await page.getByLabel("From year").selectOption(String(THIS_YEAR));

    await expect(page.getByLabel("From month")).toHaveValue("");
  });

  test("a past month survives choosing this year", async ({ page }) => {
    // The check has to be about the future, not about the year changing - clearing a valid month
    // on every year change would make the pair infuriating to fill in.
    test.skip(THIS_MONTH === 1, "no past month exists in this year in January");
    await openForm(page);
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2020");

    await page.getByLabel("From year").selectOption(String(THIS_YEAR));

    await expect(page.getByLabel("From month")).toHaveValue("01");
  });

  test("a start date in a past year keeps every month available", async ({ page }) => {
    await openForm(page);

    await page.getByLabel("From year").selectOption("2020");
    await page.getByLabel("From month").selectOption("12");

    await expect(page.getByLabel("From month")).toHaveValue("12");
  });
});

test.describe("The review cards", () => {
  const REVIEW = {
    id: 1,
    author: "someone",
    authorType: "username",
    overallRating: 4,
    ratings: {
      "Communication Style": 4, "Perceived Approachability": 4,
      "Perceived Clarity of Expectations": 4, "Feedback Style": 4,
      "Perceived Supportiveness": 4, "Decision Making Style": 4,
      "Organization and Planning Style": 4, "Delegation Style": 4,
      "Perceived Professional Demeanor": 4, "Overall Working Experience": 4,
    },
    managerTitle: "Engineering Manager",
    managerCompany: "Acme Corp",
    workedFrom: "2021-01",
    workedUntil: "2022-12",
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: null,
    helpfulCount: 2,
    managerId: TEST_MANAGER_ID,
  };

  async function openWithReview(page: any) {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: { data: [REVIEW], total: 1 } })
        : r.continue());
    await page.goto(URL);
    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });
  }

  test("a review's per-category scores are folded away by default", async ({ page }) => {
    /*
      Ten numbers per review, and a page can hold a dozen reviews. Expanded by default, the list
      becomes a wall of figures and the thing people actually came to read - what the reviews say
      collectively - is pushed off the screen entirely.
    */
    await openWithReview(page);

    await expect(page.getByRole("button", { name: "Show rating breakdown" })).toBeVisible();
  });

  test("the breakdown opens on request, and the control says how to close it", async ({ page }) => {
    await openWithReview(page);

    await page.getByRole("button", { name: "Show rating breakdown" }).click();

    await expect(page.getByRole("button", { name: "Hide breakdown" })).toBeVisible();
  });

  test("it folds away again", async ({ page }) => {
    // Opened by one control and closed by the same one. Two controls in the same place that behave
    // differently is how somebody ends up with every review on the page expanded.
    await openWithReview(page);
    await page.getByRole("button", { name: "Show rating breakdown" }).click();

    await page.getByRole("button", { name: "Hide breakdown" }).click();

    await expect(page.getByRole("button", { name: "Show rating breakdown" })).toBeVisible();
  });
});

/*
  The admin career-history editor is not covered here. admin-career-history.spec.ts already opens
  it, saves against the right entry id, checks the required-field gate and the delete confirmation
  - and it reaches the timeline through the path that actually unlocks it, which this spec's setup
  does not.
*/
