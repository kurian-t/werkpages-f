import { test, expect } from "./base";
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
 * werkpages.com. Overall it's confusing."
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

const PENDING_REVIEW_KEY  = "rmm_pending_review";
const PENDING_MANAGER_KEY = "rmm_pending_manager";

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

test.describe("Signing up with an email address", () => {
  test("a successful signup says to go and check the email", async ({ page }) => {
    // The control. If this ever stops rendering, nobody is told to verify anything at all.
    await fillSignupPage(page);
    await page.route(/\/api\/auth\/signup/, (r: any) =>
      r.fulfill({ status: 201, json: { id: "auth0|new", email: "new.person@example.com" } }));

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({ timeout: 10_000 });
    // The address is echoed back, because "check your email" is useless if you mistyped it.
    await expect(page.getByText("new.person@example.com")).toBeVisible();
  });

  test("a failed signup shows the reason WHERE IT CAN BE SEEN", async ({ page }) => {
    /*
      The heart of the first report. toBeInViewport, not toBeVisible: the banner was always in the
      DOM and always "visible" to Playwright, while being several hundred pixels above the button
      the person had just pressed. An assertion on visibility alone passes against the exact bug
      being reported here, which is why this one is about the viewport.
    */
    await fillSignupPage(page, "taken@example.com");
    await page.route(/\/api\/auth\/signup/, (r: any) =>
      r.fulfill({
        status: 400,
        json: { error: "email_already_registered",
                message: "An account with this email already exists. Please sign in instead." },
      }));

    await page.getByRole("button", { name: "Create Account" }).click();

    const banner = page.getByText(/an account with this email already exists/i);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toBeInViewport({ timeout: 10_000 });
  });

  test("a generic failure is also scrolled into view", async ({ page }) => {
    // Same guarantee on the catch-all path, which is the one a new failure mode will land in.
    await fillSignupPage(page);
    await page.route(/\/api\/auth\/signup/, (r: any) =>
      r.fulfill({ status: 500, json: { message: "Something went wrong on our side." } }));

    await page.getByRole("button", { name: "Create Account" }).click();

    const banner = page.getByText(/something went wrong on our side/i);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toBeInViewport({ timeout: 10_000 });
  });
});

test.describe("Landing on the site after clicking the verification link", () => {
  test("with nothing saved, it lands on sign-in and SAYS the email is verified", async ({ page }) => {
    /*
      The second report: "it takes me back to werkpages.com ... overall it's confusing".

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
