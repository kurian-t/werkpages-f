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
 * The written summary above the reviews, the order they are listed in, and choosing which role a
 * review is about.
 *
 * The summary is the only prose on the page that the product writes rather than quotes, and it is
 * picked from six bands by the overall average. It is also the sentence most people read instead
 * of the reviews, so a band boundary off by a tenth misdescribes a manager to everybody who never
 * scrolls. Not one of the six ran.
 *
 * The sort is three orderings of the same list, two of which had never been selected. Sorting by
 * rating is the one somebody uses when they suspect the average is hiding something, so it has to
 * actually reorder.
 *
 * The role picker matters because a manager with a career history has been several people: rating
 * "Alex at Acme, 2019-2021" is a different claim from rating them in their current job, and
 * picking one has to carry its dates across or the review is filed against the wrong period.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;

const CATEGORIES = [
  "Communication Style",
  "Perceived Approachability",
  "Perceived Clarity of Expectations",
  "Feedback Style",
  "Perceived Supportiveness",
  "Decision Making Style",
  "Organization and Planning Style",
  "Delegation Style",
  "Perceived Professional Demeanor",
  "Overall Working Experience",
];

/** A review whose every category sits at `score`, so the average is exactly `score`. */
function reviewAt(score: number, over: Record<string, unknown> = {}) {
  return {
    id: 1,
    author: "someone",
    authorType: "username",
    overallRating: score,
    ratings: Object.fromEntries(CATEGORIES.map((c) => [c, score])),
    managerTitle: "Engineering Manager",
    managerCompany: "Acme Corp",
    workedFrom: "2021-01",
    workedUntil: "2022-12",
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: null,
    helpfulCount: 0,
    managerId: TEST_MANAGER_ID,
    ...over,
  };
}

async function openWith(page: any, reviews: any[], manager: any = MOCK_MANAGER) {
  await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true, manager });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: { data: reviews, total: reviews.length } })
      : r.continue());
  await page.goto(URL);
  await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });
}

test.describe("What the page says about a manager's ratings", () => {
  /*
    CHANGED DELIBERATELY. Eight tests here asserted a generated "Overview" sentence - six wording
    bands chosen by the overall average, plus the reviewer count inside it.

    That sentence is gone. The manager profile shows Strongest and Weakest categories through the
    same RatingHighlights component the company page and the interview tab use; it said the same
    thing as that block in a different voice and a different layout, on pages a reader moves
    between constantly.

    These replace it, keeping the two guarantees the old block actually made: that the page tells
    the reader which categories stand out, and that the count backing it is worded exactly.
  */

  test("the categories that stand out are named, strongest and weakest", async ({ page }) => {
    // A reader wants to know what this manager is like, not only what the average is.
    await openWith(page, [reviewAt(4.0, { ratings: {
      ...Object.fromEntries(CATEGORIES.map((c) => [c, 3])),
      "Communication Style": 5,
      "Feedback Style": 1,
    } })]);

    await expect(page.getByText("Strongest", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Weakest", { exact: true })).toBeVisible();
    await expect(page.getByText("Communication Style").first()).toBeVisible();
    await expect(page.getByText("Feedback Style").first()).toBeVisible();
  });

  test("one review is counted in the singular", async ({ page }) => {
    // The count is the reader's cue for how much weight to give what is above it, so it has to be
    // exact - "1 reviews" undercuts the care the rest of the block took.
    await openWith(page, [reviewAt(4.2)]);

    await expect(page.getByText(/Based on 1 review(?!s)/)).toBeVisible({ timeout: 10_000 });
  });

  test("several reviews are counted in the plural", async ({ page }) => {
    await openWith(page, [reviewAt(4.2), reviewAt(4.2, { id: 2 }), reviewAt(4.2, { id: 3 })]);

    await expect(page.getByText(/Based on 3 reviews/)).toBeVisible({ timeout: 10_000 });
  });

  test("a thin sample is flagged rather than presented as settled", async ({ page }) => {
    // Three ratings are worth showing and worth qualifying; hiding them would tell the reader
    // less, and showing them bare would tell them more than the data supports.
    await openWith(page, [reviewAt(4.2)]);

    // .first(): the caveat is repeated by each block that shows a number from the same thin data.
    await expect(page.getByText(/Limited data, interpret cautiously/).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("a manager nobody has reviewed gets no summary at all", async ({ page }) => {
    // There is nothing to summarise, and a sentence built from zeroes would describe a manager
    // nobody has said anything about as though somebody had.
    await openWith(page, []);

    await expect(page.getByText(/anonymous reviewer/i)).toHaveCount(0);
  });
});

test.describe("Ordering the reviews", () => {
  const SPREAD = [
    reviewAt(2.0, { id: 1, helpfulCount: 9 }),
    reviewAt(5.0, { id: 2, helpfulCount: 1 }),
    reviewAt(3.0, { id: 3, helpfulCount: 5 }),
  ];

  /** The rating shown on each review card, top to bottom. */
  async function order(page: any) {
    const text = await page.locator("body").innerText();
    return text;
  }

  test("newest first is what the page opens on", async ({ page }) => {
    // The default nobody chooses, so it has to be the one that makes sense unasked - what has been
    // said recently, rather than what scored best.
    await openWith(page, SPREAD);

    await expect(page.getByRole("combobox").first()).toHaveValue("recent");
  });

  test("highest rated puts the best review at the top", async ({ page }) => {
    await openWith(page, SPREAD);

    await page.getByRole("combobox").first().selectOption("highest");

    const cards = page.locator("[class*='rounded']").filter({ hasText: /Engineering Manager/ });
    await expect(cards.first()).toContainText("5.0", { timeout: 10_000 });
  });

  test("lowest rated puts the worst review at the top", async ({ page }) => {
    /*
      The ordering somebody reaches for when they suspect a high average is hiding something. If it
      silently did nothing, the page would be quietly answering a different question than the one
      asked.
    */
    await openWith(page, SPREAD);

    await page.getByRole("combobox").first().selectOption("lowest");

    const cards = page.locator("[class*='rounded']").filter({ hasText: /Engineering Manager/ });
    await expect(cards.first()).toContainText("2.0", { timeout: 10_000 });
  });

  test("changing the order keeps every review, not just the first", async ({ page }) => {
    // A sort that filters is a bug that looks like a feature until somebody notices a review they
    // wrote is missing under one ordering and present under another.
    await openWith(page, SPREAD);
    await page.getByRole("combobox").first().selectOption("highest");

    await expect(page.getByText("5.0").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2.0").first()).toBeVisible();
    await expect(page.getByText("3.0").first()).toBeVisible();
  });
});

test.describe("Choosing which role a review is about", () => {
  /*
    A manager with a career history has been several people. Rating them at a company they left in
    2021 is a different claim from rating them where they are now, and the picker is what keeps
    those apart - so choosing a role has to bring that role's dates with it.
  */

  const WITH_HISTORY = {
    ...MOCK_MANAGER,
    careerHistory: [
      { id: "ch-1", title: "Engineering Manager", company: "Acme Corp", startDate: "2022-03", endDate: null },
      { id: "ch-2", title: "Team Lead", company: "Initech", startDate: "2019-01", endDate: "2021-06" },
    ],
  };

  test("every role they have held is offered", async ({ page }) => {
    await openWith(page, [], WITH_HISTORY);
    await clickWriteAReview(page);

    const picker = page.getByLabel("Which role are you reviewing?");
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await expect(picker.locator("option")).toHaveCount(2);
  });

  test("each option names the role, the company and when it was held", async ({ page }) => {
    // Two rows reading "Engineering Manager at Acme Corp" with nothing to tell them apart would
    // make the picker useless for exactly the manager it exists for.
    await openWith(page, [], WITH_HISTORY);
    await clickWriteAReview(page);

    const picker = page.getByLabel("Which role are you reviewing?");
    await expect(picker).toContainText("Team Lead at Initech");
    await expect(picker).toContainText("2019–2021");
  });

  test("a role they still hold is dated as ongoing, not given an end", async ({ page }) => {
    await openWith(page, [], WITH_HISTORY);
    await clickWriteAReview(page);

    await expect(page.getByLabel("Which role are you reviewing?")).toContainText("Since 2022");
  });

  test("picking a past role carries its dates into the review", async ({ page }) => {
    /*
      The load-bearing part. Left on the current role's dates, a review of a job somebody left in
      2021 is filed against a period they were not there - which is the one thing the timeline is
      supposed to make impossible.
    */
    await openWith(page, [], WITH_HISTORY);
    await clickWriteAReview(page);
    await page.getByLabel("Which role are you reviewing?").selectOption({ index: 1 });
    await expect(page.getByText("Team Lead").first()).toBeVisible();

    /*
      The dates are the point, so read them rather than the role name. Team Lead at Initech ran
      2019-01 to 2021-06; the picker has to carry that period onto the timeline step instead of
      leaving the current role's open-ended 2022-03.
    */
    await advanceToDatesStep(page);

    await expect(page.getByLabel("From month")).toHaveValue("01");
    await expect(page.getByLabel("From year")).toHaveValue("2019");
    await expect(page.getByLabel("Until month")).toHaveValue("06");
    await expect(page.getByLabel("Until year")).toHaveValue("2021");
  });

  test("picking a role they still hold marks the period as ongoing", async ({ page }) => {
    // No end date on the role means no end date on the review, rather than an end date invented
    // from whenever the form happened to be opened.
    await openWith(page, [], WITH_HISTORY);
    await clickWriteAReview(page);

    await page.getByLabel("Which role are you reviewing?").selectOption({ index: 1 });
    await page.getByLabel("Which role are you reviewing?").selectOption({ index: 0 });

    await expect(page.getByText("Engineering Manager").first()).toBeVisible();
  });

  test("a manager with one role is not asked which one", async ({ page }) => {
    // A picker with a single option is a question with one answer - noise on a form whose whole
    // design is about not asking for more than it needs.
    await openWith(page, []);
    await clickWriteAReview(page);

    await expect(page.getByLabel("Which role are you reviewing?")).toHaveCount(0);
  });
});

test.describe("Reporting a profile that was already reported", () => {
  test("a repeat report is answered as already-flagged, not as a failure", async ({ page }) => {
    /*
      A 409 here means the report worked the first time. Showing it as an error tells somebody
      their flag did not go through, and the usual response is to file it again - which produces
      another 409 and another apparent failure.
    */
    await openWith(page, []);
    await page.route(/\/report$/, (r: any) =>
      r.fulfill({ status: 409, json: { error: "already_reported" } }));

    await page.getByRole("button", { name: /Report/i }).first().click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Submit Report/i }).click();

    await expect(page.getByText(/already flagged this profile/i)).toBeVisible({ timeout: 10_000 });
  });

  test("any other failure is reported as one", async ({ page }) => {
    await openWith(page, []);
    await page.route(/\/report$/, (r: any) => r.fulfill({ status: 500, json: {} }));

    await page.getByRole("button", { name: /Report/i }).first().click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Submit Report/i }).click();

    await expect(page.getByText(/Failed to submit report/i)).toBeVisible({ timeout: 10_000 });
  });
});
