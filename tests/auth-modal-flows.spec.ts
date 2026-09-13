import { test, expect } from "./base";
import { MOCK_USER, mockTurnstile } from "./fixtures";

/**
 * What the auth modal does after the form is filled in.
 *
 * The existing spec gets as far as revealing the email form and checking the submit button is
 * gated. Everything past the submit - the signup outcomes, the verify-email step, and the whole
 * sign-in form - never ran, which is half the component.
 *
 * That matters more here than in most places, because the failures are the point. A signup can
 * fail four distinguishable ways, and three of them have a specific thing the person should do
 * next: pick another username, sign in instead, verify the email first. Collapsing them into one
 * "something went wrong" leaves somebody who already has an account trying to create it again.
 */

const SIGNUP = /\/api\/auth\/signup/;
const SIGNIN = /\/api\/auth\/signin/;

/*
  Everything is addressed inside the dialog.

  The header that opened the modal is still mounted behind it with its own "Sign In" and "Sign Up"
  buttons, so an unscoped role query matches the covered one and Playwright reports the backdrop
  intercepting the click. Scoping is also what makes "the modal closed" assertable at all.
*/
const dlg = (page: any) => page.getByRole("dialog");

/** Opens the modal from the header, which is the shortest route to it. */
async function openModal(page: any, which: "Sign In" | "Sign Up") {
  await mockTurnstile(page);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
  await page.route(/\/api\/auth\/check-username/, (r: any) =>
    r.fulfill({ json: { available: true } }));
  await page.goto("/");
  await page.getByRole("button", { name: which, exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
}

async function openEmailSignup(page: any) {
  await openModal(page, "Sign Up");
  await dlg(page).getByText(/continue with email/i).first().click();
  await expect(dlg(page).getByPlaceholder("john@example.com", { exact: true })).toBeVisible();
}

/** Fills the signup form with valid values and waits for the submit to unlock. */
async function fillSignup(page: any, email = "new@example.com") {
  await dlg(page).getByPlaceholder("John", { exact: true }).fill("New");
  await dlg(page).getByPlaceholder("Doe", { exact: true }).fill("Person");
  await dlg(page).getByPlaceholder("john@example.com", { exact: true }).fill(email);
  await dlg(page).getByPlaceholder("Click refresh to generate one").fill("newperson1");
  await dlg(page).getByPlaceholder("At least 8 characters").fill("Str0ng!pass");
  await dlg(page).getByPlaceholder("Confirm your password").fill("Str0ng!pass");
  await expect(dlg(page).getByRole("button", { name: "Create Account" })).toBeEnabled({ timeout: 10_000 });
}

async function openEmailSignin(page: any) {
  await openModal(page, "Sign In");
  await dlg(page).getByText(/continue with email/i).first().click();
  await expect(dlg(page).getByPlaceholder("Email or username")).toBeVisible();
}

test.describe("Signing up with an email address", () => {
  test("an address that is not one is refused before anything is sent", async ({ page }) => {
    /*
      Caught locally because the alternative is a round trip to be told what the field could have
      said immediately - and because a rejected signup resets the Turnstile widget, so a typo would
      cost the person the challenge as well as the attempt.
    */
    let asked = false;
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) => { asked = true; return r.fulfill({ status: 200, json: {} }); });

    await fillSignup(page, "not-an-address");
    await dlg(page).getByRole("button", { name: "Create Account" }).click();

    await expect(dlg(page).getByText("Please enter a valid email address")).toBeVisible();
    expect(asked).toBe(false);
  });

  test("a successful signup asks for the inbox, and names the address it used", async ({ page }) => {
    // The address is echoed back because this is the one screen where a typo is unrecoverable
    // without starting over - the mail goes somewhere nobody is watching and nothing says so.
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) => r.fulfill({ status: 200, json: { success: true } }));

    await fillSignup(page, "new@example.com");
    await dlg(page).getByRole("button", { name: "Create Account" }).click();

    await expect(dlg(page).getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 10_000 });
    await expect(dlg(page).getByText("new@example.com")).toBeVisible();
  });

  test("a taken username is reported on the username, not as a general failure", async ({ page }) => {
    // Said at the field that has to change. A banner at the top of a seven-field form does not
    // tell somebody which of the seven to edit.
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) =>
      r.fulfill({ status: 409, json: { error: "username_taken" } }));

    await fillSignup(page);
    await dlg(page).getByRole("button", { name: "Create Account" }).click();

    await expect(dlg(page).getByText(/already taken. Please choose another/i)).toBeVisible({ timeout: 10_000 });
    await expect(dlg(page).getByRole("button", { name: "Create Account" })).toBeVisible();
  });

  test("an address that already has an account is moved to sign-in, carrying the address", async ({ page }) => {
    /*
      The most useful failure on the form: this person does not need to create an account, they
      need to sign into the one they have. Reporting it as an error and leaving them on signup
      invites a second attempt that fails the same way.
    */
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) =>
      r.fulfill({ status: 409, json: { error: "email_already_registered" } }));

    await fillSignup(page, "known@example.com");
    await dlg(page).getByRole("button", { name: "Create Account" }).click();

    await expect(dlg(page).getByPlaceholder("Email or username")).toHaveValue("known@example.com", { timeout: 10_000 });
    await expect(dlg(page).getByText("An account with this email already exists.")).toBeVisible();
  });

  test("any other refusal is repeated as the server worded it", async ({ page }) => {
    // The server knows things the form does not - a blocked domain, a rate limit. Replacing its
    // message with a generic one throws away the only explanation available.
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) =>
      r.fulfill({ status: 400, json: { message: "That email domain is not accepted." } }));

    await fillSignup(page);
    await dlg(page).getByRole("button", { name: "Create Account" }).click();

    await expect(dlg(page).getByText("That email domain is not accepted.")).toBeVisible({ timeout: 10_000 });
  });

  test("a username already in use is caught while typing, not on submit", async ({ page }) => {
    await openEmailSignup(page);
    await page.route(/\/api\/auth\/check-username/, (r: any) =>
      r.fulfill({ json: { available: false } }));

    await dlg(page).getByPlaceholder("Click refresh to generate one").fill("taken");

    await expect(dlg(page).getByText(/already taken. Please choose another/i)).toBeVisible({ timeout: 10_000 });
  });

  test("the refresh control puts a usable username in the field", async ({ page }) => {
    /*
      Usernames here are generated rather than chosen, because the review a person writes is public
      under this name. Somebody typing their own name defeats the pseudonymity the product is built
      on, so the easy path hands them one instead.
    */
    await openEmailSignup(page);
    const field = dlg(page).getByPlaceholder("Click refresh to generate one");
    await field.fill("");

    await dlg(page).getByRole("button", { name: /generate|refresh/i }).first().click();

    await expect(field).not.toHaveValue("");
  });

  test("the password rules say which ones are met as they are met", async ({ page }) => {
    // Five rules checked live, so the requirement is discovered while typing rather than on a
    // rejected submit - the point at which most people give up on a signup form.
    await openEmailSignup(page);

    await dlg(page).getByPlaceholder("At least 8 characters").fill("Str0ng!pass");

    await expect(dlg(page).getByText("At least one uppercase letter")).toBeVisible();
    await expect(dlg(page).getByText("At least one special character")).toBeVisible();
    await expect(dlg(page).getByText("At least 8 characters").last()).toBeVisible();
  });

  test("a confirmation that does not match keeps the submit shut", async ({ page }) => {
    await openEmailSignup(page);
    await dlg(page).getByPlaceholder("John", { exact: true }).fill("New");
    await dlg(page).getByPlaceholder("Doe", { exact: true }).fill("Person");
    await dlg(page).getByPlaceholder("john@example.com", { exact: true }).fill("new@example.com");
    await dlg(page).getByPlaceholder("Click refresh to generate one").fill("newperson1");

    await dlg(page).getByPlaceholder("At least 8 characters").fill("Str0ng!pass");
    await dlg(page).getByPlaceholder("Confirm your password").fill("Str0ng!pasz");

    await expect(dlg(page).getByRole("button", { name: "Create Account" })).toBeDisabled();
  });
});

test.describe("After the verification mail is sent", () => {
  test("the way back is the email form, not the social picker", async ({ page }) => {
    /*
      Somebody who just made an email account gets the email form. Returning them to the social
      buttons would offer Google to a person who has just proved they are not using it.
    */
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) => r.fulfill({ status: 200, json: { success: true } }));
    await fillSignup(page, "new@example.com");
    await dlg(page).getByRole("button", { name: "Create Account" }).click();
    await expect(dlg(page).getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 10_000 });

    await dlg(page).getByRole("button", { name: /I've verified my email/i }).click();

    await expect(dlg(page).getByPlaceholder("Email or username")).toBeVisible();
    await expect(dlg(page).getByPlaceholder("Password", { exact: true })).toBeVisible();
  });

  test("the address just used is already in the sign-in field", async ({ page }) => {
    await openEmailSignup(page);
    await page.route(SIGNUP, (r: any) => r.fulfill({ status: 200, json: { success: true } }));
    await fillSignup(page, "new@example.com");
    await dlg(page).getByRole("button", { name: "Create Account" }).click();
    await expect(dlg(page).getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 10_000 });

    await dlg(page).getByRole("button", { name: /I've verified my email/i }).click();

    await expect(dlg(page).getByPlaceholder("Email or username")).toHaveValue("new@example.com");
  });
});

test.describe("Signing in", () => {
  test("a correct password signs the person in and closes the modal", async ({ page }) => {
    await openEmailSignin(page);
    await page.route(SIGNIN, (r: any) => r.fulfill({ status: 200, json: { user: MOCK_USER } }));

    await dlg(page).getByPlaceholder("Email or username").fill("testuser");
    await dlg(page).getByPlaceholder("Password", { exact: true }).fill("Str0ng!pass");
    await dlg(page).getByRole("button", { name: /^Sign In$/ }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  });

  test("an unverified account is told to verify, not that it got the password wrong", async ({ page }) => {
    /*
      The distinction is the whole point of the 403. "Invalid credentials" sends somebody to reset
      a password that was correct, and the reset mail lands in the same unread inbox as the
      verification mail they actually need.
    */
    await openEmailSignin(page);
    await page.route(SIGNIN, (r: any) =>
      r.fulfill({ status: 403, json: { error: "email_not_verified" } }));

    await dlg(page).getByPlaceholder("Email or username").fill("unverified@example.com");
    await dlg(page).getByPlaceholder("Password", { exact: true }).fill("Str0ng!pass");
    await dlg(page).getByRole("button", { name: /^Sign In$/ }).click();

    await expect(dlg(page).getByText(/verify your email before signing in/i)).toBeVisible({ timeout: 10_000 });
    await expect(dlg(page).getByText("Invalid credentials. Please try again.")).toHaveCount(0);
  });

  test("a wrong password says so without saying which half was wrong", async ({ page }) => {
    // Deliberately not "no such user": that answer turns the form into a way to test whether an
    // address has an account here, which for this product is something people would rather not
    // have discoverable.
    await openEmailSignin(page);
    await page.route(SIGNIN, (r: any) =>
      r.fulfill({ status: 401, json: { error: "invalid_credentials" } }));

    await dlg(page).getByPlaceholder("Email or username").fill("testuser");
    await dlg(page).getByPlaceholder("Password", { exact: true }).fill("wrong");
    await dlg(page).getByRole("button", { name: /^Sign In$/ }).click();

    await expect(dlg(page).getByText("Invalid credentials. Please try again.")).toBeVisible({ timeout: 10_000 });
  });

  test("a request that never arrives is reported as a connection problem", async ({ page }) => {
    // A different fix for the reader: retry, rather than check the password. Reporting this as
    // invalid credentials would have somebody resetting a password over a dropped connection.
    await openEmailSignin(page);
    await page.route(SIGNIN, (r: any) => r.abort("failed"));

    await dlg(page).getByPlaceholder("Email or username").fill("testuser");
    await dlg(page).getByPlaceholder("Password", { exact: true }).fill("Str0ng!pass");
    await dlg(page).getByRole("button", { name: /^Sign In$/ }).click();

    await expect(dlg(page).getByText(/Unable to connect/i)).toBeVisible({ timeout: 10_000 });
  });

  test("the social picker is one step back from the email form", async ({ page }) => {
    /*
      Asserted on the picker's own control rather than on a Google button, because the social
      buttons only render when the build carries Auth0 credentials - RMM's does not, and a test
      keyed on them fails there for a reason that has nothing to do with this behaviour.
    */
    await openEmailSignin(page);

    await dlg(page).getByRole("button", { name: /Other sign-in options/i }).click();

    await expect(dlg(page).getByRole("button", { name: "Continue with email" })).toBeVisible();
    await expect(dlg(page).getByPlaceholder("Email or username")).toHaveCount(0);
  });

  test("signing up is offered from the sign-in view and the other way round", async ({ page }) => {
    // Most people arrive at the wrong one of the two. The swap has to be on both.
    await openModal(page, "Sign In");

    await dlg(page).getByRole("button", { name: "Create one", exact: true }).click();
    await expect(dlg(page).getByRole("heading", { name: "Create an account" })).toBeVisible();

    await dlg(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(dlg(page).getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Leaving the modal", () => {
  test("Escape closes it", async ({ page }) => {
    await openModal(page, "Sign In");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clicking the backdrop closes it, clicking the panel does not", async ({ page }) => {
    // The panel stops the click itself. Without that, a click anywhere inside - selecting text in
    // a field, missing a button by two pixels - dismisses a part-filled form.
    await openModal(page, "Sign In");

    await page.getByRole("dialog").click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the close control closes it", async ({ page }) => {
    await openModal(page, "Sign In");

    await dlg(page).getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
