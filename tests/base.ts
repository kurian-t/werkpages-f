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

export const test = base.extend<{ autoCaptureCoverage: void }>({
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
