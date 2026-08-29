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
}

async function openHiringTab(page: any) {
  await page.goto(COMPANY_URL);
  await page.getByRole("tab", { name: "What it's like to interview" }).click();
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
  ]) {
    await page.getByRole("button", { name: `${label}: 4 stars` }).click();
  }
}

async function completeProcessStep(page: any) {
  await page.getByRole("button", { name: "Received an offer" }).click();
  await page.getByRole("button", { name: "Average", exact: true }).click();
  await page.getByLabel("Country").selectOption("Canada");
  await page.getByLabel("How long did it take?").selectOption("2_4_weeks");
  await page.getByLabel("Role").fill("Engineering");
}

test.describe("Getting hired tab", () => {
  test("a company profile opens on Working here, not the interview tab", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await page.goto(COMPANY_URL);
    await expect(page.getByRole("tab", { name: "What it's like to work at Red Hat" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("interview-panel")).toHaveCount(0);
  });

  test("the interview tab is not offered until a manager has been rated", async ({ page }) => {
    // Manager ratings are the primary data. A second contribution surface offered alongside them
    // competes for the same attention, so the tab does not exist yet.
    await mockCompany(page, interviewStats(), false);
    await page.goto(COMPANY_URL);

    await expect(page.getByRole("tab", { name: "What it's like to work at Red Hat" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: /What it's like to interview/ })).toHaveCount(0);
  });

  test("a hiring URL falls back to the manager tab for someone who has not rated one", async ({ page }) => {
    // Otherwise a shared link would open a tab that is not on the page.
    await mockCompany(page, interviewStats(), false);
    await page.goto(`${COMPANY_URL}?tab=hiring`);

    await expect(page.getByRole("tab", { name: "What it's like to work at Red Hat" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
    await expect(page.getByTestId("interview-panel")).toHaveCount(0);
  });

  test("once a manager is rated the tab appears, still locked", async ({ page }) => {
    // The product expands in two stages: rate a manager to see it exists, share an interview
    // experience to open it. The two gates stay separate.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }));
    await openHiringTab(page);

    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Interview insights are locked")).toBeVisible();
    await expect(page.getByText("Share an interview experience to unlock them")).toBeVisible();
  });

  test("the tab still says how much is behind the lock", async ({ page }) => {
    // A locked page that will not even say how many experiences it holds gives someone arriving
    // from search no reason to come back.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null, categoryComparison: null }));
    await page.goto(COMPANY_URL);

    await expect(page.getByRole("tab", { name: "What it's like to interview at Red Hat" }))
      .toContainText("12 candidate experiences", { timeout: 10_000 });
  });

  test("the offer / no-offer gap is stated rather than averaged away", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await openHiringTab(page);

    // All three series are on screen at once, so nobody has to filter and compare from memory.
    await expect(page.getByText("Explore the interview data")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Got offer").first()).toBeVisible();
    await expect(page.getByText("No offer").first()).toBeVisible();
    await expect(page.getByText(/Biggest outcome gap/)).toBeVisible();
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

    // Same Strongest / Weakest layout the Working tab uses, so switching tabs needs no relearning.
    await expect(page.getByText("Strongest Areas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Weakest Areas")).toBeVisible();
    await expect(page.getByText("Communication").first()).toBeVisible();
  });

  test("the role filter re-requests only that slice, and never sends an outcome", async ({ page }) => {
    const requested: string[] = [];
    // Seeing the tab requires a manager rating, so this user has one.
    await page.addInitScript((u: unknown) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, USER);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
    await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
    await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
    await page.route("**/api/companies/red-hat/interviews**", (r: any) => {
      requested.push(r.request().url());
      r.fulfill({ json: interviewStats() });
    });

    await openHiringTab(page);
    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Role").selectOption("Engineering");

    await expect.poll(() => requested.some((u) => u.includes("role=Engineering"))).toBe(true);
    expect(requested.every((u) => !u.includes("outcome="))).toBe(true);
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

  test("too few reports is explained as a sample problem, not a locked gate", async ({ page }) => {
    await mockCompany(page, interviewStats({
      reviewCount: 2,
      categoryAverages: null,
      categoryComparison: null,
      gated: false,
      belowThreshold: true,
    }));
    await openHiringTab(page);

    await expect(page.getByText("Not enough reports to break down yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Interview insights are locked")).toHaveCount(0);
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

    await expect(page).toHaveURL(/add-interview\?edit=rev-1$/, { timeout: 10_000 });
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

  test("the country filter narrows only the chart", async ({ page }) => {
    const requested: string[] = [];
    // Seeing the tab requires a manager rating, so this user has one.
    await page.addInitScript((u: unknown) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, USER);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
    await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
    await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
    await page.route("**/api/companies/red-hat/interviews**", (r: any) => {
      requested.push(r.request().url());
      r.fulfill({ json: interviewStats() });
    });

    await openHiringTab(page);
    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Country").selectOption("Canada");

    await expect.poll(() => requested.some((u) => u.includes("country=Canada"))).toBe(true);
    // The headline is unchanged: it never depended on the filter.
    await expect(page.getByText("12 experiences")).toBeVisible();
  });
});

test.describe("Adding an interview experience", () => {
  // A routed page with step chrome, matching every other submission flow on the site.
  test("the Add button routes to a page rather than opening a modal", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);

    await page.getByRole("button", { name: "Share your experience" }).first().click();

    await expect(page).toHaveURL(/\/companies\/red-hat\/add-interview$/, { timeout: 10_000 });
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
    await expect(page.getByText(/No free text/)).toBeVisible();
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
    await expect(page.getByRole("tab", { name: "What it's like to interview at Red Hat" }))
      .toHaveAttribute("aria-selected", "true");
  });

  test("the tab survives a reload", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);
    await expect(page).toHaveURL(/tab=hiring/);

    await page.reload();

    await expect(page.getByRole("tab", { name: "What it's like to interview at Red Hat" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  });
});
