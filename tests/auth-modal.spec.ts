/* ROUTINE CI: authentication: social-first disclosure and dismissal. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  mockManagerPage,
  mockTurnstile,
  rateAllFiveStars,
  clickWriteAReview,
  attestFirstHandExperience,
  advanceToDatesStep,
  fillDatesAndAdvance,
} from "./fixtures";

test.describe("Auth modal - social-first flow @ci", () => {
  test.beforeEach(async ({ page }) => {
    await mockManagerPage(page);
  });

  async function openAuthModal(page: any) {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit review/i }).click();
  }

  test("auth modal shows social buttons first, not the email form", async ({
    page,
  }) => {
    await openAuthModal(page);

    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });

    // Email/password fields should NOT be visible yet
    await expect(page.locator('input[type="email"]').first()).not.toBeVisible();
  });

  test("clicking 'continue with email' reveals the email form", async ({
    page,
  }) => {
    await openAuthModal(page);

    await page
      .getByRole("button", { name: /continue with email/i })
      .or(page.getByText(/continue with email/i).first())
      .click();

    // Email field now visible (input with email type or email placeholder)
    await expect(
      page.locator('input[type="email"], input[placeholder*="example.com"]').first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("email form has a back button to return to social options", async ({
    page,
  }) => {
    await openAuthModal(page);

    await page
      .getByRole("button", { name: /continue with email/i })
      .or(page.getByText(/continue with email/i).first())
      .click();

    // "Other sign-up options" is the in-modal back button (not the form's Back)
    const backBtn = page.getByRole("button", { name: /other sign.up options/i }).first();

    await expect(backBtn).toBeVisible({ timeout: 3_000 });
    await backBtn.click();

    /*
      Social buttons visible again.

      10s, not 3s: this step re-renders the modal back to the social picker, and under a loaded
      parallel run firefox intermittently took longer than three seconds to paint it. It passed
      alone and failed in the full suite, which is a timeout that is too tight rather than a
      behaviour that is wrong.
    */
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  /*
    TWO TURNSTILE TESTS STOOD HERE, and what they guaranteed has moved rather than gone.

      "submit is disabled until all fields valid and Turnstile completes"
      "shows error when Turnstile fails to load"

    Turnstile guarded THIS MODAL'S OWN account creation, which no longer exists: the account is
    created on Auth0's hosted page, which has its own bot and brute-force protection. A CAPTCHA in
    front of a button that only performs a redirect protects nothing, so keeping the widget would
    have been theatre.

    The abuse-prevention guarantee worth asserting is therefore not "a CAPTCHA renders" but that
    no unprotected account-creation path leaves this client at all - which is asserted by
    "no account-creation or sign-in request leaves the client" in auth-modal-flows.spec.ts.

    What remains here is the half of the old assertion that is still ours: the submit cannot be
    pressed with nothing filled in.
  */
  test("the email step cannot be submitted empty", async ({ page }) => {
    await openAuthModal(page);

    await page
      .getByRole("button", { name: /continue with email/i })
      .or(page.getByText(/continue with email/i).first())
      .click();

    const submit = page.getByRole("dialog").getByRole("button", { name: /^continue$/i });
    await expect(submit).toBeDisabled({ timeout: 5_000 });

    await page.getByRole("dialog").getByLabel(/^email$/i).fill("someone@example.com");
    await expect(submit).toBeEnabled({ timeout: 5_000 });
  });

  test("can switch between sign up and sign in views", async ({ page }) => {
    await openAuthModal(page);

    // Auth modal is open - confirm it with the Google button
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });

    // The modal should offer a way to sign in (already have an account)
    await expect(
      page.getByRole("dialog").getByText(/already have an account/i)
    ).toBeVisible();
  });
});
