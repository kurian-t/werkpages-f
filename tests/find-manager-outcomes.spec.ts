import { test, expect } from "./base";
import { MOCK_MANAGERS_LIST, MOCK_USER, mockFindManagerPage } from "./fixtures";

/**
 * The endings of a search on /find that the existing spec does not reach.
 *
 * Searching is the front door, and it has more outcomes than it looks like: found, found but
 * locked, nothing found, nothing found but the name was added for you, and the search failed. Each
 * one leaves the reader somewhere different, and the wrong one leaves them believing the product
 * has nothing on the person they asked about.
 *
 * The ghost path is the one with real consequence. A signed-out visitor searching for somebody we
 * do not have gets that manager created - once, ever, per browser - and the page has to say what
 * just happened, because a silent "no results" after we quietly added the name is the version
 * where nobody ever comes back.
 */

async function fillAndSearch(page: any, over: Record<string, string> = {}) {
  const {
    firstName = "Alex", lastName = "Johnson",
    title = "Engineering Manager", company = "Acme Corp",
  } = over;
  await page.getByPlaceholder("First name").fill(firstName);
  await page.getByPlaceholder("Last name").fill(lastName);
  await page.getByPlaceholder(/job title/i).fill(title);
  await page.getByPlaceholder("Company").fill(company);
  await page.getByRole("button", { name: /^search$/i }).click();
}

test.describe("When the search itself fails", () => {
  test("a failed search says so rather than reporting nobody by that name", async ({ page }) => {
    /*
      The two are opposite claims. "No manager found" about a manager we do have sends somebody
      away believing the product is empty, and it is the answer they will repeat to other people.
    */
    await mockFindManagerPage(page, { loggedIn: true });
    await page.route(/\/api\/managers\/find-or-create/, (r: any) => r.fulfill({ status: 500, json: {} }));
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("No manager found")).toHaveCount(0);
  });

  test("a failed search invites another attempt", async ({ page }) => {
    // Transient by nature, so the next thing to do is try again - which the message has to say,
    // because the form is still filled in and looks like it already did its job.
    await mockFindManagerPage(page, { loggedIn: true });
    await page.route(/\/api\/managers\/find-or-create/, (r: any) => r.abort("failed"));
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText(/Please try again in a moment/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("A name that is not a name", () => {
  test("an obvious placeholder is answered without asking the server", async ({ page }) => {
    /*
      "Test Test", "John Doe" and friends are checked here rather than round-tripped. Each one that
      reaches the server for a signed-in reader creates a manager - so the cost of not checking is
      a directory filling up with people who do not exist.
    */
    let asked = false;
    await mockFindManagerPage(page, { loggedIn: true });
    await page.route(/\/api\/managers\/find-or-create/, (r: any) => {
      asked = true;
      return r.fulfill({ json: { data: [], hasContributed: false } });
    });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Test", lastName: "Test" });

    await expect(page.getByText("No manager found")).toBeVisible({ timeout: 10_000 });
    expect(asked).toBe(false);
  });
});

test.describe("Finding somebody while locked out of the ratings", () => {
  test("the result is shown, and what it takes to read it", async ({ page }) => {
    /*
      Showing the manager exists while withholding the rating is the whole trade: it proves there
      is something here to unlock. An empty page would be a better-kept secret and a worse offer.
    */
    await mockFindManagerPage(page, {
      loggedIn: true,
      searchResults: MOCK_MANAGERS_LIST.slice(0, 1),
      hasContributed: false,
    });
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText("Rate a manager to unlock ratings")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/anonymous and takes 2 minutes/i)).toBeVisible();
  });

  test("the unlock offer leads to the form that unlocks it", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      searchResults: MOCK_MANAGERS_LIST.slice(0, 1),
      hasContributed: false,
    });
    await page.goto("/find");
    await fillAndSearch(page);
    await expect(page.getByText("Rate a manager to unlock ratings")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Rate a manager/ }).click();

    await expect(page).toHaveURL(/\/add/);
  });

  test("a contributor is offered the whole directory instead of an unlock", async ({ page }) => {
    // Already unlocked, so the useful next step is more results rather than the same offer again.
    await mockFindManagerPage(page, {
      loggedIn: true,
      searchResults: MOCK_MANAGERS_LIST.slice(0, 1),
      hasContributed: true,
    });
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText(/See all results in directory/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rate a manager to unlock ratings")).toHaveCount(0);
  });
});

test.describe("A signed-out visitor searching for somebody we do not have", () => {
  /*
    One ghost per browser, ever. The search is captured for the admin queue either way; the ghost
    is the part that makes the name real, and it is deliberately not repeatable.
  */

  /** Signed out, with nobody by that name, and every write available to be routed per-test. */
  async function anonymousMiss(page: any) {
    await mockFindManagerPage(page, { loggedIn: false, searchResults: [] });
    await page.route(/\/api\/managers\?|\/api\/managers$/, (r: any) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: { data: [], total: 0 } })
        : r.continue());
    await page.goto("/find");
  }

  test("the manager comes back as a locked tile, like any other result", async ({ page }) => {
    /*
      The whole point of the ghost. Somebody searching for a manager nobody has rated yet should
      find one - an ordinary locked tile they can open and then rate - not be told that a row was
      written to our database.

      This spec previously asserted that notice and called it intended. It was never intended: it
      announced our plumbing to a reader who had asked a question, and left them nothing to click.
    */
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/ghost/, (r: any) =>
      r.fulfill({ status: 201, json: { id: 4242, name: "Alex Johnson", created: true } }));

    await fillAndSearch(page);

    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Manager added!/i)).toHaveCount(0);
  });

  test("that tile opens the manager's profile", async ({ page }) => {
    // Locked until they rate somebody, but reachable - the tile is a way in, not a dead end.
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/ghost/, (r: any) =>
      r.fulfill({ status: 201, json: { id: 4242, name: "Alex Johnson", created: true } }));

    await fillAndSearch(page);
    await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('a[href="/manager/4242"]')).toHaveCount(1);
  });

  test("the second search of the browser's life adds nothing", async ({ page }) => {
    /*
      One per browser. Without the guard a single visitor can populate the directory with as many
      invented managers as they can type, and every one of them is publicly visible.
    */
    let ghosts = 0;
    await page.addInitScript(() => localStorage.setItem("rmm_anon_ghost_created", "true"));
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/ghost/, (r: any) => {
      ghosts++;
      return r.fulfill({ status: 201, json: { id: 9 } });
    });

    await fillAndSearch(page, { firstName: "Second", lastName: "Attempt" });

    await expect(page.getByText("No manager found")).toBeVisible({ timeout: 15_000 });
    expect(ghosts).toBe(0);
  });

  test("the search is still recorded even when the name is not added", async ({ page }) => {
    /*
      The capture and the ghost are separate acts, in that order. A failed or skipped ghost used to
      take the search down with it, losing the one signal we had that somebody came looking for
      this person - which is the whole input to the admin queue that decides who to add next.
    */
    let captured: any = null;
    await page.addInitScript(() => localStorage.setItem("rmm_anon_ghost_created", "true"));
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/anonymous-capture/, (r: any) => {
      captured = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: {} });
    });

    await fillAndSearch(page, { firstName: "Recorded", lastName: "Anyway" });

    await expect(async () => expect(captured).not.toBeNull()).toPass({ timeout: 15_000 });
    expect(captured.name).toBe("Recorded Anyway");
  });

  test("a bare name with no company or title is not worth recording", async ({ page }) => {
    // A name on its own tells an admin nothing - there is no way to tell which of the several
    // people with that name was meant, so there is nothing to act on.
    let captured = false;
    await page.addInitScript(() => localStorage.setItem("rmm_anon_ghost_created", "true"));
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/anonymous-capture/, (r: any) => {
      captured = true;
      return r.fulfill({ status: 200, json: {} });
    });

    await page.getByPlaceholder("First name").fill("Just");
    await page.getByPlaceholder("Last name").fill("Aname");
    await page.waitForTimeout(1500);

    expect(captured).toBe(false);
  });

  test("a failed add leaves an ordinary empty result, not a false success", async ({ page }) => {
    // "Manager added!" when nothing was added sends somebody back to search for a profile that
    // does not exist, and the second miss looks like the product losing their data.
    await anonymousMiss(page);
    await page.route(/\/api\/managers\/ghost/, (r: any) => r.fulfill({ status: 500, json: {} }));

    await fillAndSearch(page);

    await expect(page.getByText("No manager found")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Manager added!")).toHaveCount(0);
  });

  test("the miss offers signing in rather than a form they cannot use", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("rmm_anon_ghost_created", "true"));
    await anonymousMiss(page);

    await fillAndSearch(page, { firstName: "Nobody", lastName: "Here" });

    await expect(page.getByText("No manager found")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });
});

test.describe("What the search leaves behind", () => {
  test("the search terms survive the trip to rate somebody", async ({ page }) => {
    /*
      The unlock offer sends people to /add and back. Without the terms stored, they return to an
      empty form and have to remember what they typed - which is the point most of them stop.
    */
    await mockFindManagerPage(page, {
      loggedIn: true,
      searchResults: MOCK_MANAGERS_LIST.slice(0, 1),
      hasContributed: false,
    });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Dana", lastName: "Reed" });
    await expect(page.getByText("Rate a manager to unlock ratings")).toBeVisible({ timeout: 10_000 });

    const stored = await page.evaluate(() => sessionStorage.getItem("rmm_find_search"));
    expect(stored).toContain("Dana");
    expect(stored).toContain("Reed");
  });
});
