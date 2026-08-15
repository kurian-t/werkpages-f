/**
 * Fourth wave of targeted Playwright coverage tests.
 * Targets remaining uncovered paths in:
 *   BossProfile (admin sections, report modal, complete edit review),
 *   Admin (merge tab, AI suggestions tab, live profiles tab, companies tab, reject-manager textarea),
 *   Directory (pagination),
 *   CompanyProfile (invalid name search, anonymous ghost creation),
 *   Companies (suggestion select)
 */
import { test, expect } from "./base";
import {
  MOCK_USER,
  MOCK_ADMIN_USER,
  MOCK_MANAGER,
  MOCK_COMPANY_LISTING,
  MOCK_COMPANY_PROFILE,
  MOCK_EXISTING_REVIEW,
  MOCK_PENDING_ADMIN_MANAGER,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_SLUG,
  mockManagerPage,
  mockAdminPage,
} from "./fixtures";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mockCompanyProfileRoutes(
  page: any,
  opts: { loggedIn?: boolean; hasContributed?: boolean } = {}
) {
  const { loggedIn = false, hasContributed = false } = opts;
  await page.route("**/api/auth/me", (route: any) =>
    loggedIn
      ? route.fulfill({ json: { ...MOCK_USER, hasContributed } })
      : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
  if (loggedIn) {
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, { ...MOCK_USER, hasContributed });
  }
  await page.route(/\/api\/companies\/by-slug/, (route: any) =>
    route.fulfill({ json: MOCK_COMPANY_PROFILE })
  );
  await page.route(/\/api\/companies\/by-name/, (route: any) =>
    route.fulfill({ json: MOCK_COMPANY_PROFILE })
  );
  await page.route("**/api/companies/suggest**", (route: any) =>
    route.fulfill({ json: [] })
  );
  await page.route(/\/api\/users\/me\/has-contributed/, (route: any) =>
    route.fulfill({ json: { hasContributed } })
  );
  await page.route(/\/api\/geo/, (route: any) =>
    route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
  );
}

// ─── BossProfile — Admin-only sections ───────────────────────────────────────

test.describe("BossProfile — admin edit section", () => {
  test("admin user sees Edit and Delete buttons on profile", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      user: MOCK_ADMIN_USER,
    });
    // Mock admin-specific routes
    await page.route(/\/api\/admin\/managers/, (route: any) => {
      if (route.request().method() === "PUT") {
        route.fulfill({ status: 200, json: { ...MOCK_MANAGER } });
      } else if (route.request().method() === "DELETE") {
        route.fulfill({ status: 200, json: { success: true } });
      } else {
        route.continue();
      }
    });
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Admin "Edit" button (text "Edit", not "Edit Manager Details")
    await expect(page.getByRole("button").filter({ hasText: /^Edit$/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button").filter({ hasText: /delete/i }).first()).toBeVisible({ timeout: 3000 });
  });

  test("clicking admin Edit opens admin edit form", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      user: MOCK_ADMIN_USER,
    });
    await page.route(/\/api\/admin\/managers/, (route: any) => {
      route.fulfill({ status: 200, json: { ...MOCK_MANAGER } });
    });
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Click the admin Edit button
    await page.getByRole("button").filter({ hasText: /^Edit$/ }).first().click();
    // Admin edit form should appear
    await expect(page.getByText(/admin edit.*changes cascade/i)).toBeVisible({ timeout: 5000 });
    // Admin edit form shows inputs for name, title, company, LinkedIn
    await expect(page.locator('input[placeholder*="linkedin"]').first()).toBeVisible({ timeout: 3000 });
  });

  test("admin edit form: fill fields and save", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      user: MOCK_ADMIN_USER,
    });
    await page.route(/\/api\/admin\/managers/, (route: any) => {
      route.fulfill({ status: 200, json: { ...MOCK_MANAGER } });
    });
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button").filter({ hasText: /^Edit$/ }).first().click();
    await expect(page.getByText(/admin edit.*changes cascade/i)).toBeVisible({ timeout: 5000 });
    // Fill in the LinkedIn URL field (it's empty by default)
    const linkedinInput = page.locator('input[placeholder*="linkedin"]').first();
    await linkedinInput.fill("https://linkedin.com/in/alexjohnson");
    // Click Save changes
    await page.getByRole("button", { name: /save changes/i }).click();
    // Form closes (adminEditing = false) and success toast appears
    await expect(page.getByText(/manager updated/i)).toBeVisible({ timeout: 8000 });
  });

  test("admin delete shows confirm then cancel", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      user: MOCK_ADMIN_USER,
    });
    await page.route(/\/api\/admin\/managers/, (route: any) => {
      route.fulfill({ status: 200, json: { success: true } });
    });
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Click the trash/delete button
    await page.getByRole("button").filter({ hasText: /delete/i }).first().click();
    // Confirm delete appears inline: "Delete?" with Yes and Cancel
    await expect(page.getByText(/delete\?/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button").filter({ hasText: /yes.*delete|yes,\s*delete/i })).toBeVisible({ timeout: 3000 });
    // Cancel it
    await page.getByRole("button").filter({ hasText: /^cancel$/i }).click();
    // Confirm gone
    await expect(page.getByText(/delete\?/i)).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── BossProfile — Report Profile modal ──────────────────────────────────────

test.describe("BossProfile — report profile modal", () => {
  test("clicking Report opens the report modal", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(/\/api\/managers\/.*\/report/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Click the "Report" button
    await page.getByRole("button", { name: /report this profile/i }).click();
    // Modal content appears
    await expect(page.getByText(/what.s the issue with this profile/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/this is not the correct person/i)).toBeVisible({ timeout: 3000 });
  });

  test("closing report modal with X button hides it", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /report this profile/i }).click();
    await expect(page.getByText(/what.s the issue with this profile/i)).toBeVisible({ timeout: 5000 });
    // Click the Close button on the right side of the header
    await page.getByRole("button", { name: /^Close$/ }).last().click();
    await expect(page.getByText(/what.s the issue with this profile/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("selecting a reason enables Submit Report", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(/\/api\/managers\/.*\/report/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /report this profile/i }).click();
    await expect(page.getByText(/what.s the issue with this profile/i)).toBeVisible({ timeout: 5000 });
    // Submit is disabled initially
    const submitBtn = page.getByRole("button", { name: /submit report/i });
    await expect(submitBtn).toBeDisabled({ timeout: 3000 });
    // Select a reason
    await page.getByText(/this is not the correct person/i).click();
    // Submit should now be enabled
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
  });

  test("submitting report calls API and closes modal", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.route(/\/api\/managers\/.*\/report/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /report this profile/i }).click();
    await expect(page.getByText(/what.s the issue with this profile/i)).toBeVisible({ timeout: 5000 });
    // Select reason and add comment
    await page.getByText(/duplicate profile/i).click();
    await page.locator("textarea").fill("This is a duplicate of another profile.");
    // Submit
    await page.getByRole("button", { name: /submit report/i }).click();
    // Modal closes, toast shows (or button changes to "Flagged")
    await expect(page.getByText(/what.s the issue with this profile/i)).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── BossProfile — Complete edit review (ratings → dates → identity) ─────────

test.describe("BossProfile — complete edit review all steps", () => {
  test("edit review: navigate through all 3 steps and save", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("button").filter({ hasText: /edit your review/i })).toBeVisible({ timeout: 10000 });
    // Open dropdown
    await page.getByRole("button", { name: /show review options/i }).click();
    await expect(page.getByText(/your reviews.*select to edit/i)).toBeVisible({ timeout: 5000 });
    // Click the review to open edit modal (step: ratings)
    await page.getByText(/engineering manager at acme corp/i).first().click();
    // Wait for edit modal to open (ratings step)
    await expect(page.getByRole("button", { name: /next/i })).toBeVisible({ timeout: 8000 });
    // Step 1 (ratings): all pre-filled → click Next
    await page.getByRole("button", { name: /^Next$/ }).click();
    // Step 2 (dates): workedFrom and workedUntil should be pre-filled
    // Check we moved to dates step (From year select visible)
    await expect(page.locator('select[aria-label="From year"]')).toBeVisible({ timeout: 5000 });
    // Click Next again → step 3 identity
    await page.getByRole("button", { name: /^Next$/ }).click();
    // Step 3 (identity): "Who wrote this review?"
    await expect(page.getByText(/who wrote this review/i)).toBeVisible({ timeout: 5000 });
    // Click "Save Changes"
    await page.getByRole("button", { name: /save changes/i }).click();
    // Modal closes after successful edit
    await expect(page.getByText(/who wrote this review/i)).not.toBeVisible({ timeout: 8000 });
  });
});

// ─── Admin — Merge Duplicates tab ────────────────────────────────────────────

test.describe("Admin — merge duplicates tab", () => {
  test("Merge Duplicates tab appears and search shows results", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Click "Merge Duplicates" tab
    await page.getByRole("button", { name: /merge duplicates/i }).click();
    await expect(page.getByText(/merge duplicate managers/i)).toBeVisible({ timeout: 5000 });
    // Type in the search box (≥2 chars to trigger search)
    await page.locator('input[placeholder="Type a name..."]').fill("Alex");
    // Results should appear (fixture mocks /api/managers/similar)
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking Keep and Remove selects managers", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /merge duplicates/i }).click();
    await expect(page.getByText(/merge duplicate managers/i)).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder="Type a name..."]').fill("Alex");
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    // Click "Keep" on first result
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    // Click "Remove" on second result
    await page.getByRole("button", { name: /^Remove$/ }).last().click();
    // Selected section appears showing both
    await expect(page.getByText(/Keep/i).nth(1)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/Remove/i).nth(1)).toBeVisible({ timeout: 3000 });
  });

  test("clicking Merge button opens confirm dialog", async ({ page }) => {
    await mockAdminPage(page, {
      similarManagers: [
        { ...MOCK_MANAGER, id: "manager-keep", name: "Alex Johnson Keep" },
        { ...MOCK_MANAGER, id: "manager-dup", name: "Alex Johnson Remove" },
      ],
    });
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /merge duplicates/i }).click();
    await page.locator('input[placeholder="Type a name..."]').fill("Alex");
    await expect(page.getByText(/alex johnson keep/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/alex johnson remove/i)).toBeVisible({ timeout: 3000 });
    // Click Keep on first
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    // Click Remove on second
    await page.getByRole("button", { name: /^Remove$/ }).last().click();
    // Click the Merge button
    await page.getByRole("button", { name: /^Merge$/ }).click();
    // Confirm dialog opens
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/merge managers/i)).toBeVisible({ timeout: 3000 });
  });

  test("confirming merge executes the merge action", async ({ page }) => {
    await mockAdminPage(page, {
      similarManagers: [
        { ...MOCK_MANAGER, id: "manager-keep", name: "Alex Johnson Keep" },
        { ...MOCK_MANAGER, id: "manager-dup", name: "Alex Johnson Remove" },
      ],
    });
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /merge duplicates/i }).click();
    await page.locator('input[placeholder="Type a name..."]').fill("Alex");
    await expect(page.getByText(/alex johnson keep/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: /^Remove$/ }).last().click();
    await page.getByRole("button", { name: /^Merge$/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm the merge
    await page.getByRole("dialog").getByRole("button", { name: /^Merge$/ }).click();
    // Dialog closes
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin — AI Suggestions tab ──────────────────────────────────────────────

test.describe("Admin — AI suggestions tab", () => {
  const MOCK_MERGE_SUGGESTION = {
    id: "sugg-1",
    confidence: "SAME",
    reason: "Both profiles appear to be the same person based on name and company.",
    managerA: { id: "mgr-a", name: "Alex Johnson", title: "Engineering Manager", company: "Acme Corp", country: "CA", reviews: 5 },
    managerB: { id: "mgr-b", name: "Alex B Johnson", title: "Engineering Manager", company: "Acme", country: "CA", reviews: 2 },
  };

  test("AI suggestions tab shows suggestions", async ({ page }) => {
    await mockAdminPage(page);
    // Override merge-suggestions endpoint to return data (LIFO — registered after mockAdminPage)
    await page.route(/\/api\/admin\/merge-suggestions$/, (route: any) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { data: [MOCK_MERGE_SUGGESTION], total: 1 } });
      } else {
        route.fulfill({ status: 200, json: { success: true } });
      }
    });
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Click AI Suggestions tab
    await page.getByRole("button", { name: /ai.*suggest|suggest.*ai/i }).click();
    // Suggestions content appears
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/same person/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("dismissing an AI suggestion removes it from the list", async ({ page }) => {
    await mockAdminPage(page);
    await page.route(/\/api\/admin\/merge-suggestions$/, (route: any) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { data: [MOCK_MERGE_SUGGESTION], total: 1 } });
      } else {
        route.fulfill({ status: 200, json: { success: true } });
      }
    });
    // Handle dismiss POST
    await page.route(/\/api\/admin\/merge-suggestions\/sugg-1\/dismiss/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /ai.*suggest|suggest.*ai/i }).click();
    await expect(page.getByText(/same person/i).first()).toBeVisible({ timeout: 5000 });
    // Click Dismiss
    await page.getByRole("button", { name: /dismiss/i }).first().click();
    // Suggestion removed from list
    await expect(page.getByText(/same person/i).first()).not.toBeVisible({ timeout: 5000 });
  });

  test("AI suggestions merge opens confirm dialog", async ({ page }) => {
    await mockAdminPage(page);
    await page.route(/\/api\/admin\/merge-suggestions$/, (route: any) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { data: [MOCK_MERGE_SUGGESTION], total: 1 } });
      } else {
        route.fulfill({ status: 200, json: { success: true } });
      }
    });
    await page.route(/\/api\/admin\/managers\/.*\/merge/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /ai.*suggest|suggest.*ai/i }).click();
    await expect(page.getByText(/same person/i).first()).toBeVisible({ timeout: 5000 });
    // Click Merge → button that says "Merge →"
    await page.getByRole("button", { name: /merge\s*→|merge\s*$/i }).first().click();
    // Confirm dialog opens
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm
    await page.getByRole("dialog").getByRole("button", { name: /^Merge$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin — Live Profiles (Ghost Managers) tab ───────────────────────────────

test.describe("Admin — live profiles tab", () => {
  const MOCK_GHOST_MANAGER = {
    id: "ghost-1",
    name: "Ghost Manager",
    title: "VP Engineering",
    company: "Phantom Corp",
    approvalStatus: "ghost",
    isAutoCreated: true,
    createdAt: new Date().toISOString(),
  };

  test("Live Profiles tab shows ghost managers", async ({ page }) => {
    await mockAdminPage(page);
    // Override ghost managers endpoint
    await page.route(/\/api\/admin\/ghost-managers/, (route: any) =>
      route.fulfill({ json: { data: [MOCK_GHOST_MANAGER] } })
    );
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Click Live Profiles tab
    await page.getByRole("button", { name: /live profiles/i }).click();
    await expect(page.getByText(/ghost manager/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/phantom corp/i)).toBeVisible({ timeout: 3000 });
  });
});

// ─── Admin — Companies tab ────────────────────────────────────────────────────

test.describe("Admin — companies tab merge", () => {
  test("Companies tab search shows results and Keep/Remove work", async ({ page }) => {
    await mockAdminPage(page, {
      companies: [
        { id: 1, name: "Acme Corp Alpha", status: "approved", managerCount: 3 },
        { id: 2, name: "Acme Corp Beta", status: "approved", managerCount: 1 },
      ],
    });
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Click Companies tab
    await page.getByRole("button", { name: /^Companies$/ }).click();
    await expect(page.getByRole("heading", { name: /merge companies/i })).toBeVisible({ timeout: 5000 });
    // Type to search
    await page.locator('input[placeholder="Type a company name..."]').fill("Acme");
    // Results appear
    await expect(page.getByText(/acme corp alpha/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/acme corp beta/i)).toBeVisible({ timeout: 3000 });
    // Click Keep on first
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    // Click Remove on second
    await page.getByRole("button", { name: /^Remove$/ }).last().click();
    // Selected section shows
    await expect(page.getByText(/acme corp alpha/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("Companies tab: Merge Companies confirms and executes", async ({ page }) => {
    await mockAdminPage(page, {
      companies: [
        { id: 1, name: "Acme Corp Alpha", status: "approved", managerCount: 3 },
        { id: 2, name: "Acme Corp Beta", status: "approved", managerCount: 1 },
      ],
    });
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Companies$/ }).click();
    await expect(page.getByRole("heading", { name: /merge companies/i })).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder="Type a company name..."]').fill("Acme");
    await expect(page.getByText(/acme corp alpha/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Keep$/ }).first().click();
    await page.getByRole("button", { name: /^Remove$/ }).last().click();
    // Click the Merge Companies button
    await page.getByRole("button", { name: /merge companies/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm
    await page.getByRole("dialog").getByRole("button", { name: /merge companies/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin — Reject pending manager with reason ───────────────────────────────

test.describe("Admin — reject pending manager with reason", () => {
  test("reject confirm dialog shows textarea for reason", async ({ page }) => {
    await mockAdminPage(page, {
      pendingManagers: [MOCK_PENDING_ADMIN_MANAGER],
    });
    await page.goto("/admin");
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 10000 });
    // Click Reject
    await page.getByRole("button", { name: /^Reject$/ }).first().click();
    // Confirm dialog opens with reject-manager type
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/reject manager/i)).toBeVisible({ timeout: 3000 });
    // Textarea for reason is visible
    await expect(page.locator("textarea")).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder(/provide a reason/i)).toBeVisible({ timeout: 3000 });
  });

  test("typing reason and rejecting sends API call", async ({ page }) => {
    await mockAdminPage(page, {
      pendingManagers: [MOCK_PENDING_ADMIN_MANAGER],
    });
    await page.goto("/admin");
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Reject$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Type a rejection reason
    await page.getByPlaceholder(/provide a reason/i).fill("Duplicate profile — already exists as admin-pm-2");
    // Click Reject in dialog
    await page.getByRole("dialog").getByRole("button", { name: /^Reject$/ }).click();
    // Dialog closes after success
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Directory — Pagination ───────────────────────────────────────────────────

test.describe("Directory — pagination", () => {
  // Create 21 mock managers to trigger 2-page pagination (PAGE_SIZE = 20)
  const MANY_MANAGERS = Array.from({ length: 21 }, (_, i) => ({
    id: `manager-${i}`,
    name: `Manager ${i + 1}`,
    title: "Engineering Manager",
    company: "Acme Corp",
    overallRating: 4.0,
    reviews: 5,
    approvalStatus: "approved",
    image: "M",
  }));

  test("pagination controls appear when total > PAGE_SIZE", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route(/\/api\/managers\?/, (route: any) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") ?? "0");
      const limit = parseInt(url.searchParams.get("limit") ?? "20");
      const sliced = MANY_MANAGERS.slice(offset, offset + limit);
      route.fulfill({ json: { data: sliced, total: MANY_MANAGERS.length } });
    });
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.route("**/api/companies", (route: any) =>
      route.fulfill({ json: ["Acme Corp"] })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.route("**/api/users/me/submitted-managers", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Pagination should be visible — page 2 button appears (totalPages = ceil(21/20) = 2)
    await expect(page.getByRole("button", { name: "2", exact: true })).toBeVisible({ timeout: 5000 });
    // Page 1 button is visible and active (styled differently)
    await expect(page.getByRole("button", { name: "1", exact: true })).toBeVisible({ timeout: 3000 });
  });

  test("clicking Next page navigates to page 2", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route(/\/api\/managers\?/, (route: any) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") ?? "0");
      const limit = parseInt(url.searchParams.get("limit") ?? "20");
      const sliced = MANY_MANAGERS.slice(offset, offset + limit);
      route.fulfill({ json: { data: sliced, total: MANY_MANAGERS.length } });
    });
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.route("**/api/companies", (route: any) =>
      route.fulfill({ json: ["Acme Corp"] })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.route("**/api/users/me/submitted-managers", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Click page 2 button (the "2" button)
    await page.getByRole("button", { name: "2", exact: true }).click();
    // Page 2 shows last manager
    await expect(page.getByText(/manager 21/i)).toBeVisible({ timeout: 8000 });
  });

  test("pagination prev button navigates back to page 1", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route(/\/api\/managers\?/, (route: any) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") ?? "0");
      const limit = parseInt(url.searchParams.get("limit") ?? "20");
      const sliced = MANY_MANAGERS.slice(offset, offset + limit);
      route.fulfill({ json: { data: sliced, total: MANY_MANAGERS.length } });
    });
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.route("**/api/companies", (route: any) =>
      route.fulfill({ json: ["Acme Corp"] })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.route("**/api/users/me/submitted-managers", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Go to page 2
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.getByText(/manager 21/i)).toBeVisible({ timeout: 8000 });
    // Go back to page 1 using the numbered page button
    await page.getByRole("button", { name: "1", exact: true }).click();
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 8000 });
    // Verify Manager 21 is no longer visible (it's on page 2)
    await expect(page.getByText(/manager 21/i)).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── CompanyProfile — search with invalid name triggers error ─────────────────

test.describe("CompanyProfile — search validation error", () => {
  test("invalid name with numbers shows validation error", async ({ page }) => {
    await mockCompanyProfileRoutes(page, { loggedIn: false });
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: [], total: 0 } })
    );
    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    // Fill in search form with invalid first name (contains number)
    await page.locator('input[placeholder="First name"]').fill("Test123");
    await page.locator('input[placeholder="Last name"]').fill("Person");
    await page.locator('input[placeholder="Job title"]').fill("Engineer");
    // Submit
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Validation error appears
    await expect(page.getByText(/name should only contain letters/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── CompanyProfile — anonymous ghost creation flow ───────────────────────────

test.describe("CompanyProfile — anonymous ghost creation", () => {
  test("anonymous search with empty results triggers ghost creation and shows Manager added", async ({ page }) => {
    await mockCompanyProfileRoutes(page, { loggedIn: false });

    // First managers GET (search query) → empty, and retry → also empty → setGhostAdded(true)
    await page.route(/\/api\/managers\?/, (route: any) => {
      route.fulfill({ json: { data: [], total: 0 } });
    });

    // Ghost creation succeeds
    await page.route(/\/api\/managers\/ghost/, (route: any) => {
      if (route.request().method() === "POST") {
        route.fulfill({ status: 200, json: { success: true } });
      } else {
        route.continue();
      }
    });

    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });

    // Clear ghost key from localStorage to allow ghost creation
    await page.evaluate(() => localStorage.removeItem("rmm_anon_ghost_created"));

    // Fill in valid search form
    await page.locator('input[placeholder="First name"]').fill("Sarah");
    await page.locator('input[placeholder="Last name"]').fill("Johnson");
    await page.locator('input[placeholder="Job title"]').fill("Engineering Manager");
    // Submit
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Wait for ghost creation flow to complete — shows "Manager added!"
    await expect(page.getByText(/manager added/i)).toBeVisible({ timeout: 10000 });
  });
});

// ─── Companies — search suggestion select ─────────────────────────────────────

test.describe("Companies — search autocomplete suggestion select", () => {
  test("selecting a suggestion from autocomplete navigates to company", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: MOCK_COMPANY_LISTING } })
    );
    await page.route(/\/api\/companies\/by-slug/, (route: any) =>
      route.fulfill({ json: MOCK_COMPANY_PROFILE })
    );
    // Suggest endpoint returns Acme Corp when queried
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({
        json: [{ name: "Acme Corp", domain: "acmecorp.com" }],
      })
    );
    await page.goto("/companies");
    await expect(page.getByRole("heading", { name: /see the culture/i })).toBeVisible({ timeout: 10000 });
    // Type in the search box to trigger autocomplete
    const searchInput = page.locator('input[placeholder="Search for a company…"]');
    await searchInput.fill("Acme");
    // Wait for suggestion dropdown
    await expect(page.getByRole("option", { name: /acme corp/i })).toBeVisible({ timeout: 5000 });
    // Click the suggestion (uses onPointerDown)
    await page.getByRole("option", { name: /acme corp/i }).click({ force: true });
    // Should navigate to the company page (URL changes)
    await expect(page).toHaveURL(/\/companies\/Acme|\/companies\/acme/i, { timeout: 5000 });
  });
});

// ─── Admin — Live Profiles tab: edit ghost manager inline ─────────────────────

test.describe("Admin — live profiles tab: ghost manager editing", () => {
  const MOCK_GHOST_MANAGER = {
    id: "ghost-edit-1",
    name: "Ghost Edit Manager",
    title: "VP Engineering",
    company: "Phantom Corp",
    approvalStatus: "ghost",
    isAutoCreated: true,
    createdAt: new Date().toISOString(),
  };

  test("clicking Edit on a ghost manager shows inline edit form", async ({ page }) => {
    await mockAdminPage(page);
    await page.route(/\/api\/admin\/ghost-managers/, (route: any) =>
      route.fulfill({ json: { data: [MOCK_GHOST_MANAGER] } })
    );
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /live profiles/i }).click();
    await expect(page.getByText(/ghost edit manager/i)).toBeVisible({ timeout: 5000 });
    // Click Edit on ghost manager (Pencil icon button with aria-label "Edit manager")
    await page.getByRole("button", { name: /edit manager/i }).first().click();
    // Inline edit form appears (input fields)
    await expect(page.locator('input[placeholder="Manager name"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="Job title"]')).toBeVisible({ timeout: 3000 });
  });
});
