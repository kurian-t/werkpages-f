/**
 * The order the career trajectory draws employments in.
 *
 * <h2>The report</h2>
 *
 * "The merge tool does not move over other workplaces. The merge should not be forced to have a
 * date and if there is no date, it should assume the profile without the date for the job is older
 * than the job with the rating which has a date. That way we don't lose career history."
 *
 * The merge does move them: ManagerMergeService.moveRoles moves every employment, and
 * twoUnknownPeriodRolesAreNotTreatedAsTheSameEmployment pins that an undated one arrives on the
 * survivor. What went wrong is what happened once it arrived.
 *
 * An employment row has dates when a rating supplied them, so an undated row is one nobody rated.
 * The trajectory is drawn oldest first and sent a null start date to the BACK of that list, which
 * is the NEWEST position - so every workplace a merge brought across was drawn as the person's
 * most recent job, ahead of the dated job it actually preceded.
 *
 * <h2>Why mocked, when there is also a live spec</h2>
 *
 * The trajectory is contribution-gated. An anonymous visitor gets "Rate a manager to unlock the
 * performance trajectory" and no tiles at all, so the live spec cannot reach them and asserts on
 * the API instead. Here hasContributed can simply be true.
 */
import { test, expect, Page } from "./base";
import { TEST_MANAGER_ID, TEST_MANAGER_SLUG, MOCK_MANAGER } from "./fixtures";

const DATED_ROLE   = { company: "Amazon",       title: "Director of Engineering" };
const UNDATED_ROLE = { company: "Zeta Freight", title: "Depot Supervisor" };

/**
 * One employment somebody rated, and one nobody did.
 *
 * Ordered newest-first with the undated row last, which is exactly what the backend's
 * `ORDER BY start_date DESC NULLS LAST` produces. The page must not simply trust this order: it
 * draws oldest-first, so it has to invert it and decide where the undated row belongs.
 */
const MANAGER = {
  ...MOCK_MANAGER,
  careerHistory: [
    { company: DATED_ROLE.company, title: DATED_ROLE.title,
      startDate: "2020-01-01T00:00:00Z", endDate: null,
      periodKnown: true, employmentStatus: "ongoing" },
    { company: UNDATED_ROLE.company, title: UNDATED_ROLE.title,
      startDate: null, endDate: null,
      periodKnown: false, employmentStatus: "unknown" },
  ],
};

/** The rated employment, which is why it is the one with dates. */
const SEGMENTS = [{
  company: DATED_ROLE.company,
  role: DATED_ROLE.title,
  startDate: "2020-01",
  endDate: null,
  isCurrent: true,
  averageRating: 3.4,
  reviewCount: 2,
  categoryAverages: {},
}];

async function openProfile(page: Page) {
  const user = { id: "test-user-1", username: "testuser", role: "user",
                 isBanned: false, hasContributed: true };
  await page.route("**/api/auth/me", r => r.fulfill({ json: user }));
  await page.addInitScript(u => { localStorage.setItem("authUser", JSON.stringify(u)); }, user);
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`),
    r => r.fulfill({ json: MANAGER }));
  await page.route(new RegExp(`/api/managers/by-slug/${TEST_MANAGER_SLUG}`),
    r => r.fulfill({ json: MANAGER }));
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
    r => r.fulfill({ json: { data: [] } }));
  await page.route(`**/api/managers/${TEST_MANAGER_ID}/career-segments`,
    r => r.fulfill({ json: { data: SEGMENTS } }));
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`),
    r => r.fulfill({ json: { data: [] } }));

  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

/** The role names the trajectory renders, in the order the DOM has them. */
async function renderedOrder(page: Page): Promise<string[]> {
  return page.evaluate(([a, b]) => {
    const seen: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if (el.children.length > 0) continue;          // leaves only, so a wrapper counts once
      const t = (el.textContent ?? "").trim();
      for (const role of [a, b]) {
        if (t.includes(role) && !seen.includes(role)) seen.push(role);
      }
    }
    return seen;
  }, [UNDATED_ROLE.title, DATED_ROLE.title]);
}

test.describe("Where an undated employment is drawn", () => {
  test("THE REPORTED BUG: a job with no dates is drawn before the dated one", async ({ page }) => {
    await openProfile(page);
    /*
      BOTH TILES PRESENT BEFORE THE ORDER IS READ.

      renderedOrder walks the DOM once and returns what is there, which makes it a snapshot rather
      than an assertion that waits. openProfile only waits for the "Career Performance Trajectory"
      heading, and the heading paints before the tiles inside it - so under the load of a full
      suite run this read an empty page and reported Array [] against the two expected roles. It
      passed in isolation, which is exactly how a race hides.
    */
    await expect(page.getByText(UNDATED_ROLE.title).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(DATED_ROLE.title).first()).toBeVisible({ timeout: 15_000 });

    expect(await renderedOrder(page)).toEqual([UNDATED_ROLE.title, DATED_ROLE.title]);
  });

  test("both employments are drawn, so nothing is lost", async ({ page }) => {
    // The other half of the report: "That way we don't lose career history."
    await openProfile(page);

    await expect(page.getByText(UNDATED_ROLE.title).first()).toBeVisible();
    await expect(page.getByText(DATED_ROLE.title).first()).toBeVisible();
  });

  test("the undated employer appears, not only the rated one", async ({ page }) => {
    await openProfile(page);

    await expect(page.getByText(UNDATED_ROLE.company).first()).toBeVisible();
  });
});
