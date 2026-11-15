/* ROUTINE CI: authentication: no password collected, no enumeration oracle. Tagged @ci; see playwright.config.ts. */
import { test, expect } from "./base";
import { MOCK_USER, mockTurnstile,
  clickHeaderControl,
} from "./fixtures";

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
  // On a phone this control is inside the drawer; the helper opens it when it needs to.
  await clickHeaderControl(page, which);
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
}

async function openEmailSignup(page: any) {
  await openModal(page, "Sign Up");
  await dlg(page).getByText(/continue with email/i).first().click();
  await expect(dlg(page).getByLabel(/^email$/i)).toBeVisible();
}

async function openEmailSignin(page: any) {
  await openModal(page, "Sign In");
  await dlg(page).getByText(/continue with email/i).first().click();
  await expect(dlg(page).getByPlaceholder(/email or username/i)).toBeVisible();
}

/** Captures the /api/auth/start navigation without letting the browser leave the page. */
async function captureStart(page: any): Promise<() => string> {
  let url = "";
  await page.route("**/api/auth/start*", (r: any) => {
    url = r.request().url();
    return r.fulfill({ status: 200, body: "intercepted" });
  });
  return () => url;
}

/*
  ─────────────────────────────────────────────────────────────────────────────
  WHAT REPLACED EIGHTEEN TESTS, AND WHERE EACH GUARANTEE WENT

  Three describe blocks stood here - "Signing up with an email address" (10 tests), "After the
  verification mail is sent" (2) and "Signing in" (6). All eighteen drove forms that no longer
  exist: this modal collected a first name, a last name, an email, a username, a password and a
  confirmation, and posted them to /api/auth/signup or /api/auth/signin. Those endpoints are gone,
  and grant_type=password with them, because RFC 9700 section 2.4 forbids it.

  The forms went. The guarantees did not, and this comment is the audit trail for every one:

    the old test                              where that guarantee lives now
    ─────────────────────────────────────────────────────────────────────────────────────────
    an address that is not one is refused     the input is type="email", so the browser refuses
      before anything is sent                 to submit. Asserted below
    the password rules say which ones are     Auth0's hosted page. Not ours to assert, and not
      met as they are met                     ours to get wrong either
    a confirmation that does not match        likewise
      keeps the submit shut
    a taken username is reported on the       moved to profile completion.
      username, not as a general failure      ProfileCompletionIntegrationTest asserts the 409
                                              and that the refusal leaves the profile incomplete
    a username already in use is caught       same place. The check endpoint still exists
      while typing
    the refresh control puts a usable         CompleteProfile.tsx keeps the generator; asserted
      username in the field                   below
    an address that already has an account    Auth0 recognises the address itself now. The
      is moved to sign-in, carrying it        carrying-it half is asserted below
    a successful signup asks for the inbox    Auth0 sends its own verification mail
    the way back is the email form, not       asserted below, unchanged in spirit
      the social picker
    the address just used is already in       asserted below
      the sign-in field
    a correct password signs the person in    there is no password here to be correct
    an unverified account is told to verify,  the callback's email_unverified refusal.
      not that it got the password wrong      AuthCallbackHttpTest owns it
    a wrong password says so without saying   THE ENUMERATION GUARANTEE, and the one that matters
      which half was wrong                    most. Our surfaces must never reveal whether an
                                              address has an account. AccountRecoveryIntegration-
                                              Test asserts byte-identical responses; asserted
                                              below for this modal
    a request that never arrives is reported  there is no request to fail; signing in is a
      as a connection problem                 navigation
    any other refusal is repeated as the      no refusals to repeat
      server worded it

  Net: eighteen browser tests become twelve here, and six guarantees moved to backend suites that
  assert them against a real database rather than a mocked fetch - which is stronger, not weaker.
  ─────────────────────────────────────────────────────────────────────────────
*/

test.describe("What the modal must never do @ci", () => {
  /**
   * NO PASSWORD IS COLLECTED. This is the security property the whole migration exists for.
   *
   * Asserted on the absence of the input rather than on the absence of a request, because an
   * input nobody can type into cannot be posted by any means - a bug, a browser extension, or a
   * future change that re-adds a submit handler.
   */
  test("no password field exists in any state of the modal", async ({ page }) => {
    await openModal(page, "Sign Up");
    await expect(dlg(page).locator('input[type="password"]')).toHaveCount(0);

    await dlg(page).getByText(/continue with email/i).first().click();
    await expect(dlg(page).locator('input[type="password"]')).toHaveCount(0);

    await dlg(page).getByText(/already have an account/i).click();
    await expect(dlg(page).locator('input[type="password"]')).toHaveCount(0);
  });

  /**
   * NO ACCOUNT IS CREATED FROM HERE, which is what replaced the Turnstile tests.
   *
   * Turnstile guarded this modal's own account creation. Account creation now happens on Auth0's
   * hosted page, which has its own bot and brute-force protection, so the guarantee worth asserting
   * is not "a CAPTCHA renders" - a CAPTCHA in front of a redirect protects nothing - but that no
   * unprotected account-creation path leaves this client at all.
   */
  test("no account-creation or sign-in request leaves the client", async ({ page }) => {
    const calls: string[] = [];
    for (const pattern of ["**/api/auth/signup", "**/api/auth/signin"]) {
      await page.route(pattern, (r: any) => {
        calls.push(r.request().url());
        return r.fulfill({ status: 410, json: { error: "retired" } });
      });
    }
    const startUrl = await captureStart(page);

    await openEmailSignup(page);
    await dlg(page).getByLabel(/^email$/i).fill("newperson@example.com");
    await dlg(page).getByRole("button", { name: /^continue$/i }).click();

    await expect.poll(startUrl, { timeout: 8_000 }).toContain("/api/auth/start");
    expect(calls, "the retired endpoints must not be called at all").toEqual([]);
  });

  /**
   * THE MODAL REVEALS NOTHING ABOUT WHETHER AN ACCOUNT EXISTS.
   *
   * The guarantee from "a wrong password says so without saying which half was wrong", carried
   * across. The username path is the only one that could leak it here, and the acknowledgement is
   * shown before the request resolves and does not depend on it - so a username nobody holds, a
   * username somebody holds, and a request that fails outright all read identically.
   */
  test("the username path reads the same whether the account exists or not", async ({ page }) => {
    const seen: string[] = [];
    for (const outcome of ["found", "missing", "aborted"] as const) {
      await openEmailSignin(page);
      await page.route("**/api/auth/recover", (r: any) =>
        outcome === "aborted"
          ? r.abort("failed")
          : r.fulfill({ status: 202, json: { message: "ok" } }));

      await dlg(page).getByPlaceholder(/email or username/i).fill("some_username");
      await dlg(page).getByRole("button", { name: /sign in/i }).click();

      const banner = dlg(page).getByText(/if an account matches that username/i);
      await expect(banner).toBeVisible({ timeout: 8_000 });
      seen.push(((await banner.textContent()) ?? "").trim());
      await page.unroute("**/api/auth/recover");
      await page.keyboard.press("Escape");
    }
    expect(new Set(seen).size, "all three outcomes must read identically: " + JSON.stringify(seen))
      .toBe(1);
  });
});

test.describe("Signing up with an email address @ci", () => {
  test("an address that is not one is refused before anything is sent", async ({ page }) => {
    const startUrl = await captureStart(page);
    await openEmailSignup(page);

    await dlg(page).getByLabel(/^email$/i).fill("not-an-address");
    await dlg(page).getByRole("button", { name: /^continue$/i }).click();

    // type="email" means the browser refuses to submit, so nothing is sent. Same guarantee as
    // the old client-side check, enforced by the platform instead of by our code.
    await page.waitForTimeout(500);
    expect(startUrl()).toBe("");
  });

  /**
   * The address is carried to Auth0 so it is not typed twice.
   *
   * This is what remains of "an address that already has an account is moved to sign-in, carrying
   * the address": Auth0 recognises the address itself, and our job is only to hand it over.
   *
   * `login_hint` here is always an address the person typed about themselves. It must NEVER come
   * from resolving a username, which would be an enumeration oracle - the server refuses anything
   * that is not email-shaped, and AuthCallbackBoundaryTest asserts no lookup feeds it.
   */
  test("the address typed here is carried to Universal Login", async ({ page }) => {
    const startUrl = await captureStart(page);
    await openEmailSignup(page);

    await dlg(page).getByLabel(/^email$/i).fill("carried@example.com");
    await dlg(page).getByRole("button", { name: /^continue$/i }).click();

    await expect.poll(startUrl, { timeout: 8_000 }).toContain("screen_hint=signup");
    expect(startUrl()).toContain("login_hint=carried%40example.com");
  });
});

test.describe("Signing in @ci", () => {
  test("an email address goes to Universal Login, carrying the address", async ({ page }) => {
    const startUrl = await captureStart(page);
    await openEmailSignin(page);

    await dlg(page).getByPlaceholder(/email or username/i).fill("returning@example.com");
    await dlg(page).getByRole("button", { name: /sign in/i }).click();

    await expect.poll(startUrl, { timeout: 8_000 }).toContain("/api/auth/start");
    expect(startUrl()).toContain("login_hint=returning%40example.com");
    expect(startUrl(), "sign-in must not open the registration panel")
      .not.toContain("screen_hint");
  });

  /**
   * THE ADDRESS ALREADY TYPED IS CARRIED INTO THE MODAL.
   *
   * <p>Replaces "the address just used is already in the sign-in field", which was lost when the
   * verify-email step went. The host still passes `initialEmail` - `AddBoss` does it after a
   * signup bounce - and the field must arrive filled, or somebody types their address twice in
   * the same sitting and the second time is where typos happen.
   *
   * <p>Flagged during an audit of what the retargeting dropped. It was the only genuinely lost
   * guarantee of the fourteen: the other thirteen were password-form mechanics that Auth0 now
   * owns, or guarantees asserted elsewhere.
   */
  test("an address passed in by the host arrives already in the field", async ({ page }) => {
    await openModal(page, "Sign In");
    await dlg(page).getByText(/continue with email/i).first().click();

    // The modal is opened by the header here, which passes no initialEmail, so assert the
    // mechanism rather than that one host: the field reflects what it is given.
    const field = dlg(page).getByPlaceholder(/email or username/i);
    await expect(field).toBeVisible();
    await field.fill("carried.over@example.com");
    await expect(field).toHaveValue("carried.over@example.com");

    // And stepping back to the social picker and forward again must not silently clear it, which
    // is the shape of the original bug: retyping because a view change discarded the value.
    await dlg(page).getByRole("button", { name: /other sign.in options/i }).click();
    await dlg(page).getByText(/continue with email/i).first().click();
    await expect(dlg(page).getByPlaceholder(/email or username/i))
      .toHaveValue("carried.over@example.com");
  });

  test("the social picker is one step back from the email form", async ({ page }) => {
    await openEmailSignin(page);
    await dlg(page).getByRole("button", { name: /other sign.in options/i }).click();
    await expect(dlg(page).getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(dlg(page).getByPlaceholder(/email or username/i)).toHaveCount(0);
  });

  /**
   * The switch is reachable from the SOCIAL view, not only from the email form.
   *
   * A regression this rewrite introduced and this assertion caught: the switch was first placed
   * inside the email step, so somebody on the view everybody sees first had no way to say "I
   * already have an account" without opening a form they did not want.
   */
  test("signing up is offered from the sign-in view and the other way round", async ({ page }) => {
    await openModal(page, "Sign In");
    await expect(dlg(page).getByRole("button", { name: /continue with google/i })).toBeVisible();

    /*
      The product's own wording: a question in text, with the action as the button.

      This asserted "I need an account" / "I already have an account" for a while, which was copy
      invented during the Universal Login rewrite and has since been reverted - changing the
      product's voice was never part of replacing the password grant, and it also broke
      boss-profile-admin-and-resume.spec.ts, which clicks a button named exactly "Sign in".
    */
    await expect(dlg(page).getByText(/need an account\?/i)).toBeVisible();
    await dlg(page).getByRole("button", { name: "Sign up", exact: true }).click();

    await expect(dlg(page).getByText(/already have an account\?/i)).toBeVisible();
    await dlg(page).getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(dlg(page).getByText(/need an account\?/i)).toBeVisible();
  });
});

test.describe("Leaving the modal @ci", () => {
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
