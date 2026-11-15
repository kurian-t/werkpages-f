/* ROUTINE CI: authentication: account creation leaves no unprotected path. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";
import { mockTurnstile } from "./fixtures";

/**
 * THE SIGN-UP PAGE, WHICH NO LONGER COLLECTS A PASSWORD.
 *
 * ## What stood here, and where each guarantee went
 *
 * Nine tests drove a 394-line form: first name, last name, email, username, password, confirm
 * password, a password-strength checklist, a live username-availability check and a Turnstile
 * widget, posted to `/api/auth/signup` which forwarded to Auth0's `/dbconnections/signup`.
 *
 * That form is gone. The account is created on Auth0's hosted page, because collecting the
 * password meant it passed through this application and through our backend, and the matching
 * sign-in path used `grant_type=password`, forbidden by RFC 9700 section 2.4.
 *
 * | the old test | where the guarantee lives now |
 * | --- | --- |
 * | renders all required fields including Turnstile | nothing to render; **account creation must not be possible from here at all**, asserted below |
 * | submit disabled until all fields valid | Auth0's page validates its own fields |
 * | password requirement checklist | Auth0 owns password policy. Ours cannot drift from it any more, which is the point |
 * | passwords do not match | likewise |
 * | username taken (while typing, and on submit) | moved to profile completion. `ProfileCompletionIntegrationTest` asserts the 409 for a taken name, a case-differing name, and that a refusal leaves the profile incomplete - against a real database, which the old mocked test could not do |
 * | form submits successfully | asserted below as "the browser is sent to Universal Login" |
 * | email already registered | Auth0 recognises its own accounts. Our callback's `email_already_registered` branch is covered by `AuthCallbackHttpTest` |
 * | redirects authenticated users away | unchanged, and asserted below |
 *
 * Nine become four here; five moved to suites that assert them against a real database or a real
 * HTTP stack instead of a mocked fetch.
 */
test.describe("Sign Up page @ci", () => {
  test.beforeEach(async ({ page }) => {
    await mockTurnstile(page);
    await page.route("**/api/auth/me", (r) => r.fulfill({ status: 401, json: {} }));
  });

  /**
   * NO PASSWORD, ANYWHERE ON THE PAGE.
   *
   * The security property the migration exists for, asserted on the absence of the input: a field
   * nobody can type into cannot be posted by any route, including one a future change adds back.
   */
  test("collects no password and no account details", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator("#cf-turnstile")).toHaveCount(0);
    // The names and the username are asked for after the account exists, by /complete-profile.
    await expect(page.locator('input[placeholder="John"]')).toHaveCount(0);
    await expect(page.locator('input[placeholder*="generate"]')).toHaveCount(0);
  });

  /**
   * Replaces "form submits successfully": the page's whole job is now this redirect.
   *
   * `screen_hint=signup` is what opens Auth0's registration panel rather than its sign-in panel.
   * Without it somebody who pressed "Create an account" lands on the wrong one and has to find the
   * link themselves, which is the drop-off this page exists to avoid.
   */
  test("sends the browser to Universal Login's registration panel", async ({ page }) => {
    let startUrl = "";
    await page.route("**/api/auth/start*", (r) => {
      startUrl = r.request().url();
      return r.fulfill({ status: 200, body: "intercepted" });
    });

    await page.goto("/signup");
    await page.getByRole("button", { name: /sign up with email/i }).click();

    await expect.poll(() => startUrl, { timeout: 8_000 }).toContain("/api/auth/start");
    expect(startUrl).toContain("screen_hint=signup");
    expect(startUrl).toContain("connection=Username-Password-Authentication");
  });

  /** The social options stay, and stay first: they are how most accounts are created. */
  test("still offers the social providers", async ({ page }) => {
    await page.goto("/signup");
    for (const provider of [/continue with google/i, /continue with microsoft/i, /continue with facebook/i]) {
      await expect(page.getByRole("button", { name: provider })).toBeVisible({ timeout: 5_000 });
    }
  });

  test("redirects authenticated users away from signup", async ({ page }) => {
    const user = { id: "u1", username: "someone", email: "s@e.test", profileComplete: true };
    await page.unroute("**/api/auth/me");
    await page.route("**/api/auth/me", (r) => r.fulfill({ status: 200, json: { user } }));
    /*
      localStorage as well as the endpoint. AuthContext seeds itself from the stored copy before
      it validates against /api/auth/me, so mocking only the endpoint leaves the first render
      signed out - and this page decides whether to redirect on that first render.
    */
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, user);

    await page.goto("/signup");
    await expect(page).not.toHaveURL(/signup/, { timeout: 8_000 });
  });
});
