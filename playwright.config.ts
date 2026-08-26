import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  globalTeardown: process.env.PLAYWRIGHT_COVERAGE === "true"
    ? "./tests/coverage-teardown.ts"
    : undefined,
  use: {
    // Override with PLAYWRIGHT_BASE_URL env var to test against a different server,
    // e.g. PLAYWRIGHT_BASE_URL=http://localhost:8081 to test against the dev server.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4174",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    launchOptions: {
      slowMo: process.env.SLOWMO ? parseInt(process.env.SLOWMO) : 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? "chrome" : undefined },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Serves the production build via `vite preview` before running tests.
  // Requires `pnpm build:client` to have run first.
  // Set PLAYWRIGHT_BASE_URL to skip this and use your own server instead.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // 4174, not 4173 — RateMyManagers previews on 4173, and reuseExistingServer means a
        // suite started while that one is up would silently test the wrong app and still pass.
        command: "pnpm exec vite preview --port 4174",
        url: "http://localhost:4174",
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
