import { test, expect } from "./base";
import { MOCK_MANAGERS_LIST, mockDirectoryPage } from "./fixtures";

/**
 * How a company logo resolves, and what happens when it does not.
 *
 * Most of these domains are guessed from the company name - "Zehrs Markets" becomes
 * zehrsmarkets.com - so a large share will never resolve at all. The control therefore has three
 * steps rather than one: the stored logo if there is one, then the guessed logo.dev URL, then the
 * company's first letter on a plain tile. Every step is reached in production regularly.
 *
 * The failure memo matters as much as the fallback. Each guessed URL is a billed request, and
 * without remembering which ones failed, every tile for that company re-requests the same
 * known-bad URL on every render, on every page, for the whole session.
 *
 * None of it ran: the logo was always mocked as present, so only the happy first step was tested.
 */

/** Fails every logo request, so the chain has to walk all the way down. */
async function withBrokenLogos(page: any) {
  await page.route(/logo\.dev|logodev|\.png$|\.jpg$|\.svg$/, (r: any) => r.abort("failed"));
}

/** The company on the first directory tile. */
const COMPANY = MOCK_MANAGERS_LIST[0].company as string;

async function openDirectory(page: any) {
  await mockDirectoryPage(page);
  await page.goto("/directory");
  await expect(page.getByText(MOCK_MANAGERS_LIST[0].name).first()).toBeVisible({ timeout: 10_000 });
}

test.describe("When no logo can be found", () => {
  test("the company's initial stands in for it", async ({ page }) => {
    /*
      A letter on a plain tile rather than a broken-image icon or an empty box. The tile is the
      same size either way, so a row of companies stays a row of companies.
    */
    await withBrokenLogos(page);
    await openDirectory(page);

    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("the tile keeps its size, so nothing shifts as logos resolve", async ({ page }) => {
    /*
      The box is reserved before the image arrives. Without that, every logo that loads late nudges
      the row it is in, and on a directory page of twenty tiles the whole list moves under the
      cursor while somebody is trying to click one.
    */
    await withBrokenLogos(page);
    await openDirectory(page);
    const initial = COMPANY.trim().charAt(0).toUpperCase();
    const letterTile = page.getByText(initial, { exact: true }).first();
    await expect(letterTile).toBeVisible({ timeout: 10_000 });

    const box = await letterTile.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("a failed logo is remembered for the rest of the session", async ({ page }) => {
    /*
      Every one of these is a billed request against a domain guessed from a company name. Left
      unremembered, the same known-bad URL is re-requested by every tile for that company, on every
      page, for as long as the session lasts.
    */
    await withBrokenLogos(page);
    await openDirectory(page);
    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await expect(async () => {
      const remembered = await page.evaluate(() => sessionStorage.getItem("wp_failed_logos"));
      expect(remembered).toBeTruthy();
      expect(JSON.parse(remembered!).length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test("a remembered failure is not requested again on the next page", async ({ page }) => {
    // The point of remembering. A second visit should go straight to the letter rather than
    // re-walking the chain down to it.
    await withBrokenLogos(page);
    await openDirectory(page);
    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    let requestsAfter = 0;
    await page.route(/logo\.dev/, (r: any) => { requestsAfter++; return r.abort("failed"); });
    await page.reload();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    expect(requestsAfter).toBe(0);
  });

  test("the memo is session-scoped, not permanent", async ({ page, context }) => {
    /*
      sessionStorage rather than localStorage, deliberately. A company that had no logo an hour ago
      may have one now, and a permanent negative cache would hide it from that browser forever.
    */
    await withBrokenLogos(page);
    await openDirectory(page);
    await expect(async () => {
      expect(await page.evaluate(() => sessionStorage.getItem("wp_failed_logos"))).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    const fresh = await context.newPage();
    await mockDirectoryPage(fresh);
    await fresh.goto("/directory");

    expect(await fresh.evaluate(() => localStorage.getItem("wp_failed_logos"))).toBeNull();
    await fresh.close();
  });
});

test.describe("When storage is unavailable", () => {
  test("a browser that refuses storage still renders the logos", async ({ page }) => {
    /*
      Private mode, a full quota, or a browser configured to block site data. The memo is an
      optimisation - losing it costs requests, and it must not cost the page.
    */
    await page.addInitScript(() => {
      const boom = () => { throw new Error("storage disabled"); };
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom }),
      });
    });
    await withBrokenLogos(page);
    await openDirectory(page);

    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("an unreadable memo is treated as an empty one", async ({ page }) => {
    // Written by an older build, or truncated. Parsed at module load, so an unhandled throw here
    // takes down every page that renders a single company tile.
    await page.addInitScript(() => sessionStorage.setItem("wp_failed_logos", "{not json"));
    await withBrokenLogos(page);
    await openDirectory(page);

    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Loading logos only when they are nearly needed", () => {
  test("a browser with no observer loads them all rather than none", async ({ page }) => {
    /*
      The deferral is an optimisation, and the fallback when it is unavailable has to be the old
      behaviour - load immediately - not the new one with its trigger removed. Degrading to a
      permanently blank logo would be the worse half of both designs, and it is the easy mistake
      here because nothing on screen says the observer is what was missing.
    */
    await page.addInitScript(() => {
      // @ts-expect-error - deliberately removing it, as an old browser would.
      delete window.IntersectionObserver;
    });
    await withBrokenLogos(page);
    await openDirectory(page);

    const initial = COMPANY.trim().charAt(0).toUpperCase();
    await expect(page.getByText(initial, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("a logo that has loaded is not discarded when it scrolls away", async ({ page }) => {
    // The near-viewport flag never flips back. If it did, one logo would become one request per
    // scroll pass over the same tile - and every one of them is billed.
    let requests = 0;
    await page.route(/logo\.dev/, (r: any) => { requests++; return r.abort("failed"); });
    await openDirectory(page);
    await page.waitForTimeout(500);
    const afterLoad = requests;

    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -4000);
    await page.waitForTimeout(500);

    expect(requests).toBe(afterLoad);
  });
});
