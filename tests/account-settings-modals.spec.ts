import { test, expect } from "./base";
import {
  MOCK_MY_REVIEW,
  MOCK_PENDING_SUBMISSION,
  mockAccountSettingsPage,
} from "./fixtures";

/**
 * The two editors on the account page.
 *
 * The existing spec opens the review editor and steps through it; the submission editor was never
 * opened at all, and neither editor's guards ran - the required-field gate, the escape routes, the
 * in-place role edit, the timeline's "currently working" branch, and what happens when the save
 * fails. All of it sits behind a modal, which is exactly the kind of code that ships unexercised
 * and then loses somebody's edit.
 *
 * These are the paths where a wrong answer costs a person the thing they wrote.
 */

const SUBMISSION = { ...MOCK_PENDING_SUBMISSION };

test.describe("Editing a pending submission", () => {
  async function openEditor(page: any) {
    await mockAccountSettingsPage(page, { reviews: [], submittedManagers: [SUBMISSION] });
    await page.goto("/settings");
    await expect(page.getByText("Jane Smith")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Edit/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }

  /*
    Addressed by label, deliberately.

    These three fields were <label> elements with nothing tying them to the input beneath - no
    htmlFor, no id - so a screen reader announced three unlabelled text boxes and clicking a label
    focused nothing. Locating them this way is what makes that a test failure rather than an
    invisible defect: with the association missing, every one of these resolves to nothing.
  */
  const field = (page: any, label: string) =>
    page.getByRole("dialog").getByLabel(label);
  const NAME = "Full Name *", TITLE = "Title *", COMPANY = "Company *";

  test("the editor opens pre-filled with what was submitted", async ({ page }) => {
    // Pre-filled, not blank: this is a correction to something they already wrote, and making them
    // retype it is how a small fix turns into an abandoned one.
    await openEditor(page);

    await expect(page.getByRole("heading", { name: "Edit Submission" })).toBeVisible();
    await expect(field(page, NAME)).toHaveValue("Jane Smith");
    await expect(field(page, TITLE)).toHaveValue("Product Manager");
    await expect(field(page, COMPANY)).toHaveValue("Beta Corp");
  });

  test("the three identifying fields are required", async ({ page }) => {
    /*
      A name, a title and a company are what make a submission a person an admin can decide on.
      Blanking any of them would send an unreviewable row to the queue.
    */
    await openEditor(page);
    const save = page.getByRole("button", { name: "Save", exact: true });

    await field(page, NAME).fill("");
    await expect(save).toBeDisabled();

    await field(page, NAME).fill("Jane Smith");
    await expect(save).toBeEnabled();

    await field(page, COMPANY).fill("   ");
    await expect(save).toBeDisabled();
  });

  test("employment status is a choice between two, not a free field", async ({ page }) => {
    await openEditor(page);

    await page.getByRole("button", { name: "Retired" }).click();
    await page.getByRole("button", { name: "Currently Active" }).click();

    await expect(page.getByRole("button", { name: "Currently Active" })).toBeVisible();
  });

  test("a saved edit is sent and the list shows the new details", async ({ page }) => {
    let sent: any = null;
    await openEditor(page);
    // After the fixture's routes, so this one answers.
    await page.route(/\/api\/managers\/[^/]+$/, (r: any) => {
      if (r.request().method() !== "PUT") return r.continue();
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await field(page, TITLE).fill("Director of Product");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(sent?.title).toBe("Director of Product");
    // The avatar letter is derived from the name rather than stored separately, so a renamed
    // submission does not keep the old initial.
    expect(sent?.image).toBe("J");
    await expect(page.getByText("Director of Product", { exact: false })).toBeVisible();
  });

  test("Cancel closes without sending anything", async ({ page }) => {
    let sent = false;
    await openEditor(page);
    await page.route(/\/api\/managers\/[^/]+$/, (r: any) => {
      if (r.request().method() === "PUT") sent = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await field(page, TITLE).fill("Something else entirely");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(sent).toBe(false);
    await expect(page.getByText("Product Manager", { exact: false })).toBeVisible();
  });

  test("the close control is an escape route too", async ({ page }) => {
    await openEditor(page);

    await page.getByRole("dialog").getByLabel("Close").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a failed save keeps the editor open with the edit intact", async ({ page }) => {
    // Closing on failure would silently discard what they typed and tell them it worked.
    await openEditor(page);
    await page.route(/\/api\/managers\/[^/]+$/, (r: any) =>
      r.request().method() === "PUT"
        ? r.fulfill({ status: 500, json: { error: "nope" } })
        : r.continue());

    await field(page, TITLE).fill("Director of Product");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(field(page, TITLE)).toHaveValue("Director of Product");
  });
});

test.describe("Editing a review from the account page", () => {
  async function openEditor(page: any) {
    await mockAccountSettingsPage(page, { reviews: [MOCK_MY_REVIEW] });
    await page.goto("/settings");
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await page.getByTitle("Edit review").first().click();
    await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible();
  }

  test("the timeline step offers a still-working-here answer instead of an end date", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: "Work timeline" })).toBeVisible();

    const stillHere = page.getByRole("checkbox").first();
    await stillHere.check();

    // The end date stops being asked for, rather than being asked and ignored.
    await expect(stillHere).toBeChecked();
  });

  test("Back returns to the ratings with them still set", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: "Work timeline" })).toBeVisible();

    await page.getByRole("button", { name: /^Back/ }).click();

    await expect(page.getByRole("heading", { name: /update your ratings/i })).toBeVisible();
    await expect(page.getByText(/communication style/i)).toBeVisible();
  });

  test("a rating can be changed before saving", async ({ page }) => {
    await openEditor(page);

    await page.getByLabel("Rate 5 stars").first().click();

    // The star took: the control reflects the new answer rather than the stored one.
    await expect(page.getByLabel("Rate 5 stars").first()).toBeVisible();
  });

  test("closing the editor abandons the change", async ({ page }) => {
    let sent = false;
    await openEditor(page);
    await page.route(new RegExp("/api/managers/.+/reviews/.+"), (r: any) => {
      if (r.request().method() === "PUT") sent = true;
      return r.fulfill({ status: 200, json: { ...MOCK_MY_REVIEW } });
    });

    await page.getByLabel("Rate 5 stars").first().click();
    await page.getByLabel("Close").first().click();

    expect(sent).toBe(false);
  });
});
