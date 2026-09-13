import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * What happens to a signed-in session between page loads.
 *
 * The session is held in two places - a cached copy in localStorage so the page can render
 * immediately, and the server, which is the one that decides. On every load the cached copy is
 * checked against the server, and what happens next depends entirely on how the check fails.
 *
 * That distinction is the whole point and none of it ran. A 401 means the session is genuinely
 * over and the cached copy is a lie that has to go. A 503 means the backend is still coming up and
 * knows nothing yet - treating that the same way would sign every user out of the product every
 * time it restarts, which is the kind of bug that looks like a mass logout incident.
 */

const signedIn = (page: any) => page.getByRole("button", { name: new RegExp(MOCK_USER.username, "i") });
const signedOut = (page: any) => page.getByRole("button", { name: "Sign In", exact: true }).first();

/** Loads the site with a cached session, and `me` answering however the test needs. */
async function load(page: any, me: (route: any) => unknown, cached: unknown = MOCK_USER) {
  if (cached) {
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), cached);
  }
  await page.route("**/api/notifications**", (r: any) => r.fulfill({ json: { data: [], unread: 0 } }));
  await page.route("**/api/auth/me", me);
  await page.goto("/");
}

test.describe("Checking a cached session on load", () => {
  test("a session the server confirms is kept", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ json: MOCK_USER }));

    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
  });

  test("the server's answer wins over the cached copy", async ({ page }) => {
    /*
      The cached copy is a rendering convenience, not a source of truth - it is whatever was true
      when the person last loaded a page. Role especially: an account promoted or demoted since
      then would otherwise keep its old abilities until localStorage happened to be rewritten.
    */
    await load(page, (r: any) => r.fulfill({ json: { ...MOCK_USER, role: "admin" } }));
    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });

    await signedIn(page).click();

    await expect(page.getByRole("link", { name: /Admin Panel/i })).toBeVisible();
  });

  test("a rejected session is cleared rather than left on screen", async ({ page }) => {
    // Signed out in the tab as well as on the server. A page that goes on showing somebody's name
    // after their session ended offers controls that now all fail.
    await load(page, (r: any) => r.fulfill({ status: 401, json: { error: "unauthorized" } }));

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
    await expect(signedIn(page)).toHaveCount(0);
  });

  test("a rejected session is cleared from storage, not just from the page", async ({ page }) => {
    // Left in localStorage it comes back on the next load, and the person is signed in again until
    // the next check fails - a session that flickers back for one frame on every page.
    await load(page, (r: any) => r.fulfill({ status: 401, json: {} }));
    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });

    const stored = await page.evaluate(() => localStorage.getItem("authUser"));

    expect(stored).toBeNull();
  });

  test("a rejected session tells the server to drop its cookie too", async ({ page }) => {
    /*
      The token lives in an HttpOnly cookie that this side cannot clear. Without asking the server
      to do it, a stale cookie stays attached to every subsequent request from this browser.
    */
    let signedOutCall = false;
    await page.route(/\/api\/auth\/signout/, (r: any) => {
      signedOutCall = true;
      return r.fulfill({ status: 200, json: {} });
    });
    await load(page, (r: any) => r.fulfill({ status: 401, json: {} }));

    await expect(async () => expect(signedOutCall).toBe(true)).toPass({ timeout: 10_000 });
  });

  test("a forbidden or missing account is also the end of the session", async ({ page }) => {
    // 403 and 404 mean the account is banned or gone. Both are as final as a 401 and neither is a
    // transport problem, so neither is worth keeping a cached session for.
    await load(page, (r: any) => r.fulfill({ status: 404, json: {} }));

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("When the server cannot answer", () => {
  /*
    The case that separates a careful implementation from one that logs everybody out during a
    deploy. A backend that is still starting answers 503 - it is not saying the session is invalid,
    it is saying it does not know yet.
  */

  test("a backend that is still starting does not end the session", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ status: 503, json: {} }));

    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
    await expect(signedOut(page)).toHaveCount(0);
  });

  test("a bad gateway does not end the session either", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ status: 502, json: {} }));

    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
  });

  test("a request that never arrives does not end the session", async ({ page }) => {
    // Somebody on a train going through a tunnel is not somebody whose session expired.
    await load(page, (r: any) => r.abort("failed"));

    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
  });

  test("the cached copy survives the failure in storage as well", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ status: 503, json: {} }));
    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });

    const stored = await page.evaluate(() => localStorage.getItem("authUser"));

    expect(stored).toContain(MOCK_USER.username);
  });
});

test.describe("A cached session that cannot be read", () => {
  test("unreadable storage is discarded rather than crashing the app", async ({ page }) => {
    /*
      Written by an older build, truncated by a full disk, edited by hand. The parse is the very
      first thing that runs, so an unhandled throw here is a blank page on every route rather than
      a degraded one - and with the bad value still in storage, a blank page that survives reloads.
    */
    await page.addInitScript(() => localStorage.setItem("authUser", "{not json"));
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.goto("/");

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
  });

  test("the unreadable value is removed so it cannot fail again", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("authUser", "{not json"));
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.goto("/");
    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });

    const stored = await page.evaluate(() => localStorage.getItem("authUser"));

    expect(stored).toBeNull();
  });

  test("no cached session at all is simply a signed-out visitor", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ status: 401, json: {} }), null);

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
  });

  test("with nothing cached the session is not even checked", async ({ page }) => {
    // The check exists to validate a cached copy. With none to validate it is a request per page
    // load, from every anonymous visitor, answered 401 every time.
    let asked = 0;
    await page.route("**/api/auth/me", (r: any) => { asked++; return r.fulfill({ status: 401, json: {} }); });
    await page.goto("/");
    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });

    expect(asked).toBe(0);
  });
});

test.describe("Signing out deliberately", () => {
  test("it clears the session here even if the server never hears about it", async ({ page }) => {
    /*
      Best-effort on the server, unconditional locally. Somebody pressing sign out on a shared
      machine has to end up signed out on that machine whatever the network did - refusing to sign
      them out because a request failed is the one outcome that is never acceptable.
    */
    await load(page, (r: any) => r.fulfill({ json: MOCK_USER }));
    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signout/, (r: any) => r.abort("failed"));

    await signedIn(page).click();
    await page.getByRole("button", { name: /Sign Out/i }).click();

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.getItem("authUser"))).toBeNull();
  });

  test("a successful sign out clears it too", async ({ page }) => {
    await load(page, (r: any) => r.fulfill({ json: MOCK_USER }));
    await expect(signedIn(page)).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signout/, (r: any) => r.fulfill({ status: 200, json: {} }));

    await signedIn(page).click();
    await page.getByRole("button", { name: /Sign Out/i }).click();

    await expect(signedOut(page)).toBeVisible({ timeout: 10_000 });
  });
});
