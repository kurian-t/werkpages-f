import { test, expect } from "./base";
import {
  MOCK_ADMIN_USER,
  MOCK_MANAGER,
  MOCK_USER,
  TEST_MANAGER_ID,
  mockManagerPage,
  mockTurnstile,
} from "./fixtures";

/**
 * Two untested corners of the manager profile: what an admin can destroy from it, and what
 * happens to a half-finished action when signing in interrupts it.
 *
 * The admin delete is the single most destructive control in the product reachable from a public
 * page - it removes a manager and every rating attached to them - and none of it ran, in either
 * direction.
 *
 * The resume-after-auth path is subtler and fails more quietly. Somebody edits a manager's title
 * or reports a profile, is stopped by a sign-in they did not expect, signs in, and then either
 * their action completes or it is silently dropped and they are left looking at the page wondering
 * whether it worked. Only the two in-page resumptions run here; the gates that sign in through a
 * full-page OAuth redirect lose this component entirely and are restored from sessionStorage.
 */

const URL = `/manager/${TEST_MANAGER_ID}`;

test.describe("Deleting a manager as an admin", () => {
  async function openAsAdmin(page: any) {
    await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER, hasContributed: true });
    await page.goto(URL);
    await expect(page.getByTestId("admin-delete-manager")).toBeVisible({ timeout: 10_000 });
  }

  test("the control asks before it destroys anything", async ({ page }) => {
    /*
      Addressed by test id: the career-history rows carry their own "Delete" too, and the two are
      not remotely the same act - one retires a job entry, the other removes the manager and every
      rating on them.

      Irreversible, and it takes every rating on the manager with it. The confirmation is inline
      rather than a dialog, which keeps it beside the name being deleted - a modal that says
      "are you sure?" without saying what is about to go is how the wrong manager gets deleted.
    */
    await openAsAdmin(page);

    await page.getByTestId("admin-delete-manager").click();

    await expect(page.getByText("Delete?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, delete" })).toBeVisible();
  });

  test("backing out leaves the manager alone", async ({ page }) => {
    let called = false;
    await openAsAdmin(page);
    await page.route(/\/api\/admin\/managers\//, (r: any) => {
      if (r.request().method() === "DELETE") called = true;
      return r.fulfill({ status: 200, json: {} });
    });

    await page.getByTestId("admin-delete-manager").click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Delete?")).toHaveCount(0);
    expect(called).toBe(false);
  });

  test("confirming deletes it and leaves the page that no longer exists", async ({ page }) => {
    // Staying would leave an admin looking at a profile that has been deleted, with controls that
    // all now fail. The directory is the nearest place that is still true.
    await openAsAdmin(page);
    await page.route(/\/api\/admin\/managers\//, (r: any) =>
      r.request().method() === "DELETE"
        ? r.fulfill({ status: 200, json: { success: true } })
        : r.continue());

    await page.getByTestId("admin-delete-manager").click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL(/\/directory/, { timeout: 10_000 });
    await expect(page.getByText("Manager deleted")).toBeVisible();
  });

  test("a failed delete says so and offers the control again", async ({ page }) => {
    /*
      The failure path has to restore the button as well as report the failure. Left disabled after
      an error, the only way to retry is a page reload - and an admin who was told nothing might
      reasonably believe the manager is gone when it is not.
    */
    await openAsAdmin(page);
    await page.route(/\/api\/admin\/managers\//, (r: any) =>
      r.request().method() === "DELETE" ? r.fulfill({ status: 500, json: {} }) : r.continue());

    await page.getByTestId("admin-delete-manager").click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page.getByText("Failed to delete manager")).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/directory/);
    await expect(page.getByTestId("admin-delete-manager")).toBeVisible();
  });

  test("somebody who is not an admin has no delete control at all", async ({ page }) => {
    // Hidden here and refused by the server. This assertion is about the first of those - a
    // control nobody should press should not be on the page to press.
    await mockManagerPage(page, { loggedIn: true, user: MOCK_USER, hasContributed: true });
    await page.goto(URL);
    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("admin-delete-manager")).toHaveCount(0);
  });
});

test.describe("Picking up an action interrupted by signing in", () => {
  /*
    Somebody part-way through something is asked to sign in, and the question is whether what they
    were doing survives it. Dropping it silently is the worst outcome: the page looks the same
    afterwards, so there is nothing to tell them it did not happen.
  */

  async function asGuest(page: any) {
    await mockTurnstile(page);
    await mockManagerPage(page, { loggedIn: false });
    await page.goto(URL);
    await expect(page.getByText(MOCK_MANAGER.name).first()).toBeVisible({ timeout: 10_000 });
  }

  /** Signs in through the modal the interrupted action opened. */
  async function signInThroughModal(page: any) {
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/auth\/signin/, (r: any) =>
      r.fulfill({ status: 200, json: { user: MOCK_USER } }));
    // The gate opens on sign-up; swap to sign-in first, then reveal that step's email form.
    await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("dialog").getByText(/continue with email/i).first().click();
    await page.getByRole("dialog").getByPlaceholder("Email or username").fill("testuser");
    await page.getByRole("dialog").getByPlaceholder("Password", { exact: true }).fill("Str0ng!pass");
    await page.getByRole("dialog").getByRole("button", { name: /^Sign In/ }).click();
  }

  test("a report written before signing in is still sent afterwards", async ({ page }) => {
    /*
      Reporting is a small act of trust - somebody is telling us a profile is wrong. Making them
      pick the reason a second time after an unexpected sign-in is the point at which most people
      close the tab, and the report never arrives.
    */
    let reported: any = null;
    await asGuest(page);
    await page.route(/\/report$/, (r: any) => {
      reported = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: /Report/i }).first().click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Submit Report/i }).click();

    await signInThroughModal(page);

    await expect(async () => expect(reported).not.toBeNull()).toPass({ timeout: 15_000 });
    expect(reported.reason).toBeTruthy();
  });

  test("signing in from an interrupted action does not send it twice", async ({ page }) => {
    // The action is resumed by the sign-in, and the form that triggered it is still mounted. Both
    // firing would file the same report twice under one person's name.
    let count = 0;
    await asGuest(page);
    await page.route(/\/report$/, (r: any) => {
      count++;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: /Report/i }).first().click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Submit Report/i }).click();
    await signInThroughModal(page);
    await expect(async () => expect(count).toBeGreaterThan(0)).toPass({ timeout: 15_000 });

    await page.waitForTimeout(1000);
    expect(count).toBe(1);
  });

  test("closing the sign-in instead of completing it abandons the action", async ({ page }) => {
    // Closing the modal is a decision not to sign in, so nothing should be sent on the reader's
    // behalf. The half-finished form stays where it was rather than resetting.
    let reported = false;
    await asGuest(page);
    await page.route(/\/report$/, (r: any) => {
      reported = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: /Report/i }).first().click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Submit Report/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(reported).toBe(false);
  });
});
