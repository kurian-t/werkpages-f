import { test, expect } from "./base";
import {
  MOCK_COMPANY_LISTING,
  MOCK_COMPANY_PROFILE,
  TEST_MANAGER_ID,
  MOCK_USER,
  MOCK_ADMIN_USER,
} from "./fixtures";

async function mockCompanyRoutes(page: any, opts: { loggedIn?: boolean; hasContributed?: boolean } = {}) {
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
  await page.route("**/api/companies/listing", (route: any) =>
    route.fulfill({ json: { data: MOCK_COMPANY_LISTING } })
  );
  await page.route(/\/api\/companies\/by-name/, (route: any) =>
    route.fulfill({ json: MOCK_COMPANY_PROFILE })
  );
  await page.route(/\/api\/companies\/by-slug/, (route: any) =>
    route.fulfill({ json: MOCK_COMPANY_PROFILE })
  );
  await page.route("**/api/companies/suggest**", (route: any) =>
    route.fulfill({ json: [] })
  );
}

test.describe("Companies listing page", () => {
  test.beforeEach(async ({ page }) => {
    await mockCompanyRoutes(page);
  });

  test("loads companies listing with tiles", async ({ page }) => {
    await page.goto("/companies");

    await expect(
      page.getByRole("heading", { name: /see the culture/i })
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Acme Corp")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Skynet Inc")).toBeVisible();
  });

  test("shows blurred manager count and review count for non-contributing user", async ({ page }) => {
    await page.goto("/companies");

    await expect(page.getByText(/3 managers/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/15 reviews/i)).not.toBeVisible();
  });

  test("shows manager count and review count for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies");

    await expect(page.getByText(/3 managers/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/15 reviews/i)).toBeVisible();
  });

  test("shows locked stars instead of ratings for non-contributing user", async ({ page }) => {
    await page.goto("/companies");

    // Avg rating numbers must not be visible when the user has not contributed
    await expect(page.getByText("4.1")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("3.8")).not.toBeVisible();
    // Lock CTA should be present
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("shows avg rating on tiles for a contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies");

    await expect(page.getByText("4.1")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("3.8")).toBeVisible();
    // Lock CTA should not appear for contributors
    await expect(page.getByText(/rate a manager to unlock ratings/i)).not.toBeVisible();
  });

  test("clicking a company tile navigates to company profile", async ({ page }) => {
    await page.goto("/companies");

    // Click the Acme Corp tile
    await page.getByText("Acme Corp").first().click();

    await expect(page).toHaveURL(/\/companies\/acme-corp/, { timeout: 5_000 });
  });

  test("shows empty state when no companies exist", async ({ page }) => {
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.goto("/companies");

    await expect(
      page.getByText(/no companies yet/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("total company count is displayed", async ({ page }) => {
    await page.goto("/companies");

    await expect(page.getByText(/2 companies/i)).toBeVisible({ timeout: 5_000 });
  });

  test("typing a company name and pressing Enter navigates to its profile", async ({ page }) => {
    await page.goto("/companies");

    const input = page.getByPlaceholder(/search for a company/i);
    await input.fill("Acme Corp");
    await input.press("Enter");

    await expect(page).toHaveURL(/\/companies\/Acme%20Corp/, { timeout: 5_000 });
  });

  test("shows pagination controls and limits tiles when more than 20 companies", async ({ page }) => {
    const manyCompanies = Array.from({ length: 21 }, (_, i) => ({
      name: `Company ${String(i + 1).padStart(2, "0")}`,
      managerCount: 1,
      totalReviews: i + 1,
      avgRating: 4.0,
    }));
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: manyCompanies } })
    );
    await page.goto("/companies");

    // Only 20 tiles on the first page
    await expect(page.getByText("Company 01")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Company 21")).not.toBeVisible();

    // Pagination controls visible
    await expect(page.getByRole("button", { name: /next page/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /previous page/i })).toBeDisabled();

    // Navigate to page 2
    await page.getByRole("button", { name: /next page/i }).click();
    await expect(page.getByText("Company 21")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Company 01")).not.toBeVisible();
  });
});

test.describe("Company profile page", () => {
  test.beforeEach(async ({ page }) => {
    await mockCompanyRoutes(page);
  });

  test("loads company name in heading", async ({ page }) => {
    await page.goto("/companies/Acme%20Corp");

    await expect(
      page.getByRole("heading", { name: "Acme Corp", exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("blurs avg rating, manager count, and review count for non-contributing user", async ({ page }) => {
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText("4.1")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("2 managers", { exact: true })).not.toBeVisible();
    await expect(page.getByText("12 reviews", { exact: true })).not.toBeVisible();
  });

  test("shows avg rating, manager count, and review count for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText("4.1")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("2 managers", { exact: true })).toBeVisible();
    await expect(page.getByText("12 reviews", { exact: true })).toBeVisible();
  });

  test("shows lock gate for unauthenticated user instead of areas", async ({ page }) => {
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText(/company insights are locked/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/rate any manager to see strongest and weakest areas/i)).toBeVisible();
  });

  test("shows strongest and weakest areas for a contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText(/strongest areas/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/weakest areas/i)).toBeVisible();
  });

  test("shows sidebar search form and locked manager cards for non-contributing user", async ({ page }) => {
    await page.goto("/companies/Acme%20Corp");

    // Sidebar form is present
    await expect(page.getByText(/find a manager/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder("First name")).toBeVisible();
    await expect(page.getByPlaceholder("Last name")).toBeVisible();
    await expect(page.getByPlaceholder("Job title")).toBeVisible();
    // Locked CTA is shown below the tiles
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("shows sidebar search form for logged-in non-contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: false });
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText(/find a manager/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder("First name")).toBeVisible();
    await expect(page.getByPlaceholder("Last name")).toBeVisible();
  });

  test("find form search results show rate CTA for non-contributor", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: false });
    await page.route("**/api/managers/find-or-create", (route) =>
      route.fulfill({
        json: {
          data: [{ id: TEST_MANAGER_ID, name: "Alex Johnson", company: "Acme Corp", title: "Engineering Manager", approvalStatus: "approved" }],
          created: false,
          hasContributed: false,
        },
      })
    );
    await page.goto("/companies/Acme%20Corp");

    await page.getByPlaceholder("First name").fill("Alex");
    await page.getByPlaceholder("Last name").fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Engineering Manager");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("shows sidebar search form for empty company with locked user", async ({ page }) => {
    await page.route(/\/api\/companies\/by-name/, (route) =>
      route.fulfill({
        json: {
          name: "Acme Corp",
          managerCount: 0,
          totalReviews: 0,
          avgRating: null,
          categoryAverages: {},
          managers: [],
        },
      })
    );
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText(/find a manager/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder("First name")).toBeVisible();
  });

  test("shows manager cards for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Sam Lee")).toBeVisible();
  });

  test("manager card links to manager profile for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies/Acme%20Corp");

    await page.getByText("Alex Johnson").click();

    await expect(page).toHaveURL(new RegExp(`/manager/${TEST_MANAGER_ID}`), {
      timeout: 5_000,
    });
  });

  test("back button returns to previous page in browser history", async ({ page }) => {
    // Navigate to listing first so browser history exists
    await page.goto("/companies");
    await expect(page.getByText("Acme Corp")).toBeVisible({ timeout: 5_000 });

    // Click tile to navigate to company profile (uses slug URL now)
    await page.getByText("Acme Corp").first().click();
    await expect(page).toHaveURL(/\/companies\/acme-corp/, { timeout: 5_000 });

    // Back button uses navigate(-1) — should return to /companies
    await page.getByRole("button", { name: /all companies/i }).click();

    await expect(page).toHaveURL(/\/companies$/, { timeout: 5_000 });
  });

  test("shows ghost cards and find form for empty company viewed by locked user", async ({ page }) => {
    await page.route(/\/api\/companies\/by-name/, (route) =>
      route.fulfill({
        json: {
          name: "UnknownCorp",
          managerCount: 0,
          totalReviews: 0,
          avgRating: null,
          categoryAverages: {},
          managers: [],
        },
      })
    );
    await page.goto("/companies/UnknownCorp");

    await expect(
      page.getByRole("heading", { name: "UnknownCorp", exact: true })
    ).toBeVisible({ timeout: 10_000 });
    // Sidebar search form shown — does not reveal that the company is empty
    await expect(page.getByText(/find a manager/i)).toBeVisible();
    await expect(page.getByText(/no managers listed yet/i)).not.toBeVisible();
  });

  test("ghost company shows no managers state and add CTA for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.route(/\/api\/companies\/by-name/, (route) =>
      route.fulfill({
        json: {
          name: "UnknownCorp",
          managerCount: 0,
          totalReviews: 0,
          avgRating: null,
          categoryAverages: {},
          managers: [],
        },
      })
    );
    await page.goto("/companies/UnknownCorp");

    await expect(page.getByText(/no managers listed yet/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /add a manager/i })).toBeVisible();
  });

  test("anonymous first search with no results auto-adds ghost and shows manager added message", async ({ page }) => {
    await mockCompanyRoutes(page);
    await page.addInitScript(() => {
      localStorage.removeItem("rmm_anon_ghost_created");
    });
    await page.route(/\/api\/managers\?/, (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/managers/ghost", (route) =>
      route.fulfill({ json: { ok: true } })
    );
    await page.goto("/companies/Acme%20Corp");

    await page.getByPlaceholder("First name").fill("Alex");
    await page.getByPlaceholder("Last name").fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Engineering Manager");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText(/manager added!/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /sign in to rate/i })).toBeVisible();
  });

  test("anonymous second search with no results shows no results found", async ({ page }) => {
    await mockCompanyRoutes(page);
    await page.addInitScript(() => {
      localStorage.setItem("rmm_anon_ghost_created", "true");
    });
    await page.route(/\/api\/managers\?/, (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.goto("/companies/Acme%20Corp");

    await page.getByPlaceholder("First name").fill("Alex");
    await page.getByPlaceholder("Last name").fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Engineering Manager");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText(/no results found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/manager added!/i)).not.toBeVisible();
  });

  test("clear search button resets form and hides results", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: false });
    await page.route("**/api/managers/find-or-create", (route) =>
      route.fulfill({
        json: {
          data: [{ id: TEST_MANAGER_ID, name: "Alex Johnson", company: "Acme Corp", title: "Engineering Manager", approvalStatus: "approved" }],
          created: false,
          hasContributed: false,
        },
      })
    );
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByRole("button", { name: /clear search/i })).not.toBeVisible();

    await page.getByPlaceholder("First name").fill("Alex");
    await page.getByPlaceholder("Last name").fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Engineering Manager");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /clear search/i })).toBeVisible();

    await page.getByRole("button", { name: /clear search/i }).click();

    await expect(page.getByPlaceholder("First name")).toHaveValue("");
    await expect(page.getByRole("button", { name: /clear search/i })).not.toBeVisible();
  });

  test("'Rate a manager' button on locked company profile navigates to /add with returnTo param", async ({ page }) => {
    await mockCompanyRoutes(page);
    await page.goto("/companies/Acme%20Corp");

    await page.getByRole("button", { name: /rate a manager/i }).first().click();

    await expect(page).toHaveURL(/\/add\?returnTo=.*companies.*Acme/, { timeout: 5_000 });
  });

  test("cancelling /add when arrived from company profile returns to company profile", async ({ page }) => {
    await mockCompanyRoutes(page);
    await page.route("**/api/geo", (route) => route.fulfill({ json: { country: "United States", state: "California", city: "San Francisco" } }));
    await page.route("**/api/managers/similar**", (route) => route.fulfill({ json: { data: [] } }));
    await page.goto("/add?returnTo=/companies/Acme%20Corp");

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page).toHaveURL(/\/companies\/Acme/, { timeout: 5_000 });
  });

  test("ghost placeholder cards have blurred ratings (not visually clear fake rating numbers)", async ({ page }) => {
    // MOCK_COMPANY_PROFILE has only 2 managers → 7 GhostManagerCard slots rendered
    // GhostManagerCard uses fake ratings (4.3, 3.8, 4.7). These must be inside a blurred
    // container so they don't look like real unlockable data.
    await page.goto("/companies/Acme%20Corp");

    // Ghost cards are identified by having both overflow-hidden and pointer-events-none.
    // The company insights blur overlay also has pointer-events-none but not overflow-hidden,
    // so this selector is unique to GhostManagerCard on this page.
    const ghostCard = page.locator('[class*="overflow-hidden"][class*="pointer-events-none"]').first();
    await expect(ghostCard).toBeVisible({ timeout: 5_000 });

    // The rating row inside the ghost card must carry blur-sm so the number is visually hidden
    const blurredRatingRow = ghostCard.locator('[class*="blur-sm"]').filter({ hasText: /\d\.\d/ });
    await expect(blurredRatingRow).toBeAttached();
  });

  test("ghost company CTA links to add page with company pre-filled for contributing user", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.route(/\/api\/companies\/by-name/, (route) =>
      route.fulfill({
        json: {
          name: "UnknownCorp",
          managerCount: 0,
          totalReviews: 0,
          avgRating: null,
          categoryAverages: {},
          managers: [],
        },
      })
    );
    await page.goto("/companies/UnknownCorp");

    const ctaLink = page.getByRole("link", { name: /add a manager/i });
    await expect(ctaLink).toHaveAttribute("href", /\/add\?company=UnknownCorp/, { timeout: 10_000 });
  });
});

test.describe("Company profile page — admin rename", () => {
  async function mockAdminCompanyProfile(page: any) {
    await page.route("**/api/auth/me", (route: any) =>
      route.fulfill({ json: { ...MOCK_ADMIN_USER, hasContributed: true } })
    );
    await page.route(/\/api\/companies\/by-name/, (route: any) =>
      route.fulfill({ json: MOCK_COMPANY_PROFILE })
    );
    await page.route("**/api/companies/suggest**", (route: any) =>
      route.fulfill({ json: [] })
    );
    await page.addInitScript((u: typeof MOCK_ADMIN_USER) => {
      localStorage.setItem("authUser", JSON.stringify({ ...u, hasContributed: true }));
    }, MOCK_ADMIN_USER);
  }

  test("admin sees pencil button next to company name", async ({ page }) => {
    await mockAdminCompanyProfile(page);
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByRole("button", { name: /rename company/i })).toBeVisible({ timeout: 5_000 });
  });

  test("clicking pencil shows rename input pre-filled with current name", async ({ page }) => {
    await mockAdminCompanyProfile(page);
    await page.goto("/companies/Acme%20Corp");

    await page.getByRole("button", { name: /rename company/i }).click();

    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible({ timeout: 3_000 });
    await expect(input).toHaveValue("Acme Corp");
    await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel$/i })).toBeVisible();
  });

  test("saving rename calls PUT API and navigates to new company URL", async ({ page }) => {
    await mockAdminCompanyProfile(page);
    await page.route(/\/api\/admin\/companies\/1$/, (route: any) => {
      if (route.request().method() === "PUT") {
        route.fulfill({ status: 200, json: { success: true } });
      } else {
        route.continue();
      }
    });
    await page.goto("/companies/Acme%20Corp");

    await page.getByRole("button", { name: /rename company/i }).click();
    const input = page.getByRole("textbox").first();
    await input.fill("Acme Corporation");
    // Use Enter to submit — avoids mobile sticky-header click interception
    await input.press("Enter");

    await expect(page).toHaveURL(/\/companies$/, { timeout: 5_000 });
    await expect(page.getByText(/company renamed successfully/i)).toBeVisible({ timeout: 5_000 });
  });

  test("cancel button exits rename mode without calling the API", async ({ page }) => {
    await mockAdminCompanyProfile(page);
    await page.goto("/companies/Acme%20Corp");

    await page.getByRole("button", { name: /rename company/i }).click();
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 3_000 });

    // force:true bypasses sticky-header click interception on mobile viewports
    await page.getByRole("button", { name: /^cancel$/i }).click({ force: true });

    // Save button gone confirms rename mode was exited; heading confirms name is still displayed
    await expect(page.getByRole("button", { name: /^save$/i })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Acme Corp", exact: true })).toBeVisible();
  });

  test("non-admin user does not see pencil button", async ({ page }) => {
    await mockCompanyRoutes(page, { loggedIn: true, hasContributed: true });
    await page.goto("/companies/Acme%20Corp");

    await expect(page.getByRole("heading", { name: "Acme Corp", exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /rename company/i })).not.toBeVisible();
  });
});

test.describe("Header — Companies nav tab", () => {
  test("Companies tab is visible for all users including logged-out", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /^companies$/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Companies tab is visible for admin users", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ json: { ...MOCK_USER, role: "admin" } })
    );
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify({ ...u, role: "admin" }));
    }, MOCK_USER);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /^companies$/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Browse tab is now labelled Managers", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    // Use a desktop viewport so the desktop nav is visible
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /^managers$/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByRole("link", { name: /^browse$/i })
    ).not.toBeVisible();
  });
});
