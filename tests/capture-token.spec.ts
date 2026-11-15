import { test, expect } from "./base";
import { scopedDraftKey } from "../client/lib/draftScope";
import { MOCK_USER, mockAddBossPage, rateAllFiveStars, attestFirstHandExperience, pickLocation } from "./fixtures";

/**
 * PHASE 1: the add-manager form carries one capture token from its first keystroke to its submit.
 *
 * The form posts a capture as soon as step one is valid - before the company box is finished - so
 * one attempt at "Marcus Whitlow at Lumenwerx Systems" left a draft at "Lumen", and the submission
 * that followed created a second row for the same person.
 *
 * The server used to join those two up by resemblance: same name, the captured company a prefix of
 * the submitted one, under an hour old. That also describes a stranger's half-typed namesake,
 * whose draft was then rewritten and handed to whoever submitted next.
 *
 * So the client mints a token, and these are the two things it has to get right. If either fails,
 * the backend's adoption never happens and every submission files a duplicate beside its own
 * capture - which is the shape of the bug that mechanism was built to prevent.
 */

const next = (page: any) => page.getByRole("button", { name: /^next$/i });

async function fillStep1(page: any) {
  await page.locator('input[name="firstName"]').fill("Marcus");
  await page.locator('input[name="lastName"]').fill("Whitlow");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
  await page.keyboard.press("Escape");   // close the company picker's own listbox
  await pickLocation(page);
}

async function finishAndSubmit(page: any) {
  await next(page).click();
  await page.getByLabel("From month").selectOption("01");
  await page.getByLabel("From year").selectOption("2022");
  await page.getByRole("checkbox", { name: /^current$/i }).check();
  await next(page).click();
  await rateAllFiveStars(page);
  await attestFirstHandExperience(page);
  await page.getByRole("button", { name: /submit/i }).click();
}

/** Both requests' capture tokens, in the order the form sent them. */
async function watchTokens(page: any) {
  const captures: (string | undefined)[] = [];
  const submits: (string | undefined)[] = [];
  const tokenOf = (route: any) => {
    try { return JSON.parse(route.request().postData() || "{}").captureToken; }
    catch { return undefined; }
  };
  // Registered after mockAddBossPage, so these win: Playwright matches the most recently
  // added route first.
  await page.route(/\/api\/managers\/ghost$/, (route: any) => {
    captures.push(tokenOf(route));
    route.fulfill({ status: 201, json: { id: 4242, name: "Marcus Whitlow", created: true, published: false } });
  });
  await page.route(/\/api\/managers$/, (route: any) => {
    if (route.request().method() !== "POST") return route.continue();
    submits.push(tokenOf(route));
    route.fulfill({ status: 201, json: { id: "new-manager-1", slug: "new-manager-1" } });
  });
  return { captures, submits };
}

test.describe("capture token", () => {
  test("the capture and the submission carry the same token", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    const seen = await watchTokens(page);

    await page.goto("/add");
    await fillStep1(page);
    await expect.poll(() => seen.captures.length).toBe(1);

    await finishAndSubmit(page);
    await expect.poll(() => seen.submits.length).toBe(1);

    expect(seen.captures[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen.submits[0]).toBe(seen.captures[0]);
  });

  test("the token is kept in the draft, so it survives the sign-in round trip", async ({ page }) => {
    /*
      The case the token exists for. Somebody fills the form in, is sent to sign in, and comes back
      to a restored draft - at which point the capture fires again. A fresh token there would be a
      second attempt: the server would hold two drafts for one person, and the submission could
      only ever adopt one of them.

      So the token lives in the draft, in the same localStorage slot as the rating's own token, and
      this is the assertion that it is written there. A token posted but not saved is the whole
      failure: the round trip is exactly when it is needed and exactly when it would be lost.
    */
    await mockAddBossPage(page, { loggedIn: true });
    const seen = await watchTokens(page);

    await page.goto("/add");
    await fillStep1(page);
    await expect.poll(() => seen.captures.length).toBe(1);

    // The signed-in account's own draft key: drafts are scoped per account now, see
    // tests/draft-isolation.spec.ts.
    const saved = await page.evaluate((k: string) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw).captureToken : null;
    }, scopedDraftKey("rmm_pending_manager", MOCK_USER.id));
    expect(saved).toBe(seen.captures[0]);
  });
});
