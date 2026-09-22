import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

/**
 * Changing a review you already wrote.
 *
 * Structurally the same three steps as writing one, and a completely separate handler - which is
 * how the two drifted. Everything after the PUT was unexercised: the 409 when the edit collides
 * with another of your own reviews, the field-routed 400s, and the case that matters most, an edit
 * that comes back held.
 *
 * That last one is the whole reason this needs coverage. Editing a live review can un-publish it -
 * change the title to a famous person's and the rating goes back behind a proof challenge - and a
 * form that says "updated!" while the review has quietly vanished from the page is the worst
 * possible outcome.
 */

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };
const MINE = { ...MOCK_EXISTING_REVIEW, id: "rv-mine", disposition: "live" };

async function openEditor(page: any) {
  await mockManagerPage(page, {
    loggedIn: true, user: CONTRIBUTOR, existingUserReviews: [MINE],
  });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
    .toBeVisible({ timeout: 10_000 });

  /*
    Two clicks, not one. "Edit Your Review" opens a picker rather than the editor, because there
    can be up to five reviews of one manager and which one is being changed has to be chosen.
    The entry is named by its own role, company and dates.
  */
  await page.getByRole("button", { name: "Edit Your Review" }).click();
  await page.getByRole("button", { name: /Engineering Manager at Acme Corp/ }).click();
  /*
    The editor opens on step 1, "Update Your Review" - the role and company this review is about.
    "Update your ratings" is the heading on step 3, where the stars now live; asserting it here
    waited for a step the editor had not reached yet.
  */
  await expect(page.getByRole("heading", { name: /update your review/i }))
    .toBeVisible({ timeout: 10_000 });
}

/** Walks the editor to its last step, where the save lives. */
async function advanceToSave(page: any) {
  for (let i = 0; i < 2; i++) {
    const next = page.getByRole("button", { name: /^next$/i });
    if (await next.count()) await next.first().click();
  }
}

/** Answers the review PUT with one specific outcome. */
async function respondWith(page: any, status: number, body: unknown) {
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews/`), (r: any) => {
    if (r.request().method() !== "PUT") return r.continue();
    return r.fulfill({ status, json: body });
  });
}

test.describe("Picking which review to edit", () => {
  test("the dropdown lists the reviews there are to choose between", async ({ page }) => {
    // Up to five per manager, one per role. Which one is being edited has to be the author's
    // choice - the alternative is silently editing whichever happens to be first.
    await mockManagerPage(page, {
      loggedIn: true, user: CONTRIBUTOR,
      existingUserReviews: [MINE, { ...MINE, id: "rv-two", managerTitle: "Director" }],
    });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("button", { name: "Edit Your Review" }))
      .toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Show review options" }).click();

    await expect(page.getByText(/Your Reviews - select to edit/i)).toBeVisible();
  });

  test("somebody with no review is asked to write one instead", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, user: CONTRIBUTOR, existingUserReviews: [] });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("button", { name: /write a review/i }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Show review options" })).toHaveCount(0);
  });
});

test.describe("When the server refuses an edit", () => {
  test("colliding with another of your own reviews points at the title", async ({ page }) => {
    /*
      One review per role. Retitling this one onto a role you have already reviewed would make two
      reviews of the same job by the same person, so it is refused - and the remedy is the title,
      which is what the message names.
    */
    await openEditor(page);
    await respondWith(page, 409, { message: "already_reviewed_this_role" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/already have a review for this role/i))
      .toBeVisible({ timeout: 10_000 });
  });

  test("any other conflict still says something", async ({ page }) => {
    // The else branch. A 409 the form does not recognise must not fall through silently.
    await openEditor(page);
    await respondWith(page, 409, { message: "something_unexpected" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/failed to update review/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a date problem is reported as a date problem", async ({ page }) => {
    await openEditor(page);
    await respondWith(page, 400, { message: "The 'from' date cannot be in the future" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/cannot be in the future/i)).toBeVisible({ timeout: 10_000 });
  });

  test("any other 400 is relayed in the server's own words", async ({ page }) => {
    await openEditor(page);
    await respondWith(page, 400, { message: "That review is locked pending moderation" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/locked pending moderation/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a server fault falls back rather than closing as if it worked", async ({ page }) => {
    await openEditor(page);
    await respondWith(page, 500, {});
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/failed to update review/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("When the server accepts an edit", () => {
  test("an edit that stays live says so", async ({ page }) => {
    await openEditor(page);
    await respondWith(page, 200, { ...MINE, disposition: "live" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/updated/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("an edit that comes back held is never called live", async ({ page }) => {
    /*
      The consequential one. An edit can un-publish a review - retitle it onto a listed figure and
      it goes back behind a proof challenge. Reporting "updated!" while the review has silently
      left the page tells its author the opposite of what happened, and they would only find out
      by noticing it missing.
    */
    await openEditor(page);
    await respondWith(page, 200, { ...MINE, disposition: "held" });
    await advanceToSave(page);

    await page.getByRole("button", { name: /save|update/i }).first().click();

    await expect(page.getByText(/is live/i)).toHaveCount(0);
  });
});
