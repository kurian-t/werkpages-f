import { test, expect } from "./base";
import { mockAddBossPage } from "./fixtures";

/**
 * The job-title typeahead on the add-manager form.
 *
 * This is the half of role normalization that stops the problem rather than cleaning up after it.
 * Backfilling "Snr. Mgr" into "Senior Manager" is a one-off; offering the spelling other people
 * already used means the next person picks it and there is nothing to backfill. Free text still
 * goes through, because plenty of real titles are company-specific and will never be in the list.
 *
 * None of it ran. Every path here - the debounce, the keyboard, the portalled list, the failure -
 * is a way for the control to either stop somebody typing a title or quietly stop suggesting.
 */

const SUGGEST = /\/api\/roles\/suggest/;

/** Ordered by how many people use each spelling; the count is never displayed. */
const ROLES = [
  { title: "Engineering Manager", normalized: "engineering manager", usageCount: 412 },
  { title: "Engineering Director", normalized: "engineering director", usageCount: 88 },
  { title: "Engineering Lead", normalized: "engineering lead", usageCount: 31 },
];

async function openForm(page: any, suggestions: any[] = ROLES) {
  await mockAddBossPage(page);
  await page.route(SUGGEST, (r: any) => r.fulfill({ json: suggestions }));
  await page.goto("/add");
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 });
}

const title = (page: any) => page.locator('input[name="title"]');
const options = (page: any) => page.getByRole("option");

test.describe("Offering spellings other people already used", () => {
  test("one character is not enough to ask on", async ({ page }) => {
    /*
      Two-character floor plus a debounce. A request per keystroke from the first one would mean
      most of them are for prefixes nobody would search, and the list flickering under the cursor
      while somebody is still typing the first word.
    */
    let asked = 0;
    await openForm(page);
    await page.route(SUGGEST, (r: any) => { asked++; return r.fulfill({ json: ROLES }); });

    await title(page).fill("E");

    await expect(options(page)).toHaveCount(0);
    expect(asked).toBe(0);
  });

  test("two characters bring the list, most-used first", async ({ page }) => {
    // The ordering is the information. Showing the counts as well would turn a quiet nudge into a
    // popularity contest over job titles, which is not what the field is for.
    await openForm(page);

    await title(page).fill("Engineering");

    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });
    await expect(options(page).nth(0)).toHaveText("Engineering Manager");
    await expect(options(page).nth(2)).toHaveText("Engineering Lead");
  });

  test("a suggestion identical to what was typed is not offered", async ({ page }) => {
    // Offering somebody the exact string already in the box is noise, and it makes the list look
    // broken - one row that does nothing when clicked.
    await openForm(page, [ROLES[0]]);

    await title(page).fill("engineering manager");

    await expect(options(page)).toHaveCount(0);
  });

  test("picking one fills the field and closes the list", async ({ page }) => {
    await openForm(page);
    await title(page).fill("Engineering");
    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });

    await options(page).nth(1).click();

    await expect(title(page)).toHaveValue("Engineering Director");
    await expect(options(page)).toHaveCount(0);
  });

  test("picking one does not immediately re-open the list", async ({ page }) => {
    /*
      Selecting writes to the same value the lookup watches, so without suppressing that one round
      the control answers its own change: the list reopens over the field it just filled, and the
      selection reads as having failed.
    */
    await openForm(page);
    await title(page).fill("Engineering");
    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });

    await options(page).nth(0).click();

    await expect(options(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(options(page)).toHaveCount(0);
  });

  test("a title nobody has used yet is still accepted", async ({ page }) => {
    // The whole point. A control that only accepts what is already in the list cannot record a
    // company-specific title, which is a large share of real ones.
    await openForm(page, []);

    await title(page).fill("Chief Vibes Officer");

    await expect(title(page)).toHaveValue("Chief Vibes Officer");
    await expect(options(page)).toHaveCount(0);
  });
});

test.describe("Working the list from the keyboard", () => {
  async function openList(page: any) {
    await openForm(page);
    await title(page).fill("Engineering");
    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });
  }

  test("down marks the first, then walks the list", async ({ page }) => {
    await openList(page);

    await title(page).press("ArrowDown");
    await expect(options(page).nth(0)).toHaveAttribute("aria-selected", "true");

    await title(page).press("ArrowDown");
    await expect(options(page).nth(1)).toHaveAttribute("aria-selected", "true");
  });

  test("down past the end returns to the first", async ({ page }) => {
    // Wrapping rather than stopping: a three-item list is short enough that running off the end is
    // a mis-press rather than an intent to leave the list.
    await openList(page);

    for (let i = 0; i < 4; i++) await title(page).press("ArrowDown");

    await expect(options(page).nth(0)).toHaveAttribute("aria-selected", "true");
  });

  test("up from nothing selected goes to the last", async ({ page }) => {
    // The list opens with nothing active, so the first Up is a reach for the bottom of it.
    await openList(page);

    await title(page).press("ArrowUp");

    await expect(options(page).nth(2)).toHaveAttribute("aria-selected", "true");
  });

  test("Enter takes the marked one", async ({ page }) => {
    await openList(page);

    await title(page).press("ArrowDown");
    await title(page).press("ArrowDown");
    await title(page).press("Enter");

    await expect(title(page)).toHaveValue("Engineering Director");
    await expect(options(page)).toHaveCount(0);
  });

  test("Enter with nothing marked leaves the typed title alone", async ({ page }) => {
    /*
      Enter here must not silently swap what somebody typed for the first row of a list they never
      looked at. It is also the key that submits, so guessing on it changes the record.
    */
    await openList(page);

    await title(page).press("Enter");

    await expect(title(page)).toHaveValue("Engineering");
  });

  test("Escape closes the list and keeps what was typed", async ({ page }) => {
    await openList(page);

    await title(page).press("Escape");

    await expect(options(page)).toHaveCount(0);
    await expect(title(page)).toHaveValue("Engineering");
  });

  test("the input says whether the list is open", async ({ page }) => {
    // It is a combobox, and assistive tech has no other way to know a list appeared under it.
    await openForm(page);
    await expect(title(page)).toHaveAttribute("aria-expanded", "false");

    await title(page).fill("Engineering");

    await expect(title(page)).toHaveAttribute("aria-expanded", "true", { timeout: 10_000 });
  });
});

test.describe("When the list is in the way", () => {
  test("clicking elsewhere closes it", async ({ page }) => {
    await openForm(page);
    await title(page).fill("Engineering");
    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });

    await page.locator('input[name="firstName"]').click();

    await expect(options(page)).toHaveCount(0);
  });

  test("clicking a suggestion is not treated as clicking away", async ({ page }) => {
    /*
      The list is portalled to the body, so it is not inside the control's own element. The
      outside-click handler checked only that element, closed on mousedown, and unmounted the
      button before its click could land - the dropdown looked unselectable and nobody could say
      why. Same assertion as the click test above, kept separate because this is the regression.
    */
    await openForm(page);
    await title(page).fill("Engineering");
    await expect(options(page)).toHaveCount(3, { timeout: 10_000 });

    await options(page).nth(2).click();

    await expect(title(page)).toHaveValue("Engineering Lead");
  });
});

test.describe("When suggestions are unavailable", () => {
  test("a failed lookup never blocks typing a title", async ({ page }) => {
    /*
      Suggestions are a convenience. A control that surfaces its own outage - an error under the
      field, a spinner that never resolves - makes a working form look broken over a feature the
      person did not ask for.
    */
    await mockAddBossPage(page);
    await page.route(SUGGEST, (r: any) => r.fulfill({ status: 500, json: {} }));
    await page.goto("/add");

    await title(page).fill("Engineering");

    await expect(title(page)).toHaveValue("Engineering");
    await expect(options(page)).toHaveCount(0);
    await expect(page.getByText(/error|failed/i)).toHaveCount(0);
  });

  test("a lookup that never answers is the same as no suggestions", async ({ page }) => {
    await mockAddBossPage(page);
    await page.route(SUGGEST, (r: any) => r.abort("failed"));
    await page.goto("/add");

    await title(page).fill("Engineering Manager");

    await expect(title(page)).toHaveValue("Engineering Manager");
    await expect(options(page)).toHaveCount(0);
  });
});
