import { test, expect } from "./base";
import { MOCK_MY_REVIEW, mockAccountSettingsPage } from "./fixtures";

/**
 * How somebody arrives at the account page, and how they leave it.
 *
 * Usually they click Settings. Sometimes they are sent here by a collision: they tried to rate a
 * manager they have already rated for that role, and the only useful place to put them is the
 * editor for the review they already wrote. That hand-off runs through a localStorage note, and
 * every part of it was untested - the matching, the return address, and what happens when the note
 * is unreadable or names a review that is not there.
 *
 * A hand-off that silently does nothing is the bad case: somebody is bounced to a settings page
 * they did not ask for, with no editor open and no explanation of why they are looking at it.
 */

const PREFILL = "rmm_edit_prefill";

/** The note the duplicate-conflict path leaves behind, naming the review to open. */
function note(over: Record<string, unknown> = {}) {
  return {
    managerId: MOCK_MY_REVIEW.managerId,
    managerTitle: MOCK_MY_REVIEW.managerTitle,
    managerCompany: MOCK_MY_REVIEW.managerCompany,
    ...over,
  };
}

async function arriveWith(page: any, raw: string | null, reviews = [MOCK_MY_REVIEW]) {
  await mockAccountSettingsPage(page, { reviews });
  if (raw !== null) {
    await page.addInitScript(([k, v]: [string, string]) => localStorage.setItem(k, v), [PREFILL, raw]);
  }
  await page.goto("/settings");
}

test.describe("Arriving from a duplicate-rating collision", () => {
  test("the editor for the review they already wrote is open on arrival", async ({ page }) => {
    /*
      The whole point of the redirect. Landing on the settings page with nothing open leaves
      somebody to work out for themselves that the fix is to find and edit an old review - which is
      not something the page says anywhere.
    */
    await arriveWith(page, JSON.stringify(note()));

    await expect(page.getByRole("heading", { name: "Update your ratings" })).toBeVisible({ timeout: 10_000 });
  });

  test("the note is cleared, so a later visit is an ordinary one", async ({ page }) => {
    // Left behind, the editor springs open every time they open Settings from then on.
    await arriveWith(page, JSON.stringify(note()));
    await expect(page.getByRole("heading", { name: "Update your ratings" })).toBeVisible({ timeout: 10_000 });

    expect(await page.evaluate((k) => localStorage.getItem(k), PREFILL)).toBeNull();
  });

  test("the review is matched on the role, not just the manager", async ({ page }) => {
    /*
      One person can hold several roles under one manager, each with its own review. Matching on
      the manager alone opens whichever happens to be first, and the reader edits the wrong one -
      silently, because both are titled with the same manager's name.
    */
    const otherRole = { ...MOCK_MY_REVIEW, id: "review-9", managerTitle: "Director of Engineering" };
    await arriveWith(
      page,
      JSON.stringify(note({ managerTitle: "Director of Engineering" })),
      [MOCK_MY_REVIEW, otherRole],
    );

    await expect(page.getByRole("heading", { name: "Update your ratings" })).toBeVisible({ timeout: 10_000 });
    // The editor names the role it is editing, which is the only thing distinguishing the two.
    await expect(page.getByText("Director of Engineering").first()).toBeVisible();
    await expect(page.getByText(MOCK_MY_REVIEW.managerTitle, { exact: true })).toHaveCount(0);
  });

  test("the match ignores casing and stray spaces", async ({ page }) => {
    // The title comes back from a form somebody typed into, so it will not always agree with the
    // stored one character for character. An exact comparison here fails the hand-off on a capital.
    await arriveWith(page, JSON.stringify(note({
      managerTitle: `  ${MOCK_MY_REVIEW.managerTitle.toUpperCase()}  `,
      managerCompany: MOCK_MY_REVIEW.managerCompany.toLowerCase(),
    })));

    await expect(page.getByRole("heading", { name: "Update your ratings" })).toBeVisible({ timeout: 10_000 });
  });

  test("a note naming a review that is not here leaves an ordinary page", async ({ page }) => {
    // The review may have been deleted between the collision and the redirect. Nothing to open, so
    // the page is simply itself rather than an empty editor over nothing.
    await arriveWith(page, JSON.stringify(note({ managerId: 999999 })));

    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Update your ratings" })).toHaveCount(0);
  });

  test("an unreadable note is ignored rather than breaking the page", async ({ page }) => {
    /*
      Parsed during the reviews load, so an unhandled throw here takes the list down with it - the
      reader loses every review on the page because of one bad string, and the string is still
      there on the next load.
    */
    await arriveWith(page, "{not json");

    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
  });

  test("an unreadable note is still cleared away", async ({ page }) => {
    await arriveWith(page, "{not json");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });

    expect(await page.evaluate((k) => localStorage.getItem(k), PREFILL)).toBeNull();
  });

  test("with no note the page opens normally", async ({ page }) => {
    await arriveWith(page, null);

    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Update your ratings" })).toHaveCount(0);
  });
});

test.describe("When the reviews cannot be loaded", () => {
  test("the failure is reported rather than shown as an empty account", async ({ page }) => {
    /*
      An empty list and a failed request look identical and mean opposite things. Somebody who has
      written reviews and is shown "none yet" has been told their contributions are gone.
    */
    await mockAccountSettingsPage(page, { reviews: [] });
    await page.route(/\/api\/users\/me\/reviews/, (r: any) => r.fulfill({ status: 500, json: {} }));
    await page.goto("/settings");

    // The toast renders twice - the visible card and the live region that announces it - so take
    // the one actually on screen rather than tripping over strict mode.
    await expect(
      page.getByText(/Failed to load your reviews/i).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Signing out from the account page", () => {
  test("it ends the session and leaves for the homepage", async ({ page }) => {
    // Staying would leave somebody looking at their own account page while signed out of it.
    await mockAccountSettingsPage(page);
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signout/, (r: any) => r.fulfill({ status: 200, json: {} }));

    await page.getByRole("button", { name: /Sign Out/i }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  });

  test("it says so, so the change is not silent", async ({ page }) => {
    await mockAccountSettingsPage(page);
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signout/, (r: any) => r.fulfill({ status: 200, json: {} }));

    await page.getByRole("button", { name: /Sign Out/i }).click();

    await expect(page.getByText(/Signed out successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test("it clears the half-written rating somebody left behind", async ({ page }) => {
    /*
      A draft rating is held in localStorage so it survives a sign-in. Left there through a sign
      out, the next person to use the browser is offered it - on a shared machine that is one
      person's unfinished opinion of their manager handed to somebody else.
    */
    await mockAccountSettingsPage(page);
    await page.addInitScript(() =>
      localStorage.setItem("rmm_pending_review", JSON.stringify({ ratings: { a: 5 } })));
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signout/, (r: any) => r.fulfill({ status: 200, json: {} }));

    await page.getByRole("button", { name: /Sign Out/i }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review"))).toBeNull();
  });
});
