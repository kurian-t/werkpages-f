import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  mockManagerPage,
} from "./fixtures";

/**
 * Correcting a manager's details, and the two quite different things that can mean.
 *
 * A live profile is other people's reading material, so a change to it is a *request* an admin
 * decides on. A profile still awaiting approval is nobody's reading material yet, so its submitter
 * edits it directly - sending their own unpublished draft through a review queue would be asking
 * permission to fix a typo in something not yet published.
 *
 * Two endpoints, two outcomes, and the form has to pick correctly. Neither path was covered.
 */

const CONTRIBUTOR = { ...MOCK_USER, hasContributed: true };

async function openEditor(page: any, manager = MOCK_MANAGER) {
  await mockManagerPage(page, { manager, loggedIn: true, user: CONTRIBUTOR });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByRole("heading", { name: manager.name, exact: true }))
    .toBeVisible({ timeout: 10_000 });
  await page.locator("button").filter({ hasText: /edit manager details/i }).first().click();
  await expect(page.getByText(/Step 1 of 1/)).toBeVisible({ timeout: 10_000 });
}

test.describe("Editing a live manager", () => {
  test("submits a change request rather than overwriting the profile", async ({ page }) => {
    /*
      The profile is live, so this is a proposal. Writing straight through would let anyone rewrite
      a published person's title and employer with no review at all.
    */
    let requested: any = null;
    let overwrote = false;
    await openEditor(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/edit-requests`), (r: any) => {
      requested = r.request().postDataJSON();
      return r.fulfill({ status: 201, json: { success: true } });
    });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) => {
      if (r.request().method() === "PUT") overwrote = true;
      return r.fulfill({ json: MOCK_MANAGER });
    });

    const title = page.locator("input[type='text']").first();
    await title.fill("Director of Engineering");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/submitted for admin approval/i)).toBeVisible({ timeout: 10_000 });
    expect(overwrote).toBe(false);
    // Title case is applied on the way out, and minor words stay lowercase.
    expect(requested?.title).toBe("Director of Engineering");
  });

  test("only the fields that actually changed are sent", async ({ page }) => {
    /*
      An admin reviewing a change request is deciding on a diff. Sending every field whether or not
      it moved turns a one-line correction into a wall, and makes an unchanged value look like a
      proposed one.
    */
    let requested: any = null;
    await openEditor(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/edit-requests`), (r: any) => {
      requested = r.request().postDataJSON();
      return r.fulfill({ status: 201, json: { success: true } });
    });

    await page.locator("input[type='text']").first().fill("Staff Engineer");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/submitted for admin approval/i)).toBeVisible({ timeout: 10_000 });
    expect(requested).toHaveProperty("title");
    expect(requested).not.toHaveProperty("status");
  });

  test("a failed request says so and keeps the form open", async ({ page }) => {
    // Closing on failure would tell somebody their correction was filed when it was not.
    await openEditor(page);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/edit-requests`), (r: any) =>
      r.fulfill({ status: 500, json: { error: "nope" } }));

    await page.locator("input[type='text']").first().fill("Principal Engineer");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/failed to save changes/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 1 of 1/)).toBeVisible();
  });

  test("Save is refused while a required field is empty", async ({ page }) => {
    // A title or company blanked to nothing is not a correction, it is data loss.
    await openEditor(page);

    await page.locator("input[type='text']").first().fill("");

    await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });
});

test.describe("Editing a manager still awaiting approval", () => {
  const PENDING = { ...MOCK_MANAGER, approvalStatus: "pending_approval" };

  test("writes straight through, with no approval queue in between", async ({ page }) => {
    /*
      Nobody can read it yet, so there is nothing to protect and nobody to ask. Routing this
      through the edit-request queue would make somebody wait on an admin to fix their own
      unpublished draft.
    */
    let written: any = null;
    let requested = false;
    await openEditor(page, PENDING);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/edit-requests`), (r: any) => {
      requested = true;
      return r.fulfill({ status: 201, json: { success: true } });
    });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) => {
      if (r.request().method() !== "PUT") return r.fulfill({ json: PENDING });
      written = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.locator("input[type='text']").first().fill("Head of Platform");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(async () => expect(written).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(requested).toBe(false);
    expect(written.title).toBe("Head of Platform");
  });

  test("the whole row goes, not just the diff", async ({ page }) => {
    // Overwriting a draft is not a proposal an admin reads, so there is no diff to preserve - the
    // record is simply replaced with what its author now says.
    let written: any = null;
    await openEditor(page, PENDING);
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}$`), (r: any) => {
      if (r.request().method() !== "PUT") return r.fulfill({ json: PENDING });
      written = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.locator("input[type='text']").first().fill("Head of Platform");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(async () => expect(written).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(written).toHaveProperty("title");
    expect(written).toHaveProperty("status");
  });
});
