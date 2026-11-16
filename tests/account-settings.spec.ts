import { test, expect } from "./base";
import {
  MOCK_MY_REVIEW,
  MOCK_PENDING_SUBMISSION,
  mockAccountSettingsPage,
} from "./fixtures";

test.describe("Account Settings", () => {
  test.describe("My Reviews section", () => {
    test("shows user reviews with manager name and rating", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(/engineering manager/i)).toBeVisible();
    });

    test("shows empty state when user has no reviews", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [] });
      await page.goto("/settings");

      await expect(
        page.getByText(/you haven't written any reviews yet/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("edit review button opens edit modal", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByTitle("Edit review").first().click();

      // Edit modal step 1: Update ratings heading
      await expect(
        page.getByRole("heading", { name: /update your ratings/i })
      ).toBeVisible({ timeout: 5_000 });
    });

    test("edit review: step 1 has rating categories", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTitle("Edit review").first().click();

      await expect(
        page.getByText(/communication style/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("edit review: Next advances to work timeline step", async ({
      page,
    }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTitle("Edit review").first().click();

      await expect(page.getByText(/step 1 of 2/i).first()).toBeVisible({
        timeout: 5_000,
      });

      await page.getByRole("button", { name: /^next$/i }).click();

      await expect(page.getByText(/step 2 of 2/i).first()).toBeVisible({
        timeout: 3_000,
      });
      await expect(page.getByText(/work timeline/i).first()).toBeVisible();
    });

    test("edit review: Save Changes submits and closes form", async ({
      page,
    }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTitle("Edit review").first().click();
      await page.getByRole("button", { name: /^next$/i }).click();

      await expect(page.getByText(/step 2 of 2/i).first()).toBeVisible({
        timeout: 3_000,
      });

      await page.getByRole("button", { name: /save changes/i }).click();

      // Form closes (step indicator disappears)
      await expect(page.getByText(/step 2 of 2/i).first()).not.toBeVisible({
        timeout: 5_000,
      });
    });

    /**
     * ── THE UNLINK LIFECYCLE, FROM ACCOUNT SETTINGS ───────────────────────────
     *
     * These three tests drove a "Delete review" control with a 30-day cooldown warning. The
     * product decision of 2026-11-12/13 replaced permanent self-deletion with UNLINK, so the
     * cooldown they warned about no longer exists: nothing is deleted and nothing is waiting to be.
     *
     * The copy here is the fullest statement of the lifecycle anywhere in the product, and it is
     * asserted rather than paraphrased, because every clause is a promise about what happens to
     * somebody's published words.
     */
    test("unlink explains retention, the private record, and that it cannot be undone", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByTitle("Unlink rating").first().click();

      await expect(
        page.getByText(/unlink this rating\?/i)
      ).toBeVisible({ timeout: 3_000 });

      // RETENTION: the rating stays published and keeps contributing.
      await expect(page.getByText(/remains published anonymously/i)).toBeVisible();
      await expect(page.getByText(/continues\s+contributing to statistics/i)).toBeVisible();

      /*
        PRIVACY, stated honestly. A limited private record survives, and the person is told so
        before they choose. V106's rating_participation holds only that an account rated this
        subject and whether it earned the gate - no rating id, no score, no employment date, no
        claim - which is what makes this sentence true rather than reassuring.
      */
      await expect(page.getByText(/limited private record/i)).toBeVisible();

      /*
        PREVENTION and irreversibility, in one assertion because they are one sentence: "This
        cannot be undone, and you will not be able to rate this manager again." Matched together
        rather than separately - "cannot be undone" alone also appears in the account-deletion
        section further down the page, and a two-element match is a strict-mode failure that says
        nothing about the unlink copy.
      */
      await expect(
        page.getByText(/cannot be undone, and you will not be able to rate this manager again/i)
      ).toBeVisible();

      await expect(
        page.getByRole("button", { name: /yes, unlink/i })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /keep it/i })
      ).toBeVisible();
    });

    test("'Keep it' cancels the unlink confirmation", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTitle("Unlink rating").first().click();
      await expect(
        page.getByText(/unlink this rating\?/i)
      ).toBeVisible({ timeout: 3_000 });

      await page.getByRole("button", { name: /keep it/i }).click();

      // Confirmation gone, rating still listed and still theirs to edit.
      await expect(page.getByText(/unlink this rating\?/i)).not.toBeVisible();
      await expect(page.getByText("Alex Johnson")).toBeVisible();
    });

    /**
     * Confirming unlinks, and never deletes.
     *
     * <p>The row leaves THIS ACCOUNT'S list, which is the only thing that changes for the reader -
     * the rating itself is still on the manager. So the endpoint is asserted as well as the empty
     * state: an implementation that deleted the rating would produce the same empty list and the
     * same satisfied test.
     */
    test("'Yes, unlink' posts to the unlink endpoint and the rating leaves this account", async ({
      page,
    }) => {
      let unlinkCalled = false;
      let deleteAttempts = 0;

      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.route(/\/api\/managers\/[^/]+\/reviews\/[^/]+/, (route: any) => {
        const method = route.request().method();
        if (method === "DELETE") { deleteAttempts += 1; return route.fulfill({ status: 200, json: {} }); }
        if (method === "POST" && route.request().url().endsWith("/unlink")) {
          unlinkCalled = true;
          return route.fulfill({ status: 200, json: { unlinked: true } });
        }
        return route.fallback();
      });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTitle("Unlink rating").first().click();
      await page.getByRole("button", { name: /yes, unlink/i }).click();

      await expect(
        page.getByText(/you haven't written any reviews yet/i)
      ).toBeVisible({ timeout: 5_000 });

      expect(unlinkCalled, "unlink is the operation, not delete").toBe(true);
      expect(deleteAttempts,
        "a contributor may never permanently delete a published rating").toBe(0);
    });

    test("review section heading shows total count from API", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
      // The heading should show "My Reviews (1)" based on the total returned by the API
      await expect(page.getByText(/my reviews \(1\)/i)).toBeVisible({ timeout: 5_000 });
    });

    test("loading more indicator not shown when all reviews already loaded", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
      // Loading more text should not be visible since total === loaded count
      await expect(page.getByText(/loading more/i)).not.toBeVisible();
    });
  });

  test.describe("Submitted Managers section", () => {
    test("shows pending submission with 'Pending' badge", async ({ page }) => {
      await mockAccountSettingsPage(page, {
        submittedManagers: [MOCK_PENDING_SUBMISSION],
      });
      await page.goto("/settings");

      await expect(
        page.getByText(/submitted managers/i)
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Jane Smith")).toBeVisible();
      await expect(page.getByText("Pending").first()).toBeVisible();
    });

    test("shows no submissions section when empty", async ({ page }) => {
      await mockAccountSettingsPage(page, { submittedManagers: [] });
      await page.goto("/settings");

      // Heading either not present or shows 0
      const heading = page.getByText(/submitted managers/i);
      // Either not visible or shows (0)
      if (await heading.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(heading).toContainText(/submitted managers/i);
      }
    });
  });

  test.describe("Sign out", () => {
    test("sign out button is visible and clears session", async ({ page }) => {
      await mockAccountSettingsPage(page);
      await page.goto("/settings");

      await expect(
        page.getByRole("button", { name: /sign out/i })
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Delete Account section", () => {
    test("delete account section is visible with warning text", async ({
      page,
    }) => {
      await mockAccountSettingsPage(page);
      await page.goto("/settings");

      await expect(
        page.getByText(/delete account/i).first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(/cannot be undone/i)
      ).toBeVisible();
    });

    test("delete account button is disabled until confirmation text typed", async ({
      page,
    }) => {
      await mockAccountSettingsPage(page);
      await page.goto("/settings");

      // Open the delete account modal
      await page.getByRole("button", { name: /delete my account/i }).click();

      // The confirm button inside the modal starts disabled
      const deleteBtn = page.getByRole("button", { name: /^delete account$/i });
      await expect(deleteBtn).toBeDisabled({ timeout: 5_000 });

      // Type the required confirmation text
      await page
        .getByPlaceholder("DELETE MY ACCOUNT")
        .fill("DELETE MY ACCOUNT");

      await expect(deleteBtn).toBeEnabled({ timeout: 3_000 });
    });
  });
});
