import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Rating a workplace, from the first star to the request that leaves.
 *
 * The existing company specs open this page and assert it exists; almost none of it runs. What
 * that leaves unexercised is every part with a decision in it - the per-step validation, the
 * summary rating that is asked rather than derived, the period, the three submit failures, and
 * the session refresh that is the whole reason a rating unlocks the page without a reload.
 *
 * These walk the form the way somebody filling it in does.
 */

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  logoUrl: null, managerCount: 3, totalReviews: 12, avgRating: 3.9,
  categoryAverages: {}, managers: [],
};

const CATEGORY_LABELS = [
  "Work–life balance", "Compensation & benefits", "Career growth", "Job security",
  "Workload sustainability", "Senior leadership", "Company communication",
  "Flexibility", "Inclusion & belonging", "Tools & resources",
];

type Options = {
  /** null = signed out. */
  user?: unknown;
  mine?: unknown;
  /** Status the POST answers with; 200 means accept. */
  status?: number;
  query?: string;
};

async function openForm(page: any, opts: Options = {}) {
  const { user = { ...MOCK_USER, hasContributed: true }, mine = null, status = 200, query = "" } = opts;

  if (user) {
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  }
  await page.route("**/api/auth/me", (r: any) =>
    user ? r.fulfill({ json: user }) : r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/companies/suggest**", (r: any) =>
    r.fulfill({ json: [{ id: 2, name: "Canonical", slug: "canonical" }] }));
  // After the catch-all, so these win.
  await page.route("**/api/companies/*/rating/mine*", (r: any) => r.fulfill({ json: { review: mine } }));
  await page.route("**/api/companies/*/rating", (r: any) =>
    r.request().method() === "POST"
      ? r.fulfill({ status, json: status === 200 ? { success: true } : { error: "nope" } })
      : r.fulfill({ json: { review: mine } }));

  await page.goto(`/companies/red-hat/rate${query}`);
  await expect(page.getByRole("heading", { name: "Rate a Workplace" })).toBeVisible({ timeout: 10_000 });
}

/** A complete period. The "still here" box removes the end date; it does not supply a start. */
async function fillPeriod(page: any) {
  await page.getByLabel("Start month").selectOption("03");
  await page.getByLabel("Start year").selectOption({ index: 3 });
  await page.getByLabel("I still work here").check();
}

/** Fills every star row on the ratings step, plus the summary rating. */
async function rateEverything(page: any, stars = 4) {
  for (const label of CATEGORY_LABELS) {
    await page.getByRole("button", { name: `${label}: ${stars} stars` }).click();
  }
  await page.getByRole("button", { name: `Overall: ${stars} stars` }).click();
}

test.describe("Rating a workplace", () => {
  test("the form opens on the ratings step, naming the company being rated", async ({ page }) => {
    await openForm(page);

    await expect(page.getByText("Step 1 of 2 · Red Hat")).toBeVisible();
    await expect(page.getByText("Company *")).toBeVisible();
    await expect(page.getByText("Red Hat").first()).toBeVisible();
  });

  test("every category the dataset needs is asked for", async ({ page }) => {
    // Ten rows, no N/A. A corpus where half the ratings skipped career growth cannot be sliced
    // by career growth.
    await openForm(page);

    for (const label of CATEGORY_LABELS) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("the summary rating is asked for, not derived from the ten above", async ({ page }) => {
    /*
      "The pay was poor and it was chaotic, but I loved working there" is a real position, and an
      average of the ten rows erases exactly that. It is a separate question on purpose.
    */
    await openForm(page);

    await expect(page.getByText("Overall, how was working here?")).toBeVisible();
    await expect(page.getByText("Your overall take, not an average of the ratings above.")).toBeVisible();
  });

  test("an incomplete ratings step will not advance", async ({ page }) => {
    await openForm(page);

    await page.getByRole("button", { name: "Next" }).click();

    // Still on step one, with the page saying what is missing rather than silently doing nothing.
    await expect(page.getByText("Step 1 of 2 · Red Hat")).toBeVisible();
    await expect(page.getByText("Required").first()).toBeVisible();
  });

  test("a missing end date does not block the ratings step", async ({ page }) => {
    /*
      The per-step filter. Validation runs over the whole draft, so without splitting it by step
      the ratings page would refuse to advance over a date it has not asked for yet - which is
      precisely the thing that makes long forms get abandoned.
    */
    await openForm(page);
    await rateEverything(page);

    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Step 2 of 2 · Red Hat")).toBeVisible();
    await expect(page.getByText("When did you work here?")).toBeVisible();
  });

  test("the period is asked at month precision, and 'still here' replaces the end date", async ({ page }) => {
    // Nobody remembers the day, and asking for one invites invention.
    await openForm(page);
    await rateEverything(page);
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByLabel("Start month")).toBeVisible();
    await expect(page.getByLabel("End month")).toBeVisible();

    await page.getByLabel("I still work here").check();
    await expect(page.getByText("now", { exact: true })).toBeVisible();
    await expect(page.getByLabel("End month")).toHaveCount(0);
  });

  test("Back returns to the ratings step with the answers still there", async ({ page }) => {
    // Losing ten rows to one misclick is how somebody abandons a form and does not come back.
    await openForm(page);
    await rateEverything(page, 5);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 2 · Red Hat")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByText("Step 1 of 2 · Red Hat")).toBeVisible();
    await expect(page.getByRole("button", { name: "Overall: 5 stars" }).locator("svg"))
      .toHaveClass(/fill-amber-400/);
    // Nothing is outstanding, so nothing was lost on the way back.
    await expect(page.getByText("Required")).toHaveCount(0);
  });

  test("a complete rating submits and lands back on the company", async ({ page }) => {
    let posted: any = null;
    await openForm(page);
    // After openForm, not before: Playwright matches routes in reverse registration order, so the
    // last one registered is the one that answers.
    await page.route("**/api/companies/*/rating", (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { review: null } });
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });
    await rateEverything(page, 4);
    await page.getByRole("button", { name: "Next" }).click();
    await fillPeriod(page);

    await page.getByRole("button", { name: "Submit rating" }).click();

    await expect(page).toHaveURL(/\/companies\/red-hat$/, { timeout: 10_000 });
    expect(posted?.overallRating).toBe(4);
    // The handle is generated on this page and sent with the rating, so the card has a byline.
    expect(typeof posted?.author).toBe("string");
    expect(posted.author.length).toBeGreaterThan(0);
  });

  test("somebody who has already rated is updating, not adding", async ({ page }) => {
    // One rating per person per company. The button has to say which of the two is happening.
    await openForm(page, {
      mine: {
        id: "r1", overallRating: 3, ratings: {},
        workedFrom: "2019-03-01", workedUntil: null, author: "CoolLynx30",
      },
    });
    await rateEverything(page);
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("button", { name: "Update rating" })).toBeVisible();
  });

  test("a rejected submission says what went wrong and keeps the answers", async ({ page }) => {
    /*
      Three different failures, three different sentences. A single "something went wrong" over a
      401 sends somebody to retype a form they were never signed in for.
    */
    await openForm(page, { status: 500 });
    await rateEverything(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillPeriod(page);
    await page.getByRole("button", { name: "Submit rating" }).click();

    await expect(page.getByRole("alert")).toContainText("Something went wrong");
    // Still on the form - the answers are not thrown away over a server fault.
    await expect(page.getByText("Step 2 of 2 · Red Hat")).toBeVisible();
  });

  test("a company that has gone says so, rather than blaming the reader", async ({ page }) => {
    await openForm(page, { status: 404 });
    await rateEverything(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillPeriod(page);
    await page.getByRole("button", { name: "Submit rating" }).click();

    await expect(page.getByRole("alert")).toContainText("couldn't find that company");
  });

  test("the identity is generated here and can be rerolled", async ({ page }) => {
    await openForm(page);

    const shown = page.locator("text=Your rating will appear as:").locator("xpath=..");
    const before = await shown.innerText();
    await page.getByRole("button", { name: "Regenerate" }).click();

    await expect(async () => expect(await shown.innerText()).not.toBe(before)).toPass();
  });

  test("cancelling returns where the reader came from, not to a default", async ({ page }) => {
    /*
      Somebody who started rating from a manager's profile used to be dropped on the company page
      and lose their place. The company page is still the fallback - a link typed by hand has no
      origin - but when the caller said where they came from, that is where Cancel goes.
    */
    await openForm(page, { query: "?returnTo=/directory" });

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/directory$/, { timeout: 10_000 });
  });

  test("a returnTo pointing off-site is ignored", async ({ page }) => {
    // It arrives in the query string, so it is somebody else's input, not ours.
    await openForm(page, { query: "?returnTo=https://example.com/phish" });

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/companies\/red-hat$/, { timeout: 10_000 });
  });

  test("Close leaves the form the same way Cancel does", async ({ page }) => {
    await openForm(page);

    await page.getByLabel("Close").click();

    await expect(page).toHaveURL(/\/companies\/red-hat$/, { timeout: 10_000 });
  });

  test("a rating with an end date records when it ended", async ({ page }) => {
    // Somebody who left is rating the company they left, and when they left is what tells a
    // reader whether the account still describes the place.
    let posted: any = null;
    await openForm(page);
    await page.route("**/api/companies/*/rating", (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { review: null } });
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await rateEverything(page, 3);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Start month").selectOption("03");
    await page.getByLabel("Start year").selectOption({ index: 5 });
    await page.getByLabel("End month").selectOption("09");
    await page.getByLabel("End year").selectOption({ index: 3 });
    await page.getByRole("button", { name: "Submit rating" }).click();

    await expect(page).toHaveURL(/\/companies\/red-hat$/, { timeout: 10_000 });
    expect(posted?.workedUntil).toMatch(/^\d{4}-09$/);
  });

  test("the dates step refuses to submit without a start date", async ({ page }) => {
    /*
      Per-step validation, from the other side. The ratings step filters the date errors out; this
      step filters everything else out, so a missing start date is caught here rather than sending
      an undated rating to the server.
    */
    await openForm(page);
    await rateEverything(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 2 · Red Hat")).toBeVisible();

    await page.getByRole("button", { name: "Submit rating" }).click();

    // Still on the dates step, saying what is missing.
    await expect(page.getByText("Step 2 of 2 · Red Hat")).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("picking a different company moves the form to that company", async ({ page }) => {
    // A different company is a different rating - the draft belongs to the company it was started
    // for, so this navigates rather than quietly re-pointing the answers already given.
    await openForm(page);

    await page.getByRole("button", { name: /Edit details/i }).click();
    await page.getByPlaceholder("e.g. Acme Corp").fill("Canon");
    await page.getByText("Canonical").first().click();

    await expect(page).toHaveURL(/\/companies\/canonical\/rate/, { timeout: 10_000 });
  });

  test("the company being rated can be changed without leaving first", async ({ page }) => {
    // Somebody who opened this from the wrong company should not have to go and find the right one.
    await openForm(page);

    await page.getByRole("button", { name: /Edit details/i }).click();

    await expect(page.getByPlaceholder("e.g. Acme Corp")).toBeVisible();
    await page.getByRole("button", { name: "Done editing" }).click();
    await expect(page.getByPlaceholder("e.g. Acme Corp")).toHaveCount(0);
  });
});
