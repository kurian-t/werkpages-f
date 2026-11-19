import { test, expect } from "./base";
import { MOCK_ADMIN_USER, mockAdminPage } from "./fixtures";

/**
 * The banner that says whether automatic manager creation is paused.
 *
 * Anonymous searches publish managers, and two rolling site-wide ceilings cap that. When either
 * one holds, the searches fall back to the pending queue and NOBODY IS SHOWN AN ERROR - which is
 * the right behaviour for the searcher and the reason the pause is otherwise completely invisible.
 * The admin panel is the only surface it reaches.
 *
 * It had no coverage in either product. A circuit breaker whose only indicator is untested is
 * indistinguishable from the feature quietly not working, which is the exact failure the banner
 * was built to rule out.
 *
 * The figures are site-wide and the table behind them is shared between the two brands, so the
 * banner reports the platform's rate, not this product's share of it.
 */

const ACTIVE = /Automatic manager creation is active/i;
const PAUSED = /Automatic manager creation is PAUSED/i;

function status(over: Record<string, unknown> = {}) {
  return {
    lastHour: 3,
    lastDay: 12,
    maxPerHour: 50,
    maxPerDay: 200,
    paused: false,
    trippedBy: null,
    ...over,
  };
}

/*
  Registered after the shared admin fixture on purpose: Playwright matches routes in reverse
  registration order, so the narrower status handler has to come second to win.
*/
async function openPanel(page: any, body: Record<string, unknown> | null, code = 200) {
  await mockAdminPage(page, { user: MOCK_ADMIN_USER });
  await page.route(/\/api\/admin\/ghost-creation-status/, (r: any) =>
    code === 200 ? r.fulfill({ json: body }) : r.fulfill({ status: code, json: {} }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Admin Panel/i })).toBeVisible({ timeout: 10_000 });
}

test.describe("When creation is paused", () => {
  test("the panel says so, and names which ceiling tripped", async ({ page }) => {
    /*
      "Paused" without the reason leaves an admin unable to tell a burst that will clear in an hour
      from one that holds all day, and those call for different responses.
    */
    await openPanel(page, status({ paused: true, trippedBy: "hourly", lastHour: 50 }));

    await expect(page.getByText(PAUSED)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/hourly ceiling reached/i)).toBeVisible();
  });

  test("it explains that searchers are not seeing an error", async ({ page }) => {
    /*
      The most expensive wrong response to this banner is treating it as an outage. Searches are
      still recorded and still answered; they go to the pending queue instead of publishing.
    */
    await openPanel(page, status({ paused: true, trippedBy: "daily", lastDay: 200 }));

    await expect(page.getByText(/going to the pending queue/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nobody is seeing an error/i)).toBeVisible();
  });

  test("it says the pause clears itself, so nobody goes looking for a switch", async ({ page }) => {
    await openPanel(page, status({ paused: true, trippedBy: "daily", lastDay: 200 }));

    await expect(page.getByText(/clears itself as older creations age out/i))
      .toBeVisible({ timeout: 10_000 });
  });
});

test.describe("When creation is running", () => {
  test("the rate is shown against both ceilings", async ({ page }) => {
    /*
      The counts are not decoration. The ceilings were sized against total daily volume from every
      source rather than measured against the anonymous slice specifically, so these two numbers
      are the only evidence of what the real baseline is.
    */
    await openPanel(page, status({ lastHour: 7, lastDay: 41 }));

    await expect(page.getByText(/7 in the last hour \(limit 50\)/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/41 in the last 24h \(limit 200\)/)).toBeVisible();
  });

  test("a quiet day shows no banner at all", async ({ page }) => {
    // Nothing has been created and nothing is blocked, so there is nothing to report. A banner
    // that is always present is a banner nobody reads on the day it matters.
    await openPanel(page, status({ lastHour: 0, lastDay: 0 }));

    await expect(page.getByText(ACTIVE)).toHaveCount(0);
    await expect(page.getByText(PAUSED)).toHaveCount(0);
  });

  test("a busy but unblocked day still reports, so the baseline is visible", async ({ page }) => {
    await openPanel(page, status({ lastHour: 2, lastDay: 30 }));

    await expect(page.getByText(ACTIVE)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("When the probe itself fails", () => {
  test("the rest of the panel still works", async ({ page }) => {
    /*
      This is a status probe on a 60-second timer, not a feature. If a failed probe could empty the
      admin panel it would take moderation down with it, which is a far worse outcome than not
      knowing the ghost rate.
    */
    await openPanel(page, null, 500);

    await expect(page.getByRole("button", { name: /Pending Managers/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(PAUSED)).toHaveCount(0);
  });
});
