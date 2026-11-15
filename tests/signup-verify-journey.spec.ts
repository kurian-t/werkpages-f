/* ROUTINE CI: draft survival across the verification round trip. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";
import { scopedDraftKey } from "../client/lib/draftScope";
import { mockTurnstile } from "./fixtures";

/**
 * The email-and-password signup journey, end to end, from the point of view of somebody doing it
 * for the first time.
 *
 * <h2>What was reported</h2>
 *
 * "When I try with email, I'm not told to go verify my email or anything, so I can click create
 * account again and again and then I see: An account with this email already exists." And then,
 * after verifying: "I click the link to verify my account and it takes me back to
 * ratemymanagers.ca. Overall it's confusing."
 *
 * Two distinct faults, neither of which lost data and both of which made the product look broken:
 *
 * <ol>
 *   <li><b>Signup failures were invisible.</b> The error banner renders at the top of the card and
 *       the Create Account button sits at the bottom of a long form - name, email, username with
 *       an availability check, password rules, confirmation, Turnstile. On a phone the message was
 *       entirely off-screen, so every press looked like nothing happening. The failure WAS being
 *       reported, just nowhere the person was looking.</li>
 *   <li><b>Verification succeeded and said nothing.</b> /auth/verified sent anybody without a
 *       saved draft to the homepage, with no acknowledgement that their address was now verified
 *       and no hint that signing in was the next step. The sign-in page has carried an
 *       "Email verified! You can now sign in." banner the whole time and nothing ever routed
 *       anyone to it.</li>
 * </ol>
 *
 * <h2>This second one was never a regression</h2>
 *
 * Worth recording, because it was assumed to have broken: {@code navigate("/")} has been in that
 * file since it was created, in commit f419c12. It never worked. What DID work and then broke was
 * the verification link pointing at the real site, and that lives in Auth0 configuration rather
 * than in this repository - the Allowed Callback URLs list had a localhost entry first, and
 * Auth0's {{ application.callback_domain }} resolves to the first entry, so every verification
 * email pointed at http://localhost:8080. Nothing in git could have shown that.
 *
 * Only email-and-password signups were ever affected: Auth0 sends verification mail solely for
 * database connections, and Google, Facebook and Microsoft assert the address themselves.
 */

/*
  The ANONYMOUS draft scope, which is where somebody bounced to sign-up midway through a form has
  their answers: they had no account when they typed them. Drafts are keyed per account now, see
  tests/draft-isolation.spec.ts. Only the keys changed; every assertion is as it was.
*/
const PENDING_REVIEW_KEY  = scopedDraftKey("rmm_pending_review", null);
const PENDING_MANAGER_KEY = scopedDraftKey("rmm_pending_manager", null);

/** The signup page with the username check and Turnstile stubbed, and the form filled in. */
async function fillSignupPage(page: any, email = "new.person@example.com") {
  await mockTurnstile(page);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
  await page.route(/\/api\/auth\/check-username/, (r: any) =>
    r.fulfill({ json: { available: true } }));

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder("John", { exact: true }).fill("New");
  await page.getByPlaceholder("Doe", { exact: true }).fill("Person");
  await page.getByPlaceholder("john@example.com", { exact: true }).fill(email);
  await page.getByPlaceholder("Click refresh to generate one").fill("newperson1");
  await page.getByPlaceholder("At least 8 characters").fill("Str0ng!pass");
  await page.getByPlaceholder("Confirm your password").fill("Str0ng!pass");
  await expect(page.getByRole("button", { name: "Create Account" })).toBeEnabled({ timeout: 10_000 });
}

/*
  THREE TESTS OF THE SIGN-UP FORM STOOD HERE. The form is gone; the guarantees moved.

    "a successful signup says to go and check the email"
    "a failed signup shows the reason WHERE IT CAN BE SEEN"
    "a generic failure is also scrolled into view"

  All three drove the 394-line form and mocked POST /api/auth/signup. The account is created on
  Auth0's hosted page now, which sends its own verification mail and words its own refusals, so
  there is no moment at which this application knows a signup succeeded or why one failed.

  | the guarantee | where it is now |
  | --- | --- |
  | somebody is told to go and verify | Auth0's page says so, and the callback REFUSES an unverified address rather than letting it through - `AuthCallbackHttpTest` asserts the `email_unverified` refusal, which is the stronger half: being told is a courtesy, being refused is the control |
  | the address is echoed back so a typo is visible | Auth0 shows the address it is sending to on its own page |
  | a refusal is rendered WHERE IT CAN BE SEEN, not below the fold | this was a real usability bug once - an error rendered off-screen reads as nothing happening. It applies to any form this product still owns, and `/complete-profile` is now the one that can refuse. Asserted below |

  What is NOT retargeted away: the four draft-preservation tests in the next block. Those are the
  reason this file exists and they are untouched.
*/

test.describe("A refusal is rendered where it can be seen @ci", () => {
  /**
   * The usability guarantee from "a failed signup shows the reason WHERE IT CAN BE SEEN", carried
   * to the form that can still refuse.
   *
   * An error rendered below the fold reads as nothing having happened, and somebody presses the
   * button again. Profile completion can refuse for two reasons - the username is taken, or it is
   * not valid - and both have to land in view.
   */
  test("a refused username is reported in view, not below the fold", async ({ page }) => {
    const user = { id: "u1", username: "user_1a2b3c4d", email: "new@example.test",
                   profileComplete: false };
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 200, json: { user } }));
    // AuthContext seeds from the stored copy before it validates, and this page decides whether to
    // render on that first pass - so the endpoint mock alone leaves it redirecting to sign-in.
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, user);
    await page.route("**/api/auth/complete-profile", (r: any) =>
      r.fulfill({ status: 409, json: { error: "username_taken" } }));

    await page.goto("/complete-profile");
    await page.getByLabel(/^username$/i).fill("takenname");
    await page.getByRole("button", { name: /continue/i }).click();

    const error = page.getByText(/already taken/i);
    await expect(error).toBeVisible({ timeout: 8_000 });

    // In the viewport, not merely in the DOM. That distinction is the whole point of the original
    // test: an error can be "visible" to Playwright and still be scrolled off a phone screen.
    const box = await error.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "the error must have a position at all").not.toBeNull();
    if (box && viewport) {
      expect(box.y, "the error is below the fold, where nobody will read it")
        .toBeLessThan(viewport.height);
    }
  });
});

test.describe("Landing on the site after clicking the verification link @ci", () => {
  test("with nothing saved, it lands on sign-in and SAYS the email is verified", async ({ page }) => {
    /*
      The second report: "it takes me back to ratemymanagers.ca ... overall it's confusing".

      Arriving at the homepage is indistinguishable from the link having done nothing. The
      acknowledgement matters more than the destination - somebody who has just clicked a link in
      an email needs to be told it worked and what to do next.
    */
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.goto("/auth/verified");

    await expect(page).toHaveURL(/\/signin$/, { timeout: 10_000 });
    await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/you can now sign in/i)).toBeVisible();
  });

  test("a half-finished review still takes them back to it", async ({ page }) => {
    /*
      The behaviour that must NOT be lost to the fix above. Somebody bounced to sign-up midway
      through writing a review has their draft saved with a returnTo, and verification has to
      resume that rather than drop them on a sign-in page having forgotten their work. ?verified=true
      is what makes the form reopen its sign-in step.
    */
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.addInitScript(([key, payload]) => {
      localStorage.setItem(key as string, payload as string);
    }, [PENDING_REVIEW_KEY, JSON.stringify({ returnTo: "/manager/42" })]);

    await page.goto("/auth/verified");

    /*
      The PATH is asserted, with the query optional, because ?verified=true is consumed on arrival:
      BossProfile reads it and then calls setSearchParams({}, { replace: true }) so that a refresh
      does not reopen the sign-in modal. Pinning the full URL asserted a state that exists for a
      few milliseconds and fails depending on how fast the destination mounts.

      What matters here is that verification resumed the draft instead of routing to /signin, which
      is the behaviour the sign-in fix could have broken.
    */
    await expect(page).toHaveURL(/\/manager\/42(\?.*)?$/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/signin/);
  });

  test("a half-finished manager submission also resumes", async ({ page }) => {
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.addInitScript(([key, payload]) => {
      localStorage.setItem(key as string, payload as string);
    }, [PENDING_MANAGER_KEY, JSON.stringify({ returnTo: "/add-manager" })]);

    await page.goto("/auth/verified");

    await expect(page).toHaveURL(/\/add-manager\?verified=true$/, { timeout: 10_000 });
  });

  test("a saved draft with no returnTo falls through to sign-in rather than nowhere", async ({ page }) => {
    // A malformed or older draft must not strand them on a blank redirecting screen.
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.addInitScript(([key, payload]) => {
      localStorage.setItem(key as string, payload as string);
    }, [PENDING_REVIEW_KEY, JSON.stringify({ somethingElse: true })]);

    await page.goto("/auth/verified");

    await expect(page).toHaveURL(/\/signin$/, { timeout: 10_000 });
    await expect(page.getByText(/email verified/i)).toBeVisible({ timeout: 10_000 });
  });
});
