import { test, expect } from "./base";
import { mockAddBossPage, rateAllFiveStars, attestFirstHandExperience, MOCK_USER } from "./fixtures";

// Helper: fill Step 1 (manager info) using name attributes since inputs have no htmlFor.
// Country is omitted - the geo mock pre-fills "United States", so the chip view shows.
async function fillStep1(page: any) {
  await page.locator('input[name="firstName"]').fill("Jordan");
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
}

// Helper: fill Step 2 (work timeline)
async function fillStep2(page: any) {
  await page.getByLabel("From month").selectOption("01");
  await page.getByLabel("From year").selectOption("2022");
  await page.getByRole("checkbox", { name: /^current$/i }).check();
}

test.describe("AddBoss - 3-step flow", () => {
  test("page loads at step 1 showing manager info fields", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await expect(
      page.getByText(/step 1 of 3/i)
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
  });

  /*
    "step 1: country pre-fills from inferred geo" was here.

    There is no country select any more: the separate country/province/city controls were replaced
    by the one free-form LocationField that the manager, workplace and interview forms all share.
    manager-location.spec.ts covers the replacement, including "the prefilled location is shown in
    full, and can be changed" for the geo guess this test was asserting, and "no separate country,
    province or city controls are rendered" for the controls that went.
  */

  test("step 1: Next is disabled until required fields are filled", async ({
    page,
  }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled({ timeout: 5_000 });

    await fillStep1(page);

    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled({ timeout: 3_000 });
  });

  test("step 1: no manager tenure fields are shown", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    // Manager tenure was removed - must not exist anywhere on step 1
    await expect(page.getByText(/manager.*tenure/i)).not.toBeVisible({ timeout: 5_000 });
  });


  test("advancing from step 1 shows step 2 (work timeline)", async ({
    page,
  }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel("From month")).toBeVisible();
  });

  test("step 2: Next is disabled until dates are selected", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 5_000 });

    // Next stays disabled while the work dates are empty, so the user cannot
    // advance and hit date errors on the final step.
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled({ timeout: 3_000 });

    await fillStep2(page);

    // After filling dates, Next is enabled and advances to step 3
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled({ timeout: 3_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("advancing from step 2 shows step 3 (ratings)", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 5_000 });

    // Star rating inputs should be present
    await expect(page.getByRole("button", { name: /rate 5 stars/i }).first()).toBeVisible();
  });

  // The attestation is a required first-hand-experience confirmation on step 3. It also gates the
  // silent auto-save that fires once all 10 categories are rated, so an unattested review is never
  // persisted.
  test("step 3: Submit stays disabled until the first-hand attestation is checked", async ({
    page,
  }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await rateAllFiveStars(page);

    const attestation = page.locator('input[name="attestation"]');
    await expect(attestation).toBeVisible({ timeout: 5_000 });
    await expect(attestation).not.toBeChecked();
    await expect(
      page.getByText(/i confirm that i have personally worked with or for this manager/i)
    ).toBeVisible();

    // All 10 ratings filled but not attested - Submit must stay disabled.
    await expect(page.getByRole("button", { name: /submit review/i })).toBeDisabled({ timeout: 3_000 });

    await attestation.check();
    await expect(page.getByRole("button", { name: /submit review/i })).toBeEnabled({ timeout: 3_000 });

    // Unchecking re-locks it.
    await attestation.uncheck();
    await expect(page.getByRole("button", { name: /submit review/i })).toBeDisabled({ timeout: 3_000 });
  });

  test("step 3: 'About your review' trust card is visible", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/about your review/i)).toBeVisible({ timeout: 5_000 });
  });

  test("step 3: Submit triggers auth modal when logged out", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);

    // When logged out, button says "Continue to Sign In"
    await page.getByRole("button", { name: /continue to sign in/i }).click();

    // Auth modal opens
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("step 3: logged-in user can submit and sees success toast", async ({
    page,
  }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);

    // When logged in, button says "Submit Review"
    await page.getByRole("button", { name: /submit review/i }).click();

    await expect(
      page.getByText(/jordan smith submitted for review/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("REGRESSION: add + rate lifts the ratings lock without a reload", async ({
    page,
  }) => {
    /*
     * The behaviour is unchanged: contribute, and the site-wide lock lifts immediately rather
     * than on the next full page load.
     *
     * What changed is who decides. This used to assert that AddBoss flipped hasContributed in the
     * browser on the assumption that a submitted rating always counts. That assumption broke when
     * ratings could be held pending verification - a held rating unlocked the whole site anyway,
     * because the client had already made up its mind. The page now re-reads the account, so the
     * mock has to answer like a server: not contributed before the write, contributed after.
     */
    let contributed = false;
    await mockAddBossPage(page, { loggedIn: true, user: { ...MOCK_USER, hasContributed: false } });
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ json: { ...MOCK_USER, hasContributed: contributed } }));
    await page.route("**/api/managers", async (route) => {
      if (route.request().method() === "POST") {
        contributed = true;
        await route.fulfill({ json: { id: 999, name: "Jordan Smith" } });
      } else {
        await route.fallback();
      }
    });
    await page.goto("/add");

    await expect.poll(async () =>
      await page.evaluate(() => JSON.parse(localStorage.getItem("authUser") || "{}").hasContributed)
    ).toBe(false);

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit review/i }).click();

    await expect.poll(async () =>
      await page.evaluate(() => JSON.parse(localStorage.getItem("authUser") || "{}").hasContributed),
      { timeout: 5_000 }
    ).toBe(true);
  });

  test("ready banner appears when logged-in user returns to /add with a saved draft", async ({
    page,
  }) => {
    // Simulate the OAuth-return scenario: draft was saved, user now logs in via OAuth,
    // gets redirected back to /add. The draft restore effect detects user + draft → shows banner.
    const draft = {
      savedAt: Date.now(),
      step: "ratings",
      formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "Canada", linkedinUrl: "", status: "active" },
      ratings: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`cat${i}`, 5])),
      workedFrom: { month: "01", year: "2022" },
      workedUntil: { month: "", year: "" },
      currentlyWorking: true,
      authorType: "username",
      generatedName: "anonymous-test",
    };

    await mockAddBossPage(page, { loggedIn: true });
    await page.addInitScript((d) => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify(d));
    }, draft);

    await page.goto("/add");

    await expect(
      page.getByText(/you're signed in/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Back button from step 2 returns to step 1", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("Back button from step 3 returns to step 2", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("draft restores form data when navigating back to /add", async ({
    page,
  }) => {
    await mockAddBossPage(page, { loggedIn: false });

    // Seed a draft in localStorage as if the user partially filled the form and left
    const draft = {
      savedAt: Date.now(),
      step: "info",
      formData: {
        firstName: "Drafted",
        lastName: "Manager",
        title: "CTO",
        company: "Draft Corp",
        country: "Canada",
        linkedinUrl: "",
        status: "active",
      },
      ratings: {},
      workedFrom: { month: "", year: "" },
      workedUntil: { month: "", year: "" },
      currentlyWorking: false,
      authorType: "username",
      generatedName: "anon-user",
    };

    await page.addInitScript((d: any) => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify(d));
    }, draft);

    await page.goto("/add");

    /*
      The whole draft is restored, company included.

      This asserted the opposite for a while - that arriving at /add with no ?company= was a fresh
      start and the employer should not come back. That is no longer the rule. Anything the form
      asked for belongs in the draft: a draft that keeps only some of the answers is worse than
      one that keeps none, because the gaps are not obvious and somebody re-types a field they
      already filled in without noticing the rest survived.

      See the save side in AddBoss.tsx, which writes company and location into the draft for the
      same reason.
    */
    /*
      The name is a collapsible field, so a restored draft arrives as a card reading "Drafted
      Manager" rather than as two open inputs. Open it to read the values back out - the card
      alone would not prove which half went where.
    */
    await expect(page.getByText("Drafted Manager").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /edit name details/i }).click();

    await expect(
      page.locator('input[name="firstName"]')
    ).toHaveValue("Drafted", { timeout: 5_000 });
    await expect(
      page.locator('input[name="lastName"]')
    ).toHaveValue("Manager");
    // The company is a CompanyField card rather than a bare input, so read it as text.
    await expect(page.getByTestId("company-field")).toContainText("Draft Corp");
  });

  test("cancel button closes the form", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    // The form overlay should be open
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    // After cancel, navigated away from /add
    await expect(page).not.toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("cancel with returnTo param navigates back to company profile", async ({ page }) => {
    await mockAddBossPage(page);
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/companies/by-name**", (route) =>
      route.fulfill({ json: { name: "Acme Corp", logoUrl: null, managerCount: 0, totalReviews: 0, avgRating: null, categoryAverages: {}, managers: [] } })
    );
    await page.route("**/api/companies/suggest**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/add?returnTo=/companies/Acme%20Corp");

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page).toHaveURL(/\/companies\/Acme/, { timeout: 5_000 });
  });

  test("X button with returnTo param navigates back to company profile", async ({ page }) => {
    await mockAddBossPage(page);
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/companies/by-name**", (route) =>
      route.fulfill({ json: { name: "Acme Corp", logoUrl: null, managerCount: 0, totalReviews: 0, avgRating: null, categoryAverages: {}, managers: [] } })
    );
    await page.route("**/api/companies/suggest**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/add?returnTo=/companies/Acme%20Corp");

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    // X close button is the first button in the header row
    await page.getByRole("button", { name: /^close$/i }).click();

    await expect(page).toHaveURL(/\/companies\/Acme/, { timeout: 5_000 });
  });
});

/**
 * The company field's two presentations, and staying in one of them.
 *
 * A settled company shows as a card - logo, name, "Edit details" - matching how a company is shown
 * on every other form. Editing swaps the picker in place, and "Done editing" puts the card back.
 *
 * What settles a value is picking a suggestion or arriving with one already filled in. Typing does
 * not: the field must stay a plain input under the cursor while somebody is still using it.
 */
test.describe("Editing the company on the add-manager form", () => {
  /*
    Scoped: other fields on this step are cards with their own edit controls too.

    The controls are named for their field now - "Edit company details", not "Edit details" - so a
    screen-reader user, and a locator, can tell which of several open cards they are on. The
    visible text on the button is unchanged; it is the accessible name that carries the field.
  */
  const field = (page: any) => page.getByTestId("company-field");

  /**
   * Types a few characters and takes whatever the picker offers, which is what settles the value.
   *
   * Returns the chosen name rather than assuming one: the suggestions come from the fixture, and a
   * test that hard-codes a company silently stops exercising the pick if that list ever changes.
   */
  async function pickCompany(page: any): Promise<string> {
    /*
      Waits for the lookup itself, not for the dropdown to happen to appear.

      The options only exist once /api/companies/suggest has answered, and that is a 300ms debounce
      plus a round trip - on a loaded CI machine sharing one preview server between workers, long
      enough that a bare "is the option visible yet" was the whole test. Waiting on the response
      ties the assertion to the thing it actually depends on, and when it does fail it says whether
      the request was never made or came back with nothing.
    */
    const suggested = page.waitForResponse(
      (r: any) => /\/api\/companies\/suggest/.test(r.url()),
      { timeout: 15_000 },
    );
    const companyInput = page.getByLabel(/Company/i).first();
    await companyInput.click();
    await companyInput.pressSequentially("Acme", { delay: 30 });
    await suggested;
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    const chosen = (await option.innerText()).split("\n")[0].trim();
    await option.click();
    await expect(field(page).getByRole("button", { name: /edit company details/i }))
      .toBeVisible({ timeout: 10_000 });
    return chosen;
  }

  test("typing does not turn the field into a card mid-word", async ({ page }) => {
    /*
      The second keystroke used to push the value past the length threshold, re-render the field as
      a card, and - because no edit was in progress - show the card's *summary*. The input being
      typed into vanished and took the caret with it, which read as a company being auto-selected.
    */
    await mockAddBossPage(page);
    await page.goto("/add");

    const input = page.getByLabel(/Company/i).first();
    await input.fill("Ac");

    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Ac");
    await expect(field(page).getByRole("button", { name: /edit company details/i })).toHaveCount(0);
  });

  test("picking a company settles it into a card with its logo", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    const chosen = await pickCompany(page);

    await expect(field(page).getByText(chosen, { exact: false })).toBeVisible();
  });

  test("backspacing to one character does not throw you out of editing", async ({ page }) => {
    /*
      The card rendered only above a length threshold, so deleting down to a single character
      unmounted it mid-edit: the control changed shape under the cursor and "Done editing"
      vanished. Clearing a field to retype it is the most ordinary thing somebody does here.
    */
    await mockAddBossPage(page);
    await page.goto("/add");
    await pickCompany(page);
    await field(page).getByRole("button", { name: /edit company details/i }).click();

    await page.getByLabel(/Company/i).first().fill("A");

    await expect(field(page).getByRole("button", { name: /done editing company/i })).toBeVisible();
    await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
  });

  test("clearing the field entirely still leaves you editing", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await pickCompany(page);
    await field(page).getByRole("button", { name: /edit company details/i }).click();

    await page.getByLabel(/Company/i).first().fill("");

    await expect(field(page).getByRole("button", { name: /done editing company/i })).toBeVisible();
  });

  test("Done editing returns to the card", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await pickCompany(page);
    await field(page).getByRole("button", { name: /edit company details/i }).click();

    await field(page).getByRole("button", { name: /done editing company/i }).click();

    await expect(field(page).getByRole("button", { name: /edit company details/i })).toBeVisible();
    await expect(field(page).getByRole("button", { name: /done editing company/i })).toHaveCount(0);
  });
});
