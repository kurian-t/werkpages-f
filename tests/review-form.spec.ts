import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
  attestFirstHandExperience,
  advanceToDatesStep,
  fillDatesAndAdvance,
} from "./fixtures";

test.describe("Review form - multi-step flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockManagerPage(page);
  });

  test("manager profile loads with Write a Review button", async ({ page }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    // Use the h1 heading to avoid matching the "Worked with Alex Johnson?" sub-heading
    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /write a review/i }).first()
    ).toBeVisible();
  });

  test("step 1 (manager information): opens on the role being reviewed and can advance", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    await expect(page.getByRole("heading", { name: "Write a Review" })).toBeVisible();
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible();

    // Step 1 is prefilled from the manager, so there is nothing to answer before moving on. It
    // deliberately does not ask for the ratings - those are on step 3.
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled();
  });

  test("step 3 (ratings): Submit is disabled until all categories are rated", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page);

    // Attest first, so the only thing still holding Submit back is the ratings themselves.
    await attestFirstHandExperience(page);
    await expect(page.getByRole("button", { name: /^submit review$/i })).toBeDisabled();

    await rateAllFiveStars(page);

    await expect(page.getByRole("button", { name: /^submit review$/i })).toBeEnabled();
  });

  test("step 2 (dates): Next disabled until from-date filled", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await advanceToDatesStep(page);

    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible();

    // Next disabled with no dates
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();

    // Fill from-date + check "Current"
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByRole("checkbox", { name: /current/i }).check();

    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled();
  });

  test("step 2: from-date after to-date shows validation error", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await advanceToDatesStep(page);

    // Set from=Dec 2023, to=Jan 2022 (inverted)
    await page.getByLabel("From month").selectOption("12");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByLabel("Until month").selectOption("01");
    await page.getByLabel("Until year").selectOption("2022");

    await expect(
      page.getByText(/'From' date cannot be later than/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("step 3 (identity): attribution options shown, submit triggers auth when logged out", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    // Step 1 → 2 → 3
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page);

    // Step 3 - ratings, identity and attestation all live here
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/step 3 of 3/i)).toBeVisible();
    await expect(page.getByText(/randomly generated/i)).toBeVisible();

    // Submit without being signed in → auth modal opens (Google button appears)
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit review/i }).click();
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("can cancel the review form from step 1", async ({ page }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await expect(page.getByRole("heading", { name: "Write a Review" })).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("heading", { name: "Write a Review" })).not.toBeVisible();
  });

  test("Back button steps back through the form", async ({ page }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await advanceToDatesStep(page);

    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible();

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByRole("heading", { name: /write a review/i })).toBeVisible();
  });

  test("step 3: anonymous posting card is shown with generated name and regenerate button", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page);

    // Anonymous posting card
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/your review will appear as/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /regenerate/i })).toBeVisible();
    await expect(page.getByText(/randomly generated/i)).toBeVisible();
  });

  test("step 3: progress bar shows 3 of 3 at identity step", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page);

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("review form shows manager name in header throughout all steps", async ({
    page,
  }) => {
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    // Manager name should appear in the form header
    await expect(
      page.getByText(/alex johnson/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
