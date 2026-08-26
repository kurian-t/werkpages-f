import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

// Shared setup: mock auth/me as authenticated
async function mockAuthenticated(page: any) {
  await page.route("**/api/auth/me", (route: any) =>
    route.fulfill({ json: MOCK_USER })
  );
  await page.addInitScript((u: any) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, MOCK_USER);
}

test.describe("Sign In / Sign Up redirect — authenticated users", () => {
  test("authenticated user visiting /signin is redirected, not shown a blank page", async ({
    page,
  }) => {
    await mockAuthenticated(page);
    await page.goto("/signin");

    // Should NOT stay on /signin and should NOT be blank
    // Either redirects away or renders meaningful content
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 10_000,
    });
    // Should not render the sign-in form
    await expect(
      page.getByRole("button", { name: /sign in/i })
        .or(page.locator('input[type="email"]'))
        .first()
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("authenticated user visiting /signup is redirected, not shown a blank page", async ({
    page,
  }) => {
    await mockAuthenticated(page);
    await page.goto("/signup");

    // Should NOT render the sign-up form
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: /sign up/i })
        .or(page.locator('input[type="email"]'))
        .first()
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("unauthenticated user can view the sign-in page normally", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/signin");

    // Sign-in form or social buttons should be visible
    await expect(
      page.getByRole("button", { name: /continue with google/i })
        .or(page.locator('input[type="email"]'))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated user can view the sign-up page normally", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/signup");

    await expect(
      page.getByRole("button", { name: /continue with google/i })
        .or(page.locator('input[type="email"]'))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("OAuth callback routing", () => {
  // AuthCallback sends new users to /explore, not /find — Werkpages' landing surface differs
  // from the RateMyManagers original this spec was forked from.
  test("new user (isNewUser=true) is redirected to /explore after OAuth callback", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );

    await page.route("**/api/auth/callback", (route) =>
      route.fulfill({
        status: 200,
        json: { user: MOCK_USER, isNewUser: true },
      })
    );

    // Navigate to a page first so we can set sessionStorage on the right origin
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("oauth_state", "test-state");
      sessionStorage.setItem("oauth_return_to", "/directory");
    });

    await page.goto("/auth/callback?code=test-code&state=test-state");

    await expect(page).toHaveURL(/\/explore/, { timeout: 10_000 });
  });

  test("returning user (isNewUser=false) is redirected to returnTo after OAuth callback", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );

    await page.route("**/api/auth/callback", (route) =>
      route.fulfill({
        status: 200,
        json: { user: MOCK_USER, isNewUser: false },
      })
    );

    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("oauth_state", "test-state");
      sessionStorage.setItem("oauth_return_to", "/directory");
    });

    await page.goto("/auth/callback?code=test-code&state=test-state");

    await expect(page).toHaveURL(/\/directory/, { timeout: 10_000 });
  });

  test("state mismatch does not show an error page — proceeds anyway", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );

    await page.route("**/api/auth/callback", (route) =>
      route.fulfill({
        status: 200,
        json: { user: MOCK_USER, isNewUser: false },
      })
    );

    // oauth_state does NOT match the state param — should warn but not error
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("oauth_state", "different-state");
      sessionStorage.setItem("oauth_return_to", "/directory");
    });

    await page.goto("/auth/callback?code=test-code&state=test-state");

    // No error message shown
    await expect(
      page.getByText(/authentication failed/i)
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("OAuth error param redirects to /signin without crashing", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );

    await page.goto("/auth/callback?error=access_denied");

    // Should redirect to sign in, not crash
    await expect(page).toHaveURL(/\/signin/, { timeout: 5_000 });
  });
});
