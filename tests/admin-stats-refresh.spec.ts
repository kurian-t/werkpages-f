import { test, expect } from "./base";
import { mockAdminPage } from "./fixtures";

/**
 * That the admin site-stats tiles reflect an approval, rather than the numbers they loaded with.
 *
 * <h2>The bug this was written for</h2>
 *
 * <p>REPORTED: "I approved a draft manager addition and rating, but the opinions shared counter
 * did not go up and I don't think user submitted went up either."
 *
 * <p>Both counters were correct in the database. `/api/stats` was fetched in a `useEffect` with an
 * empty dependency array, so it ran exactly once, when the page mounted, and no admin action
 * re-read it. Approving removed the row from the pending list and showed a toast, and every tile
 * kept the number it had been rendered with until the page was reloaded by hand.
 *
 * <p>That both counters failed together is the tell. A data bug would have to hit two different
 * queries - one over `managers`, one over `reviews` joined to it - in the same way. One request
 * that is never sent again hits every tile at once.
 *
 * <h2>Why the stub changes its answer</h2>
 *
 * <p>The endpoint returns the lower totals once and the higher ones afterwards, so the assertion
 * can only pass if the page asked a second time. Returning a fixed number would pass against the
 * broken code, which is the trap that let this ship.
 */

const LOADED  = { realManagers: 10, realReviews: 6,
                  weightedOpinions: 0, seededManagers: 0, scrapedManagers: 0, companyReviews: 0 };
const APPROVED = { realManagers: 11, realReviews: 7,
                  weightedOpinions: 0, seededManagers: 0, scrapedManagers: 0, companyReviews: 0 };

test.describe("admin site stats stay in step with admin actions", () => {

  test("approving a manager updates the User Submitted and Opinions Shared tiles", async ({ page }) => {
    let reads = 0;
    await page.route("**/api/stats", (route) => {
      reads += 1;
      route.fulfill({ json: reads === 1 ? LOADED : APPROVED });
    });
    await mockAdminPage(page);
    await page.goto("/admin");

    // The page-load figures, so a later assertion proves a change rather than a coincidence.
    await expect(page.getByTestId("stat-user-submitted")).toHaveText("10", { timeout: 10_000 });
    await expect(page.getByTestId("stat-opinions-shared")).toHaveText("6");

    /*
      TWO CLICKS, because the row's Approve only opens a confirmation.

      Clicking it once and asserting the counters was the first version of this test, and it failed
      against the FIXED code: the dialog had opened, nothing had been approved, and "10" was the
      correct answer. A test that cannot tell "the fix does not work" from "I never pressed the
      button" is worse than no test, so the dialog is asserted before it is confirmed.
    */
    await page.getByRole("button", { name: /^approve$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/approve manager\?/i)).toBeVisible({ timeout: 10_000 });

    const approved = page.waitForResponse((r) =>
      /\/api\/admin\/pending-managers\/.*\/approve/.test(r.url()) && r.request().method() === "POST");
    await dialog.getByRole("button", { name: /^approve$/i }).click();
    await approved;          // the approval genuinely happened, so what follows is about counters

    await expect(page.getByTestId("stat-user-submitted")).toHaveText("11", { timeout: 10_000 });
    await expect(page.getByTestId("stat-opinions-shared")).toHaveText("7");
    expect(reads, "the page never re-read /api/stats after approving").toBeGreaterThan(1);
  });
});
