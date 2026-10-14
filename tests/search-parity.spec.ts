import { test, expect } from "./base";
import { MOCK_GEO, MOCK_USER } from "./fixtures";

/**
 * ONE manager-search workflow, three entry points.
 *
 * /search, /directory and the Find a Manager form on a company profile must behave identically:
 * the same four fields, the same name-first matching, the same fuzzy detection, the same company
 * resolution and ghost rules, the same ranking, the same locked cards. Only the page around them
 * differs - how the company is obtained, and how results are drawn.
 *
 * The copies had already drifted before these tests existed. /directory joined the two name fields
 * into one string and re-split it at the first space, so "Mary Jane" / "Watson" reached the matcher
 * as "Mary" / "Jane Watson" while /search sent it correctly; the company profile's form captured
 * nothing at all when somebody gave up part way through. Neither was visible from any single file,
 * and neither broke a test, because nothing compared the three surfaces against each other.
 *
 * That is what this file is for. The assertions are deliberately about THE REQUEST and THE
 * RENDERING, because those are the two ends the pages own - everything between them is shared code
 * and is covered by the backend's own integration tests.
 */

const ENTRY_POINTS = [
  { name: "/search",         path: "/search" },
  { name: "/directory",      path: "/directory" },
  { name: "company profile", path: "/companies/acme-corp" },
] as const;

const TILES = [
  // The exact pair: same company, same title. Rank 0 - must lead.
  { id: 601, name: "Aaron Yip", title: "Controller", company: "Acme Corp",
    overallRating: 4.2, reviews: 5, approvalStatus: "approved" },
  // Same name, DIFFERENT employer. Must still be shown - the company ranks, it never filters.
  { id: 602, name: "Aaron Yip", title: "Analyst", company: "QuadReal",
    overallRating: 4.9, reviews: 30, approvalStatus: "approved" },
];

/** Everything the three pages need, with every manager-search response identical. */
async function mockEverything(page: any, opts: { loggedIn?: boolean; hasContributed?: boolean } = {}) {
  const { loggedIn = false, hasContributed = false } = opts;
  const seen: { url: string; body: any }[] = [];

  await page.route("**/api/auth/me", (r: any) =>
    loggedIn ? r.fulfill({ json: { ...MOCK_USER, hasContributed } })
             : r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.route(/\/api\/geo/, (r: any) => r.fulfill({ json: MOCK_GEO }));
  await page.route(/\/api\/companies\/suggest/, (r: any) => r.fulfill({ json: [] }));
  await page.route("**/api/companies", (r: any) => r.fulfill({ json: ["Acme Corp"] }));
  await page.route("**/api/users/me/submitted-managers", (r: any) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.route("**/api/users/me/has-contributed", (r: any) =>
    r.fulfill({ json: { hasContributed } }));

  // The company profile's own payload - the page identity the form will reuse.
  await page.route(/\/api\/companies\/by-slug\/|\/api\/companies\/by-name/, (r: any) =>
    r.fulfill({ json: {
      id: 77, name: "Acme Corp", slug: "acme-corp", industry: null, industrySlug: null,
      logoUrl: null, managers: [], totalReviews: 0, avgRating: null, categoryAverages: null,
    }}));

  /*
    A COMPLETED search is a POST, because it writes - it resolves the company and creates it when
    we do not hold it. The GET stays, read-only, and serves paging.
  */
  await page.route(/\/api\/managers\/search$/, (r: any) => {
    seen.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ json: { data: TILES, total: TILES.length, hasMore: false } });
  });
  await page.route(/\/api\/managers(\?|$)/, (r: any) => {
    if (r.request().method() !== "GET") return r.continue();
    const url = r.request().url();
    if (url.includes("firstName=")) {
      seen.push({ url, body: null });
      return r.fulfill({ json: { data: TILES, total: TILES.length, hasMore: false } });
    }
    // the directory's own browse listing, a different feature
    return r.fulfill({ json: { data: [], total: 0 } });
  });
  await page.route(/\/api\/managers\/ghost|\/api\/managers\/anonymous-capture|\/api\/managers\/find-or-create/,
    (r: any) => r.fulfill({ status: 201, json: { data: TILES, created: false, published: true, hasContributed } }));

  return seen;
}

/** Fills whichever of the four fields the surface actually shows, then submits. */
async function searchHere(page: any, path: string) {
  if (path === "/directory") {
    const filters = page.getByRole("button", { name: /filters/i });
    if (await filters.isVisible().catch(() => false)) await filters.click();
  }
  // Case-insensitive: the three surfaces label the same inputs differently ("company" vs
  // "Company"), which is layout and is allowed to differ. What must not differ is what is sent.
  await page.getByPlaceholder(/first name/i).filter({ visible: true }).first().fill("Aaron");
  await page.getByPlaceholder(/last name/i).filter({ visible: true }).first().fill("Yip");
  await page.getByPlaceholder(/job title/i).filter({ visible: true }).first().fill("Controller");
  // The company profile supplies the company itself - there is no box to type it into.
  const companyBox = page.getByPlaceholder(/^company$/i).filter({ visible: true });
  if (await companyBox.count() > 0) await companyBox.first().fill("Acme Corp");

  const submit = page.getByRole("button", { name: /^search$/i }).first();
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
}

for (const entry of ENTRY_POINTS) {
  test.describe(`Manager search from ${entry.name}`, () => {
    test("sends the same four fields the other surfaces send", async ({ page }) => {
      const seen = await mockEverything(page);
      await page.goto(entry.path);
      await searchHere(page, entry.path);

      await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThan(0);
      const last = seen[seen.length - 1];
      // A completed search must be the POST, never a GET that writes.
      expect(last.body, "the completed search must POST, not GET: " + last.url).toBeTruthy();
      expect(last.url).toContain("/api/managers/search");
      expect(last.body.firstName).toBe("Aaron");
      expect(last.body.lastName).toBe("Yip");
      expect(last.body.title).toBe("Controller");
      // Including on the company profile, where the page supplies it rather than the person.
      expect(last.body.company).toBe("Acme Corp");
    });

    test("shows every same-name manager, including one at another employer", async ({ page }) => {
      /*
        The original complaint. Searching here must not hide an Aaron Yip who works somewhere
        else - on a company profile least of all, where the temptation to scope results to the
        company being viewed is strongest. He is shown with his REAL employer, which is what
        stops the reader assuming he works here.
      */
      await mockEverything(page);
      await page.goto(entry.path);
      await searchHere(page, entry.path);

      await expect(page.locator('a[href="/manager/601"]')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator('a[href="/manager/602"]')).toHaveCount(1);
      await expect(page.getByText("QuadReal").first()).toBeVisible();
    });

    test("ranks the exact employment match first, exactly as the others do", async ({ page }) => {
      await mockEverything(page);
      await page.goto(entry.path);
      await searchHere(page, entry.path);

      await expect(page.locator('a[href^="/manager/60"]')).toHaveCount(2, { timeout: 15_000 });
      const order = await page.locator('a[href^="/manager/60"]')
        .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("href")));
      // 602 has six times the reviews. Relevance beats popularity, on every surface.
      expect(order).toEqual(["/manager/601", "/manager/602"]);
    });

    for (const loggedIn of [false, true]) {
      test(`locks the results for ${loggedIn ? "a signed-in" : "a signed-out"} non-contributor`,
        async ({ page }) => {
          await mockEverything(page, { loggedIn, hasContributed: false });
          await page.goto(entry.path);
          await searchHere(page, entry.path);

          await expect(page.locator('a[href="/manager/601"]')).toHaveCount(1, { timeout: 15_000 });
          // Found, but the rating does not come with it.
          await expect(page.getByText("4.2")).toHaveCount(0);
        });
    }

    test("captures an abandoned search so the work is never thrown away", async ({ page }) => {
      /*
        Section 44. The company profile had no capture at all, so the one surface where we already
        know the company was the one that discarded a half-finished answer.
      */
      let captured = false;
      await mockEverything(page);
      await page.route(/\/api\/managers\/anonymous-capture/, (r: any) => {
        captured = true;
        r.fulfill({ status: 204, body: "" });
      });
      await page.goto(entry.path);

      if (entry.path === "/directory") {
        const filters = page.getByRole("button", { name: /filters/i });
        if (await filters.isVisible().catch(() => false)) await filters.click();
      }
      // Enough to be worth recording, and then they stop - no submit.
      await page.getByPlaceholder(/first name/i).filter({ visible: true }).first().fill("Dana");
      await page.getByPlaceholder(/last name/i).filter({ visible: true }).first().fill("Okafor");
      await page.getByPlaceholder(/job title/i).filter({ visible: true }).first().fill("Controller");

      await expect.poll(() => captured, { timeout: 15_000 }).toBe(true);
    });
  });
}
