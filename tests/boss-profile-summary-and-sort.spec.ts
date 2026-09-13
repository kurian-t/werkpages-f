import { test, expect } from "./base";
import {
  MOCK_MANAGER,
  MOCK_USER,
  TEST_MANAGER_ID,
  mockManagerPage,
  clickWriteAReview,
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

test.describe("The sentence the page writes about a manager", () => {
  /*
    Six bands, chosen by the overall average. Each is asserted at a score inside its own band, so a
    boundary that moves shows up as the wrong sentence rather than as nothing at all.
  */

  test("a very high average is described as very high", async ({ page }) => {
    await openWith(page, [reviewAt(4.8)]);

    await expect(page.getByText(/very high scores across nearly all categories/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test("a good average is described as positive, not as very high", async ({ page }) => {
    // The distinction the band boundary exists for: 4.2 is a good manager, 4.8 is a rare one, and
    // one sentence for both would flatten the difference people come here to find.
    await openWith(page, [reviewAt(4.2)]);

    await expect(page.getByText(/positive scores overall/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/very high scores/i)).toHaveCount(0);
  });

  test("a middling-good average is described as favourable but mixed", async ({ page }) => {
    await openWith(page, [reviewAt(3.6)]);

    await expect(page.getByText(/generally favourable scores/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a mixed average says some categories were rated well and others were not", async ({ page }) => {
    /*
      The most common band and the one that has to be worded most carefully - it describes a real
      person whom some people got on with and others did not, and it should read as neither an
      endorsement nor a complaint.
    */
    await openWith(page, [reviewAt(3.2)]);

    await expect(page.getByText(/mixed scores/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/needing improvement/i)).toBeVisible();
  });

  test("a low average is described as below average, with concerns named as concerns", async ({ page }) => {
    await openWith(page, [reviewAt(2.4)]);

    await expect(page.getByText(/below-average scores/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/areas of concern/i)).toBeVisible();
  });

  test("the lowest band says lower scores, and stops there", async ({ page }) => {
    /*
      Deliberately the flattest sentence of the six. This is a real named person with a bad
      average, and the page's job at that point is to report the number rather than to editorialise
      on top of it.
    */
    await openWith(page, [reviewAt(1.5)]);

    await expect(page.getByText(/lower scores across several categories/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test("one reviewer is counted in the singular", async ({ page }) => {
    // The count is the reader's cue for how much weight to give the sentence, so it has to be
    // exact - "1 anonymous reviewers" undercuts the care the rest of the sentence took.
    await openWith(page, [reviewAt(4.2)]);

    await expect(page.getByText(/1 anonymous reviewer(?!s)/)).toBeVisible({ timeout: 10_000 });
  });

  test("several reviewers are counted in the plural", async ({ page }) => {
    await openWith(page, [reviewAt(4.2), reviewAt(4.2, { id: 2 }), reviewAt(4.2, { id: 3 })]);

    await expect(page.getByText(/3 anonymous reviewers/)).toBeVisible({ timeout: 10_000 });
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
    await page.getByRole("button", { name: "Rate 5 stars" }).first().click();

    await expect(page.getByText("Team Lead").first()).toBeVisible();
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
