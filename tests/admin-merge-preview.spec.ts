import { test, expect } from "./base";
import { MOCK_ADMIN_USER } from "./fixtures";

/**
 * The merge preview on the admin panel.
 *
 * A merge moves managers, career history, interview experiences and aliases, retires a company and
 * rewrites URLs. An admin used to be asked to confirm all of that with nothing on screen but two
 * company names and a warning that was factually wrong. This is the screen that tells them what
 * they are about to do, and stops them when it cannot be done safely.
 */

const COMPANIES = [
  { id: 1, name: "Crumbl", slug: "crumbl", managerCount: 12, totalReviews: 40 },
  { id: 2, name: "Crumbl Cookies", slug: "crumbl-cookies", managerCount: 3, totalReviews: 8 },
];

const SAFE_PREVIEW = {
  keepName: "Crumbl", mergeName: "Crumbl Cookies",
  managers: 3, careerEntries: 5, interviews: 2, aliases: 1, pendingEdits: 0,
  interviewConflicts: 0, duplicateManagers: 0, blocked: false,
};

async function openMergeTab(page: any, preview: any) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_ADMIN_USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_ADMIN_USER }));
  // Playwright matches routes in REVERSE registration order, so the catch-all is registered first
  // and the specific routes after it. Registered the other way round, "**/api/admin/**" swallows
  // the company list and the search returns nothing.
  await page.route("**/api/admin/**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/admin/companies**", (r: any) => r.fulfill({ json: { data: COMPANIES } }));
  await page.route("**/api/admin/companies/*/merge/*/preview", (r: any) => r.fulfill({ json: preview }));
  await page.goto("/admin");
  await page.getByRole("button", { name: /^Companies$/ }).first().click();
}

test.describe("Admin company merge preview", () => {
  test("the confirmation shows what would actually move", async ({ page }) => {
    await openMergeTab(page, SAFE_PREVIEW);

    await page.getByPlaceholder("Type a company name...").fill("crumbl");
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: "Remove" }).nth(1).click();
    await page.getByRole("button", { name: "Merge Companies" }).last().click();

    const preview = page.getByTestId("merge-preview");
    await expect(preview.getByText("What moves")).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText("3 managers")).toBeVisible();
    await expect(preview.getByText("2 interview experiences")).toBeVisible();
  });

  test("it no longer claims the company is deleted or the merge irreversible", async ({ page }) => {
    // Both statements were true of the old merge and are false of this one. Leaving them would
    // teach an admin to expect the wrong thing from a destructive-looking button.
    await openMergeTab(page, SAFE_PREVIEW);

    await page.getByPlaceholder("Type a company name...").fill("crumbl");
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: "Remove" }).nth(1).click();
    await page.getByRole("button", { name: "Merge Companies" }).last().click();

    const preview = page.getByTestId("merge-preview");
    await expect(preview.getByText("What moves")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/permanently deleted/i)).toHaveCount(0);
    await expect(page.getByText(/cannot be undone/i)).toHaveCount(0);
    await expect(preview.getByText(/retired rather than deleted/i)).toBeVisible();
  });

  test("a blocked merge explains itself and cannot be confirmed", async ({ page }) => {
    await openMergeTab(page, { ...SAFE_PREVIEW, interviewConflicts: 2, blocked: true });

    await page.getByPlaceholder("Type a company name...").fill("crumbl");
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: "Remove" }).nth(1).click();
    await page.getByRole("button", { name: "Merge Companies" }).last().click();

    const preview = page.getByTestId("merge-preview");
    await expect(preview.getByText(/Cannot merge:/)).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText(/same person reviewed interviewing at both companies/)).toBeVisible();

    // The confirm button is the one inside the dialog, not the one that opened it.
    const confirm = page.getByRole("button", { name: "Merge Companies" }).last();
    await expect(confirm).toBeDisabled();
  });

  test("duplicate managers are surfaced as a warning, not a blocker", async ({ page }) => {
    // Company identity and manager identity are separate problems; merging companies deliberately
    // does not merge managers, so this informs rather than stops.
    await openMergeTab(page, { ...SAFE_PREVIEW, duplicateManagers: 2 });

    await page.getByPlaceholder("Type a company name...").fill("crumbl");
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: "Remove" }).nth(1).click();
    await page.getByRole("button", { name: "Merge Companies" }).last().click();

    await expect(page.getByTestId("merge-preview").getByText(/appear.*under both companies/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Merge Companies" }).last()).toBeEnabled();
  });
});
