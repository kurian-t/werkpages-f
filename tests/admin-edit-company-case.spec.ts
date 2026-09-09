import { test, expect } from "./base";
import { MOCK_MANAGER, MOCK_ADMIN_USER, TEST_MANAGER_ID, mockManagerPage } from "./fixtures";

/**
 * Correcting a company's capitalisation from the manager profile.
 *
 * This was broken and nothing caught it, because the break was entirely client-side: the backend
 * stored whatever it was sent, and it was being sent the old value. Company names are unique
 * case-insensitively, so resolving "Central Rock Gym" returns the *existing* "Central rock gym"
 * row - and the form was taking its display text from that response rather than from what the
 * admin typed. Save persisted the value that was already there and the page did not move, so the
 * button looked dead.
 *
 * The assertion that matters is on the request body: the typed casing goes out, and the existing
 * company's id goes with it so a rename cannot fork a second company.
 */

const STORED_NAME = "acme corp";
const TYPED_NAME = "Acme Corp";
const COMPANY_ID = 9;

async function openAdminEdit(page: any) {
  const manager = { ...MOCK_MANAGER, company: STORED_NAME, companyId: COMPANY_ID };
  await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER, manager });

  // Resolving a name that already exists hands back the stored row, under its stored casing.
  // This is the response that used to overwrite the admin's correction.
  await page.route("**/api/companies", (route: any) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { id: COMPANY_ID, name: STORED_NAME } })
      : route.fallback(),
  );

  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await page.getByTestId("admin-edit-button").click();
  return page.locator('input[name="adminEditCompany"]');
}

test.describe("Admin edit - company capitalisation", () => {
  test("saves the casing the admin typed, not the casing already stored", async ({ page }) => {
    const companyInput = await openAdminEdit(page);

    let sent: any = null;
    await page.route(`**/api/admin/managers/${TEST_MANAGER_ID}`, (route: any) => {
      sent = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await companyInput.fill(TYPED_NAME);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(() => sent).not.toBeNull();
    expect(sent.company).toBe(TYPED_NAME);
  });

  test("keeps the existing company's id, so a rename does not fork a second company", async ({ page }) => {
    const companyInput = await openAdminEdit(page);

    let sent: any = null;
    await page.route(`**/api/admin/managers/${TEST_MANAGER_ID}`, (route: any) => {
      sent = route.request().postDataJSON();
      route.fulfill({ json: { success: true } });
    });

    await companyInput.fill(TYPED_NAME);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(() => sent).not.toBeNull();
    expect(sent.companyId).toBe(COMPANY_ID);
  });

  test("reports the save rather than closing silently", async ({ page }) => {
    // "Nothing happened" was the symptom. A save that changes nothing visible still has to say
    // it happened, or the next person reports the button as broken all over again.
    const companyInput = await openAdminEdit(page);
    await page.route(`**/api/admin/managers/${TEST_MANAGER_ID}`, (route: any) =>
      route.fulfill({ json: { success: true } }),
    );

    await companyInput.fill(TYPED_NAME);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Manager updated")).toBeVisible({ timeout: 10_000 });
  });

  test("surfaces a failed save instead of appearing to succeed", async ({ page }) => {
    const companyInput = await openAdminEdit(page);
    await page.route(`**/api/admin/managers/${TEST_MANAGER_ID}`, (route: any) =>
      route.fulfill({ status: 500, json: { error: "boom" } }),
    );

    await companyInput.fill(TYPED_NAME);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Failed to save changes")).toBeVisible({ timeout: 10_000 });
  });
});
