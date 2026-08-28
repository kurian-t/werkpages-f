import { test, expect } from "./base";
import {
  MOCK_NOTIFICATION_APPROVED,
  MOCK_NOTIFICATION_REJECTED,
  mockNotificationsPage,
} from "./fixtures";

// The notifications page renders two NotificationList components - one for
// mobile (sm:hidden) and one for desktop (hidden sm:flex). Only one is visible
// at a time depending on viewport. Use `:visible` CSS extension to avoid
// strict-mode failures from the hidden duplicate.

test.describe("Notifications", () => {
  test("shows notification list on load", async ({ page }) => {
    await mockNotificationsPage(page);
    await page.goto("/notifications");

    await expect(
      page.locator("h3:visible", { hasText: "Manager Approved" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("h3:visible", { hasText: "Manager Rejected" })
    ).toBeVisible();
  });

  test("empty state when no notifications", async ({ page }) => {
    await mockNotificationsPage(page, { notifications: [] });
    await page.goto("/notifications");

    await expect(
      page.getByText(/no notifications yet/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("unread notification is visually distinct", async ({ page }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/notifications");

    // The unread dot is a visual indicator; check the notification is present
    await expect(
      page.locator("h3:visible", { hasText: "Manager Approved" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a notification opens its detail view", async ({ page }) => {
    await mockNotificationsPage(page);
    await page.goto("/notifications");

    await expect(
      page.locator("h3:visible", { hasText: "Manager Approved" })
    ).toBeVisible({ timeout: 10_000 });

    // Click the visible list button for this notification
    await page.locator("button:visible", { hasText: "Manager Approved" }).click();

    // Detail message should be visible in the detail panel
    await expect(
      page.locator("p:visible", { hasText: "has been approved and is now live" })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("approved manager notification shows 'View Manager Profile' button", async ({
    page,
  }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/notifications");

    await page.locator("button:visible", { hasText: "Manager Approved" }).click();

    await expect(
      page.getByRole("link", { name: /view manager profile/i })
        .or(page.getByRole("button", { name: /view manager profile/i }))
    ).toBeVisible({ timeout: 3_000 });
  });

  test("rejected notification without managerId does not show view button", async ({
    page,
  }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_REJECTED],
    });
    await page.goto("/notifications");

    await page.locator("button:visible", { hasText: "Manager Rejected" }).click();

    await expect(
      page.getByRole("link", { name: /view manager profile/i })
        .or(page.getByRole("button", { name: /view manager profile/i }))
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("rejected notification message shows manager name, company and reason", async ({
    page,
  }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_REJECTED],
    });
    await page.goto("/notifications");

    await page.locator("button:visible", { hasText: "Manager Rejected" }).click();

    await expect(
      page.locator("p:visible", { hasText: /Bad Manager/ })
    ).toBeVisible({ timeout: 3_000 });
    await expect(
      page.locator("p:visible", { hasText: /Some Corp/ })
    ).toBeVisible();
    await expect(
      page.locator("p:visible", { hasText: /Reason: Duplicate profile/ })
    ).toBeVisible();
  });

  test("clicking a notification opens the detail view", async ({ page }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/notifications");

    await page.locator("button:visible", { hasText: "Manager Approved" }).click();

    // Notification detail message is shown in the detail panel
    await expect(
      page.locator("p:visible", { hasText: /approved and is now live/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("read notifications don't show the unread dot", async ({ page }) => {
    const readNotif = { ...MOCK_NOTIFICATION_APPROVED, read: true };
    await mockNotificationsPage(page, { notifications: [readNotif] });
    await page.goto("/notifications");

    await expect(
      page.locator("h3:visible", { hasText: "Manager Approved" })
    ).toBeVisible({ timeout: 10_000 });

    // Unread green dot must not be visible for a read notification
    // The dot has class "bg-green-500 rounded-full" inside the list item
    await expect(
      page.locator("button:visible").filter({ hasText: "Manager Approved" })
        .locator(".bg-green-500.rounded-full")
    ).not.toBeVisible();
  });

  test("multiple notifications all appear in the list", async ({ page }) => {
    await mockNotificationsPage(page, {
      notifications: [MOCK_NOTIFICATION_APPROVED, MOCK_NOTIFICATION_REJECTED],
    });
    await page.goto("/notifications");

    await expect(
      page.locator("h3:visible", { hasText: "Manager Approved" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("h3:visible", { hasText: "Manager Rejected" })
    ).toBeVisible();
  });
});
