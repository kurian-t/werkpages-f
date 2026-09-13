import { test, expect } from "./base";
import { MOCK_USER, mockTurnstile } from "./fixtures";

/**
 * The header's mobile navigation.
 *
 * Every nav destination, the sign-in and sign-up entries, and the add-manager control exist twice
 * in the header - once for desktop and once inside this menu - and only the desktop half was ever
 * exercised. The coverage run is desktop-width, so the whole mobile nav sat behind a `md:hidden`
 * hamburger that never appeared.
 *
 * Duplicated navigation is exactly where a destination goes stale: a route renamed on the desktop
 * row and missed here is invisible on a full-size screen and broken on a phone, which is most of
 * the traffic.
 *
 * The viewport is set explicitly rather than relying on a device project, so these run and are
 * measured in the same chromium pass as everything else.
 */

const PHONE = { width: 390, height: 844 };

async function open(page: any, { loggedIn = false } = {}) {
  await mockTurnstile(page);
  await page.setViewportSize(PHONE);
  await page.route("**/api/auth/me", (r: any) =>
    loggedIn ? r.fulfill({ json: MOCK_USER }) : r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/notifications**", (r: any) => r.fulfill({ json: { data: [], unread: 0 } }));
  if (loggedIn) {
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  }
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ timeout: 10_000 });
}

/*
  The open menu, identified by something only it contains.

  There are two navigation landmarks on the page - this one and the footer's - so an index would
  work only until one of them moved. Every variant of this menu carries the Industries link, so it
  is the stable handle.
*/
const nav = (page: any) =>
  page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Industries" }) });

test.describe("Opening and closing the menu", () => {
  test("the nav is closed until the control is pressed", async ({ page }) => {
    await open(page);

    await expect(page.getByRole("link", { name: "Industries" })).toHaveCount(0);
  });

  test("the control says which way it will go", async ({ page }) => {
    /*
      The label flips with the state rather than naming the icon. A control permanently labelled
      "Menu" tells a screen reader nothing about whether pressing it opens or closes - and the icon
      swap that conveys it visually is invisible to one.
    */
    await open(page);

    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  });

  test("pressing it again closes the nav", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "Industries" })).toBeVisible();

    await page.getByRole("button", { name: "Close menu" }).click();

    await expect(page.getByRole("link", { name: "Industries" })).toHaveCount(0);
  });

  test("following a link closes the menu behind it", async ({ page }) => {
    // A full-height overlay left open over the page somebody just navigated to reads as the tap
    // having failed, and the usual response is to tap it again.
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();

    await page.getByRole("link", { name: "Industries" }).click();

    await expect(page).toHaveURL(/\/industries/);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });
});

test.describe("Where the menu can take a signed-out reader", () => {
  test("the public sections are all reachable", async ({ page }) => {
    // The point of the spec: these are second copies of the desktop links, and a renamed route
    // fixed in one row and missed here breaks only on phones.
    await open(page);

    await page.getByRole("button", { name: "Open menu" }).click();

    for (const name of ["Explore", "Industries", "Companies", "Managers"]) {
      await expect(nav(page).getByRole("link", { name })).toBeVisible();
    }
  });

  test("each one goes where it says", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(nav(page).getByRole("link", { name: "Companies" })).toHaveAttribute("href", "/companies");
    await expect(nav(page).getByRole("link", { name: "Managers" })).toHaveAttribute("href", "/directory");
    await expect(nav(page).getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/explore");
  });

  test("signing in is offered from inside the menu", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();

    await nav(page).getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  });

  test("opening the sign-in closes the menu under it", async ({ page }) => {
    // Two overlays at once on a phone screen, and the one underneath still scrollable.
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();

    await nav(page).getByRole("button", { name: "Sign Up" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("a signed-out reader is offered Home, which a signed-in one is not", async ({ page }) => {
    /*
      Signed in, the marketing homepage is not where anybody wants to go, and its slot is given to
      the things they came back for. Signed out it is the page that explains what this is.
    */
    await open(page);

    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(nav(page).getByRole("link", { name: "Home" })).toBeVisible();
  });
});

test.describe("Where the menu can take a signed-in reader", () => {
  test("the homepage link gives way to the things they came for", async ({ page }) => {
    await open(page, { loggedIn: true });

    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(nav(page).getByRole("link", { name: "Home" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Industries" })).toBeVisible();
  });

  test("adding a manager is offered here too", async ({ page }) => {
    // The primary action of the product. Present on the desktop row and easy to leave out of the
    // second copy, where most people actually are.
    await open(page, { loggedIn: true });

    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(nav(page).getByRole("link", { name: /Add Manager/i })).toHaveAttribute("href", "/add");
  });

  test("the sign-in and sign-up entries are gone", async ({ page }) => {
    await open(page, { loggedIn: true });

    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(nav(page).getByRole("button", { name: "Sign In" })).toHaveCount(0);
    await expect(nav(page).getByRole("button", { name: "Sign Up" })).toHaveCount(0);
  });

  test("a suspended account cannot add a manager from here either", async ({ page }) => {
    /*
      The server refuses it regardless. This is about not walking somebody into that refusal: the
      control goes nowhere rather than opening a form whose submit will be rejected.
    */
    await mockTurnstile(page);
    await page.setViewportSize(PHONE);
    const banned = { ...MOCK_USER, isBanned: true };
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: banned }));
    await page.route("**/api/notifications**", (r: any) => r.fulfill({ json: { data: [], unread: 0 } }));
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), banned);
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    await nav(page).getByRole("link", { name: /Add Manager/i }).click();

    /*
      Asserted by pressing it rather than by reading its href. The guard is a preventDefault on the
      click; the href is "#", which the router resolves against the current route and renders as
      "/" - so the attribute says nothing about whether the control is live.
    */
    await expect(page).not.toHaveURL(/\/add/);
  });
});
