// FIXME: these cover ContributionNextStep, which duplicated a nudge that already
// existed as a toast in BossProfile. The dialog is no longer opened; the toast is the
// single nudge. Kept visible rather than deleted pending a decision on which design
// to keep - see review-submit-guards-and-nudge.spec.ts for the surviving one.
import { test, expect } from "./base";
import {
  MOCK_USER, MOCK_MANAGER, TEST_COMPANY_SLUG, TEST_MANAGER_SLUG, mockManagerPage,
  clickWriteAReview, advanceToDatesStep, fillDatesAndAdvance, rateAllFiveStars,
  attestFirstHandExperience,
} from "./fixtures";

/**
 * What happens after a contribution lands.
 *
 * Every contribution used to end in a toast and a dead end: a workplace rating navigated back to
 * the company, a manager rating closed its modal. That throws away the one moment when somebody
 * has demonstrably just done the thing we want more of - signed in, company in mind, ten
 * questions already answered. Taking the average contributor from one answer to two doubles the
 * corpus with no extra traffic, which is the only growth lever here that does not depend on
 * Google.
 *
 * The company is always carried into the next step. A flow that sends somebody back to a search
 * box for the employer they just described loses most of them there.
 */

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 0, totalReviews: 0, avgRating: null, managers: [],
};

async function openForm(page: any) {
  const user = { ...MOCK_USER, hasContributed: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/companies/red-hat/rating", (r: any) => {
    if (r.request().method() === "POST") return r.fulfill({ json: { id: "r1", overallRating: 4 } });
    return r.fulfill({ json: { review: null } });
  });
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.goto("/companies/red-hat/rate");
}

/** Through the three steps and submitted, with every category answered. */
async function submitRating(page: any) {
  await expect(page.getByText(/Step 1 of 3 · Red Hat/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption({ index: 3 });
  await page.getByRole("checkbox", { name: /current/i }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/Step 3 of 3 · Red Hat/)).toBeVisible();

  // Every category, because the form refuses a half-answered submission by design.
  const stars = page.getByRole("button", { name: /: 4 stars$/ });
  const n = await stars.count();
  for (let i = 0; i < n; i++) await stars.nth(i).click();
  await page.locator('input[name="attestation"]').check();
  await page.getByRole("button", { name: /submit rating|update rating/i }).click();
}

test.describe.fixme("After a workplace rating", () => {
  test("the flow does not end - it asks for the other half of the contribution", async ({ page }) => {
    await openForm(page);
    await submitRating(page);

    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your workplace rating was submitted")).toBeVisible();
    await expect(page.getByText("Worked with a manager at Red Hat?")).toBeVisible();
  });

  test("the offer names the company, so nobody is asked to find it again", async ({ page }) => {
    await openForm(page);
    await submitRating(page);

    await expect(page.getByTestId("next-step-primary")).toHaveText(/Rate a manager at Red Hat/);
  });

  test("taking it goes to that company, not to a search box", async ({ page }) => {
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();

    // The company page is where managers at a company are found. Landing anywhere else would mean
    // retyping the employer that was just submitted.
    await expect(page).toHaveURL(/\/companies\/red-hat(\?|$)/, { timeout: 10_000 });
  });

  test("declining still finishes the submission", async ({ page }) => {
    /*
      The rating is already saved by the time this is asked - the offer is never a condition of
      the contribution, and "Not now" must never read as cancelling what was just submitted.
    */
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-dismiss").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(page).toHaveURL(/\/companies\/red-hat(\?|$)/, { timeout: 10_000 });
  });

  test("it can be dismissed with the close control too", async ({ page }) => {
    await openForm(page);
    await submitRating(page);
    // Scoped to the dialog: the rating form has its own close control behind it.
    await page.getByTestId("contribution-next-step")
      .getByRole("button", { name: "Close" }).click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
  });
});

test.describe.fixme("After a manager rating", () => {
  /*
    The other direction, and the more valuable one: workplace ratings are the thinner dataset, and
    somebody who has just answered ten questions about a manager has exactly the experience a
    workplace rating asks for.
  */
  async function submitManagerReview(page: any) {
    await page.route("**/api/auth/me", (r: any) =>
      r.fulfill({ json: { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true } }));
    await mockManagerPage(page, { manager: MOCK_MANAGER, loggedIn: true });
    await page.addInitScript(() => localStorage.setItem("authUser", JSON.stringify(
      { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true })));

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    await clickWriteAReview(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "03", fromYear: "2024" });
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await expect(page.getByText(/your review of alex johnson is live/i))
      .toBeVisible({ timeout: 10_000 });
  }

  test("the flow does not end at the toast", async ({ page }) => {
    await submitManagerReview(page);

    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your rating was submitted anonymously")).toBeVisible();
    await expect(page.getByText("Want to share a little more?")).toBeVisible();
  });

  test("it names the employer they just rated a manager at", async ({ page }) => {
    // The whole point of asking here rather than later: we already know the company, so they are
    // never sent to a search box for it.
    await submitManagerReview(page);
    await expect(page.getByText(/You also worked at Acme Corp/)).toBeVisible();
  });

  test("rating the workplace is the primary offer", async ({ page }) => {
    /*
      Ordered deliberately. Workplace ratings are the far thinner dataset, so the scarcer
      contribution is the one put in front of them; rating another manager is offered second
      rather than hidden, because people who stayed somewhere had more than one.
    */
    await submitManagerReview(page);
    await expect(page.getByTestId("next-step-primary")).toHaveText(/Rate Acme Corp/);
    await expect(page.getByTestId("next-step-secondary")).toHaveText(/Rate another Acme Corp manager/);
  });

  test("taking it opens that company's rating form, carrying a way back", async ({ page }) => {
    await submitManagerReview(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/\/companies\/acme-corp\/rate/, { timeout: 10_000 });
    // returnTo, so finishing the workplace rating lands back on the manager they started from
    // rather than dumping them on a company page they did not ask for.
    await expect(page).toHaveURL(/returnTo=/);
  });

  test("the second offer goes to that company, scoped, not to a blank search", async ({ page }) => {
    await submitManagerReview(page);
    await page.getByTestId("next-step-secondary").click();

    await expect(page).toHaveURL(/\/companies\/acme-corp(\?|$)/, { timeout: 10_000 });
  });

  test("declining leaves them on the profile with the rating saved", async ({ page }) => {
    // The review is already written. Dismissing must not read as undoing it, and must not move
    // them off the page they chose to be on.
    await submitManagerReview(page);
    await page.getByTestId("next-step-dismiss").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(page).toHaveURL(/\/companies\/acme-corp\/managers\/alex-johnson/);
  });
});
