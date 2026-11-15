import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

/*
  THE SUITE READS THE SAME ENV FILES THE BUNDLE WAS BUILT FROM.

  Feature flags reach the client through `import.meta.env`, which means they are baked in at BUILD
  time from `.env`/`.env.local`. A spec that has to know whether a flag is on - the role-aware
  contribution journey is the one that does - can only read `process.env`, and node does not load
  those files on its own. So the gate said "off", the bundle said "on", and the specs for the
  feature we are actively developing were skipped on every local run while looking green.

  `loadEnv` is Vite's own loader, so the precedence here is exactly the build's: `.env`, then
  `.env.local`, then the mode-specific pair. Anything already in the environment wins, which keeps
  `VITE_ROLE_AWARE_SUBMISSION=false npx playwright test` working for the legacy half.
*/
const fileEnv = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production",
                        process.cwd(), "");
for (const [key, value] of Object.entries(fileEnv)) {
  if (key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
}

/** The specs that drive the journey the redesign replaces. They need a bundle with the flag off. */
const LEGACY_FORM_SPECS = [
  "**/add-boss.spec.ts",
  "**/add-boss-outcomes.spec.ts",
  "**/capture-token.spec.ts",
  "**/manager-location.spec.ts",
  "**/coverage-boost-5.spec.ts",
  "**/coverage-boost-6.spec.ts",
  "**/legacy-add-manager-journey.spec.ts",
];

/** Project names carry this prefix so a spec can tell which bundle is serving it. */
export const LEGACY_FORM_PROJECT_PREFIX = "legacy-form-";
const LEGACY_FORM_URL = "http://localhost:4175";

/*
  ─────────────────────────────────────────────────────────────────────────────
  TWO EXECUTION MODES, ONE SUITE.

  The suite is NOT trimmed to fit CI. Every test stays in the repository and the full local run
  discovers all of them; routine CI selects a subset by TAG, so what CI skips is visible in the
  command rather than buried in a deleted file.

      full local      npx playwright test                    (every project, every test)
      routine CI      npx playwright test --grep @ci         (tagged subset, chromium)
      on demand       the full-suite workflow, dispatched manually

  WHY A TAG AND NOT A FILE LIST. A hardcoded list of spec paths goes stale the day somebody adds a
  file, and it goes stale SILENTLY - the new test simply never runs in CI and the totals look
  healthy. A tag travels with the test it describes, so a new security-sensitive test is opted in
  by the person writing it, at the moment they know it matters.

  WHAT EARNS @ci. Authentication and authorization, account erasure and anonymisation, data
  integrity, and the regression tests for defects that reached production. Browser permutations,
  coverage-raising specs and anything needing a live backend or the geography corpus stay out of
  routine CI and in the full suite.

  CI_GREP exists so the workflow can widen the selection without a config change.
  ─────────────────────────────────────────────────────────────────────────────
*/
const CI_GREP = process.env.CI_GREP ? new RegExp(process.env.CI_GREP) : undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  // Applied only when CI_GREP is set, so a local run is unaffected and nothing is hidden by
  // default. `--grep` on the command line overrides this.
  ...(CI_GREP ? { grep: CI_GREP } : {}),
  globalTeardown: process.env.PLAYWRIGHT_COVERAGE === "true"
    ? "./tests/coverage-teardown.ts"
    : undefined,
  use: {
    // Override with PLAYWRIGHT_BASE_URL env var to test against a different server,
    // e.g. PLAYWRIGHT_BASE_URL=http://localhost:8081 to test against the dev server.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4174",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    /*
      NO VIDEO IN CI, and therefore no ffmpeg download there.

      `playwright install ffmpeg` hung on a GitHub runner on 2026-11-14: the download reached
      100% of 2.3 MiB and the process then never exited, so the step burned its whole cap. The
      same command exits in 1.3s locally, so it is something about the runner and not worth
      finding at twenty minutes a run.

      Video was only ever recorded on a retry. `trace` is still on-first-retry and is strictly
      more useful for diagnosing a CI failure anyway: it carries DOM snapshots, network and
      console, and the report lets you step through them. Screenshots on failure are unchanged.
      Locally, where the binary is already cached and the install works, video stays on.
    */
    video: process.env.CI ? "off" : "on-first-retry",
    launchOptions: {
      slowMo: process.env.SLOWMO ? parseInt(process.env.SLOWMO) : 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? "chrome" : undefined },
      testIgnore: LEGACY_FORM_SPECS,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: LEGACY_FORM_SPECS,
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
      testIgnore: LEGACY_FORM_SPECS,
    },
    /*
      THE JOURNEY WE ARE REPLACING, still tested, against a bundle built without the flag.

      These specs drive the legacy add-manager journey: step one leading straight to the work
      timeline, the early ghost capture and its token, and the POST /api/managers submission that
      runs the fuzzy attachment. None of that is what the role-aware bundle does, so against it
      they fail - 29 of them did - and none of those failures is a defect in either journey.

      The alternative was to skip them while the flag is on, which costs the whole of the legacy
      form's coverage on every local run, on the journey that is still what production serves.
      A second bundle costs one extra build and keeps both.

      Same three devices as the default projects, deliberately: moving the legacy journey to one
      browser would be a quiet coverage cut, not a test-infrastructure change.
    */
    ...(["chromium", "firefox", "Mobile Chrome"] as const).map(device => ({
      name: `${LEGACY_FORM_PROJECT_PREFIX}${device}`,
      use: {
        ...devices[device === "Mobile Chrome" ? "Pixel 5"
                 : device === "firefox" ? "Desktop Firefox" : "Desktop Chrome"],
        ...(device === "chromium" && process.env.CI ? { channel: "chrome" as const } : {}),
        baseURL: LEGACY_FORM_URL,
      },
      testMatch: LEGACY_FORM_SPECS,
    })),
  ],
  // Serves the production build via `vite preview` before running tests.
  // Requires `pnpm build:client` to have run first.
  // Set PLAYWRIGHT_BASE_URL to skip this and use your own server instead.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          // 4174, not 4173 — RateMyManagers previews on 4173, and reuseExistingServer means a
          // suite started while that one is up would silently test the wrong app and still pass.
          command: "pnpm exec vite preview --port 4174",
          url: "http://localhost:4174",
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          /*
            THE LEGACY BUNDLE, built here rather than expected to exist.

            It is built by this command because nobody will remember a second build step, and a
            missing dist/legacy-spa would otherwise surface as a preview server that will not
            start. The flag is forced off in this command's own environment, which is what makes
            this bundle the legacy journey whatever `.env.local` says.
          */
          command: "pnpm exec vite build --outDir dist/legacy-spa"
                 + " && pnpm exec vite preview --outDir dist/legacy-spa --port 4175",
          env: { VITE_ROLE_AWARE_SUBMISSION: "false" },
          url: LEGACY_FORM_URL,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      ],
});
