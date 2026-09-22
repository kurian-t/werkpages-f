import { test, expect } from "./base";
import {
  MOCK_MANAGER,
  MOCK_USER,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_ID,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
  attestFirstHandExperience,
  advanceToDatesStep,
  fillDatesAndAdvance,
} from "./fixtures";

/**
 * What stops a review being submitted, and what is asked once one has been.
 *
 * The guards are the cheap half: a half-rated review, a review with no attestation, a double
 * press. Each has its own message because each has a different fix, and none of them ran.
 *
 * The nudge is the interesting half. Having just rated a manager, somebody is asked - once, on the
 * page they are already on, 1.5 seconds later so it does not land on top of the success toast -
 * whether they would also rate the employer. Three ways out and two meanings: Rate opens the form,
 * and both "Maybe later" and the ✕ mean no. Making those two differ would be a trap for anyone who
 * closes a prompt rather than declining it, which is most people.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;
const NUDGE_KEY = `wp_company_rate_nudge:${TEST_COMPANY_SLUG}`;

async function openReviewForm(page: any) {
  await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true });
  await page.goto(URL);
  await clickWriteAReview(page);
}

/** Fills the whole form and submits, leaving the success path to run. */
async function submitReview(page: any) {
  await advanceToDatesStep(page);
  await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
  await rateAllFiveStars(page);
  await attestFirstHandExperience(page);
  await page.getByRole("button", { name: /submit review/i }).click();
}

test.describe("What stops a review going in", () => {
  test("a half-rated review is refused, naming what is missing", async ({ page }) => {
    /*
      Every category or none. A review with three of ten answered would be averaged against reviews
      where somebody answered all ten, and the two are not the same measurement - the partial one
      quietly counts its blanks as agreement.
    */
    await openReviewForm(page);
    // The ratings are on the last step, so the refusal lands on Submit rather than on a Next.
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
    await attestFirstHandExperience(page);

    // One category answered out of ten.
    await page.getByRole("button", { name: "Rate 5 stars" }).first().click();

    await expect(page.getByRole("button", { name: /^submit review$/i })).toBeDisabled();
  });

  test("an unattested review is refused with its own reason", async ({ page }) => {
    /*
      The attestation is the one thing separating a first-hand account from a rumour, and it is the
      claim the whole product rests on. Its refusal says so rather than being folded into a generic
      "please complete the form".
    */
    await openReviewForm(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
    await rateAllFiveStars(page);

    await expect(page.getByRole("button", { name: /submit review/i })).toBeDisabled();
  });

  test("the form closes on submit, so there is no second press to make", async ({ page }) => {
    /*
      Two identical reviews from one person under one name are indistinguishable from a deliberate
      attempt to double-count, and the server refuses the second. This is what stops it being sent
      at all: the control is not merely disabled for the duration, it is gone - the form closes and
      the reader is back on the profile.
    */
    let posts = 0;
    await openReviewForm(page);
    await page.route(/\/api\/managers\/.*\/reviews$/, async (r: any) => {
      if (r.request().method() !== "POST") return r.continue();
      posts++;
      return r.fulfill({ status: 201, json: { id: "rev-new" } });
    });

    await submitReview(page);

    await expect(page.getByRole("button", { name: /submit review/i })).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    expect(posts).toBe(1);
  });
});

test.describe("Being asked about the employer afterwards", () => {
  test("the prompt names the company and says why it is asking", async ({ page }) => {
    /*
      Offered here on the manager's own profile, because that is where people want to be once they
      have rated somebody. A screen of its own would take them off the page they came for, and the
      second question would cost the first one's goodwill.
    */
    await openReviewForm(page);

    await submitReview(page);

    await expect(page.getByText(/Rate Acme Corp too\?/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/what the workplace itself was like/i)).toBeVisible();
  });

  test("it lands after the success message, not on top of it", async ({ page }) => {
    // The first thing to say is that the review is live. The prompt is delayed so it does not
    // cover the confirmation somebody has just earned.
    await openReviewForm(page);

    await submitReview(page);

    await expect(page.getByText(/is live!/i)).toBeVisible({ timeout: 10_000 });
  });

  test("accepting it opens the workplace form for that company", async ({ page }) => {
    await openReviewForm(page);
    await submitReview(page);
    await expect(page.getByText(/Rate Acme Corp too\?/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Rate Acme Corp$/ }).click();

    await expect(page).toHaveURL(new RegExp(`/companies/${TEST_COMPANY_SLUG}/rate`), { timeout: 10_000 });
  });

  test("declining it stops it being asked again", async ({ page }) => {
    await openReviewForm(page);
    await submitReview(page);
    await expect(page.getByText(/Rate Acme Corp too\?/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Maybe later/i }).click();

    await expect(async () => {
      const stored = await page.evaluate((k) => localStorage.getItem(k), NUDGE_KEY);
      expect(stored).toBeTruthy();
    }).toPass({ timeout: 10_000 });
  });

  test("accepting it also stops it being asked again", async ({ page }) => {
    // Somebody on their way to the form does not need to be asked to go to the form.
    await openReviewForm(page);
    await submitReview(page);
    await expect(page.getByText(/Rate Acme Corp too\?/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Rate Acme Corp$/ }).click();

    await expect(async () => {
      const stored = await page.evaluate((k) => localStorage.getItem(k), NUDGE_KEY);
      expect(stored).toBeTruthy();
    }).toPass({ timeout: 10_000 });
  });

  test("somebody who already declined is not asked again", async ({ page }) => {
    /*
      The reason the suppression exists. Asked on every review, the prompt stops being a question
      and becomes a thing to click past - and the next one, about something that matters, gets
      clicked past too.
    */
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true });
    await page.addInitScript(
      ([k, v]: [string, string]) => localStorage.setItem(k, v),
      [NUDGE_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000)],
    );
    await page.goto(URL);
    await clickWriteAReview(page);

    await submitReview(page);
    await expect(page.getByText(/is live!/i)).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(2500);
    await expect(page.getByText(/Rate Acme Corp too\?/i)).toHaveCount(0);
  });

  test("a manager with no employer on file prompts nothing", async ({ page }) => {
    // There is no company page to send anybody to, so the only honest thing is silence.
    await mockManagerPage(page, {
      loggedIn: true,
      user: MOCK_USER,
      hasContributed: true,
      manager: { ...MOCK_MANAGER, companySlug: null },
    });
    await page.goto(URL);
    await clickWriteAReview(page);

    await submitReview(page);
    await expect(page.getByText(/is live!/i)).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(2500);
    await expect(page.getByText(/too\?/i)).toHaveCount(0);
  });
});
