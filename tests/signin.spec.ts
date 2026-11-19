import { test, expect } from "./base";
import type { Page, Request } from "@playwright/test";

/**
 * EVERY WAY IN, AND WHAT THE BROWSER ACTUALLY ASKS FOR @ci
 *
 * <p>This is the client half of sign-in: pressing each control must send the browser to
 * `/api/auth/start` carrying the right connection, the right return destination, and - for
 * registration - the signup hint. It runs anywhere, because it mocks the endpoint rather than
 * needing a backend.
 *
 * <p><b>Why this exists.</b> The whole suite mocked `/api/auth/me` and nothing else about
 * authentication, so a backend that was completely dead produced 4,640 passing specs and a sign-in
 * page where every button returned HTTP 500. Not one test asked the first question a visitor asks.
 *
 * <p>The other half - whether the backend answers that request with a correct redirect to Auth0 -
 * cannot be mocked without testing the mock, so it lives in signin-live.spec.ts against a running
 * backend.
 *
 * <p><b>What a failure here means.</b> The client is building the wrong request: a missing
 * connection sends somebody to a generic Auth0 page instead of Google, and a lost `returnTo`
 * strands them on the home page after signing in rather than back at the form they abandoned.
 */

/** Captures the sign-in request without letting the page leave. */
async function captureAuthStart(page: Page): Promise<() => Request | undefined> {
  let seen: Request | undefined;
  await page.route("**/api/auth/start*", async route => {
    seen = route.request();
    /*
      Fulfilled rather than aborted. An aborted navigation leaves the page in a half-torn-down
      state and Playwright reports the abort instead of the assertion, which buries the reason a
      test failed under a network error.
    */
    await route.fulfill({ status: 204, body: "" });
  });
  return () => seen;
}

function paramsOf(request: Request | undefined): URLSearchParams {
  expect(request, "no request to /api/auth/start was made - the button did nothing").toBeTruthy();
  return new URL(request!.url()).searchParams;
}

test.describe("Signing in", () => {
  /*
    The three social providers, by the labels a person actually reads. Driven through the page
    rather than by calling startSocialLogin directly: a button wired to the wrong connection is
    the defect worth catching, and a unit test on the helper cannot see it.
  */
  const SOCIAL = [
    { label: "Continue with Google",    connection: "google-oauth2" },
    { label: "Continue with Microsoft", connection: "windowslive" },
    { label: "Continue with Facebook",  connection: "facebook" },
  ];

  for (const { label, connection } of SOCIAL) {
    test(`${label} asks for the ${connection} connection @ci`, async ({ page }) => {
      const seen = await captureAuthStart(page);
      await page.goto("/signin");

      await page.getByRole("button", { name: label }).click();

      const params = paramsOf(seen());
      expect(params.get("connection")).toBe(connection);
      // Where they came from, so signing in does not cost them their place.
      expect(params.get("returnTo")).toBeTruthy();
    });
  }

  test("email and password uses the database connection, not a social one @ci", async ({ page }) => {
    const seen = await captureAuthStart(page);
    await page.goto("/signin");

    /*
      The password path deliberately goes through the SAME authorization-code flow as the social
      buttons rather than posting a password to our own backend: RFC 9700 section 2.4 forbids the
      password grant, which would put the password through our hands and cannot carry PKCE.
      Asserting the connection here is what keeps that true from the client's side.
    */
    // The form asks for an email OR a username, and submits with "Continue".
    await page.locator("#identifier").fill("someone@example.invalid");
    await page.getByRole("button", { name: /^continue$/i }).click();

    const params = paramsOf(seen());
    expect(params.get("connection")).toBe("Username-Password-Authentication");
    expect(params.get("screen_hint"), "signing in must not ask for the signup screen").toBeNull();
  });

  test("creating an account asks for the signup screen @ci", async ({ page }) => {
    const seen = await captureAuthStart(page);
    await page.goto("/signup");

    await page.getByRole("button", { name: /sign up with email/i }).click();

    const params = paramsOf(seen());
    expect(params.get("connection")).toBe("Username-Password-Authentication");
    // Without this Auth0 shows the sign-in form to somebody who pressed "Sign up".
    expect(params.get("screen_hint")).toBe("signup");
  });

  test("a form that sent somebody to sign in names itself as the return destination @ci", async ({ page }) => {
    const seen = await captureAuthStart(page);
    await page.goto("/signin?returnTo=%2Fsearch");

    await page.getByRole("button", { name: "Continue with Google" }).click();

    // Carried through rather than defaulted. Dropping it is how somebody who was halfway through
    // a contribution comes back to the home page instead of to their draft.
    expect(paramsOf(seen()).get("returnTo")).toBe("/search");
  });
});
