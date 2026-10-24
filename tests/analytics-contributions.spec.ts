import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_USER,
  MOCK_EXISTING_REVIEW,
  mockManagerPage,
  openAndCompleteReview,
  answerLocation,
} from "./fixtures";

/**
 * That the application asks for the right analytics event, once, at the right moment.
 *
 * <h2>What this does and does not prove</h2>
 *
 * <p>It proves the product CALLS tracking correctly: that a save which succeeded reports exactly
 * one event with the right properties, and that a save which failed reports none. That is the half
 * of the question this repository owns.
 *
 * <p>It does <b>not</b> prove anything reached PostHog. posthog-js is imported as a module rather
 * than attached to the page, and it sends nothing at all without a build-time key, so delivery is
 * not observable here and is verified after deployment in PostHog's own live-events view.
 *
 * <h2>Why the probe exists</h2>
 *
 * <p>Without a seam there is no way to see that the product asked for an event. The alternative
 * was reading the code and hoping, which is how a failed save reporting a success would reach
 * production unnoticed - the number would simply be wrong, with nothing to contradict it.
 *
 * <p>The probe is a plain array the test installs on `window` before the app loads. Production
 * never defines it, so there it is a property lookup that finds nothing.
 */

type Captured = { event: string; props?: Record<string, unknown> };

/** Installs the probe before any application code runs, and reads it back. */
async function watchAnalytics(page: any): Promise<() => Promise<Captured[]>> {
  await page.addInitScript(() => {
    (window as unknown as { __ANALYTICS_PROBE__: unknown[] }).__ANALYTICS_PROBE__ = [];
  });
  return async () =>
    page.evaluate(() =>
      (window as unknown as { __ANALYTICS_PROBE__?: Captured[] }).__ANALYTICS_PROBE__ ?? []);
}


/**
 * Rates every category on the workplace form.
 *
 * <p>The manager form's helper does not work here: these buttons are named per category -
 * "Work-life balance: 5 stars" - rather than "Rate 5 stars". Getting it wrong leaves all ten
 * unrated, and the form then refuses to submit, so the symptom is a request that never happens
 * rather than a failing assertion. Worth naming, because that failure mode cost half an hour.
 */
async function rateEveryCompanyCategory(page: any) {
  const fives = page.getByRole("button", { name: /: 5 stars$/ });
  const count = await fives.count();
  expect(count, "no category rating controls were found on the workplace form").toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await fives.nth(i).click();
}

const only = (events: Captured[], name: string) => events.filter((e) => e.event === name);

test.describe("what the product reports when a contribution is saved", () => {

  test("a successful manager rating reports exactly one review_submitted", async ({ page }) => {
    const captured = await watchAnalytics(page);
    await mockManagerPage(page, { loggedIn: true });
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/reviews`, (r: any) =>
      r.fulfill({ json: { data: { id: "r-1", disposition: "live" } } }));

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await openAndCompleteReview(page, { fromMonth: "01", fromYear: "2023" });
    /*
      Waited on the WRITE, not on a message.

      Reading the probe after a confirmation string matched it too early: some of that copy is on
      the page before the request resolves, so the assertion ran while the save was still in
      flight and saw an empty array - a false negative that looks exactly like a missing event.
    */
    const saved = page.waitForResponse((r: any) =>
      r.url().includes(`/api/managers/${TEST_MANAGER_ID}/reviews`) && r.request().method() === "POST");
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await saved;
    await page.waitForTimeout(500);

    const events = only(await captured(), "review_submitted");
    /*
      EXACTLY ONE. A duplicate inflates every number built on it, and React effects firing twice is
      the ordinary way that happens - so the count is asserted, not merely the presence.
    */
    expect(events).toHaveLength(1);
    expect(events[0].props).toMatchObject({ kind: "new" });
    // A held rating is saved but not publicly live; reporting it as published overstates reach.
    expect(["published", "held"]).toContain(events[0].props?.disposition);
  });

  test("a REFUSED manager rating reports nothing", async ({ page }) => {
    /*
      THE ASSERTION THAT MATTERS MOST.

      review_submitted exists to count ratings that were written. A refused save that still
      reported one would overstate contributions permanently and invisibly.
    */
    const captured = await watchAnalytics(page);
    await mockManagerPage(page, { loggedIn: true });
    await page.route(`**/api/managers/${TEST_MANAGER_ID}/reviews`, (r: any) =>
      r.fulfill({ status: 500, json: { error: "refused" } }));

    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await openAndCompleteReview(page, { fromMonth: "01", fromYear: "2023" });
    const refused = page.waitForResponse((r: any) =>
      r.url().includes(`/api/managers/${TEST_MANAGER_ID}/reviews`) && r.request().method() === "POST");
    await page.getByRole("button", { name: /^submit review$/i }).click();
    await refused;                       // the save was genuinely attempted and genuinely refused
    await page.waitForTimeout(1000);

    expect(only(await captured(), "review_submitted")).toHaveLength(0);
  });

  test("a successful company rating reports exactly one company_review_submitted", async ({ page }) => {
    const captured = await watchAnalytics(page);
    const user = { ...MOCK_USER, hasContributed: true };
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    /*
      ORDER MATTERS, and getting it wrong made this test lie.

      Playwright matches routes in REVERSE registration order, so a broad companies glob
      registered after the specific rating route swallows the rating POST and answers 200. The
      success case then passed for the wrong reason and the refusal never happened at all - the
      server was never asked to refuse anything.

      So the broad route is registered FIRST and the specific one last, which is the opposite of
      how it reads.
    */
    await page.route("**/api/companies/**", (r: any) =>
      r.fulfill({ json: { id: 1, name: "Red Hat", slug: "red-hat", managers: [] } }));
    await page.route("**/api/companies/red-hat/rating", (r: any) =>
      r.request().method() === "POST"
        ? r.fulfill({ json: { data: { companySlug: "red-hat", companyName: "Red Hat" } } })
        : r.fulfill({ json: { review: null } }));

    await page.goto("/companies/red-hat/rate");
    await expect(page.getByText(/Step 1 of 3 · Red Hat/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/Step 3 of 3 · Red Hat/)).toBeVisible();

    await rateEveryCompanyCategory(page);
    await page.locator('input[name="attestation"]').check();
    const written = page.waitForResponse((r: any) =>
      r.url().includes("/api/companies/red-hat/rating") && r.request().method() === "POST");
    await page.getByRole("button", { name: /submit rating|update rating/i }).click();
    await written;                       // the write really happened, whatever it answered
    await page.waitForTimeout(800);

    const events = only(await captured(), "company_review_submitted");
    expect(events).toHaveLength(1);
    // A workplace rating has no held/published axis - the server returns no disposition for one.
    expect(events[0].props).toHaveProperty("is_edit");
  });

  test("a REFUSED company rating reports nothing", async ({ page }) => {
    const captured = await watchAnalytics(page);
    const user = { ...MOCK_USER, hasContributed: true };
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await page.route("**/api/companies/**", (r: any) =>
      r.fulfill({ json: { id: 1, name: "Red Hat", slug: "red-hat", managers: [] } }));
    await page.route("**/api/companies/red-hat/rating", (r: any) =>
      r.request().method() === "POST"
        ? r.fulfill({ status: 500, json: { error: "refused" } })
        : r.fulfill({ json: { review: null } }));

    await page.goto("/companies/red-hat/rate");
    await expect(page.getByText(/Step 1 of 3 · Red Hat/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();
    await rateEveryCompanyCategory(page);
    await page.locator('input[name="attestation"]').check();
    const written = page.waitForResponse((r: any) =>
      r.url().includes("/api/companies/red-hat/rating") && r.request().method() === "POST");
    await page.getByRole("button", { name: /submit rating|update rating/i }).click();
    const response = await written;
    expect(response.status(), "the write was not actually refused, so this proves nothing")
      .toBeGreaterThanOrEqual(400);
    await page.waitForTimeout(800);

    expect(only(await captured(), "company_review_submitted")).toHaveLength(0);
  });

  /*
    NOT COVERED HERE: that an edit reports kind: "edit".

    The editor opens behind a menu on a profile that already has a rating, and three attempts to
    drive it from this fixture left the form unopened. Rather than ship a test that skips - which
    reads as coverage and is not - the gap is written down. The property is set at
    BossProfile's edit-save path and is currently verified by reading it, not by executing it.
  */
});
