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
