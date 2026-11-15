/* ROUTINE CI: data integrity: unfinished work is kept. Tagged @ci; see playwright.config.ts. */
import { test, expect, Page } from "./base";
import {
  MOCK_COMPANY_PROFILE, MOCK_USER, TEST_COMPANY_SLUG, answerLocation, mockAccountSettingsPage,
} from "./fixtures";

/**
 * A SIGNED-IN contributor's unfinished rating: private, resumable, and never another account's.
 *
 * <h2>What these defend, and why it is not the anonymous capture</h2>
 *
 * <p>The anonymous path is unchanged and tested elsewhere: somebody with no account who abandons
 * a form has it captured for moderation, because that is what the capture exists for. This is the
 * other half. A signed-in person's half-finished rating is PRIVATE, is saved to their account so
 * they can resume it on another device, and must never be shown or submitted under somebody
 * else's name on a shared browser.
 *
 * <p>Three failure modes are worth more than the rest, and each has a test of its own:
 *
 * <ul>
 *   <li>a save that commits while the page is going away, whose acknowledgement is therefore
 *       never seen - the retry must be recognised as the SAME write, not reported as a conflict;
 *   <li>signing out, which must forget what the server has and keep what it does not;
 *   <li>another device being ahead, which must ask rather than silently pick a side.
 * </ul>
 */

const DRAFTS = "**/api/users/me/drafts";
const COMPANY_ID = MOCK_COMPANY_PROFILE?.id ?? 1;

/** Every PUT the page makes to the private draft endpoint, with its body. */
function recordDraftWrites(page: Page) {
  const seen: any[] = [];
  page.on("request", (req) => {
    if (req.method() !== "PUT" || !req.url().includes("/api/users/me/drafts")) return;
    const raw = req.postData() ?? req.postDataBuffer()?.toString("utf8") ?? "{}";
    try { seen.push(JSON.parse(raw)); } catch { seen.push({ unparseable: raw }); }
  });
  return seen;
}

/** The account page, plus whatever drafts the test wants it to show. */
async function mockAccountWithDrafts(page: Page, drafts: any[], status = 200) {
  await page.addInitScript(
    (u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  await mockAccountSettingsPage(page);
  await page.route(DRAFTS, (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: { id: "x", version: 1 } });
    return status === 200
      ? route.fulfill({ json: { drafts, retentionDays: 90 } })
      : route.fulfill({ status, json: {} });
  });
}

async function mockPage(page: Page, opts: {
  signedIn?: boolean;
  existingDrafts?: any[];
  /** What PUT answers with. Default: accept and advance the version. */
  put?: (route: any, body: any) => Promise<void> | void;
} = {}) {
  const { signedIn = true, existingDrafts = [], put } = opts;
  let version = 0;

  /*
    The app hydrates the signed-in user from localStorage before /api/auth/me answers, so a test
    that only mocks the endpoint stays anonymous for the first render - and this whole file is
    about the signed-in path. Without this every assertion below passes for the wrong reason.
  */
  if (signedIn) {
    await page.addInitScript(
      (u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_USER);
  }

  await page.route("**/api/auth/me", (r) =>
    signedIn ? r.fulfill({ json: { ...MOCK_USER, hasContributed: false } })
             : r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.route(/\/api\/companies\/by-slug/, (r) => r.fulfill({ json: MOCK_COMPANY_PROFILE }));
  await page.route(/\/api\/companies\/by-name/, (r) => r.fulfill({ json: MOCK_COMPANY_PROFILE }));
  await page.route("**/api/companies/suggest**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/notifications**", (r) => r.fulfill({ json: { data: [] } }));
  await page.route(/\/api\/geo/, (r) => r.fulfill({ json: { country: "Canada", state: "Ontario", city: "Toronto" } }));
  await page.route("**/rating/autosave", (r) => r.fulfill({ json: { saved: true } }));
  await page.route("**/rating/draft", (r) => r.fulfill({ json: { captured: true } }));

  await page.route(DRAFTS, async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({ json: { drafts: existingDrafts, retentionDays: 90 } });
    }
    const body = JSON.parse(req.postData() ?? "{}");
    if (put) return put(route, body);
    version += 1;
    return route.fulfill({ json: { id: "draft-1", version, retentionDays: 90 } });
  });
}

/** Fills the form far enough that there is something worth saving. */
async function answerSomething(page: Page, stars = 4) {
  await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption({ index: 3 });
  await page.getByRole("checkbox", { name: /current/i }).check();
  await answerLocation(page);
  await page.getByRole("button", { name: "Next" }).click();
  const n = page.getByRole("button", { name: new RegExp(`: ${stars} stars$`) });
  const total = await n.count();
  for (let i = 0; i < Math.min(2, total); i++) await n.nth(i).click();
}

test.describe("a signed-in contributor's private draft", () => {

  test("answering saves to the contributor's own account, not the capture queue", async ({ page }) => {
    const writes = recordDraftWrites(page);
    const captures: string[] = [];
    await page.route("**/rating/draft", (r) => { captures.push(r.request().url()); return r.fulfill({ json: {} }); });
    await mockPage(page);

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);
    await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThan(0);

    expect(writes[0].subjectType, "the subject taxonomy the opportunities table uses").toBe("company");
    expect(writes[0].writeId, "every write names itself, or a retry cannot be recognised").toBeTruthy();
    expect(writes[0].payload, "and carries the answers").toBeTruthy();
    expect(captures, "a signed-in person's unfinished rating does not go to moderation").toHaveLength(0);
  });

  test("a retry after an unseen acknowledgement reuses the same writeId", async ({ page }) => {
    /*
      THE CASE THE WHOLE IDEMPOTENCY MECHANISM EXISTS FOR.

      A keepalive save can commit after the page is gone, so its response is never seen. The page
      that comes back must send the SAME writeId: a new one with a stale baseVersion is answered
      409, which would report a cross-device conflict to somebody who has only ever used one
      device and whose answers are already safely stored.

      Which is why writeId is persisted rather than held in a ref - a ref is lost on exactly the
      page load that follows such a save.
    */
    const writes = recordDraftWrites(page);
    await mockPage(page, {
      // Never answer. The write goes out, the client learns nothing.
      put: async (route) => { await route.abort("failed"); },
    });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);
    await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const firstId = writes[0].writeId;
    expect(firstId).toBeTruthy();

    await page.reload();
    await expect(page.getByText(/Step 3 of 3/)).toBeVisible({ timeout: 10_000 });
    const before = writes.length;
    // Touch nothing: the owed write is replayed as it stands.
    await expect.poll(() => writes.length, { timeout: 12_000 }).toBeGreaterThan(before);

    /*
      The FIRST write the returning page makes, not the last. A form settling after a restore can
      legitimately produce a further, different payload - the geo answer arriving, say - and that
      one is a new write by the rule below. What must carry the old id is the replay of the write
      that was owed.
    */
    expect(writes[before].writeId,
      "the same write, so the server answers from its stored version instead of reporting a conflict")
      .toBe(firstId);
  });

  test("a changed answer set gets a NEW writeId", async ({ page }) => {
    /*
      The other half of the same rule, and the reason it cannot simply be "reuse the id for ever":
      a delayed response must never acknowledge answers it did not carry. One id, one payload.
    */
    const writes = recordDraftWrites(page);
    await mockPage(page);

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page, 4);
    await expect.poll(() => writes.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const first = writes[writes.length - 1].writeId;

    const fives = page.getByRole("button", { name: /: 5 stars$/ });
    if (await fives.count()) await fives.nth(0).click();
    await expect.poll(() => writes.length, { timeout: 12_000 }).toBeGreaterThan(1);

    expect(writes[writes.length - 1].writeId,
      "different answers are a different write").not.toBe(first);
  });

  test("a newer draft on another device is OFFERED, never applied", async ({ page }) => {
    await mockPage(page, {
      existingDrafts: [{
        id: "draft-9", subjectType: "company", subjectId: COMPANY_ID, ordinal: 1, version: 7,
        payload: { step: "ratings", draft: { overallRating: 5, ratings: {} } },
        savedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), available: true,
      }],
    });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    const prompt = page.getByTestId("resume-draft-prompt");
    await expect(prompt, "offered, because bringing it back replaces what is on screen")
      .toBeVisible({ timeout: 10_000 });
    await expect(prompt).toContainText("unfinished rating saved");
    // Still on step 1: nothing was applied behind their back.
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible();
  });

  test("a conflict asks which answers to keep and merges nothing", async ({ page }) => {
    await mockPage(page, {
      put: async (route) => route.fulfill({
        status: 409,
        json: { id: "draft-1", version: 12, conflict: true,
                payload: { draft: { overallRating: 2, ratings: {} } } },
      }),
    });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);

    const prompt = page.getByTestId("draft-conflict-prompt");
    await expect(prompt).toBeVisible({ timeout: 12_000 });
    await expect(prompt).toContainText("changed somewhere else");
    await expect(prompt.getByRole("button", { name: /Use the newer answers/ })).toBeVisible();
    await expect(prompt.getByRole("button", { name: /Keep what's on this page/ })).toBeVisible();
  });

  test("an expired session keeps the answers and says so", async ({ page }) => {
    await mockPage(page, {
      put: async (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);

    await expect(page.getByTestId("draft-status-auth")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId("draft-status-auth")).toContainText("answers are safe");
    // And the answers really are still on screen.
    await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
  });

  test("a save that cannot reach the server keeps the answers and says so", async ({ page }) => {
    await mockPage(page, { put: async (route) => route.abort("failed") });

    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);

    await expect(page.getByTestId("draft-status-offline")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId("draft-status-offline")).toContainText("kept on this device");
  });
});

test.describe("one browser, two accounts @ci", () => {

  test("a second account is never shown the first account's answers", async ({ page }) => {
    /*
      The reason local drafts are scoped to the account at all. Before scoping, the key was the
      subject alone: signing out left the answers for the next person, and once a signed-in
      contributor also saves to the server, that device would write somebody else's words to its
      own account's draft - from which they could publish them under their own name.
    */
    await mockPage(page);
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/rate`);
    await answerSomething(page);
    await expect(page.getByText(/Step 3 of 3/)).toBeVisible();

    const keys = await page.evaluate(() => Object.keys(localStorage));
    const scoped = keys.filter((k) => k.includes("pending_company_rating"));
    expect(scoped.length, "the draft is stored somewhere").toBeGreaterThan(0);
    expect(scoped.every((k) => k.includes("::")),
      "and every one of them is scoped to an account, not to the subject alone").toBe(true);
    expect(scoped.some((k) => k.endsWith(`::${MOCK_USER.id}`)),
      "under the account that typed it").toBe(true);
  });

  /*
    The sign-out rule itself is a unit test, in client/lib/draftScope.test.ts: it is pure storage
    logic, and asserting it here would mean importing TypeScript source into the browser, which
    only works by accident of the dev server.
  */
});

test.describe("unfinished ratings in the account @ci", () => {

  test("lists the contributor's own, with when it expires", async ({ page }) => {
    await mockAccountWithDrafts(page, [{
      id: "d1", subjectType: "company", subjectId: COMPANY_ID, ordinal: 1, version: 3,
      payload: { draft: { ratings: { work_life_balance: 4, compensation_benefits: 5 } } },
      savedAt: "2026-10-01T10:00:00Z", expiresAt: "2026-12-30T10:00:00Z",
      available: true, subjectName: "Acme Corp", subjectSlug: TEST_COMPANY_SLUG,
    }]);
    await page.goto("/settings");

    const list = page.getByTestId("unfinished-ratings");
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(list).toContainText("Acme Corp");
    await expect(list, "only you can see these, and it says so").toContainText("Only you");
    await expect(list, "the retention period is disclosed rather than discovered")
      .toContainText("90 days");
    await expect(list).toContainText("2 answers so far");
  });

  test("a draft whose subject is gone stays listed and explains itself", async ({ page }) => {
    await mockAccountWithDrafts(page, [{
      id: "d2", subjectType: "manager", subjectId: 42, ordinal: 1, version: 1,
      payload: {}, savedAt: "2026-10-01T10:00:00Z", expiresAt: "2026-12-30T10:00:00Z",
      available: false, unavailableReason: "This profile was merged into another.",
      redirectTo: 99, subjectName: "Dana Scully",
    }]);
    await page.goto("/settings");

    await expect(page.getByTestId("unfinished-unavailable"))
      .toContainText("merged into another", { timeout: 10_000 });
    await expect(page.getByRole("link", { name: /See the profile it was merged into/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue" }),
      "there is nowhere to continue to, so no button pretends otherwise").toHaveCount(0);
  });

  test("the contributor can delete one", async ({ page }) => {
    let deleted: string | null = null;
    await mockAccountWithDrafts(page, [{
      id: "d3", subjectType: "company", subjectId: COMPANY_ID, ordinal: 1, version: 1,
      payload: {}, savedAt: "2026-10-01T10:00:00Z", expiresAt: "2026-12-30T10:00:00Z",
      available: true, subjectName: "Acme Corp", subjectSlug: TEST_COMPANY_SLUG,
    }]);
    await page.route("**/api/users/me/drafts/*", (r) => {
      if (r.request().method() === "DELETE") {
        deleted = r.request().url().split("/").pop() ?? null;
        return r.fulfill({ json: { discarded: true } });
      }
      return r.fallback();
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: "Delete this unfinished rating" }).click();
    await expect.poll(() => deleted, { timeout: 10_000 }).toBe("d3");
  });

  test("nothing is claimed when the list cannot be loaded", async ({ page }) => {
    /*
      An error says nothing about whether drafts exist. Rendering "you have none" would be a claim
      about somebody's own unfinished work that we are in no position to make.
    */
    await mockAccountWithDrafts(page, [], 500);
    await page.goto("/settings");

    await expect(page.getByTestId("unfinished-ratings-error")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("unfinished-ratings")).toHaveCount(0);
  });
});
