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
 *     versa — they are different contributions from different people.
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
    filteredCount: 12,
    filteredOverall: 3.8,
    filteredDifficulty: 3.4,
    filteredMedianRounds: 4,
    categoryAverages: {
      communication: 4.1,
      respectForTime: 3.9,
      roleClarity: 3.2,
      processFairness: 3.6,
      nextStepTransparency: 2.4,
    },
    hasContributed: true,
    gated: false,
    ...overrides,
  };
}

async function mockCompany(page: any, stats: Record<string, unknown>, signedIn = false) {
  await page.route("**/api/auth/me", (r: any) =>
    signedIn
      ? r.fulfill({ json: { id: "u1", username: "tester", hasContributed: true, role: "user" } })
      : r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  // Playwright matches routes in reverse registration order, so the catch-alls go first and the
  // specific interview route last — otherwise "**/api/companies/**" swallows it.
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/companies/red-hat/interviews**", (r: any) => r.fulfill({ json: stats }));
}

async function openHiringTab(page: any) {
  await page.goto(COMPANY_URL);
  await page.getByRole("tab", { name: "What it's like to interview" }).click();
}

test.describe("Getting hired tab", () => {
  test("a company profile opens on Working here, not the interview tab", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await page.goto(COMPANY_URL);
    await expect(page.getByRole("tab", { name: "What it's like to work here" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("interview-panel")).toHaveCount(0);
  });

  test("headline numbers are visible to a signed-out visitor", async ({ page }) => {
    // Someone arriving from a search for "interview at Red Hat" has contributed nothing. If the
    // page shows them a wall, they leave and never come back.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null }));
    await openHiringTab(page);

    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("3.8")).toBeVisible();
    await expect(page.getByText("50%")).toBeVisible();
    await expect(page.getByText("12 interviews")).toBeVisible();
  });

  test("the offer / no-offer gap is stated rather than averaged away", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await openHiringTab(page);

    await expect(page.getByText("Ratings depend a lot on how it ended")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/4\.6/)).toBeVisible();
    await expect(page.getByText(/3\.0/)).toBeVisible();
  });

  test("the category breakdown is locked for a non-contributor", async ({ page }) => {
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null }));
    await openHiringTab(page);

    await expect(page.getByText("The breakdown is locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Transparency about next steps")).toHaveCount(0);
  });

  test("rating a manager does not unlock the interview breakdown", async ({ page }) => {
    // hasContributed on the user is the MANAGER gate. The interview gate is separate, and the
    // server reports it independently — the panel must follow the server, not the user object.
    await mockCompany(page, interviewStats({ gated: true, hasContributed: false, categoryAverages: null }), true);
    await openHiringTab(page);

    await expect(page.getByText("The breakdown is locked")).toBeVisible({ timeout: 10_000 });
  });

  test("the category breakdown is shown to a contributor", async ({ page }) => {
    await mockCompany(page, interviewStats());
    await openHiringTab(page);

    await expect(page.getByText("How the process rated")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Transparency about next steps")).toBeVisible();
    await expect(page.getByText("Communication")).toBeVisible();
  });

  test("filtering by outcome re-requests that slice", async ({ page }) => {
    const requested: string[] = [];
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
    await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: COMPANY }));
    await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
    await page.route("**/api/companies/red-hat/interviews**", (r: any) => {
      requested.push(r.request().url());
      r.fulfill({ json: interviewStats() });
    });

    await openHiringTab(page);
    await expect(page.getByTestId("interview-panel")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "No offer", exact: true }).click();
    await expect.poll(() => requested.some((u) => u.includes("outcome=no_offer"))).toBe(true);
  });

  test("difficulty is described in its own words, never as a rating", async ({ page }) => {
    // "3.4 stars" would read as a mediocre company. "Average" reads as a fact about the process.
    await mockCompany(page, interviewStats({ avgDifficulty: 4.4 }));
    await openHiringTab(page);

    await expect(page.getByText("Hard", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("a company nobody has interviewed at invites the first report", async ({ page }) => {
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
      filteredCount: 0,
      categoryAverages: null,
      hasContributed: false,
      gated: true,
    }));
    await openHiringTab(page);

    await expect(page.getByTestId("interview-panel-empty")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nobody has described interviewing at Red Hat/)).toBeVisible();
  });

  test("too few reports is explained as a sample problem, not a locked gate", async ({ page }) => {
    await mockCompany(page, interviewStats({
      filteredCount: 2,
      categoryAverages: null,
      gated: false,
      belowThreshold: true,
    }));
    await openHiringTab(page);

    await expect(page.getByText("Not enough reports to break down yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("The breakdown is locked")).toHaveCount(0);
  });
});

test.describe("Adding an interview experience", () => {
  test("the form requires an outcome and says why", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);

    await page.getByRole("button", { name: "Add your interview experience" }).first().click();
    await expect(page.getByRole("heading", { name: /Your interview at Red Hat/ })).toBeVisible();

    await page.getByRole("button", { name: "Share experience" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /how it ended/i })).toBeVisible();
  });

  test("the form offers no free-text field for the experience", async ({ page }) => {
    // Structured-only is a deliberate safety property: an interview review naming an interviewer
    // is a defamation surface with no employment relationship behind it.
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);
    await page.getByRole("button", { name: "Add your interview experience" }).first().click();

    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByText(/No free text/)).toBeVisible();
  });

  test("a duplicate for the same year is explained rather than dumped as an error", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await page.route("**/api/companies/red-hat/interviews", (r: any) => {
      if (r.request().method() === "POST") {
        return r.fulfill({ status: 409, json: { message: "interview_review_exists_for_year" } });
      }
      return r.fulfill({ json: interviewStats() });
    });

    await openHiringTab(page);
    await page.getByRole("button", { name: "Add your interview experience" }).first().click();

    await page.getByRole("button", { name: "Received an offer" }).click();
    await page.getByRole("button", { name: "Overall: 4 stars" }).click();
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(page.getByText(/already reviewed an interview at this company/i)).toBeVisible();
  });

  test("closing the form leaves the panel intact", async ({ page }) => {
    await mockCompany(page, interviewStats(), true);
    await openHiringTab(page);

    await page.getByRole("button", { name: "Add your interview experience" }).first().click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("heading", { name: /Your interview at Red Hat/ })).toHaveCount(0);
    await expect(page.getByTestId("interview-panel")).toBeVisible();
  });
});
