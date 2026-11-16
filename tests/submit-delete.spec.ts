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
  attestFirstHandExperience,
  advanceToDatesStep,
  fillDatesAndAdvance,
} from "./fixtures";

test.describe("Authenticated review actions", () => {
  test("logged-in user submits a new review and sees success", async ({
    page,
  }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await clickWriteAReview(page);

    // Steps 1 and 2, then the ratings on step 3
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
    await rateAllFiveStars(page);

    // Step 3: ratings and identity - shows anonymous posting card
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 3_000 });
    await attestFirstHandExperience(page);
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

  // The same first-hand-experience attestation gates the rate-a-manager flow on its step 3.
  test("attestation is required before a review can be submitted", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await clickWriteAReview(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "01", fromYear: "2023" });
    await rateAllFiveStars(page);

    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 3_000 });
    const attestation = page.locator('input[name="attestation"]');
    await expect(attestation).not.toBeChecked();
    await expect(
      page.getByText(/i confirm that i have personally worked with or for this manager/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^submit review$/i })
    ).toBeDisabled({ timeout: 3_000 });

    await attestation.check();
    await expect(
      page.getByRole("button", { name: /^submit review$/i })
    ).toBeEnabled({ timeout: 3_000 });
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

  /**
   * ── THE UNLINK LIFECYCLE ──────────────────────────────────────────────────
   *
   * These four tests drove a "Delete review" control that no longer exists. The product decision
   * of 2026-11-12/13 replaced permanent self-deletion with UNLINK: a contributor severs their
   * association with a published rating, and the rating itself stays published and keeps counting.
   * Edit Rating remains; permanent contributor deletion does not come back.
   *
   * So they now validate the lifecycle that exists, and three properties of it that the old
   * delete tests had no reason to check:
   *
   *   RETENTION    the rating stays on the manager and keeps contributing to the statistics
   *   PRIVACY      the association is severed; the rating carries no attribution afterwards
   *   PREVENTION   the account cannot rate this manager again
   *
   * The last two are backed by `rating_participation`, which V106 documents at length: it records
   * that an account rated a subject and whether that earned the profile gate, and NOTHING else -
   * no rating id, no score, no employment date, no claim. `unlinked_at` on that row, rather than
   * the row's existence, is what blocks a second rating, because Rev 268 deliberately allows two
   * ratings of one manager for somebody with two separate employments under them.
   */
  test("the unlink control appears in the rating dropdown on hover", async ({
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

    // "Unlink rating", not "Delete review". The word matters: nothing is being destroyed.
    await expect(
      reviewRow.getByTitle("Unlink rating")
    ).toBeVisible({ timeout: 3_000 });
  });

  test("the confirmation says the rating stays published and cannot be re-rated", async ({
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
    await reviewRow.getByTitle("Unlink rating").click();

    await expect(page.getByText(/unlink this rating\?/i)).toBeVisible({ timeout: 3_000 });

    /*
      The three consequences, in the words the person is actually shown. Asserted because this is
      an irreversible choice and the old copy promised the opposite of what happens: a 30-day
      window before deletion, for a rating that is now never deleted at all.
    */
    await expect(page.getByText(/stays published anonymously/i)).toBeVisible();
    await expect(page.getByText(/keeps counting toward this/i)).toBeVisible();
    await expect(page.getByText(/will not be able to rate this manager again/i)).toBeVisible();

    await expect(page.getByRole("button", { name: /yes, unlink/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("cancelling the confirmation returns to the rating list", async ({
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
    await reviewRow.getByTitle("Unlink rating").click();
    await expect(page.getByText(/unlink this rating\?/i)).toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page.getByText(/your reviews/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/unlink this rating\?/i)).not.toBeVisible();
  });

  /**
   * It must be an unlink, and it must not be a delete.
   *
   * <p>Both halves are asserted. `POST .../unlink` has to happen, and no DELETE may be issued to
   * the rating at all - which is the regression that would reintroduce permanent contributor
   * deletion, and the one a test asserting only the happy path would not notice.
   */
  test("confirming posts to the unlink endpoint and never issues a DELETE", async ({
    page,
  }) => {
    let unlinked: string | null = null;
    let deleteAttempts = 0;

    await mockManagerPage(page, {
      loggedIn: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.route(/\/api\/managers\/[^/]+\/reviews\/[^/]+/, (route: any) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === "DELETE") { deleteAttempts += 1; return route.fulfill({ status: 200, json: {} }); }
      if (method === "POST" && url.endsWith("/unlink")) {
        unlinked = url;
        return route.fulfill({ status: 200, json: { unlinked: true } });
      }
      return route.fallback();
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByRole("button", { name: /edit your review/i }).click();
    const reviewRow = page.locator("[class*='group']").filter({
      hasText: /engineering manager at acme corp/i,
    }).first();
    await reviewRow.hover();
    await reviewRow.getByTitle("Unlink rating").click();
    await expect(page.getByText(/unlink this rating\?/i)).toBeVisible({ timeout: 3_000 });
    await page.getByRole("button", { name: /yes, unlink/i }).click();

    await expect(page.getByText(/rating unlinked/i)).toBeVisible({ timeout: 5_000 });
    expect(unlinked, "the unlink endpoint must be the one called").toContain("/unlink");
    expect(deleteAttempts, "a contributor may never permanently delete a published rating").toBe(0);

    // And the reader is told what happened, in terms of what survives.
    await expect(page.getByText(/stays published anonymously/i)).toBeVisible();
    await expect(page.getByText(/unlink this rating\?/i)).not.toBeVisible();
  });

  /**
   * RETENTION and PRIVACY, on the surface the reader sees.
   *
   * <p>After unlinking, the rating is still in the manager's public list and still carries its
   * score - that is the whole difference from deletion - and it is no longer attributed to the
   * person who wrote it. A test that only checked the dropdown emptied would pass just as well if
   * the rating had been destroyed, which is the outcome this lifecycle exists to avoid.
   */
  test("the rating stays published afterwards, with the attribution gone", async ({
    page,
  }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      // What the server returns once the association is severed: same rating, same score, no
      // author of record. reviews.user_id is null and the byline is the anonymised one.
      reviews: [{ ...MOCK_EXISTING_REVIEW, author: "Anonymous", authorType: "anonymous" }],
      existingUserReviews: [],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    // The score survives: this is a rating that keeps counting, not a deleted one.
    const card = page.getByTestId("opinion-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    /*
      SCOPED TO THE CARD. An unscoped getByText("testuser") finds the signed-in person's own name
      in the page chrome and fails for a reason that has nothing to do with attribution - which is
      the kind of assertion that gets deleted rather than understood. What matters is the byline on
      the rating.
    */
    await expect(card.getByText("testuser")).toHaveCount(0);
    await expect(card).toContainText("Anonymous");

    // And it is not offered back to its author to edit, because the link is gone.
    await expect(page.getByRole("button", { name: /edit your review/i })).toHaveCount(0);
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

test.describe("Manager profile auto-update - review submission fields", () => {
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

    // Step 1: manager information - prefilled from the manager, nothing to answer
    await advanceToDatesStep(page);

    // Step 2: dates
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    if (opts.currently) {
      await page.getByRole("checkbox", { name: /current/i }).check();
    } else {
      // Past role - fill in a To date
      await page.getByLabel("Until month").selectOption("06");
      await page.getByLabel("Until year").selectOption("2024");
    }
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3: the ratings live here, then submit
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
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
    // workedUntil must be a date string - backend will NOT update the profile
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

    // Reviews endpoint - POST succeeds, GET returns empty list
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
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "03", fromYear: "2024" });
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
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
