import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The two lists of individual opinions behind a company's averages.
 *
 * Both shipped almost unexercised, for the same reason: each returns `null` when its query comes
 * back with no rows, and the existing company specs route `**​/api/companies/**` to a single
 * company object - so `data.data` was undefined, every list rendered nothing, and a spec could
 * assert happily against a page where neither component existed. The specific routes here are
 * registered *after* the general one on purpose: Playwright matches in reverse registration
 * order, so the last one registered wins.
 *
 * What they protect: the sort the reader chose is the order they get, the breakdown opens and
 * closes, a signed rating carries its author's handle and an unsigned one still renders, and
 * tenure reads as the fact it is rather than as a missing field.
 */

const CATEGORIES = [
  "work_life_balance", "compensation_benefits", "career_growth", "job_security",
  "workload_sustainability", "senior_leadership", "company_communication",
  "flexibility", "inclusion_belonging", "tools_resources",
];

/* Varied rather than ten copies of one number - a uniform fixture lets an assertion on the
   headline match a category row instead and pass for the wrong reason. */
const spread = () =>
  Object.fromEntries(CATEGORIES.map((c, i) => [c, Number((2.6 + i * 0.2).toFixed(1))]));

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const RATINGS = [
  {
    id: "rat-1",
    overallRating: 4.8,
    categories: spread(),
    workedFrom: "2019-03-01",
    workedUntil: null,
    current: true,
    createdAt: ago(2),
    updatedAt: null,
    author: "CoolLynx30",
    mine: true,
  },
  {
    id: "rat-2",
    overallRating: 1.6,
    categories: spread(),
    workedFrom: "2016-01-01",
    workedUntil: "2018-09-01",
    current: false,
    createdAt: ago(40),
    // Edited well after it was written, so the card should say so rather than imply the opinion
    // has stood untouched since the day it was first written.
    updatedAt: ago(3),
    author: "QuietOtter77",
    mine: false,
  },
  {
    id: "rat-3",
    overallRating: 3.2,
    categories: spread(),
    workedFrom: "2020-05-01",
    workedUntil: null,
    current: true,
    createdAt: ago(10),
    updatedAt: null,
    // Written before authors existed - V63 added the column nullable with no backfill, so these
    // rows are real and must still render.
    author: null,
    mine: false,
  },
];

const INTERVIEWS = [
  {
    id: "int-1",
    overallRating: 4.6,
    difficulty: 3,
    outcome: "offer",
    rounds: 4,
    processLength: "2_4_weeks",
    roleCategory: "Software Engineer",
    interviewYear: 2025,
    country: "Canada",
    createdAt: ago(5),
    updatedAt: null,
    categories: {
      communication: 4.5, respectForTime: 4.0, roleClarity: 5.0,
      processFairness: 4.5, nextStepTransparency: 4.0,
    },
    author: "BraveHeron12",
  },
  {
    id: "int-2",
    overallRating: 1.8,
    difficulty: 5,
    outcome: "no_offer",
    rounds: 1,
    processLength: "over_2_months",
    roleCategory: "Product Manager",
    interviewYear: 2024,
    country: "United States",
    createdAt: ago(60),
    updatedAt: null,
    categories: null,
    author: null,
  },
];

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 12, totalReviews: 127, avgRating: 3.9,
  categoryAverages: { communication_style: 4.4 },
  managers: [],
  companyRating: { ratingCount: 3, overallRating: 4.1, categories: spread() },
  interviewRating: {
    ratingCount: 2, overallRating: 3.2, difficulty: 4,
    categories: {
      communication: 3.5, respectForTime: 3.0, roleClarity: 3.2,
      processFairness: 3.4, nextStepTransparency: 3.0,
    },
  },
};

async function open(
  page: any,
  {
    ratings = RATINGS,
    interviews = INTERVIEWS,
    tab = "",
  }: { ratings?: unknown[]; interviews?: unknown[]; tab?: string } = {}
) {
  // Both gates open: rating a manager buys the manager numbers, rating a workplace buys the
  // workplace ones, and the lists are behind the workplace gate.
  const user = { ...MOCK_USER, hasContributed: true, hasRatedCompany: true, hasRatedInterview: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);

  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  // Registered last, so these win over the catch-all above.
  await page.route("**/api/companies/*/ratings*", (r: any) =>
    r.fulfill({ json: { data: ratings } }));
  await page.route("**/api/companies/*/interviews/list*", (r: any) =>
    r.fulfill({ json: { data: interviews, gated: false } }));

  await page.goto(`/companies/red-hat${tab}`);
}

test.describe("The workplace ratings behind the average", () => {
  test("every rating that makes up the average is listed, with its own score", async ({ page }) => {
    await open(page, { tab: "?tab=company" });

    await expect(page.getByRole("heading", { name: /Opinions on Red Hat/i }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("CoolLynx30")).toBeVisible();
    await expect(page.getByText("QuietOtter77")).toBeVisible();
    await expect(page.getByText("4.8")).toBeVisible();
    await expect(page.getByText("1.6")).toBeVisible();
  });

  test("a rating nobody signed still renders, as an anonymous employee", async ({ page }) => {
    // The alternative is a card that throws on a null handle, taking the whole list with it.
    await open(page, { tab: "?tab=company" });

    await expect(page.getByText("Anonymous employee")).toBeVisible({ timeout: 10_000 });
  });

  test("tenure reads as a fact rather than a missing field", async ({ page }) => {
    await open(page, { tab: "?tab=company" });

    await expect(page.getByText("Current employee").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Former employee")).toBeVisible();
    // Still there, said as "Present" rather than left as an empty half of a range.
    await expect(page.getByText(/Mar 2019\s+–\s+Present/)).toBeVisible();
    await expect(page.getByText(/Jan 2016\s+–\s+Sep 2018/)).toBeVisible();
  });

  test("an edited rating says so, rather than passing as untouched", async ({ page }) => {
    await open(page, { tab: "?tab=company" });

    await expect(page.getByText(/^edited .* ago$/)).toBeVisible({ timeout: 10_000 });
  });

  test("the breakdown opens and closes", async ({ page }) => {
    await open(page, { tab: "?tab=company" });

    const toggle = page.getByRole("button", { name: "Show rating breakdown" }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();

    await expect(page.getByText("Workload sustainability").first()).toBeVisible();
    await page.getByRole("button", { name: "Hide breakdown" }).first().click();
    await expect(page.getByRole("button", { name: "Show rating breakdown" }).first()).toBeVisible();
  });

  test("the reader's chosen sort is the order they get", async ({ page }) => {
    /*
      Sorting is the one piece of logic in this component, and it ran unexercised. Asserting the
      first card rather than that the option exists is what makes this a test of the sort - the
      select could be wired to nothing and still satisfy a visibility check.
    */
    await open(page, { tab: "?tab=company" });

    const sort = page.getByLabel("Sort by").first();
    await expect(sort).toBeVisible({ timeout: 10_000 });

    const firstScore = () =>
      page.locator("h2:has-text('Opinions on Red Hat')")
        .locator("xpath=../..").locator(".rounded-xl").first();

    await sort.selectOption("highest");
    await expect(firstScore()).toContainText("4.8");

    await sort.selectOption("lowest");
    await expect(firstScore()).toContainText("1.6");

    // Most recent is two days old; the 1.6 is forty.
    await sort.selectOption("recent");
    await expect(firstScore()).toContainText("4.8");
  });

  test("a company nobody has rated shows no list at all", async ({ page }) => {
    // Not an empty panel with a heading over nothing - the summary above already says it.
    await open(page, { ratings: [], tab: "?tab=company" });

    await expect(page.getByRole("tab", { name: "Company" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Opinions on Red Hat/i })).toHaveCount(0);
  });
});

test.describe("The interview experiences behind the average", () => {
  test("each experience is listed with its outcome, rounds and length", async ({ page }) => {
    await open(page, { tab: "?tab=hiring" });

    await expect(page.getByRole("heading", { name: /Opinions on interviews at Red Hat/i }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Software Engineer · 2025")).toBeVisible();
    await expect(page.getByText(/Received an offer/)).toBeVisible();
    await expect(page.getByText(/4 rounds/)).toBeVisible();
    await expect(page.getByText(/1 round\b/)).toBeVisible();
  });

  test("the stored enum is printed in the words the form used", async ({ page }) => {
    // The value is "2_4_weeks". Printing it raw put database vocabulary on the page.
    await open(page, { tab: "?tab=hiring" });

    await expect(page.getByText(/Opinions on interviews/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/2_4_weeks/)).toHaveCount(0);
    await expect(page.getByText(/weeks/i).first()).toBeVisible();
  });

  test("an experience nobody signed still renders", async ({ page }) => {
    await open(page, { tab: "?tab=hiring" });

    await expect(page.getByText("BraveHeron12")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Product Manager · 2024")).toBeVisible();
  });

  test("the breakdown opens only on experiences that have one", async ({ page }) => {
    /*
      The second fixture has null categories. A component that offered the toggle anyway would
      open an empty panel, which is worse than not offering it.
    */
    await open(page, { tab: "?tab=hiring" });

    const toggles = page.getByRole("button", { name: "Show rating breakdown" });
    await expect(toggles).toHaveCount(1, { timeout: 10_000 });

    await toggles.first().click();
    await expect(page.getByText("Respect for your time")).toBeVisible();
    await page.getByRole("button", { name: "Hide breakdown" }).click();
    await expect(page.getByText("Respect for your time")).toHaveCount(0);
  });

  test("the reader's chosen sort is the order they get", async ({ page }) => {
    await open(page, { tab: "?tab=hiring" });

    const sort = page.getByLabel("Sort by").first();
    await expect(sort).toBeVisible({ timeout: 10_000 });

    const firstCard = () =>
      page.locator("h2:has-text('Opinions on interviews at Red Hat')")
        .locator("xpath=../..").locator(".rounded-xl").first();

    await sort.selectOption("lowest");
    await expect(firstCard()).toContainText("Product Manager");

    await sort.selectOption("highest");
    await expect(firstCard()).toContainText("Software Engineer");
  });

  test("a company nobody has interviewed at shows no list at all", async ({ page }) => {
    await open(page, { interviews: [], tab: "?tab=hiring" });

    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Opinions on interviews/i })).toHaveCount(0);
  });
});
