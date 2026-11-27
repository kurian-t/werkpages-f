import { test, expect } from "./base";
import { TEST_MANAGER_ID, mockManagerPage, clickWriteAReview } from "./fixtures";

/**
 * The job-title typeahead must answer typing, not the mere act of opening a field.
 *
 * <h2>The bug</h2>
 *
 * Opening the title field on the review form popped the suggestion list open on its own. The field
 * arrives pre-filled with the manager's current role, RoleAutocomplete fetched on every change of
 * `value` including the first one it was given, and the list it got back was only filtered for an
 * EXACT match - so "Engineering Manager" still produced "Senior Engineering Manager" and the list
 * opened although nobody had typed a character.
 *
 * <h2>How it was observed</h2>
 *
 * As an intermittently failing test, which is the only reason it was found at all. The list is
 * portalled to document.body and anchored under the input, so it covers the controls beneath it -
 * including "Done editing". manager-form-convergence.spec.ts clicks exactly that, and Playwright
 * spent the full 30 seconds reporting "<button role=option>Senior Engineering Manager</button>
 * from <ul role=listbox> subtree intercepts pointer events". It passed whenever the click landed
 * before the fetch resolved and failed whenever it did not, which is why it looked like flake.
 *
 * It is a real defect either way: a reader who opens the field to correct a word gets a list over
 * the control they need, and on a phone it covers most of the form.
 *
 * <h2>What is asserted</h2>
 *
 * That opening a pre-filled field does not even ASK for suggestions - the request count, not the
 * absence of a visible list, because "no list yet" is also what a slow fetch looks like and that
 * is the ambiguity that hid this. Then that typing still works, so this cannot be "fixed" by
 * turning the typeahead off.
 */

const SUGGESTIONS = [
  { title: "Senior Engineering Manager", normalized: "senior engineering manager", usageCount: 9 },
  { title: "Engineering Manager, Platform", normalized: "engineering manager, platform", usageCount: 4 },
];

/** Opens the review form with its title field pre-filled, counting suggestion requests. */
async function openReviewForm(page: any) {
  const asked = { count: 0 };
  await page.route("**/api/roles/suggest**", (r: any) => {
    asked.count += 1;
    return r.fulfill({ json: SUGGESTIONS });
  });
  await mockManagerPage(page, { loggedIn: true });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await clickWriteAReview(page);
  return asked;
}

const titleInput = (page: any) => page.getByPlaceholder(/e\.g\.,? Engineering Manager/i);

test.describe("The title typeahead opens only when somebody types", () => {
  test("opening a pre-filled title field asks for no suggestions", async ({ page }) => {
    const asked = await openReviewForm(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    await expect(titleInput(page)).toBeVisible();

    /*
      Long enough that the 120ms debounce and the fetch would both have happened. Asserting the
      REQUEST count rather than the rendered list is deliberate: an empty list is also what a fetch
      still in flight looks like, and a test that cannot tell those apart is the one that spent
      months passing while this was broken.
    */
    await page.waitForTimeout(600);

    expect(asked.count, "opening a field is not typing in it").toBe(0);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("Done editing is clickable the moment the field opens", async ({ page }) => {
    /*
      The symptom as it was actually hit. The list is portalled and anchored below the input, so it
      sits over this control and swallows the click.
    */
    await openReviewForm(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    await expect(titleInput(page)).toBeVisible();
    await page.getByRole("button", { name: /done editing title/i }).click();

    await expect(page.getByTestId("review-title-value")).toBeVisible();
  });

  test("typing still offers suggestions", async ({ page }) => {
    // The control, and the reason this is not fixed by removing the typeahead.
    const asked = await openReviewForm(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    const input = titleInput(page);
    await input.fill("");
    await input.pressSequentially("Engineering Man", { delay: 10 });

    await expect(page.getByRole("option", { name: "Senior Engineering Manager" }))
      .toBeVisible({ timeout: 10_000 });
    expect(asked.count, "typing must still reach the endpoint").toBeGreaterThan(0);
  });

  test("choosing a suggestion fills the field and closes the list", async ({ page }) => {
    await openReviewForm(page);

    await page.getByRole("button", { name: /edit title details/i }).click();
    const input = titleInput(page);
    await input.fill("");
    await input.pressSequentially("Engineering Man", { delay: 10 });
    await page.getByRole("option", { name: "Senior Engineering Manager" }).click();

    await expect(input).toHaveValue("Senior Engineering Manager");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });
});

/**
 * A TITLE THE CATALOGUE ALREADY HOLDS IS NOT A TITLE NOBODY HAS.
 *
 * <h2>The bug</h2>
 *
 * <p>Typing a title the catalogue holds EXACTLY produced "Not listed? Add Engineering Manager" for
 * a title that is plainly listed. The endpoint returns it - {@code /api/roles/suggest?query=
 * Engineering%20Manager} answers with "Engineering Manager" first - but the control filters a
 * suggestion identical to what was typed out of the array as noise, and THEN asks that filtered
 * array whether an exact match exists. It never finds one, so the create row is always offered.
 *
 * <p>CompanyAutocomplete, which is the same control asking about an employer, does not filter its
 * list and therefore answers correctly; company-identity.spec.ts proves it with "Crumbl". Two
 * implementations of one question, which is what rule 46 exists to stop.
 *
 * <h2>How it was observed</h2>
 *
 * <p>As a firefox-only flake in contribution-loop.spec.ts, "Next is enabled without touching the
 * prefilled company". That test fills the title with "Engineering Manager" and then clicks "Edit
 * location details". The bogus one-row list is portalled under the input and anchored over the
 * controls beneath, so Playwright reported the listbox intercepting pointer events - but only when
 * the 120ms debounce and the fetch resolved BEFORE the click. It passed on every repeat in
 * isolation, which is exactly what made it look like flake rather than a defect.
 *
 * <p>The same wrong row faces a real person: they finish typing a title the site knows, and are
 * told it is unknown and offered to add it, over the control they were reaching for.
 */
test.describe("A title the catalogue already holds is not offered as new", () => {
  /** Opens the review form with the title field pre-filled, answering with a given catalogue. */
  async function openWith(page: any, catalogue: Array<Record<string, unknown>>) {
    const asked = { count: 0 };
    await page.route("**/api/roles/suggest**", (r: any) => {
      asked.count += 1;
      return r.fulfill({ json: catalogue });
    });
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await clickWriteAReview(page);
    await page.getByRole("button", { name: /edit title details/i }).click();
    const input = titleInput(page);
    await expect(input).toBeVisible();
    return { asked, input };
  }

  /*
    Types the WHOLE value in one event, the way contribution-loop.spec.ts does, rather than
    clearing the field and typing into it.

    Not a stylistic choice. This field arrives pre-filled, and the review form passes
    `reviewManagerTitle || manager.title` down to it (BossProfile), so an empty string falls back
    to the manager's own title: clearing it puts the old value straight back, and what gets typed
    next lands AFTER it. The field reads "Engineering ManagerEngineering Manager" and the query is
    a string nobody typed. That is a separate defect, reported rather than fixed here; this helper
    simply does not depend on it.
  */
  async function type(input: any, text: string) {
    await input.fill(text);
    await expect(input, "the field must hold exactly what was typed").toHaveValue(text);
  }

  /*
    A title the catalogue holds exactly, and DIFFERENT from the one the field arrives pre-filled
    with. Filling in the value it already has changes nothing, the effect keyed on `value` never
    re-runs, and no request is made at all - which looks exactly like the fix working and is not.
  */
  const EXACT = { title: "Product Manager", normalized: "product manager", usageCount: 7 };
  const OTHER = {
    title: "Senior Product Manager",
    normalized: "senior product manager",
    usageCount: 9,
  };

  test("the Add row is not offered for a title the endpoint returned exactly", async ({ page }) => {
    const { input } = await openWith(page, [EXACT, OTHER]);

    await type(input, "Product Manager");

    /*
      Waiting on the OTHER row rather than on a timeout: it proves the response has arrived and
      been rendered, so the absence of the create row below is a real absence and not a fetch
      still in flight. A bare toHaveCount(0) would pass instantly against an empty list.
    */
    await expect(page.getByRole("option", { name: "Senior Product Manager" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("option", { name: /Not listed\? Add/ })).toHaveCount(0);
  });

  test("an exact match alone opens no list, so the control beneath stays clickable", async ({ page }) => {
    /*
      THE FLAKE, made deterministic. Nothing is left to suggest once the identical title is
      filtered out, so the only thing the list could show was the create row that should not
      exist - and it sat over "Done editing title".
    */
    const { asked, input } = await openWith(page, [EXACT]);

    await type(input, "Product Manager");

    // The request happened and its answer has been applied. Asserted this way for the reason the
    // spec above gives: an empty list is also what a slow fetch looks like.
    await expect.poll(() => asked.count, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await expect(page.getByRole("listbox")).toHaveCount(0);

    await page.getByRole("button", { name: /done editing title/i }).click();
    await expect(page.getByTestId("review-title-value")).toBeVisible();
  });

  /*
    THE WHOLE JOURNEY FOR A TITLE THE SITE DOES NOT HOLD, as the product intends it: the row at the
    bottom of the list keeps what was typed, the list closes, and the field can then be finished.

    Worth having end to end because the list is portalled over the controls beneath it while it is
    open, so "take the Add row" is not a detail - it is how somebody who wants their own wording
    gets out of the list and on with the form.
  */
  test("the Add row keeps what was typed, closes the list, and Done can then be reached", async ({ page }) => {
    const { input } = await openWith(page, [
      OTHER,
      { title: "Product Manager, Platform", normalized: "product manager, platform", usageCount: 5 },
      { title: "Principal Product Manager", normalized: "principal product manager", usageCount: 3 },
      { title: "Group Product Manager", normalized: "group product manager", usageCount: 2 },
    ]);

    await type(input, "Product Man");
    await expect(page.getByRole("option", { name: "Senior Product Manager" }))
      .toBeVisible({ timeout: 10_000 });

    await page.getByRole("option", { name: /Not listed\? Add/ }).click();

    await expect(page.getByRole("listbox")).toHaveCount(0);
    // Their own wording, untouched: the point of the row is that it takes what was typed.
    await expect(input).toHaveValue("Product Man");

    await page.getByRole("button", { name: /done editing title/i }).click();
    await expect(page.getByTestId("review-title-value")).toHaveText("Product Man");
  });

  test("a title nobody holds is still offered, which is what the row is for", async ({ page }) => {
    // The guard on the fix: suppressing the row for a KNOWN title must not suppress it for an
    // unknown one, which is the affordance the row exists to provide.
    const { input } = await openWith(page, []);

    await type(input, "Quantum Flux Wrangler");

    await expect(page.getByRole("option", { name: /Not listed\? Add/ }))
      .toBeVisible({ timeout: 10_000 });
  });
});
