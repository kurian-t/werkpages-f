import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_SLUG,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  RATING_CATEGORIES,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
} from "./fixtures";

const FULL_RATINGS = Object.fromEntries(RATING_CATEGORIES.map((c) => [c, 5]));

/** A career segment from a different company that overlaps with MOCK_EXISTING_REVIEW's dates */
const CONFLICTING_SEGMENT = {
  company: "Other Corp",
  role: "Engineering Manager",
  startDate: "2020-01",
  endDate: "2023-12",
  isCurrent: false,
  averageRating: 3,
  reviewCount: 1,
  categoryAverages: Object.fromEntries(RATING_CATEGORIES.map((c) => [c, 3])),
};

/** Injects a pending draft that matches the existing review's title+company */
async function injectPendingDraft(page: any) {
  await page.addInitScript(({ managerId, ratings }: any) => {
    localStorage.setItem(
      "rmm_pending_review",
      JSON.stringify({
        managerId,
        modalRatings: ratings,
        reviewManagerTitle: "Engineering Manager",
        reviewManagerCompany: "Acme Corp",
        reviewWorkedFrom: { month: "03", year: "2024" },
        reviewWorkedUntil: { month: "", year: "" },
        reviewCurrentlyWorking: true,
        savedAt: Date.now(),
      })
    );
  }, { managerId: TEST_MANAGER_ID, ratings: FULL_RATINGS });
}

test.describe("Duplicate review — conflict UI after auth", () => {
  /**
   * Simulates returning from OAuth with a pending draft that matches an existing
   * review. The draft-restore effect detects the authenticated user + draft,
   * sets pendingAutoSubmit, and the validation effect detects isDuplicateTitle
   * → shows the conflict decision UI instead of the Submit Review button.
   */
  test("shows conflict decision UI when returning from OAuth with a duplicate draft", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    // The form should re-open on the identity step
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({
      timeout: 10_000,
    });

    // Conflict UI instead of Submit button
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("button", { name: /edit my existing review/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /replace my existing review/i })
    ).toBeVisible();

    // No Submit Review button
    await expect(
      page.getByRole("button", { name: /^submit review$/i })
    ).not.toBeVisible();
  });

  test("Cancel shows discard confirmation", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    // The small "Cancel" text button
    await page.getByRole("button", { name: /^cancel$/i }).last().click();

    await expect(
      page.getByText(/are you sure you want to discard/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /yes, discard it/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /keep it/i })).toBeVisible();
  });

  test("Keep it returns to conflict options without closing", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^cancel$/i }).last().click();
    await page.getByRole("button", { name: /keep it/i }).click();

    // Back to the three-option conflict view
    await expect(
      page.getByRole("button", { name: /edit my existing review/i })
    ).toBeVisible();
  });

  test("Yes, discard it closes the form", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^cancel$/i }).last().click();
    await page.getByRole("button", { name: /yes, discard it/i }).click();

    // Form closed
    await expect(page.getByText(/who wrote this review/i)).not.toBeVisible();
  });

  test("'Edit my existing review' opens the existing review edit form", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /edit my existing review/i }).click();

    // Edit form for the existing review opens at step 1
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 5_000 });
  });

  test("'Replace my existing review' submits and closes the conflict UI", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /replace my existing review/i }).click();

    // Success toast and conflict UI disappears
    await expect(
      page.getByText(/review replaced/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).not.toBeVisible();
  });

  test("replacing review with earlier dates refetches and shows updated manager profile", async ({
    page,
  }) => {
    // The manager's current profile shows "Acme Corp / Engineering Manager" (from MOCK_MANAGER).
    // After replace, the server returns a *different* manager profile (different company/title)
    // because the user's new review has earlier dates and another review is now most-current.
    const UPDATED_MANAGER = {
      ...MOCK_MANAGER,
      company: "Other Corp",
      title: "Senior Director",
    };

    let fetchCount = 0;
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });

    // Override the by-slug route to return the updated profile on the second fetch.
    // We navigate to the legacy /manager/:id URL so the draft restoration logic
    // runs with the correct id (it reads localStorage draft by managerId === id).
    // After BossProfile redirects to the slug URL, subsequent fetches use this mock.
    await page.route(
      new RegExp(`/api/managers/by-slug/${TEST_MANAGER_SLUG}`),
      (route) => {
        fetchCount++;
        route.fulfill({ json: fetchCount === 1 ? MOCK_MANAGER : UPDATED_MANAGER });
      }
    );

    await injectPendingDraft(page);
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /replace my existing review/i }).click();

    // Success toast
    await expect(page.getByText(/review replaced/i)).toBeVisible({ timeout: 5_000 });

    // After the refetch, the profile header should reflect the updated manager data
    await expect(page.getByText("Other Corp")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Senior Director")).toBeVisible();
  });

  test("replace API failure shows error message and keeps conflict UI open", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await injectPendingDraft(page);

    // Override the replace route to return a server error
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews/.+/replace`),
      (route) => route.fulfill({ status: 500, json: { error: "Internal server error" } })
    );

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(
      page.getByText(/you've already reviewed this manager/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /replace my existing review/i }).click();

    // Error message should appear inside the conflict UI (the server's error message is surfaced directly)
    await expect(
      page.getByText(/internal server error/i)
    ).toBeVisible({ timeout: 5_000 });

    // Conflict UI must still be open so the user can retry
    await expect(
      page.getByRole("button", { name: /replace my existing review/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /edit my existing review/i })
    ).toBeVisible();
  });

  test("editing existing review with unchanged dates does not show 'Possible company mismatch' warning", async ({
    page,
  }) => {
    // MOCK_EXISTING_REVIEW covers Acme Corp, Jan 2021–Dec 2022.
    // A career segment from a *different* company overlaps that period.
    // The warning must NOT appear when dates are pre-filled and unchanged.
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    // Override career-segments to return a conflicting company for the same period
    await page.route(
      `**/api/managers/${TEST_MANAGER_ID}/career-segments`,
      (route) => route.fulfill({ json: { data: [CONFLICTING_SEGMENT] } })
    );

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /edit your review/i }).click();
    // Select the existing review to edit
    await page.getByText(/engineering manager at acme corp/i).click();
    // Advance to the dates step
    await page.getByRole("button", { name: /^next$/i }).click();

    // Dates are pre-filled from the existing review — warning must NOT appear
    await expect(
      page.getByText(/possible company mismatch/i)
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("editing existing review and changing dates to a conflicting period shows 'Possible company mismatch'", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.route(
      `**/api/managers/${TEST_MANAGER_ID}/career-segments`,
      (route) => route.fulfill({ json: { data: [CONFLICTING_SEGMENT] } })
    );

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /edit your review/i }).click();
    await page.getByText(/engineering manager at acme corp/i).click();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Change dates to a new range that overlaps with Other Corp's segment
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2020");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2023");

    await expect(
      page.getByText(/possible company mismatch/i)
    ).toBeVisible({ timeout: 3_000 });
    // Next is blocked until dismissed
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("dismissing 'Possible company mismatch' in edit mode allows proceeding", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.route(
      `**/api/managers/${TEST_MANAGER_ID}/career-segments`,
      (route) => route.fulfill({ json: { data: [CONFLICTING_SEGMENT] } })
    );

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /edit your review/i }).click();
    await page.getByText(/engineering manager at acme corp/i).click();
    await page.getByRole("button", { name: /^next$/i }).click();

    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2020");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2023");

    await expect(
      page.getByText(/possible company mismatch/i)
    ).toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: /yes, continue/i }).click();

    // Warning gone, Next is now enabled
    await expect(
      page.getByText(/possible company mismatch/i)
    ).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled();
  });

  test("duplicate title+company blocks Next on ratings step even when all stars are filled", async ({
    page,
  }) => {
    // The existing review is for "Engineering Manager" at "Acme Corp" — same as
    // the manager's default title/company. Opening "Add Another Role" pre-fills
    // that same title+company, so isDuplicateTitle is true from the start.
    // Next must be disabled even after all stars are rated.
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByRole("button", { name: /edit your review/i }).click();
    await page.getByText(/add another role/i).click();

    // Duplicate error should be visible immediately
    await expect(
      page.getByText(/you've already reviewed this role at this company/i)
    ).toBeVisible({ timeout: 5_000 });

    // Next must be disabled even after rating everything
    await rateAllFiveStars(page);
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("date overlap blocks Next on dates step for logged-in user", async ({
    page,
  }) => {
    // Existing review covers Jan 2021 – Dec 2022
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });

    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    // Logged-in user with an existing review sees "Edit Your Review" dropdown.
    // Click it to reveal "+ Add Another Role", then start the new review form.
    await page.getByRole("button", { name: /edit your review/i }).click();
    await page.getByText(/add another role/i).click();

    // The form defaults to the same title+company as the existing review, so
    // isDuplicateTitle is true. Change the title first to clear it.
    await page.getByRole("button", { name: /edit details/i }).click();
    await page.getByPlaceholder("e.g. Engineering Manager").fill("Senior Software Engineer");
    await page.getByRole("button", { name: /done editing/i }).click();

    await rateAllFiveStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Enter a date range that overlaps with 2021-01–2022-12
    await page.getByLabel("From month").selectOption("06");
    await page.getByLabel("From year").selectOption("2021");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2022");

    await expect(
      page.getByText(/already have a review that overlaps this period/i)
    ).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });
});
