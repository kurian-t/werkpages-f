import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_SLUG,
  MOCK_MANAGER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
} from "./fixtures";

test.describe("Authenticated review actions", () => {
  test("logged-in user submits a new review and sees success", async ({
    page,
  }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await clickWriteAReview(page);

    // Step 1: rate all categories
    await rateAllFiveStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2: dates
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByRole("checkbox", { name: /current/i }).check();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3: identity — shows anonymous posting card
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByRole("button", { name: /^submit review$/i })
    ).toBeEnabled({ timeout: 3_000 });

    await page.getByRole("button", { name: /^submit review$/i }).click();

    // Success toast
    await expect(
      page.getByText(/your review of alex johnson is live/i)
    ).toBeVisible({ timeout: 5_000 });

    // Form is closed after submit
    await expect(page.getByText(/posting anonymously/i)).not.toBeVisible();
  });

  test("delete button is NOT present in edit form step 3 (moved to dropdown)", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    // Open the dropdown and click the review to open edit form
    await page.getByRole("button", { name: /edit your review/i }).click();
    await page.getByText(/engineering manager at acme corp/i).first().click();

    // Navigate through all 3 steps
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 3_000 });

    // Delete button must NOT be in the edit form footer
    await expect(
      page.getByRole("button", { name: /^delete$/i })
    ).not.toBeVisible();
  });

  test("trash icon appears in the review dropdown on hover", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    // Open the dropdown
    await page.getByRole("button", { name: /edit your review/i }).click();

    // Hover over the review row to reveal the trash icon
    const reviewRow = page.locator("[class*='group']").filter({
      hasText: /engineering manager at acme corp/i,
    }).first();
    await reviewRow.hover();

    await expect(
      reviewRow.getByTitle("Delete review")
    ).toBeVisible({ timeout: 3_000 });
  });

  test("clicking trash icon shows inline confirmation with 30-day warning", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByRole("button", { name: /edit your review/i }).click();

    const reviewRow = page.locator("[class*='group']").filter({
      hasText: /engineering manager at acme corp/i,
    }).first();
    await reviewRow.hover();
    await reviewRow.getByTitle("Delete review").click();

    // Confirmation panel appears
    await expect(page.getByText(/delete this review\?/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/30 days/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /yes, delete/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("cancelling the delete confirmation returns to review list", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByRole("button", { name: /edit your review/i }).click();

    const reviewRow = page.locator("[class*='group']").filter({
      hasText: /engineering manager at acme corp/i,
    }).first();
    await reviewRow.hover();
    await reviewRow.getByTitle("Delete review").click();

    await expect(page.getByText(/delete this review\?/i)).toBeVisible({ timeout: 3_000 });

    // Cancel returns to list
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText(/your reviews/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/delete this review\?/i)).not.toBeVisible();
  });

  test("confirming delete calls the API and closes the dropdown", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByRole("button", { name: /edit your review/i }).click();

    const reviewRow = page.locator("[class*='group']").filter({
      hasText: /engineering manager at acme corp/i,
    }).first();
    await reviewRow.hover();
    await reviewRow.getByTitle("Delete review").click();

    await expect(page.getByText(/delete this review\?/i)).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: /yes, delete/i }).click();

    // Success toast
    await expect(page.getByText(/review deleted/i)).toBeVisible({ timeout: 5_000 });

    // Dropdown is closed
    await expect(page.getByText(/delete this review\?/i)).not.toBeVisible();
  });
});

// ─── Manager profile auto-update on review submission ─────────────────────────
//
// When a new review is the "most current" role (workedUntil IS NULL = still
// working there, or latest workedFrom), the backend updates managers.company,
// managers.title and managers.company_logo_url to match that review.
//
// These tests verify the frontend sends the right fields so the backend can
// make that determination, and that the success flow completes correctly.

test.describe("Manager profile auto-update — review submission fields", () => {
  async function submitReviewAndCapture(
    page: any,
    opts: { currently: boolean }
  ): Promise<any> {
    await mockManagerPage(page, { loggedIn: true });

    let capturedBody: any = null;

    // Register capturing handler AFTER mockManagerPage so it takes priority (LIFO).
    // For POST requests: capture the body and fulfill. For everything else: fall
    // back to the mockManagerPage handler.
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
      (route: any) => {
        if (route.request().method() === "POST") {
          const raw = route.request().postData();
          capturedBody = raw ? JSON.parse(raw) : null;
          route.fulfill({
            status: 201,
            json: { ...MOCK_EXISTING_REVIEW, id: "review-new" },
          });
        } else {
          route.fallback();
        }
      }
    );

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);

    // Step 1: rate all categories
    await rateAllFiveStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2: dates
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    if (opts.currently) {
      await page.getByRole("checkbox", { name: /current/i }).check();
    } else {
      // Past role — fill in a To date
      await page.getByLabel("Until month").selectOption("06");
      await page.getByLabel("Until year").selectOption("2024");
    }
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3: submit
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await expect(
      page.getByText(/your review of alex johnson is live/i)
    ).toBeVisible({ timeout: 5_000 });

    return capturedBody;
  }

  test("'currently working' review sends workedUntil as null in the POST body", async ({
    page,
  }) => {
    const body = await submitReviewAndCapture(page, { currently: true });

    expect(body).not.toBeNull();
    // workedUntil must be null (or absent) so the backend treats this as the
    // most current role and updates the manager's profile fields
    expect(body.workedUntil ?? null).toBeNull();
  });

  test("'currently working' review sends managerCompany and managerTitle in the POST body", async ({
    page,
  }) => {
    const body = await submitReviewAndCapture(page, { currently: true });

    expect(body).not.toBeNull();
    expect(typeof body.managerCompany).toBe("string");
    expect(body.managerCompany.length).toBeGreaterThan(0);
    expect(typeof body.managerTitle).toBe("string");
    expect(body.managerTitle.length).toBeGreaterThan(0);
  });

  test("'currently working' review sends workedFrom in YYYY-MM format", async ({
    page,
  }) => {
    const body = await submitReviewAndCapture(page, { currently: true });

    expect(body).not.toBeNull();
    expect(body.workedFrom).toMatch(/^\d{4}-\d{2}$/);
  });

  test("past-role review sends a non-null workedUntil date in the POST body", async ({
    page,
  }) => {
    const body = await submitReviewAndCapture(page, { currently: false });

    expect(body).not.toBeNull();
    // workedUntil must be a date string — backend will NOT update the profile
    // unless this review is the most current across all reviews
    expect(body.workedUntil).not.toBeNull();
    expect(body.workedUntil).toMatch(/^\d{4}-\d{2}$/);
  });

  test("past-role review still sends managerCompany and managerTitle", async ({
    page,
  }) => {
    const body = await submitReviewAndCapture(page, { currently: false });

    expect(body).not.toBeNull();
    expect(typeof body.managerCompany).toBe("string");
    expect(body.managerCompany.length).toBeGreaterThan(0);
    expect(typeof body.managerTitle).toBe("string");
    expect(body.managerTitle.length).toBeGreaterThan(0);
  });

  test("after submitting a review, if the manager profile is refetched it shows updated data", async ({
    page,
  }) => {
    // Simulates the backend having updated the manager's profile fields:
    // on the second GET for this manager, return an updated company/title.
    const updatedManager = {
      ...MOCK_MANAGER,
      company: "New Employer Ltd",
      title: "Senior Engineering Manager",
    };

    let getCallCount = 0;
    await page.route(
      new RegExp(`/api/managers/by-slug/${TEST_MANAGER_SLUG}`),
      (route: any) => {
        getCallCount++;
        route.fulfill({
          json: getCallCount === 1 ? MOCK_MANAGER : updatedManager,
        });
      }
    );

    // Reviews endpoint — POST succeeds, GET returns empty list
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
      (route: any) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 201,
            json: { ...MOCK_EXISTING_REVIEW, id: "review-new" },
          });
        } else {
          route.fulfill({ json: { data: [] } });
        }
      }
    );

    await page.route(`**/api/auth/me`, (route: any) =>
      route.fulfill({ json: { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true } })
    );
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/career-segments`, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/pending-edits`, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "authUser",
        JSON.stringify({ id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true })
      );
    });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);

    // Initial profile shows original data
    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Submit a review
    await clickWriteAReview(page);
    await rateAllFiveStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2024");
    await page.getByRole("checkbox", { name: /current/i }).check();
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await expect(
      page.getByText(/your review of alex johnson is live/i)
    ).toBeVisible({ timeout: 5_000 });

    // Reload to simulate the user refreshing after the backend has auto-updated
    await page.reload();
    await expect(
      page.getByText(/new employer ltd/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
