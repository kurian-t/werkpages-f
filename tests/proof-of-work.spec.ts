import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The screen somebody reaches after rating a well-known figure.
 *
 * What is worth pinning here is mostly about honesty. The rating was saved before this page
 * loaded, and the page has to say so first - "one more step" reads very differently when you fear
 * the last two minutes are gone. Nothing on the page publishes anything, and it must not imply
 * otherwise.
 */

const CHALLENGE = {
  id: "11111111-2222-3333-4444-555555555555",
  managerId: 7,
  reason: "high_profile",
  status: "open",
  emailDomain: null,
  submittedAt: null,
};

async function mock(page: any, challenge: any = CHALLENGE) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
  await page.route("**/api/managers/7/proof-challenge", (r: any) =>
    r.fulfill({ json: { challenge } }));
  await page.goto("/managers/7/confirm?name=Satya%20Nadella&company=Microsoft");
}

test.describe("Confirming a rating of a well-known figure", () => {
  test("it says the rating is already saved before it asks for anything", async ({ page }) => {
    // The single most important line on the page. Somebody who thinks their work is gone will
    // not fill in a form to get it back.
    await mock(page);
    await expect(page.getByText(/Your rating for Satya Nadella is saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("it explains why it is asking, by name", async ({ page }) => {
    await mock(page);
    await expect(page.getByText(/Because this is a high-profile manager/)).toBeVisible({ timeout: 10_000 });
  });

  test("the evidence it asks for is checkable, not an essay", async ({ page }) => {
    // Dates, title and reporting line are the load-bearing fields: cheap for an honest person to
    // answer, expensive to fabricate consistently, and gradeable against career history we hold.
    await mock(page);
    await expect(page.getByText("What was your working relationship?")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("When did you work together?")).toBeVisible();
    await expect(page.getByText("What was your role?")).toBeVisible();
    await expect(page.getByLabel("Start month")).toBeVisible();
  });

  test("it keeps the promise that the claim is never published", async ({ page }) => {
    // Moved from the top of the form to the foot of it. As an opener it read as a warning about
    // something the reader had not been asked for yet; beside the box they just typed into, it
    // reads as the reassurance it is.
    await mock(page);
    await expect(page.getByText("This information is never published.")).toBeVisible({ timeout: 10_000 });
  });

  test("there is a relationship option for people who were never on the org chart", async ({ page }) => {
    // Contractors, secondees, long joint projects. Forcing them to pick the nearest wrong answer
    // hides the very thing that explains the overlap.
    await mock(page);
    await expect(page.getByText("Something else")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("They were above my direct manager")).toBeVisible();
  });

  test("a month chosen before a year is kept, not thrown away", async ({ page }) => {
    // The regression. Both copies of this control derived their state from the combined
    // "YYYY-MM" value and emitted "" whenever either half was missing, so choosing a month first
    // discarded it and the select snapped back to "Month". You could only fill the field in by
    // choosing the year first, and nothing on screen said so.
    await mock(page);
    await page.getByLabel("Start month").selectOption("03");
    await expect(page.getByLabel("Start month")).toHaveValue("03");

    await page.getByLabel("Start year").selectOption({ index: 2 });
    await expect(page.getByLabel("Start month")).toHaveValue("03", { timeout: 5_000 });
  });

  test("submitting with nothing filled in is refused, on the page", async ({ page }) => {
    await mock(page);
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByText("Add the role you held at the time")).toBeVisible();
    await expect(page.getByText("Pick the option that fits best")).toBeVisible();
  });

  test("there is no way to publish it yourself", async ({ page }) => {
    // No withdraw, no skip, no dismiss. Any action an author can take alone to lift their own
    // flag is a laundering step: challenge a famous name, clear it, then submit the junk you
    // actually wanted.
    await mock(page);
    await expect(page.getByText(/Your rating for Satya Nadella is saved/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /withdraw/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
  });

  test("the work-email option is absent until there is a domain to check", async ({ page }) => {
    // A disabled control that never explains itself is worse than no control. It appears when the
    // challenge carries a domain, which happens once a mail provider exists.
    await mock(page);
    await expect(page.getByText(/Confirm you worked at/)).toHaveCount(0);

    await mock(page, { ...CHALLENGE, emailDomain: "microsoft.com" });
    await expect(page.getByText(/Confirm you worked at Microsoft/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/@microsoft.com/)).toBeVisible();
  });

  test("once submitted it says a person is reading it, and does not offer the form again", async ({ page }) => {
    await mock(page, { ...CHALLENGE, status: "admin_review", submittedAt: "2026-09-04T10:00:00Z" });
    await expect(page.getByText("Someone is reviewing this")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toHaveCount(0);
  });

  test("a hold a person must decide shows an explanation, not a form", async ({ page }) => {
    await mock(page, { ...CHALLENGE, reason: "flagged_user", status: "open" });
    await expect(page.getByText(/nothing you need to do/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Submit for verification" })).toHaveCount(0);
  });

  test("no outstanding challenge is an answer, not an error", async ({ page }) => {
    // The page is reachable by URL and asked on every visit, so "nothing is being asked of you"
    // has to render as a sentence rather than a crash or an empty form.
    await mock(page, null);
    await expect(page.getByText("Nothing to confirm")).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * The author's own view of a rating that is being held.
 *
 * Their held rating IS returned to them by the reviews endpoint, deliberately - withholding it
 * from the person who wrote it would leave them no way to know it exists. But that means it
 * renders exactly like a published one unless the page says otherwise, and "saved" and
 * "published" are the two things a person most needs to be able to tell apart here.
 */
test.describe("A held rating, seen by its author", () => {
  const MANAGER_ID = 4242;

  const HELD_REVIEW = {
    id: "99999999-8888-7777-6666-555555555555",
    managerId: MANAGER_ID,
    author: "Anon",
    overallRating: 4.5,
    ratings: {},
    managerCompany: "Microsoft",
    managerTitle: "CEO",
    text: "",
    verified: true,
    helpfulCount: 0,
    createdAt: "2026-09-04T10:00:00Z",
    updatedAt: "2026-09-04T10:00:00Z",
    workedFrom: null,
    workedUntil: null,
    disposition: "held",
  };

  async function mockProfile(page: any, challenge: any) {
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
    await page.route(`**/api/managers/${MANAGER_ID}/proof-challenge`, (r: any) =>
      r.fulfill({ json: { challenge } }));
    await page.route(`**/api/managers/${MANAGER_ID}`, (r: any) => r.fulfill({
      json: {
        id: MANAGER_ID, name: "Satya Nadella", company: "Microsoft", title: "CEO",
        overallRating: null, reviewsCount: 0, approvalStatus: "approved",
        categoryAverages: {}, companySlug: "microsoft",
      },
    }));
    // The author's own held rating comes back to them carrying its disposition, which is what
    // the banner reads. No extra request for anyone who has nothing held.
    await page.route(`**/api/managers/${MANAGER_ID}/reviews**`, (r: any) =>
      r.fulfill({ json: { data: challenge ? [HELD_REVIEW] : [], total: challenge ? 1 : 0 } }));
    await page.route("**/api/managers/**/pending-edits", (r: any) => r.fulfill({ json: { data: [] } }));
    await page.goto(`/manager/${MANAGER_ID}`);
  }

  test("the profile says the rating is saved but not published", async ({ page }) => {
    await mockProfile(page, {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      managerId: MANAGER_ID, reason: "high_profile", status: "open",
      emailDomain: null, submittedAt: null,
    });
    await expect(page.getByText("Your rating is saved but not published yet."))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toBeVisible();
  });

  test("once evidence is in, it says a person is reading it and stops asking", async ({ page }) => {
    await mockProfile(page, {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      managerId: MANAGER_ID, reason: "high_profile", status: "admin_review",
      emailDomain: null, submittedAt: "2026-09-04T10:00:00Z",
    });
    await expect(page.getByText(/being verified/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toHaveCount(0);
  });

  test("a hold a person must decide offers no verify link", async ({ page }) => {
    /*
     * The exact contradiction this fixes: the profile said "not published yet, help us verify"
     * and the page it linked to said there was nothing to verify. A rating held because its
     * author has proof outstanding elsewhere is decided by a person - there is nothing to submit,
     * so there must be nothing to click.
     */
    await mockProfile(page, {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      managerId: MANAGER_ID, reason: "flagged_user", status: "open",
      emailDomain: null, submittedAt: null,
    });
    await expect(page.getByText(/waiting on a review by our team/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Help us verify it" })).toHaveCount(0);
  });

  test("the link never appears before we know there is anything behind it", async ({ page }) => {
    // The optional-chaining trap: `challenge?.status !== "admin_review"` is true when the
    // challenge is undefined, so the link used to render while the answer was still unknown.
    await mockProfile(page, null);
    await expect(page.getByRole("link", { name: "Help us verify it" })).toHaveCount(0);
  });

  test("somebody with nothing held sees no notice at all", async ({ page }) => {
    // The banner must not appear for the ordinary case, which is nearly everyone.
    await mockProfile(page, null);
    await expect(page.getByRole("heading", { name: "Satya Nadella", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not published yet/)).toHaveCount(0);
  });
});
