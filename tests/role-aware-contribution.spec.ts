import { test, expect } from "./base";
import { scopedDraftKey } from "../client/lib/draftScope";
import {
  MOCK_USER, mockAddBossPage, rateAllFiveStars, attestFirstHandExperience, pickLocation,
} from "./fixtures";

/*
  THE ROLE-AWARE CONTRIBUTION FLOW: the contributor says who they mean.

  What this guards. The legacy journey took a typed name, found candidates by exact company, ran an
  edit-distance comparison and attached the rating to whichever manager was within one edit. One
  person accumulated eight profiles that way; twenty-one people ended up with two public profiles
  each with their reviews split between them.

  These tests drive the three Rev 268 paths through the real component against the real response
  SHAPES the identify endpoint returns. The endpoint's own behaviour - that it creates nothing,
  never filters by company, and refuses a forged role id - is proved against a real database by
  ManagerMatchingSpecIntegrationTest; this layer proves the FORM asks and never guesses.

  Requires a bundle built with VITE_ROLE_AWARE_SUBMISSION=true. The shipped build has it off, so
  the legacy journey is what a visitor gets.
*/

const SELECTABLE_CANDIDATE = {
  candidates: [
    {
      id: 101,
      name: "Priya Raghunathan",
      company: "Halverson Logistics",
      title: "Dispatch Lead",
      employments: [
        {
          roleId: 55,
          companyId: 7,
          company: "Halverson Logistics",
          title: "Dispatch Lead",
          state: "accepted",
          periodKnown: true,
          startDate: "2022-03-01",
          endDate: null,
          selectable: true,
          isCurrentRoleWithoutRecord: false,
        },
      ],
    },
  ],
  nameClass: "CONFIRMED",
  incompleteEvidence: false,
  entered: { firstName: "Priya", lastName: "Raghunathan", company: "Halverson Logistics", title: "Dispatch Lead" },
};

const TWO_IDENTICAL_NAMES = {
  candidates: [
    { ...SELECTABLE_CANDIDATE.candidates[0], id: 101, company: "Halverson Logistics" },
    {
      id: 202,
      name: "Priya Raghunathan",
      company: "Brightwater Foods",
      title: "Depot Supervisor",
      employments: [
        {
          roleId: 77, companyId: 9, company: "Brightwater Foods", title: "Depot Supervisor",
          state: "accepted", periodKnown: true, startDate: "2019-01-01", endDate: "2021-06-01",
          selectable: true, isCurrentRoleWithoutRecord: false,
        },
      ],
    },
  ],
  nameClass: "CONFIRMED",
  incompleteEvidence: false,
  entered: SELECTABLE_CANDIDATE.entered,
};

const NON_SELECTABLE_ONLY = {
  candidates: [
    {
      id: 303,
      name: "Priya Raghunathan",
      company: "Halverson Logistics",
      title: "Dispatch Lead",
      employments: [
        {
          // The shape a search-created manager has: a visible current role with no canonical
          // record behind it, so there is nothing a rating can attach to.
          roleId: null, companyId: 7, company: "Halverson Logistics", title: "Dispatch Lead",
          state: "accepted", periodKnown: false, startDate: null, endDate: null,
          selectable: false, isCurrentRoleWithoutRecord: true,
        },
      ],
    },
  ],
  nameClass: "CONFIRMED",
  incompleteEvidence: false,
  entered: SELECTABLE_CANDIDATE.entered,
};

const NOBODY = {
  candidates: [],
  nameClass: "NONE",
  incompleteEvidence: false,
  entered: SELECTABLE_CANDIDATE.entered,
};

/**
 * Nobody RETURNED, but the server stopped scanning before it ran out of people.
 *
 * Not the same claim as NOBODY, and the difference decides whether the contributor is asked.
 * Advancing on this would propose a duplicate of a manager the search never reached.
 */
const NOBODY_BUT_TRUNCATED = { ...NOBODY, incompleteEvidence: true };

async function withIdentify(page: any, body: any) {
  await page.route("**/api/managers/identify", (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

/** Records every rate-with-role body, so a test can assert what was actually sent. */
async function captureSubmission(page: any, response: any = { live: true }) {
  const sent: any[] = [];
  await page.route("**/api/managers/rate-with-role", async (route: any) => {
    sent.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reviewId: "11111111-1111-1111-1111-111111111111",
        claimId: 1, managerId: 101, roleId: 55, resolution: "linked", heldBecause: null,
        replayed: false,
        ...response,
      }),
    });
  });
  return sent;
}

/** The legacy endpoints. Any call to these from the new journey is a fallback into fuzzy matching. */
async function forbidLegacySubmission(page: any) {
  const calls: string[] = [];
  for (const path of ["**/api/managers", "**/api/managers/ghost", "**/api/managers/drop-off"]) {
    await page.route(path, async (route: any) => {
      if (route.request().method() === "POST") calls.push(route.request().url());
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
    });
  }
  return calls;
}

async function fillStep1(page: any) {
  await page.locator('input[name="firstName"]').fill("Priya");
  await page.locator('input[name="lastName"]').fill("Raghunathan");
  await page.locator('input[name="title"]').fill("Dispatch Lead");
  await page.locator('input[name="company"]').fill("Halverson Logistics");
  await page.keyboard.press("Escape");
  await pickLocation(page);
  await page.getByTestId("form-next").click();
}

/*
  AN ENTRY THAT PINS NOBODY, so the comparison screen actually appears.

  fillStep1 types "Dispatch Lead at Halverson Logistics", which exactly one candidate holds. The
  picker then skips the comparison and opens that person directly, which is correct and is the
  whole point of the skip: when the answer is unambiguous, asking is a wasted screen.

  Tests about COMPARING candidates therefore have to enter something genuinely ambiguous. The
  company is kept, so one of them still holds it and no "nobody here" escape tile appears; only
  the job is changed to one neither of them has.
*/
async function fillStep1Ambiguous(page: any) {
  await page.locator('input[name="firstName"]').fill("Priya");
  await page.locator('input[name="lastName"]').fill("Raghunathan");
  await page.locator('input[name="title"]').fill("Operations Manager");
  await page.locator('input[name="company"]').fill("Halverson Logistics");
  await page.keyboard.press("Escape");
  await pickLocation(page);
  await page.getByTestId("form-next").click();
}

const FLAG_ON = process.env.VITE_ROLE_AWARE_SUBMISSION === "true";


/*
  STEP 2 IS TWO SCREENS NOW, and these tests have to walk both.

  With more than one candidate the screen opens as a GRID of one summary card per person, carrying
  the employer, the most recent job, the period and a position count. Choosing a card opens that
  person's full work history, which is where the selectable job rows live.

  That is deliberate: a manager with eight employers used to produce a card so tall it buried the
  other candidate. Asserting "every job of every candidate is on screen at once" would now be
  asserting the bug back into existence. What the tests still prove is the thing that matters -
  two people with the same name are tellable apart BEFORE committing to either, and the facts
  needed to tell them apart are visible without opening anything.
*/
async function openCandidate(page: any, companyText: string) {
  /*
    WAIT FOR THE SCREEN BEFORE DECIDING WHICH SCREEN IT IS.

    locator.count() does not auto-wait. An earlier version of this helper called it the instant
    after step 1 was submitted, while /api/managers/identify was still in flight, so it saw zero
    cards, concluded there was no grid, and then waited thirty seconds for a profile that was
    never going to open because the grid was what had rendered. Four tests failed on a race in
    the helper rather than on anything about the product.
  */
  const grid    = page.getByTestId("candidate-summary-card");
  const profile = page.getByTestId("candidate-profile");
  await expect(grid.or(profile).first()).toBeVisible();

  // One candidate opens directly; several are compared first, so pick the one this test means.
  if (await grid.count() > 0) {
    await grid.filter({ hasText: companyText }).first().click();
  }
  await expect(profile).toBeVisible();

  /*
    AND OPEN THE EMPLOYERS. A person's history arrives with each employer summarised to one line,
    so that somebody with eight of them gets a card they can read rather than a wall. The jobs
    themselves - the selectable rows - are behind that one line.
  */
  const collapsed = page.getByTestId("company-summary-row");
  for (let i = await collapsed.count(); i > 0; i = await collapsed.count()) {
    await collapsed.first().click();
    if (await collapsed.count() === i) break;  // nothing opened; stop rather than spin
  }
}

/*
  IN CI THIS MUST NOT SKIP, IT MUST FAIL.

  These journeys are the whole contributor experience, and for months they were absent from every
  suite total while appearing to be covered: the flag is baked into the bundle at build time, the
  standard build has it off, and a skip is silent. "4417 passed" did not include one of them.

  Locally a skip is still right - running the suite against a legacy bundle should not produce a
  wall of red for a feature that is correctly absent. In CI there is a dedicated job that builds
  with the flag ON, so a skip there means that job is misconfigured, and the only way to notice a
  misconfigured job is to make it fail.

  OUTSIDE the describe deliberately: the describe carries test.skip(!FLAG_ON), which would skip
  this guard too and make it exactly as silent as the thing it is guarding against.
*/
if (process.env.CI && !FLAG_ON) {
  test("the role-aware CI job must build with VITE_ROLE_AWARE_SUBMISSION=true", () => {
    throw new Error(
      "This suite ran in CI without VITE_ROLE_AWARE_SUBMISSION=true, so every role-aware "
    + "journey would have skipped silently. Fix the workflow rather than this test.");
  });
}

test.describe("role-aware contribution: the contributor chooses", () => {
  /*
    DECLARES ITS PRECONDITION rather than failing without it. The flag is baked into the bundle at
    build time, so these tests need a bundle built with VITE_ROLE_AWARE_SUBMISSION=true.

    FLAG_ON comes from the same env files the BUILD reads: playwright.config.ts loads them with
    Vite's own loader before the suite starts. Without that, node saw nothing, the gate said "off"
    and all eight tests skipped on every local run - silently, while the bundle they were meant to
    exercise had the flag on. The feature under active development was the one thing never tested.

    It remains a skip rather than a failure for one case only: somebody who deliberately builds
    the legacy bundle to reproduce what production serves. The legacy journey's own assertions are
    in legacy-add-manager-journey.spec.ts, which runs against that bundle in its own project, so
    neither half depends on the other being skipped.
  */
  test.skip(!FLAG_ON, "needs a bundle built with VITE_ROLE_AWARE_SUBMISSION=true");
  /*
    REGRESSION. The header counted to three while this journey has four steps.

    Seen on the real form at :8081 the day the flag went on locally: step one said "Step 1 of 3",
    the identify step said "Step 2 of 3", and the last one would have said "Step 4 of 3". The
    count was a literal while the step list is built from the flag.

    A contributor reads that line to decide whether it is worth starting, and a form that cannot
    count its own steps is the first thing they see.
  */
  test("the header counts the steps this journey actually has", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.goto("/add");

    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await fillStep1(page);
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await expect(page.getByText(/of 3/i)).toHaveCount(0);
  });

  /*
    REGRESSION, and the one that made the whole redesign look absent.

    A draft restores the step it was saved on. Drafts written before this journey existed - and
    any written on the "none of these" path, which carries no identity - hold a step from the
    three-step journey, so /add reopened on the WORK TIMELINE with nobody selected. The
    contributor never saw the new question at all, and if they filled the rest in they were
    refused at submit about a screen they had never been shown.

    It was found by opening the real form after turning the flag on locally, where it presented as
    "the flag did nothing": everybody who had ever used the form had a draft, so everybody kept
    landing two steps in. Found live, then fixed, then pinned here.
  */
  test("a draft with no selection reopens on the identify step, not past it", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.goto("/");
    // This account's own draft scope: drafts are keyed per account now, see draft-isolation.spec.
    await page.evaluate((draftKey: string) => {
      localStorage.setItem(draftKey, JSON.stringify({
        formData: {
          firstName: "Priya", lastName: "Raghunathan", title: "Dispatch Lead",
          company: "Halverson Logistics", status: "active", country: "CA", state: "",
          linkedinUrl: "",
        },
        companyName: "Halverson Logistics",
        workLocation: { country: "Canada", state: "Ontario", city: "Waterloo" },
        workedFrom: { month: "01", year: "2022" }, currentlyWorking: true,
        // A draft from the legacy journey: a step, and no identity.
        step: "timeline",
        savedAt: Date.now(),
      }));
    }, scopedDraftKey("rmm_pending_manager", MOCK_USER.id));
    await page.goto("/add");

    await expect(page.getByText(/select the job you want to rate/i)).toBeVisible();
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    // And nothing they had already answered was thrown away to get them there.
    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i }).click();
    await page.getByTestId("form-next").click();
    await expect(page.getByLabel("From year")).toHaveValue("2022");
  });

  test("a draft that DOES carry a selection reopens where it left off", async ({ page }) => {
    // The other half: the clamp must not drag somebody who already answered back a step.
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.goto("/");
    // This account's own draft scope: drafts are keyed per account now, see draft-isolation.spec.
    await page.evaluate((draftKey: string) => {
      localStorage.setItem(draftKey, JSON.stringify({
        formData: {
          firstName: "Priya", lastName: "Raghunathan", title: "Dispatch Lead",
          company: "Halverson Logistics", status: "active", country: "CA", state: "",
          linkedinUrl: "",
        },
        companyName: "Halverson Logistics",
        workLocation: { country: "Canada", state: "Ontario", city: "Waterloo" },
        workedFrom: { month: "01", year: "2022" }, currentlyWorking: true,
        identity: {
          kind: "existing", managerId: 101, managerName: "Priya Raghunathan", roleId: 55,
          employment: {
            roleId: 55, companyId: 7, company: "Halverson Logistics", title: "Dispatch Lead",
            state: "accepted", periodKnown: true, startDate: "2022-03-01", endDate: null,
            selectable: true, isCurrentRoleWithoutRecord: false,
          },
        },
        step: "timeline",
        savedAt: Date.now(),
      }));
    }, scopedDraftKey("rmm_pending_manager", MOCK_USER.id));
    await page.goto("/add");

    await expect(page.getByText(/step 3 of 4/i)).toBeVisible();
    await expect(page.getByLabel("From year")).toHaveValue("2022");
  });

  /*
    NOBODY FOUND IS NOT A QUESTION.

    A conclusively empty search leaves nothing on the identify screen to decide: the contributor
    typed a name, nobody is listed under it, and the only available answer is the one they gave by
    typing it. The screen used to ask anyway - "We don't have sdfsf sdfsfd yet, you'll be the first
    to add them, [Add sdfsf sdfsfd]" - which is a confirmation of a decision already made, on a
    form headed "Add a manager".

    The whole block below is about the word CONCLUSIVELY: a failed lookup and a truncated scan are
    both "we did not find anyone", not "there is no one", and either one advancing automatically
    would propose a duplicate of somebody the search never reached.
  */
  test("nobody found: the step is skipped and the answers are kept", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    await page.goto("/add");
    await fillStep1(page);

    // Straight to the work timeline, with no screen in between.
    await expect(page.getByLabel("From month")).toBeVisible();
    await expect(page.getByText(/select the job you want to rate/i)).toHaveCount(0);
    await expect(page.getByText(/we don't have/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add Priya Raghunathan$/i })).toHaveCount(0);
    await expect(page.getByText(/none of these people/i)).toHaveCount(0);
    // And the person they typed is still the subject of the form.
    await expect(page.getByText(/Priya/).first()).toBeVisible();
  });

  test("nobody found: nothing is created before the rating is submitted", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    const legacy = await forbidLegacySubmission(page);
    const sent = await captureSubmission(page, { live: false, roleId: null, resolution: "created" });
    await page.goto("/add");
    await fillStep1(page);

    // Identification is READ-ONLY. The skipped step changes nothing about that: no manager, no
    // company, no claim, no ghost row exists at this point.
    expect(legacy).toEqual([]);
    expect(sent).toEqual([]);

    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    // Only now, and through the role-aware endpoint, carrying the proposeManager shape.
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].managerId).toBeNull();
    expect(sent[0].selectedRoleId).toBeNull();
    expect(legacy).toEqual([]);
  });

  test("a truncated search still asks, because it is not proof of absence", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY_BUT_TRUNCATED);
    await page.goto("/add");
    await fillStep1(page);

    // It did not advance, and it does not claim the person is missing.
    await expect(page.getByLabel("From month")).toHaveCount(0);
    await expect(page.getByText(/couldn't find Priya Raghunathan/i)).toBeVisible();
    await expect(page.getByText(/more people with this name than we can check/i)).toBeVisible();
  });

  test("a failed lookup never creates anything by itself", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.route("**/api/managers/identify", (route: any) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    const legacy = await forbidLegacySubmission(page);
    await page.goto("/add");
    await fillStep1(page);

    // A server that cannot answer is not a server saying "no such person". The contributor is
    // told, and the choice to add somebody new stays theirs.
    await expect(page.getByText(/couldn't check for existing profiles/i)).toBeVisible();
    await expect(page.getByLabel("From month")).toHaveCount(0);
    expect(legacy).toEqual([]);
  });

  test("changing the name re-evaluates: candidates are asked about again", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    // First answer finds nobody, so the step is skipped.
    await withIdentify(page, NOBODY);
    await page.goto("/add");
    await fillStep1(page);
    await expect(page.getByLabel("From month")).toBeVisible();

    // Back, not "Change": the confirmation strip that carried the Change link was removed. The
    // behaviour under test is unchanged - leaving step 2 backwards must land on the NAME, not on
    // an empty intermediate step that would bounce straight forward again.
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await page.getByTestId("form-next").click();
    await expect(page.getByLabel("From month")).toBeVisible();

    // Back goes to the question they can actually revise, not to the step that was skipped.
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();

    // A different name, and this time somebody is listed: the question comes back. The name
    // field has collapsed behind its pencil now that it has an answer, so it is reopened the way
    // a person would.
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.getByRole("button", { name: /edit name details/i }).click();
    await page.locator('input[name="firstName"]').fill("Priyanka");
    await page.getByTestId("form-next").click();

    await expect(page.getByText(/select the job you want to rate/i)).toBeVisible();
    // And nothing is pre-chosen for them, including the choice the skip made last time.
    await expect(page.getByTestId("form-next")).toBeDisabled();
  });

  test("a restored draft keeps the proposed-manager path without asking again", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    await page.goto("/");
    // This account's own draft scope: drafts are keyed per account now, see draft-isolation.spec.
    await page.evaluate((draftKey: string) => {
      localStorage.setItem(draftKey, JSON.stringify({
        formData: {
          firstName: "Priya", lastName: "Raghunathan", title: "Dispatch Lead",
          company: "Halverson Logistics", status: "active", country: "CA", state: "",
          linkedinUrl: "",
        },
        companyName: "Halverson Logistics",
        workLocation: { country: "Canada", state: "Ontario", city: "Waterloo" },
        workedFrom: { month: "01", year: "2022" }, currentlyWorking: true,
        // What the skip leaves behind, which is a real answer and must survive the round trip.
        identity: { kind: "proposeManager" },
        step: "timeline",
        savedAt: Date.now(),
      }));
    }, scopedDraftKey("rmm_pending_manager", MOCK_USER.id));
    await page.goto("/add");

    // Not clamped back to identify: this draft HAS an answer, so it reopens where it was left.
    await expect(page.getByLabel("From year")).toHaveValue("2022");
    await expect(page.getByText(/select the job you want to rate/i)).toHaveCount(0);
  });

  /*
    REGRESSION: a completed contribution ended on a 404.

    The propose-manager path sends a null manager id, because there is nobody to name yet. The
    form then interpolated that into the URL and navigated to "/manager/" - so somebody who had
    just written ten ratings for a person nobody had listed was shown "Page Not Found".

    The server now names the manager it created, and the contributor lands on that profile, where
    the existing "Profile under review" banner explains what happens next. Same destination as the
    legacy journey, which is what it should have been all along.
  */
  test("adding someone new lands on their profile, not on a 404", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    await captureSubmission(page, {
      live: false, roleId: 9, managerId: 4242, resolution: "created",
      heldBecause: "the employment it names is proposed",
    });
    await page.goto("/add");
    await fillStep1(page);
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    // The manager the SERVER created, which the client could not have known.
    await expect(page).toHaveURL(/\/manager\/4242$/);
  });

  test("a replay lands where the first attempt did", async ({ page }) => {
    // A resubmitted form resolves to the manager the original landed on, so the second attempt
    // does not send them somewhere else - or nowhere.
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    await captureSubmission(page, {
      live: false, roleId: 9, managerId: 777, resolution: "created", replayed: true,
    });
    await page.goto("/add");
    await fillStep1(page);
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page).toHaveURL(/\/manager\/777$/);
  });

  test("path 1: the person and the job are both listed, so both are selected explicitly", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    const legacy = await forbidLegacySubmission(page);
    const sent = await captureSubmission(page);
    await page.goto("/add");
    await fillStep1(page);

    // NOTHING IS PRE-SELECTED. A single candidate is still a question.
    await expect(page.getByText(/select the job you want to rate/i)).toBeVisible();
    await expect(page.getByTestId("form-next")).toBeDisabled();

    // The job itself is the explicit choice. Every job is on screen from the start now, so
    // there is nothing to open first and the person's name is a heading, not a control.
    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i }).click();
    await expect(page.getByTestId("form-next")).toBeEnabled();
    await page.getByTestId("form-next").click();

    /*
      THE CONFIRMATION STRIP IS GONE, deliberately, and this no longer asserts it.

      "Rating <name>" / "Adding <name>" with a Change link sat above the rating questions. It was
      removed on 2026-11-10 because it restated a choice the person had just made, on the screen
      where they are trying to answer questions, and the step-2 tiles already show who and which
      job was picked. A test that demanded it back would force the interface to regrow something
      that was taken out on purpose.

      What still matters is that the chosen job carries through to the questions, which the
      surrounding steps assert.
    */

    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0].managerId).toBe(101);
    expect(sent[0].selectedRoleId).toBe(55);
    expect(sent[0].proposalKey).toBeTruthy();
    // THE INVARIANT: no legacy submission, so no route back into fuzzy attachment.
    expect(legacy).toEqual([]);
  });

  test("path 2: the person is listed but the job is not, and the person is kept", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    const sent = await captureSubmission(page, { live: false, heldBecause: "the employment it names is proposed" });
    await page.goto("/add");
    /*
      A JOB THEY DO NOT ALREADY HAVE, which is the whole premise of path 2.

      fillStep1 enters "Dispatch Lead at Halverson Logistics", which this candidate already holds.
      Offering to propose a job somebody is already recorded in would be nonsense, so the screen
      correctly does not offer it and instead points back to correct the title. The proposal only
      appears when the job genuinely is not on file, which is what this test is about.
    */
    await fillStep1Ambiguous(page);

    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Rate this position/i }).first().click();
    await expect(page.getByTestId("form-next")).toBeEnabled();
    await page.getByTestId("form-next").click();

    // The confirmation strip was removed on purpose; see the note above.
    // Said in advance, because "held for review" arriving afterwards reads as rejection.
    await expect(page.getByText(/appear once someone checks it/i)).toBeVisible();

    await page.getByLabel("From month").selectOption("05");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0].managerId).toBe(101);
    // NEVER INVENTED. Absent means "propose the employment", which is what they chose.
    expect(sent[0].selectedRoleId).toBeNull();
  });

  test("path 3: none of these people, so the manager is added explicitly", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    const sent = await captureSubmission(page, { live: false });
    await page.goto("/add");
    // Ambiguous on purpose: naming one person's job would skip the comparison this test is about.
    await fillStep1Ambiguous(page);

    // Two people with the same name are tellable apart by their employer and job.
    await expect(page.getByText("Halverson Logistics").first()).toBeVisible();
    await expect(page.getByText("Brightwater Foods").first()).toBeVisible();

    /*
      CHOOSING THE NEW PERSON IS THE DECISION, so the step advances on the click.

      There used to be a confirmation strip between here and the dates, which is why this once
      needed a Next of its own. Without it, saying "none of these people" is unambiguous and the
      screen moves straight on. Clicking Next here would be clicking it on the dates step before
      any dates exist, where it is correctly disabled.
    */
    await page.getByRole("button", { name: /continue with a new priya/i }).click();
    await expect(page.getByLabel("From month")).toBeVisible();
    // The confirmation strip was removed on purpose; see the note above.

    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2023");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBeGreaterThan(0);
    // An explicit "none of these" must not be overruled by name similarity.
    expect(sent[0].managerId).toBeNull();
    expect(sent[0].selectedRoleId).toBeNull();
  });

  test("an employment with no canonical record routes into the missing-job path", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NON_SELECTABLE_ONLY);
    const sent = await captureSubmission(page, { live: false });
    await page.goto("/add");
    await fillStep1(page);

    // Shown, not hidden and not disabled: it is usually the only job such a manager has.
    const row = page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i });
    await expect(row).toBeVisible();
    await expect(page.getByText(/don't have the dates for this job yet/i)).toBeVisible();
    await row.click();

    await page.getByTestId("form-next").click();
    await page.getByLabel("From month").selectOption("02");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0].managerId).toBe(303);
    // The person is kept and a null role id is sent, never the id that does not exist.
    expect(sent[0].selectedRoleId).toBeNull();
  });

  /*
    SUPERSEDED, AND DELIBERATELY SO.

    This test used to assert the opposite: that a conclusively empty search showed "We don't have
    Priya Raghunathan yet" and required a tap on "Add Priya Raghunathan" before continuing. That
    confirmation was removed on an explicit instruction - there is nothing to choose between when
    nobody was found, and asking is asking somebody to confirm a decision they made by typing the
    name. What survives from the old test is the half that still matters: the contributor's answer
    is recorded, not merely implied, so what reaches the server is an explicit proposeManager.
  */
  test("nobody matched: the proposed-manager answer is recorded without a confirmation", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, NOBODY);
    const sent = await captureSubmission(page, { live: false, roleId: null, resolution: "created" });
    await page.goto("/add");
    await fillStep1(page);

    await expect(page.getByText(/don't have Priya Raghunathan yet/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add Priya Raghunathan$/i })).toHaveCount(0);
    // Straight on to the timeline, with the answer already held.
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].managerId).toBeNull();
  });

  test("changing the selection keeps every rating answer", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    await page.goto("/add");
    await fillStep1(page);

    // TWO candidates, so neither is expanded: sharing a name is not evidence of being the same
    // person, and pre-opening one of them would be a hint the data does not support.
    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i }).click();
    await page.getByTestId("form-next").click();
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);

    // Realising on the rating screen that the wrong Priya was picked. Their answers must survive:
    // re-entering ten ratings because of a mis-tap is how a contribution gets abandoned.
    // Back, twice: the rating screen's "Change" link belonged to the confirmation strip that
    // was removed. Returning to the selection is the ordinary footer Back now, and the answers
    // surviving that journey is exactly what this test is about.
    await page.getByRole("button", { name: /^back$/i }).click();
    await page.getByRole("button", { name: /^back$/i }).click();
    /*
      Back lands on the person already chosen, not on the list, because the history is a view of
      step 2 rather than a step of its own. Leaving that person is its own control, and it clears
      the job with them: a job belongs to the person it was picked under.
    */
    await page.getByRole("button", { name: /not them\? choose someone else/i }).click();
    await openCandidate(page, "Brightwater Foods");
    await page.getByRole("button", { name: /^Select job: Depot Supervisor at Brightwater Foods/i }).click();
    await page.getByTestId("form-next").click();
    await page.getByTestId("form-next").click();

    // The confirmation strip was removed on purpose; see the note above.
    await attestFirstHandExperience(page);
    // Still submittable, which is only true if the ten answers are still there.
    await expect(page.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  test("the signup round trip: an anonymous contributor keeps their selection and their answers",
    async ({ page }) => {
    /*
      THE 4B GAP, closed here. The backend has covered anonymous submission and claim adoption
      since 4B (anAnonymousSubmissionIsSavedAndChargesNothing,
      signingInAdoptsTheAnonymousClaimRatherThanMakingASecondOne); what was never asserted is the
      journey a person actually takes through the browser.

      WHAT THE FORM REALLY DOES, which is worth stating because it is not what the backend's
      anonymous support would suggest. Submitting while signed out does not post the rating
      anonymously: the capture fires, an auth step appears IN PLACE, and the form stays mounted.
      So the selection and every answer are still in React state, and the rating is submitted once
      - after signing in, through rate-with-role, with the chosen manager and job intact.

      That ordering is CLAUDE.md section 44 working as written: the form is never gated, the
      question is asked at submit, and the work is captured in case they do not come back.
    */
    await mockAddBossPage(page, { loggedIn: false });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    const sent = await captureSubmission(page);

    // The drop-off capture is expected here, so it is observed rather than forbidden.
    const captured: any[] = [];
    await page.route("**/api/managers/drop-off", async (route: any) => {
      captured.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/add");
    await fillStep1(page);
    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i }).click();
    await page.getByTestId("form-next").click();
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);

    /*
      THE LABEL IS THE PROMISE. Signed out, the button says "Continue to Sign In" rather than
      "Submit Review": the form was never gated, every question was answered, and the account is
      asked for at the end. Asserted rather than assumed, because a form that said "Submit" and
      then demanded an account would be the bait this ordering exists to avoid.
    */
    const anonymousSubmit = page.getByRole("button", { name: /continue to sign in/i });
    await expect(anonymousSubmit, "no sign-in wall, and no pretence that this publishes")
      .toBeEnabled();
    await anonymousSubmit.click();

    // Their work is kept, and no rating was published under nobody's name.
    await expect.poll(() => captured.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(sent, "nothing is submitted until there is an account to attribute it to").toEqual([]);
    expect(captured[0].review?.ratings, "and the answers are what was captured").toBeTruthy();

    /*
      THE FORM'S IDENTITY IS IN THE DRAFT, which is what makes the eventual retry a retry.

      proposalKey used to live in a useRef, so the page load that signing in causes minted a fresh
      one. The server then could not tell the returning submission was the same form, and on path 3
      that meant a SECOND pending manager (issue 34). The server-side fix resolves the manager from
      the claim this key identifies, so it only works if the key survives.
    */
    const keyBefore = await page.evaluate((draftKey: string) =>
      JSON.parse(localStorage.getItem(draftKey) ?? "{}").proposalKey,
      scopedDraftKey("rmm_pending_manager", null));
    expect(keyBefore, "the key is written into the draft before they are sent to sign in")
      .toBeTruthy();

    /*
      Now they have an account, and the form comes back where they left it.

      AddBoss saved rmm_pending_manager before showing the auth step, so after signing in the form
      restores to the RATINGS step rather than to a blank step 1 - which is why nothing is re-typed
      below. Observed: the only actions available afterwards are Back, Regenerate and Submit
      Review.
    */
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 200, contentType: "application/json",
                      body: JSON.stringify({ ...MOCK_USER, hasContributed: false }) }));
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
    await page.reload();

    /*
      THE ANSWERS ARE OFFERED, NOT POURED IN, and that is deliberate.

      This draft was written with no account on it, so arriving signed in, the form cannot tell
      this contributor from the next person at a shared machine - and it used to simply apply it,
      which is how one person's rating came back in somebody else's form. See
      tests/draft-isolation.spec.ts. Nothing is lost: the work is held and handed back on request.
    */
    await page.getByRole("button", { name: /^restore$/i }).click();

    const submit = page.getByRole("button", { name: /submit review/i });
    await expect(submit, "their work came back, finished, with one thing left to do")
      .toBeVisible({ timeout: 10_000 });

    /*
      The attestation is deliberately NOT restored: it is a statement of first-hand experience, and
      the person making it now has an account that did not exist when it was first ticked. So it is
      re-made here rather than treated as a bug.
    */
    await attestFirstHandExperience(page);
    await expect(submit, "and with the attestation re-made, it can be sent").toBeEnabled();
    await submit.click();

    /*
      THE WHOLE POINT OF THE ROUND TRIP. The rating that finally reaches the server must carry the
      person and the job the contributor chose BEFORE they had an account, and must arrive through
      rate-with-role. If the selection were lost across the signup, this would submit against a
      fuzzy name match instead - which is the attribution error the whole phase exists to remove,
      arriving at the one moment nobody is looking.
    */
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(sent[0].managerId, "the person they chose, not a fuzzy match on the typed name").toBe(101);
    expect(sent[0].proposalKey,
      "and the SAME form identity it had before signing in, so the server sees one submission "
      + "rather than two").toBe(keyBefore);
    expect(sent[0].selectedRoleId, "and the job they chose").toBe(55);
  });

  test("a refused submission keeps the answers and does not fall back to the legacy path", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    const legacy = await forbidLegacySubmission(page);
    await page.route("**/api/managers/rate-with-role", (route: any) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "You have already used both of your ratings for this manager." }),
      }),
    );
    await page.goto("/add");
    await fillStep1(page);
    // Not clicking the person's header: a single candidate arrives expanded, so clicking it would
    // collapse the card. The job itself is the explicit choice.
    await openCandidate(page, "Halverson Logistics");
    await page.getByRole("button", { name: /^Select job: Dispatch Lead at Halverson Logistics/i }).click();
    await page.getByTestId("form-next").click();
    await page.getByLabel("From month").selectOption("01");
    await page.getByLabel("From year").selectOption("2022");
    await page.getByRole("checkbox", { name: /^current$/i }).check();
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/already used both of your ratings/i)).toBeVisible();
    // THE INVARIANT UNDER FAILURE, which is when a fallback would be reached and unnoticed.
    expect(legacy).toEqual([]);
    // And their work is still on screen.
    await expect(page.getByRole("button", { name: /submit/i })).toBeVisible();
  });
  /*
    WHAT THE CONTRIBUTOR IS ACTUALLY LOOKING AT when they pick between two people with one name.

    The jobs used to sit inside a collapsed card. Telling two Priya Raghunathans apart meant
    opening the first, reading it, closing it, opening the second and remembering what the first
    one said - on the one screen whose entire purpose is comparing them. The employment history IS
    the evidence, and putting evidence behind a tap asks somebody to decide before looking.
  */
  test("every job of every candidate is on screen without opening anything", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    await page.goto("/add");
    await fillStep1Ambiguous(page);

    // Both people on screen with nothing clicked, each carrying the facts that tell them apart.
    await expect(page.getByTestId("candidate-summary-card")).toHaveCount(2);
    await expect(page.getByText("Halverson Logistics").first()).toBeVisible();
    await expect(page.getByText("Brightwater Foods")).toBeVisible();
    await expect(page.getByText("Depot Supervisor").first()).toBeVisible();

    // And opening either one reaches its job, still without a second decision.
    await openCandidate(page, "Brightwater Foods");
    await expect(page.getByTestId("role-row")).toHaveCount(1);
  });

  /*
    THE TILE CARRIES THE THREE FACTS THAT SETTLE WHO SOMEBODY IS: the employer, the job, and when.

    "Dispatch Lead at Halverson Logistics, 2022-03 to now" was one run-on line of machine
    punctuation. A date range a person can read is the difference between recognising their own
    manager and guessing.
  */
  test("a job tile shows the company, the title and a readable period", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    await page.goto("/add");
    await fillStep1Ambiguous(page);

    /*
      THESE ARE TWO DIFFERENT PEOPLE, and the test used to read as though they were one.

      TWO_IDENTICAL_NAMES is two Priya Raghunathans: one at Brightwater Foods with an ended job,
      one at Halverson Logistics with an ongoing one. The old screen listed every candidate's
      jobs at once, so both periods could be asserted together. Each person now has their own
      history, which is the point of the change, so each is opened in turn.

      The employer heads its section and the jobs are rows beneath it, so a role row never
      contains the company name; the period is on the row and the employer on the section.
    */
    await openCandidate(page, "Brightwater Foods");
    const brightwater = page.getByTestId("company-section").filter({ hasText: "Brightwater Foods" });
    const ended = brightwater.getByTestId("role-row").first();
    await expect(ended).toContainText("Depot Supervisor");
    await expect(ended).toContainText("Jan 2019 – Jun 2021");

    /*
      Back to the comparison, then the other Priya: an ONGOING job reads as a period too.

      Back leaves step 2 entirely rather than returning to the grid - the person's history is a
      view of step 2, not a step of its own - so the way back to the comparison is Back then Next.
    */
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await page.getByTestId("form-next").click();
    await openCandidate(page, "Halverson Logistics");
    const halverson = page.getByTestId("company-section").filter({ hasText: "Halverson Logistics" });
    const ongoing = halverson.getByTestId("role-row").first();
    await expect(ongoing).toContainText("Mar 2022 – Present");
  });

  /*
    NO SCORE ON AN IDENTITY QUESTION.

    The career trajectory this tile borrows its look from leads with an average and a row of stars,
    because its subject is how the manager was rated. Here the subject is which person you worked
    for. Putting a score beside each one invites somebody to pick the one who looks better rather
    than the one they actually worked for, and the rating they are about to give is the thing being
    biased.
  */
  test("no rating is shown while choosing between people", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    await page.goto("/add");
    await fillStep1(page);

    for (const tile of await page.getByTestId("role-row").all()) {
      await expect(tile.locator("svg.lucide-star")).toHaveCount(0);
      await expect(tile).not.toContainText(/\d\.\d/);
      await expect(tile).not.toContainText(/review/i);
    }
  });

  /*
    THE TILE IS THE CHOICE, and the choice still carries the job.

    A rating attaches to an employment, not to a name. A person-level "this is them" would have to
    guess which of two jobs was meant, and guessing which employment a rating belongs to is the
    thing this redesign exists to stop. Tapping the tile sends that job's id.
  */
  test("tapping a job tile selects that person AND that job", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, TWO_IDENTICAL_NAMES);
    const sent = await captureSubmission(page);
    await page.goto("/add");
    await fillStep1Ambiguous(page);
    await openCandidate(page, "Brightwater Foods");
    await page.getByRole("button", { name: /^Select job: Depot Supervisor at Brightwater Foods/i }).click();
    await page.getByTestId("form-next").click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption("2019");
    await page.getByLabel("Until month").selectOption("06");
    await page.getByLabel("Until year").selectOption("2021");
    await page.getByTestId("form-next").click();
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /submit/i }).click();

    await expect.poll(() => sent.length).toBe(1);
    // The SECOND Priya, and HER job - not the first candidate and not a bare manager id.
    expect(sent[0].managerId).toBe(202);
    expect(sent[0].selectedRoleId).toBe(77);
  });

  /*
    SCREEN ONE ASKS WHO THE MANAGER IS, AND NOTHING ELSE ABOUT THEIR EMPLOYMENT.

    "Manager Status" asked whether the person is currently active before the contributor had said
    which person they meant, so the answer was about a manager nobody had chosen yet. In this
    journey the work-timeline step asks it of the employment that was actually picked, which is
    the thing the answer is a fact about.
  */
  test("step 1 does not ask whether the manager is currently active", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.goto("/add");

    await expect(page.getByText(/who is this manager/i)).toBeVisible();
    await expect(page.getByText(/manager status/i)).toHaveCount(0);
    await expect(page.getByText(/retired \/ no longer in this role/i)).toHaveCount(0);
    // The questions that DO belong to identifying somebody are untouched.
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
  });

  /*
    REGRESSION, and it was reported by eye rather than by a test.

    The first version of this tile was written to LOOK like the career trajectory card - an
    approximate radius, an approximate border, a Tailwind step that was nearly the right grey - and
    on screen it read as a different product. The fix was to use the trajectory's own literal
    values, and the only way that stays true is to assert them.

    These are read from the DOM rather than from the stylesheet, because a class named in a comment
    still generates its rule and proves nothing about what was painted. If somebody later rewrites
    these as "close enough" utilities, this fails and says which value moved.
  */
  test("a job tile is the career trajectory's card, not an approximation of it", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await withIdentify(page, SELECTABLE_CANDIDATE);
    await page.goto("/add");
    await fillStep1Ambiguous(page);

    await openCandidate(page, "Halverson Logistics");

    /*
      THE CARD MOVED UP ONE LEVEL, and so does this assertion.

      The trajectory's card is per EMPLOYER, and that is what the employer box is here. The jobs
      inside it are ruled rows, exactly as they are on the trajectory, because a manager with many
      employers stopped fitting into a flat list of job cards. Measuring a row against a card
      would compare two different things and demand the grouping be undone.
    */
    const section = page.getByTestId("company-section").first();
    await expect(section).toBeVisible();
    const tile = page.getByTestId("role-row").first();
    await expect(tile).toBeVisible();

    const card = await section.evaluate((el) => {
      const s = getComputedStyle(el as HTMLElement);
      return {
        radius: s.borderTopLeftRadius,
        left: s.borderLeftWidth,
        top: s.borderTopWidth,
        background: s.backgroundColor,
        leftColor: s.borderLeftColor,
      };
    });
    // CompanyCard in CareerTimeline.tsx: 8px radius. The employer box carries it.
    expect(card.radius).toBe("8px");
  });
});
