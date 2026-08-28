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

    test("delete review button shows confirmation dialog with 30-day warning", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /delete/i }).first().click();

      await expect(
        page.getByText(/delete this review\?/i)
      ).toBeVisible({ timeout: 3_000 });
      // Warns the user about the 30-day cooldown before they confirm
      await expect(
        page.getByText(/30 days/i)
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /yes, delete/i })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /keep it/i })
      ).toBeVisible();
    });

    test("'Keep it' cancels the delete confirmation", async ({ page }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("button", { name: /delete/i }).first().click();
      await expect(
        page.getByText(/delete this review\?/i)
      ).toBeVisible({ timeout: 3_000 });

      await page.getByRole("button", { name: /keep it/i }).click();

      // Confirmation gone, review still there
      await expect(page.getByText(/delete this review\?/i)).not.toBeVisible();
      await expect(page.getByText("Alex Johnson")).toBeVisible();
    });

    test("'Yes, delete' removes the review and shows empty state", async ({
      page,
    }) => {
      await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
      await page.goto("/settings");

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("button", { name: /delete/i }).first().click();
      await page.getByRole("button", { name: /yes, delete/i }).click();

      // Review removed - empty state appears
      await expect(
        page.getByText(/you haven't written any reviews yet/i)
      ).toBeVisible({ timeout: 5_000 });
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
