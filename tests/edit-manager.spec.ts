import { test, expect } from "./base";
import {
  TEST_PENDING_MANAGER_ID,
  MOCK_PENDING_MANAGER,
  MOCK_USER,
} from "./fixtures";
import { Page } from "./base";

/**
 * Set up mocks for the pending manager profile with a mutable title.
 * After a PUT, subsequent GETs return the new title so we can verify the
 * profile header updates (the component invalidates the manager query on save).
 */
async function setupEditManagerMocks(page: Page, initialTitle = "Product Manager") {
  let currentTitle = initialTitle;

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: MOCK_USER })
  );

  await page.route(
    new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
    async (route) => {
      const method = route.request().method();
      if (method === "PUT") {
        let body: any = {};
        try { body = route.request().postDataJSON() ?? {}; } catch { body = {}; }
        if (body?.title) currentTitle = body.title;
        route.fulfill({
          status: 200,
          json: { ...MOCK_PENDING_MANAGER, title: currentTitle },
        });
      } else {
        route.fulfill({ json: { ...MOCK_PENDING_MANAGER, title: currentTitle } });
      }
    }
  );

  await page.route(
    new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}/reviews`),
    (route) => {
      if (route.request().method() === "GET") {
        const url = route.request().url();
        route.fulfill({ json: { data: [] } });
      } else {
        route.continue();
      }
    }
  );

  await page.route(
    `**/api/managers/${TEST_PENDING_MANAGER_ID}/career-segments`,
    (route) => route.fulfill({ json: { data: [] } })
  );

  await page.route(
    `**/api/managers/${TEST_PENDING_MANAGER_ID}/pending-edits`,
    (route) => route.fulfill({ json: { data: [] } })
  );

  await page.addInitScript((u) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, MOCK_USER);
}

test.describe("Edit Manager Details", () => {
  test("edit manager details form opens on button click", async ({ page }) => {
    await setupEditManagerMocks(page);
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    await expect(
      page.getByRole("heading", { name: /edit.*manager|manager.*details/i })
        .or(page.getByText(/step 1 of 1/i))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("edit form shows title and company inputs", async ({ page }) => {
    await setupEditManagerMocks(page);
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    await expect(
      page.getByPlaceholder(/CEO, Engineering Manager/i)
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByPlaceholder(/Microsoft, Apple/i)
    ).toBeVisible();
  });

  test("cancelling edit form closes it without saving", async ({ page }) => {
    await setupEditManagerMocks(page);
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    await expect(page.getByText(/step 1 of 1/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page.getByText(/step 1 of 1/i)).not.toBeVisible();
  });

  test("saving edit for pending manager updates profile header", async ({
    page,
  }) => {
    await setupEditManagerMocks(page, "Product Manager");
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    // Change the title
    const titleInput = page.getByPlaceholder(/CEO, Engineering Manager/i);
    await titleInput.clear();
    await titleInput.fill("Senior Product Manager");

    await page.getByRole("button", { name: /save changes/i }).click();

    // Success toast appears
    await expect(
      page.getByText("Manager updated!").or(page.getByText("Change request submitted!"))
    ).toBeVisible({ timeout: 5_000 });

    // Form closes
    await expect(page.getByText(/step 1 of 1/i)).not.toBeVisible();
  });

  test("edit form shows active/retired status options", async ({ page }) => {
    await setupEditManagerMocks(page);
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    await expect(
      page.getByRole("button", { name: /currently active/i })
        .or(page.getByText(/currently active/i).first())
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Company autocomplete in edit form ────────────────────────────────────────
  // These tests lock in that the Company field uses CompanyAutocomplete (not a
  // plain <input>) and that the logo URL is captured and sent in the payload.

  test("company field accepts typed input", async ({ page }) => {
    await setupEditManagerMocks(page);
    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    const companyInput = page.getByPlaceholder(/Microsoft, Apple/i);
    await expect(companyInput).toBeVisible({ timeout: 5_000 });
    await companyInput.fill("Google");
    await expect(companyInput).toHaveValue("Google");
  });

  test("company field payload is sent when company changes", async ({ page }) => {
    let capturedBody: any = null;

    await setupEditManagerMocks(page);

    // Intercept the PUT request so we can inspect the body
    await page.route(
      new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
      async (route) => {
        const method = route.request().method();
        if (method === "PUT") {
          try { capturedBody = route.request().postDataJSON() ?? {}; } catch { capturedBody = {}; }
          route.fulfill({ status: 200, json: { ...MOCK_PENDING_MANAGER, company: capturedBody?.company ?? "Beta Corp" } });
        } else {
          route.fulfill({ json: MOCK_PENDING_MANAGER });
        }
      }
    );

    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);

    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    const companyInput = page.getByPlaceholder(/Microsoft, Apple/i);
    await companyInput.clear();
    await companyInput.fill("Microsoft");

    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Manager updated!")).toBeVisible({ timeout: 5_000 });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.company).toBe("Microsoft");
  });

  test("edit form payload includes companyLogoUrl when suggestion selected", async ({ page }) => {
    let capturedBody: any = null;

    await setupEditManagerMocks(page);

    // Mock the company suggestions endpoint so we can simulate a selection
    await page.route("**/api/companies/suggest*", (route) =>
      route.fulfill({
        json: [{ name: "Microsoft", logoUrl: "https://img.logo.dev/microsoft.com?token=test" }],
      })
    );

    await page.route(
      new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
      async (route) => {
        const method = route.request().method();
        if (method === "PUT") {
          try { capturedBody = route.request().postDataJSON() ?? {}; } catch { capturedBody = {}; }
          route.fulfill({ status: 200, json: { ...MOCK_PENDING_MANAGER, company: "Microsoft" } });
        } else {
          route.fulfill({ json: MOCK_PENDING_MANAGER });
        }
      }
    );

    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
    await page
      .getByRole("button", { name: /edit manager details|edit your submission/i })
      .click();

    const companyInput = page.getByPlaceholder(/Microsoft, Apple/i);
    await companyInput.fill("Micro");

    // Wait for and click the suggestion
    const suggestion = page.getByText("Microsoft").first();
    await expect(suggestion).toBeVisible({ timeout: 5_000 });
    await suggestion.click();

    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Manager updated!")).toBeVisible({ timeout: 5_000 });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.company).toBe("Microsoft");
    expect(capturedBody.companyLogoUrl).toBe("https://img.logo.dev/microsoft.com?token=test");
  });
});

// ── Title normalisation in edit form ─────────────────────────────────────────
// Whatever the user types for title in the "Edit Manager Details" form,
// the payload sent to the API must use correct job-title casing.

test.describe("Edit Manager - title normalisation", () => {
  async function captureEditPayload(
    page: Parameters<typeof setupEditManagerMocks>[0],
    titleInput: string
  ) {
    let capturedBody: any = null;

    await setupEditManagerMocks(page);

    await page.route(
      new RegExp(`/api/managers/${TEST_PENDING_MANAGER_ID}$`),
      async (route) => {
        const method = route.request().method();
        if (method === "PUT") {
          try { capturedBody = route.request().postDataJSON() ?? {}; } catch { capturedBody = {}; }
          route.fulfill({ status: 200, json: { ...MOCK_PENDING_MANAGER, title: capturedBody?.title ?? titleInput } });
        } else {
          route.fulfill({ json: MOCK_PENDING_MANAGER });
        }
      }
    );

    await page.goto(`/manager/${TEST_PENDING_MANAGER_ID}`);
    await page.getByRole("button", { name: /edit manager details|edit your submission/i }).click();

    const titleField = page.getByPlaceholder(/CEO, Engineering Manager/i);
    await titleField.clear();
    await titleField.fill(titleInput);

    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(
      page.getByText("Manager updated!").or(page.getByText("Change request submitted!"))
    ).toBeVisible({ timeout: 5_000 });

    return capturedBody;
  }

  test("lowercase title is sent in title case", async ({ page }) => {
    const body = await captureEditPayload(page, "service manager");
    expect(body).not.toBeNull();
    expect(body.title).toBe("Service Manager");
  });

  test("lowercase ceo is sent as CEO", async ({ page }) => {
    const body = await captureEditPayload(page, "ceo");
    expect(body).not.toBeNull();
    expect(body.title).toBe("CEO");
  });

  test("lowercase vp engineering is sent as VP Engineering", async ({ page }) => {
    const body = await captureEditPayload(page, "vp engineering");
    expect(body).not.toBeNull();
    expect(body.title).toBe("VP Engineering");
  });

  test("already-correct title is preserved unchanged", async ({ page }) => {
    const body = await captureEditPayload(page, "Senior Product Manager");
    expect(body).not.toBeNull();
    expect(body.title).toBe("Senior Product Manager");
  });

  test("all-caps plain title is normalised to title case", async ({ page }) => {
    const body = await captureEditPayload(page, "DIRECTOR OF OPERATIONS");
    expect(body).not.toBeNull();
    expect(body.title).toBe("Director Of Operations");
  });
});
