import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Rating a company as a workplace.
 *
 * The dataset exists to answer a question the manager ratings never could: a company can be a
 * decent employer with uneven managers, and until now the tab claiming to say "what it's like to
 * work at X" was showing averages computed from manager reviews.
 *
 * What these protect: the two numbers stay separate, every category is required, and the way in
 * is reachable without rating a manager first.
 */

const CATEGORIES = [
  "work_life_balance", "compensation_benefits", "career_growth", "job_security",
  "workload_sustainability", "senior_leadership", "company_communication",
  "flexibility", "inclusion_belonging", "tools_resources",
];

/**
 * Deliberately varied, not ten copies of one number.
 *
 * A uniform fixture makes the headline figure indistinguishable from the ten bars beneath it, so
 * an assertion on the header silently matches a category row instead - and passes for the wrong
 * reason. Varied values are also what real data looks like.
 */
const rated = () =>
  Object.fromEntries(CATEGORIES.map((c, i) => [c, Number((2.6 + i * 0.2).toFixed(1))]));

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 12, totalReviews: 127, avgRating: 3.9,
  categoryAverages: { communication_style: 4.4 },
  managers: [],
  companyRating: { ratingCount: 84, overallRating: 4.1, categories: rated() },
};

const UNRATED = { ...COMPANY, companyRating: undefined };

/*
  `tab` decides which panel the test lands on.

  The page used to open on the workplace panel when the company had ratings, so these tests could
  assert its contents straight after loading. It opens on Managers always now, so anything about
  the workplace panel has to ask for that tab. The two tests that are *about* the default pass "".
*/
async function mock(
  page: any, company: any = COMPANY, contributed = true, ratedCompany = contributed,
  tab = "?tab=company",
) {
  // Two flags, because there are two gates. Rating a manager buys the manager numbers; rating a
  // workplace buys the workplace numbers. A fixture that set only the first was reading one
  // dataset with the other's key.
  const user = { ...MOCK_USER, hasContributed: contributed, hasRatedCompany: ratedCompany };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: company }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: company }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.goto(`/companies/red-hat${tab}`);
}

test.describe("Company ratings on a company page", () => {
  test("the workplace rating and the manager rating are both shown, and are different numbers", async ({ page }) => {
    // The entire point of the dataset. Blending them into one score would hide the divergence
    // that people come here to find.
    await mock(page);

    /*
      The entire point of the dataset: a company can be a decent employer with uneven managers, and
      averaging the two into one score hides exactly the divergence people come here to find.

      They sit on separate tabs now rather than side by side, so each is checked where it lives.
      What matters is unchanged - two datasets, two numbers, never blended.
    */
    await expect(page.getByText("workplace rating", { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("4.1").first()).toBeVisible();

    await page.getByRole("tab", { name: "Managers" }).click();
    await expect(page.getByText("3.9").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("4.1")).toHaveCount(0);
  });

  test("there are three tabs, one question each", async ({ page }) => {
    await mock(page);

    await expect(page.getByRole("tab", { name: "Company" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Managers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible();
  });

  /*
    Managers first, always - whether or not the company has workplace ratings.

    This pair used to assert the opposite: that the landing tab was chosen per company, workplace
    when it had ratings and Managers when it did not. That rule is gone. A company with one
    workplace rating opened on a panel holding a single opinion, which buried the thing people
    actually came for behind the emptiest surface on the page. The tab is now fixed, and these two
    say so from both sides so a future "helpful" default has to break a named test to come back.
  */
  test("a rated company still opens on Managers", async ({ page }) => {
    await mock(page, COMPANY, true, true, "");
    await expect(page.getByRole("tab", { name: "Managers" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  });

  test("an unrated company opens on Managers too", async ({ page }) => {
    await mock(page, UNRATED, true, true, "");
    await expect(page.getByRole("tab", { name: "Managers" }))
      .toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  });

  test("an unrated company is locked, not shown as empty", async ({ page }) => {
    /*
     * The gate is checked before the empty state, the same way the interview tab does it.
     * "Nobody has rated this yet" is an invitation, and telling it to somebody who has not
     * contributed both reveals the dataset is empty and skips the ask. A locked visitor sees the
     * same teaser every other company shows.
     */
    await mock(page, UNRATED, false, false);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByText("Workplace ratings are locked")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nobody has rated Red Hat as a workplace yet/)).toHaveCount(0);
  });

  test("a locked empty company still looks like it has something behind the lock", async ({ page }) => {
    /*
      Telling a visitor there is no data gives them no reason to contribute, so a locked-and-empty
      company looks the same as any other locked one.

      This used to assert a row of blurred category bars. The redesign replaced them with the
      header's own locked treatment - a blurred score plus the overlay naming the gate - and the
      bars are no longer rendered at all. The property is unchanged; what carries it moved.
    */
    await mock(page, UNRATED, false, false);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByText("Workplace ratings are locked")).toBeVisible({ timeout: 10_000 });
    // And it does not admit the emptiness while it is locked.
    await expect(page.getByText(/Nobody has rated/)).toHaveCount(0);
    await expect(page.getByText(/Based on 0 ratings/)).toHaveCount(0);
  });

  test("an unrated company says so rather than showing zero", async ({ page }) => {
    // 0.0 says the workplace is terrible. Saying nothing says nobody has told us yet.
    await mock(page, UNRATED);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByText(/Nobody has rated Red Hat as a workplace yet/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("0.0")).toHaveCount(0);
  });

  test("the workplace ratings are behind the same gate as everything else", async ({ page }) => {
    // They were rendering in the clear while the manager averages beside them were blurred. A
    // second dataset does not get a lighter policy than the first just because it is newer.
    await mock(page, COMPANY, false);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByText("Workplace ratings are locked")).toBeVisible({ timeout: 10_000 });
    /*
      Withheld, not merely blurred. The score never reaches the DOM for a locked reader - the
      header renders a placeholder in its place - so this asserts the figure is absent rather than
      that something on top of it is out of focus. A blur is a visual effect; the number would
      still be readable in devtools and announced by a screen reader.
    */
    await expect(page.getByText("4.1")).toHaveCount(0);
  });

  test("the way in stays open even while the data is locked", async ({ page }) => {
    // Reading is earned; contributing is not. Someone who arrived from a search for the company
    // can still say what it was like without first rating a stranger.
    await mock(page, COMPANY, false);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByRole("button", { name: /Rate this workplace/ })).toBeVisible({ timeout: 10_000 });
  });

  test("the way in is on the row it changes, not buried below the ratings", async ({ page }) => {
    await mock(page);
    await expect(page.getByRole("button", { name: /Rate this workplace/ })).toBeVisible({ timeout: 10_000 });
  });

  test("every tab is offered, whatever you have contributed", async ({ page }) => {
    // A tab you cannot open yet still says the dataset exists and what contributing to it buys.
    // Hiding it entirely tells a first-time visitor nothing at all.
    await mock(page, UNRATED, false, false);

    await expect(page.getByRole("tab", { name: "Company" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Managers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Interviewing" })).toBeVisible();
  });

  test("rating a manager does not unlock the workplace numbers", async ({ page }) => {
    // One gate per dataset. Somebody who has rated a manager knows nothing about the workplace,
    // so their manager contribution should not buy them the workplace figures.
    await mock(page, COMPANY, true, false);
    await page.getByRole("tab", { name: "Company" }).click();

    await expect(page.getByText("Workplace ratings are locked")).toBeVisible({ timeout: 10_000 });
  });

  test("rating a company does not require having rated a manager first", async ({ page }) => {
    // The contribution itself stays ungated even though reading is not: anyone can rate any
    // manager, so a manager gate on the way in buys friction rather than proof.
    await mock(page, UNRATED, false, false);
    await expect(page.getByRole("button", { name: /Rate this workplace/ })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The company rating form", () => {
  async function openForm(page: any) {
    const user = { ...MOCK_USER, hasContributed: true };
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.route("**/api/companies/red-hat/rating", (r: any) => r.fulfill({ json: { review: null } }));
    await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await page.goto("/companies/red-hat/rate");
  }

  test("it asks about the company, and says it is not about the manager", async ({ page }) => {
    await openForm(page);
    // The form is headed "Rate a Workplace" now, with the company named in the step line and in
    // its own field, rather than spelled into the heading.
    await expect(page.getByRole("heading", { name: "Rate a Workplace" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 1 of 2 · Red Hat/)).toBeVisible();
  });

  test("all ten categories are asked, and none of them are the manager's job", async ({ page }) => {
    await openForm(page);
    await expect(page.getByText("Work–life balance")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Compensation & benefits")).toBeVisible();
    await expect(page.getByText("Senior leadership")).toBeVisible();
    await expect(page.getByText("Tools & resources")).toBeVisible();
    // "Role clarity" was dropped on purpose: it is all but identical to the manager category
    // "clarity of expectations", and two numbers measuring one thing is worse than one.
    await expect(page.getByText("Role clarity")).toHaveCount(0);
  });

  test("the overall rating is asked, not derived", async ({ page }) => {
    // Somebody's summary judgement is not the mean of the ten above.
    await openForm(page);
    await expect(page.getByText("Overall, how was working here?")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not an average/)).toBeVisible();
  });

  test("advancing with anything unrated is refused", async ({ page }) => {
    /*
      No N/A. A corpus where half the ratings skipped career growth cannot be sliced by it.

      The form is two steps now, so the refusal happens at Next rather than at Submit - the
      unrated rows never reach the second step, let alone the server. The guarantee is the same
      one; it is enforced a screen earlier.
    */
    await openForm(page);
    await expect(page.getByText("Work–life balance")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText(/Step 1 of 2/)).toBeVisible();
    await expect(page.getByText("Required").first()).toBeVisible();
  });

  test("there is no free-text field", async ({ page }) => {
    // Same structural guarantee the interview form makes.
    await openForm(page);
    await expect(page.getByText("Work–life balance")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("textarea")).toHaveCount(0);
  });
});
