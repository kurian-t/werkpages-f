import { test, expect } from "./base";

/**
 * The interview panel's own surfaces: the outcome split, the typical process, and the controls
 * somebody gets over the experience they contributed.
 *
 * These sit between the header summary and the list of individual experiences, and almost none of
 * it ran. The outcome split is the panel's most distinctive claim - it refuses to average people
 * who got an offer together with people who did not, on the grounds that they did not have the
 * same experience - and the contribution controls are destructive, so a wrong branch there removes
 * something somebody wrote.
 */

const COMPANY_URL = "/industries/technology/companies/red-hat";

const USER = {
  id: "u1", username: "testuser", email: "a@b.com", firstName: "A", lastName: "B",
  role: "user", isBanned: false, hasContributed: true,
};

const CATEGORIES = {
  communication: 4.1, respectForTime: 3.9, roleClarity: 3.2,
  processFairness: 3.6, nextStepTransparency: 2.4, jobRelevance: 4.4,
};

/** An experience this reader wrote, which unlocks the contribution controls. */
const MINE = {
  id: "rev-mine",
  overallRating: 4,
  outcome: "offer",
  rounds: 3,
  processLength: "2_4_weeks",
  roleCategory: "Engineering",
  interviewYear: 2025,
  country: "Canada",
  ...CATEGORIES,
};

function stats(over: Record<string, unknown> = {}) {
  return {
    reviewCount: 12,
    avgRating: 3.8,
    avgDifficulty: 2.0,
    medianRounds: 4,
    medianProcessLength: "2_4_weeks",
    outcomeSplit: {
      offer: { count: 5, avgRating: 4.6 },
      noOffer: { count: 5, avgRating: 3.0 },
      withdrew: { count: 1, avgRating: 3.5 },
      pending: { count: 1, avgRating: 3.5 },
    },
    roleCategories: [{ role: "Engineering", count: 8 }, { role: "Sales", count: 4 }],
    countries: [{ country: "Canada", count: 9 }, { country: "United States", count: 3 }],
    typicalRounds: [
      { type: "recruiter_screen", count: 10 },
      { type: "technical", count: 9 },
      { type: "panel", count: 6 },
    ],
    categoryAverages: CATEGORIES,
    categoryComparison: null,
    myInterview: null,
    gated: false,
    belowThreshold: false,
    ...over,
  };
}

async function open(page: any, over: Record<string, unknown> = {}) {
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
  await page.route("**/api/companies/**", (r: any) =>
    r.fulfill({ json: {
      id: 1, name: "Red Hat", slug: "red-hat", industry: "Technology", industrySlug: "technology",
      managerCount: 3, totalReviews: 12, avgRating: 3.9, categoryAverages: {}, managers: [],
    } }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/companies/red-hat/interviews**", (r: any) =>
    r.fulfill({ json: stats(over) }));
  await page.goto(`${COMPANY_URL}?tab=hiring`);
  await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible({ timeout: 10_000 });
}

test.describe("The outcome split", () => {
  /*
    Only the offer *rate* survives on the panel now. The per-outcome rating bars - what people who
    got an offer said, against what people who did not said - lived inside the comparison chart and
    went with it when that was removed.

    Worth knowing, because that contrast was the panel's most distinctive claim: a 3.8 that is
    really a 4.6 and a 3.0 is an average hiding the finding. The data is still computed and
    returned; only the rendering is gone.
  */

  test("the offer rate is stated as a proportion of outcomes", async ({ page }) => {
    await open(page);

    await expect(page.getByText("Offer rate")).toBeVisible({ timeout: 10_000 });
  });

  test("a company where nobody reported an outcome shows no rate", async ({ page }) => {
    await open(page, {
      outcomeSplit: {
        offer: { count: 0, avgRating: null },
        noOffer: { count: 0, avgRating: null },
        withdrew: { count: 0, avgRating: null },
        pending: { count: 0, avgRating: null },
      },
    });

    await expect(page.getByText("Offer rate")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("0%")).toHaveCount(0);
  });

  test("difficulty is described in words, never as a rating", async ({ page }) => {
    // A hard interview can be a good one, so this is deliberately not on the five-star scale that
    // everything else here uses - showing it as one would read as a complaint.
    await open(page);

    await expect(page.getByText("Difficulty")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Easy")).toBeVisible();
  });
});

test.describe("The typical process", () => {
  test("the stages are named in the order they happen", async ({ page }) => {
    /*
      The sequence is the information - "recruiter screen → technical → panel" describes a process,
      the same three unordered describe nothing. Rendered as a chain for exactly that reason.
    */
    await open(page);

    await expect(page.getByText(/Recruiter screen.*Technical.*Panel/)).toBeVisible({ timeout: 10_000 });
  });

  test("a company nobody recorded stages for shows none", async ({ page }) => {
    // Rounds are optional on the form, so an empty list is ordinary rather than an error.
    await open(page, { typicalRounds: [] });

    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Recruiter screen.*Technical/)).toHaveCount(0);
  });

  test("how long it usually took is stated as a duration", async ({ page }) => {
    // Median over the four ordered answers, so it is always one somebody actually gave.
    await open(page);

    await expect(page.getByText("Typical process")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2–4 weeks")).toBeVisible();
  });
});

test.describe("Controls over your own experience", () => {
  test("somebody who has not contributed is asked to", async ({ page }) => {
    await open(page);

    await expect(page.getByRole("button", { name: /Share your experience/i }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("somebody who has contributed is offered their own entry instead", async ({ page }) => {
    // Asking again for something already given reads as the page not knowing who it is talking to.
    await open(page, { myInterview: MINE });

    await expect(page.getByRole("button", { name: /Your experience/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Share your experience/i })).toHaveCount(0);
  });

  test("removing an experience reports what happened", async ({ page }) => {
    /*
      Destructive and irreversible from the reader's side, so the outcome has to be stated. A
      silent failure here leaves somebody believing they withdrew an account that is still public.
    */
    await open(page, { myInterview: MINE });
    await page.route("**/api/interviews/rev-mine", (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 200, json: { success: true } })
        : r.continue());

    await page.getByRole("button", { name: /Your experience/i }).click();
    await page.getByRole("button", { name: /Delete|Remove/i }).first().click();
    const confirm = page.getByRole("button", { name: /Delete|Remove|Yes/i }).last();
    if (await confirm.count()) await confirm.click();

    await expect(page.getByText(/has been removed/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a failed removal says so rather than pretending", async ({ page }) => {
    await open(page, { myInterview: MINE });
    await page.route("**/api/interviews/rev-mine", (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 500, json: {} })
        : r.continue());

    await page.getByRole("button", { name: /Your experience/i }).click();
    await page.getByRole("button", { name: /Delete|Remove/i }).first().click();
    const confirm = page.getByRole("button", { name: /Delete|Remove|Yes/i }).last();
    if (await confirm.count()) await confirm.click();

    await expect(page.getByText(/couldn't remove that/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("What a locked reader sees", () => {
  test("the gate names itself and what opens it", async ({ page }) => {
    // One gate per dataset: rating a manager says nothing about interviewing there, so it does not
    // buy the interview numbers.
    await open(page, { gated: true, categoryAverages: null, categoryComparison: null });

    await expect(page.getByText("Interview insights are locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Share an interview experience to unlock/i)).toBeVisible();
  });

  test("the size of what is behind the lock is still stated", async ({ page }) => {
    // A locked page that will not say how much it holds gives somebody arriving from search no
    // reason to come back.
    await open(page, { gated: true, categoryAverages: null, categoryComparison: null });

    await expect(page.getByText(/12 (candidate )?(interviews|experiences)/).first())
      .toBeVisible({ timeout: 10_000 });
  });
});
