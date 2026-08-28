import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  MOCK_PENDING_MANAGER,
  TEST_PENDING_MANAGER_ID,
  mockManagerPage,
  mockDirectoryPage,
} from "./fixtures";

test.describe("Access Control", () => {
  test.describe("/admin route - direct URL access", () => {
    // The Admin Panel link is hidden from the header nav for non-admins.
    // These tests verify that if someone manually navigates to /admin,
    // they still see "Access Denied" rather than a blank page or crash.

    test("non-admin user navigating directly to /admin sees Access Denied", async ({
      page,
    }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ json: MOCK_USER })
      );
      await page.addInitScript((u) => {
        localStorage.setItem("authUser", JSON.stringify(u));
      }, MOCK_USER);

      await page.goto("/admin");

      await expect(
        page.getByText(/access denied/i)
      ).toBeVisible({ timeout: 10_000 });
      // Should not see the admin tabs
      await expect(
        page.getByText(/pending managers/i)
      ).not.toBeVisible();
    });

    test("unauthenticated user navigating directly to /admin sees Access Denied", async ({
      page,
    }) => {
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );
      await page.goto("/admin");

      await expect(
        page.getByText(/access denied/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("Admin Panel link is not shown in the header nav for regular users", async ({
      page,
    }) => {
      await mockDirectoryPage(page, { loggedIn: true });
      await page.goto("/directory");

      // Open the user menu in the header
      await page.locator("button:visible", { hasText: MOCK_USER.username }).click();

      // "Admin Panel" link must not be present for a non-admin user
      await expect(
        page.getByRole("link", { name: /admin panel/i })
      ).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("Pending manager - other users cannot access", () => {
    // The API returns 404 for any user who is not the submitter.
    // Pending profiles must not be visible or accessible to anyone else.

    test("different logged-in user gets 'Manager Not Found' when visiting a pending profile URL", async ({
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

    test("pending manager does not appear in directory for other users", async ({
      page,
    }) => {
      // The directory only shows pending submissions for the submitting user.
      // For other users, no pending submissions section is shown.
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ json: { ...MOCK_USER, id: "other-user" } })
      );
      await page.route(/\/api\/managers\?/, (route) =>
        route.fulfill({ json: { data: [], total: 0 } })
      );
      await page.route("**/api/companies", (route) =>
        route.fulfill({ json: [] })
      );
      // Returns empty pending submissions for this user (they didn't submit it)
      await page.route("**/api/users/me/submitted-managers", (route) =>
        route.fulfill({ json: { data: [] } })
      );
      await page.addInitScript((u) => {
        localStorage.setItem("authUser", JSON.stringify(u));
      }, { ...MOCK_USER, id: "other-user" });

      await page.goto("/directory");

      await expect(
        page.getByText(/your pending submissions/i)
      ).not.toBeVisible();
    });
  });

  test.describe("Banned user restrictions", () => {
    test("banned user cannot open the review form", async ({ page }) => {
      const bannedUser = { ...MOCK_USER, isBanned: true };
      await mockManagerPage(page, { loggedIn: true, user: bannedUser });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      // The write review button should be disabled for banned users
      const writeBtn = page
        .getByRole("button", { name: /write a review/i })
        .first();
      await expect(writeBtn).toBeDisabled({ timeout: 10_000 });
    });

    test("edit manager details is disabled for banned user", async ({
      page,
    }) => {
      const bannedUser = { ...MOCK_USER, isBanned: true };
      await mockManagerPage(page, { loggedIn: true, user: bannedUser });
      await page.goto(`/manager/${TEST_MANAGER_ID}`);

      // Button text is "Edit Manager Details"; aria-label says "Your account has been suspended" when banned
      await expect(
        page.locator("button").filter({ hasText: /edit manager details/i })
      ).toBeDisabled({ timeout: 5_000 });
    });
  });

  test.describe("404 / unknown routes", () => {
    test("visiting an unknown route shows a 404 / not-found page", async ({
      page,
    }) => {
      await page.goto("/this-route-does-not-exist-at-all");

      await expect(
        page.getByText(/not found|page.*not.*exist|404/i).first()
      ).toBeVisible({ timeout: 5_000 });
    });
  });
});
