/* ROUTINE CI: critical path: a logged-out contributor finishes the form after signing in. Tagged @ci. */
import { test, expect } from "./base";
import { scopedDraftKey, ANON_SCOPE, MANAGER_DRAFT_KEY } from "../client/lib/draftScope";
import { mockAddBossPage, rateAllFiveStars, attestFirstHandExperience, MOCK_USER, pickLocation } from "./fixtures";

/**
 * THE CRITICAL PATH THIS PRODUCT IS BUILT AROUND, AND IT HAD NO TEST.
 *
 * Somebody with no account fills the whole form, is asked to sign in at submit, signs in, comes
 * back, presses Submit, and NOTHING HAPPENS. Reported from production on 2026-11-15.
 *
 * The cause is a disabled button. `nextDisabled` on the ratings step is
 * `unratedCount > 0 || !attested || isSubmitting`, and `attested` - the "I personally worked with
 * this manager" confirmation - was never written into the draft by `buildDraftPayload`. So the
 * round trip restored the name, the company, the dates, the ratings and the selection, reset the
 * one remaining answer to false, and left an inert grey button with nothing on screen explaining
 * it. Not an error, not a message: a control that does not respond.
 *
 * This is the FOURTH time an answer held outside the draft has been lost on the one page load
 * that matters. The capture token, the autosave writeId and the identity selection were all the
 * same shape, and each is recorded in a comment in AddBoss.tsx. The pattern is now tested rather
 * than commented.
 *
 * These drive the real form rather than seeding a draft by hand, deliberately. A hand-built draft
 * asserts whatever shape the test author believed in, which is exactly the thing that was wrong;
 * letting the form write its own draft is what makes the test able to catch a missing field.
 */
test.describe("AddBoss - finishing the form after signing in @ci", () => {
  async function fillEverythingAsAnonymous(page: any) {
    await page.locator('input[name="firstName"]').fill("Jordan");
    await page.locator('input[name="lastName"]').fill("Smith");
    await page.locator('input[name="title"]').fill("Engineering Manager");
    await page.locator('input[name="company"]').fill("Acme Corp");
    await page.keyboard.press("Escape");
    await pickLocation(page);

    // Wait for the step to validate before pressing on. Clicking a disabled control is a no-op
    // that reads as "the form did not advance", which is the very failure under test.
    await expect(page.getByTestId("form-next")).toBeEnabled();
    await page.getByTestId("form-next").click();

    /*
      The identification step, which exists only when VITE_ROLE_AWARE_SUBMISSION is baked into
      the build. It is handled rather than assumed either way, because the defect under test is
      in `nextDisabled` and `buildDraftPayload`, which both journeys share: a test pinned to one
      of them would pass on a build of the other while the bug was still there.
    */
    const addAsNew = page.getByRole("button", { name: /add them as a new manager/i });
    // Wait for whichever step this build shows next. A bare isVisible() races the render and
    // silently skipped the identify step, leaving the form sitting on it with Next disabled.
    await Promise.race([
      addAsNew.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      page.getByLabel("From month").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
    ]);
    if (await addAsNew.isVisible().catch(() => false)) {
      await addAsNew.click();
      await expect(page.getByTestId("form-next")).toBeEnabled();
      await page.getByTestId("form-next").click();
    }

    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /current/i }).check();
    await expect(page.getByTestId("form-next")).toBeEnabled();
    await page.getByTestId("form-next").click();

    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
  }

  test("the submit button is live when they come back, not an inert grey rectangle", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");

    await fillEverythingAsAnonymous(page);

    // Anonymous, so this is "Continue to Sign In" and the form writes its draft before leaving.
    await expect(page.getByTestId("form-next")).toBeEnabled();
    await page.getByTestId("form-next").click();

    // The draft the real form just wrote, under the anonymous scope.
    const draft = await page.evaluate(
      (k) => localStorage.getItem(k),
      scopedDraftKey(MANAGER_DRAFT_KEY, ANON_SCOPE),
    );
    expect(draft, "the form must keep the answers when it sends somebody to sign in").toBeTruthy();
    expect(
      JSON.parse(draft!).attested,
      "the confirmation is an answer like any other, and the submit button is disabled without "
      + "it - so a draft that omits it comes back unsubmittable",
    ).toBe(true);
  });

  test("coming back signed in leaves the form ready to submit", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await fillEverythingAsAnonymous(page);
    await page.getByTestId("form-next").click();

    const draft = await page.evaluate(
      (k) => localStorage.getItem(k),
      scopedDraftKey(MANAGER_DRAFT_KEY, ANON_SCOPE),
    );

    // The return leg: a real account, and the tab-scoped marker the auth redirect leaves so the
    // form knows this load is the continuation of its own submission rather than a later visit.
    await mockAddBossPage(page, { loggedIn: true });
    await page.addInitScript(
      ({ key, value, user }) => {
        localStorage.setItem(key, value);
        localStorage.setItem("authUser", JSON.stringify(user));
        sessionStorage.setItem("rmm_auth_handoff_at", String(Date.now()));
      },
      { key: scopedDraftKey(MANAGER_DRAFT_KEY, ANON_SCOPE), value: draft!, user: MOCK_USER },
    );
    await page.goto("/add");

    const submit = page.getByTestId("form-next");
    await expect(submit).toHaveText(/submit review/i, { timeout: 10_000 });
    await expect(
      submit,
      "they filled in everything and signed in; the one control on the page must respond",
    ).toBeEnabled();
  });
});
