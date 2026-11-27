/*
  From the shared fixtures, not straight from Playwright. These pages render company logos, and
  the base fixture is what keeps a run off img.logo.dev, which is metered and whose token ships
  in the client bundle. A live spec is exactly the kind that would bill the live site's account.
*/
import { test, expect } from "./base";

/**
 * The title picker, against the REAL endpoint and the REAL catalogue.
 *
 * <h2>Why this spec is not mocked, and why that is the whole point</h2>
 *
 * The existing typeahead spec supplies its own suggestions with `page.route`, so it passed
 * happily for as long as the picker was broken: typing a title nobody had used produced no
 * dropdown at all, because the list opened only when it had something to suggest and the
 * "Not listed? Add ..." row lives inside that list. A mocked list always has something in it.
 *
 * Every assertion here therefore goes through the running backend to the `job_titles` catalogue
 * that V116 installs. That is also the only way to prove the catalogue is reachable at all: a
 * migration that loads 405 rows nobody ever queries looks identical to one that loads none.
 *
 * <h2>Why it is LOCAL ONLY</h2>
 *
 * It needs a backend and a migrated database, so it must never run in CI. Keeping it out is not
 * left to a missing `@ci` tag, because the manually dispatched full-suite workflow runs
 * everything the tag leaves out. Instead its project is DEFINED ONLY when TITLE_PICKER_LIVE=1,
 * following the same reasoning the signin-live project records: Playwright runs every project a
 * config declares, so `testIgnore` elsewhere is not enough and the project itself has to not
 * exist. No workflow sets that variable.
 *
 * <h2>Running it</h2>
 *
 * Start the backend and the dev server, then:  pnpm test:titles
 */

const FIELD = 'input[role="combobox"][name="title"]';
const LIST = "#role-suggestions";
const OPTION = `${LIST} [role="option"]`;

/** Opens the add-manager form and returns its title field. */
async function titleField(page: any) {
  await page.goto("/add");
  const field = page.locator(FIELD);
  await expect(field).toBeVisible({ timeout: 15_000 });
  return field;
}

/** Types into the field and waits for the picker to settle. */
async function type(page: any, text: string) {
  const field = page.locator(FIELD);
  await field.click();
  await field.fill("");
  await page.waitForTimeout(250);
  await field.type(text, { delay: 60 });
  // Longer than the debounce plus a round trip, so "not open yet" cannot be mistaken for
  // "never opens" - that ambiguity is what hid the original defect.
  await page.waitForTimeout(1_200);
}

test.describe("The title picker, live", () => {
  /*
    THE REPORTED BUG. Typing a title nobody holds showed nothing: no list, no Add row, no
    feedback, so the field looked like it wanted something off a list it was not showing.
  */
  test("a title nobody has used still opens the list and offers to add it", async ({ page }) => {
    await titleField(page);
    await type(page, "Quantum Flux Wrangler");

    await expect(page.locator(LIST)).toBeVisible();
    await expect(page.locator(OPTION)).toHaveCount(1);
    await expect(page.locator(OPTION)).toContainText("Not listed? Add");
    await expect(page.locator(OPTION)).toContainText("Quantum Flux Wrangler",
      { useInnerText: true });
  });

  /*
    The reason the catalogue exists. No manager in this database is a nurse, and a directory that
    only suggests what it already holds can never bootstrap a sector: the first nurse would get an
    empty list and the second would inherit whatever spelling the first invented.
  */
  test("the catalogue answers for a sector with no managers in it", async ({ page }) => {
    await titleField(page);
    await type(page, "head nur");

    await expect(page.locator(OPTION).filter({ hasText: "Head Nurse" })).toHaveCount(1);
  });

  /*
    REPORTED: typing "Managett" offered only "Not listed? Add Managett", so the one route to
    "Manager" was noticing your own mistake. A picker that cannot answer a misspelling is how a
    one-off typo becomes a permanent entry in the vocabulary.
  */
  test("a misspelled title still offers the real one", async ({ page }) => {
    await titleField(page);
    await type(page, "Managett");

    await expect(page.locator(OPTION).filter({ hasText: /^Manager$/ })).toHaveCount(1);
  });

  /*
    THE LONG FORM, AND ONLY THE LONG FORM.

    This asserted "CEO (Chief Executive Officer)" until 2026-11-26, when it was reported that a
    list answering "vp" read as five rows beginning VP, SVP, AVP, AVP, EVP. Moving the acronym
    into brackets was not enough and was reported again: long form only is the ask, and it matches
    the 2026-11-25 decision that the extended form is what the product uses and what it stores.

    The acronym is still MATCHED on, which is what the next line proves: three letters find a row
    that never displays them.
  */
  test("typing an acronym finds the row, and the row shows the words", async ({ page }) => {
    await titleField(page);
    await type(page, "ceo");

    await expect(page.locator(OPTION).filter({ hasText: /^Chief Executive Officer$/ }))
      .toHaveCount(1);
    // Not "CEO (...)", not "... (CEO)". The acronym is a search key, never a label.
    await expect(page.locator(OPTION).filter({ hasText: /CEO/ })).toHaveCount(0);
  });

  /*
    V49's normalizer resolves "avp" to "assistant vice president", silently merging Assistant and
    Associate Vice President, which are different jobs. The picker does not guess: it asks. If
    this ever finds one row, something has started choosing on the contributor's behalf again.
  */
  test("an ambiguous acronym offers every reading rather than picking one", async ({ page }) => {
    await titleField(page);
    await type(page, "avp");

    await expect(page.locator(OPTION).filter({ hasText: "Assistant Vice President" }))
      .toHaveCount(1);
    await expect(page.locator(OPTION).filter({ hasText: "Associate Vice President" }))
      .toHaveCount(1);
  });

  /*
    What gets STORED is the extended form, which is also what the row now reads. The label would
    normalize to the long form twice over, because the normalizer expands the acronym as well,
    which would key one job as a different job.
  */
  test("choosing a row stores the extended title, not the label it was shown as", async ({ page }) => {
    const field = await titleField(page);
    await type(page, "ceo");

    await page.locator(OPTION).filter({ hasText: /^Chief Executive Officer$/ }).click();

    await expect(field).toHaveValue("Chief Executive Officer");
    await expect(page.locator(LIST)).toHaveCount(0);
  });

  test("the Add row can be reached with the keyboard, not the mouse only", async ({ page }) => {
    const field = await titleField(page);
    await type(page, "Quantum Flux Wrangler");

    await field.press("ArrowDown");
    await field.press("Enter");

    await expect(page.locator(LIST)).toHaveCount(0);
    await expect(field).toHaveValue("Quantum Flux Wrangler");
  });

  /*
    The other half of the behaviour, re-proved against the real endpoint. The list used to pop
    open on its own for a field that merely HAD a value, and because it is portalled under the
    input it covered the controls beneath, "Done editing" among them. Suggestions follow a
    keystroke, never a mount and never a focus.

    Returning focus to a field that already holds a value is the reachable form of that on this
    page: a reload resets the form rather than pre-filling it, so it proves nothing.
  */
  test("returning to a filled field asks for nothing", async ({ page }) => {
    const field = await titleField(page);
    await type(page, "ceo");
    await page.locator(OPTION).filter({ hasText: /^Chief Executive Officer$/ }).click();
    await expect(field).toHaveValue("Chief Executive Officer");

    // Away, then back, without typing.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    await field.click();
    await page.waitForTimeout(1_200);

    await expect(page.locator(LIST)).toHaveCount(0);
  });
});

/**
 * Every surface that asks for a job title asks with the SAME control.
 *
 * <p>REPORTED: "On the /search no drop down is there for the title". The add form had the picker
 * and the search form did not, so the one field people meet first was free text with no list at
 * all. The company box beside it suggested as you typed, which is what made the gap obvious.
 *
 * <p>Manager search is one workflow reached from three places (manager-search-flow.md, rule 13):
 * `/search`, `/directory` and a company profile. The markup may differ between them. The question
 * they ask may not. These tests exist so that a fourth surface, or a fourth copy of the field,
 * cannot quietly answer differently.
 */
test.describe("Every surface that asks for a title asks with the same control", () => {
  const SEARCH_TITLE = 'input[role="combobox"][aria-label="Job title"]';
  const COMPANY_LIST = 'ul[role="listbox"]:not(#role-suggestions)';

  async function typeInto(page: any, selector: string, text: string) {
    const field = page.locator(selector);
    await expect(field).toBeVisible({ timeout: 15_000 });
    await field.click();
    await field.fill("");
    await page.waitForTimeout(250);
    await field.type(text, { delay: 60 });
    // Debounce plus a round trip. "Not open yet" must not be readable as "never opens".
    await page.waitForTimeout(1_200);
    return field;
  }

  /*
    Hovers a row and returns what the browser actually painted behind it, once it has stopped
    changing.

    Both lists mark a row with `transition-colors`, so a single read catches the animation rather
    than the result. Reading immediately gave "rgba(0, 0, 0, 0)" for both, which would have let
    this test pass on two unhighlighted rows; reading once the colour was merely non-transparent
    gave the same colour at two different points in its fade, 0.97 alpha against 0.92, and failed
    a comparison that was in fact correct. So it waits for two identical reads.
  */
  async function hoveredColour(page: any, row: any): Promise<string> {
    await row.hover();
    const read = () => row.evaluate((el: Element) => getComputedStyle(el).backgroundColor);
    const settled = (c: string) => c !== "rgba(0, 0, 0, 0)" && c !== "transparent";
    let previous = await read();
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(100);
      const colour = await read();
      if (settled(colour) && colour === previous) return colour;
      previous = colour;
    }
    return previous;
  }

  test("/search offers the list, which is the reported bug", async ({ page }) => {
    await page.goto("/search");
    await typeInto(page, SEARCH_TITLE, "head nur");

    await expect(page.locator(LIST)).toBeVisible();
    await expect(page.locator(OPTION).filter({ hasText: "Head Nurse" })).toHaveCount(1);
  });

  test("/search offers to add a title nobody holds, as the add form does", async ({ page }) => {
    await page.goto("/search");
    await typeInto(page, SEARCH_TITLE, "Quantum Flux Wrangler");

    await expect(page.locator(OPTION).filter({ hasText: "Not listed? Add" })).toHaveCount(1);
  });

  test("/directory asks the same question with the same list", async ({ page }) => {
    await page.goto("/directory");
    await typeInto(page, SEARCH_TITLE, "head nur");

    await expect(page.locator(OPTION).filter({ hasText: "Head Nurse" })).toHaveCount(1);
  });

  /*
    REPORTED: "The highlighting on the company drop down is also different than the title one /
    Should be the same as the company one on hover."

    The title rows were marked with Tailwind's `bg-muted`, a grey, while the company rows use the
    brand lavender, so two dropdowns on one form highlighted differently.

    Read out of the DOM rather than off the class names: a class in a className string proves
    nothing about what the browser painted, and the colour here is applied as an inline style
    precisely so it cannot depend on Tailwind having generated a rule from some other file.
  */
  test("the title list marks a hovered row exactly as the company list does", async ({ page }) => {
    await page.goto("/search");

    await typeInto(page, SEARCH_TITLE, "head nur");
    const titleColour = await hoveredColour(
      page, page.locator(OPTION).filter({ hasText: "Head Nurse" }).first());

    await typeInto(page, 'input[placeholder="company"]', "goog");
    const companyRow = page.locator(`${COMPANY_LIST} [role="option"]`).first();
    await expect(companyRow).toBeVisible();
    const companyColour = await hoveredColour(page, companyRow);

    expect(titleColour).toBe(companyColour);
    // And not transparent, or the assertion above passes on two unhighlighted rows.
    expect(titleColour).not.toBe("rgba(0, 0, 0, 0)");
  });
});
