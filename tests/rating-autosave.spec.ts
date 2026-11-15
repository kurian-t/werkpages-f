/* ROUTINE CI: data integrity: a contribution in flight is not lost. Tagged @ci; see playwright.config.ts. */
import { test, expect, Page } from "./base";
import { MOCK_COMPANY_PROFILE, MOCK_USER, TEST_COMPANY_SLUG, answerLocation } from "./fixtures";
import { scopedDraftKey } from "../client/lib/draftScope";

/**
 * Answers survive leaving the form, without anybody pressing Submit.
 *
 * <h2>Why these exist as browser tests</h2>
 *
 * <p>A backend test can prove the endpoint stores what it is sent. It cannot prove that closing
 * the tab, navigating away or pressing the X actually sends anything, and that is the entire
 * claim being made here. The lifecycle is the feature.
 *
 * <h2>What is asserted, and what is deliberately not</h2>
 *
 * <p>These watch the REQUESTS the page makes, not the database. Whether the row is correct is
 * settled by CapturedDraftPublicationIntegrationTest against a real schema; duplicating that here
 * through a mock would prove only that the mock agrees with itself.
 *
 * <p>Nothing here claims a final keystroke survives an abrupt browser kill. It does not, no
 * design can promise it, and the debounce is what limits the loss to a few seconds.
 */

async function mockCompanyProfile(page: Page, opts: { loggedIn?: boolean } = {}) {
  const { loggedIn = false } = opts;
  await page.route("**/api/auth/me", (route) =>
    loggedIn ? route.fulfill({ json: { ...MOCK_USER, hasContributed: false } })
             : route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.route(/\/api\/companies\/by-slug/, (r) => r.fulfill({ json: MOCK_COMPANY_PROFILE }));
  await page.route(/\/api\/companies\/by-name/, (r) => r.fulfill({ json: MOCK_COMPANY_PROFILE }));
  await page.route("**/api/companies/suggest**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/notifications**", (r) => r.fulfill({ json: { data: [] } }));
  await page.route(/\/api\/geo/, (r) => r.fulfill({ json: { country: "Canada", state: "Ontario", city: "Toronto" } }));
}

/**
 * Every autosave the page sends, in order, with its parsed body.
 *
 * <h2>OBSERVED, not intercepted, and that distinction is a bug this file used to have</h2>
 *
 * <p>This counted inside the page.route handler, which couples two unrelated jobs: answering the
 * request, and recording that it happened. A sendBeacon fired during pagehide breaks that
 * coupling. The browser issues the request and Playwright observes it, but the route handler's
 * context is being torn down with the page, so interception is a race the test loses perhaps one
 * time in ten, and far more often under parallel load: twenty repeats on twenty workers gave six
 * failures.
 *
 * <p>It was diagnosed from the failing run's own trace, whose network log contained
 * {@code POST .../rating/autosave} while the recorder had seen nothing. So the page HAD sent the
 * answers and the test had missed them.
 *
 * <p>page.on("request") fires for the request itself, synchronously, with no dependence on the
 * interception completing. The route stays, because the page still needs an answer rather than a
 * real server, but it no longer decides what the test knows.
 *
 * <p>WHAT THIS STILL DOES NOT ESTABLISH: that the server received or stored anything. It records
 * what the browser sent. Persistence is settled by CapturedDraftPublicationIntegrationTest
 * against a real schema, and a real-network delivery test is still outstanding.
 */
function recordAutosaves(page: Page) {
  const seen: any[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().includes("/rating/autosave")) return;
    // postDataBuffer covers the beacon, which sends a Blob rather than a string body.
    const raw = req.postData() ?? req.postDataBuffer()?.toString("utf8") ?? "{}";
    try { seen.push(JSON.parse(raw)); } catch { seen.push({ unparseable: raw }); }
  });
  page.route("**/rating/autosave", (route) => route.fulfill({ json: { saved: true } }));
  return seen;
}

/** Answers n category rows on the workplace form. */
async function rate(page: Page, n: number) {
  const fives = page.getByRole("button", { name: /: 5 stars$/ });
  const total = await fives.count();
  for (let i = 0; i < Math.min(n, total); i++) await fives.nth(i).click();
}

test.describe("partial answers are kept without pressing Submit @ci", () => {
  test("answering a category sends an autosave, with no Submit anywhere", async ({ page }) => {
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    // The location is required on this step; without it Next does nothing and the walk-through
    // silently stops one step short of the ratings it is supposed to be answering.
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    await rate(page, 2);

    // The debounce is 3s; poll rather than sleep so a faster machine is not punished.
    await expect.poll(() => saves.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = saves[saves.length - 1];
    expect(last.draftToken, "a stable token is what makes repeated saves one row").toBeTruthy();
    expect(last.revision, "ordering, so a delayed save cannot overwrite newer answers").toBeTruthy();
    expect(Object.keys(last.ratings ?? {}).length).toBeGreaterThan(0);
  });

  test("an untouched form sends nothing at all", async ({ page }) => {
    /*
      The floor, from the browser's side. Opening a page is not participation, and a row saying
      otherwise would be counted as one in any statistic built on this data.
    */
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(5000);

    expect(saves, "nothing answered, so nothing to keep").toHaveLength(0);
  });

  test("every autosave carries the SAME token, so one form is one draft", async ({ page }) => {
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    // The location is required on this step; without it Next does nothing and the walk-through
    // silently stops one step short of the ratings it is supposed to be answering.
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    await rate(page, 2);
    await expect.poll(() => saves.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await rate(page, 5);
    await expect.poll(() => saves.length, { timeout: 15_000 }).toBeGreaterThan(1);

    const tokens = new Set(saves.map((s) => s.draftToken));
    expect(tokens.size, "one session, one token, however many saves").toBe(1);
    /*
      Revisions must be strictly increasing. The server keeps the highest, so a flat or
      decreasing sequence would let a contributor's earlier answers beat their later ones.
    */
    const revs = saves.map((s) => s.revision);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
  });

  test("navigating away flushes what has not been sent yet", async ({ page }) => {
    /*
      The X, internal navigation and the Back button all unmount the form without firing
      pagehide. The flush on unmount is what covers them, and this is the gesture people
      actually make.
    */
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    // The location is required on this step; without it Next does nothing and the walk-through
    // silently stops one step short of the ratings it is supposed to be answering.
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    await rate(page, 3);
    // Leave immediately, inside the debounce window, so only a flush can save this.
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect.poll(() => saves.length, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  /**
   * A save that is ALREADY IN FLIGHT when the page goes away must not take the answers with it.
   *
   * <p>REPRODUCED, not hypothesised. With a server that takes 1200ms and somebody navigating
   * inside that window, the browser reported the save as
   * {@code sent=1 finished=0 failed=1 POST net::ERR_ABORTED} - it left and never arrived. The
   * debounce timer had already set the pending payload to null before posting, so the flush on
   * unmount found nothing to send, even though its sendBeacon is the one mechanism built to
   * survive a navigation. A few answered questions went nowhere.
   *
   * <h2>What this asserts, and why not delivery</h2>
   *
   * <p>It asserts that a SECOND attempt is made carrying the answers: before the fix the page
   * made one request and gave up, afterwards it makes one and then flushes the retained payload.
   * That is the difference between discarding somebody's work and handing it to the browser.
   *
   * <p>It deliberately does not assert the beacon ARRIVES. Route interception has to fulfil the
   * request from the test process, and a beacon issued during pagehide races the page's teardown,
   * so both attempts here report ERR_ABORTED however correct the code is. Outliving the page is
   * sendBeacon's contract with the browser rather than anything this code can promise, and
   * whether the endpoint stores what it receives is settled by
   * CapturedDraftPublicationIntegrationTest against a real schema.
   *
   * <p>The other tests in this file record inside the route callback, which fires when a request
   * is MADE, so an aborted request counts as a save and none of them can see this at all. That is
   * the same shape as a tile that is a link to a 404 still being a link.
   */
  test("a save already in flight when the page goes away is not lost", async ({ page }) => {
    // OBSERVED, for the same reason as recordAutosaves: the second attempt here IS the pagehide
    // beacon, which is exactly the request the route handler cannot be relied on to see.
    const payloads: any[] = [];
    page.on("request", (req) => {
      if (req.method() !== "POST" || !req.url().includes("/rating/autosave")) return;
      const raw = req.postData() ?? req.postDataBuffer()?.toString("utf8") ?? "{}";
      try { payloads.push(JSON.parse(raw)); } catch { payloads.push({ unparseable: raw }); }
    });
    let served = 0;
    await page.route("**/rating/autosave", async (route) => {
      // Only the FIRST is slow: that is what opens the window. Holding the flush up too would
      // only be the fixture fighting itself.
      if (served++ === 0) await new Promise(r => setTimeout(r, 1200));
      return route.fulfill({ json: { saved: true } });
    });
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    await rate(page, 3);
    // Past the debounce, so the timer fires and an ordinary request starts...
    await page.waitForTimeout(3300);
    // ...and then leave while it is still in flight.
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect
      .poll(() => payloads.length, { timeout: 15_000 })
      .toBeGreaterThan(1);

    /*
      THE PAYLOAD IS ASSERTED ON WHAT IS READABLE, which is not a softening.

      The first attempt is an ordinary axios POST and its body is always available, so the answers
      and the token are checked there. The second is the pagehide beacon, which sends a Blob:
      Playwright usually exposes that body and occasionally does not, which failed this assertion
      once in seventy runs with draftToken undefined and nothing else wrong. Asserting on a body
      the harness cannot always read would make this test flaky in exactly the way the recorder
      it replaced was.

      So the beacon is asserted by its OCCURRENCE, which is the regression: before the fix the
      pending payload was cleared before posting and no second attempt happened at all. And where
      its body IS readable, the token must match - a flush that invented a new token would queue a
      second row rather than updating the one the first attempt was for.
    */
    const first = payloads[0];
    expect(first?.draftToken, "the first save carried no token").toBeTruthy();
    const answeredFirst = Object.values(first?.ratings ?? {})
      .filter((v) => typeof v === "number" && v > 0).length;
    expect(answeredFirst, "the first save carried no answers").toBeGreaterThan(0);

    const last = payloads[payloads.length - 1];
    if (last?.draftToken) {
      expect(last.draftToken, "the flush minted a new token instead of updating the same row")
        .toBe(first.draftToken);
      const answeredLast = Object.values(last.ratings ?? {})
        .filter((v) => typeof v === "number" && v > 0).length;
      expect(answeredLast, "the flush sent a payload with no answers in it").toBeGreaterThan(0);
    }
  });

  /**
   * Leaving by the X: a CLIENT-SIDE navigation, which is the one case only the unmount flush can
   * save.
   *
   * <h2>Why this test had to exist</h2>
   *
   * <p>Every other test in this file leaves with page.goto, which is a real browser navigation and
   * fires both pagehide and visibilitychange. The three flush triggers are redundant by design -
   * the hook says the lifecycle events are best-effort and neither is guaranteed - so removing any
   * ONE of them left all seven tests green. Removing all three failed two. That proved the
   * guarantee was covered and no individual path was.
   *
   * <p>The gap that left is this gesture. The X calls navigate(), React unmounts the form, and
   * neither lifecycle event fires: the cleanup's flush() is the only thing standing between
   * somebody's answers and nothing. Verified by deleting that one line, which fails this test and
   * nothing else.
   */
  test("leaving by the X, without a page load, still saves the answers", async ({ page }) => {
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    await rate(page, 3);
    // The X, inside the debounce window, so only a flush can have saved this. No page load
    // happens, so pagehide and visibilitychange never fire and the unmount is all there is.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).not.toHaveURL(/\/rate$/);

    await expect.poll(() => saves.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = saves[saves.length - 1];
    expect(last?.draftToken, "the unmount flush sent no token").toBeTruthy();
    const answered = Object.values(last?.ratings ?? {})
      .filter((v) => typeof v === "number" && v > 0).length;
    expect(answered, "the unmount flush sent a payload with no answers").toBeGreaterThan(0);
  });

  test("a reload resumes the answers rather than starting over", async ({ page }) => {
    /*
      The local half, which predates this work and is what makes resume possible at all. Worth
      pinning because the server sync must not have broken it.
    */
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    // The location is required on this step; without it Next does nothing and the walk-through
    // silently stops one step short of the ratings it is supposed to be answering.
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();
    await rate(page, 4);

    await page.reload();

    await expect(page.getByText(/Step 3 of 3/)).toBeVisible({ timeout: 10_000 });
    const filled = await page.getByRole("button", { name: /: 5 stars$/ }).count();
    expect(filled, "the rating step came back, with its controls").toBeGreaterThan(0);
  });

  /**
   * Stars the browser is actually painting amber.
   *
   * <p>Read from computed style, not from a class name. A class named in the markup proves the
   * component decided to ask for a colour, not that the colour reached the screen, and this file
   * is asserting what somebody coming back to the form would SEE.
   */
  async function filledStars(page: Page) {
    return page
      .locator('button[aria-label*="star"] svg')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).fill === "rgb(251, 191, 36)").length);
  }

  test("a reload brings the ANSWERS back, not just the step", async ({ page }) => {
    /*
      The test above pins that the form resumes at step three with its controls. It does not pin
      that the answers came back with it: it counts star buttons that are PRESENT, and an empty
      rating row has all five of them. A restore that reopened the right step and lost every
      answer would pass it.

      This asserts the values. A chosen rating has no number beside it - it is expressed by amber
      stars and by the row dropping its "Required" badge - so both are checked, because they come
      from different branches of the component and a restore that satisfied only one would be a
      restore somebody could see was broken.

      SAME BROWSER ONLY, deliberately. Restoration here is localStorage, read on mount. There is
      no server-side restore: the only endpoint that reads a draft back is admin-only, so the same
      person on another device gets an empty form today. Nothing in this file should be read as
      claiming otherwise.
    */
    await mockCompanyProfile(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();

    const required = page.getByText("Required", { exact: true });
    const rows = await required.count();
    expect(rows, "the rating step should start with every row unanswered").toBeGreaterThanOrEqual(4);

    await rate(page, 4);
    // Hover fills a row too, so step off the last star before counting anything.
    await page.mouse.move(0, 0);

    expect(await filledStars(page), "four rows at five stars").toBe(20);
    await expect(required).toHaveCount(rows - 4);

    await page.reload();

    await expect(page.getByText(/Step 3 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.mouse.move(0, 0);
    await expect
      .poll(() => filledStars(page), {
        timeout: 10_000,
        message: "the answers came back from localStorage, not just the step",
      })
      .toBe(20);
    await expect(page.getByText("Required", { exact: true })).toHaveCount(rows - 4);

    /*
      And the stored draft still holds them.

      This is the half that made the original defect unrecoverable rather than merely annoying.
      The reload did not just fail to show the answers: the form came back empty and then SAVED
      that empty form back over the good draft, so the answers were gone from storage too and no
      second reload could bring them back.
    */
    /*
      The SCOPED key. Local drafts are stored per account now, so an anonymous one lives under the
      "anon" scope; reading the bare key found nothing and this assertion failed while the two
      above it - which check what a person actually sees - still passed. Derived from the shared
      helper rather than spelled out, so it cannot drift from the implementation again.
    */
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
      scopedDraftKey(`rmm_pending_company_rating_${TEST_COMPANY_SLUG}`, null),
    );
    expect(Object.values(stored?.draft?.ratings ?? {}).filter((v) => v === 5), "the stored draft kept the stars")
      .toHaveLength(4);
    expect(stored?.draft?.workedFrom, "and the period, which was lost with them").toBe("2024-03");
  });

  /**
   * ISSUE 32. The capture identity has to survive the round trip to sign-in.
   *
   * <p>V96 guarantees that somebody bounced to sign-in who comes back and submits ends with ONE
   * rating rather than theirs plus the anonymous copy a moderator published while they were away.
   * The authenticated write finds that copy by draft_token and removes it in the same transaction,
   * enforced by company_reviews_draft_token. The whole rule depends on the token reaching the
   * submission.
   *
   * <p>It did not. The token lived in a useRef and was persisted nowhere, so the page load that
   * signing in causes minted a fresh one. Observed before the fix: the capture carried
   * 965d28fd-..., and every request the returning page made for itself carried 2fa9373a-...
   * Consequence: the moderator's publication is not removed, and the same opinion is live twice,
   * once anonymously and once authored. company_reviews_one_per_user_company cannot catch it,
   * because the anonymous row has no user.
   *
   * <p>BossProfile had always persisted its token. This form had not, which is why one half of
   * the product was correct and nobody noticed.
   */
  test("the capture token survives the round trip to sign-in", async ({ page }) => {
    const tokens: string[] = [];
    page.on("request", (req) => {
      if (req.method() !== "POST" || !/\/rating\/(draft|autosave)$/.test(req.url())) return;
      const raw = req.postData() ?? req.postDataBuffer()?.toString("utf8") ?? "{}";
      try {
        const t = JSON.parse(raw).draftToken;
        if (t) tokens.push(t);
      } catch { /* a body we cannot read says nothing about the token */ }
    });
    await mockCompanyProfile(page);
    await page.route("**/rating/draft", (r) => r.fulfill({ json: { captured: true } }));

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();
    // EVERY category: the form will not submit a partial rating, and this test is about what
    // happens at the sign-in wall rather than at validation.
    await rate(page, 99);
    await page.getByRole("checkbox", { name: /I confirm that I have personally worked/ }).check();

    // The sign-in wall: this captures the answers and sends them away.
    await page.getByRole("button", { name: "Submit rating" }).click();
    await page.waitForURL(/\/signin/, { timeout: 10_000 });
    const captured = tokens[tokens.length - 1];
    expect(captured, "nothing was captured, so the round trip proves nothing").toBeTruthy();

    // Back the way returnTo brings them, which is a fresh page load.
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 3 of 3/)).toBeVisible({ timeout: 10_000 });
    /*
      SETTLE, THEN CLEAR, and this is the whole reason the test is shaped this way.

      The flush fired during pagehide is a beacon, and Playwright observes it arriving AFTER the
      navigation completes. It carries the old token because the page that sent it still had it.
      Clearing before that landed made this test pass against the unfixed code: it was reading the
      departing page's request and calling it the returning page's. Waiting lets the beacon land,
      and the clear then discards it, so every token below belongs to the page that came back.
    */
    await page.waitForTimeout(1_500);
    tokens.length = 0;
    // Any further answer makes the page send something of its own, carrying whatever token it now
    // believes in.
    const fours = page.getByRole("button", { name: /: 4 stars$/ });
    if (await fours.count()) await fours.nth(0).click();

    await expect
      .poll(() => tokens.length, { timeout: 10_000, message: "the returning page sent nothing" })
      .toBeGreaterThan(0);
    expect(
      [...new Set(tokens)],
      "the returning page must keep the captured form's identity, or the publication it made " +
      "cannot be superseded and the same opinion goes live twice",
    ).toEqual([captured]);
  });

  test("a signed-in contributor autosaves nothing", async ({ page }) => {
    /*
      They are about to submit a real rating. Keeping a partial copy of it would put the same
      opinion in two places and serve no purpose the submission does not already serve.
    */
    const saves = recordAutosaves(page);
    await mockCompanyProfile(page, { loggedIn: true });
    await page.addInitScript((u) => localStorage.setItem("authUser", JSON.stringify(u)),
      { ...MOCK_USER, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    // The location is required on this step; without it Next does nothing and the walk-through
    // silently stops one step short of the ratings it is supposed to be answering.
    await answerLocation(page);
    await page.getByRole("button", { name: "Next" }).click();
    await rate(page, 3);
    await page.waitForTimeout(5000);

    expect(saves, "an account holder's answers go to the rating, not to a draft").toHaveLength(0);
  });
});
