import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_ADMIN_USER,
  mockManagerPage,
} from "./fixtures";

/**
 * Removing a career stage that has no career_history row behind it.
 *
 * A manager's profile carried a stage at a company called "Ro". No such company existed: somebody
 * typed "ROCKY MOUNTAIN TURF CLUB" into the manager form, a placeholder review was created from the
 * fragment, and because the trajectory groups reviews by their manager_company that fragment drew a
 * whole career stage with its own rating next to the real employer.
 *
 * The admin had Edit on it and no Delete, because Delete required a career_history row and this
 * stage had none. Removing it took hand-written SQL against the production database.
 *
 * Most stages are like this. The row-backed ones are the exception, so gating the control on a row
 * meant the control was missing precisely where the junk accumulates.
 */

const SEGMENTS = [
  {
    company: "Ro", role: "Co-Founder and Chief Executive Officer",
    startDate: "2025-01", endDate: null, isCurrent: true,
    averageRating: 4.1, reviewCount: 1, categoryAverages: {},
    // No careerHistoryId. This is the whole point: the stage exists only because a review named it.
    careerHistoryId: null,
  },
  {
    company: "ROCKY MOUNTAIN TURF CLUB", role: "Chief Executive Officer",
    startDate: "2017-11", endDate: null, isCurrent: true,
    averageRating: 1.1, reviewCount: 1, categoryAverages: {},
    careerHistoryId: null,
  },
];

async function openProfile(page: any) {
  const who = { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true };
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, { manager: { ...MOCK_MANAGER }, loggedIn: true, user: who });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`), (r: any) =>
    r.fulfill({ json: { data: [] } }));
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
    r.fulfill({ json: { data: SEGMENTS } }));
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

test.describe("Removing a career stage with no career-history row", () => {
  test("an admin is offered Delete on it at all", async ({ page }) => {
    /*
      The regression test. Before the fix this stage rendered Edit and nothing else, so there was
      no way to remove an invented company from the product.
    */
    await openProfile(page);
    await expect(page.getByRole("button", { name: "Delete Ro career entry" }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("it asks what to do with the ratings rather than destroying them", async ({ page }) => {
    /*
      The stage holds a rating. Deleting it silently would mean an admin tidying a chart could
      destroy somebody's genuine review without being told, so the dialog states the count and
      offers to move them instead.
    */
    await openProfile(page);
    await page.getByRole("button", { name: "Delete Ro career entry" }).first().click();

    const dialog = page.getByTestId("career-stage-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("1 review");
    await expect(dialog.getByRole("button", { name: /Delete role and ratings/i })).toBeVisible();
    await expect(dialog.getByRole("combobox")).toBeVisible();
  });

  test("deleting the stage posts the company, not an entry id", async ({ page }) => {
    /*
      The id is what the old endpoint needed and what this stage does not have. The company is the
      only thing that identifies it, because that is what the chart grouped on.
    */
    let body: any = null;
    await openProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, reviewsAffected: 1 } });
    });

    await page.getByRole("button", { name: "Delete Ro career entry" }).first().click();
    await page.getByTestId("career-stage-dialog")
      .getByRole("button", { name: /Delete role and ratings/i }).click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.action).toBe("delete");
    expect(body.company).toBe("Ro");
    // Sent deliberately: the server refuses to destroy genuine reviews unless the caller confirms
    // it was told. The dialog has just shown the count, so it can.
    expect(body.confirmRealReviews).toBe(true);
  });

  test("moving the ratings sends the chosen destination role", async ({ page }) => {
    let body: any = null;
    await openProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, reviewsAffected: 1 } });
    });

    await page.getByRole("button", { name: "Delete Ro career entry" }).first().click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByRole("combobox").selectOption("ROCKY MOUNTAIN TURF CLUB");
    await dialog.getByRole("button", { name: /Move ratings/i }).click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.action).toBe("reassign");
    expect(body.company).toBe("Ro");
    expect(body.toCompany).toBe("ROCKY MOUNTAIN TURF CLUB");
  });

  test("Move ratings stays disabled until a destination is chosen", async ({ page }) => {
    // Otherwise the obvious first click sends a reassign with nowhere to go.
    await openProfile(page);
    await page.getByRole("button", { name: "Delete Ro career entry" }).first().click();
    await expect(page.getByTestId("career-stage-dialog")
      .getByRole("button", { name: /Move ratings/i })).toBeDisabled();
  });
});
