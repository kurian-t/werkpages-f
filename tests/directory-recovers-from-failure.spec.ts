import { test, expect } from "./base";

/**
 * The directory recovers from a failed request instead of dead-ending.
 *
 * <h2>What was reported</h2>
 *
 * A visitor on a phone saw "Something went wrong / Unable to load managers. Please try again." on
 * the directory at midnight. The production logs showed the site healthy: no 5xx, no restarts, no rate
 * limiting, and - decisively - NO `GET /api/managers` from that visitor at all. The request never
 * reached the origin. On a phone that is ordinary: a few seconds of lost signal.
 *
 * <h2>Why that was still our bug</h2>
 *
 * The card said "Please try again" and gave nothing to try with. React Query had already retried
 * three times with backoff, so by the time somebody reads this the request has genuinely failed -
 * and their only remaining option was to reload the page. A transient network blip became a dead
 * end on the busiest page.
 *
 * It also blamed the wrong party. Telling somebody with no connection that something went wrong on
 * our side is both inaccurate and useless.
 */

const MANAGERS = {
  data: [{
    id: 1, name: "Ada Lovelace", company: "Red Hat", title: "Engineering Manager",
    image: "A", overallRating: 4.2, reviews: 3, approvalStatus: "ghost",
    categoryAverages: {}, slug: "ada-lovelace-red-hat",
  }],
  total: 1,
};

test.describe("When the managers request fails", () => {
  test("it offers a way to retry, and the retry works", async ({ page }) => {
    /*
      The heart of it. The first attempts fail outright - aborted, as a dropped mobile request is -
      and once the reader presses Try again the page recovers without a reload.
    */
    let fail = true;
    await page.route(/\/api\/managers\?/, async (r: any) => {
      if (fail) return r.abort("failed");
      return r.fulfill({ json: MANAGERS });
    });
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));

    await page.goto("/directory");

    // React Query retries a few times first, so this is not instant.
    await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 30_000 });
    const retry = page.getByRole("button", { name: /try again/i });
    await expect(retry).toBeVisible();

    fail = false;
    await retry.click();

    await expect(page.getByText("Ada Lovelace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("being offline is described as being offline, not as our failure", async ({ page }) => {
    /*
      Honesty about whose problem it is. navigator.onLine only reports the link rather than whether
      anything is reachable, so it chooses the WORDING only - the retry is offered either way.
    */
    await page.route(/\/api\/managers\?/, (r: any) => r.abort("internetdisconnected"));
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
    });

    await page.goto("/directory");

    await expect(page.getByText(/you appear to be offline/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/check your connection/i)).toBeVisible();
    // The control is still there: coming back online and pressing it must work.
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  test("a healthy load shows neither the error nor the retry", async ({ page }) => {
    // The control, so the card cannot regress into always being rendered.
    await page.route(/\/api\/managers\?/, (r: any) => r.fulfill({ json: MANAGERS }));
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));

    await page.goto("/directory");

    await expect(page.getByText("Ada Lovelace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(0);
  });
});
