import { test, expect } from "./base";
import { MOCK_GEO, MOCK_USER } from "./fixtures";

/**
 * Reaching the matches that did not fit on the first page.
 *
 * Search answers eight at a time. With thirty credible matches, twenty-two of them were simply
 * unreachable: the server had reported `hasMore` since the four-field matcher landed, and nothing
 * in the interface read it. Somebody hunting a particular Aaron Yip was shown eight others and no
 * way to go on, which reads as "he is not here" - the complaint the whole redesign was for.
 *
 * Two distinct signals are tested, because conflating them would be a lie:
 *
 *   hasMore             there are more of the matches WE FOUND; ask for the next page
 *   moreMatchesMayExist the candidate scan hit its budget, so there may be people we NEVER
 *                       EXAMINED - a different and weaker claim, and not a page to fetch
 */

function page(n: number) {
  return Array.from({ length: 8 }, (_, i) => {
    const id = n * 100 + i;
    return { id, name: `Aaron Yip`, title: "Controller", company: `Co ${id}`,
             overallRating: 4, reviews: 1, approvalStatus: "approved" };
  });
}

async function mockSearch(p: any, opts: { hasMore?: boolean; incomplete?: boolean } = {}) {
  const { hasMore = true, incomplete = false } = opts;
  const gets: string[] = [];

  await p.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: { error: "no" } }));
  await p.route(/\/api\/geo/, (r: any) => r.fulfill({ json: MOCK_GEO }));
  await p.route(/\/api\/companies\/suggest/, (r: any) => r.fulfill({ json: [] }));
  await p.route("**/api/companies", (r: any) => r.fulfill({ json: ["Acme Corp"] }));
  await p.route("**/api/users/me/has-contributed", (r: any) => r.fulfill({ json: { hasContributed: false } }));

  // The completed search: page one.
  await p.route(/\/api\/managers\/search$/, (r: any) =>
    r.fulfill({ json: { data: page(1), total: 30, hasMore, moreMatchesMayExist: incomplete } }));

  // Later pages are READ-ONLY. Asking to see more must not write anything.
  await p.route(/\/api\/managers\?/, (r: any) => {
    if (r.request().method() !== "GET") return r.continue();
    const url = new URL(r.request().url());
    if (!url.searchParams.get("firstName")) return r.fulfill({ json: { data: [], total: 0 } });
    gets.push(r.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return r.fulfill({ json: {
      data: page(1 + Math.floor(offset / 8)),  // offset 8 is page two
      total: 30,
      hasMore: offset + 8 < 24,
      moreMatchesMayExist: incomplete,
    }});
  });
  return gets;
}

async function search(p: any) {
  await p.getByPlaceholder(/first name/i).filter({ visible: true }).first().fill("Aaron");
  await p.getByPlaceholder(/last name/i).filter({ visible: true }).first().fill("Yip");
  await p.getByPlaceholder(/job title/i).filter({ visible: true }).first().fill("Controller");
  const company = p.getByPlaceholder(/^company$/i).filter({ visible: true });
  if (await company.count() > 0) await company.first().fill("Acme Corp");
  const submit = p.getByRole("button", { name: /^search$/i }).first();
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
}

test.describe("Reaching the rest of the matches", () => {
  test("the control appears only when there are more", async ({ page }) => {
    await mockSearch(page, { hasMore: false });
    await page.goto("/search");
    await search(page);

    await expect(page.locator('a[href="/manager/100"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /show more results/i })).toHaveCount(0);
  });

  test("loading more KEEPS what is already on screen and adds to it", async ({ page }) => {
    /*
      Appended, not replaced. Somebody who has read eight tiles and asks for more must not have
      those eight taken away - and the ordering must continue rather than restart, because the
      server ranked the whole set before slicing it.
    */
    await mockSearch(page);
    await page.goto("/search");
    await search(page);
    await expect(page.locator('a[href="/manager/100"]')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole("button", { name: /show more results/i }).click();

    await expect(page.locator('a[href="/manager/200"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('a[href="/manager/100"]')).toHaveCount(1);
    const order = await page.locator('a[href^="/manager/"]')
      .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("href")));
    expect(order.indexOf("/manager/100")).toBeLessThan(order.indexOf("/manager/200"));
  });

  test("the next page is a READ, and carries the original criteria", async ({ page }) => {
    /*
      Paging must not re-run a completed search. A completed search resolves the company and may
      create it; doing that again on every "show more" click would mint rows for somebody browsing
      their own results. It also has to ask the SAME question - a next page built from different
      criteria is a different search wearing the first one's heading.
    */
    const gets = await mockSearch(page);
    await page.goto("/search");
    await search(page);
    await expect(page.locator('a[href="/manager/100"]')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole("button", { name: /show more results/i }).click();
    await expect.poll(() => gets.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const params = new URL(gets[gets.length - 1]).searchParams;
    expect(params.get("firstName")).toBe("Aaron");
    expect(params.get("lastName")).toBe("Yip");
    expect(params.get("title")).toBe("Controller");
    expect(params.get("company")).toBe("Acme Corp");
    expect(Number(params.get("offset"))).toBe(8);
  });

  test("an incomplete scan is reported as that, not as another page", async ({ page }) => {
    await mockSearch(page, { hasMore: false, incomplete: true });
    await page.goto("/search");
    await search(page);

    await expect(page.locator('a[href="/manager/100"]')).toHaveCount(1, { timeout: 15_000 });
    // Said plainly, and NOT dressed up as a fetchable next page.
    await expect(page.getByText(/more matches than we were able to check/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /show more results/i })).toHaveCount(0);
  });
});
