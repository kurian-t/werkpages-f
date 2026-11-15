/* ROUTINE CI: authentication: the interposition whose failure is silent. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";

/**
 * CHOOSING A USERNAME, IN A BROWSER.
 *
 * ## Why this file exists
 *
 * `ProfileCompletionIntegrationTest` proves the endpoint against a real database: the claim, the
 * taken name, the case-differing name, the already-complete refusal, and that the SESSION decides
 * whose profile changes. All of it server-side.
 *
 * Two user-facing guarantees were left with no test at all, and both were found by auditing the
 * Universal Login migration for guarantees that survived rather than for tests that were removed:
 *
 *   1. that choosing a username actually completes the profile and carries the person onward to
 *      where they were going;
 *   2. that the callback INTERPOSES this step when it is owed, and does not when it is not.
 *
 * The second is the one that matters most. Universal Login never asks for a username, so an
 * account arrives with a placeholder; if the callback stopped interposing, nobody would ever be
 * asked to choose one and every contributor would publish as `user_1a2b3c4d`. Nothing would fail -
 * accounts would work, ratings would publish - which is exactly why it needs a test.
 */

const PROVISIONAL = {
  id: "u-provisional", username: "user_1a2b3c4d", email: "new@example.test",
  firstName: "", lastName: "", profileComplete: false,
};
const COMPLETE = { ...PROVISIONAL, username: "chosen_name", profileComplete: true };

/** Signs somebody in, seeding both the stored copy and the endpoint AuthContext validates against. */
async function signedInAs(page: any, user: any) {
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 200, json: { user } }));
  await page.addInitScript((u: any) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
}

test.describe("Profile completion @ci", () => {
  test("choosing a username completes the profile and continues to where they were going", async ({ page }) => {
    await signedInAs(page, PROVISIONAL);
    let sent: any = null;
    await page.route("**/api/auth/complete-profile", (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, username: sent.username } });
    });

    await page.goto("/complete-profile");
    await page.getByLabel(/^username$/i).fill("chosen_name");
    await page.getByRole("button", { name: /continue/i }).click();

    // Off this page, and onward. Staying here would strand somebody who has finished.
    await expect(page).not.toHaveURL(/complete-profile/, { timeout: 8_000 });
    expect(sent?.username).toBe("chosen_name");
  });

  test("the names asked for here are sent with the username", async ({ page }) => {
    // They moved off the signup form, which collected them; this is the only place left that asks.
    await signedInAs(page, PROVISIONAL);
    let sent: any = null;
    await page.route("**/api/auth/complete-profile", (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, username: sent.username } });
    });

    await page.goto("/complete-profile");
    await page.getByLabel(/first name/i).fill("Ada");
    await page.getByLabel(/last name/i).fill("Lovelace");
    await page.getByLabel(/^username$/i).fill("ada_l");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect.poll(() => sent, { timeout: 8_000 }).not.toBeNull();
    expect(sent.firstName).toBe("Ada");
    expect(sent.lastName).toBe("Lovelace");
  });

  /**
   * SKIPPING IS ALLOWED, and that is deliberate rather than an oversight.
   *
   * Somebody who arrived here mid-contribution has a half-finished rating waiting. Making a
   * display name mandatory before they can publish it would be a gate on a contribution, which
   * section 44 of the operating rules exists to prevent. The backend publishes a pseudonym rather
   * than the placeholder, so nothing broken is exposed either way.
   */
  test("skipping leaves the profile incomplete and sends nothing", async ({ page }) => {
    await signedInAs(page, PROVISIONAL);
    let called = false;
    await page.route("**/api/auth/complete-profile", (r: any) => {
      called = true;
      return r.fulfill({ status: 200, json: { success: true, username: "x" } });
    });

    await page.goto("/complete-profile");
    await page.getByRole("button", { name: /skip for now/i }).click();

    await expect(page).not.toHaveURL(/complete-profile/, { timeout: 8_000 });
    expect(called, "skipping must not claim a username").toBe(false);
  });

  /**
   * THE CALLBACK INTERPOSES THIS STEP, and keys on `profileComplete`, not `isNewUser`.
   *
   * <p>The guarantee with the quietest failure mode in the whole flow. If the callback stopped
   * interposing, nothing would break: accounts would be created, ratings would publish, and every
   * contributor would appear as `user_1a2b3c4d` for ever because nobody was ever asked to choose a
   * name. No error, no failed request, no red test - just a product slowly filling with
   * placeholder identities.
   *
   * <p>Keying on `profileComplete` rather than `isNewUser` matters for the second visit: somebody
   * who skipped is no longer new and still owes a username.
   */
  test("the callback sends a provisional account to choose a username, carrying returnTo", async ({ page }) => {
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.route("**/api/auth/callback", (r: any) =>
      r.fulfill({ status: 200, json: { user: PROVISIONAL, isNewUser: true } }));

    await page.addInitScript(() => {
      sessionStorage.setItem("oauth_return_to", "/about");
    });
    await page.goto("/auth/callback?code=abc&state=xyz");

    await expect(page).toHaveURL(/complete-profile/, { timeout: 10_000 });
  });

  test("the callback does NOT interpose when the profile is already complete", async ({ page }) => {
    // The other half, and it has to be asserted too: interposing unconditionally would send
    // somebody who has had a username for years to choose one again on every sign-in.
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.route("**/api/auth/callback", (r: any) =>
      r.fulfill({ status: 200, json: { user: COMPLETE, isNewUser: false } }));

    await page.goto("/auth/callback?code=abc&state=xyz");

    await expect(page).not.toHaveURL(/complete-profile/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/auth\/callback/, { timeout: 10_000 });
  });

  test("a profile that is already complete does not sit on this page", async ({ page }) => {
    await signedInAs(page, COMPLETE);
    await page.goto("/complete-profile");
    await expect(page).not.toHaveURL(/complete-profile/, { timeout: 8_000 });
  });

  test("somebody signed out is sent to sign in, not shown the form", async ({ page }) => {
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.goto("/complete-profile");
    await expect(page).toHaveURL(/signin/, { timeout: 8_000 });
  });
});
