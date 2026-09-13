import { test, expect } from "./base";
import { MOCK_MY_REVIEW, mockAccountSettingsPage } from "./fixtures";

/**
 * The account page's irreversible and paged operations.
 *
 * Deleting a review, deleting the whole account, and paging through a long list were all
 * unexercised. The first two destroy things: a wrong branch there either removes something
 * somebody meant to keep, or tells them it is gone when it is not. The third is the one that
 * breaks quietly - a person with more reviews than one page simply never sees the rest, and
 * nothing anywhere reports an error.
 */

/** Enough reviews to need a second page, each distinguishable from the others. */
const page1 = Array.from({ length: 10 }, (_, i) => ({
  ...MOCK_MY_REVIEW,
  id: `rv-a-${i}`,
  managerName: `First Page Manager ${i}`,
}));
const page2 = Array.from({ length: 4 }, (_, i) => ({
  ...MOCK_MY_REVIEW,
  id: `rv-b-${i}`,
  managerName: `Second Page Manager ${i}`,
}));

test.describe("Paging through a long list of reviews", () => {
  test("the rest of the list arrives without the reader asking", async ({ page }) => {
    /*
      Paged on scroll, via an IntersectionObserver on a sentinel at the foot of the list. When this
      does not fire there is no error and no empty state - the list just stops, and somebody with
      fourteen reviews believes they wrote ten.
    */
    await mockAccountSettingsPage(page, { reviews: page1 });
    let secondPageAsked = false;
    await page.route(/\/api\/users\/me\/reviews/, (r: any) => {
      const url = new URL(r.request().url());
      const offset = Number(url.searchParams.get("offset") ?? 0);
      if (offset > 0) {
        secondPageAsked = true;
        return r.fulfill({ json: { data: page2, total: 14, limit: 10, offset } });
      }
      return r.fulfill({ json: { data: page1, total: 14, limit: 10, offset: 0 } });
    });
    await page.goto("/settings");

    await expect(page.getByText("First Page Manager 0")).toBeVisible({ timeout: 10_000 });
    await page.getByText("First Page Manager 9").scrollIntoViewIfNeeded();

    await expect(page.getByText("Second Page Manager 0")).toBeVisible({ timeout: 10_000 });
    expect(secondPageAsked).toBe(true);
  });

  test("a failed page leaves what was already loaded alone", async ({ page }) => {
    // Swallowed on purpose - scrolling again retries naturally. What it must not do is discard the
    // reviews already on screen or wedge the loading flag on.
    await mockAccountSettingsPage(page, { reviews: page1 });
    await page.route(/\/api\/users\/me\/reviews/, (r: any) => {
      const offset = Number(new URL(r.request().url()).searchParams.get("offset") ?? 0);
      return offset > 0
        ? r.fulfill({ status: 500, json: { error: "nope" } })
        : r.fulfill({ json: { data: page1, total: 14, limit: 10, offset: 0 } });
    });
    await page.goto("/settings");

    await expect(page.getByText("First Page Manager 0")).toBeVisible({ timeout: 10_000 });
    await page.getByText("First Page Manager 9").scrollIntoViewIfNeeded();

    await expect(page.getByText("First Page Manager 0")).toBeVisible();
    await expect(page.getByText("First Page Manager 9")).toBeVisible();
  });

  test("a list that fits on one page asks for nothing more", async ({ page }) => {
    // The guard is `myReviews.length >= reviewsTotal`. Without it the observer would request page
    // after page of nothing every time the foot of a short list came into view.
    let extraRequests = 0;
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.route(/\/api\/users\/me\/reviews/, (r: any) => {
      const offset = Number(new URL(r.request().url()).searchParams.get("offset") ?? 0);
      if (offset > 0) extraRequests += 1;
      return r.fulfill({ json: { data: [MOCK_MY_REVIEW], total: 1, limit: 10, offset } });
    });
    await page.goto("/settings");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(500);

    expect(extraRequests).toBe(0);
  });
});

test.describe("Deleting the account", () => {
  async function openDangerZone(page: any) {
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Delete My Account" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Delete Account" })).toBeVisible();
  }

  test("the confirmation has to be typed exactly", async ({ page }) => {
    /*
      The one thing on this page that cannot be undone, so the gesture is deliberate rather than a
      click somebody can make by accident or muscle memory.
    */
    await openDangerZone(page);
    const confirm = page.getByRole("dialog").getByRole("textbox");
    const go = page.getByRole("dialog").getByRole("button", { name: "Delete Account" });

    await expect(go).toBeDisabled();
    await confirm.fill("delete my account");
    await expect(go).toBeDisabled();
    await confirm.fill("DELETE MY ACCOUNT");
    await expect(go).toBeEnabled();
  });

  test("an expired session says to sign in again, not 'try later'", async ({ page }) => {
    /*
      401 and 403 get their own message because the remedy is different and specific: signing out
      and back in fixes it, and "please try again later" sends somebody to wait for nothing.
    */
    await openDangerZone(page);
    await page.route("**/api/auth/me/delete", (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 401, json: {} })
        : r.continue());

    await page.getByRole("dialog").getByRole("textbox").fill("DELETE MY ACCOUNT");
    await page.getByRole("dialog").getByRole("button", { name: "Delete Account" }).click();

    await expect(page.getByText(/session expired/i)).toBeVisible({ timeout: 10_000 });
  });

  test("any other failure says so rather than appearing to succeed", async ({ page }) => {
    // Navigating away on a failed delete would tell somebody their account was gone while it was
    // not - and they would have no way to find out otherwise.
    await openDangerZone(page);
    await page.route("**/api/auth/me/delete", (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 500, json: {} })
        : r.continue());

    await page.getByRole("dialog").getByRole("textbox").fill("DELETE MY ACCOUNT");
    await page.getByRole("dialog").getByRole("button", { name: "Delete Account" }).click();

    await expect(page.getByText(/failed to delete account/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/settings/);
  });

  test("closing the dialog cancels it", async ({ page }) => {
    let deleted = false;
    await openDangerZone(page);
    await page.route("**/api/auth/me/delete", (r: any) => {
      if (r.request().method() === "DELETE") deleted = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("dialog").getByRole("textbox").fill("DELETE MY ACCOUNT");
    await page.getByRole("dialog").getByLabel("Close").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(deleted).toBe(false);
  });
});
