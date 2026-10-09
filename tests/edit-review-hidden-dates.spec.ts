import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

/**
 * Reopening a review whose author hid their working period.
 *
 * <h2>The bug</h2>
 *
 * The Work timeline step opened empty, and the hide-dates box opened unticked, for somebody who
 * had filled both in. The API masks these dates on every surface, including the author's own view,
 * so the form received nulls and had nothing to show. The toggle was not wired into this form at
 * all.
 *
 * That was not merely cosmetic. The UPDATE writes `worked_from` and `worked_until`
 * unconditionally, and the server reads `datesHidden` with a default of false, so saving an
 * unrelated change - a star, a title - wrote NULL over both dates and republished the review with
 * the privacy flag cleared. Editing destroyed data, silently, and the only clue was a form that
 * looked like it had never been filled in.
 *
 * <h2>What is asserted</h2>
 *
 * The author's own dates come back and seed the fields; the stored choice seeds the toggle; and
 * toggling it is reflected immediately and sent on save. The backend half - that these dates reach
 * their author and nobody else - is asserted in ManagerServiceCoverage2IntegrationTest, because a
 * mocked API here cannot prove what the server will serve.
 */

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };

/*
  What the API now sends its author: the real dates AND the flag. Every other reader gets nulls
  with the same flag, which is the case the integration tests cover.
*/
const MINE_HIDDEN = {
  ...MOCK_EXISTING_REVIEW,
  id: "rv-hidden",
  disposition: "live",
  workedFrom: "2021-03-01",
  workedUntil: "2022-11-01",
  datesHidden: true,
};

async function openTimelineStep(page: any, review: unknown) {
  await mockManagerPage(page, {
    loggedIn: true, user: CONTRIBUTOR, existingUserReviews: [review as any],
  });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
    .toBeVisible({ timeout: 10_000 });

  // Two clicks: the first opens a picker, because there can be up to five reviews of one manager.
  await page.getByRole("button", { name: "Edit Your Review" }).click();
  await page.getByRole("button", { name: /Engineering Manager at Acme Corp/ }).click();
  await expect(page.getByRole("heading", { name: /update your review/i }))
    .toBeVisible({ timeout: 10_000 });

  // Step 2 is the Work timeline. Identified by its fields rather than its heading: "Work
  // timeline" is both the modal's step title and the fieldset's own heading, so the text matches
  // twice and a strict locator refuses it.
  await page.getByRole("button", { name: /^next$/i }).first().click();
  await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
}

test.describe("Editing a review whose dates are hidden", () => {
  test("the work timeline opens with the dates that were stored", async ({ page }) => {
    /*
      The heart of it. These fields were blank, and because the save writes both columns
      unconditionally, blank meant "erase them" the moment anything else was changed.
    */
    await openTimelineStep(page, MINE_HIDDEN);

    await expect(page.getByLabel("From month")).toHaveValue("03");
    await expect(page.getByLabel("From year")).toHaveValue("2021");
    await expect(page.getByLabel("Until month")).toHaveValue("11");
    await expect(page.getByLabel("Until year")).toHaveValue("2022");
  });

  test("the hide-dates box opens ticked, because that is what its author chose", async ({ page }) => {
    await openTimelineStep(page, MINE_HIDDEN);

    await expect(page.getByRole("checkbox", { name: /hide/i })).toBeChecked();
  });

  test("a review with visible dates opens with the box unticked", async ({ page }) => {
    // The control. The toggle must reflect what is stored, not default one way for everybody.
    await openTimelineStep(page, { ...MOCK_EXISTING_REVIEW, id: "rv-open", disposition: "live" });

    await expect(page.getByRole("checkbox", { name: /hide/i })).not.toBeChecked();
  });

  test("the box can be toggled, and the dates stay in the form either way", async ({ page }) => {
    /*
      Hiding is a decision about who may READ the dates, not an instruction to discard them. A
      toggle that blanked the fields would be the data-loss bug wearing a different hat.
    */
    await openTimelineStep(page, MINE_HIDDEN);
    const box = page.getByRole("checkbox", { name: /hide/i });

    await box.uncheck();
    await expect(box).not.toBeChecked();
    await expect(page.getByLabel("From month")).toHaveValue("03");

    await box.check();
    await expect(box).toBeChecked();
    await expect(page.getByLabel("From year")).toHaveValue("2021");
  });

  test("the review card shows no period at all, not the words \"Dates hidden\"", async ({ page }) => {
    /*
      Regression, and a self-inflicted one.

      The card renders its period line only when there is a date to put in it. That used to hide
      this case for free, because the API nulled both dates for every reader. Serving the author
      their own dates - needed so their edit form can open with them - made the condition true, and
      formatReviewPeriod's hidden label appeared on the card for the first time.

      Aligned with the company rating card, which had the same text removed. The picker in "Your
      Reviews - select to edit" still names the choice on purpose, so this asserts the CARD only.
    */
    await mockManagerPage(page, {
      loggedIn: true, user: CONTRIBUTOR, existingUserReviews: [MINE_HIDDEN as any],
    });
    /*
      Registered after mockManagerPage so it wins - Playwright matches routes in reverse
      registration order. The shared helper always answers the PUBLIC review list with an empty
      array, so without this the card under test never renders at all and the assertion would
      pass for the wrong reason.
    */
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/reviews**`, (r: any) => {
      if (r.request().method() !== "GET") return r.fallback();
      return r.fulfill({ json: { data: [MINE_HIDDEN], total: 1, limit: 50, offset: 0 } });
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
      .toBeVisible({ timeout: 10_000 });

    // The review itself is on the page, so this is not passing because nothing rendered.
    await expect(page.getByText("Engineering Manager at Acme Corp").first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/dates hidden/i)).toHaveCount(0);
  });

  test("saving sends the choice, rather than letting the server default it away", async ({ page }) => {
    /*
      The regression that cost the data. The payload omitted datesHidden, the server read it with a
      default of false, and an edit therefore republished dates its author had hidden. Asserted on
      the request body, because that is the thing that was missing.
    */
    await openTimelineStep(page, MINE_HIDDEN);

    let body: any = null;
    await page.route("**/api/managers/*/reviews/rv-hidden", (r: any) => {
      if (r.request().method() !== "PUT") return r.fallback();
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { ...MINE_HIDDEN } });
    });

    // On to step 3 and save.
    await page.getByRole("button", { name: /^next$/i }).first().click();
    await page.getByRole("button", { name: /save|update review/i }).first().click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.datesHidden).toBe(true);
    // The dates travel with it, so the unconditional UPDATE writes them back rather than NULL.
    expect(body.workedFrom).toBe("2021-03");
    expect(body.workedUntil).toBe("2022-11");
  });
});
