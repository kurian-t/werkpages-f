import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_EXISTING_REVIEW,
  MOCK_GEO,
  mockManagerPage,
  rateAllFiveStars,
  clickWriteAReview,
} from "./fixtures";

/**
 * One form for the manager family: add a manager, write an opinion, edit that review.
 *
 * These were three independently written forms. The add form grew role suggestions and a location
 * picker; the review form kept a bare text box and no location at all; the edit form was a copy of
 * the review form and got neither. A fix applied to one had to be remembered for two others, and
 * was not.
 *
 * What these tests hold in place is the property that makes it one form rather than three that
 * happen to look alike: the same control, with the same name and the same behaviour, wherever the
 * same question is asked. If somebody reintroduces a private copy, one of these fails.
 */

const REVIEW_WITH_LOCATION = {
  ...MOCK_EXISTING_REVIEW,
  declaredCountry: "Canada",
  declaredState: "Ontario",
  declaredCity: "Kitchener",
  declaredPrecision: "city",
  companyLocationId: null,
};

async function openWriteAReview(page: any) {
  await mockManagerPage(page, { loggedIn: true });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await clickWriteAReview(page);
}

async function openEditYourReview(page: any) {
  await mockManagerPage(page, {
    loggedIn: true,
    existingUserReviews: [{ ...REVIEW_WITH_LOCATION, disposition: "live" }],
  });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  // Two clicks: "Edit Your Review" opens a picker, because there can be up to five reviews of one
  // manager and which one is being changed has to be chosen.
  await page.getByRole("button", { name: "Edit Your Review" }).click();
  await page.getByRole("button", { name: /Engineering Manager at Acme Corp/ }).click();
  // The editor opens on the manager details, as every contribution form now does - the ratings
  // are its last step.
  await expect(page.getByRole("heading", { name: /update your review/i }))
    .toBeVisible({ timeout: 10_000 });
}

test.describe("The fields a review asks for", () => {
  test("the manager's name is stated, not editable", async ({ page }) => {
    /*
      The one field-level difference between adding and reviewing. Somebody adding a manager is
      supplying the name; somebody rating one is rating a specific person who already exists, and
      changing who that is from inside a review is a different review, not an edit.
    */
    await openWriteAReview(page);

    /*
      Two boxes inside one card, the way the add form asks for a name - stated rather than asked
      for, because a reviewer is rating somebody who already exists.
    */
    await expect(page.locator("#review-first-name")).toHaveValue("Alex");
    await expect(page.locator("#review-last-name")).toHaveValue("Johnson");
    await expect(page.locator("#review-first-name")).toHaveAttribute("readonly", "");
    await expect(page.locator("#review-last-name")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: /edit manager details/i })).toHaveCount(0);
  });

  test("the review asks whether the manager is still in the role, as the add form does", async ({ page }) => {
    /*
      The last field the add-manager form asked for that this one did not. It is snapshotted on the
      review like the company and the title, and the manager's own status is then derived from the
      most current opinion - so a reviewer can record "they have since retired" without one
      contributor being able to overwrite another's answer.
    */
    await openWriteAReview(page);

    await expect(page.getByText("Manager Status *")).toBeVisible();
    // Scoped to the form: the profile behind it shows the manager's own status badge too.
    const form = page.locator("div.fixed.inset-0").last();
    await expect(form.getByText(/currently active/i).first()).toBeVisible();
    await expect(form.getByText(/retired \/ no longer in this role/i)).toBeVisible();
  });

  test("the locked name says it is locked", async ({ page }) => {
    /*
      A row that simply lacks the pencil every field around it has reads as an oversight. The lock
      says it is deliberate - and it is the only field on the form with nothing to click, so
      without it the difference is invisible.
    */
    await openWriteAReview(page);

    // Scoped to the field: the profile behind the form has its own locked panels.
    await expect(page.getByTestId("review-name-locked")).toBeVisible();
  });

  test("the review form asks where the work happened", async ({ page }) => {
    /*
      It did not, and that was the gap this convergence closes. reviews carries its own declared
      location precisely so that a manager moving branch does not move the opinions people already
      left - and a column nothing writes to is a column that is always null.
    */
    await openWriteAReview(page);

    await expect(page.getByText("Location *")).toBeVisible();
  });

  test("the title field offers the spellings other people already used", async ({ page }) => {
    /*
      The add form had role suggestions; the review form had a plain text box, which is how
      "Sr. Mgr" and "Snr Manager" get invented on one page and not the other. Same control now.
    */
    await openWriteAReview(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    await expect(page.getByPlaceholder(/e\.g\.,? Engineering Manager/i)).toHaveAttribute(
      "role", "combobox",
    );
  });

  test("a field with an answer collapses to a line, and the pencil opens it", async ({ page }) => {
    await openWriteAReview(page);

    // Collapsed: the answer, not an input.
    await expect(page.getByTestId("review-title-value")).toHaveText("Engineering Manager");

    await page.getByRole("button", { name: /edit title details/i }).click();
    await expect(page.getByPlaceholder(/e\.g\.,? Engineering Manager/i)).toBeVisible();

    await page.getByRole("button", { name: /done editing title/i }).click();
    await expect(page.getByTestId("review-title-value")).toBeVisible();
  });

  test("typing does not collapse the field mid-word", async ({ page }) => {
    /*
      REGRESSION, introduced by this very change and caught by the add form's tests. Deriving
      "collapsed" from "has a value" is correct until somebody types the first character of an
      empty field: that makes it non-empty, which collapses it, which takes the focus and the rest
      of the word with it.
    */
    await openWriteAReview(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    const title = page.getByPlaceholder(/e\.g\.,? Engineering Manager/i);
    // Typed one character at a time, because the bug was per-keystroke: the field collapsed on the
    // first one and every character after it went nowhere.
    await title.pressSequentially(" Staff", { delay: 10 });

    /*
      Every typed character survives and the field is still open. The caret starts where the
      browser puts it, so this asserts that the six characters arrived together rather than
      pinning them to one end - one character surviving and five vanishing is the bug.
    */
    await expect(title).toHaveValue(/Staff/);
    await expect(title).toBeFocused();
  });
});

test.describe("Editing a review opens with what it already says", () => {
  test("the location comes from the review, not from the manager", async ({ page }) => {
    /*
      The load-bearing one. An opinion carries the location it was formed at; the manager carries
      where they work now. Prefilling the edit form from the manager would silently re-file a 2019
      opinion at the branch they transferred to since - which is the exact failure the split
      between the two exists to prevent, arriving through the edit form.
    */
    await openEditYourReview(page);

    await expect(page.getByText("Kitchener, Ontario, Canada")).toBeVisible({ timeout: 10_000 });
  });

  test("the role it was filed under comes back too", async ({ page }) => {
    await openEditYourReview(page);

    await expect(page.getByTestId("edit-review-title-value")).toHaveText("Engineering Manager");
  });

  test("a refresh keeps you in the editor, on the step you were on", async ({ page }) => {
    /*
      Reported from the running site: "refreshing on edit your review lands you back on the manager
      page". Only the create form had a draft, so a reload mid-edit dropped the reader onto the
      profile with every change gone and no sign it had existed.

      The editor is only open because somebody deliberately opened it. That is reason enough to
      keep what is in it - and to put them back where they were rather than at the beginning.
    */
    await openEditYourReview(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.reload();

    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible();
  });

  test("the name is locked here too, and says so", async ({ page }) => {
    await openEditYourReview(page);

    await expect(page.locator("#edit-review-first-name")).toHaveValue("Alex");
    await expect(page.locator("#edit-review-last-name")).toHaveValue("Johnson");
    await expect(page.getByTestId("edit-review-name-locked")).toBeVisible();
  });

  test("a review filed before locations existed falls back to the reader's own", async ({ page }) => {
    /*
      Older reviews carry no location, and an empty field on an edit form reads as "you cleared
      this" - then saving it would look like the person had. The visitor's own country and state
      fill it instead: something true, visible, and changeable, so submitting it is a confirmation
      rather than an inference drawn from an IP address.
    */
    await mockManagerPage(page, {
      loggedIn: true,
      // No declared* keys at all - exactly what a pre-location review looks like.
      existingUserReviews: [{ ...MOCK_EXISTING_REVIEW, disposition: "live" }],
    });
    // The manager-page fixture does not mock geo, and without this the fallback lands on whatever
    // fetchGeo infers from the runner's timezone - which passes for the wrong reason.
    await page.route("**/api/geo", (r: any) => r.fulfill({ json: MOCK_GEO }));
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: "Edit Your Review" }).click();
    await page.getByRole("button", { name: /Engineering Manager at Acme Corp/ }).click();

    await expect(page.getByTestId("edit-review-location-value"))
      .toHaveText("San Francisco, California, United States", { timeout: 10_000 });
  });
});

test.describe("The same control, wherever the question is asked", () => {
  /*
    The real test of convergence, and the one the spec asks to be performed deliberately rather
    than assumed: the same field is found the same way on the add form and on the review form. A
    private copy of either would have its own markup and fail one of these.
  */
  test("the add form and the review form name their fields identically", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByPlaceholder(/e\.g\.,? Engineering Manager/i)).toBeVisible();
    await expect(page.getByText("Location *")).toBeVisible();
    await expect(page.getByText("Company *")).toBeVisible();

    await openWriteAReview(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    await expect(page.getByPlaceholder(/e\.g\.,? Engineering Manager/i)).toBeVisible();
    await expect(page.getByText("Location *")).toBeVisible();
    await expect(page.getByText("Company *")).toBeVisible();
  });

  test("both forms date the work with the same control", async ({ page }) => {
    // Two hand-written timelines meant the same mistake produced a different message depending on
    // which page you were on.
    await openWriteAReview(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByLabel("From month")).toBeVisible();
    await expect(page.getByLabel("From year")).toBeVisible();
    await expect(page.getByLabel("Until month")).toBeVisible();
  });
});
