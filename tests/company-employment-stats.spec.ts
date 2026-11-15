import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The text a visitor can actually read.
 *
 * <p>`innerText` rather than the DOM, deliberately. The header's "Based on N opinions across M
 * managers" sentence is rendered with a `hidden` attribute - kept in the markup on purpose, with
 * the figures still correct, but not displayed - so asserting its visibility fails and asserting
 * its presence proves nothing a visitor experiences. These assertions are about the numbers on the
 * screen.
 */
async function visibleText(page: any): Promise<string> {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
}

/** The company page with one company's profile served for every company route. */
async function mockCompany(page: any, company: any, contributed = true) {
  const user = { ...MOCK_USER, hasContributed: contributed, hasRatedCompany: contributed };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: company }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: company }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
}

/*
  THE COMPANY PROFILE'S "MANAGER OPINIONS" SECTION DESCRIBES EXPERIENCES AT THIS EMPLOYER.

  Its own subtitle says "What people experienced reporting to managers at <company>", and until
  Phase 5 it answered that with AFFILIATION figures: the sum of the cached counts of whoever is
  currently linked to the company. So when a manager changed employer their ratings went with
  them, out of the section describing the company they were earned at and into one describing a
  company where those experiences never happened.

  Bob received ten ratings at Adobe and then joined MSN. Adobe keeps all ten. MSN inherits none.
  The directory can still show Bob at both, because "who works here" is a different question and
  its answer did not change - which is why both sets of numbers exist on this page and why they
  are allowed to differ.

  The API fields come from V101's projection (employment_reviews, employment_avg_rating,
  employment_manager_count) and from company_employment_category_averages, which draws the
  breakdown from the SAME population so the footnote's "N opinions across M managers" describes
  one set of ratings.
*/

const COMPANY = {
  id: 1,
  name: "Adobe",
  slug: "adobe",
  industry: "Software",
  industrySlug: "software",
  // AFFILIATION: Bob has left, so nobody is linked here any more.
  managerCount: 0,
  totalReviews: 0,
  avgRating: null,
  categoryAverages: {},
  // EMPLOYMENT: the ten ratings people gave about working under Bob AT Adobe stayed.
  employmentReviews: 10,
  employmentAvgRating: 4.0,
  employmentManagerCount: 1,
  // All ten, as a real response carries: the header only draws its Strongest and Weakest
  // highlights, and the footnote that ties the two counts together, when it has a breakdown to
  // rank.
  employmentCategoryAverages: {
    "Communication Style": 4.2,
    "Perceived Approachability": 4.1,
    "Perceived Clarity of Expectations": 3.8,
    "Feedback Style": 3.1,
    "Perceived Supportiveness": 4.0,
    "Decision Making Style": 3.9,
    "Organization and Planning Style": 3.7,
    "Delegation Style": 3.4,
    "Perceived Professional Demeanor": 4.3,
    "Overall Working Experience": 4.0,
  },
  managers: [],
};

test.describe("company profile: Manager opinions uses employment-attributed figures", () => {

  test("a departed manager's ratings stay with the employer they were earned at",
    async ({ page }) => {
    await mockCompany(page, COMPANY);
    await page.goto("/companies/adobe");

    await expect(page.getByRole("heading", { name: /manager opinions/i }))
      .toBeVisible({ timeout: 15_000 });
    const text = await visibleText(page);

    /*
      Both figures come from the employment population, and NO manager is affiliated with Adobe
      any more: affiliation says 0 managers and 0 reviews. So every number in this section being
      non-zero is the whole point.
    */
    expect(text, "the employment rating count is shown, not the affiliation one").toMatch(/10 review/i);
    expect(text, "the managers these opinions are about").toMatch(/1 manager\b/i);
    expect(text, "the employment average").toContain("4.0");
  });

  test("a company nobody has rated still reads as zero, not as a fallback", async ({ page }) => {
    /*
      The fallback for an older response keys on the fields being ABSENT, not on them being zero.
      A real zero is "nobody has rated working here" and has to survive, or every unrated company
      would quietly display its affiliation figures instead.
    */
    await mockCompany(page, {
      ...COMPANY,
      managerCount: 4, totalReviews: 12, avgRating: 3.9,
      employmentReviews: 0, employmentAvgRating: null, employmentManagerCount: 0,
      employmentCategoryAverages: {},
    });
    await page.goto("/companies/adobe");

    /*
      Nothing to rank, so there is no highlights footnote at all - which is correct for a company
      with no attributed ratings. What matters is the thing that must NOT happen: the affiliation
      figures standing in for the employment ones.
    */
    await expect(page.getByRole("heading", { name: /manager opinions/i }))
      .toBeVisible({ timeout: 15_000 });
    const text = await visibleText(page);
    expect(text, "a real zero must not be replaced by the affiliation figure")
      .not.toMatch(/12 review/i);
    expect(text).not.toMatch(/4 manager/i);
    // The section's own words for an empty employment population, which is what it already says
    // for an unrated company: "0 managers - No reviews yet". Zero is communicated, not hidden.
    expect(text, "zero is the answer, and the section says so").toMatch(/no reviews yet/i);
    expect(text).toMatch(/0 managers/i);
  });

  test("a response with no employment fields falls back rather than showing nothing",
    async ({ page }) => {
    /*
      The window between deploying a frontend and applying V101. The ordering rule says the
      migration lands first, and this is what keeps the page honest if it does not: the section
      shows the affiliation figures it always showed, rather than reporting zero opinions about a
      company that has plenty.
    */
    const legacy: any = {
      ...COMPANY, managerCount: 3, totalReviews: 7, avgRating: 3.5,
      // The affiliation breakdown is what an older response carries, and what the section falls
      // back to ranking.
      categoryAverages: COMPANY.employmentCategoryAverages,
    };
    delete legacy.employmentReviews;
    delete legacy.employmentAvgRating;
    delete legacy.employmentManagerCount;
    delete legacy.employmentCategoryAverages;

    await mockCompany(page, legacy);
    await page.goto("/companies/adobe");

    await expect(page.getByRole("heading", { name: /manager opinions/i }))
      .toBeVisible({ timeout: 15_000 });
    const text = await visibleText(page);
    expect(text, "the affiliation count stands in when the new fields are absent")
      .toMatch(/7 review/i);
    expect(text).toMatch(/3 manager/i);
  });
});
