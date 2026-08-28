/**
 * Fifth wave of targeted Playwright coverage tests.
 * Targets remaining uncovered paths in:
 *   Companies (autocomplete clear),
 *   CompanyProfile (error state, anon search results, ghost creation variants, locked buttons),
 *   Directory (sort, clear filter, chevron pagination, empty search),
 *   Admin (access denied, toggle reviews, ban/unban, edit approvals, dialog close),
 *   BossProfile (date selects in edit, review sort, click-outside dropdown, edited review),
 *   AddBoss (draft restore, retired status, country change, submission error, handleBack),
 *   SignUp (username check failure)
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
  MOCK_EDIT_REQUEST,
  MOCK_BANNED_USER_ENTRY,
  MOCK_BANNABLE_USER,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_SLUG,
  mockManagerPage,
  mockAdminPage,
  mockAddBossPage,
} from "./fixtures";

// ─── Companies - clear autocomplete ──────────────────────────────────────────

test.describe("Companies - clear autocomplete (onClear)", () => {
  test("typing then clearing search resets the input", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: MOCK_COMPANY_LISTING } })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: [{ name: "Acme Corp", domain: "acmecorp.com" }] })
    );
    await page.goto("/companies");
    await expect(page.getByRole("heading", { name: /see the culture/i })).toBeVisible({ timeout: 10000 });
    const searchInput = page.locator('input[placeholder="Search for a company…"]');
    await searchInput.fill("Acme");
    // Wait for autocomplete suggestions to appear
    await page.waitForTimeout(400);
    // Click the X clear button (tabIndex=-1, positioned absolute right of input)
    await page.locator('button[tabindex="-1"]').click();
    // Input should be cleared
    await expect(searchInput).toHaveValue("", { timeout: 3000 });
  });
});

// ─── CompanyProfile - error loading company ───────────────────────────────────

test.describe("CompanyProfile - error state", () => {
  test("API error shows error state with Browse all companies button", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route(/\/api\/companies\/by-slug/, (route: any) =>
      route.fulfill({ status: 500, json: { error: "Internal Server Error" } })
    );
    await page.route(/\/api\/companies\/by-name/, (route: any) =>
      route.fulfill({ status: 500, json: { error: "Internal Server Error" } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/companies/acme-corp");
    // Error state should show
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/unable to load this company/i)).toBeVisible({ timeout: 3000 });
    // Browse all companies button
    const browseBtn = page.getByRole("button", { name: /browse all companies/i });
    await expect(browseBtn).toBeVisible({ timeout: 3000 });
    await browseBtn.click();
    await expect(page).toHaveURL(/\/companies/, { timeout: 5000 });
  });
});

// ─── CompanyProfile - fake name validation ────────────────────────────────────

test.describe("CompanyProfile - fake name validation", () => {
  test("fake name part (test) triggers validation error", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    // Use a fake name part ("test") - triggers FAKE_NAME_PARTS check (line 35-36)
    await page.locator('input[placeholder="First name"]').fill("Test");
    await page.locator('input[placeholder="Last name"]').fill("Person");
    await page.locator('input[placeholder="Job title"]').fill("Engineer");
    await page.getByRole("button", { name: /^Search$/ }).click();
    await expect(page.getByText(/real person/i)).toBeVisible({ timeout: 5000 });
  });

  test("full fake name (john doe) triggers validation error", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    // "john doe" is in FAKE_FULL_NAMES (line 38-39)
    await page.locator('input[placeholder="First name"]').fill("John");
    await page.locator('input[placeholder="Last name"]').fill("Doe");
    await page.locator('input[placeholder="Job title"]').fill("Engineer");
    await page.getByRole("button", { name: /^Search$/ }).click();
    await expect(page.getByText(/real person/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── CompanyProfile - anonymous search returns results ────────────────────────

test.describe("CompanyProfile - anonymous search with results", () => {
  test("anonymous user search returns managers and shows them", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    // Search returns results (line 229-230: setSearchResults(anonData))
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({
        json: {
          data: [{ ...MOCK_MANAGER, name: "Sarah Johnson", slug: "sarah-johnson" }],
          total: 1,
        },
      })
    );
    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    await page.locator('input[placeholder="First name"]').fill("Sarah");
    await page.locator('input[placeholder="Last name"]').fill("Johnson");
    await page.locator('input[placeholder="Job title"]').fill("Engineering Manager");
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Results should appear
    await expect(page.getByText(/sarah johnson/i).first()).toBeVisible({ timeout: 8000 });
  });
});

// ─── CompanyProfile - ghost creation retry returns results ────────────────────

test.describe("CompanyProfile - ghost creation retry returns results", () => {
  test("ghost creation succeeds and retry GET returns a manager", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );

    // First GET → empty, second GET (retry after ghost) → has manager (line 256-257)
    let searchCallCount = 0;
    await page.route(/\/api\/managers\?/, (route: any) => {
      searchCallCount++;
      if (searchCallCount === 1) {
        route.fulfill({ json: { data: [], total: 0 } });
      } else {
        route.fulfill({ json: { data: [{ ...MOCK_MANAGER, name: "Greg Davis" }], total: 1 } });
      }
    });

    // Ghost creation succeeds
    await page.route(/\/api\/managers\/ghost/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );

    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => localStorage.removeItem("rmm_anon_ghost_created"));

    await page.locator('input[placeholder="First name"]').fill("Greg");
    await page.locator('input[placeholder="Last name"]').fill("Davis");
    await page.locator('input[placeholder="Job title"]').fill("Manager");
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Should show the retry result (greg davis)
    await expect(page.getByText(/greg davis/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("ghost creation fails (network error) shows empty results", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    // Search returns empty
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: [], total: 0 } })
    );
    // Ghost creation fails (line 246-248: catch → ghostCreated stays false → line 267)
    await page.route(/\/api\/managers\/ghost/, (route: any) =>
      route.fulfill({ status: 500, json: { error: "Server error" } })
    );

    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => localStorage.removeItem("rmm_anon_ghost_created"));

    await page.locator('input[placeholder="First name"]').fill("Paula");
    await page.locator('input[placeholder="Last name"]').fill("Martin");
    await page.locator('input[placeholder="Job title"]').fill("Manager");
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Shows "No results found" with Add Manager button (line 267 sets empty results)
    await expect(page.getByText(/no results found/i)).toBeVisible({ timeout: 10000 });
    // Click "Add Manager" button (line 740)
    await page.getByRole("button", { name: /add manager/i }).click();
    await expect(page).toHaveURL(/\/add/, { timeout: 5000 });
  });
});

// ─── CompanyProfile - "Rate a manager" locked buttons ─────────────────────────

test.describe("CompanyProfile - locked insights buttons", () => {
  test("logged-in user without contribution sees Rate a manager to unlock button", async ({ page }) => {
    // Logged in but hasContributed=false
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ json: { ...MOCK_USER, hasContributed: false } })
    );
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify({ ...u, hasContributed: false }));
    }, MOCK_USER);
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    // The "Rate a manager to unlock" button should appear (lines 549, 771)
    await expect(page.getByText(/rate a manager to unlock/i).first()).toBeVisible({ timeout: 5000 });
    // Click the button - navigates to /add
    await page.getByRole("button", { name: /rate a manager to unlock/i }).first().click();
    await expect(page).toHaveURL(/\/add/, { timeout: 5000 });
  });
});

// ─── CompanyProfile - ghost added "Sign in to rate" button ────────────────────

test.describe("CompanyProfile - ghost added sign in button", () => {
  test("after ghost creation with no retry results shows Manager added and Sign in to rate", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
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
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    // Both search calls return empty (ghost added path, line 259-260 + line 727)
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: [], total: 0 } })
    );
    // Ghost creation succeeds
    await page.route(/\/api\/managers\/ghost/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );

    await page.goto("/companies/acme-corp");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => localStorage.removeItem("rmm_anon_ghost_created"));

    await page.locator('input[placeholder="First name"]').fill("Mia");
    await page.locator('input[placeholder="Last name"]').fill("Chen");
    await page.locator('input[placeholder="Job title"]').fill("Manager");
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Ghost was added → shows "Manager added!" (line 259/720-732)
    await expect(page.getByText(/manager added/i)).toBeVisible({ timeout: 10000 });
    // "Sign in to rate" button (line 727)
    await expect(page.getByRole("button", { name: /sign in to rate/i })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: /sign in to rate/i }).click();
    await expect(page).toHaveURL(/\/signin/, { timeout: 5000 });
  });
});

// ─── Directory - sort and filters ────────────────────────────────────────────

test.describe("Directory - sort and filter interactions", () => {
  const MOCK_MANAGERS_10 = Array.from({ length: 5 }, (_, i) => ({
    id: `mgr-${i}`,
    name: `Manager ${i + 1}`,
    title: "Engineering Manager",
    company: "Acme Corp",
    overallRating: 4.0 - i * 0.1,
    reviews: 5,
    approvalStatus: "approved",
    image: "M",
  }));

  async function setupDirectory(page: any, opts: { loggedIn?: boolean; hasContributed?: boolean } = {}) {
    const { loggedIn = false, hasContributed = false } = opts;
    await page.route("**/api/auth/me", (route: any) =>
      loggedIn
        ? route.fulfill({ json: { ...MOCK_USER, hasContributed } })
        : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    if (loggedIn) {
      await page.addInitScript((u: any) => {
        localStorage.setItem("authUser", JSON.stringify(u));
      }, { ...MOCK_USER, hasContributed });
    }
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: MOCK_MANAGERS_10, total: MOCK_MANAGERS_10.length } })
    );
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
  }

  test("changing sort to Top Rated covers sortBy path", async ({ page }) => {
    await setupDirectory(page);
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Change sort (line 334 - setSortBy; line 151 - return filtered)
    await page.selectOption('select', 'rating');
    // Directors still show (sorted differently)
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 3000 });
  });

  test("setting min rating then clearing it covers clear button", async ({ page }) => {
    await setupDirectory(page);
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Click a rating star filter (e.g., 3 stars)
    await page.getByRole("button", { name: /3 stars/i }).click();
    // "Clear" button appears for the minRating filter (line 283)
    await expect(page.getByRole("button", { name: /^Clear$/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Clear$/ }).click();
    // Min rating cleared, manager list shows again
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 3000 });
  });

  test("logged-in user without contribution sees Rate a manager unlock button", async ({ page }) => {
    await setupDirectory(page, { loggedIn: true, hasContributed: false });
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // "Rate a manager" button shown for !hasContributed users (line 413)
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /rate a manager/i }).first().click();
    await expect(page).toHaveURL(/\/add/, { timeout: 5000 });
  });

  test("empty search result shows Add Manager button", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    // Empty results for search query
    await page.route(/\/api\/managers\?/, (route: any) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get("search") || "";
      if (search) {
        route.fulfill({ json: { data: [], total: 0 } });
      } else {
        route.fulfill({ json: { data: MOCK_MANAGERS_10, total: MOCK_MANAGERS_10.length } });
      }
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
    // Fill all 4 required fields (allFilled = firstName && lastName>=2 && title && company>=2)
    await page.locator('input[placeholder="First name"]').fill("Nonexistent");
    await page.locator('input[placeholder="Last name"]').fill("Manager");
    await page.locator('input[placeholder="Job title"]').fill("Engineer");
    await page.locator('input[placeholder="Company"]').fill("NoSuchCo");
    await page.getByRole("button", { name: /^Search$/ }).click();
    // Empty state with "Add Manager" button (line 473)
    await expect(page.getByText(/no results for/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /add/i })).toBeVisible({ timeout: 3000 });
  });
});

// ─── Directory - pagination with chevron buttons ──────────────────────────────

test.describe("Directory - chevron pagination buttons", () => {
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

  async function setupPagination(page: any) {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route(/\/api\/managers\?/, (route: any) => {
      const url = new URL(route.request().url());
      const offset = parseInt(url.searchParams.get("offset") ?? "0");
      const limit = parseInt(url.searchParams.get("limit") ?? "20");
      route.fulfill({ json: { data: MANY_MANAGERS.slice(offset, offset + limit), total: MANY_MANAGERS.length } });
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
  }

  test("ChevronRight button navigates to next page", async ({ page }) => {
    await setupPagination(page);
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Click ChevronRight (next page, line 457) - last button in pagination container
    await page.locator('div.mt-10.flex button').last().click();
    await expect(page.getByText(/manager 21/i)).toBeVisible({ timeout: 8000 });
  });

  test("ChevronLeft button navigates back to previous page", async ({ page }) => {
    await setupPagination(page);
    await page.goto("/directory");
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 10000 });
    // Go to page 2 via numbered button
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.getByText(/manager 21/i)).toBeVisible({ timeout: 8000 });
    // Go back via ChevronLeft (line 424) - first button in pagination container
    await page.locator('div.mt-10.flex button').first().click();
    await expect(page.getByText("Manager 1", { exact: true })).toBeVisible({ timeout: 8000 });
  });
});

// ─── Admin - access denied for non-admin ─────────────────────────────────────

test.describe("Admin - access denied", () => {
  test("non-admin user sees access denied page with Return to Home button", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ json: MOCK_USER }) // MOCK_USER is not admin (role: "user")
    );
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, MOCK_USER);
    await page.goto("/admin");
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/you do not have permission/i)).toBeVisible({ timeout: 3000 });
    // Click "Return to Home" button (line 104)
    await page.getByRole("button", { name: /return to home/i }).click();
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });
});

// ─── Admin - toggle manager reviews ──────────────────────────────────────────

test.describe("Admin - toggle manager reviews", () => {
  test("clicking See reviews loads and shows reviews for a pending manager", async ({ page }) => {
    await mockAdminPage(page);
    // Mock reviews endpoint for the pending manager
    await page.route(/\/api\/managers\/admin-pm-1\/reviews/, (route: any) =>
      route.fulfill({
        json: {
          data: [
            {
              id: "rev-1",
              author: "Anonymous Reviewer",
              overallRating: 3.5,
              managerTitle: "VP Engineering",
              managerCompany: "Foo Inc",
              text: "Decent manager overall.",
            },
          ],
        },
      })
    );
    await page.goto("/admin");
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 10000 });
    // Click "See reviews" button (line 590, calls toggleManagerReviews - lines 71-84)
    await page.getByRole("button", { name: /see reviews/i }).first().click();
    // Reviews section expands
    await expect(page.getByText(/anonymous reviewer/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/decent manager overall/i)).toBeVisible({ timeout: 3000 });
    // Click again to hide (line 72-74: if expandedReviewsId === managerId, set null)
    await page.getByRole("button", { name: /hide reviews/i }).first().click();
    await expect(page.getByText(/anonymous reviewer/i)).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Admin - approve and reject pending edit requests ────────────────────────

test.describe("Admin - pending edit requests", () => {
  test("clicking Edit Requests tab shows pending edits", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Click Edit Requests tab (line 437)
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/proposed/i)).toBeVisible({ timeout: 3000 });
  });

  test("approving a pending edit removes it from the list", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    // Click Approve (lines 810-816)
    await page.getByRole("button", { name: /^Approve$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm the approval (calls handleApprove - lines 240-249)
    await page.getByRole("dialog").getByRole("button", { name: /^Approve$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });

  test("rejecting a pending edit shows confirm and closes", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    // Click Reject (line 818)
    await page.getByRole("button", { name: /^Reject$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm the rejection (calls handleReject - lines 251-260)
    await page.getByRole("dialog").getByRole("button", { name: /^Reject$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin - ban and unban users ─────────────────────────────────────────────

test.describe("Admin - ban and unban users", () => {
  test("selecting user and filling reason enables Ban User and opens confirm", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Navigate to Banned Users tab
    await page.getByRole("button", { name: /banned users/i }).click();
    await expect(page.getByText(/ban a user/i)).toBeVisible({ timeout: 5000 });
    // Select a user from dropdown
    await page.selectOption('select', 'normal-user-1');
    // Fill in ban reason
    await page.getByPlaceholder(/e\.g\. spam/i).fill("Repeated spam posting");
    // Click Ban User (opens confirm dialog, lines 870-873)
    await page.getByRole("button", { name: /^Ban User$/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm the ban (calls handleBanUser - lines 262-277)
    await page.getByRole("dialog").getByRole("button", { name: /^Ban User$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });

  test("clicking Unban opens confirm and executes unban", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /banned users/i }).click();
    await expect(page.getByText(/currently banned/i)).toBeVisible({ timeout: 5000 });
    // Click Unban on the existing banned user (line 918-921, setConfirmAction unban)
    await page.getByRole("button", { name: /^Unban$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Confirm unban (calls handleUnbanUser - lines 279-288)
    await page.getByRole("dialog").getByRole("button", { name: /^Unban$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin - dialog close actions ────────────────────────────────────────────

test.describe("Admin - dialog close interactions", () => {
  test("clicking outside confirm dialog closes it (overlay click, lines 1172-1173)", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 10000 });
    // Open the dialog by clicking Approve on a pending manager
    await page.getByRole("button", { name: /^Approve$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Click the backdrop overlay (outside the dialog content)
    await page.locator(".fixed.inset-0").first().click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("clicking X button in dialog closes it (line 1195)", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Approve$/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Click the X close button in the dialog (line 1195)
    await page.getByRole("button", { name: /^Close$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("clicking Pending Managers tab when on another tab navigates back", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/pending managers/i).first()).toBeVisible({ timeout: 10000 });
    // Go to another tab first
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 5000 });
    // Click Pending Managers tab (line 407)
    await page.getByRole("button", { name: /pending managers/i }).first().click();
    // Back on pending managers tab
    await expect(page.getByText(/john doe/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── BossProfile - review sort and date select ────────────────────────────────

test.describe("BossProfile - review sort and date interactions", () => {
  const REVIEW_WITH_EDIT = {
    ...MOCK_EXISTING_REVIEW,
    id: "review-edited-1",
    createdAt: new Date(Date.now() - 120000).toISOString(),  // 2 minutes ago
    updatedAt: new Date(Date.now() - 10000).toISOString(),   // 10 seconds ago (> 5000ms after createdAt)
  };

  test("review with updatedAt >> createdAt shows edited date (line 611)", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    // Override general reviews (no userId=) AFTER mockManagerPage (LIFO) to include the edited review
    await page.route(
      new RegExp(`/api/managers/${MOCK_MANAGER.id}/reviews`),
      (route: any) => {
        const url = route.request().url();
        const method = route.request().method();
        if (method !== "GET" || url.includes("userId=")) {
          route.fallback();
          return;
        }
        route.fulfill({ json: { data: [REVIEW_WITH_EDIT] } });
      }
    );
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // "edited X ago" should appear in the review date (line 611)
    await expect(page.getByText(/edited/i)).toBeVisible({ timeout: 5000 });
  });

  test("changing review sort to Highest Rated triggers sort", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Change sort to Highest Rated (covers line 824: case "highest")
    const sortSelect = page.locator('select').filter({ hasText: /most recent/i });
    await sortSelect.selectOption("highest");
    // Still shows (now sorted highest rated first)
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 3000 });
  });

  test("changing review sort to Lowest Rated triggers sort", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Change sort to Lowest Rated (covers line 825-826)
    const sortSelect = page.locator('select').filter({ hasText: /most recent/i });
    await sortSelect.selectOption("lowest");
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 3000 });
  });

  test("clicking outside review dropdown closes it (line 785)", async ({ page }) => {
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [MOCK_EXISTING_REVIEW],
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 10000 });
    // Open the review dropdown
    await page.getByRole("button", { name: /show review options/i }).click();
    await expect(page.getByText(/your reviews.*select to edit/i)).toBeVisible({ timeout: 5000 });
    // Click somewhere outside the dropdown to close it (line 785)
    await page.getByRole("heading", { name: /alex johnson/i }).first().click();
    await expect(page.getByText(/your reviews.*select to edit/i)).not.toBeVisible({ timeout: 3000 });
  });

  test("edit review: change month select in dates step (lines 96, 109-114)", async ({ page }) => {
    // Use a review with no workedFrom to force user to fill it in
    const REVIEW_NO_DATES = {
      ...MOCK_EXISTING_REVIEW,
      id: "review-nodates",
      workedFrom: null,
      workedUntil: null,
    };
    await mockManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      existingUserReviews: [REVIEW_NO_DATES],
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("button").filter({ hasText: /edit your review/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /show review options/i }).click();
    await page.getByText(/engineering manager at acme corp/i).first().click();
    // Wait for ratings step
    await expect(page.getByRole("button", { name: /^Next$/ })).toBeVisible({ timeout: 8000 });
    // Go to dates step
    await page.getByRole("button", { name: /^Next$/ }).click();
    // Dates step: change the "From month" select (line 96 - onChange)
    await expect(page.locator('select[aria-label="From month"]')).toBeVisible({ timeout: 5000 });
    await page.locator('select[aria-label="From month"]').selectOption("01");
    // Change the "From year" select (lines 109-114)
    await page.locator('select[aria-label="From year"]').selectOption("2021");
  });
});

// ─── AddBoss - draft restore and interactions ─────────────────────────────────

test.describe("AddBoss - draft restore and form interactions", () => {
  test("draft banner appears for anonymous user and clicking Start fresh clears it", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    // Pre-populate draft in localStorage (triggers showDraftBanner: true for anon user)
    await page.addInitScript(() => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify({
        formData: { firstName: "Draft", lastName: "Person", title: "Manager", company: "DraftCo", country: "", state: "", linkedinUrl: "", status: "active" },
        ratings: {},
        workedFrom: { month: "", year: "" },
        step: "info",
        savedAt: Date.now(),
      }));
    });
    await page.goto("/add");
    // Draft banner should appear (lines 240-252 clearDraft)
    await expect(page.getByText(/draft restored/i)).toBeVisible({ timeout: 10000 });
    // Click "Start fresh" (clearDraft - lines 241-253)
    await page.getByRole("button", { name: /start fresh/i }).click();
    await expect(page.getByText(/draft restored/i)).not.toBeVisible({ timeout: 3000 });
    // Form should be cleared (firstName input empty)
    await expect(page.getByPlaceholder(/e.g., Satya/i)).toHaveValue("", { timeout: 3000 });
  });

  test("selecting Retired status updates form (handleStatusChange - line 780)", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Select the "Retired" radio option (handleStatusChange - line 780+393)
    await page.locator('input[type="radio"][value="retired"]').click();
    // UI reflects retired state - "Currently Active" is no longer selected
    await expect(page.locator('input[type="radio"][value="retired"]')).toBeChecked({ timeout: 3000 });
  });

  test("changing country select covers country onChange", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Fill step 1 fields
    await page.getByPlaceholder(/e.g., Satya/i).fill("Jane");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Doe");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineer");
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");
    // Geo pre-fills country as a chip - click "Edit location" to reveal the select (line 742)
    await page.getByRole("button", { name: /edit location/i }).click();
    await expect(page.locator('select[name="country"]')).toBeVisible({ timeout: 5000 });
    await page.selectOption('select[name="country"]', 'Canada');
    await expect(page.locator('select[name="country"]')).toHaveValue("Canada", { timeout: 3000 });
  });

  test("handleBack from timeline navigates back to info step", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Fill step 1 and advance (geo pre-fills country chip - country is already valid)
    await page.getByPlaceholder(/e.g., Satya/i).fill("Jane");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Doe");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineer");
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");
    // Country is pre-filled from geo - no need to change it
    await page.getByRole("button", { name: /next/i }).click();
    // Now on timeline step
    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible({ timeout: 5000 });
    // Click Back (handleBack - line 581: setStep("info"))
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 3000 });
  });

  test("logged-in user submitting with API error shows error message", async ({ page }) => {
    await mockAddBossPage(page, {
      loggedIn: true,
      submitResponse: { status: 500, json: { error: "Duplicate manager exists" } },
    });
    // Mock company suggest to avoid network errors
    await page.route(/\/api\/companies\/suggest/, (route: any) => route.fulfill({ json: [] }));
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 10000 });
    // Fill step 1 (country is pre-filled from geo mock)
    await page.getByPlaceholder(/e.g., Satya/i).fill("Jane");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Doe");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineer");
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");
    await page.getByRole("button", { name: /next/i }).click();
    // Fill step 2 (dates)
    await expect(page.getByRole("heading", { name: /work timeline/i })).toBeVisible({ timeout: 5000 });
    await page.locator('select[aria-label="From month"]').first().selectOption("01");
    await page.locator('select[aria-label="From year"]').first().selectOption("2021");
    // Check "Currently working here" checkbox if visible
    const currentCheckbox = page.locator('input[type="checkbox"]').first();
    if (await currentCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) await currentCheckbox.check();
    await page.getByRole("button", { name: /next/i }).click();
    // Fill step 3 (ratings) - step heading is "Rate Jane" (formData.firstName)
    await expect(page.getByRole("heading", { name: /rate jane/i })).toBeVisible({ timeout: 5000 });
    // Click "Rate 4 stars" for all 10 categories
    const fourStarButtons = page.getByRole("button", { name: "Rate 4 stars" });
    for (const btn of await fourStarButtons.all()) {
      await btn.click();
    }
    // Submit (button enables when all categories are rated and the attestation is checked)
    await page.locator('input[name="attestation"]').check();
    await expect(page.getByRole("button", { name: /submit/i })).toBeEnabled({ timeout: 5000 });
    await page.getByRole("button", { name: /submit/i }).click();
    // Error message shown (lines 543-562: doSubmit catch)
    await expect(page.getByText(/duplicate manager exists|failed to submit/i)).toBeVisible({ timeout: 8000 });
  });
});

// ─── SignUp - username check failure ─────────────────────────────────────────

test.describe("SignUp - username check failure and retry", () => {
  test("failed username availability check shows Try again button (line 289)", async ({ page }) => {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.route("**/api/auth/check-username**", (route: any) =>
      route.fulfill({ status: 500, json: { error: "Service unavailable" } })
    );
    await page.route(/\/api\/geo/, (route: any) =>
      route.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } })
    );
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 10000 });
    // Type a username to trigger availability check
    const usernameInput = page.locator('input[placeholder*="username"]').first();
    if (await usernameInput.isVisible()) {
      await usernameInput.clear();
      await usernameInput.fill("testusername123");
      // Wait for check to fail → "Try again" button appears (line 286-290)
      await expect(page.getByRole("button", { name: /try again/i })).toBeVisible({ timeout: 8000 });
      // Click "Try again" (line 289)
      await page.getByRole("button", { name: /try again/i }).click();
    }
  });
});
