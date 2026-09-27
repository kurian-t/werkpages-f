/**
 * Base Playwright fixtures - all spec files import { test, expect } from here.
 *
 * When PLAYWRIGHT_COVERAGE=true, the `page` fixture is extended to collect
 * window.__coverage__ (populated by vite-plugin-istanbul) after each test and
 * write it to .nyc_output/. Run `npx nyc report` after the test run to view.
 */
import { test as base, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const coverageEnabled = process.env.PLAYWRIGHT_COVERAGE === "true";

export { expect, type Page };

/**
 * A 1x1 transparent PNG, served in place of every real logo request.
 *
 * logo.dev is a METERED third-party API on a monthly quota, and its token ships in the client
 * bundle - so a test run that loads real pages bills the same account the live site depends on.
 * Six full suite runs in one day exhausted the month's allowance and every logo on production
 * fell back to a letter initial for five days.
 *
 * Nothing in this suite asserts on the CONTENT of a company logo - the fallback chain is tested
 * in company-logo-fallback.spec.ts by failing these requests deliberately - so there is nothing
 * to gain from letting them out, and a billed dependency to lose.
 */
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const test = base.extend<{ autoCaptureCoverage: void; blockBilledLogoRequests: void }>({
  /**
   * Keeps every test off logo.dev, whatever it does.
   *
   * Registered FIRST and with `auto`, so it is the outermost route: a spec that wants to test
   * the failure path registers its own handler later and wins, because Playwright matches in
   * reverse registration order.
   */
  blockBilledLogoRequests: [
    async ({ page }, use) => {
      // logo.dev is the BILLED one; duckduckgo is free but still a network dependency, and a
      // test that waits on somebody else's CDN is a test that fails for reasons of its own.
      await page.route(/(?:img|api)\.logo\.dev|cdn\.brandfetch\.io|icons\.duckduckgo\.com/, (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: STUB_PNG }),
      );
      await use();
    },
    { auto: true },
  ],

  autoCaptureCoverage: [
    async ({ page }, use) => {
      await use();
      if (!coverageEnabled) return;
      try {
        const coverage = await page.evaluate(
          () => (window as unknown as { __coverage__?: unknown }).__coverage__ ?? null
        );
        if (coverage) {
          const dir = ".nyc_output";
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(
            path.join(dir, `pw-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
            JSON.stringify(coverage)
          );
        }
      } catch {
        // Page may be closed - coverage not critical, swallow silently
      }
    },
    { auto: true },
  ],
});
