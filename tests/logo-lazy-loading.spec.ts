import { test, expect } from "./base";
import { mockDirectoryPage } from "./fixtures";

/**
 * Company logos load a few rows ahead of the scroll, not all at once.
 *
 * Every logo is a billed request to logo.dev, and the domain is guessed from the company name, so
 * a directory page used to spend one request per tile the moment it rendered - most of them for
 * companies nobody had scrolled to, many for domains that do not exist. At 331k of a 500k monthly
 * quota that is the difference between comfortable and not.
 *
 * The requests here are fulfilled locally. A test suite must never spend the real quota, and one
 * that did would make this number worse every time it ran.
 */

// 1x1 transparent PNG.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** 40 managers, each at a different company, so every tile is a distinct logo URL. */
const MANY_MANAGERS = Array.from({ length: 40 }, (_, i) => ({
  id: `lazy-mgr-${i}`,
  name: `Manager Number${i}`,
  title: "Engineering Manager",
  company: `Distinct Company ${i}`,
  overallRating: 4.1,
  reviews: 3,
  approvalStatus: "approved",
  image: "M",
}));

async function countLogoRequests(page: any) {
  const urls: string[] = [];
  // Registered after mockDirectoryPage so it takes precedence - Playwright matches routes in
  // reverse registration order, and a catch-all registered later would swallow these.
  await page.route("**img.logo.dev/**", (route: any) => {
    urls.push(route.request().url());
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
  });
  return urls;
}

test.describe("Company logo loading", () => {
  test("a long list does not request every logo on it", async ({ page }) => {
    await mockDirectoryPage(page, { managers: MANY_MANAGERS });
    const urls = await countLogoRequests(page);

    await page.goto("/directory");
    await expect(page.getByText("Manager Number0")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const onLoad = urls.length;
    expect(onLoad).toBeGreaterThan(0);            // the visible ones did load
    expect(onLoad).toBeLessThan(MANY_MANAGERS.length); // but not the whole page
  });

  test("scrolling brings in the rest", async ({ page }) => {
    // The other half of the guarantee: loading fewer up front must not mean never loading them.
    await mockDirectoryPage(page, { managers: MANY_MANAGERS });
    const urls = await countLogoRequests(page);

    await page.goto("/directory");
    await expect(page.getByText("Manager Number0")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    const onLoad = urls.length;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    expect(urls.length).toBeGreaterThan(onLoad);
  });

  test("each logo is requested once, not once per pass", async ({ page }) => {
    // The observer disconnects after firing. Were it to re-arm, scrolling up and down a list
    // would re-request every logo on every pass and cost more than loading them all up front.
    await mockDirectoryPage(page, { managers: MANY_MANAGERS });
    const urls = await countLogoRequests(page);

    await page.goto("/directory");
    await expect(page.getByText("Manager Number0")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    expect(urls.length).toBe(new Set(urls).size);
  });
});
