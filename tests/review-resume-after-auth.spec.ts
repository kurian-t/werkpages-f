import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
} from "./fixtures";

/**
 * Coming back to a review that was interrupted by signing in.
 *
 * Writing a review does not require an account until the moment of submitting, so the most common
 * path through this form ends with the person being sent away to authenticate. Whatever they had
 * typed has to survive that round trip - a social OAuth redirect leaves and re-enters the page, so
 * the draft lives in localStorage and is picked back up on load.
 *
 * This is the highest-stakes state in the product: ten ratings, a date range and an attestation,
 * all of it two minutes of work, held in a browser key across a redirect. None of it was covered.
 *
 * The subtle part is what happens *after* the draft is restored. The form cannot simply fire the
 * submission - the rules that were unknowable while logged out (have they hit the five-review
 * limit? have they already reviewed this exact role?) only become checkable once their existing
 * reviews have loaded. So the submit waits, then either goes through or surfaces the conflict.
 */

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };

const FULL_RATINGS = {
  "Communication Style": 4, "Perceived Approachability": 4,
  "Perceived Clarity of Expectations": 4, "Feedback Style": 4,
  "Perceived Supportiveness": 4, "Decision Making Style": 4,
  "Organization and Planning Style": 4, "Delegation Style": 4,
  "Perceived Professional Demeanor": 4, "Overall Working Experience": 4,
};

/** The draft exactly as the form persists it while open. */
const draft = (over: Record<string, unknown> = {}) => ({
  returnTo: `/manager/${TEST_MANAGER_ID}`,
  managerId: TEST_MANAGER_ID,
  modalRatings: FULL_RATINGS,
  authorType: "anonymous",
  generatedName: "CoolLynx30",
  reviewAttested: true,
  reviewWorkedFrom: { month: "01", year: "2021" },
  reviewWorkedUntil: { month: "12", year: "2022" },
  reviewCurrentlyWorking: false,
  reviewManagerCompany: "Acme Corp",
  reviewManagerTitle: "Engineering Manager",
  savedAt: Date.now(),
  ...over,
});

async function returnFromAuth(
  page: any,
  { pending = draft(), existing = [] as unknown[] } = {},
) {
  await page.addInitScript(
    ([u, d]: [unknown, unknown]) => {
      localStorage.setItem("authUser", JSON.stringify(u));
      localStorage.setItem("rmm_pending_review", JSON.stringify(d));
    },
    [CONTRIBUTOR, pending],
  );
  await mockManagerPage(page, {
    loggedIn: true, user: CONTRIBUTOR, existingUserReviews: existing as any,
  });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
}

test.describe("Returning from sign-in with a review in progress", () => {
  test("the ratings that were typed are still there", async ({ page }) => {
    /*
      The whole point of persisting the draft. Losing ten ratings to a redirect the product itself
      required is the single most effective way to ensure somebody never contributes again.
    */
    let posted: any = null;
    await returnFromAuth(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() !== "POST") return r.fulfill({ json: { data: [], total: 0 } });
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 201, json: { ...MOCK_EXISTING_REVIEW, disposition: "live" } });
    });

    await expect(async () => expect(posted).not.toBeNull()).toPass({ timeout: 15_000 });
    expect(posted.workedFrom).toBe("2021-01");
    expect(posted.workedUntil).toBe("2022-12");
  });

  test("the draft is cleared once it has been submitted", async ({ page }) => {
    // Otherwise the next visit to any manager page would try to submit it again.
    await returnFromAuth(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) =>
      r.request().method() === "POST"
        ? r.fulfill({ status: 201, json: { ...MOCK_EXISTING_REVIEW, disposition: "live" } })
        : r.fulfill({ json: { data: [], total: 0 } }));

    await expect(page.getByText(/is live/i)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review"))).toBeNull();
  });

  test("somebody at the review limit is told, not silently refused", async ({ page }) => {
    /*
      Checked after their existing reviews load, never before - while signed out there was no way
      to know. Five reviews of one manager is the cap.
    */
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_EXISTING_REVIEW, id: `rv-${i}`, managerTitle: `Role ${i}`,
    }));
    let posted = false;
    await returnFromAuth(page, { existing: five });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() === "POST") posted = true;
      return r.fulfill({ json: { data: five, total: 5 } });
    });

    await expect(page.getByText(/limit of 5 reviews/i)).toBeVisible({ timeout: 15_000 });
    expect(posted).toBe(false);
  });

  test("a review of a role they already covered surfaces the conflict", async ({ page }) => {
    /*
      One review per role. Submitting straight through would hand them a 409 from the server after
      the round trip; catching it here means the conflict is presented on the form they are already
      looking at, with the title available to change.
    */
    let posted = false;
    await returnFromAuth(page, {
      existing: [{
        ...MOCK_EXISTING_REVIEW,
        managerTitle: "Engineering Manager",
        managerCompany: "Acme Corp",
      }],
    });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() === "POST") posted = true;
      return r.fulfill({ json: { data: [MOCK_EXISTING_REVIEW], total: 1 } });
    });

    await expect(page.getByText(/already reviewed|already have|change the title/i).first())
      .toBeVisible({ timeout: 15_000 });
    expect(posted).toBe(false);
  });

  test("a draft for a different manager is not submitted here", async ({ page }) => {
    // The key is global while the draft belongs to one manager. Submitting it on whichever profile
    // happened to load next would file somebody's review against the wrong person.
    let posted = false;
    await returnFromAuth(page, { pending: draft({ managerId: "some-other-manager" }) });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
      if (r.request().method() === "POST") posted = true;
      return r.fulfill({ json: { data: [], total: 0 } });
    });

    await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
      .toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_500);
    expect(posted).toBe(false);
  });

  test("a malformed draft is discarded rather than crashing the page", async ({ page }) => {
    // It is parsed from a browser key anyone can edit, so it is never trusted to be well-formed.
    await page.addInitScript((u: unknown) => {
      localStorage.setItem("authUser", JSON.stringify(u));
      localStorage.setItem("rmm_pending_review", "{ not json at all");
    }, CONTRIBUTOR);
    await mockManagerPage(page, { loggedIn: true, user: CONTRIBUTOR });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
      .toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review"))).toBeNull();
  });
});

/**
 * Replacing the review the conflict was about.
 *
 * The conflict panel is not a dead end. Somebody who has just written a fresh assessment of a
 * manager they reviewed two years ago is not trying to double-vote - they have a newer opinion of
 * the same job - so the way out is to put the new one in place of the old.
 *
 * A dedicated endpoint rather than delete-then-create: the pair would leave the manager with no
 * review of that role if the second call failed, and would trip the deletion cooldown that exists
 * to stop exactly that sequence being used to dodge the daily limit.
 */
test.describe("Replacing a conflicting review", () => {
  const CLASH = {
    ...MOCK_EXISTING_REVIEW,
    id: "rv-clash",
    managerTitle: "Engineering Manager",
    managerCompany: "Acme Corp",
  };

  async function reachConflict(page: any) {
    await returnFromAuth(page, { existing: [CLASH] });
    await expect(page.getByText(/already reviewed this manager/i))
      .toBeVisible({ timeout: 15_000 });
  }

  test("the conflict explains the rule and offers the way through it", async ({ page }) => {
    await reachConflict(page);

    await expect(page.getByText(/one review per role at a company/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Replace my existing review/i })).toBeVisible();
  });

  test("replacing posts the new ratings against the review being replaced", async ({ page }) => {
    let url: string | null = null;
    let body: any = null;
    await reachConflict(page);
    await page.route(/\/reviews\/.*\/replace/, (r: any) => {
      url = r.request().url();
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: /Replace my existing review/i }).click();

    await expect(async () => expect(url).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(url).toContain("/reviews/rv-clash/replace");
    // The overall is the mean of the ten, computed here rather than asked again.
    expect(body.overallRating).toBe(4);
    expect(body.workedFrom).toBe("2021-01");
  });

  test("a successful replace clears the draft and says so", async ({ page }) => {
    await reachConflict(page);
    await page.route(/\/reviews\/.*\/replace/, (r: any) =>
      r.fulfill({ status: 200, json: { success: true } }));

    await page.getByRole("button", { name: /Replace my existing review/i }).click();

    await expect(page.getByText(/replaced successfully/i)).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_review"))).toBeNull();
  });

  test("a failed replace keeps the panel open and says what happened", async ({ page }) => {
    // Closing here would discard the new review and leave the old one standing, with nothing said.
    await reachConflict(page);
    await page.route(/\/reviews\/.*\/replace/, (r: any) =>
      r.fulfill({ status: 500, json: { message: "Could not replace that review" } }));

    await page.getByRole("button", { name: /Replace my existing review/i }).click();

    await expect(page.getByText(/could not replace that review/i)).toBeVisible({ timeout: 10_000 });
  });

  test("the conflict offers editing the existing review as well as replacing it", async ({ page }) => {
    /*
      Three ways out, because they are three different intentions: replace the old assessment with
      this one, go and amend the old one directly, or walk away. Offering only "replace" would
      force a destructive choice on somebody who meant to adjust a detail.
    */
    await reachConflict(page);

    await expect(page.getByRole("button", { name: "Edit my existing review" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Replace my existing review/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("walking away asks first, because the new review is lost either way", async ({ page }) => {
    // Cancel here discards two minutes of work, so it confirms rather than acting immediately.
    await reachConflict(page);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText(/are you sure you want to discard/i)).toBeVisible();
  });
});
