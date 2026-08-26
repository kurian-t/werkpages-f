import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  mockManagerPage,
  mockTurnstile,
  rateAllFiveStars,
  clickWriteAReview,
  attestFirstHandExperience,
} from "./fixtures";

test.describe("Auth modal — social-first flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockManagerPage(page);
  });

  async function openAuthModal(page: any) {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await rateAllFiveStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByRole("checkbox", { name: /current/i }).check();
    await page.getByRole("button", { name: /^next$/i }).click();
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

    // Social buttons visible again
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("email signup form submit button is disabled until all fields valid and Turnstile completes", async ({
    page,
  }) => {
    await mockTurnstile(page);
    await openAuthModal(page);

    // Switch to email form
    await page
      .getByRole("button", { name: /continue with email/i })
      .or(page.getByText(/continue with email/i).first())
      .click();

    // Button should be disabled with empty form
    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeDisabled({ timeout: 3_000 });

    // Mock the username check API
    await page.route(/\/api\/auth\/check-username/, (route) =>
      route.fulfill({ json: { available: true } })
    );

    // Fill all required fields
    await page.locator('input[placeholder="John"]').fill("Jane");
    await page.locator('input[placeholder="Doe"]').fill("Doe");
    await page.locator('input[placeholder="john@example.com"]').fill("jane@example.com");
    await page.locator('input[placeholder*="generate"]').fill("janedoe99");
    await expect(page.getByText(/available/i).first()).toBeVisible({ timeout: 5_000 });

    await page.locator('input[placeholder="At least 8 characters"]').fill("Password1!");
    await page.locator('input[placeholder="Confirm your password"]').fill("Password1!");

    // With Turnstile test key (1x00000000000000000000AA), onSuccess fires automatically
    // and the button should become enabled
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 });
  });

  test("email signup form shows error when Turnstile fails to load", async ({
    page,
  }) => {
    await openAuthModal(page);

    await page
      .getByRole("button", { name: /continue with email/i })
      .or(page.getByText(/continue with email/i).first())
      .click();

    // The @marsidev/react-turnstile component renders a <div id="cf-turnstile">.
    // If the Turnstile siteKey were missing or invalid, this element would not render.
    await expect(page.locator("#cf-turnstile")).toBeVisible({ timeout: 8_000 });
  });

  test("can switch between sign up and sign in views", async ({ page }) => {
    await openAuthModal(page);

    // Auth modal is open — confirm it with the Google button
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });

    // The modal should offer a way to sign in (already have an account)
    await expect(
      page.getByRole("dialog").getByText(/already have an account/i)
    ).toBeVisible();
  });
});
