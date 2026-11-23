import { test, expect } from "./base";
import { TEST_MANAGER_ID, MOCK_MANAGER, MOCK_USER, mockManagerPage } from "./fixtures";
import { Page } from "./base";

/**
 * THE CAREER HISTORY EDITOR, from the contributor's side.
 *
 * <p>What this replaced could express exactly one position, titled "the manager's current
 * position". To end a role and record its successor somebody had to submit, leave the page and come
 * back. These tests walk the journey that was impossible: correct one position, end it, add
 * another, review the lot and send it as one contribution.
 *
 * <p>The submitted body is asserted, not just the clicks. A form that looks right and sends the
 * wrong shape is the failure mode that matters here: a correction that named an employment by
 * company name instead of by id would rewrite the wrong one, and no amount of UI assertion would
 * notice.
 */

const EMPLOYMENTS = [
  {
    id: 41,
    title: "Depot Supervisor",
    company: "Halverson Logistics",
    companyId: 7,
    companyDomain: null,
    companyLogoUrl: null,
    startDate: "2019-01",
    endDate: null,
    periodKnown: true,
    employmentStatus: "ongoing",
    state: "accepted",
    isCurrent: true,
    claimCount: 3,
    declaredCountry: "Canada",
    declaredState: "Alberta",
    declaredCity: "Sherwood Park",
    declaredPrecision: "city",
    companyLocationId: null,
    declaredSource: "corpus",
    declaredText: null,
  },
  {
    id: 28,
    title: "Night Lead",
    company: "Halverson Logistics",
    companyId: 7,
    companyDomain: null,
    companyLogoUrl: null,
    startDate: "2015-03",
    endDate: "2018-12",
    periodKnown: true,
    employmentStatus: "ended",
    state: "accepted",
    isCurrent: false,
    claimCount: 0,
    // A manually typed location, which must read back exactly as written rather than being
    // re-ordered into city/state/country as though we had normalised it.
    declaredCountry: null,
    declaredState: null,
    declaredCity: null,
    declaredPrecision: null,
    companyLocationId: null,
    declaredSource: "manual",
    declaredText: "the depot off Baseline Road",
  },
  {
    // Nobody recorded this employment's dates; they come from the ratings, and the server says so.
    id: 12,
    title: "Shift Lead",
    company: "Halverson Logistics",
    companyId: 7,
    companyDomain: null,
    companyLogoUrl: null,
    startDate: "2012-05",
    endDate: "2014-02",
    startDateInferred: true,
    endDateInferred: true,
    periodKnown: false,
    employmentStatus: "unknown",
    state: "accepted",
    isCurrent: false,
    claimCount: 0,
    declaredCountry: null,
    declaredState: null,
    declaredCity: null,
    declaredPrecision: null,
    companyLocationId: null,
    declaredSource: null,
    declaredText: null,
  },
];

async function setup(
  page: Page,
  opts: {
    signedIn?: boolean;
    contributor?: boolean;
    admin?: boolean;
    /** Render the manager as an unpublished submission, which only its submitter is served. */
    pending?: boolean;
  } = {}
) {
  const submitted: Record<string, unknown>[] = [];
  const signedIn = opts.signedIn !== false;
  // Editing is gated on having rated a manager, so a spec needs to be able to be somebody who
  // has not. Defaulting to true keeps every existing test in this file saying what it said.
  const contributor = opts.contributor !== false;

  const user = opts.admin ? { ...MOCK_USER, role: "admin" } : MOCK_USER;

  // The whole profile page, through the shared helper every other profile spec uses, so this spec
  // does not carry its own idea of which endpoints a manager page needs.
  await mockManagerPage(page, {
    loggedIn: signedIn,
    user,
    /*
      THE LEVER IS THIS OPTION, NOT user.hasContributed.

      mockManagerPage answers /api/auth/me with `{ ...user, hasContributed }`, so the option is
      spread LAST and silently overrides whatever the user object carries - and it defaults to
      true. Setting it on the user object alone is how the admin exemption test first passed while
      proving nothing: the account the test described as having rated nobody was being reported to
      the page as a contributor.
    */
    hasContributed: contributor,
    ...(opts.pending
      ? { manager: { ...MOCK_MANAGER, approvalStatus: "pending_approval" } }
      : {}),
  });

  await page.route(`**/api/managers/${TEST_MANAGER_ID}/employments`, route =>
    route.fulfill({ json: { data: EMPLOYMENTS } }));

  // The location question is a typeahead, and a location is now required on any position this
  // submission proposes, so these specs have to be able to answer it.
  await page.route("**/api/company-locations/suggest**", route =>
    route.fulfill({ json: [
      { kind: "corpus", label: "Toronto, Ontario, Canada", precision: "city",
        country: "Canada", state: "Ontario", city: "Toronto" },
    ] }));

  await page.route(`**/api/managers/${TEST_MANAGER_ID}/career-edit`, route => {
    submitted.push(route.request().postDataJSON());
    route.fulfill({ status: 201, json: {
      id: "11111111-1111-1111-1111-111111111111",
      managerId: TEST_MANAGER_ID, newName: null, explanation: "x",
      positions: 1, changeFormat: "career_editor", status: "pending",
      createdAt: new Date().toISOString(),
    } });
  });

  return submitted;
}

/**
 * Answers the location question on one position, the way a person does.
 *
 * <p>Needed wherever a spec proposes a position that has no location of its own: adding one, or
 * correcting a role recorded before V109 gave employments their own location. The field is a
 * typeahead, so this types and then picks, rather than setting a value nothing validated.
 */
async function chooseLocation(page: Page, index: number) {
  const editor = page.getByTestId(`position-editor-${index}`);
  const openLocation = editor.getByRole("button", { name: /edit location details/i });
  if (await openLocation.count()) await openLocation.click();
  await editor.getByPlaceholder("City, province, or the workplace itself").fill("Toronto");
  await page.getByText("Toronto, Ontario, Canada").first().click();
}

async function openEditor(page: Page) {
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await page.getByRole("button", { name: /edit career history/i }).click();
  await expect(page.getByTestId("career-editor")).toBeVisible();
}

test.describe("Career history editor", () => {
  test("lists every position separately, current ones first", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    await expect(page.getByText("Current position", { exact: true })).toBeVisible();
    await expect(page.getByText("Previous positions")).toBeVisible();
    // Two spells at ONE employer, each its own card. The old form could address only one of them,
    // and the client picked which by matching the company name.
    await expect(page.getByTestId("position-card-0")).toContainText("Depot Supervisor");
    await expect(page.getByTestId("position-card-1")).toContainText("Night Lead");
  });

  /*
    THE GATE ON EDITING, AND WHY THIS FORM IS NOT SECTION 44's CASE.

    These two tests REPLACED "renders the whole form for a logged-out visitor", which asserted the
    opposite, so the reason is worth stating rather than leaving somebody to find it in a diff.

    Section 44 says a contribution form is never hidden behind sign-in: nobody signs up for a form
    they have not seen, and a wall captures nothing because a form that never rendered has no work
    to keep. That reasoning is about somebody's OWN first-hand account.

    This form is different in kind. It proposes a change to somebody ELSE's record - their title,
    their employer, their dates, whether they still hold the role - so there is no account of their
    own to lose by asking first, and nothing to capture. What there is instead is an account that
    costs one social sign-in and, until this, could rewrite any employment on the site having
    contributed nothing. Reading these numbers was already gated on a rating while writing them was
    not, which was the wrong way round.

    The rating, manager, workplace and interview forms are untouched: section 44 still governs
    every form that collects what the person themselves saw.
  */
  test("a logged-out visitor cannot open the editor, and is told what would open it", async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    /*
      Located by the button's STABLE name and asserted on its title, not located by the reason.
      The reason deliberately lives in `title` rather than in the accessible name, because naming
      this button "Rate a manager ..." collided with the locked Performance Breakdown's own "Rate
      a manager" call to action elsewhere on the page.
    */
    const edit = page.getByRole("button", { name: /edit career history/i });
    await expect(edit).toBeDisabled();
    // Saying what would open it, because a disabled control with no reason reads as broken.
    await expect(edit).toHaveAttribute("title", /sign in and rate a manager/i);
    await expect(page.getByTestId("career-editor")).toHaveCount(0);
  });

  test("somebody signed in who has never rated a manager cannot open the editor", async ({ page }) => {
    await setup(page, { contributor: false });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    const edit = page.getByRole("button", { name: /edit career history/i });
    await expect(edit).toBeDisabled();
    /*
      NOT "sign in": they ARE signed in. Telling somebody to do the thing they have already done
      is the failure this separate case exists to catch, so the assertion is on the exact wording
      and not merely on the button being disabled.
    */
    await expect(edit).toHaveAttribute("title", "Rate a manager to correct a career history");
    await expect(page.getByTestId("career-editor")).toHaveCount(0);
  });

  /*
    THE TWO EXEMPTIONS, which exist so the gate is not a dead end. Both are proved against the
    real database in CareerEditorIntegrationTest; these say the BUTTON agrees with the server,
    because a control that is disabled while the submission behind it would have succeeded is just
    as wrong as one that is enabled while it would fail.
  */
  test("an admin who has rated nobody can still open the editor", async ({ page }) => {
    await setup(page, { contributor: false, admin: true });
    await openEditor(page);

    await expect(page.getByTestId("position-card-0")).toBeVisible();
  });

  test("the submitter of an unpublished profile can open it without having rated", async ({ page }) => {
    await setup(page, { contributor: false, pending: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    /*
      Clicked by VISIBLE TEXT, not by accessible name. On a pending manager the label reads "Edit
      your submission" - the profile is the person's own unpublished draft and saying so is worth
      keeping - so openEditor's /edit career history/i would not resolve.

      Why this case is not rare: the rating left when somebody ADDS a manager is held until the
      manager is approved, and the gate counts only live ratings. So the person who just submitted
      this profile reads as having contributed nothing, and this is the only form that can correct
      it.
    */
    await page.locator("button").filter({ hasText: /edit career history/i }).first().click();
    await expect(page.getByTestId("career-editor")).toBeVisible();
  });

  test("a position opens on Edit and collapses on Done editing", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await expect(page.getByTestId("position-editor-0")).toBeVisible();

    await page.getByRole("button", { name: "Done editing this position" }).click();
    await expect(page.getByTestId("position-card-0")).toBeVisible();
  });

  test("Submit is unavailable until something actually changes", async ({ page }) => {
    await setup(page);
    await openEditor(page);
    // Opening a card changes nothing, and neither does closing it again.
    await expect(page.getByTestId("submit-changes")).toBeDisabled();
  });

  test("an added position is removable, an existing one is not", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    // An accepted employment has ratings and claims attached; removing it is a moderation
    // decision, not a form control. Saying the role ended is what the form offers instead.
    await expect(page.getByTestId("position-card-0")
      .getByRole("button", { name: /^Remove/ })).toHaveCount(0);

    await page.getByTestId("add-position").click();
    await expect(page.getByTestId("position-editor-3")).toBeVisible();

    /*
      Removable WHILE STILL OPEN, which is the case that matters. Done editing is disabled until
      the position is valid, so if Remove existed only on the collapsed card then an addition
      somebody started and thought better of would be wedged open with no way out.
    */
    await expect(page.getByRole("button", { name: "Done editing new position" })).toBeDisabled();
    await page.getByRole("button", { name: "Remove this new position" }).click();
    await expect(page.getByTestId("position-editor-3")).toHaveCount(0);
    await expect(page.getByTestId("position-card-3")).toHaveCount(0);
  });

  /*
    THE DISTINCTION, ON SCREEN.

    Changing a position's employer replaces it rather than editing it, because ratings are
    attributed through the employer. Somebody about to do that is told so, with how many people's
    ratings would move, before they commit.
  */
  test("changing the employer warns that the position is replaced, not edited", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    // CompanyField owns its own collapse, so this opens it the way every other form does.
    await page.getByTestId("position-editor-0")
      .getByRole("button", { name: "Edit company details" }).click();
    await page.getByTestId("position-editor-0")
      .getByPlaceholder(/acme corp/i).fill("Marlowe Freight");

    const notice = page.getByTestId("supersede-notice-0");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/replaces this position/i);
    await expect(notice).toContainText("3 people's ratings");
  });

  /*
   * REMOVED 2026-11-18: "Submit needs an explanation".
   *
   * It asserted that Submit stays disabled until the "How do you know?" box is answered. That
   * question was removed from the form on request, and with it the service refusal and the
   * database CHECK (V111 drops manager_edits_career_editor_explains).
   *
   * Its replacement is "the form does not ask how you know, and submits without it", which
   * asserts the field is absent AND that Submit is enabled on a single change with nothing else
   * supplied. Recorded rather than deleted silently, because the thing it protected - that a
   * contribution could not be recorded without a reason - was a real rule and is now gone on
   * purpose, not by accident.
   */

  /**
   * THE JOURNEY THE OLD FORM COULD NOT DO: end a role and add its successor in one session, and
   * send it as ONE contribution.
   */
  test("ends one role and adds another in a single submission", async ({ page }) => {
    const submitted = await setup(page);
    await openEditor(page);

    // End the current role.
    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByTestId("position-editor-0")
      .getByRole("radio", { name: /no longer in this role/i }).check();
    await page.getByRole("button", { name: "Done editing this position" }).click();

    // Add its successor.
    await page.getByTestId("add-position").click();
    const added = page.getByTestId("position-editor-3");
    // A brand-new position renders its fields open, because hiding an empty required field behind
    // a pencil is how a form ends up with a step nobody can complete.
    await added.locator("#position-title-3").fill("Night Operations Lead");
    // A brand-new position has no company yet, so the shared field renders open.
    await added.getByPlaceholder(/acme corp/i).fill("Halverson Logistics");
    // Mandatory on anything this submission proposes, the same as adding or rating a manager.
    await chooseLocation(page, 3);
    await page.getByRole("button", { name: "Done editing new position" }).click();

    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    const body = submitted[0] as { positions: Record<string, unknown>[] };

    expect(body.positions).toHaveLength(2);
    // The correction names the employment by ID, which is the only identifier that can tell two
    // spells at one employer apart.
    const correction = body.positions.find(p => p.intent === "correct")!;
    expect(correction.roleId).toBe(41);
    expect(correction.employmentStatus).toBe("ended");
    // The addition names no employment, and never ends another one.
    const addition = body.positions.find(p => p.intent === "add")!;
    expect(addition.roleId).toBeNull();
    expect(addition.title).toBe("Night Operations Lead");
  });

  test("a name correction alone is a submission in its own right", async ({ page }) => {
    const submitted = await setup(page);
    await openEditor(page);

    // The name arrives filled, so the field is collapsed behind its pencil like any answered one.
    await page.getByRole("button", { name: "Edit manager's name details" }).click();
    await page.locator("#manager-name").fill("Alexandra Johnson");

    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    const body = submitted[0] as { name: string; positions: unknown[] };
    expect(body.name).toBe("Alexandra Johnson");
    // No employment was touched, and that must not stop the submission: it is routed by the
    // declared format, not by whether the change set has rows.
    expect(body.positions).toHaveLength(0);
  });

  /*
   * REMOVED: "a logged-out submission keeps the draft across the sign-in it triggers".
   *
   * It drove the editor as a logged-out visitor, submitted, and asserted the draft survived into
   * sessionStorage so a social sign-in's full-page redirect could not cost somebody their answers.
   * The gate above makes that journey unreachable: a logged-out visitor cannot open this form at
   * all now, so there is no logged-out submission to keep a draft for, and the test timed out
   * waiting for a button that is deliberately disabled.
   *
   * It is recorded rather than quietly deleted because the CODE it covered still exists in
   * CareerEditor.tsx. That code is now unreachable from the UI through the logged-out door, and it
   * is kept deliberately: the 401 path below needs exactly the same keeping, and CareerEditor
   * takes `signedIn` as a prop, so a future caller that renders it without a gate inherits the
   * safe behaviour rather than losing somebody's answers.
   *
   * Draft keeping is covered on both halves instead. "a successful submission does not leave the
   * draft behind" proves the clearing, and "an expired session" below proves the keeping, on the
   * journey that is still reachable.
   */
  /**
   * "NOT LISTED? ADD <NAME>" KEEPS THE NAME AND SENDS NO COMPANY ID.
   *
   * <p>This is the contributor half of the bug an administrator reported on 2026-11-18: they typed
   * an employer the picker did not know, took its "Not listed? Add ..." entry, submitted, and the
   * moderation screen then refused to approve it because the employment named a company with no
   * record.
   *
   * <p>The picker itself was never broken, and this test pins down why, so nobody "fixes" the
   * wrong end of it. `chooseCreate` deliberately keeps the typed name and clears the company id,
   * because a company is NOT created from unreviewed contributor input - that is what the daily
   * company creation cap exists to enforce. Its own comment says "The write path creates."
   *
   * <p>So the submission legitimately carries `company` with `companyId: null`, and the fix went
   * where the promise was broken: approval now creates the company. If this spec ever starts
   * seeing an id here, the backend's `resolveProposedCompanies` has silently stopped being
   * exercised by the real client.
   */
  test("adding a company the picker does not know sends its name and no id", async ({ page }) => {
    const submitted = await setup(page);
    // The picker knows nothing, which is what puts the "Not listed?" row on screen.
    await page.route("**/api/companies/suggest**", route => route.fulfill({ json: [] }));
    await openEditor(page);

    await page.getByTestId("add-position").click();
    const added = page.getByTestId("position-editor-3");
    await added.locator("#position-title-3").fill("Conseiller");
    await added.getByPlaceholder(/acme corp/i).fill("ville.levis.qc.ca");

    await page.getByText(/not listed\? add/i).click();
    // The name survives the click. It used to be the only thing that did.
    await expect(added.getByPlaceholder(/acme corp/i)).toHaveValue("ville.levis.qc.ca");

    await chooseLocation(page, 3);
    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    const body = submitted[0] as { positions: { company: string; companyId: number | null }[] };
    const added3 = body.positions.find(p => p.company === "ville.levis.qc.ca");
    expect(added3, "the typed employer must reach the server").toBeTruthy();
    expect(added3!.companyId, "no company is created at submit time, by design").toBeNull();
  });

  /**
   * THE FORM DOES NOT ASK "HOW DO YOU KNOW?" ANY MORE.
   *
   * <p>It was a required textarea that disabled Submit until it was filled in, and it was removed
   * on request on 2026-11-18. The removal spanned three layers: this form, the service's refusal,
   * and `manager_edits_career_editor_explains`, the CHECK V109 installed, dropped by V111.
   *
   * <p>Asserted rather than left to the absence of the old fills, because a spec that merely stops
   * typing into a field proves nothing about whether the field is still on screen demanding an
   * answer. Submit being enabled with a single change and nothing else is the other half.
   */
  test("the form does not ask how you know, and submits without it", async ({ page }) => {
    const submitted = await setup(page);
    await openEditor(page);

    await expect(page.getByLabel(/how do you know/i)).toHaveCount(0);
    await expect(page.getByText(/one explanation covers/i)).toHaveCount(0);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    await page.getByLabel("Title", { exact: false }).first().fill("Senior Depot Supervisor");
    await page.getByRole("button", { name: "Done editing this position" }).click();

    await expect(page.getByTestId("submit-changes")).toBeEnabled();
    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    // And nothing invents one on the way out, which would be a sentence the person never wrote
    // sitting in a moderator's queue under their name.
    expect(submitted[0]).not.toHaveProperty("explanation");
  });

  test("a successful submission does not leave the draft behind", async ({ page }) => {
    const submitted = await setup(page);
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    await page.getByLabel("Title", { exact: false }).first().fill("Senior Depot Supervisor");
    await page.getByRole("button", { name: "Done editing this position" }).click();
    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    // A kept draft would reopen the form prefilled with changes already accepted.
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem("career-editor-draft:playwright-test-manager"))).toBeNull();
  });

  /**
   * A SESSION THAT EXPIRES MID-EDIT MUST NOT COST SOMEBODY THEIR WORK.
   *
   * <p>The gate means everybody who reaches this form is signed in, so the `!signedIn` branch is
   * unreachable from the UI. This journey is not. An access token that expires while somebody
   * fills the form - and this is a long form, several positions and an explanation - makes the
   * submit answer 401, and the page then sends them to authenticate, which for a social sign-in
   * is a full-page redirect that destroys this component and everything in its state.
   *
   * <p>It was a real loss: the 401 branch handed over to authentication WITHOUT writing the
   * draft, while the logged-out branch three lines above it did. So the person came back to the
   * form they had just filled in, empty, with nothing on screen saying why.
   *
   * <p>Both halves are asserted - that the answers were kept, and that reopening brings them back
   * - because keeping a draft nothing restores is not a recovery.
   */
  test("an expired session does not cost somebody the changes they just typed", async ({ page }) => {
    await setup(page);
    /*
      The token expired after the page loaded, which is what makes this different from the gate:
      the form renders, the profile still answers, and only the write is refused. Registered after
      setup's own handler so this one wins.
    */
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/career-edit`, route =>
      route.fulfill({ status: 401, json: { error: "unauthorized" } }));
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    await page.getByLabel("Title", { exact: false }).first().fill("Senior Depot Supervisor");
    await page.getByRole("button", { name: "Done editing this position" }).click();
    await page.getByTestId("submit-changes").click();

    // Written BEFORE handing over to authentication. An effect scheduled for the render that
    // follows would never run, because the handler navigates away in the same tick.
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem("career-editor-draft:playwright-test-manager")))
      .toContain("Senior Depot Supervisor");

    /*
      The recovery as the person experiences it. A reload stands in for the sign-in redirect:
      sessionStorage survives it, and reopening the editor shows what they typed rather than what
      the server still says the title is.
    */
    await page.reload();
    await page.getByRole("button", { name: /edit career history/i }).click();
    await expect(page.getByTestId("career-editor")).toBeVisible();
    await expect(page.getByTestId("position-card-0")).toContainText("Senior Depot Supervisor");
  });

  /**
   * AN EXISTING ROLE'S LOCATION IS ALREADY IN THE FIELD.
   *
   * <p>Not a cosmetic point: a location that renders blank invites somebody to retype it, and a
   * retyped location is a new assertion. Worse, if they leave the blank field alone and submit
   * something else, a form that treated empty as "clear it" would erase a location nobody
   * questioned. It has to arrive filled in.
   */
  test("an existing role's location is pre-populated, collapsed, without retyping", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    // On the collapsed card first, so it is visible before anybody opens anything.
    await expect(page.getByTestId("position-card-0")).toContainText("Sherwood Park");

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    const editor = page.getByTestId("position-editor-0");
    await expect(editor).toContainText("Sherwood Park");
    await expect(editor).toContainText("Alberta");

    // And it counts as unchanged: opening a card must not propose a location edit.
    await expect(page.getByTestId("submit-changes")).toBeDisabled();
  });

  test("a manually typed location reads back exactly as it was written", async ({ page }) => {
    await setup(page);
    await openEditor(page);
    // Re-casing or re-ordering a manual answer would present it as something we had normalised,
    // which is the one claim a manual entry may not make.
    await expect(page.getByTestId("position-card-1"))
      .toContainText("the depot off Baseline Road");
  });

  /**
   * A FAILED SUBMISSION SAYS SO AND KEEPS THE WORK.
   *
   * <p>Carried over from edit-manager-outcomes.spec.ts, which covered the form this replaced. A
   * form that closes on failure has destroyed the answer and told nobody; the error belongs on
   * screen with the fields still filled in.
   */
  test("a failed submission is reported and the form stays open", async ({ page }) => {
    await setup(page);
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/career-edit`, route =>
      route.fulfill({ status: 500, json: { error: "Something went wrong on our side." } }));
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    await page.getByLabel("Title", { exact: false }).first().fill("Senior Depot Supervisor");
    await page.getByRole("button", { name: "Done editing this position" }).click();
    await page.getByTestId("submit-changes").click();

    await expect(page.getByTestId("submit-error")).toBeVisible();
    // Still open, still holding what they wrote, so Submit can simply be pressed again.
    await expect(page.getByTestId("career-editor")).toBeVisible();
    await expect(page.getByTestId("position-card-0")).toContainText("Senior Depot Supervisor");
  });

  /**
   * THE DATES ARRIVE FILLED IN, AND SAY WHICH IS WHICH.
   *
   * <p>Two points, and the second is why this test exists at all. MonthYear takes a `label` and
   * spends it on the aria-label of its two selects, so on screen these were two identical
   * Month/Year pairs stacked up with nothing distinguishing them. Putting a start date in the end
   * field is then an easy mistake, and the validator rejects it for a reason that looks arbitrary.
   *
   * <p>And an existing period has to come back as it is recorded. A blank date field invites
   * retyping, and a retyped date is a new assertion about somebody's employment.
   */
  test("an existing role's dates are pre-populated and the fields say which is which", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    // The previous role in the fixture ran 2015-03 to 2018-12.
    await page.getByTestId("position-card-1").getByRole("button", { name: /^Edit/ }).click();
    const editor = page.getByTestId("position-editor-1");

    await expect(editor.getByLabel("From month")).toHaveValue("03");
    await expect(editor.getByLabel("From year")).toHaveValue("2015");
    await expect(editor.getByLabel("To month")).toHaveValue("12");
    await expect(editor.getByLabel("To year")).toHaveValue("2018");

    // Visible, not only announced: the labels are what stop the two rows being confused.
    await expect(editor.getByText("From", { exact: true })).toBeVisible();
    await expect(editor.getByText("To", { exact: true })).toBeVisible();

    // And none of that counts as a change, so opening a card proposes nothing.
    await expect(page.getByTestId("submit-changes")).toBeDisabled();
  });

  test("a role still held shows no end date", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    // The first fixture role is ongoing and started 2019-01.
    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    const editor = page.getByTestId("position-editor-0");

    await expect(editor.getByLabel("From month")).toHaveValue("01");
    await expect(editor.getByLabel("From year")).toHaveValue("2019");
    /*
      No "To" row at all. The status control directly above it already says the role is
      ongoing, so a sentence repeating that was removed as redundant rather than helpful:
      the absence of the row is the same answer stated once instead of twice.
    */
    await expect(editor.getByLabel("To month")).toHaveCount(0);
  });

  /**
   * AN ESTIMATED DATE SAYS IT IS ESTIMATED.
   *
   * <p>Dates nobody recorded are worked out from the ratings - each one asks when that person
   * worked with the manager - so the span is a bound, not a fact. An unlabelled guess sitting in a
   * date field is indistinguishable from something somebody stated, which is how an estimate
   * becomes a record by accident.
   */
  test("dates taken from ratings are shown as estimated, and are still correctable", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    // Visible before anything is opened, so it is not a surprise found mid-edit.
    await expect(page.getByTestId("position-card-2")).toContainText("dates estimated");

    await page.getByTestId("position-card-2").getByRole("button", { name: /^Edit/ }).click();
    const editor = page.getByTestId("position-editor-2");

    // Filled in, which is the point: an empty field invites retyping what we already know.
    await expect(editor.getByLabel("From month")).toHaveValue("05");
    await expect(editor.getByLabel("From year")).toHaveValue("2012");
    await expect(editor.getByTestId("dates-inferred-note")).toContainText(/estimated from ratings/i);
    await expect(editor.getByTestId("dates-inferred-note")).toContainText(/correct them if you know better/i);

    // And showing an estimate is not proposing it. Nothing is written from an inference alone.
    await expect(page.getByTestId("submit-changes")).toBeDisabled();

    /*
      Correcting it IS a change, and that is how an estimate becomes a record.

      This fixture predates V109 and so has no location of its own, which the location rule now
      asks for: correcting a position means saying where it was. Both rules apply at once, which
      is exactly why they are exercised together here.
    */
    await editor.getByLabel("From year").selectOption("2013");
    await chooseLocation(page, 2);
    await expect(page.getByTestId("submit-changes")).toBeEnabled();
  });

  test("a recorded date is never labelled as estimated", async ({ page }) => {
    await setup(page);
    await openEditor(page);
    // The first two fixtures carry real dates, so the hint must not appear on them.
    await expect(page.getByTestId("position-card-0")).not.toContainText("dates estimated");
    await expect(page.getByTestId("position-card-1")).not.toContainText("dates estimated");
  });
  /**
   * A LOCATION IS MANDATORY ON ANYTHING THIS SUBMISSION PROPOSES.
   *
   * <p>Adding a position with no location was accepted and the Submit button enabled, which is
   * wrong: every other way of adding or rating a manager demands a location, and this form may
   * not be the one exception.
   *
   * <p>Reported on the form rather than by the server. A submission refused after the fact for a
   * field nobody was asked for is the worst version of this.
   */
  test("a position cannot be submitted without a location", async ({ page }) => {
    await setup(page);
    await openEditor(page);

    await page.getByTestId("add-position").click();
    const added = page.getByTestId("position-editor-3");
    await added.locator("#position-title-3").fill("Night Operations Lead");
    await added.getByPlaceholder(/acme corp/i).fill("Halverson Logistics");
    // Everything else answered, so the location is the only thing missing and therefore the only
    // possible reason the button is still disabled.

    await expect(added.getByTestId("position-problem-3")).toContainText(/location is needed/i);
    await expect(page.getByTestId("submit-changes")).toBeDisabled();

    await chooseLocation(page, 3);
    await expect(page.getByTestId("submit-changes")).toBeEnabled();
  });

  /**
   * AND IT IS ONLY ASKED OF POSITIONS SOMEBODY IS ACTUALLY CHANGING.
   *
   * <p>V109 gave employments their own location and deliberately backfilled nothing, so roles
   * recorded before it have none. Demanding one from every row on screen would mean somebody
   * correcting a title could not submit until they invented a location for a job they know
   * nothing about, and an invented location is worse than an absent one: it reads as something a
   * person stated.
   *
   * <p>The third fixture has no location. Correcting a DIFFERENT position must still submit.
   */
  test("a position nobody touched does not have to have a location", async ({ page }) => {
    const submitted = await setup(page);
    await openEditor(page);

    await page.getByTestId("position-card-0").getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("button", { name: "Edit title details" }).click();
    await page.getByLabel("Title", { exact: false }).first().fill("Senior Depot Supervisor");
    await page.getByRole("button", { name: "Done editing this position" }).click();

    await expect(page.getByTestId("submit-changes")).toBeEnabled();
    await page.getByTestId("submit-changes").click();

    await expect.poll(() => submitted.length).toBe(1);
    const body = submitted[0] as { positions: { roleId: number | null }[] };
    // One position proposed: the one that was corrected. The undated, unlocated row was not
    // dragged into the submission merely for being on screen.
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0].roleId).toBe(41);
  });
});
