import { test, expect } from "./base";
import {
  MOCK_USER, MOCK_MANAGER, TEST_COMPANY_SLUG, TEST_MANAGER_SLUG, mockManagerPage,
  clickWriteAReview, advanceToDatesStep, fillDatesAndAdvance, rateAllFiveStars,
  attestFirstHandExperience,
} from "./fixtures";

/**
 * What happens after a contribution lands.
 *
 * Every contribution used to end in a toast and a dead end: a workplace rating navigated back to
 * the company, a manager rating closed its modal. That throws away the one moment when somebody
 * has demonstrably just done the thing we want more of - signed in, company in mind, ten
 * questions already answered. Taking the average contributor from one answer to two doubles the
 * corpus with no extra traffic, which is the only growth lever here that does not depend on
 * Google.
 *
 * The company is always carried into the next step. A flow that sends somebody back to a search
 * box for the employer they just described loses most of them there.
 */

/*
  categoryAverages is NOT optional padding. CompanyProfile does Object.entries() on it unguarded,
  so a payload without it throws and the page renders the error boundary instead - which is what
  happened the moment these tests started following the rating onto the company page rather than
  only asserting its URL.
*/
const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 0, totalReviews: 0, avgRating: null, managers: [], categoryAverages: {},
  companyRating: null,
};

async function openForm(page: any) {
  const user = { ...MOCK_USER, hasContributed: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/companies/red-hat/rating", (r: any) => {
    if (r.request().method() === "POST") return r.fulfill({ json: { id: "r1", overallRating: 4 } });
    return r.fulfill({ json: { review: null } });
  });
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.goto("/companies/red-hat/rate");
}

/** Through the three steps and submitted, with every category answered. */
async function submitRating(page: any) {
  await expect(page.getByText(/Step 1 of 3 · Red Hat/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption({ index: 3 });
  await page.getByRole("checkbox", { name: /current/i }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/Step 3 of 3 · Red Hat/)).toBeVisible();

  // Every category, because the form refuses a half-answered submission by design.
  const stars = page.getByRole("button", { name: /: 4 stars$/ });
  const n = await stars.count();
  for (let i = 0; i < n; i++) await stars.nth(i).click();
  await page.locator('input[name="attestation"]').check();
  await page.getByRole("button", { name: /submit rating|update rating/i }).click();

  /*
    The rating lands on the company's own page, on the tab that SHOWS it, and the offer is made
    there. It used to be a modal on the form itself, which asked somebody to choose between two
    further contributions while the one they had just written was hidden behind the question.
  */
  await expect(page).toHaveURL(/\?tab=company$/, { timeout: 10_000 });
}

test.describe("After a workplace rating", () => {
  test("the flow does not end - it asks for the other half of the contribution", async ({ page }) => {
    await openForm(page);
    await submitRating(page);

    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your workplace rating was submitted")).toBeVisible();
    await expect(page.getByText("Worked with a manager at Red Hat?")).toBeVisible();
  });

  test("the offer names the company, so nobody is asked to find it again", async ({ page }) => {
    await openForm(page);
    await submitRating(page);

    await expect(page.getByTestId("next-step-primary")).toHaveText(/Rate a manager at Red Hat/);
  });

  test("taking it opens the add-manager form, not a search box", async ({ page }) => {
    /*
      The form, not the Managers tab.

      It used to flip to that tab, which is a dead end in the common case: somebody who has just
      rated a workplace is often rating a company with no managers listed, so the offer led to an
      empty tab. The form is where both halves happen - the manager is added and rated in one
      submission.
    */
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/\/add\?/, { timeout: 10_000 });
  });

  test("the form opens with the company already filled in", async ({ page }) => {
    /*
      The whole point of asking here rather than later: the employer is already known, so nobody is
      sent to a blank company box for the company they just spent ten questions describing. Every
      step that asks for it again is a step most people leave at.
    */
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/company=Red\+Hat|company=Red%20Hat/, { timeout: 10_000 });
    /*
      And it is actually in the field, not merely in the URL. Scoped to the company field rather
      than the page: the company name appears in several places on this form, so a bare text match
      would pass even if the field itself were empty.

      Asserted as text, not as an input value - the shared company control collapses to a card
      showing the name once it HAS one, which is the whole point of it being prefilled.
    */
    await expect(page.getByTestId("company-field")).toContainText("Red Hat", { timeout: 10_000 });
  });

  test("Next is enabled without touching the prefilled company", async ({ page }) => {
    /*
      The bug this exists for. Step 1 validates the SELECTED company, not the text in the box, and
      arriving with ?company= filled only the text. So Next stayed greyed out until the reader
      opened the company field and edited it - having been sent there precisely so they would not
      have to retype the employer they just rated.
    */
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();
    await expect(page).toHaveURL(/\/add\?/, { timeout: 10_000 });

    // Everything else step 1 asks for, and nothing touching the company.
    await page.getByLabel(/first name/i).fill("Dana");
    await page.getByLabel(/last name/i).fill("Scully");
    await page.getByLabel(/title/i).first().fill("Engineering Manager");

    await expect(page.getByRole("button", { name: /^next$/i }).first()).toBeEnabled({ timeout: 10_000 });
  });

  test("the prefilled company carries its id, so no second row is minted", async ({ page }) => {
    /*
      Without the id the write resolves the company by name again, which is how a duplicate row
      for a company that already exists appears. The id is in the URL and seeded into the
      selection, so the submission points at the row the reader was just looking at.
    */
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/companyId=1\b/, { timeout: 10_000 });
  });

  test("cancelling the form returns to the rating that was just written", async ({ page }) => {
    // returnTo carries the company tab, where the new workplace rating is shown - not the
    // Managers tab, which is not what they were looking at.
    await openForm(page);
    await submitRating(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/returnTo=[^&]*tab%3Dcompany/, { timeout: 10_000 });
  });

  test("declining still finishes the submission", async ({ page }) => {
    /*
      The rating is already saved by the time this is asked - the offer is never a condition of
      the contribution, and "Not now" must never read as cancelling what was just submitted.

      This is also the regression test for the toast collision, and the only one that catches it.
      Sonner's toaster is bottom-right too and ships z-index: 999999999, so while the card was at
      z-50 the success toast sat on top of it and its container ate the clicks - Playwright
      reported "subtree intercepts pointer events" and the dismiss click timed out. It reproduces
      HERE and nowhere else because this is a real submission, so a success toast is actually on
      screen; the cases that open the card from a stored flag have no toast and passed throughout.
      It failed on Mobile Chrome only, where both elements are effectively full width - which is
      the viewport most readers use.
    */
    await openForm(page);
    await submitRating(page);

    /*
      Wait for the toast to be ON SCREEN before clicking, so the overlap is exercised every run.

      Without this the test was only accidentally a regression test: the toast auto-dismisses, so
      a fast run clicked after it had gone and passed, and the bug surfaced only under a loaded
      full suite. A regression test that depends on losing a race is one that gets re-run instead
      of read.
    */
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("next-step-dismiss").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(page).toHaveURL(/\/companies\/red-hat(\?|$)/, { timeout: 10_000 });
  });

  test("it can be dismissed with the close control too", async ({ page }) => {
    await openForm(page);
    await submitRating(page);
    // Scoped to the dialog: the rating form has its own close control behind it.
    await page.getByTestId("contribution-next-step")
      .getByRole("button", { name: "Close" }).click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
  });
});

test.describe("After a manager rating", () => {
  /*
    The other direction, and the more valuable one: workplace ratings are the thinner dataset, and
    somebody who has just answered ten questions about a manager has exactly the experience a
    workplace rating asks for.
  */
  async function submitManagerReview(page: any) {
    await page.route("**/api/auth/me", (r: any) =>
      r.fulfill({ json: { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true } }));
    await mockManagerPage(page, { manager: MOCK_MANAGER, loggedIn: true });
    await page.addInitScript(() => localStorage.setItem("authUser", JSON.stringify(
      { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true })));

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });

    await clickWriteAReview(page);
    await advanceToDatesStep(page);
    await fillDatesAndAdvance(page, { fromMonth: "03", fromYear: "2024" });
    await rateAllFiveStars(page);
    await attestFirstHandExperience(page);
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await expect(page.getByText(/your review of alex johnson is live/i))
      .toBeVisible({ timeout: 10_000 });
  }

  test("the flow does not end at the toast", async ({ page }) => {
    await submitManagerReview(page);

    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your rating was submitted anonymously")).toBeVisible();
    await expect(page.getByText("Want to share a little more?")).toBeVisible();
  });

  test("it names the employer they just rated a manager at", async ({ page }) => {
    // The whole point of asking here rather than later: we already know the company, so they are
    // never sent to a search box for it.
    await submitManagerReview(page);
    await expect(page.getByText(/You also worked at Acme Corp/)).toBeVisible();
  });

  test("rating the workplace is the primary offer", async ({ page }) => {
    /*
      Ordered deliberately. Workplace ratings are the far thinner dataset, so the scarcer
      contribution is the one put in front of them; rating another manager is offered second
      rather than hidden, because people who stayed somewhere had more than one.
    */
    await submitManagerReview(page);
    await expect(page.getByTestId("next-step-primary")).toHaveText(/Rate Acme Corp/);
    await expect(page.getByTestId("next-step-secondary")).toHaveText(/Rate another Acme Corp manager/);
  });

  test("taking it opens that company's rating form, carrying a way back", async ({ page }) => {
    await submitManagerReview(page);
    await page.getByTestId("next-step-primary").click();

    await expect(page).toHaveURL(/\/companies\/acme-corp\/rate/, { timeout: 10_000 });
    // returnTo, so finishing the workplace rating lands back on the manager they started from
    // rather than dumping them on a company page they did not ask for.
    await expect(page).toHaveURL(/returnTo=/);
  });

  test("the second offer goes to that company, scoped, not to a blank search", async ({ page }) => {
    await submitManagerReview(page);
    await page.getByTestId("next-step-secondary").click();

    await expect(page).toHaveURL(/\/companies\/acme-corp(\?|$)/, { timeout: 10_000 });
  });

  test("declining leaves them on the profile with the rating saved", async ({ page }) => {
    // The review is already written. Dismissing must not read as undoing it, and must not move
    // them off the page they chose to be on.
    await submitManagerReview(page);
    await page.getByTestId("next-step-dismiss").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(page).toHaveURL(/\/companies\/acme-corp\/managers\/alex-johnson/);
  });
});

test.describe("After adding a manager", () => {
  /*
    The third surface, and the one that was missing entirely.

    Adding a manager is a contribution like the other two, and it used to end in a navigation to
    the new profile and nothing else. The offer cannot live on the form - a successful submission
    navigates away, so a dialog opened there unmounts before it can be read - so the form leaves a
    one-shot session flag and the profile consumes it on arrival.

    These assert the consuming half, which is the half that can silently stop working: the flag is
    set in three separate success branches in AddBoss, and a profile that ignored it would look
    exactly like a submission that simply did not offer anything.
  */
  const JUST_ADDED = "rmm_just_added_manager";

  async function arriveFromAddManager(page: any, opts: { suppressed?: boolean } = {}) {
    const user = { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true };
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await mockManagerPage(page, { manager: MOCK_MANAGER, loggedIn: true });
    await page.addInitScript(
      ([u, k, suppressKey]: [any, string, string | null]) => {
        localStorage.setItem("authUser", JSON.stringify(u));
        sessionStorage.setItem(k, "1");
        if (suppressKey) {
          localStorage.setItem(suppressKey, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
        }
      },
      [user, JUST_ADDED, opts.suppressed ? `wp_company_rate_nudge:${TEST_COMPANY_SLUG}` : null],
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
  }

  test("the new manager's profile asks for the workplace too", async ({ page }) => {
    await arriveFromAddManager(page);

    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Want to share a little more?")).toBeVisible();
    await expect(page.getByTestId("next-step-primary")).toHaveText(/Rate Acme Corp/);
  });

  test("the offer is made once, not on every later visit", async ({ page }) => {
    /*
      The flag is one-shot. Left set, the dialog would reopen on an unrelated profile later in the
      same tab, which is how a useful prompt turns into something people learn to click past.
    */
    await arriveFromAddManager(page);
    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("next-step-dismiss").click();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
  });

  test("somebody who already declined for this company is not asked", async ({ page }) => {
    // Suppression is shared with the after-rating offer, so arriving by a different route is not
    // a way around an answer somebody already gave.
    await arriveFromAddManager(page, { suppressed: true });

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
  });

  test("declining leaves them on the profile they just created", async ({ page }) => {
    await arriveFromAddManager(page);
    await page.getByTestId("next-step-dismiss").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(page).toHaveURL(/\/companies\/acme-corp\/managers\/alex-johnson/);
  });
});

test.describe("The offer does not block the page it is congratulating", () => {
  /*
    This was a centred modal over a dimmed backdrop, which made the offer arrive before the thing
    it congratulates could be seen: somebody who had just rated a manager was asked to choose
    between two further contributions while their own rating sat hidden behind the dialog asking
    about it.

    So it is a corner card. These assert the three properties that stop it being a modal again:
    nothing is dimmed or blocked, it can be tucked away rather than only accepted or refused, and
    tucking it away is not the same as declining.
  */
  async function offerShowing(page: any) {
    const user = { id: "u1", username: "testuser", role: "user", isBanned: false, hasContributed: true };
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await mockManagerPage(page, { manager: MOCK_MANAGER, loggedIn: true });
    await page.addInitScript(
      ([u, k]: [any, string]) => {
        localStorage.setItem("authUser", JSON.stringify(u));
        sessionStorage.setItem(k, "1");
      },
      [user, "rmm_just_added_manager"],
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByTestId("contribution-next-step")).toBeVisible({ timeout: 10_000 });
  }

  test("there is no backdrop over the page", async ({ page }) => {
    // A dimming overlay is what made the previous design a wall. The profile stays readable and
    // clickable while the offer is up.
    await offerShowing(page);

    await expect(page.getByRole("heading", { name: "Alex Johnson", exact: true })).toBeVisible();
    await expect(page.locator("div.fixed.inset-0.bg-black\\/50")).toHaveCount(0);
  });

  test("it can be tucked away to read the page, then brought back", async ({ page }) => {
    await offerShowing(page);

    await page.getByTestId("next-step-minimize").click();

    // Collapsed to a pill: the question is still there, the buttons are not in the way.
    await expect(page.getByTestId("next-step-expand")).toBeVisible();
    await expect(page.getByTestId("next-step-primary")).toHaveCount(0);

    await page.getByTestId("next-step-expand").click();
    await expect(page.getByTestId("next-step-primary")).toBeVisible();
  });

  test("tucking it away is not declining it", async ({ page }) => {
    /*
      The distinction the minimise control exists for. Somebody who wants to read the page first
      has not said no, so minimising must not write the suppression that a dismissal does.
    */
    await offerShowing(page);

    await page.getByTestId("next-step-minimize").click();

    const stored = await page.evaluate(
      (k: string) => localStorage.getItem(k),
      `wp_company_rate_nudge:${TEST_COMPANY_SLUG}`,
    );
    expect(stored).toBeNull();
  });

  test("closing it is declining it, and is remembered", async ({ page }) => {
    await offerShowing(page);

    await page.getByTestId("next-step-close").click();

    await expect(page.getByTestId("contribution-next-step")).toHaveCount(0);
    await expect(async () => {
      const stored = await page.evaluate(
        (k: string) => localStorage.getItem(k),
        `wp_company_rate_nudge:${TEST_COMPANY_SLUG}`,
      );
      expect(stored).toBeTruthy();
    }).toPass({ timeout: 10_000 });
  });
});
