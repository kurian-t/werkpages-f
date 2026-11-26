import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  TEST_PENDING_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_PENDING_MANAGER,
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

test.describe("BossProfile - view states", () => {
  test.describe("Anonymous user", () => {
    test.beforeEach(async ({ page }) => {
      await mockManagerPage(page);
    });

    test("manager profile loads with name and rating", async ({ page }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await expect(
        page.getByRole("heading", { name: "Alex Johnson", exact: true })
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("button", { name: /write a review/i }).first()
      ).toBeVisible();
    });

    test("clicking 'Write a Review' opens the form without being logged in", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await page
        .getByRole("button", { name: /write a review/i })
        .first()
        .click();
      // Form opens on step 1, "Write a Review" - the manager information. The ratings are the
      // last of the three steps.
      await expect(page.getByRole("heading", { name: /write a review/i })).toBeVisible({
        timeout: 5_000,
      });
    });

    test("edit career history button is visible for all users", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      // Button text is "Edit Career History" (aria-label differs by state)
      await expect(
        page.locator("button").filter({ hasText: /edit career history/i })
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Logged-in user - no existing review", () => {
    test.beforeEach(async ({ page }) => {
      await mockManagerPage(page, { loggedIn: true });
    });

    test("shows 'Write a Review' button for user with no review", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await expect(
        page.getByRole("button", { name: /write a review/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("edit career history button is visible for logged-in user", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await expect(
        page.locator("button").filter({ hasText: /edit career history/i })
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Logged-in user - has existing review", () => {
    test.beforeEach(async ({ page }) => {
      await mockManagerPage(page, {
        loggedIn: true,
        existingUserReviews: [MOCK_EXISTING_REVIEW],
      });
    });

    test("shows 'Edit Your Review' instead of 'Write a Review'", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await expect(
        page.getByRole("button", { name: /edit your review/i })
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("button", { name: /^write a review$/i })
      ).not.toBeVisible();
    });

    test("dropdown shows existing review and 'Add Another Role'", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_MANAGER_ID}`);
      await page.getByRole("button", { name: /edit your review/i }).click();
      await expect(
        page.getByText(/engineering manager at acme corp/i)
      ).toBeVisible({ timeout: 3_000 });
      await expect(page.getByText(/add another role/i)).toBeVisible();
    });
  });

  test.describe("Pending manager - non-submitter access", () => {
    // The backend returns 404 for any user who is not the original submitter.
    // Pending profiles are completely private until an admin approves them.

    test("anonymous user gets a 'Manager Not Found' page for a pending profile", async ({
      page,
    }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );
      await page.route(
        new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
        (route) =>
          route.fulfill({ status: 404, json: { error: "Manager not found" } })
      );

      await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
      await expect(
        page.getByText(/manager not found/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("a different logged-in user gets a 'Manager Not Found' page for a pending profile", async ({
      page,
    }) => {
      const otherUser = { ...MOCK_USER, id: "different-user", username: "differentuser" };
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ json: otherUser })
      );
      await page.route(
        new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
        (route) =>
          route.fulfill({ status: 404, json: { error: "Manager not found" } })
      );
      await page.addInitScript((u) => {
        localStorage.setItem("authUser", JSON.stringify(u));
      }, otherUser);

      await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
      await expect(
        page.getByText(/manager not found/i)
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Pending manager - submitter view", () => {
    // Only the original submitter can see their pending profile.
    test.beforeEach(async ({ page }) => {
      await mockManagerPage(page, {
        manager: MOCK_PENDING_MANAGER,
        loggedIn: true,
        user: MOCK_USER,
      });
    });

    test("submitter sees their pending profile with an amber 'under review' banner", async ({
      page,
    }) => {
      await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
      await expect(
        page.getByText(/under review|awaiting.*approval/i).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("report button is hidden on a pending profile", async ({ page }) => {
      await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
      // Report is only available on live (approved) profiles
      await expect(
        page.getByRole("button", { name: /^report$/i })
      ).not.toBeVisible();
    });

    test("submitter sees 'Edit your submission' button", async ({ page }) => {
      await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
      await expect(
        page.getByRole("button", { name: /edit your submission/i })
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Report profile", () => {
    test("Report button is visible on approved profiles for logged-in users", async ({
      page,
    }) => {
      await mockManagerPage(page, { loggedIn: true });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await expect(
        page.getByRole("button", { name: /report this profile/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("clicking Report opens the full-screen report form", async ({
      page,
    }) => {
      await mockManagerPage(page, { loggedIn: true });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await page.getByRole("button", { name: /report this profile/i }).first().click();

      await expect(
        page.getByText(/report profile/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("report form has reason options", async ({ page }) => {
      await mockManagerPage(page, { loggedIn: true });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await page.getByRole("button", { name: /report this profile/i }).first().click();

      // Should show at least one radio/reason option
      await expect(
        page.getByRole("radio").first()
      ).toBeVisible({ timeout: 5_000 });
    });

    test("Submit Report is disabled until a reason is selected", async ({
      page,
    }) => {
      await mockManagerPage(page, { loggedIn: true });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await page.getByRole("button", { name: /report this profile/i }).first().click();
      await expect(page.getByText(/report profile/i)).toBeVisible({ timeout: 5_000 });

      await expect(
        page.getByRole("button", { name: /submit report/i })
      ).toBeDisabled({ timeout: 5_000 });
    });

    test("cancelling the report form closes it", async ({ page }) => {
      await mockManagerPage(page, { loggedIn: true });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await page.getByRole("button", { name: /report this profile/i }).first().click();

      await expect(page.getByText(/report profile/i)).toBeVisible({ timeout: 5_000 });

      await page.getByRole("button", { name: /cancel/i }).click();

      await expect(page.getByText(/report profile/i)).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("'Worked with?' CTA section", () => {
    test("'Worked with {name}?' section is visible on an approved profile", async ({
      page,
    }) => {
      await mockManagerPage(page);
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      await expect(
        page.getByText(/worked with alex johnson/i)
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Review display", () => {
    test("existing reviews are rendered on the profile", async ({ page }) => {
      await mockManagerPage(page, {
        loggedIn: false,
        existingUserReviews: [],
      });
      // Override reviews API to return a public review
      await page.route(
        new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
        (route) => {
          const url = route.request().url();
          if (url.includes("userId=")) {
            route.fulfill({ json: { data: [] } });
          } else {
            route.fulfill({
              json: {
                data: [
                  {
                    id: "public-review-1",
                    author: "someone",
                    overallRating: 4,
                    managerTitle: "Engineering Manager",
                    managerCompany: "Acme Corp",
                    workedFrom: "2021-01",
                    workedUntil: "2022-12",
                    ratings: {},
                    createdAt: "2023-01-01T00:00:00Z",
                  },
                ],
              },
            });
          }
        }
      );

      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      // At least one review card or rating display visible
      await expect(
        page.getByText(/engineering manager/i).first()
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});

test.describe("BossProfile - admin edit", () => {
  test("admin sees Edit button next to manager name", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByTestId("admin-edit-button")
    ).toBeVisible({ timeout: 3_000 });
  });

  test("non-admin does not see the admin Edit button", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // The small "Edit" button next to the name should not be present for regular users
    await expect(
      page.getByTestId("admin-edit-button")
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("clicking Edit opens the admin edit panel", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByTestId("admin-edit-button").click();

    await expect(page.getByText(/admin edit/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();
  });

  test("admin edit panel pre-fills with current manager values", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByTestId("admin-edit-button").click();

    // Scope to the admin panel section so we don't hit strict-mode violations
    const adminPanel = page.locator("section").filter({ hasText: /admin edit/i });
    await expect(adminPanel).toBeVisible({ timeout: 3_000 });

    /*
      The name by position, the title by its own test id.

      This read the title as the SECOND textbox, which stopped being true when the field became
      the shared title picker: a typeahead is role="combobox", not role="textbox", so it dropped
      out of that list entirely and nth(1) silently moved on to the company field. The assertion
      still failed loudly, which is the only reason this was caught - a positional locator that
      lands on a neighbouring field of the same type would simply have asserted the wrong thing.
    */
    await expect(adminPanel.getByRole("textbox").first()).toHaveValue("Alex Johnson");
    await expect(adminPanel.getByTestId("admin-edit-title")).toHaveValue("Engineering Manager");
  });

  test("Save changes calls PUT /api/admin/managers/:id and shows success toast", async ({ page }) => {
    // Register admin PUT route before mockManagerPage (LIFO - fires first)
    await page.route(/\/api\/admin\/managers\/[^/]+$/, (route) => {
      if (route.request().method() === "PUT") {
        route.fulfill({ status: 200, json: { success: true, name: "Alex Johnson", title: "Principal EM", company: "Acme Corp" } });
      } else {
        route.continue();
      }
    });

    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await page.getByTestId("admin-edit-button").click();

    // Change the title (second textbox in the panel)
    const adminPanel = page.locator("section").filter({ hasText: /admin edit/i });
    const titleInput = adminPanel.getByRole("textbox").nth(1);
    await titleInput.clear();
    await titleInput.fill("Principal EM");

    await page.getByRole("button", { name: /save changes/i }).click();

    await expect(page.getByText(/manager updated/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("BossProfile - locked 'Rate a manager' buttons", () => {
  test("clicking 'Rate a manager' in locked Performance Breakdown navigates to /add", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: false });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /rate a manager/i }).first().click();

    await expect(page).toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("clicking 'Rate a manager' when logged out navigates to /add (not signup modal)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /rate a manager/i }).first().click();

    await expect(page).toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("locked Performance Breakdown hides all category names including Communication Style", async ({ page }) => {
    // Previously the first category (Communication Style) was shown as an unblurred teaser,
    // which exposed the fake seed rating value. All categories must now be blurred when locked.
    await mockManagerPage(page, { loggedIn: true, hasContributed: false });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // The overlay inside the locked Performance Breakdown must exist in the DOM.
    // It is absolutely positioned so scrollIntoViewIfNeeded ensures it's reachable.
    const breakdownHelperText = page.getByText("Rate any manager to unlock the full breakdown");
    await breakdownHelperText.scrollIntoViewIfNeeded();
    await expect(breakdownHelperText).toBeAttached({ timeout: 5_000 });

    /*
      Category names are in the DOM but blurred, and not interactable (pointer-events-none). A
      contributor sees them clearly (tested below).

      The category is drawn twice for a locked reader now - once in the Strongest / Weakest block
      and once in the breakdown beneath it - so assert that *every* place it appears is a blurred
      one. Naming a single occurrence would pass while a second, unblurred copy leaked the seed
      value, which is the exact thing this test exists to catch.
    */
    const name = page.getByText("Communication Style", { exact: true });
    const blurred = page.locator('[class*="blur-sm"]').getByText("Communication Style", { exact: true });
    await expect(name.first()).toBeAttached();
    expect(await blurred.count()).toBe(await name.count());
  });

  test("contributor sees all Performance Breakdown categories (no lock overlay)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(
      page.getByRole("heading", { name: "Alex Johnson", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Communication Style")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/categories locked/i)).not.toBeVisible();
  });
});

/*
  THE GATE IS ABOUT OTHER PEOPLE'S SCORES, AND NOTHING ELSE.

  Two things it was doing that it was never meant to do, both visible the moment somebody added a
  manager and was sent to the profile they had just created:

  1. It blurred their OWN rating back at them. A rating held behind a pending manager is not live,
     and hasContributed only counts live ratings, so the author of the single rating on the page
     was locked out of it sixty seconds after writing it.

  2. It filled the page with invented strangers. The placeholder stack is an advertisement for
     contributing, aimed at a signed-out visitor; shown to somebody signed in, on a manager that
     cannot have any other ratings because they created it a minute ago, it reads as four people
     who have worked for somebody nobody had heard of.

  What has NOT changed: a signed-in reader who has not contributed still cannot read other
  people's scores. That is what contributing buys, and the last test here says so.
*/
test.describe("BossProfile - whose ratings the gate withholds", () => {
  const MY_HELD = {
    ...MOCK_EXISTING_REVIEW,
    id: "my-held-review",
    author: "rain-on-glass",
    /*
      NOT one of WITHHELD_SCORES (4.2 3.8 4.5 3.6 4.0 4.4 3.9 4.1 3.7 4.3).

      Those are the plausible numbers drawn in place of a real score behind the gate, and they
      are blurred by definition. A fixture score that collides with one makes "is this number
      blurred anywhere on the page" answer yes for a reason that has nothing to do with the test.
    */
    overallRating: 4.7,
    disposition: "held",
  };
  const SOMEBODY_ELSE = {
    ...MOCK_EXISTING_REVIEW,
    id: "other-review",
    author: "distant-ferry",
    overallRating: 2.3,
  };
  const PENDING = { ...MOCK_MANAGER, approvalStatus: "pending_approval" };
  /** One of the invented handles the locked stack is built from. */
  const INVENTED = "quiet-harbour";

  const blurredText = (page: any, text: string) =>
    page.locator('[class*="blur-sm"]').filter({ hasText: text });

  test("the author's own held rating is not blurred back at them", async ({ page }) => {
    await mockManagerPage(page, {
      manager: PENDING, loggedIn: true, hasContributed: false,
      reviews: [MY_HELD], existingUserReviews: [MY_HELD],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    // toHaveCount auto-retries; a bare .count() does not, and under parallel load it ran before
    // the card had rendered. The visible assertion above is what proves the card is there, so
    // the zero below is a real zero rather than a race.
    await expect(page.getByText("4.7").first()).toBeVisible();
    await expect(blurredText(page, "4.7")).toHaveCount(0);
  });

  test("a signed-in reader is never shown invented reviews", async ({ page }) => {
    /*
      LOCKED, and reading somebody else's review: the only setup where the invented stack could
      still appear.

      The first version of this test used the reader's OWN held rating, which makes the page
      unlocked - every rating on it is theirs - so the placeholders were absent for a reason that
      had nothing to do with being signed in. A mutation that showed invented cards to everybody
      passed it. The feed here is a stranger's, so the gate is genuinely shut and the only thing
      keeping the invention off the page is that they are signed in.
    */
    await mockManagerPage(page, {
      loggedIn: true, hasContributed: false,
      reviews: [SOMEBODY_ELSE], existingUserReviews: [],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("distant-ferry").first()).toBeAttached();
    await expect(page.getByText(INVENTED)).toHaveCount(0);
  });

  test("a manager somebody just added shows their rating and nobody else's", async ({ page }) => {
    // The case that prompted all of this: one rating, theirs, on a profile that cannot have any
    // others. No invented stack, nothing blurred.
    await mockManagerPage(page, {
      manager: PENDING, loggedIn: true, hasContributed: false,
      reviews: [MY_HELD], existingUserReviews: [MY_HELD],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("rain-on-glass").first()).toBeVisible();
    await expect(page.getByText(INVENTED)).toHaveCount(0);
    await expect(blurredText(page, "4.7")).toHaveCount(0);
  });

  test("a signed-out visitor still gets the stack, which is who it is for", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: false, reviews: [] });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    // The advertisement is deliberate and is not what changed.
    await expect(page.getByText(INVENTED).first()).toBeAttached({ timeout: 5_000 });
  });

  test("somebody else's score is still withheld from a non-contributor", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true, hasContributed: false,
      reviews: [SOMEBODY_ELSE], existingUserReviews: [],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    // The gate itself, intact: this is the half the change must not have opened.
    await expect(page.getByText("2.3").first()).toBeAttached();
    await expect(blurredText(page, "2.3")).not.toHaveCount(0);
  });
});
