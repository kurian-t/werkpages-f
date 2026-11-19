import { test, expect } from "./base";
import { TEST_MANAGER_ID, MOCK_MANAGER, MOCK_USER, mockManagerPage } from "./fixtures";

/**
 * Behaviour that had drifted from the Werkpages manager profile.
 *
 * The two apps share a database and are the same product under two names, so the same manager has
 * to read the same way on both. Three things had come apart, each of them silently:
 *
 *  - the career timeline sorted by a different rule, so one app could order a person's history
 *    differently from the other off identical rows;
 *  - the review form opened blank instead of pre-filled from the role being reviewed;
 *  - cancelling an edit only hid the form, leaving the abandoned changes in state.
 *
 * These pin the behaviour on this side so it cannot drift back unnoticed.
 */

/**
 * Somebody who left an employer and came back.
 *
 * This is the shape the old sort got wrong: it forced whatever matched the manager's *current
 * company name* to the end of the timeline, so the 2015 role at Acme sorted after the 2018 role
 * somewhere else. Ordered by date, the earliest Acme role comes first.
 */
const RETURNED = {
  ...MOCK_MANAGER,
  company: "Acme Corp",
  careerHistory: [
    { id: "ch-now",   title: "Director",          company: "Acme Corp",  startDate: "2021-06", endDate: null },
    { id: "ch-mid",   title: "Engineering Lead",  company: "Globex",     startDate: "2018-02", endDate: "2021-05" },
    { id: "ch-first", title: "Senior Engineer",   company: "Acme Corp",  startDate: "2015-01", endDate: "2018-01" },
  ],
};

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };

test.describe("The career timeline order", () => {
  test("reads oldest to newest, even when someone returned to a former employer", async ({ page }) => {
    /*
      The bug this replaces decided "current" by lowercasing and comparing the company *name*
      rather than reading the isCurrent flag the rows already carry. Any row whose company was
      spelled even slightly differently counted as a past job, and a returning employee had their
      earliest role thrown to the bottom.
    */
    /*
      Seeded into localStorage as well as served from /api/auth/me: the timeline sits behind the
      contribution gate and reads the session synchronously on first render, so without the seed
      the page paints locked and the career rows never mount.
    */
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), CONTRIBUTOR);
    await mockManagerPage(page, { manager: RETURNED, loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
      .toBeVisible({ timeout: 10_000 });

    /*
      Waited for, not snapshotted on arrival. The heading paints before the timeline does, so
      reading the titles straight after it caught an empty list on a slower machine - green here
      and red in CI, which is the worst way for a test to be wrong.
    */
    const rows = page.getByText(/Senior Engineer|Engineering Lead|Director/);
    await expect(rows).toHaveCount(3, { timeout: 10_000 });

    const titles = await rows.allInnerTexts();
    const order = titles
      .map((t) => t.trim())
      .filter((t) => ["Senior Engineer", "Engineering Lead", "Director"].includes(t));

    expect(order[0]).toBe("Senior Engineer");
    expect(order.indexOf("Engineering Lead")).toBeLessThan(order.indexOf("Director"));
  });
});

test.describe("Opening the review form", () => {
  test("arrives pre-filled from the role being reviewed", async ({ page }) => {
    // The page is already showing this, about a person the reader just clicked on. Asking for it
    // again is how a two-minute contribution becomes an abandoned one.
    await mockManagerPage(page, { manager: RETURNED, loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /write a review/i }).first().click();

    await expect(page.getByText("Director", { exact: false }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("offers a role selector when there is more than one role to review", async ({ page }) => {
    /*
      A review of the job someone held three years ago is a different claim to one about the job
      they hold now, so which role is being reviewed has to be the reviewer's choice rather than an
      assumption. Only offered when there is an actual choice to make.
    */
    await mockManagerPage(page, { manager: RETURNED, loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /write a review/i }).first().click();

    const selector = page.getByLabel("Which role are you reviewing?");
    await expect(selector).toBeVisible({ timeout: 10_000 });
    // Every role is on offer, each named with its dates so two spells at one employer are told apart.
    await expect(selector.locator("option")).toHaveCount(3);
  });

  test("offers no selector when there is only one role", async ({ page }) => {
    // A control with a single option is a question with one answer.
    await mockManagerPage(page, { loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /write a review/i }).first().click();

    // The form opens on step 1, "Write a Review"; the ratings are the last step.
    await expect(page.getByRole("heading", { name: /write a review/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Which role are you reviewing?")).toHaveCount(0);
  });

  test("picking an older role re-fills the dates for that role", async ({ page }) => {
    await mockManagerPage(page, { manager: RETURNED, loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await page.getByRole("button", { name: /write a review/i }).first().click();

    const selector = page.getByLabel("Which role are you reviewing?");
    await expect(selector).toBeVisible({ timeout: 10_000 });
    await selector.selectOption("2");

    // The 2015-2018 role: still-works-here must be off, because that role ended.
    await expect(page.getByText("Senior Engineer", { exact: false }).first()).toBeVisible();
  });
});

test.describe("Cancelling an edit", () => {
  test("discards the change rather than keeping it for the next time", async ({ page }) => {
    /*
      Cancel used to only hide the form. The edits stayed in state, so reopening presented changes
      the person had just decided against - one Save away from being stored by accident.
    */
    await mockManagerPage(page, { loggedIn: true, user: CONTRIBUTOR });
    /*
      The career editor reads the employments it offers, which mockManagerPage does not cover
      because nothing needed it before. Without this the editor opens on its empty state and there
      is no card to edit.
    */
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/employments`, route =>
      route.fulfill({ json: { data: [{
        id: 41, title: "Engineering Manager", company: "Acme Corp", companyId: 7,
        companyDomain: null, companyLogoUrl: null, startDate: "2019-01", endDate: null,
        periodKnown: true, employmentStatus: "ongoing", state: "accepted", isCurrent: true,
        claimCount: 0, declaredCountry: null, declaredState: null, declaredCity: null,
        declaredPrecision: null, companyLocationId: null, declaredSource: null, declaredText: null,
      }] } }));
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    /*
      Retargeted onto the career editor, which replaced the single-position form this originally
      covered. The behaviour it defends is unchanged and still worth defending: abandoning an edit
      must not leave it waiting to be submitted by accident next time.
    */
    await page.locator("button").filter({ hasText: /edit career history/i }).first().click();
    await expect(page.getByTestId("career-editor")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    const title = page.getByLabel("Title", { exact: false }).first();
    const stored = await title.inputValue();
    await title.fill("Something they thought better of");

    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.locator("button").filter({ hasText: /edit career history/i }).first().click();
    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();

    await expect(page.getByLabel("Title", { exact: false }).first()).toHaveValue(stored);
  });
});
