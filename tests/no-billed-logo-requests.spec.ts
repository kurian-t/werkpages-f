import { test, expect } from "./base";

/**
 * The suite must never spend money on a third-party API.
 *
 * logo.dev is metered on a MONTHLY quota and its token ships in the client bundle, so a test run
 * that loads real pages bills the same account the live site depends on. On 2026-09-26 six full
 * suite runs in one day exhausted the month's allowance: logo.dev began answering
 *
 *     429 {"msg":"monthly request limit exceeded"}
 *
 * for every domain, and every company logo on production fell back to a letter initial until the
 * quota reset. Nothing failed. No test went red. The only symptom was the live site quietly
 * looking wrong, for days.
 *
 * base.ts stubs these requests for every test via an `auto` fixture. This spec is what notices if
 * that stub is ever removed, renamed, or outscoped - the failure it guards against is silent by
 * nature, so it has to be asserted rather than assumed.
 */

/** Pages that render enough company tiles to trigger logo loading. */
const LOGO_HEAVY_PAGES = ["/directory", "/companies", "/"];

test.describe("Billed third-party requests", () => {
  for (const path of LOGO_HEAVY_PAGES) {
    test(`${path} never reaches logo.dev for real`, async ({ page }) => {
      /*
        Counts requests that were actually SENT to the network, not requests the page attempted.
        The fixture fulfils them locally, so an attempt is fine and expected - what must never
        happen is one leaving this machine.
      */
      const escaped: string[] = [];
      page.on("requestfinished", async (req) => {
        if (!req.url().includes("logo.dev")) return;
        const res = await req.response();
        // A stubbed response is served by Playwright and has no remote address.
        const server = await res?.serverAddr().catch(() => null);
        if (server) escaped.push(req.url());
      });

      await page.goto(path, { waitUntil: "networkidle" });

      expect(escaped, `these requests were billed to logo.dev:\n${escaped.join("\n")}`)
        .toHaveLength(0);
    });
  }

  test("the stub is actually in place, not merely unexercised", async ({ page }) => {
    /*
      Guards the guard. If the fixture were dropped, the tests above would still pass on a page
      that happened to render no logos - so assert the interception directly.
    */
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const res = await fetch("https://img.logo.dev/example.com?token=whatever");
      return res.status;
    });
    expect(status, "logo.dev requests must be intercepted by the base fixture").toBe(200);
  });
});
