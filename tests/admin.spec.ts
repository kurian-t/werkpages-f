import { test, expect } from "./base";
import {
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_PENDING_ADMIN_MANAGER,
  MOCK_AUTO_CREATED_ADMIN_MANAGER,
  MOCK_EDIT_REQUEST,
  MOCK_BANNED_USER_ENTRY,
  MOCK_BANNABLE_USER,
  MOCK_ADMIN_COMPANIES,
  mockAdminPage,
} from "./fixtures";

test.describe("Admin Panel", () => {
  test.describe("Access control", () => {
    test("non-admin logged-in user sees Access Denied", async ({ page }) => {
      await mockAdminPage(page, { user: MOCK_USER as any });
      await page.goto("/admin");

      await expect(
        page.getByText(/access denied/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("unauthenticated user sees Access Denied", async ({ page }) => {
      // No auth mock — user is not logged in
      await page.route("**/api/auth/me", (route) =>
        route.fulfill({ status: 401, json: { error: "Unauthorized" } })
      );
      await page.goto("/admin");

      await expect(
        page.getByText(/access denied/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("admin user sees the full panel with tabs", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(
        page.getByRole("tab", { name: /pending managers/i })
          .or(page.getByText(/pending managers/i).first())
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Pending Managers tab", () => {
    test("shows pending manager submissions", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("VP Engineering")).toBeVisible();
    });

    test("empty state when no pending managers", async ({ page }) => {
      await mockAdminPage(page, { pendingManagers: [] });
      await page.goto("/admin");

      await expect(
        page.getByText(/no pending manager submissions/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("Approve button opens confirmation dialog", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /^approve$/i }).first().click();

      await expect(
        page.getByRole("heading", { name: /approve manager\?/i })
      ).toBeVisible({ timeout: 3_000 });
    });

    test("confirming Approve closes the confirmation dialog", async ({
      page,
    }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /^approve$/i }).first().click();
      await expect(
        page.getByRole("heading", { name: /approve manager\?/i })
      ).toBeVisible({ timeout: 3_000 });

      // Confirm in dialog
      await page
        .getByRole("button", { name: /^approve$/i })
        .last()
        .click();

      // Dialog should close after confirming
      await expect(
        page.getByRole("heading", { name: /approve manager\?/i })
      ).not.toBeVisible({ timeout: 5_000 });
    });

    test("Reject button opens confirmation dialog", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /^reject$/i }).first().click();

      await expect(
        page.getByRole("heading", { name: /reject manager\?/i })
      ).toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("Edit Requests tab", () => {
    test("shows edit requests", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /edit requests/i })
        .or(page.getByRole("button", { name: /edit requests/i }))
        .click();

      await expect(page.getByText("Alex Johnson")).toBeVisible({
        timeout: 5_000,
      });
    });

    test("empty state when no edit requests", async ({ page }) => {
      await mockAdminPage(page, { editRequests: [] });
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /edit requests/i })
        .or(page.getByRole("button", { name: /edit requests/i }))
        .click();

      await expect(
        page.getByText(/no pending edit requests/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("Approve edit button opens confirmation", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /edit requests/i })
        .or(page.getByRole("button", { name: /edit requests/i }))
        .click();

      await page.getByRole("button", { name: /^approve$/i }).first().click();

      await expect(
        page.getByRole("heading", { name: /approve edit\?/i })
      ).toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("Banned Users tab", () => {
    test("shows currently banned users", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /banned users/i })
        .or(page.getByRole("button", { name: /banned users/i }))
        .click();

      await expect(page.getByText("baduser")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Spam")).toBeVisible();
    });

    test("empty state when no banned users", async ({ page }) => {
      await mockAdminPage(page, { bannedUsers: [] });
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /banned users/i })
        .or(page.getByRole("button", { name: /banned users/i }))
        .click();

      await expect(
        page.getByText(/no banned users/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("ban form has user select and reason textarea", async ({ page }) => {
      await mockAdminPage(page, {
        allUsers: [MOCK_BANNABLE_USER],
        bannedUsers: [],
      });
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /banned users/i })
        .or(page.getByRole("button", { name: /banned users/i }))
        .click();

      await expect(
        page.getByText(/ban a user/i)
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("combobox").or(page.locator("select"))
      ).toBeVisible();
    });

    test("Unban button shows confirmation dialog", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /banned users/i })
        .or(page.getByRole("button", { name: /banned users/i }))
        .click();

      await page.getByRole("button", { name: /unban/i }).first().click();

      await expect(
        page.getByRole("heading", { name: /unban user\?/i })
      ).toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe("Merge Duplicates tab", () => {
    test("shows search input for managers", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /merge/i })
        .or(page.getByRole("button", { name: /merge/i }))
        .click();

      await expect(
        page.getByPlaceholder(/type a name/i)
          .or(page.getByLabel(/search managers/i))
      ).toBeVisible({ timeout: 5_000 });
    });

    test("searching shows similar managers", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page
        .getByRole("tab", { name: /merge/i })
        .or(page.getByRole("button", { name: /merge/i }))
        .click();

      await page.getByPlaceholder(/type a name/i).fill("Alex");

      await expect(page.getByText("Alex Johnson").first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  test.describe("Companies tab", () => {
    test("shows Companies tab button", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(
        page.getByRole("button", { name: /^companies$/i })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("Merge Companies section has search input", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.getByRole("button", { name: /^companies$/i }).click();

      await expect(
        page.getByPlaceholder(/type a company name/i)
      ).toBeVisible({ timeout: 5_000 });
    });

    test("company merge search shows matching results", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.getByRole("button", { name: /^companies$/i }).click();

      await page.getByPlaceholder(/type a company name/i).fill("acme");

      await expect(page.getByText("Acme Corp").first()).toBeVisible({ timeout: 5_000 });
    });

    test("selecting Keep and Remove enables the Merge Companies button", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.getByRole("button", { name: /^companies$/i }).click();

      const mergeSearchInput = page.getByPlaceholder(/type a company name/i);

      // Search for first company → assign as Keep
      await mergeSearchInput.fill("acme");
      await expect(page.getByText("Acme Corp").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^keep$/i }).first().click();

      // Search for second company → assign as Remove
      await mergeSearchInput.fill("skynet");
      await expect(page.getByText("Skynet Inc").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^remove$/i }).first().click();

      const mergeBtn = page.getByRole("button", { name: /merge companies/i });
      await expect(mergeBtn).not.toBeDisabled({ timeout: 3_000 });
    });

    test("Merge Companies button opens confirm dialog", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.getByRole("button", { name: /^companies$/i }).click();

      const mergeSearchInput = page.getByPlaceholder(/type a company name/i);

      await mergeSearchInput.fill("acme");
      await expect(page.getByText("Acme Corp").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^keep$/i }).first().click();

      await mergeSearchInput.fill("skynet");
      await expect(page.getByText("Skynet Inc").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^remove$/i }).first().click();

      await page.getByRole("button", { name: /merge companies/i }).click();

      await expect(
        page.getByRole("heading", { name: /merge companies\?/i })
      ).toBeVisible({ timeout: 3_000 });
    });

    test("confirming merge closes the dialog", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.getByRole("button", { name: /^companies$/i }).click();

      const mergeSearchInput = page.getByPlaceholder(/type a company name/i);

      await mergeSearchInput.fill("acme");
      await expect(page.getByText("Acme Corp").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^keep$/i }).first().click();

      await mergeSearchInput.fill("skynet");
      await expect(page.getByText("Skynet Inc").first()).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^remove$/i }).first().click();

      await page.getByRole("button", { name: /merge companies/i }).click();

      await expect(
        page.getByRole("heading", { name: /merge companies\?/i })
      ).toBeVisible({ timeout: 3_000 });

      // Confirm in dialog — use the dialog's confirm button (last match)
      await page.getByRole("button", { name: /^merge companies$/i }).last().click();

      await expect(
        page.getByRole("heading", { name: /merge companies\?/i })
      ).not.toBeVisible({ timeout: 5_000 });
    });

  });

  test.describe("Pending managers — auto-created badge and inline edit", () => {
    test("auto-created manager shows auto-created badge", async ({ page }) => {
      await mockAdminPage(page, {
        pendingManagers: [MOCK_AUTO_CREATED_ADMIN_MANAGER],
      });
      await page.goto("/admin");

      await expect(page.getByText("Go Person")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/auto-created/i)).toBeVisible();
    });

    test("non-auto-created manager does not show auto-created badge", async ({ page }) => {
      await mockAdminPage(page, {
        pendingManagers: [MOCK_PENDING_ADMIN_MANAGER],
      });
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/auto-created/i)).not.toBeVisible();
    });

    test("pencil button reveals inline edit inputs pre-filled with current values", async ({ page }) => {
      await mockAdminPage(page);
      await page.goto("/admin");

      await expect(page.getByText("John Doe")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /edit manager/i }).first().click();

      const nameInput = page.getByPlaceholder("Manager name");
      const titleInput = page.getByPlaceholder("Job title");
      const companyInput = page.getByPlaceholder("Company");
      await expect(nameInput).toBeVisible({ timeout: 3_000 });
      await expect(titleInput).toBeVisible();
      await expect(companyInput).toBeVisible();
      await expect(nameInput).toHaveValue("John Doe");
      await expect(titleInput).toHaveValue("VP Engineering");
      await expect(companyInput).toHaveValue("Foo Inc");
    });

    test("saving inline edit calls PUT /api/admin/managers/:id and updates the card", async ({ page }) => {
      let putBody: any = null;
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.route(`**/api/admin/managers/${MOCK_PENDING_ADMIN_MANAGER.id}`, async (route) => {
        if (route.request().method() === "PUT") {
          putBody = route.request().postDataJSON();
          await route.fulfill({
            json: { success: true, name: "John Updated", company: "New Corp" },
          });
        } else {
          await route.continue();
        }
      });

      await expect(page.getByText("John Doe")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /edit manager/i }).first().click();
      await page.getByPlaceholder("Manager name").fill("John Updated");
      await page.getByPlaceholder("Job title").fill("CTO");
      await page.getByPlaceholder("Company").fill("New Corp");
      await page.getByRole("button", { name: /^save$/i }).click();

      await expect(page.getByText("John Updated")).toBeVisible({ timeout: 3_000 });
      expect(putBody).toMatchObject({ name: "John Updated", title: "CTO", company: "New Corp" });
    });

    test("cancel button exits edit mode without calling the API", async ({ page }) => {
      let putCalled = false;
      await mockAdminPage(page);
      await page.goto("/admin");

      await page.route(`**/api/admin/managers/**`, async (route) => {
        if (route.request().method() === "PUT") {
          putCalled = true;
        }
        await route.continue();
      });

      await expect(page.getByText("John Doe")).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /edit manager/i }).first().click();
      await expect(page.getByPlaceholder("Manager name")).toBeVisible({ timeout: 3_000 });

      await page.getByRole("button", { name: /^cancel$/i }).click({ force: true });

      await expect(page.getByPlaceholder("Manager name")).not.toBeVisible({ timeout: 3_000 });
      await expect(page.getByText("John Doe")).toBeVisible();
      expect(putCalled).toBe(false);
    });
  });
});
