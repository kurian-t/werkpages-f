import { test, expect } from "./base";

/**
 * Sharing an interview experience, both steps of it.
 *
 * The existing spec covers choosing a company, which is step one's first field. Everything after
 * it ran unexercised: the rest of the process step, the whole ratings step, the per-step
 * validation, the jump back to step one when a field down there is the problem, and the four
 * different submit failures.
 *
 * The rule none of these bend: an interview review never brings a company into existence. The
 * field selects, it does not create.
 */

const USER = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", hasContributed: true };

const COMPANY = { id: 7, name: "Red Hat", slug: "red-hat", logoUrl: null, industrySlug: "software" };

const CATEGORY_LABELS = [
  "Communication", "Respect for your time", "Clarity about the role",
  "Fairness of the process", "Transparency about next steps", "Role relevance",
];

type Options = {
  /** Status the write answers with; 200 accepts. */
  status?: number;
  /** The API's own message, for the cases where it says something specific. */
  code?: string;
  signedIn?: boolean;
};

async function openForm(page: any, { status = 200, code, signedIn = true }: Options = {}) {
  if (signedIn) {
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), USER);
  }
  // Catch-alls first: Playwright matches in reverse registration order.
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) =>
    signedIn ? r.fulfill({ json: USER }) : r.fulfill({ status: 401, json: {} }));
  await page.route("**/api/geo", (r: any) =>
    r.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [COMPANY] }));
  await page.route("**/api/companies/*/interviews", (r: any) =>
    r.request().method() === "POST"
      ? r.fulfill({ status, json: status === 200 ? { success: true } : { message: code ?? "nope" } })
      : r.fulfill({ json: { data: [] } }));

  await page.goto("/companies/red-hat/add-interview");
}

/** Answers every question the process step asks. */
async function fillProcess(page: any) {
  await page.getByRole("button", { name: "Received an offer" }).click();
  await page.getByRole("button", { name: "Average", exact: true }).click();  // difficulty
  /*
    The date is a month-and-year period now - "interviewedFrom" - not a bare year, matching the
    other two contribution forms. Both halves have to be set: the pair only reports a value once
    it has both, and interviewYear is derived from it on the server.
  */
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption("2025");
  await page.getByLabel("Role").fill("Engineering Manager");
  await page.getByLabel("How long did it take?").selectOption("2_4_weeks");
}

/** Answers every question the ratings step asks, including the attestation that gates submit. */
async function fillRatings(page: any, stars = 4) {
  for (const label of CATEGORY_LABELS) {
    await page.getByRole("button", { name: `${label}: ${stars} stars` }).click();
  }
  await page.getByRole("button", { name: `Overall: ${stars} stars` }).click();
  /*
    The first-hand-experience attestation. It is the one thing on this step that has to be a
    deliberate act, and it holds "Share experience" disabled until it is - the same gate the
    manager review and workplace rating forms carry.
  */
  await page.locator('input[name="attestation"]').check();
}

test.describe("Sharing an interview experience", () => {
  test("the form opens on the process step, naming the company", async ({ page }) => {
    await openForm(page);

    await expect(page.getByText(/Step 1 of 2/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("How did it end?")).toBeVisible();
    await expect(page.getByText("How difficult was it?")).toBeVisible();
  });

  test("the outcome is always asked, because it changes how the rest reads", async ({ page }) => {
    // An interview rated 2 by somebody who got an offer and by somebody who did not are different
    // claims, so the split is never derived or assumed.
    await openForm(page);

    for (const label of ["Received an offer", "No offer", "Withdrew", "Still in process"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible({ timeout: 10_000 });
    }
  });

  test("an incomplete process step cannot advance", async ({ page }) => {
    /*
      Gated on every field being answered, not just the ones the API demands. It costs the
      contributor more effort and buys comparability: a corpus where half the experiences skipped
      difficulty cannot be sliced by difficulty.
    */
    await openForm(page);

    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled({ timeout: 10_000 });

    await fillProcess(page);
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("a complete process step reaches the ratings", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);

    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { name: "Rate an Interview" })).toBeVisible();
    await expect(page.getByText(/Step 2 of 2/)).toBeVisible();
  });

  test("the country is inferred and shown rather than asked", async ({ page }) => {
    // Nothing inferred means nothing settled, so the picker stands alone - but when geo answered,
    // it is a fact already on the screen, not another question.
    await openForm(page);

    await expect(page.getByText("Canada").first()).toBeVisible({ timeout: 10_000 });
  });

  test("every part of a process is rated, with no N/A", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();

    for (const label of CATEGORY_LABELS) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Overall", { exact: true })).toBeVisible();
  });

  test("Back returns to the process step with the answers still there", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/Step 2 of 2/)).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByText(/Step 1 of 2/)).toBeVisible();
    await expect(page.getByLabel("From year")).toHaveValue("2025");
    /*
      Role is a collapsible field: once answered it shows as a card naming the role rather than as
      an open box, so read it as text. The answer surviving the round trip is the point either way.
    */
    await expect(page.getByTestId("interview-role-value")).toHaveText("Engineering Manager");
  });

  test("an unrated category cannot submit", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/Step 2 of 2/)).toBeVisible();

    // Same gate as step one: a half-answered experience is never storable.
    await expect(page.getByRole("button", { name: "Share experience" })).toBeDisabled();
    await fillRatings(page);
    await expect(page.getByRole("button", { name: "Share experience" })).toBeEnabled();
  });

  test("a complete experience submits with its author handle", async ({ page }) => {
    await openForm(page);
    let posted: any = null;
    // Registered after openForm so this is the route that answers.
    await page.route("**/api/companies/*/interviews", (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { data: [] } });
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillRatings(page, 4);
    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(page).toHaveURL(/tab=hiring/, { timeout: 10_000 });
    expect(posted?.outcome).toBe("offer");
    // The period is what the form asks for and what the server derives interviewYear from.
    expect(posted?.interviewedFrom).toBe("2025-03");
    // V65 gave interview experiences a handle, so a company with five of them no longer renders
    // as one unattributed voice repeated.
    expect(typeof posted?.author).toBe("string");
    expect(posted.author.length).toBeGreaterThan(0);
  });

  test("the identity is generated here and can be rerolled", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();

    const shown = page.locator("text=Your experience will appear as:").locator("xpath=..");
    const before = await shown.innerText();
    await page.getByRole("button", { name: "Regenerate" }).click();

    await expect(async () => expect(await shown.innerText()).not.toBe(before)).toPass();
  });

  test("a second experience in the same year is refused in the API's own words", async ({ page }) => {
    /*
      One per person per company per year. The server owns that rule, and the form has to relay
      what it said rather than flatten it to "something went wrong" - somebody who already posted
      needs to know that is why, not retype it.
    */
    await openForm(page, { status: 409, code: "duplicate_interview" });
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillRatings(page);

    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 2 of 2/)).toBeVisible();
  });

  test("a server fault keeps the answers on the page", async ({ page }) => {
    await openForm(page, { status: 500 });
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillRatings(page);

    await page.getByRole("button", { name: "Share experience" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 2 of 2/)).toBeVisible();
  });

  test("somebody signed out fills the form and is asked to sign in at submit", async ({ page }) => {
    /*
      CHANGED DELIBERATELY. This used to assert a sign-in wall in place of the form.

      Every contribution form on this site lets a logged-out person fill it in and asks for an
      account at submit, capturing the draft on the way - nobody signs up for a form they have not
      seen, and a wall captures nothing, so it loses the record that somebody wanted to contribute
      at all. This form was the one exception; it is not any more.

      The experience is still tied to an account, which is what makes the one-per-year rule
      holdable. That check happens on the write, not at the door.
    */
    let captured: any = null;
    await openForm(page, { signedIn: false });
    await page.route("**/api/companies/*/interviews/draft", (r: any) => {
      captured = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    // The whole form is available without an account.
    await fillProcess(page);
    await page.getByRole("button", { name: "Next" }).click();
    await fillRatings(page);
    await page.locator('input[name="attestation"]').check();

    await page.getByRole("button", { name: "Share experience" }).click();

    // The answers are kept before they are sent away to sign in, not thrown on the floor.
    await expect.poll(() => captured, { timeout: 10_000 }).not.toBeNull();
    await expect(page).toHaveURL(/\/signin\?returnTo=/, { timeout: 10_000 });
  });

  test("Cancel leaves without storing anything", async ({ page }) => {
    await openForm(page);
    await fillProcess(page);

    // exact: the collapsible fields each offer a "Cancel editing <field>" control too.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(page).toHaveURL(/\/companies\/red-hat/, { timeout: 10_000 });
  });
});
