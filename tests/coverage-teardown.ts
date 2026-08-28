/**
 * Playwright globalTeardown: merges all per-test coverage JSON files from
 * .nyc_output/ and runs `nyc report` to produce a text summary.
 * Only runs when PLAYWRIGHT_COVERAGE=true.
 */
import { execSync } from "child_process";
import fs from "fs";

export default async function globalTeardown() {
  if (process.env.PLAYWRIGHT_COVERAGE !== "true") return;
  const dir = ".nyc_output";
  if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
    console.log("[coverage] No coverage data collected.");
    return;
  }
  try {
    execSync("npx nyc report --reporter=text", { stdio: "inherit" });
  } catch {
    // Non-zero exit (e.g. thresholds) - don't fail the test run
  }
}
