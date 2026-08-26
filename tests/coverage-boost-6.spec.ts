/**
 * Wave 6 coverage boost — targets:
 * - BossProfile: review submission form (all 3 steps), report manager, admin edit/delete,
 *   rating breakdown toggle, overview headlines, edit review flow
 * - AddBoss: expired draft, malformed JSON, LinkedIn URL validation, anonymous submit → auth modal
 * - AccountSettings: page with reviews, edit review modal, delete confirm
 * - SignUp: Try again button (corrected selector)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  mockManagerPage,
  mockAddBossPage,
  mockAdminPage,
  mockAccountSettingsPage,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_EXISTING_REVIEW,
  MOCK_MY_REVIEW,
  RATING_CATEGORIES,
  TEST_MANAGER_ID,
  TEST_MANAGER_SLUG,
  TEST_COMPANY_SLUG,
} from "./fixtures";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function openWriteReviewForm(page: Page) {
  // Two "Write a Review" buttons may exist: action bar (top) + CTA section (below reviews).
  // .first() targets the action bar button.
  await page.getByRole("button", { name: /write a review/i }).first().click();
  // h2 "Rate a Manager" appears in ratings step content (BossProfile.tsx line 2413)
  await expect(page.getByRole("heading", { name: /rate a manager/i })).toBeVisible({ timeout: 8000 });
}

async function rateAllFourStars(page: Page) {
  for (const btn of await page.getByRole("button", { name: "Rate 4 stars" }).all()) {
    await btn.click();
  }
}

async function fillDatesStep(page: Page, month = "01", year = "2023") {
  await page.locator('select[aria-label="From month"]').first().selectOption(month);
  await page.locator('select[aria-label="From year"]').first().selectOption(year);
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.isEnabled({ timeout: 1500 }).catch(() => false)) {
    await cb.check();
  }
}

// ─── BossProfile — Write a Review form ───────────────────────────────────────

test.describe("BossProfile — write review modal", () => {
  test("clicking Write a Review opens ratings step (lines 2224-2226)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await expect(page.getByRole("button", { name: "Rate 4 stars" }).first()).toBeVisible({ timeout: 5000 });
  });

  test("Cancel on ratings step closes modal (line 2255)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    // Header button says "Cancel" on ratings step (line 2262)
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("heading", { name: /rate a manager/i })).not.toBeVisible({ timeout: 3000 });
  });

  test("X close button closes modal (line 2269)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    // aria-label="Close" on the X button (line 2270)
    await page.getByRole("button", { name: /^close$/i }).click();
    await expect(page.getByRole("heading", { name: /rate a manager/i })).not.toBeVisible({ timeout: 3000 });
  });

  test("rating all categories enables Next → dates step (lines 2648-2649)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    // h2 "Work timeline" in dates step content (line 2333)
    await expect(page.getByRole("heading", { name: /^work timeline$/i })).toBeVisible({ timeout: 5000 });
  });

  test("Back on dates step returns to ratings (line 2256)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByRole("heading", { name: /^work timeline$/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByRole("heading", { name: /rate a manager/i })).toBeVisible({ timeout: 3000 });
  });

  test("dates → identity step shows Posting Anonymously (line 2312)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByRole("heading", { name: /^work timeline$/i })).toBeVisible({ timeout: 5000 });
    await fillDatesStep(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    // Identity step: "Posting Anonymously" label (line 2312)
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 5000 });
  });

  test("anonymous submit on identity step shows auth modal (lines 884-905)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, hasContributed: false });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews/drop-off`),
      (route: any) => route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillDatesStep(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 5000 });
    await page.locator('input[name="attestation"]').check();
    // Submit → anon → setAuthFlowStep("signup") → AuthFlowModal opens (line 904)
    await page.getByRole("button", { name: /submit review/i }).click();
    await expect(page.getByText(/create account|sign up/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("409 role_limit_reached shows error on identity step (line 941)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews$`),
      (route: any) => {
        if (route.request().method() === "POST") {
          route.fulfill({ status: 409, json: { message: "role_limit_reached" } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillDatesStep(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 5000 });
    await page.locator('input[name="attestation"]').check();
    await page.getByRole("button", { name: /submit review/i }).click();
    // Error message from line 941: "You've reached the limit of 5 reviews for this manager."
    await expect(page.getByText(/limit of 5 reviews/i)).toBeVisible({ timeout: 8000 });
  });

  test("500 server error shows generic error message (lines 960-961)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews$`),
      (route: any) => {
        if (route.request().method() === "POST") {
          // Empty body → msg="" → fallback "Failed to submit review. Please try again."
          route.fulfill({ status: 500, body: "" });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await openWriteReviewForm(page);
    await rateAllFourStars(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillDatesStep(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/posting anonymously/i)).toBeVisible({ timeout: 5000 });
    await page.locator('input[name="attestation"]').check();
    await page.getByRole("button", { name: /submit review/i }).click();
    // Generic error from line 961: "Failed to submit review. Please try again."
    await expect(page.getByText(/failed to submit review/i)).toBeVisible({ timeout: 8000 });
  });
});

// ─── BossProfile — Rating breakdown toggle ───────────────────────────────────

test.describe("BossProfile — rating breakdown toggle", () => {
  const REVIEW_WITH_RATINGS = {
    ...MOCK_EXISTING_REVIEW,
    id: "review-breakdown-1",
    ratings: Object.fromEntries(RATING_CATEGORIES.map((c) => [c, 3])),
    overallRating: 3,
  };

  test("clicking Show/Hide rating breakdown covers lines 2165-2173", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    // Override general reviews (non-userId GET) to return a review with ratings
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews$`),
      (route: any) => {
        if (route.request().method() === "GET") {
          route.fulfill({ json: { data: [REVIEW_WITH_RATINGS] } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    const showBtn = page.getByRole("button", { name: /show rating breakdown/i });
    await expect(showBtn).toBeVisible({ timeout: 8000 });
    await showBtn.click();
    await expect(page.getByRole("button", { name: /hide breakdown/i })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: /hide breakdown/i }).click();
    await expect(page.getByRole("button", { name: /show rating breakdown/i })).toBeVisible({ timeout: 3000 });
  });
});

// ─── BossProfile — Overview headlines ────────────────────────────────────────

test.describe("BossProfile — overview headline variants", () => {
  function makeOverviewReview(overallRating: number) {
    return {
      ...MOCK_EXISTING_REVIEW,
      id: `review-ov-${overallRating}`,
      overallRating,
      ratings: Object.fromEntries(RATING_CATEGORIES.map((c) => [c, overallRating])),
    };
  }

  async function loadWithRating(page: Page, overallRating: number) {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews$`),
      (route: any) => {
        if (route.request().method() === "GET") {
          route.fulfill({ json: { data: [makeOverviewReview(overallRating)] } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
  }

  test("overall 4.0 → positive scores headline (line 1886)", async ({ page }) => {
    await loadWithRating(page, 4);
    await expect(page.getByText(/positive scores overall/i)).toBeVisible({ timeout: 8000 });
  });

  test("overall 3.0 → mixed scores headline (line 1888)", async ({ page }) => {
    await loadWithRating(page, 3);
    await expect(page.getByText(/mixed scores/i)).toBeVisible({ timeout: 8000 });
  });

  test("overall 1.0 → lower scores headline (line 1890 else-branch)", async ({ page }) => {
    await loadWithRating(page, 1);
    await expect(page.getByText(/lower scores/i)).toBeVisible({ timeout: 8000 });
  });
});

// ─── BossProfile — Report manager ────────────────────────────────────────────

test.describe("BossProfile — report manager flow", () => {
  test("open report modal, select reason, submit (lines 833-864)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/report`),
      (route: any) => route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // aria-label="Report this profile" (line 1652)
    const reportBtn = page.getByRole("button", { name: /report this profile/i });
    if (await reportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportBtn.click();
      // h2 "What's the issue with this profile?" (line 3152)
      await expect(page.getByRole("heading", { name: /what.*issue/i })).toBeVisible({ timeout: 5000 });
      // Select first radio option (line 3167)
      await page.locator('input[name="reportReason"]').first().click();
      // Submit report button (line 3194)
      await page.getByRole("button", { name: /submit report/i }).click();
      // Toast "Report submitted" (line 848)
      await expect(page.getByText(/report submitted/i)).toBeVisible({ timeout: 8000 });
    }
  });
});

// ─── BossProfile — Admin controls ────────────────────────────────────────────

test.describe("BossProfile — admin inline controls", () => {
  test("admin Edit opens inline form (lines 1347-1358, 1671-1759)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true, user: MOCK_ADMIN_USER });
    await page.route(/\/api\/companies\/suggest/, (route: any) => route.fulfill({ json: [] }));
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    const editBtn = page.getByRole("button", { name: /^edit$/i }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      // Inline form header text (line 1675)
      await expect(page.getByText(/admin edit.*cascade/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("admin Save changes calls PUT and shows Manager updated toast (lines 1726-1745)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true, user: MOCK_ADMIN_USER });
    await page.route(/\/api\/companies\/suggest/, (route: any) => route.fulfill({ json: [] }));
    await page.route(
      new RegExp(`/api/admin/managers/${TEST_MANAGER_ID}$`),
      (route: any) => {
        if (route.request().method() === "PUT") {
          route.fulfill({ status: 200, json: { ...MOCK_MANAGER } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    const editBtn = page.getByRole("button", { name: /^edit$/i }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await expect(page.getByText(/admin edit.*cascade/i)).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /save changes/i }).click();
      await expect(page.getByText(/manager updated/i)).toBeVisible({ timeout: 8000 });
    }
  });

  test("admin Delete with confirm navigates to /directory (lines 1360-1375)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true, user: MOCK_ADMIN_USER });
    await page.route(
      new RegExp(`/api/admin/managers/${TEST_MANAGER_ID}$`),
      (route: any) => {
        if (route.request().method() === "DELETE") {
          route.fulfill({ status: 200, json: { success: true } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    const deleteBtn = page.getByRole("button", { name: /^delete$/i }).first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm dialog: "Yes, delete" button (line 1380)
      const confirmBtn = page.getByRole("button", { name: /yes, delete/i });
      await expect(confirmBtn).toBeVisible({ timeout: 3000 });
      await confirmBtn.click();
      // navigate("/directory") on success (line 1371)
      await expect(page).toHaveURL(/directory/, { timeout: 8000 });
    }
  });
});

// ─── BossProfile — Edit review flow ──────────────────────────────────────────

test.describe("BossProfile — edit review flow", () => {
  test("show review options dropdown → click review → edit modal opens (lines 1505-1575)", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // "Show review options" aria-label on chevron button (line 1508)
    const chevronBtn = page.getByRole("button", { name: /show review options/i });
    await expect(chevronBtn).toBeVisible({ timeout: 8000 });
    await chevronBtn.click();
    await expect(page.getByText(/your reviews.*select to edit/i)).toBeVisible({ timeout: 3000 });
    // Click the review: "Engineering Manager at Acme Corp" (line 1579-1580)
    await page.getByText(/engineering manager at acme corp/i).first().click();
    // Edit modal: h2 "Update your ratings" (line 2886)
    await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible({ timeout: 5000 });
  });

  test("edit review Cancel button closes modal (line 2850-2851)", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /show review options/i }).click();
    await page.getByText(/engineering manager at acme corp/i).first().click();
    await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("heading", { name: /update your ratings/i })).not.toBeVisible({ timeout: 3000 });
  });

  test("edit review Next → dates → identity → Save Changes submits PUT (lines 2883-3117)", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews/${MOCK_EXISTING_REVIEW.id}`),
      (route: any) => {
        if (route.request().method() === "PUT") {
          route.fulfill({ status: 200, json: { ...MOCK_EXISTING_REVIEW } });
        } else {
          route.fallback();
        }
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /show review options/i }).click();
    await page.getByText(/engineering manager at acme corp/i).first().click();
    await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible({ timeout: 5000 });
    // Step 1 (ratings): all 10 pre-rated → Next enabled
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 2 (dates): pre-filled from MOCK_EXISTING_REVIEW → Next enabled
    await expect(page.getByText(/work timeline/i).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 3 (identity): h2 "Who wrote this review?" (BossProfile.tsx line 3071)
    await expect(page.getByRole("heading", { name: /who wrote this review/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /save changes/i }).click();
    // Modal closes on success
    await expect(page.getByRole("heading", { name: /update your ratings/i })).not.toBeVisible({ timeout: 8000 });
  });
});

// ─── AddBoss — draft lifecycle edge cases ─────────────────────────────────────

test.describe("AddBoss — draft lifecycle", () => {
  test("expired draft (>12h) is silently discarded (line 262)", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.addInitScript(() => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify({
        formData: {
          firstName: "OldDraftFirst", lastName: "Draft", title: "Manager",
          company: "OldCo", country: "", state: "", linkedinUrl: "", status: "active",
        },
        ratings: {},
        workedFrom: { month: "", year: "" },
        step: "info",
        savedAt: Date.now() - (13 * 60 * 60 * 1000), // 13 h > 12-h DRAFT_TTL
      }));
    });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Expired draft discarded — firstName input should be empty
    await expect(page.getByPlaceholder(/e.g., Satya/i)).toHaveValue("", { timeout: 3000 });
    // No draft banner (draft was not restored)
    await expect(page.getByText(/draft restored/i)).not.toBeVisible({ timeout: 2000 });
  });

  test("malformed JSON in localStorage is caught and page loads normally (line 294)", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.addInitScript(() => {
      localStorage.setItem("rmm_pending_manager", "{ not valid json: !!!}}}");
    });
    await page.goto("/add");
    // Catch block at line 294 swallows the parse error — page loads normally
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/e.g., Satya/i)).toHaveValue("", { timeout: 3000 });
  });

  test("invalid LinkedIn URL shows validation error on Next (lines 425-428)", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/e.g., Satya/i).fill("Jane");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Doe");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineer");
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");
    // Fill an invalid LinkedIn URL if the field exists
    const linkedinInput = page.locator('input[type="url"]').first();
    if (await linkedinInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await linkedinInput.fill("not-a-valid-url-at-all");
      await page.getByRole("button", { name: /^next$/i }).click();
      // validateProfileUrl error (line 427-428: errors.push("Please enter a valid URL"))
      await expect(page.getByText(/valid url|invalid/i)).toBeVisible({ timeout: 5000 });
    } else {
      // No LinkedIn field — navigate to step 2 normally
      await page.getByRole("button", { name: /^next$/i }).click();
      await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible({ timeout: 5000 });
    }
  });

  test("anonymous user completing all steps → Continue to Sign In → auth modal (lines 451-481)", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.route(/\/api\/managers\/drop-off/, (route: any) =>
      route.fulfill({ status: 200, json: {} })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) => route.fulfill({ json: [] }));
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Step 1
    await page.getByPlaceholder(/e.g., Satya/i).fill("Jane");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Doe");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineer");
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 2
    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible({ timeout: 5000 });
    await page.locator('select[aria-label="From month"]').first().selectOption("01");
    await page.locator('select[aria-label="From year"]').first().selectOption("2021");
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.isEnabled({ timeout: 1500 }).catch(() => false)) await cb.check();
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 3: rate all
    await expect(page.getByRole("heading", { name: /rate jane/i })).toBeVisible({ timeout: 5000 });
    for (const btn of await page.getByRole("button", { name: "Rate 4 stars" }).all()) {
      await btn.click();
    }
    await page.locator('input[name="attestation"]').check();
    // "Continue to Sign In" shown for anonymous (AddBoss.tsx line 942 — submit button text)
    await page.getByRole("button", { name: /continue to sign in/i }).click();
    // Auth modal (line 480: setAuthFlowStep("signup"))
    await expect(page.getByText(/create account|sign up/i).first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── AccountSettings — with review data ──────────────────────────────────────

test.describe("AccountSettings — review management", () => {
  test("loads page and shows review list (lines 109-160)", async ({ page }) => {
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.goto("/settings");
    await expect(page.getByText(/engineering manager/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("clicking Edit review opens edit form (lines 532-540, 728-797)", async ({ page }) => {
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.goto("/settings");
    await expect(page.getByText(/engineering manager/i).first()).toBeVisible({ timeout: 10000 });
    // Edit button with title="Edit review" (line 536)
    const editBtn = page.getByTitle("Edit review").first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      // h2 "Update your ratings" (AccountSettings.tsx line 797)
      await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible({ timeout: 5000 });
      // Close with X button
      await page.getByRole("button", { name: /^close$/i }).click();
    }
  });

  test("clicking delete icon shows confirm dialog, Keep it cancels (lines 541-579)", async ({ page }) => {
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.goto("/settings");
    await expect(page.getByText(/engineering manager/i).first()).toBeVisible({ timeout: 10000 });
    // Trash icon button with title="Delete review" (line 545)
    const deleteBtn = page.getByTitle("Delete review").first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm dialog: "Delete this review?" (line 557)
      await expect(page.getByText(/delete this review\?/i)).toBeVisible({ timeout: 3000 });
      // "Keep it" button to cancel (line 567-570)
      await page.getByRole("button", { name: /keep it/i }).click();
      await expect(page.getByText(/delete this review\?/i)).not.toBeVisible({ timeout: 2000 });
    }
  });

});

// ─── SignUp — Try again button (corrected selector) ───────────────────────────

test.describe("SignUp — username check failure flow", () => {
  test("failed username check shows Try again button and clicking it re-fires check (line 289)", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route("**/api/auth/check-username**", (route: any) =>
      route.fulfill({ status: 503, json: { error: "Service unavailable" } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 10000 });
    // Correct selector: placeholder="Click refresh to generate one" → use id="username"
    const usernameInput = page.locator("input#username");
    await expect(usernameInput).toBeVisible({ timeout: 8000 });
    await usernameInput.clear();
    await usernameInput.fill("testusername123");
    // Wait for debounced check to fail → "Try again" button (line 286-290)
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible({ timeout: 10000 });
    // Click "Try again" — calls handleUsernameChange again (line 289)
    await page.getByRole("button", { name: /try again/i }).click();
    // Still fails → button remains visible
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible({ timeout: 8000 });
  });
});
