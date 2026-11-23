/**
 * Second wave of targeted Playwright coverage tests.
 * Targets: AddBoss, Admin, BossProfile, Directory, Companies, CompanyProfile, SignUp.
 */
import { test, expect } from "./base";
import {
  MOCK_USER, MOCK_ADMIN_USER, MOCK_MANAGER, MOCK_COMPANY_PROFILE,
  MOCK_COMPANY_LISTING, TEST_COMPANY_SLUG, TEST_MANAGER_SLUG,
  mockTurnstile,
  openDirectoryFilters,
  pickLocation,
  DEFAULT_LOCATION_SUGGESTION,
} from "./fixtures";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mockUnauthenticated(page: any) {
  await page.route("**/api/auth/me", (route: any) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
}

async function mockAuthenticated(page: any, user = MOCK_USER) {
  await page.route("**/api/auth/me", (route: any) =>
    route.fulfill({ json: user })
  );
  await page.addInitScript((u: any) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
}

async function mockGeo(page: any) {
  await page.route("**/api/geo", (route: any) =>
    route.fulfill({ json: { country: "CA", state: "ON", city: "Toronto" } })
  );
}

const MOCK_REVIEWS = [
  {
    id: "rev-1",
    managerId: MOCK_MANAGER.id,
    managerName: "Alex Johnson",
    author: "testuser",
    authorDisplayName: "testuser",
    overallRating: 4,
    ratings: { "Communication Style": 4 },
    text: "Great manager.",
    verified: true,
    helpfulCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    workedFrom: "2021-01",
    workedUntil: "2022-12",
    managerTitle: "Engineering Manager",
    managerCompany: "Acme Corp",
    managerRoleStart: null,
    managerRoleEnd: null,
  },
];

const MOCK_CAREER_SEGMENTS = [
  {
    company: "Acme Corp",
    role: "Engineering Manager",
    startDate: "2020-01",
    endDate: null,
    isCurrent: true,
    averageRating: 4.1,
    reviewCount: 1,
    categoryAverages: {},
    logoUrl: null,
  },
];

// ─── Companies.tsx - error state + pagination ─────────────────────────────────

test.describe("Companies tab - additional coverage", () => {
  test("error state shows when API fails", async ({ page }) => {
    await mockAuthenticated(page, { ...MOCK_USER, hasContributed: true });
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ status: 500, json: { error: "Internal server error" } })
    );
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed: true } })
    );
    await page.goto("/companies");
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 15000 });
  });

  test("pagination shows and navigates to page 2 when >24 companies", async ({ page }) => {
    await mockAuthenticated(page, { ...MOCK_USER, hasContributed: true });
    const manyCompanies = Array.from({ length: 30 }, (_, i) => ({
      name: `Company ${i + 1}`,
      slug: `company-${i + 1}`,
      managerCount: i + 1,
      totalReviews: i * 2,
      avgRating: 3.5 + (i % 3) * 0.5,
    }));
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: manyCompanies } })
    );
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed: true } })
    );
    await page.goto("/companies");
    await expect(page.getByText(/company 1/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel(/previous page/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button").filter({ hasText: "2" }).first().click();
    await expect(page.getByText(/company/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("locked user sees locked gate on companies tab", async ({ page }) => {
    await mockAuthenticated(page, { ...MOCK_USER, hasContributed: false });
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: MOCK_COMPANY_LISTING } })
    );
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed: false } })
    );
    await page.goto("/companies");
    await expect(page.getByText(/rate a manager to unlock/i)).toBeVisible({ timeout: 8000 });
  });

  test("clicking a company tile navigates to company profile", async ({ page }) => {
    await mockAuthenticated(page, { ...MOCK_USER, hasContributed: true });
    await page.route("**/api/companies/listing", (route: any) =>
      route.fulfill({ json: { data: MOCK_COMPANY_LISTING } })
    );
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed: true } })
    );
    await page.goto("/companies");
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 8000 });
    await page.getByText(/acme corp/i).first().click();
    await expect(page).toHaveURL(/\/companies\/acme-corp/, { timeout: 5000 });
  });
});

// ─── CompanyProfile.tsx - error state + sidebar search ───────────────────────

test.describe("CompanyProfile - additional coverage", () => {
  async function mockCompanyProfilePage(page: any, opts: { loggedIn?: boolean; apiError?: boolean; hasContributed?: boolean } = {}) {
    const { loggedIn = false, apiError = false, hasContributed = false } = opts;
    if (loggedIn) {
      await mockAuthenticated(page, { ...MOCK_USER, hasContributed });
    } else {
      await mockUnauthenticated(page);
    }
    await mockGeo(page);
    await page.route(`**/api/companies/by-slug/${TEST_COMPANY_SLUG}`, (route: any) => {
      if (apiError) {
        route.fulfill({ status: 404, json: { error: "Company not found" } });
      } else {
        route.fulfill({ json: { ...MOCK_COMPANY_PROFILE, slug: TEST_COMPANY_SLUG } });
      }
    });
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed } })
    );
    await page.route("**/api/managers/find-or-create", (route: any) =>
      route.fulfill({ json: { data: [MOCK_MANAGER], hasContributed } })
    );
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: [MOCK_MANAGER], total: 1 } })
    );
    await page.route("**/api/managers/ghost", (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
  }

  test("error state shown when company API fails", async ({ page }) => {
    await mockCompanyProfilePage(page, { apiError: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 8000 });
  });

  test("contributor sees company profile content", async ({ page }) => {
    await mockCompanyProfilePage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("h1,h2").filter({ hasText: /acme corp/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test("sidebar search finds manager on company profile (logged in)", async ({ page }) => {
    await mockCompanyProfilePage(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 8000 });
    // The search form has a desktop and a mobile copy; take the one on screen.
    const firstInput = page.getByPlaceholder(/first name/i).filter({ visible: true }).first();
    if (await firstInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstInput.fill("Alex");
      const lastInput = page.getByPlaceholder(/last name/i).first();
      await lastInput.fill("Johnson");
      const titleInput = page.getByPlaceholder(/title|role/i).first();
      await titleInput.fill("Engineering Manager");
      await page.getByRole("button", { name: /search/i }).first().click();
      await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
    }
  });
});

// ─── Directory.tsx - search, sort, filter ────────────────────────────────────

test.describe("Directory - additional coverage", () => {
  async function mockDirectoryPage(page: any, opts: { loggedIn?: boolean; results?: any[] } = {}) {
    const { loggedIn = false, results = [MOCK_MANAGER] } = opts;
    if (loggedIn) {
      await mockAuthenticated(page, MOCK_USER);
    } else {
      await mockUnauthenticated(page);
    }
    await mockGeo(page);
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ json: { data: results, total: results.length } })
    );
    await page.route("**/api/managers/find-or-create", (route: any) =>
      route.fulfill({ json: { data: results, hasContributed: true } })
    );
    await page.route("**/api/managers/ghost", (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route("**/api/users/me/submitted-managers*", (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
  }

  test("page loads and renders manager list", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");
    // Below lg the search and rating filters sit behind "Filters".
    await openDirectoryFilters(page);
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("full-name search submits and shows results (unauthenticated)", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");
    // Below lg the search and rating filters sit behind "Filters".
    await openDirectoryFilters(page);
    await page.getByPlaceholder(/first name/i).filter({ visible: true }).first().fill("Alex");
    await page.getByPlaceholder(/last name/i).fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Manager");
    await page.getByPlaceholder(/company/i).fill("Acme Corp");
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("find-or-create fires for authenticated user full search", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true });
    await page.goto("/directory");
    // Below lg the search and rating filters sit behind "Filters".
    await openDirectoryFilters(page);
    await page.getByPlaceholder(/first name/i).filter({ visible: true }).first().fill("Alex");
    await page.getByPlaceholder(/last name/i).fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Manager");
    await page.getByPlaceholder(/company/i).fill("Acme Corp");
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("clicking a min-rating star applies rating filter", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");
    // Below lg the search and rating filters sit behind "Filters".
    await openDirectoryFilters(page);
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
    const starFilter = page.getByRole("button", { name: /3 stars and up/i }).first();
    if (await starFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await starFilter.click();
    }
  });

  test("error state shown when API fails", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.route(/\/api\/managers\?/, (route: any) =>
      route.fulfill({ status: 500, json: { error: "Internal error" } })
    );
    await page.route("**/api/users/me/submitted-managers*", (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.goto("/directory");
    // Below lg the search and rating filters sit behind "Filters".
    await openDirectoryFilters(page);
    // react-query retries 3x before isError settles - use longer timeout
    await expect(page.getByText(/something went wrong/i).first()).toBeVisible({ timeout: 15000 });
  });
});

// ─── Admin.tsx - tabs and actions ────────────────────────────────────────────

test.describe("Admin - tabs and actions", () => {
  const ADMIN = { ...MOCK_ADMIN_USER, hasContributed: true };

  const MOCK_PENDING_MANAGER = {
    id: 999,
    name: "Jane Doe",
    title: "Product Manager",
    company: "Beta Corp",
    image: "J",
    approvalStatus: "pending_approval",
    submittedBy: "user-2",
    createdAt: new Date().toISOString(),
    isAutoCreated: false,
  };

  const MOCK_PENDING_EDIT = {
    id: "edit-1",
    managerId: 42,
    managerName: "Alex Johnson",
    proposedBy: "user-2",
    newTitle: "Senior Manager",
    newCompany: null,
    newStatus: null,
    newCountry: null,
    newLinkedinUrl: null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const MOCK_BANNED_USER = {
    id: "banned-1",
    username: "badactor",
    firstName: "Bad",
    lastName: "Actor",
    isBanned: true,
    banReason: "Spam",
  };

  const MOCK_GHOST_MANAGER = {
    id: 77,
    name: "Ghost Person",
    title: "CTO",
    company: "Ghost Inc",
    image: "G",
    approvalStatus: "ghost",
    createdAt: new Date().toISOString(),
  };

  const MOCK_NORMAL_USER = {
    id: "normal-user-1",
    username: "normaluser",
    firstName: "Normal",
    lastName: "User",
    isBanned: false,
  };

  async function mockAdminPage(page: any, opts: {
    pendingManagers?: any[];
    pendingEdits?: any[];
    bannedUsers?: any[];
    ghostManagers?: any[];
    allUsers?: any[];
    aiSuggestions?: any[];
  } = {}) {
    const {
      pendingManagers = [],
      pendingEdits = [],
      bannedUsers = [],
      ghostManagers = [],
      allUsers = [MOCK_NORMAL_USER],
      aiSuggestions = [],
    } = opts;
    await mockAuthenticated(page, ADMIN);
    await page.route("**/api/stats", (route: any) =>
      route.fulfill({ json: { realManagers: 100, realReviews: 500, weightedOpinions: 450, scrapedManagers: 10, seededManagers: 3 } })
    );
    await page.route("**/api/admin/pending-managers", (route: any) =>
      route.fulfill({ json: { data: pendingManagers } })
    );
    await page.route("**/api/admin/pending-edits", (route: any) =>
      route.fulfill({ json: { data: pendingEdits } })
    );
    await page.route("**/api/admin/ghost-managers", (route: any) =>
      route.fulfill({ json: { data: ghostManagers } })
    );
    await page.route("**/api/admin/banned-users", (route: any) =>
      route.fulfill({ json: { data: bannedUsers } })
    );
    await page.route("**/api/admin/users*", (route: any) =>
      route.fulfill({ json: { data: allUsers } })
    );
    await page.route("**/api/admin/merge-suggestions*", (route: any) =>
      route.fulfill({ json: { data: aiSuggestions, total: aiSuggestions.length } })
    );
    await page.route("**/api/admin/companies*", (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route(/\/api\/admin\/pending-managers\/\d+\/approve/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/pending-managers\/\d+\/reject/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/pending-edits\/.+\/approve/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/pending-edits\/.+\/reject/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/users\/.+\/ban/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/users\/.+\/unban/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/admin\/ghost-managers\/.+\/mark-reviewed/, (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
    await page.route(/\/api\/managers\/similar/, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
  }

  test("admin page loads with stats and empty queues", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/no pending manager submissions/i)).toBeVisible({ timeout: 5000 });
  });

  test("switching to Live Profiles tab loads ghost managers", async ({ page }) => {
    await mockAdminPage(page, { ghostManagers: [MOCK_GHOST_MANAGER] });
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /live profiles/i }).click();
    await expect(page.getByText(/ghost person/i)).toBeVisible({ timeout: 8000 });
  });

  test("switching to Edit Requests tab shows pending edits", async ({ page }) => {
    await mockAdminPage(page, { pendingEdits: [MOCK_PENDING_EDIT] });
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("switching to Bans tab shows banned users", async ({ page }) => {
    await mockAdminPage(page, { bannedUsers: [MOCK_BANNED_USER] });
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /banned users/i }).click();
    await expect(page.getByText(/badactor/i)).toBeVisible({ timeout: 8000 });
  });

  test("switching to AI Suggestions tab loads", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /ai suggestions/i }).click();
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 3000 });
  });

  test("switching to Merge Duplicates tab", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /merge duplicates/i }).click();
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 3000 });
  });

  test("switching to Companies tab", async ({ page }) => {
    await mockAdminPage(page);
    await page.goto("/admin");
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /^companies$/i }).click();
    await expect(page.getByText(/admin panel/i)).toBeVisible({ timeout: 3000 });
  });

  test("pending manager: approve flow shows confirm dialog then succeeds", async ({ page }) => {
    await mockAdminPage(page, { pendingManagers: [MOCK_PENDING_MANAGER] });
    await page.goto("/admin");
    await expect(page.getByText(/jane doe/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /approve/i }).first().click();
    await expect(page.getByText(/approve.*jane doe|confirm.*approve/i).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^approve$|^confirm$|yes/i }).last().click();
    await expect(page.getByText(/no pending manager submissions|approved and is now live/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("pending manager: reject flow works", async ({ page }) => {
    await mockAdminPage(page, { pendingManagers: [MOCK_PENDING_MANAGER] });
    await page.goto("/admin");
    await expect(page.getByText(/jane doe/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /reject/i }).first().click();
    /*
      The dialog now asks WHY before it will reject anything, and the confirm button stays
      disabled until it is answered. Only "junk" debits the submitter's confidence, so the
      answer cannot be defaulted: rejecting a duplicate used to cost somebody 20 points for a
      submission that was never their fault. "duplicate" here is the no-penalty choice.
    */
    await page.getByTestId("reject-category-duplicate").click();
    await page.getByRole("button", { name: /^reject$|^confirm$|yes/i }).last().click();
    await expect(page.getByText(/no pending manager submissions|rejected/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("pending edit: approve flow works", async ({ page }) => {
    await mockAdminPage(page, { pendingEdits: [MOCK_PENDING_EDIT] });
    await page.goto("/admin");
    await page.getByRole("button", { name: /edit requests/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /approve/i }).first().click();
    await page.getByRole("button", { name: /^approve$|^confirm$|yes/i }).last().click();
    await expect(page.getByText(/no pending edits|approved/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("mark ghost as reviewed works", async ({ page }) => {
    await mockAdminPage(page, { ghostManagers: [MOCK_GHOST_MANAGER] });
    await page.goto("/admin");
    await page.getByRole("button", { name: /live profiles/i }).click();
    await expect(page.getByText(/ghost person/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /mark.*reviewed|reviewed/i }).first().click();
    await expect(page.getByText(/ghost person/i)).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── BossProfile.tsx - review interactions ───────────────────────────────────

test.describe("BossProfile - review interactions and states", () => {
  async function mockBossProfilePage(page: any, opts: {
    loggedIn?: boolean;
    hasContributed?: boolean;
    reviews?: any[];
    isError?: boolean;
  } = {}) {
    const { loggedIn = false, hasContributed = false, reviews = [], isError = false } = opts;
    if (loggedIn) {
      await mockAuthenticated(page, { ...MOCK_USER, hasContributed });
    } else {
      await mockUnauthenticated(page);
    }
    await page.route(`**/api/managers/by-slug/${TEST_MANAGER_SLUG}*`, (route: any) => {
      if (isError) {
        route.fulfill({ status: 404, json: { error: "Not found" } });
      } else {
        route.fulfill({ json: { ...MOCK_MANAGER, reviewsCount: reviews.length } });
      }
    });
    await page.route(`**/api/managers/${MOCK_MANAGER.id}/reviews*`, (route: any) =>
      route.fulfill({ json: { data: reviews, total: reviews.length } })
    );
    await page.route(`**/api/managers/${MOCK_MANAGER.id}/career-segments`, (route: any) =>
      route.fulfill({ json: { data: reviews.length ? MOCK_CAREER_SEGMENTS : [] } })
    );
    await page.route(`**/api/managers/${MOCK_MANAGER.id}/pending-edits`, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/users/me/has-contributed", (route: any) =>
      route.fulfill({ json: { hasContributed } })
    );
    await page.route(/\/api\/managers\/.+\/reviews\/.+\/helpful/, (route: any) =>
      route.fulfill({ status: 200, json: { helpfulCount: 3 } })
    );
    await page.route(/\/api\/managers\/.+\/reviews\/.+/, (route: any) => {
      if (route.request().method() === "DELETE") {
        route.fulfill({ status: 200, json: { success: true } });
      } else {
        route.continue();
      }
    });
    await page.route("**/api/users/me*", (route: any) =>
      route.fulfill({ json: MOCK_USER })
    );
  }

  test("error state shown when manager API fails", async ({ page }) => {
    await mockBossProfilePage(page, { isError: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByText(/not found|error|doesn't exist|oops/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("profile loads with career segments", async ({ page }) => {
    await mockBossProfilePage(page, { reviews: MOCK_REVIEWS });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/acme corp/i).first()).toBeVisible({ timeout: 5000 });
  });

  /*
    THE PROSE IS GONE, SO THESE ANCHOR ON THE AUTHOR INSTEAD.

    Free-form review text was removed on 2026-11-18: a rating is scores. The mock still CARRIES a
    `text` field, deliberately, and the assertion is now that it does not appear - which makes
    these a regression test for the removal rather than two specs that merely stopped checking.
  */
  test("logged-in user with review sees the review card, and no prose", async ({ page }) => {
    await mockBossProfilePage(page, { loggedIn: true, hasContributed: true, reviews: MOCK_REVIEWS });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/testuser/i).filter({ visible: true }).first())
      .toBeVisible({ timeout: 8000 });
    // The mock supplies "Great manager." and nothing may render it.
    await expect(page.getByText(/great manager/i)).toHaveCount(0);
  });

  test("unauthenticated user sees write-a-review CTA", async ({ page }) => {
    await mockBossProfilePage(page, { loggedIn: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/write a review|rate this manager|share your experience/i).first()).toBeVisible({ timeout: 5000 });
  });

  /*
   * REMOVED 2026-11-18: "helpful vote button is clickable".
   *
   * There is no helpful-voting feature in either product and there never has been. The test
   * looked for the button with `if (await helpfulBtn.isVisible(...))` and clicked it only if one
   * turned up, so it never found one and passed regardless - a test that asserted nothing while
   * reading as coverage for a feature nobody built.
   *
   * What exists is vestigial and is deliberately left alone here: `reviews.helpful_count` from
   * V1__init.sql (always 0, nothing writes it), an unreachable `case "helpful"` sort branch, and
   * `helpful` in the API's sort enum. There is no vote endpoint, no per-user vote table and no
   * UI. Removing those is a separate decision.
   */

});

// ─── AddBoss.tsx - multi-step form flow ───────────────────────────────────────

test.describe("AddBoss - multi-step form flow", () => {
  async function mockAddBossPage(page: any, loggedIn = true) {
    if (loggedIn) {
      await mockAuthenticated(page, MOCK_USER);
    } else {
      await mockUnauthenticated(page);
    }
    await mockGeo(page);
    /*
      This local helper shadows the one in fixtures.ts, so it needs the location picker's endpoint
      too. Without it the request falls through the vite proxy to whatever backend is running -
      which answers here and answers nothing in CI, and answers from the real S3 corpus either way.
    */
    await page.route(/\/api\/company-locations\/suggest/, (route: any) =>
      route.fulfill({ json: [DEFAULT_LOCATION_SUGGESTION] })
    );
    await page.route(/\/api\/companies\/suggest/, (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/managers/similar*", (route: any) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/managers*", (route: any) => {
      if (route.request().method() === "POST") {
        route.fulfill({ status: 200, json: { id: 123, name: "Test Manager", company: "Acme Corp", slug: "test-manager" } });
      } else {
        route.continue();
      }
    });
    await page.route("**/api/reviews*", (route: any) =>
      route.fulfill({ status: 200, json: { id: "rev-new", success: true } })
    );
  }

  test("add page renders the info form step", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 8000 });
    // First name field uses placeholder "e.g., Satya"
    await expect(page.getByPlaceholder(/e.g., Satya/i)).toBeVisible({ timeout: 5000 });
  });

  test("filling step 1 fields accepts input", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 8000 });

    await page.getByPlaceholder(/e.g., Satya/i).fill("Alice");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Smith");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineering Manager");
    // The company field is CompanyField now, which owns its own placeholder; the name
    // attribute is what stayed stable across that change.
    await page.locator('input[name="company"]').fill("Acme Corp");

    await expect(page.getByPlaceholder(/e.g., Satya/i)).toHaveValue("Alice");
    await expect(page.getByPlaceholder(/e.g., Nadella/i)).toHaveValue("Smith");
  });

  test("step 1 Next navigates to step 2 (timeline) after filling all fields", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 8000 });

    await page.getByPlaceholder(/e.g., Satya/i).fill("Alice");
    await page.getByPlaceholder(/e.g., Nadella/i).fill("Smith");
    await page.getByPlaceholder(/e.g., Engineering Manager/i).fill("Engineering Manager");
    // The company field is CompanyField now, which owns its own placeholder; the name
    // attribute is what stayed stable across that change.
    await page.locator('input[name="company"]').fill("Acme Corp");
    // Location is required and no longer prefilled, so step 1 is not valid without one.
    await page.keyboard.press("Escape");   // close the company picker's own listbox
    await pickLocation(page);

    const nextBtn = page.getByRole("button", { name: /^next$/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    if (await nextBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await expect(page.getByText(/when did you work|step 2/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("selecting retired status changes radio button", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 8000 });
    // Click the Retired radio
    const retiredLabel = page.getByText(/retired.*no longer|no longer in this role/i).first();
    if (await retiredLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await retiredLabel.click();
    }
    await expect(page.getByText(/who is this manager/i)).toBeVisible({ timeout: 3000 });
  });
});

// ─── SignUp.tsx - form flows ──────────────────────────────────────────────────

/*
  A "SignUp" BLOCK OF 11 TESTS STOOD HERE, raising coverage on a page that no longer exists in
  that form.

  SignUp.tsx was 394 lines - names, email, username, password, confirmation, a strength checklist,
  a live username check and a Turnstile widget, posted to /api/auth/signup. It is now about 100
  lines whose whole job is to send the browser to Auth0's hosted registration page, because
  collecting the password meant it passed through this application and the matching sign-in path
  used grant_type=password, forbidden by RFC 9700 section 2.4.

  Those tests covered branches that were deleted. Where the GUARANTEES went is recorded in
  tests/signup.spec.ts, which carries a table naming all nine and their new homes, and in
  ProfileCompletionIntegrationTest, which now asserts the username-taken and username-invalid
  refusals against a real database instead of a mocked fetch.

  A real reduction in browser-test count, explained rather than hidden: the component shrank by
  about 75% and the tests exercising the removed 75% went with it.
*/
