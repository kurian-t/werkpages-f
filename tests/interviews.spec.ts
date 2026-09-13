import { test, expect } from "./base";

/**
 * The "Getting hired" tab on a company profile.
 *
 * Three things are worth pinning here, because getting any of them wrong makes the page actively
 * misleading rather than merely incomplete:
 *
 *  1. The headline numbers stay visible to signed-out visitors. Most people arrive from a search
 *     for "interview at X" and have contributed nothing; a fully locked page teaches them the site
 *     is useless.
 *  2. The offer / no-offer split is stated, not averaged away. Rejected candidates rate a process
 *     far lower than hired ones, so a single blended number is close to meaningless.
 *  3. The two gates are independent. Rating a manager does not unlock interview data, and vice
 *     versa - they are different contributions from different people.
 */

const COMPANY = {
  id: 7,
  name: "Red Hat",
  slug: "red-hat",
  industry: "Technology",
  industrySlug: "technology",
  managerCount: 1,
  totalReviews: 3,
  avgRating: 4.2,
  categoryAverages: {},
  managers: [],
};

const COMPANY_URL = "/industries/technology/companies/red-hat";

function interviewStats(overrides: Record<string, unknown> = {}) {
  return {
    reviewCount: 12,
    avgRating: 3.8,
    avgDifficulty: 3.4,
    medianRounds: 4,
    outcomeSplit: {
      offer: { count: 5, avgRating: 4.6 },
      noOffer: { count: 5, avgRating: 3.0 },
      withdrew: { count: 1, avgRating: 3.5 },
      pending: { count: 1, avgRating: 3.5 },
    },
    roleCategories: [
      { role: "Engineering", count: 8 },
      { role: "Sales", count: 4 },
    ],
    categoryAverages: {
      communication: 4.1,
      respectForTime: 3.9,
      roleClarity: 3.2,
      processFairness: 3.6,
      nextStepTransparency: 2.4,
    },
    categoryComparison: {
      overall: { count: 12, overallRating: 3.8, communication: 4.1, respectForTime: 3.9,
                 roleClarity: 3.2, processFairness: 3.6, nextStepTransparency: 2.4 },
      offer:   { count: 5, overallRating: 4.6, communication: 4.7, respectForTime: 4.4,
                 roleClarity: 4.0, processFairness: 4.2, nextStepTransparency: 3.9 },
      noOffer: { count: 5, overallRating: 3.0, communication: 3.4, respectForTime: 3.2,
                 roleClarity: 2.6, processFairness: 3.0, nextStepTransparency: 1.6 },
    },
    role: null,
    country: null,
    countries: [{ country: "Canada", count: 3 }],
    myInterview: null,
    hasContributed: true,
    gated: false,
    ...overrides,
  };
}

const USER = { id: "u1", username: "tester", email: "t@test.com", hasContributed: true, role: "user" };

async function mockCompany(page: any, stats: Record<string, unknown>, signedIn = true) {
  // AuthProvider seeds itself from localStorage on first render, so mocking /api/auth/me alone
  // is a frame too late for a page that redirects signed-out visitors.
  if (signedIn) {
    await page.addInitScript((u: unknown) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, USER);
  }
  await page.route("**/api/auth/me", (r: any) =>
    signedIn
      ? r.fulfill({ json: USER })
      : r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  // Playwright matches routes in reverse registration order, so the catch-alls go first and the
  // specific interview route last - otherwise "**/api/companies/**" swallows it.
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/companies/red-hat/interviews**", (r: any) => r.fulfill({ json: stats }));
  /*
    The country is inferred from geo and shown rather than asked, so without this the field never
    settles and the process step can never be completed - which is why every test that fills the
    form began failing at once rather than one at a time.
  */
  await page.route("**/api/geo", (r: any) =>
    r.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } }));
}

async function openHiringTab(page: any) {
  await page.goto(COMPANY_URL);
  await page.getByRole("tab", { name: "Interviewing" }).click();
}

/**
 * Fills every field the form now gates Next on: outcome, difficulty, year (pre-filled),
 * process length and role. Rounds are deliberately excluded - they are optional.
 */
/** Every rating on step two - the form requires all of them, not just the overall. */
async function completeRatingsStep(page: any) {
  for (const label of [
    "Overall",
    "Communication",
    "Respect for your time",
    "Clarity about the role",
    "Fairness of the process",
    "Transparency about next steps",
    "Role relevance",
  ]) {
    await page.getByRole("button", { name: `${label}: 4 stars` }).click();
  }
}

/*
  Every question the process step asks. Year was missing and Country was being set through a
  <select> that no longer exists - the field became an inferred card, filled from geo, matching how
  country is asked everywhere else on the site.
*/
async function completeProcessStep(page: any) {
  await page.getByRole("button", { name: "Received an offer" }).click();
  await page.getByRole("button", { name: "Average", exact: true }).click();
  await page.getByLabel("Year").selectOption("2025");
  await page.getByLabel("How long did it take?").selectOption("2_4_weeks");
  await page.getByLabel("Role").fill("Engineering");
}

test.describe("Getting hired tab", () => {
  test("a company profile opens on Managers, not the interview tab", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await page.goto(COMPANY_URL);
    await expect(page.getByRole("tab", { name: "Managers" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("interview-panel")).toHaveCount(0);
  });

  test("every tab is offered, and each is opened by its own contribution", async ({ page }) => {
    // One gate per dataset: rate a manager to read manager data, share an interview to read
    // interview data, rate a workplace to read workplace data. Rating a manager tells us nothing
    // about interviewing there, so it does not buy the interview numbers.
    //
    // The tabs themselves are always shown. A locked tab still says the dataset exists and what
    // contributing to it buys; hiding it tells a first-time visitor nothing.
    await mockCompany(page, interviewStats(), false);
    await page.goto(COMPANY_URL);

    await expect(page.getByRole("tab", { name: "Managers" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Company" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);
  });

  test("a locked panel still says how much is behind it", async ({ page }) => {
    /*
      A locked page that will not even say how much it holds gives someone arriving from search no
      reason to come back. The ratings stay hidden; the size of what is hidden does not.

      Asserted on the panel header rather than the tab. This read the count off the tab label, and
      the redesign removed it from there for restating what the header already carries - which it
      does whether or not the reader has contributed, so the property this test exists to protect
      is intact and only its location moved.
    */
    await mockCompany(page, interviewStats(), false);
    await page.goto(COMPANY_URL);

    await expect(page.getByText(/3 (manager )?(opinions|reviews)/).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("a hiring URL opens the hiring tab, signed in or not", async ({ page }) => {
    // It used to fall back to Managers, because the tab did not exist for someone who had not
    // rated a manager. Now that every tab is rendered, a shared "interview at X" link lands
    // where it says it will - which is how most people reach this page at all.
    await mockCompany(page, interviewStats(), false);
    await page.goto(`${COMPANY_URL}?tab=hiring`);

    await expect(page.getByRole("tab", { name: "Interviewing" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
    await expect(page.getByTestId("interview-panel")).toBeVisible();
  });

  test("interview data is opened by an interview, not by a manager rating", async ({ page }) => {
    // The gate is the server's, and it is keyed to this dataset alone: somebody who has rated a
    // manager has said nothing about interviewing here, so the numbers stay closed to them.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }));
    await openHiringTab(page);

    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Interview insights are locked")).toBeVisible();
    await expect(page.getByText("Share an interview experience to unlock them")).toBeVisible();
    // The tab chrome arrives with the second destination, not before it.
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);
  });

  test("the panel still says how much is behind the lock", async ({ page }) => {
    // Same move as above: the count lives in the panel header now, not on the tab label, and it is
    // shown to a locked reader on purpose.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }));
    await page.goto(COMPANY_URL);

    await page.getByRole("tab", { name: "Interviewing" }).click();
    await expect(page.getByText(/12 (candidate )?experiences/).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("the category breakdown is locked for a non-contributor", async ({ page }) => {
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }));
    await openHiringTab(page);

    await expect(page.getByText("Interview insights are locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Transparency about next steps")).toHaveCount(0);
  });

  test("rating a manager does not unlock the interview breakdown", async ({ page }) => {
    // hasContributed on the user is the MANAGER gate. The interview gate is separate, and the
    // server reports it independently - the panel must follow the server, not the user object.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }), true);
    await openHiringTab(page);

    await expect(page.getByText("Interview insights are locked")).toBeVisible({ timeout: 10_000 });
  });

  test("the category breakdown is shown to a contributor", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await openHiringTab(page);

    /*
      Same Strongest / Weakest layout the Company tab uses, so switching tabs needs no relearning -
      which is why these read "Strongest" and "Weakest" now. The "Areas" suffix belonged to the
      HighLowCards below, removed for restating the six figures the header already carries.
    */
    await expect(page.getByText("Strongest", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Weakest", { exact: true })).toBeVisible();
    await expect(page.getByText("Communication").first()).toBeVisible();
  });

  test("difficulty is described in its own words, never as a rating", async ({ page }) => {
    // "3.4 stars" would read as a mediocre company. "Average" reads as a fact about the process.
    await mockCompany(page, interviewStats({ avgDifficulty: 4.4 }));
    await openHiringTab(page);

    await expect(page.getByText("Hard", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("a company nobody has interviewed at shows a locked teaser to a non-contributor", async ({ page }) => {
    // Telling a visitor there is nothing here AND skipping the ask is the worst of both. They get
    // the same locked treatment every other company shows.
    await mockCompany(page, interviewStats({
      reviewCount: 0, avgRating: null, avgDifficulty: null, medianRounds: null,
      outcomeSplit: { offer: { count: 0, avgRating: null }, noOffer: { count: 0, avgRating: null },
                      withdrew: { count: 0, avgRating: null }, pending: { count: 0, avgRating: null } },
      roleCategories: [], countries: [], typicalRounds: [],
      categoryAverages: null, categoryComparison: null, hasContributed: false, gated: true,
    }));
    await openHiringTab(page);

    await expect(page.getByText("Interview insights are locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("interview-panel-empty")).toHaveCount(0);
    await expect(page.getByText(/Nobody has described interviewing/)).toHaveCount(0);
  });

  test("a contributor is invited to be the first when there is genuinely nothing", async ({ page }) => {
    await mockCompany(page, interviewStats({
      reviewCount: 0,
      avgRating: null,
      avgDifficulty: null,
      medianRounds: null,
      outcomeSplit: {
        offer: { count: 0, avgRating: null },
        noOffer: { count: 0, avgRating: null },
        withdrew: { count: 0, avgRating: null },
        pending: { count: 0, avgRating: null },
      },
      roleCategories: [],
      countries: [],
      typicalRounds: [],
      categoryAverages: null,
      categoryComparison: null,
      // Contributed elsewhere, so the invitation is one they can act on knowingly.
      hasContributed: true,
      gated: false,
    }));
    await openHiringTab(page);

    await expect(page.getByTestId("interview-panel-empty")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nobody has described interviewing at Red Hat/)).toBeVisible();
  });

  test("a thin sample is shown and flagged, not withheld", async ({ page }) => {
    /*
      CHANGED DELIBERATELY. This asserted "Not enough reports to break down yet" - the tab used to
      replace its breakdown with that notice below a threshold. The figures are shown now, with a
      caveat beside them, which is what the manager profile and the workplace tab both do. Refusing
      to show two people's experience is a worse answer than showing it and saying it is two.
    */
    await mockCompany(page, interviewStats({ reviewCount: 2, gated: false, belowThreshold: true }));
    await openHiringTab(page);

    // .last(): the header keeps a hidden copy of this footnote, so the visible caveat is the second.
    await expect(page.getByText(/Limited data — interpret cautiously/).last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Not enough reports to break down yet")).toHaveCount(0);
    await expect(page.getByText("Interview insights are locked")).toHaveCount(0);
  });

  test("the outcome-comparison chart is not rendered", async ({ page }) => {
    /*
      REMOVED DELIBERATELY, and pinned so its return is a decision rather than a regression.

      It was a second, much larger presentation of figures the panel header already gives - five
      categories tall, in a visual language nothing else on the page used - so the tab read as two
      competing charts. Its filters went with it.

      The data is untouched: categoryComparison is still computed and returned, so bringing it back
      is a rendering change.
    */
    await mockCompany(page, interviewStats());
    await openHiringTab(page);

    await expect(page.getByText("Explore the interview data")).toHaveCount(0);
    await expect(page.getByText("Compare", { exact: true })).toHaveCount(0);
  });
});

test.describe("Your own experience", () => {
  const MINE = {
    id: "rev-1", overallRating: 4, communication: 4, respectForTime: 4, roleClarity: 4,
    processFairness: 4, nextStepTransparency: 4, difficulty: 3, outcome: "offer",
    rounds: 2, processLength: "2_4_weeks", roleCategory: "Engineering",
    country: "Canada", interviewYear: 2026,
  };

  test("the primary action becomes an ownership control once you have contributed", async ({ page }) => {
    await mockCompany(page, interviewStats({ myInterview: MINE }), true);
    await openHiringTab(page);

    await expect(page.getByRole("button", { name: /Your experience/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Share your experience" })).toHaveCount(0);
    // Both prompts go: there is nothing left to ask for.
  });

  test("edit routes to the form carrying the review id", async ({ page }) => {
    await mockCompany(page, interviewStats({ myInterview: MINE }), true);
    await openHiringTab(page);

    await page.getByRole("button", { name: /Your experience/ }).click();
    await page.getByRole("button", { name: /Edit your experience/ }).click();

    // Not anchored: the link also carries returnTo, so Cancel comes back to this tab.
    await expect(page).toHaveURL(/add-interview\?edit=rev-1/, { timeout: 10_000 });
  });

  test("delete asks first and says what will happen", async ({ page }) => {
    await mockCompany(page, interviewStats({ myInterview: MINE }), true);
    let deleted = false;
    await page.route("**/api/interviews/rev-1", (r: any) => {
      if (r.request().method() === "DELETE") { deleted = true; return r.fulfill({ status: 204, body: "" }); }
      return r.continue();
    });

    await openHiringTab(page);
    await page.getByRole("button", { name: /Your experience/ }).click();
    await page.getByRole("button", { name: /Delete your experience/ }).click();

    await expect(page.getByText("Delete your interview experience?")).toBeVisible();
    await expect(page.getByText(/removed from Red Hat's interview statistics/)).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    expect(deleted).toBe(false);

    await page.getByRole("button", { name: /Delete your experience/ }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => deleted).toBe(true);
  });

});

test.describe("Adding an interview experience", () => {
  // A routed page with step chrome, matching every other submission flow on the site.
  test("the Add button routes to a page rather than opening a modal", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);

    await page.getByRole("button", { name: "Share your experience" }).first().click();

    /*
      Not anchored with $. The link now carries ?returnTo=, so that Cancel lands the contributor
      back on the tab they started from instead of the default one - anchoring to the end of the
      path asserted the absence of a feature.
    */
    await expect(page).toHaveURL(/\/companies\/red-hat\/add-interview/, { timeout: 10_000 });
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
  });

  test("outcome is required before the ratings step", async ({ page }) => {
    // The outcome gates step two because it is what the ratings are read against.
    await mockCompany(page, interviewStats(), true);
    await page.goto("/companies/red-hat/add-interview");

    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    // Outcome alone is not enough any more - Next waits for every field on the step.
    await page.getByRole("button", { name: "Received an offer" }).click();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    await completeProcessStep(page);
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("offers no free-text field for the experience", async ({ page }) => {
    // Structured-only is a deliberate safety property: an interview review naming an interviewer
    // is a defamation surface with no employment relationship behind it.
    await mockCompany(page, interviewStats(), true);
    await page.goto("/companies/red-hat/add-interview");

    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("Back returns to step one instead of leaving the form", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await page.goto("/companies/red-hat/add-interview");

    await completeProcessStep(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 2")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
  });

  test("a duplicate for the same year is explained rather than dumped as an error", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await page.route("**/api/companies/red-hat/interviews", (r: any) => {
      if (r.request().method() === "POST") {
        return r.fulfill({ status: 409, json: { message: "interview_review_exists_for_year" } });
      }
      return r.fulfill({ json: interviewStats() });
    });

    await page.goto("/companies/red-hat/add-interview");
    await completeProcessStep(page);
    await page.getByRole("button", { name: "Next" }).click();
    await completeRatingsStep(page);
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(page.getByText(/already reviewed an interview at this company/i)).toBeVisible();
  });

  test("rounds are optional, and record the shape of the process in order", async ({ page }) => {
    let posted: any = null;
    await mockCompany(page, interviewStats(), true);
    await page.route("**/api/companies/red-hat/interviews", (r: any) => {
      if (r.request().method() === "POST") {
        posted = r.request().postDataJSON();
        return r.fulfill({ status: 201, json: { id: "r1" } });
      }
      return r.fulfill({ json: interviewStats() });
    });

    await page.goto("/companies/red-hat/add-interview");
    await completeProcessStep(page);
    // Next is already enabled without touching rounds.
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();

    await page.getByRole("button", { name: "Add the first round" }).click();
    await page.getByRole("button", { name: "Add another round" }).click();
    const selects = page.locator("select");
    await selects.last().selectOption("panel");

    await page.getByRole("button", { name: "Next" }).click();
    await completeRatingsStep(page);
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect.poll(() => posted?.rounds).toEqual(["phone", "panel"]);
  });

  test("Cancel returns to the interview tab, not the manager tab", async ({ page }) => {
    // Landing on "what it's like to work here" after cancelling an interview review drops you on
    // a different half of the page from the one you left.
    await mockCompany(page, interviewStats(), true);
    await page.goto("/companies/red-hat/add-interview");

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/red-hat\?tab=hiring$/, { timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Interviewing" }))
      .toHaveAttribute("aria-selected", "true");
  });

  test("the tab survives a reload", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);
    await expect(page).toHaveURL(/tab=hiring/);

    await page.reload();

    await expect(page.getByRole("tab", { name: "Interviewing" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  });
});
