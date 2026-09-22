import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
  advanceToDatesStep,
  fillDatesAndAdvance,
} from "./fixtures";

/**
 * What the review form does with each answer the server can give it.
 *
 * The form itself was well covered; everything after the request was not. That is the wrong half
 * to leave untested - by the time somebody reaches submit they have spent two minutes on ten
 * ratings and a date range, and every branch below decides whether they get told what actually
 * happened or a shrug.
 *
 * Each 409 here is a different rule with a different remedy, and the form has to say which:
 * "you've hit the limit", "you already reviewed this role, change the title", "you deleted one
 * recently, come back on this date". Collapsing them into one message sends somebody to retype a
 * form that was never going to be accepted.
 */

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };

/** Fills the form to the point where Submit is live. */
async function fillToSubmit(page: any) {
  await clickWriteAReview(page);
  await advanceToDatesStep(page);
  await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
  await rateAllFiveStars(page);
  await expect(page.getByText(/step 3 of 3/i)).toBeVisible();
  // The first-hand-experience attestation gates Submit. It is the one thing on this step that has
  // to be a deliberate act, so nothing here can reach the server without it.
  await page.locator('input[name="attestation"]').check();
}

/**
 * Answers the review POST with one specific refusal.
 *
 * Registered after mockManagerPage so it wins - Playwright matches routes in reverse registration
 * order and the fixture's own review route would otherwise answer.
 */
async function refuseWith(page: any, status: number, body: unknown) {
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
    if (r.request().method() !== "POST") return r.fulfill({ json: { data: [], total: 0 } });
    return r.fulfill({ status, json: body });
  });
}

async function open(page: any) {
  await mockManagerPage(page, { loggedIn: true, user: CONTRIBUTOR });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
    .toBeVisible({ timeout: 10_000 });
}

test.describe("When the server refuses a review", () => {
  test("hitting the per-manager limit says so, with the number", async ({ page }) => {
    // Five is the cap. A person at it needs to know the cap exists, not that "something" failed.
    await open(page);
    await refuseWith(page, 409, { message: "role_limit_reached" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/limit of 5 reviews/i)).toBeVisible({ timeout: 10_000 });
  });

  test("an existing review of the same role points at the field that fixes it", async ({ page }) => {
    /*
      The remedy is to change the title, so the message lands on the title field rather than in the
      general error box. One review per role, per person - two reviews of the same job by the same
      author are the same opinion counted twice.
    */
    await open(page);
    await refuseWith(page, 409, { message: "already_reviewed_this_role" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    // Back on the ratings step, where the title lives and the message renders. Setting the error
    // without moving left a greyed-out Submit and the explanation on an unseen screen.
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/already submitted a review for this role/i)).toBeVisible();
    await expect(page.getByText(/change the title/i)).toBeVisible();
  });

  test("a deletion cooldown names the date they can come back", async ({ page }) => {
    /*
      The cooldown stops delete-and-resubmit from refunding the daily allowance. Saying "you are in
      a cooldown" without the date leaves somebody guessing and retrying, so the server sends the
      date and the form prints it.
    */
    await open(page);
    await refuseWith(page, 409, { message: "review_cooldown:2026-11-20" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/recently deleted a review/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/November 20, 2026/)).toBeVisible();
  });

  test("a cooldown with no date still says something useful", async ({ page }) => {
    // The fallback branch. A malformed code must not print "undefined" at somebody.
    await open(page);
    await refuseWith(page, 409, { message: "review_cooldown:" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/30 days after your deletion/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/undefined|Invalid Date/)).toHaveCount(0);
  });

  test("a date problem lands on the dates, not in the general error box", async ({ page }) => {
    // Routed by what the message is about, so the person is looking at the field they must change.
    await open(page);
    await refuseWith(page, 400, { message: "The 'from' date cannot be in the future" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/cannot be in the future/i)).toBeVisible();
  });

  test("a title problem lands on the title", async ({ page }) => {
    await open(page);
    await refuseWith(page, 400, { message: "That title is too long" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/that title is too long/i)).toBeVisible();
  });

  test("any other 400 is shown in the server's own words", async ({ page }) => {
    // The server said something specific; flattening it to a generic message throws that away.
    await open(page);
    await refuseWith(page, 400, { message: "Your account is not eligible to review yet" });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/not eligible to review yet/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a server fault falls back to a message rather than nothing", async ({ page }) => {
    /*
      The one branch where there is nothing specific to say. It still has to say something - a
      submit that appears to do nothing reads as a broken button, and people click it again.
    */
    await open(page);
    await refuseWith(page, 500, {});
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/failed to submit review/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a refusal leaves the answers on screen rather than throwing them away", async ({ page }) => {
    /*
      Submit stays disabled while an error stands - deliberately, so the same rejected request is
      not fired again on a second click. What matters is that the work survives: the ratings, the
      dates and the step are all still there to be corrected.
    */
    await open(page);
    await refuseWith(page, 500, {});
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();
    await expect(page.getByText(/failed to submit review/i)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible();
    await expect(page.locator('input[name="attestation"]')).toBeChecked();
  });
});

test.describe("When the server accepts a review", () => {
  test("a published review says so and closes the form", async ({ page }) => {
    await open(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { data: [], total: 0 } });
      return r.fulfill({ status: 201, json: { ...MOCK_EXISTING_REVIEW, disposition: "live" } });
    });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/is live/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a held review is not called live, and leads to the proof screen", async ({ page }) => {
    /*
      The lie this prevents: the toast used to say "is live!" unconditionally and open the gate
      locally. For a held rating both are false, and the author would find out by seeing everything
      still locked with no explanation. The copy leads with the rating being safe, because "one
      more step" reads very differently to somebody who fears the last two minutes are gone.
    */
    await open(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { data: [], total: 0 } });
      return r.fulfill({ status: 201, json: { ...MOCK_EXISTING_REVIEW, disposition: "held" } });
    });
    await fillToSubmit(page);

    await page.getByRole("button", { name: /submit|post/i }).first().click();

    await expect(page.getByText(/is saved/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/is live/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/managers\/.*\/confirm/, { timeout: 10_000 });
  });
});
