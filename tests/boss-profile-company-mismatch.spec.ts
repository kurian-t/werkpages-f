import { test, expect } from "./base";
import {
  MOCK_MANAGER,
  MOCK_USER,
  TEST_MANAGER_ID,
  mockManagerPage,
  advanceToDatesStep,
} from "./fixtures";

/**
 * The warning shown when a review's period disagrees with what other people have said.
 *
 * Other reviewers have placed this manager at a particular company during a particular stretch of
 * time. Somebody now writing a review for an overlapping period at a *different* company is either
 * mistaken about the dates, mistaken about the person, or right - dual roles, contracting and
 * transitions all happen, and the last thing the product should do is tell somebody their own
 * experience did not occur.
 *
 * So it is a question, not a refusal. That distinction is the whole design of this warning, and it
 * is what makes the two exits meaningful: one accepts the answer and lets it through, the other
 * assumes the dates were the mistake and clears them.
 *
 * None of it ran on the review form. The editor's copy of the same warning is covered by
 * duplicate-review.spec.ts; this is the one people meet first.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;

/** Other people's reviews place this manager at Initech across 2019-2021. */
const SEGMENT_ELSEWHERE = {
  company: "Initech",
  role: "Team Lead",
  startDate: "2019-01",
  endDate: "2021-06",
  isCurrent: false,
  averageRating: 3.4,
  reviewCount: 4,
  categoryAverages: {},
};

async function openDates(page: any, segments: any[] = [SEGMENT_ELSEWHERE]) {
  /*
    Seeded into localStorage as well as served from /api/auth/me. The timeline sits behind the
    contribution gate and reads the session synchronously on first render, so without the seed the
    page paints locked and then re-lays-out when the session arrives - which is what leaves the
    button underneath it still moving when the click lands.
  */
  const who = { ...MOCK_USER, hasContributed: true };
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, { loggedIn: true, user: who, hasContributed: true });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
    r.fulfill({ json: { data: segments } }));
  await page.goto(URL);
  /*
    The career timeline fades in when there are segments to show, and the button sits below it - so
    it is still moving when Playwright first reaches for it. Waiting for the animation to settle is
    the difference between a stable spec and one that fails only when segments exist.
  */
  await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /write a review/i }).first().click({ timeout: 15_000 });
  await advanceToDatesStep(page);
  await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
}

/** Picks a period that lands inside the segment above. */
async function pickOverlappingPeriod(page: any) {
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption("2020");
  await page.getByLabel("Until month").selectOption("09");
  await page.getByLabel("Until year").selectOption("2020");
}

test.describe("A period that disagrees with other reviewers", () => {
  test("the disagreement is raised, and named as a possibility rather than an error", async ({ page }) => {
    /*
      "Possible company mismatch", not "invalid dates". The reader may well be right, and telling
      somebody their own account of their own job is wrong - on the strength of other people's
      reviews - would be both rude and frequently false.
    */
    await openDates(page);

    await pickOverlappingPeriod(page);

    await expect(page.getByText("Possible company mismatch")).toBeVisible({ timeout: 10_000 });
  });

  test("it says why it is asking, and grants that the reader may be right", async ({ page }) => {
    // The sentence does real work: it explains the evidence, concedes the limits of that evidence,
    // and names the ordinary situations that produce this. Without it the box reads as an accusation.
    await openDates(page);

    await pickOverlappingPeriod(page);

    await expect(page.getByText(/Other reviews place this manager at a different company/i))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/You may still be right/i)).toBeVisible();
    await expect(page.getByText(/Dual roles, contracting, and transitions happen/i)).toBeVisible();
  });

  test("the form will not advance while the question is unanswered", async ({ page }) => {
    // A warning that can be scrolled past is decoration. The point is to make somebody look at the
    // dates once before the review is filed against a company nobody else places them at.
    await openDates(page);

    await pickOverlappingPeriod(page);

    await expect(page.getByText("Possible company mismatch")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("standing by the dates lets the review through", async ({ page }) => {
    /*
      The answer that has to work. Somebody who contracted at two places at once, or moved mid-year,
      is telling the truth - and a product that refuses their review because the majority disagrees
      would systematically lose exactly the accounts that are hardest to get.
    */
    await openDates(page);
    await pickOverlappingPeriod(page);
    await expect(page.getByText("Possible company mismatch")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Yes, continue" }).click();

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled();
  });

  test("going back clears the dates rather than leaving them half-questioned", async ({ page }) => {
    // The other reading: the dates were the mistake. Clearing them puts the reader back at the
    // question with nothing to unpick, rather than leaving a period they have just been told to
    // doubt sitting in the form.
    await openDates(page);
    await pickOverlappingPeriod(page);
    await expect(page.getByText("Possible company mismatch")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Go back" }).click();

    await expect(page.getByLabel("From month")).toHaveValue("");
    await expect(page.getByLabel("From year")).toHaveValue("");
  });

  test("going back also unticks still-working-here", async ({ page }) => {
    await openDates(page);
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2020");
    await page.getByRole("checkbox", { name: /current/i }).check();
    await expect(page.getByText("Possible company mismatch")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Go back" }).click();

    await expect(page.getByRole("checkbox", { name: /current/i })).not.toBeChecked();
  });
});

test.describe("Periods that are not a disagreement", () => {
  test("a period outside every other account raises nothing", async ({ page }) => {
    await openDates(page);

    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2023");

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
  });

  test("agreeing with the company nobody argues", async ({ page }) => {
    /*
      Keyed on the company, not merely on the dates. An overlapping period at the *same* company is
      two people describing the same job, which is the ordinary case and the whole point of the
      product.
    */
    await openDates(page, [{ ...SEGMENT_ELSEWHERE, company: MOCK_MANAGER.company }]);

    await pickOverlappingPeriod(page);

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
  });

  test("a segment nobody has reviewed is not evidence of anything", async ({ page }) => {
    // The warning's authority comes from other people having reviewed that period. A career entry
    // with no reviews behind it is an unverified claim, and cannot be used to doubt another one.
    await openDates(page, [{ ...SEGMENT_ELSEWHERE, reviewCount: 0 }]);

    await pickOverlappingPeriod(page);

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
  });

  test("a half-filled period is not judged yet", async ({ page }) => {
    // Raising it after one select is answered would put the warning on screen while somebody is
    // mid-way through typing the very thing it is complaining about.
    await openDates(page);

    await page.getByLabel("From year").selectOption("2020");

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
  });

  test("a manager with no career segments at all raises nothing", async ({ page }) => {
    await openDates(page, []);

    await pickOverlappingPeriod(page);

    await expect(page.getByText("Possible company mismatch")).toHaveCount(0);
  });
});
