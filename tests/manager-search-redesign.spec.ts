import { test, expect } from "./base";
import { MOCK_MANAGERS_LIST, mockFindManagerPage } from "./fixtures";

/**
 * The search redesign, from the reader's side.
 *
 * Searching used to ask "is there a manager with this name AT THIS COMPANY", and answered no
 * whenever the company did not line up - so somebody already on file was presented as somebody we
 * had never heard of, and a second profile was created for them. Aaron Yip had nine rows.
 *
 * The rule now is name first: everyone matching the name comes back, and the company and the
 * title decide the ORDER and whether anything new is created, never whether a person is shown.
 *
 * Four things that follow from it are checked here, because each one is invisible in the backend
 * tests and each one is how the change reaches an actual reader:
 *
 *   - results stay locked for a visitor who has not rated anybody, signed in or not;
 *   - when the server declines to create anything, the people it DID find are still shown;
 *   - the order the server ranked them in is the order on screen;
 *   - a completed search tells the server it was completed, which is what lets the company be
 *     recorded server-side rather than from a request the browser may never finish.
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

test.describe("Results are locked for anybody who has not rated a manager", () => {
  /*
    The gate is the contribution, not the account.

    Signing in is not a contribution, so a signed-in visitor who has rated nobody must see exactly
    what a signed-out one sees: the manager exists, the rating does not come with it, and the way
    to read it is to rate somebody. The two cases render through one branch - the card is chosen on
    hasContributed alone - and this pins that, because keying it on the account instead would quietly
    hand every signed-in visitor the ratings.
  */
  for (const loggedIn of [false, true]) {
    test(`${loggedIn ? "a signed-in" : "a signed-out"} visitor who has not contributed gets a locked result`,
      async ({ page }) => {
        await mockFindManagerPage(page, {
          loggedIn,
          hasContributed: false,
          searchResults: MOCK_MANAGERS_LIST.slice(0, 1),
        });
        await page.goto("/find");

        await fillAndSearch(page);

        // Found: the person is on screen.
        await expect(page.getByText("Alex Johnson").first()).toBeVisible({ timeout: 15_000 });
        // Locked: the rating is not, and the way to unlock it is.
        await expect(page.getByText("Rate a manager to unlock ratings")).toBeVisible();
        await expect(page.getByText("3.8")).toHaveCount(0);
      });
  }
});

test.describe("When the server creates nothing, it still answers the question", () => {
  test("the managers it found are shown even though nothing was published", async ({ page }) => {
    /*
      THE COMPLAINT, from the other side.

      A signed-out visitor searches "Aaron Yip" at a company we do not have. The server finds the
      Aaron Yip who is already on file, decides correctly NOT to mint a second one - the name
      matches, so publishing a duplicate is the bug that was just fixed - and reports
      published: false.

      Returning an empty list on that reply reopened the original complaint from the opposite
      direction: declining to duplicate him meant showing nothing at all, so he still looked
      absent. `candidates` is what the server did find, already ranked, and it belongs on screen.
    */
    await mockFindManagerPage(page, { loggedIn: false, hasContributed: false, searchResults: [] });
    await page.route(/\/api\/managers\?|\/api\/managers$/, (r: any) =>
      r.request().method() === "GET" ? r.fulfill({ json: { data: [], total: 0 } }) : r.continue());
    await page.route(/\/api\/managers\/ghost/, (r: any) =>
      r.fulfill({
        status: 201,
        json: {
          id: 9001, name: "Aaron Yip", created: false, published: false,
          candidates: [
            { id: 7001, name: "Aaron Yip", title: "Controller", company: "Warrington", overallRating: 4.1, reviews: 3 },
          ],
        },
      }));
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Aaron", lastName: "Yip", company: "Nowhere Ltd", title: "Controller" });

    await expect(page.locator('a[href="/manager/7001"]')).toHaveCount(1, { timeout: 15_000 });
    // And not a tile for the thing that was never published - that was the "Manager not found" outage.
    await expect(page.locator('a[href="/manager/9001"]')).toHaveCount(0);
  });

  test("showing them does not spend the browser's one-time add", async ({ page }) => {
    /*
      The slot pays for a manager being created. Nothing was created here, so spending it would
      cost this visitor their one auto-add for a manager who already existed.
    */
    await mockFindManagerPage(page, { loggedIn: false, hasContributed: false, searchResults: [] });
    await page.route(/\/api\/managers\?|\/api\/managers$/, (r: any) =>
      r.request().method() === "GET" ? r.fulfill({ json: { data: [], total: 0 } }) : r.continue());
    await page.route(/\/api\/managers\/ghost/, (r: any) =>
      r.fulfill({
        status: 201,
        json: {
          id: 9001, name: "Aaron Yip", created: false, published: false,
          candidates: [{ id: 7001, name: "Aaron Yip", title: "Controller", company: "Warrington" }],
        },
      }));
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Aaron", lastName: "Yip", company: "Nowhere Ltd", title: "Controller" });
    await expect(page.locator('a[href="/manager/7001"]')).toHaveCount(1, { timeout: 15_000 });

    const slot = await page.evaluate(() => localStorage.getItem("rmm_anon_ghost_created"));
    expect(slot).toBeNull();
  });
});

test.describe("The order the server ranked them in", () => {
  test("is the order they appear in", async ({ page }) => {
    /*
      Ranking is the server's job and it is the whole substitute for filtering by company. The
      manager whose company AND title both match the search is rank 0 and has to be first; the
      same name at an unrelated employer comes last.

      If the client re-sorts - alphabetically, by rating, by anything - that ordering is destroyed
      and the reader picks the wrong person from a list of people who share a name. So the DOM
      order is asserted against the order the server sent, not merely the presence of each tile.
    */
    const ranked = [
      { id: 801, name: "Aaron Yip", title: "Controller", company: "Warrington", overallRating: 4.1, reviews: 3 },
      { id: 802, name: "Aaron Yip", title: "Analyst", company: "Warrington", overallRating: 4.8, reviews: 9 },
      { id: 803, name: "Aaron Yip", title: "Chef", company: "Unrelated Inc", overallRating: 5.0, reviews: 40 },
    ];
    await mockFindManagerPage(page, { loggedIn: false, hasContributed: false, searchResults: ranked });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Aaron", lastName: "Yip", company: "Warrington", title: "Controller" });

    await expect(page.locator('a[href^="/manager/80"]')).toHaveCount(3, { timeout: 15_000 });
    const order = await page.locator('a[href^="/manager/80"]').evaluateAll(
      (els: any[]) => els.map((e) => e.getAttribute("href")));
    expect(order).toEqual(["/manager/801", "/manager/802", "/manager/803"]);
  });
});

test.describe("A completed search says so", () => {
  test("the completed search POSTs, so a read can never create a company", async ({ page }) => {
    /*
      The company write for a finished search runs on the server, as part of this request.

      It was fired from the browser and not awaited, which lost it whenever the person navigated
      away. Moving it to the server fixed that but put it behind `GET ...&submitted=true` - a read
      verb that wrote, so a crawler, a prefetch or a browser retry could mint company rows by
      replaying a URL. It is a POST now, and the GET is read-only.

      Both halves are asserted: the completed search is the POST and carries the four fields, and
      no GET went out claiming to be a submission.
    */
    const posts: any[] = [];
    const queries: string[] = [];
    await mockFindManagerPage(page, { loggedIn: false, hasContributed: false, searchResults: [] });
    await page.route(/\/api\/managers\/search$/, (r: any) => {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ json: { data: [], total: 0 } });
    });
    await page.route(/\/api\/managers\?|\/api\/managers$/, (r: any) => {
      if (r.request().method() === "GET") {
        queries.push(r.request().url());
        return r.fulfill({ json: { data: [], total: 0 } });
      }
      return r.continue();
    });
    await page.route(/\/api\/managers\/ghost/, (r: any) =>
      r.fulfill({ status: 201, json: { id: 4242, name: "Alex Johnson", created: true, published: true } }));
    await page.goto("/find");

    await fillAndSearch(page);
    await expect(page.locator('a[href="/manager/4242"]')).toHaveCount(1, { timeout: 15_000 });

    expect(posts.length, "the completed search was never POSTed").toBeGreaterThan(0);
    const body = posts[posts.length - 1];
    expect(body.firstName).toBe("Alex");
    expect(body.lastName).toBe("Johnson");
    // The company and title are sent as typed - they rank the results, they do not filter them.
    expect(body.company).toBe("Acme Corp");
    expect(body.title).toBe("Engineering Manager");
    // And nothing asked a READ to perform the submission.
    const submittedGet = queries.find((u) => u.includes("submitted=true"));
    expect(submittedGet, "a GET must never carry a submission: " + submittedGet).toBeUndefined();
  });
});
