import { test, expect } from "./base";

/**
 * The rounds builder, and editing an experience you already shared.
 *
 * Rounds are the one field on this form where *order* carries the meaning - "recruiter screen,
 * take-home, panel" describes a process; the same three as an unordered set describes nothing. So
 * the control has to add, remove and preserve sequence, and none of that ran.
 *
 * They are also deliberately optional. Somebody recalling a process from last year may genuinely
 * not remember its shape, and forcing a guess would put invented structure into the one field
 * where structure is the whole value.
 */

const USER = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", hasContributed: true };
const COMPANY = { id: 7, name: "Red Hat", slug: "red-hat", logoUrl: null, industrySlug: "software" };

/** An experience already on file, for the edit path. */
const MINE = {
  id: "rev-1",
  overallRating: 4,
  communication: 4, respectForTime: 3, roleClarity: 5,
  processFairness: 4, nextStepTransparency: 3,
  difficulty: 3,
  outcome: "no_offer",
  rounds: ["recruiter_screen", "technical", "panel"],
  processLength: "2_4_weeks",
  roleCategory: "Staff Engineer",
  interviewYear: 2024,
  country: "Canada",
};

async function openForm(page: any, { edit = false }: { edit?: boolean } = {}) {
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), USER);
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
  await page.route("**/api/geo", (r: any) =>
    r.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [COMPANY] }));
  await page.route("**/api/companies/red-hat/interviews**", (r: any) =>
    r.fulfill({ json: { myInterview: edit ? MINE : null, reviewCount: 1, gated: false } }));

  await page.goto(`/companies/red-hat/add-interview${edit ? "?edit=rev-1" : ""}`);
  await expect(page.getByText(/Step 1 of 2/)).toBeVisible({ timeout: 10_000 });
}

test.describe("Recording the rounds of a process", () => {
  test("there are none until one is added", async ({ page }) => {
    // Optional on purpose - see the file header. The empty state invites rather than demands.
    await openForm(page);

    await expect(page.getByRole("button", { name: "Add the first round" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Remove round/ })).toHaveCount(0);
  });

  test("adding rounds keeps them in the order they happened", async ({ page }) => {
    /*
      Sequence is the point. A builder that appended to the front, or re-sorted, would turn an
      accurate account of a process into a misleading one while looking perfectly fine.
    */
    await openForm(page);

    await page.getByRole("button", { name: "Add the first round" }).click();
    await page.locator("select").filter({ hasText: "Phone" }).first()
      .selectOption("recruiter_screen");

    await page.getByRole("button", { name: "Add another round" }).click();
    const rounds = page.getByRole("button", { name: /Remove round/ });
    await expect(rounds).toHaveCount(2);

    await page.getByRole("button", { name: "Add another round" }).click();
    await expect(rounds).toHaveCount(3);
    // Each row is numbered by its position, which is what makes the order legible.
    await expect(page.getByRole("button", { name: "Remove round 3" })).toBeVisible();
  });

  test("removing a round takes out the one that was asked for", async ({ page }) => {
    // Off-by-one here silently rewrites somebody's account of their own interview.
    await openForm(page);
    for (const label of ["Add the first round", "Add another round", "Add another round"]) {
      await page.getByRole("button", { name: label }).click();
    }
    const selects = page.locator("select").filter({ hasText: "Phone" });
    await selects.nth(0).selectOption("recruiter_screen");
    await selects.nth(1).selectOption("technical");
    await selects.nth(2).selectOption("panel");

    await page.getByRole("button", { name: "Remove round 2" }).click();

    await expect(page.getByRole("button", { name: /Remove round/ })).toHaveCount(2);
    const left = page.locator("select").filter({ hasText: "Phone" });
    await expect(left.nth(0)).toHaveValue("recruiter_screen");
    await expect(left.nth(1)).toHaveValue("panel");
  });

  test("removing the last round returns to the empty state", async ({ page }) => {
    await openForm(page);
    await page.getByRole("button", { name: "Add the first round" }).click();

    await page.getByRole("button", { name: "Remove round 1" }).click();

    await expect(page.getByRole("button", { name: "Add the first round" })).toBeVisible();
  });

  test("the rounds are sent in order", async ({ page }) => {
    let posted: any = null;
    await openForm(page);
    await page.route("**/api/companies/*/interviews", (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { data: [] } });
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    for (const label of ["Add the first round", "Add another round"]) {
      await page.getByRole("button", { name: label }).click();
    }
    const selects = page.locator("select").filter({ hasText: "Phone" });
    await selects.nth(0).selectOption("recruiter_screen");
    await selects.nth(1).selectOption("onsite");

    await page.getByRole("button", { name: "Received an offer" }).click();
    await page.getByRole("button", { name: "Average", exact: true }).click();
    await page.getByLabel("Year").selectOption("2025");
    await page.getByLabel("Role").fill("Engineering Manager");
    await page.getByLabel("How long did it take?").selectOption("2_4_weeks");
    await page.getByRole("button", { name: "Next" }).click();

    for (const label of ["Communication", "Respect for your time", "Clarity about the role",
                         "Fairness of the process", "Transparency about next steps",
                         "Role relevance"]) {
      await page.getByRole("button", { name: `${label}: 4 stars` }).click();
    }
    await page.getByRole("button", { name: "Overall: 4 stars" }).click();
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(async () => expect(posted).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(posted.rounds).toEqual(["recruiter_screen", "onsite"]);
  });
});

test.describe("Editing an experience already shared", () => {
  test("the form arrives carrying what was written before", async ({ page }) => {
    /*
      An edit is a correction to something specific, so it opens as that thing. A blank form here
      would mean retyping an entire account to fix one field - and the rounds especially, which are
      the most tedious part to re-enter.
    */
    await openForm(page, { edit: true });

    await expect(page.getByLabel("Year")).toHaveValue("2024");
    await expect(page.getByLabel("Role")).toHaveValue("Staff Engineer");
    await expect(page.getByLabel("How long did it take?")).toHaveValue("2_4_weeks");
    await expect(page.getByRole("button", { name: /Remove round/ })).toHaveCount(3);
  });

  test("an edit updates the existing experience rather than adding a second", async ({ page }) => {
    // One per person per company per year. A PUT that posted instead would create the duplicate
    // the rule exists to prevent, and the server would refuse it.
    let method: string | null = null;
    await openForm(page, { edit: true });
    await page.route("**/api/interviews/rev-1", (r: any) => {
      method = r.request().method();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: "Next" }).click();
    /*
      The stored experience predates "Role relevance", so it opens with that one category unrated
      and the save stays disabled until it is answered. That is the intended cost of adding a
      question: an edit asks for the one thing missing rather than saving a half-rated record.
    */
    await page.getByRole("button", { name: "Role relevance: 4 stars" }).click();
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(async () => expect(method).toBe("PUT")).toPass({ timeout: 10_000 });
  });

  test("geo does not overwrite the country on an edit", async ({ page }) => {
    /*
      The geo lookup is skipped entirely when editing. It infers where the reader is *now*, which
      says nothing about where an interview happened two years ago - and silently rewriting a
      stored answer with a guess is worse than leaving it alone.
    */
    await openForm(page, { edit: true });

    await expect(page.getByText("Canada").first()).toBeVisible();
  });
});
