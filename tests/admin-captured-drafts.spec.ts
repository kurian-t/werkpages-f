import { test, expect } from "./base";
import { mockAdminPage } from "./fixtures";

/**
 * The queue of forms somebody filled in and lost at the sign-in wall, and publishing one.
 *
 * <h2>What this proves and what it does not</h2>
 *
 * <p>It proves the panel asks the server for the right thing and reports what the server says: a
 * complete draft offers Publish, an incomplete one does not and says why, and a refusal is shown
 * in the server's own words rather than swallowed.
 *
 * <p>It does NOT prove a rating was written. That is a server-side question and a mocked route
 * answering 200 would pass whatever the backend did, which is exactly how a published-but-not-
 * written draft would reach production unnoticed. CapturedDraftPublicationIntegrationTest owns
 * that half, against a real database.
 *
 * <h2>Route order</h2>
 *
 * <p>Every route here is registered AFTER mockAdminPage. The fixture installs one catch-all for
 * /api/admin that answers GETs with an empty list and POSTs with success, and Playwright matches
 * in reverse registration order, so a route registered first never sees the request. Getting it
 * backwards leaves the queue empty and every assertion below vacuous.
 */

const COMPLETE = {
  id: 11,
  kind: "company_rating",
  companyId: 1,
  companyName: "Red Hat",
  companySlug: "red-hat",
  managerId: null,
  managerName: null,
  author: null,
  createdAt: new Date().toISOString(),
  publishable: true,
  blockedReason: null,
  payload: { overallRating: 4, workedFrom: "2021-04", ratings: { work_life_balance: 4 } },
};

const INCOMPLETE = {
  ...COMPLETE,
  id: 12,
  publishable: false,
  blockedReason: "Rate every category before submitting.",
  payload: { overallRating: 4 },
};

async function openQueue(page: any, drafts: any[], onPublish?: (route: any) => void) {
  await mockAdminPage(page);
  await page.route("**/api/admin/captured-drafts", (route: any) =>
    route.fulfill({ json: { data: drafts, total: drafts.length, limit: 50, offset: 0 } }));
  if (onPublish) await page.route("**/api/admin/captured-drafts/*/publish", onPublish);

  await page.goto("/admin");
  await page.getByRole("button", { name: /unfinished forms/i }).click();
  await expect(page.getByTestId("captured-drafts-panel")).toBeVisible({ timeout: 10_000 });
}

test.describe("publishing a captured draft", () => {
  test("a complete draft can be published, and the server is told which one", async ({ page }) => {
    let publishedPath = "";
    await openQueue(page, [COMPLETE], (route: any) => {
      publishedPath = new URL(route.request().url()).pathname;
      route.fulfill({ json: { success: true, kind: "company_rating", ratingId: "r-1", companyId: 1 } });
    });

    const publish = page.getByTestId("publish-draft-11");
    await expect(publish).toBeEnabled();
    await publish.click();

    // The id in the path is the whole instruction: publishing the wrong draft is unrecoverable.
    await expect.poll(() => publishedPath).toBe("/api/admin/captured-drafts/11/publish");
    await expect(page.getByTestId("publish-draft-11")).toHaveCount(0);
  });

  test("an incomplete draft cannot be published, and says which answer is missing", async ({ page }) => {
    /*
      The button is disabled from the server's own verdict rather than from anything this page
      works out, so the panel cannot offer a publish the backend would refuse. Showing the reason
      is the other half: a disabled button with no explanation is a dead end.
    */
    await openQueue(page, [INCOMPLETE]);

    await expect(page.getByTestId("publish-draft-12")).toBeDisabled();
    await expect(page.getByText("Rate every category before submitting.")).toBeVisible();
  });

  test("a refusal is shown in the server's words, and the draft stays in the queue", async ({ page }) => {
    /*
      A draft its author came back and submitted, or one another admin already dealt with. The
      card must not disappear: it is still there on the server, and removing it locally would tell
      an admin they published something they did not.
    */
    await openQueue(page, [COMPLETE], (route: any) =>
      route.fulfill({ status: 409, json: { error: "draft_already_resolved" } }));

    await page.getByTestId("publish-draft-11").click();

    await expect(page.getByText("draft_already_resolved")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("publish-draft-11")).toBeVisible();
  });

  test("marking one reviewed does not publish it", async ({ page }) => {
    let publishCalled = false;
    await openQueue(page, [COMPLETE], (route: any) => {
      publishCalled = true;
      route.fulfill({ json: { success: true } });
    });

    await page.getByRole("button", { name: /^mark reviewed$/i }).click();

    await expect(page.getByTestId("publish-draft-11")).toHaveCount(0);
    expect(publishCalled, "dismissing a draft must never write a rating").toBe(false);
  });
});
