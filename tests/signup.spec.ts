import { test, expect } from "./base";
import { mockTurnstile } from "./fixtures";

// Shared API mocks for the /signup page
async function mockSignupPage(
  page: any,
  opts: {
    usernameAvailable?: boolean;
    signupResponse?: { status: number; json: any };
  } = {}
) {
  const {
    usernameAvailable = true,
    signupResponse = { status: 201, json: { id: "auth0|abc", email: "jane@example.com" } },
  } = opts;

  await page.route("**/api/auth/me", (route: any) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );

  await page.route(/\/api\/auth\/check-username/, (route: any) =>
    route.fulfill({ json: { available: usernameAvailable } })
  );

  await page.route("**/api/auth/signup", (route: any) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: signupResponse.status, json: signupResponse.json });
    } else {
      route.continue();
    }
  });

}

/** Fills every field on the /signup form with valid values. */
async function fillSignupForm(page: any) {
  await page.getByLabel("First Name").fill("Jane");
  await page.getByLabel("Last Name").fill("Doe");
  await page.locator("#emailOrPhone").fill("jane@example.com");

  // Username field — type a value so the availability check fires
  await page.locator("#username").fill("janedoe99");

  // Wait for the availability check to resolve ("Username is available!")
  await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5_000 });

  await page.locator("#password").fill("Password1!");
  await page.locator("#confirmPassword").fill("Password1!");
}

test.describe("Sign Up page — /signup", () => {
  test("renders all required form fields including Turnstile widget", async ({ page }) => {
    await mockSignupPage(page);
    await page.goto("/signup");

    await expect(page.getByLabel("First Name")).toBeVisible();
    await expect(page.getByLabel("Last Name")).toBeVisible();
    await expect(page.locator("#emailOrPhone")).toBeVisible();
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();

    // Turnstile widget must render — absence means siteKey is missing or CSP blocked it
    await expect(page.locator("#cf-turnstile")).toBeVisible({ timeout: 8_000 });
  });

  test("submit button is disabled until all fields are valid", async ({ page }) => {
    await mockSignupPage(page);
    await page.goto("/signup");

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("shows password requirement checklist when typing password", async ({ page }) => {
    await mockSignupPage(page);
    await page.goto("/signup");

    await page.locator("#password").fill("a");

    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    await expect(page.getByText(/at least one uppercase letter/i)).toBeVisible();
  });

  test("shows passwords do not match error", async ({ page }) => {
    await mockSignupPage(page);
    await page.goto("/signup");

    await page.locator("#password").fill("Password1!");
    await page.locator("#confirmPassword").fill("Different1!");

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("shows username taken error when username is unavailable", async ({ page }) => {
    await mockSignupPage(page, { usernameAvailable: false });
    await page.goto("/signup");

    await page.locator("#username").fill("takenuser");
    await expect(page.getByText(/username is already taken/i)).toBeVisible({ timeout: 5_000 });
  });

  test("submit button enables and form submits successfully (Turnstile test key)", async ({ page }) => {
    await mockSignupPage(page);
    await mockTurnstile(page);
    await page.goto("/signup");

    await fillSignupForm(page);

    // With VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA (CI test key), Turnstile
    // auto-passes and onSuccess fires immediately — button should become enabled.
    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 });

    await submitBtn.click();

    // Successful signup shows the email verification screen
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("jane@example.com")).toBeVisible();
  });

  test("shows error when email is already registered", async ({ page }) => {
    await mockSignupPage(page, {
      signupResponse: {
        status: 409,
        json: { error: "email_already_registered", message: "An account with this email already exists." },
      },
    });
    await mockTurnstile(page);
    await page.goto("/signup");
    await fillSignupForm(page);

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 });
    await submitBtn.click();

    await expect(
      page.getByText(/an account with this email already exists/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows error when username is taken on submit", async ({ page }) => {
    // Username shows as available in check, but server rejects on submit (race condition)
    await mockSignupPage(page, {
      signupResponse: {
        status: 409,
        json: { error: "username_taken", message: "That username is already taken." },
      },
    });
    await mockTurnstile(page);
    await page.goto("/signup");
    await fillSignupForm(page);

    const submitBtn = page.getByRole("button", { name: /create account/i });
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 });
    await submitBtn.click();

    await expect(
      page.getByText(/username is already taken/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("redirects authenticated users away from signup", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({
        json: {
          id: "u1", username: "existing", firstName: "Ex", lastName: "User",
          email: "ex@example.com", role: "user", isBanned: false,
        },
      })
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "authUser",
        JSON.stringify({
          id: "u1", username: "existing", firstName: "Ex", lastName: "User",
          email: "ex@example.com", role: "user", isBanned: false,
        })
      );
    });

    await page.goto("/signup");
    // Should redirect to /find, not stay on /signup
    await expect(page).toHaveURL(/\/find/, { timeout: 5_000 });
  });
});
