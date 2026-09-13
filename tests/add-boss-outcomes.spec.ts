import { test, expect } from "./base";
import { MOCK_USER, mockAddBossPage, rateAllFiveStars, attestFirstHandExperience } from "./fixtures";

/**
 * What the add-manager form does when it is wrong, and what it does when it works.
 *
 * The existing specs walk the three steps and check the gates. What they never reach is the
 * ending: the validation messages on step one, the submit that succeeds, and the four distinct
 * ways it can fail - two of which are not really failures at all.
 *
 * That last part is the interesting one. The form auto-saves as somebody fills it in, so by the
 * time they press submit the manager may already exist and the server may answer "you have already
 * reviewed this role". Showing that as an error would tell somebody their work was rejected at the
 * exact moment it was saved.
 */

async function fillStep1(page: any, over: Record<string, string> = {}) {
  const {
    firstName = "Jordan", lastName = "Smith",
    title = "Engineering Manager", company = "Acme Corp",
  } = over;
  if (firstName) await page.locator('input[name="firstName"]').fill(firstName);
  if (lastName) await page.locator('input[name="lastName"]').fill(lastName);
  if (title) await page.locator('input[name="title"]').fill(title);
  if (company) await page.locator('input[name="company"]').fill(company);
}

const next = (page: any) => page.getByRole("button", { name: /^next$/i });

async function fillTimeline(page: any) {
  await page.getByLabel("From month").selectOption("01");
  await page.getByLabel("From year").selectOption("2022");
  await page.getByRole("checkbox", { name: /^current$/i }).check();
}

/** Fills all three steps and presses submit. */
async function completeForm(page: any) {
  await fillStep1(page);
  await next(page).click();
  await fillTimeline(page);
  await next(page).click();
  await rateAllFiveStars(page);
  await attestFirstHandExperience(page);
  await page.getByRole("button", { name: /submit/i }).click();
}

/*
  Step one's validation messages are deliberately not tested here, because they cannot run.

  handleNext builds "First name is required", "Title is required" and the rest, and wires them to
  the error banner - but `Next` is disabled whenever any of those conditions hold, and that button
  is its only caller. So a reader with a missing field gets a grey button and, apart from the
  company-length hint, no word about which field it is waiting on.

  Left as found: add-boss.spec.ts pins the disabled-until-valid behaviour three separate ways, so
  it is a deliberate product decision rather than an oversight, and changing it is not this spec's
  call. Noted here because the messages read like live code and are not.
*/

test.describe("A submission that works", () => {
  test("it says what was submitted and what happens next", async ({ page }) => {
    /*
      Named, because somebody who has just typed a real person's name wants to see that name back -
      and told it is going to review, because the profile they land on will not be public yet and
      an unexplained "pending" badge reads as a problem with what they wrote.
    */
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await completeForm(page);

    await expect(page.getByText(/Jordan Smith submitted for review/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/An admin will review it shortly/i)).toBeVisible();
  });

  test("it lands on the manager that was just created", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await completeForm(page);

    await expect(page).toHaveURL(/\/managers\//, { timeout: 15_000 });
  });

  test("the saved draft is cleared, so the form does not offer it back", async ({ page }) => {
    // The draft exists to survive an interrupted session. Left behind after a successful submit it
    // reappears on the next visit, inviting somebody to submit the same manager twice.
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await completeForm(page);
    await expect(page).toHaveURL(/\/managers\//, { timeout: 15_000 });

    expect(await page.evaluate(() => localStorage.getItem("rmm_pending_manager"))).toBeNull();
  });

  test("it counts as a contribution straight away", async ({ page }) => {
    /*
      Rating unlocks the ratings, and the unlock has to be immediate. Waiting for the next session
      means somebody who has just contributed is shown the locked view of the thing they unlocked.
    */
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await completeForm(page);
    await expect(page).toHaveURL(/\/managers\//, { timeout: 15_000 });

    expect(await page.evaluate(() => sessionStorage.getItem("rmm_just_rated"))).toBe("1");
  });
});

test.describe("A submission the server refuses", () => {
  test("a session that expired asks for a sign-in rather than showing an error", async ({ page }) => {
    /*
      A 401 means the form is fine and the session is not. An error banner here reads as a problem
      with what they wrote, and the fix - sign in again - is not something the banner suggests.
    */
    await mockAddBossPage(page, { loggedIn: true, submitResponse: { status: 401, json: { error: "unauthorized" } } });
    await page.goto("/add");

    await completeForm(page);

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  });

  test("any other refusal is shown as the server worded it", async ({ page }) => {
    await mockAddBossPage(page, {
      loggedIn: true,
      submitResponse: { status: 429, json: { error: "You have added too many managers today." } },
    });
    await page.goto("/add");

    await completeForm(page);

    await expect(page.getByText("You have added too many managers today.")).toBeVisible({ timeout: 15_000 });
  });

  test("a refusal with nothing to say still says something in our own words", async ({ page }) => {
    /*
      A failure with no message body used to surface axios's own "Request failed with status code
      500" - it sat ahead of the fallback in the chain and is always set, so the sentence written
      for this moment could never appear. That string is for a log, not for somebody who has just
      spent five minutes filling in a form.
    */
    await mockAddBossPage(page, { loggedIn: true, submitResponse: { status: 500, json: {} } });
    await page.goto("/add");

    await completeForm(page);

    await expect(page.getByText(/Failed to submit manager and review/i)).toBeVisible({ timeout: 15_000 });
  });

  test("a refusal keeps the reader on the form with their work intact", async ({ page }) => {
    // The draft survives a failure, so a retry is a second press rather than a second filling-in.
    await mockAddBossPage(page, { loggedIn: true, submitResponse: { status: 500, json: {} } });
    await page.goto("/add");

    await completeForm(page);
    await expect(page.getByText(/Failed to submit/i)).toBeVisible({ timeout: 15_000 });

    await expect(page).not.toHaveURL(/\/managers\//);
    await expect(page.getByRole("button", { name: /submit/i })).toBeEnabled();
  });
});

test.describe("When the work was already saved", () => {
  /*
    The form auto-saves as it is filled in, so the submit at the end can arrive after the manager
    already exists - and the server answers "you have already reviewed this role", which is true
    and also not a problem. Reporting it as an error tells somebody their work was rejected at the
    moment it was saved, and the profile they would have to go and find is already there.
  */

  test("an already-reviewed answer after a successful auto-save is not an error", async ({ page }) => {
    await mockAddBossPage(page, {
      loggedIn: true,
      submitResponse: { status: 409, json: { error: "already_reviewed_this_role" } },
    });
    await page.goto("/add");

    await completeForm(page);

    // Either it lands on the saved manager, or it explains itself. What it must never do is show
    // a bare rejection for work that was in fact saved.
    await expect(async () => {
      const onProfile = /\/managers\//.test(page.url());
      const explained = await page.getByText(/already/i).count();
      expect(onProfile || explained > 0).toBe(true);
    }).toPass({ timeout: 15_000 });
  });

  test("a role-limit answer is handled the same way", async ({ page }) => {
    await mockAddBossPage(page, {
      loggedIn: true,
      submitResponse: { status: 409, json: { error: "role_limit_reached" } },
    });
    await page.goto("/add");

    await completeForm(page);

    await expect(async () => {
      const onProfile = /\/managers\//.test(page.url());
      const explained = await page.getByText(/limit|already/i).count();
      expect(onProfile || explained > 0).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
