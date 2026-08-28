import { test, expect } from "./base";
import {
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_NOTIFICATION_APPROVED,
  mockDirectoryPage,
  mockManagerPage,
  TEST_MANAGER_ID,
} from "./fixtures";

// Helper: set up a page with auth + notification mocks (header is on every page)
async function setupAuthPage(
  page: any,
  opts: { loggedIn?: boolean; user?: any; notifications?: any[] } = {}
) {
  const { loggedIn = true, user = MOCK_USER, notifications = [] } = opts;

  await page.route("**/api/auth/me", (route: any) =>
    loggedIn ? route.fulfill({ json: user }) : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
  await page.route(/\/api\/managers\?/, (route: any) =>
    route.fulfill({ json: { data: [], total: 0 } })
  );
  await page.route("**/api/companies", (route: any) =>
    route.fulfill({ json: [] })
  );
  await page.route("**/api/users/me/submitted-managers", (route: any) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route("**/api/notifications", (route: any) =>
    route.fulfill({ json: { data: notifications } })
  );
  await page.route("**/api/notifications/unread-count", (route: any) =>
    route.fulfill({ json: { unreadCount: notifications.filter((n: any) => !n.read).length } })
  );
  if (loggedIn) {
    await page.addInitScript((u: any) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, user);
  }
}

test.describe("Header - logo and brand", () => {
  test("clicking the logo navigates to the homepage", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await page.getByRole("link", { name: /werkpages/i }).first().click();

    await expect(page).toHaveURL(/^\/$|\/$/);
  });
});

test.describe("Header - desktop navigation links", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop nav is hidden on mobile - covered by 'mobile menu' tests");

  // The "Search" → /find nav link was replaced by "Explore" → /explore.
  test("'Explore' nav link navigates to /explore", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/");

    await page.getByRole("link", { name: /^explore$/i }).first().click();

    await expect(page).toHaveURL(/\/explore/, { timeout: 5_000 });
  });

  test("'Managers' nav link navigates to /directory", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/");

    await page.getByRole("link", { name: /^managers$/i }).first().click();

    await expect(page).toHaveURL(/\/directory/, { timeout: 5_000 });
  });

  // Header.tsx highlights the active link with the literal class text-[#6d28d9], not text-primary.
  // "Explore" is deliberately highlighted on /find as well as /explore.
  test("'Explore' link is highlighted when on /find", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.route("**/api/managers", (route: any) =>
      route.fulfill({ json: { data: [], total: 0 } })
    );
    await page.goto("/find");

    const exploreLink = page.getByRole("link", { name: /^explore$/i }).first();
    await expect(exploreLink).toHaveClass(/text-\[#6d28d9\]/, { timeout: 5_000 });
  });

  test("'Managers' link is highlighted when on /directory", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    const managersLink = page.getByRole("link", { name: /^managers$/i }).first();
    await expect(managersLink).toHaveClass(/text-\[#6d28d9\]/, { timeout: 5_000 });
  });

  test("logged-out user sees 'Companies' nav link", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /^companies$/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("logged-in non-admin user sees 'Companies' nav link", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /^companies$/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("'Companies' nav link navigates to /companies", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.goto("/");

    await page.getByRole("link", { name: /^companies$/i }).first().click();

    await expect(page).toHaveURL(/\/companies/, { timeout: 5_000 });
  });

  test("logged-in user sees 'Add Manager' button in header", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await expect(
      page.getByRole("link", { name: /add manager/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("logged-out user does not see 'Add Manager' button", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(
      page.getByRole("link", { name: /add manager/i })
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("'Add Manager' button links to /add", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    const addBtn = page.getByRole("link", { name: /add manager/i }).first();
    await expect(addBtn).toHaveAttribute("href", /\/add/);
  });
});

test.describe("Header - auth buttons (logged out)", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop header auth buttons hidden on mobile - covered by 'mobile menu' tests");

  test("'Sign In' and 'Sign Up' buttons visible when logged out", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(
      page.getByRole("button", { name: /sign in/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /sign up/i }).first()
    ).toBeVisible();
  });

  test("clicking 'Sign In' opens the auth modal", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await page.getByRole("button", { name: /^sign in$/i }).first().click();

    // Auth modal opens - Google button appears
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clicking 'Sign Up' opens the auth modal in sign-up mode", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await page.getByRole("button", { name: /^sign up$/i }).first().click();

    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Header - user menu (logged in)", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop user menu hidden on mobile - accessed via hamburger menu");

  test("user menu button shows username", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await expect(
      page.getByRole("button", { name: /testuser/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking user menu button opens the dropdown", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();

    await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByRole("button", { name: /sign out/i })
    ).toBeVisible();
  });

  test("user menu shows username", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();

    await expect(
      page.getByText(/@testuser/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("user menu has Account Settings link", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();

    await expect(
      page.getByRole("link", { name: /account settings/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("user menu closes when clicking outside", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();
    await expect(page.getByText(/logged in as/i)).toBeVisible({ timeout: 3_000 });

    // Click outside the menu
    await page.locator("main, h1, body").first().click({ position: { x: 10, y: 10 } });

    await expect(page.getByText(/logged in as/i)).not.toBeVisible({ timeout: 3_000 });
  });

  test("admin user sees 'Admin Panel' link in user menu", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true, user: MOCK_ADMIN_USER });
    await page.goto("/directory");

    await page.getByRole("button", { name: /adminuser/i }).click();

    await expect(
      page.getByRole("link", { name: /admin panel/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("non-admin user does NOT see 'Admin Panel' link", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true, user: MOCK_USER });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();

    await expect(
      page.getByRole("link", { name: /admin panel/i })
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("banned user's menu shows 'Suspended' badge", async ({ page }) => {
    const bannedUser = { ...MOCK_USER, isBanned: true };
    await setupAuthPage(page, { loggedIn: true, user: bannedUser });
    await page.goto("/directory");

    await page.getByRole("button", { name: /testuser/i }).click();

    await expect(page.getByText(/suspended/i).first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Header - notifications bell", () => {
  test("notifications bell is visible only for logged-in users", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(
      page.getByTitle("Notifications").or(page.locator("button[title='Notifications']"))
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("bell shows for logged-in user", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.goto("/directory");

    await expect(
      page.getByTitle("Notifications")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("unread badge shown when there are unread notifications", async ({
    page,
  }) => {
    await setupAuthPage(page, {
      loggedIn: true,
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/directory");

    // Badge with count "1" (unread)
    await expect(
      page.locator("span").filter({ hasText: /^1$/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking bell opens notification dropdown", async ({ page }) => {
    await setupAuthPage(page, {
      loggedIn: true,
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/directory");

    await page.getByTitle("Notifications").click();

    await expect(
      page.getByRole("heading", { name: /^notifications$/i })
    ).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("Manager Approved")).toBeVisible();
  });

  test("dropdown shows 'View All Notifications' link to /notifications", async ({
    page,
  }) => {
    await setupAuthPage(page, {
      loggedIn: true,
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    await page.goto("/directory");

    await page.getByTitle("Notifications").click();

    await expect(
      page.getByRole("link", { name: /view all notifications/i })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("clicking a notification in dropdown navigates to notifications page", async ({
    page,
  }) => {
    await setupAuthPage(page, {
      loggedIn: true,
      notifications: [MOCK_NOTIFICATION_APPROVED],
    });
    // Override the read route (setupAuthPage doesn't add it; the mockNotificationsPage helper does)
    await page.route(/\/api\/notifications\/.+\/read/, (route) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto("/directory");

    await page.getByTitle("Notifications").click();
    // Click the notification item in the dropdown panel
    await page.locator("div[class*='cursor-pointer']").filter({ hasText: "Manager Approved" }).first().click();

    await expect(page).toHaveURL(/\/notifications/, { timeout: 5_000 });
  });
});

test.describe("Header - mobile menu", () => {
  // Helper: click the hamburger menu button (visible only on small viewports)
  async function openMobileMenu(page: any) {
    // The mobile toggle button has aria-label or contains a Menu SVG icon and is the last button in the header
    await page.locator("header button").last().click();
  }

  test("mobile menu toggle button is visible on small screens", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/directory");

    // The mobile toggle is the last button in the header
    await expect(
      page.locator("header button").last()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("mobile menu opens and shows Explore and Managers links", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/directory");

    await openMobileMenu(page);

    // The mobile nav is a separate nav block that appears below the header
    await expect(
      page.locator("nav").filter({ hasText: /explore/i }).getByRole("link", { name: /^explore$/i })
    ).toBeVisible({ timeout: 3_000 });
    await expect(
      page.locator("nav").filter({ hasText: /managers/i }).getByRole("link", { name: /^managers$/i })
    ).toBeVisible();
  });

  test("mobile menu shows Sign In and Sign Up for logged-out users", async ({
    page,
  }) => {
    await setupAuthPage(page, { loggedIn: false });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/directory");

    await openMobileMenu(page);

    await expect(
      page.getByRole("button", { name: /sign in/i }).first()
    ).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByRole("button", { name: /sign up/i }).first()
    ).toBeVisible();
  });

  test("mobile menu shows Add Manager for logged-in users", async ({ page }) => {
    await setupAuthPage(page, { loggedIn: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/directory");

    await openMobileMenu(page);

    await expect(
      page.getByRole("link", { name: /add manager/i })
    ).toBeVisible({ timeout: 3_000 });
  });
});
