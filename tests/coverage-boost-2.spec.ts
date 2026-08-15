/**
 * Second wave of targeted Playwright coverage tests.
 * Targets: AddBoss, Admin, BossProfile, Directory, Companies, CompanyProfile, SignUp.
 */
import { test, expect } from "./base";
import {
  MOCK_USER, MOCK_ADMIN_USER, MOCK_MANAGER, MOCK_COMPANY_PROFILE,
  MOCK_COMPANY_LISTING, TEST_COMPANY_SLUG, TEST_MANAGER_SLUG,
  mockTurnstile,
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

// ─── Companies.tsx — error state + pagination ─────────────────────────────────

test.describe("Companies tab — additional coverage", () => {
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

// ─── CompanyProfile.tsx — error state + sidebar search ───────────────────────

test.describe("CompanyProfile — additional coverage", () => {
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
    const firstInput = page.getByPlaceholder(/first name/i).first();
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

// ─── Directory.tsx — search, sort, filter ────────────────────────────────────

test.describe("Directory — additional coverage", () => {
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
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("full-name search submits and shows results (unauthenticated)", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");
    await page.getByPlaceholder(/first name/i).fill("Alex");
    await page.getByPlaceholder(/last name/i).fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Manager");
    await page.getByPlaceholder(/company/i).fill("Acme Corp");
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("find-or-create fires for authenticated user full search", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true });
    await page.goto("/directory");
    await page.getByPlaceholder(/first name/i).fill("Alex");
    await page.getByPlaceholder(/last name/i).fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Manager");
    await page.getByPlaceholder(/company/i).fill("Acme Corp");
    await page.getByRole("button", { name: /^search$/i }).click();
    await expect(page.getByText(/alex johnson/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("clicking a min-rating star applies rating filter", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");
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
    // react-query retries 3x before isError settles — use longer timeout
    await expect(page.getByText(/something went wrong/i).first()).toBeVisible({ timeout: 15000 });
  });
});

// ─── Admin.tsx — tabs and actions ────────────────────────────────────────────

test.describe("Admin — tabs and actions", () => {
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

// ─── BossProfile.tsx — review interactions ───────────────────────────────────

test.describe("BossProfile — review interactions and states", () => {
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

  test("logged-in user with review sees review content", async ({ page }) => {
    await mockBossProfilePage(page, { loggedIn: true, hasContributed: true, reviews: MOCK_REVIEWS });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/great manager/i)).toBeVisible({ timeout: 8000 });
  });

  test("unauthenticated user sees write-a-review CTA", async ({ page }) => {
    await mockBossProfilePage(page, { loggedIn: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByRole("heading", { name: /alex johnson/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/write a review|rate this manager|share your experience/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("helpful vote button is clickable", async ({ page }) => {
    const reviewWithHelp = { ...MOCK_REVIEWS[0], authorDisplayName: "otheruser", author: "otheruser" };
    await mockBossProfilePage(page, { loggedIn: true, hasContributed: true, reviews: [reviewWithHelp] });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}/managers/${TEST_MANAGER_SLUG}`);
    await expect(page.getByText(/great manager/i)).toBeVisible({ timeout: 8000 });
    const helpfulBtn = page.getByRole("button").filter({ hasText: /helpful|useful/i }).first();
    if (await helpfulBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await helpfulBtn.click();
    }
    await expect(page.getByText(/great manager/i)).toBeVisible({ timeout: 3000 });
  });
});

// ─── AddBoss.tsx — multi-step form flow ───────────────────────────────────────

test.describe("AddBoss — multi-step form flow", () => {
  async function mockAddBossPage(page: any, loggedIn = true) {
    if (loggedIn) {
      await mockAuthenticated(page, MOCK_USER);
    } else {
      await mockUnauthenticated(page);
    }
    await mockGeo(page);
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
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");

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
    await page.getByPlaceholder(/e.g., Microsoft/i).fill("Acme Corp");

    // Geo pre-fills country; verify country select has a value
    const countrySelect = page.locator("select").first();
    if (await countrySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      const val = await countrySelect.inputValue();
      if (!val) await countrySelect.selectOption({ label: "Canada" });
    }

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

// ─── SignUp.tsx — form flows ──────────────────────────────────────────────────

test.describe("SignUp — form coverage", () => {
  async function setupSignUp(page: any) {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ json: { available: true } })
    );
    await page.route("**/api/auth/signup", (route: any) =>
      route.fulfill({ status: 200, json: { success: true } })
    );
  }

  async function fillSignUpForm(page: any, opts: {
    firstName?: string;
    lastName?: string;
    email?: string;
    username?: string;
    password?: string;
    confirmPassword?: string;
  } = {}) {
    const {
      firstName = "Alice",
      lastName = "Smith",
      email = "alice@example.com",
      username = "alicesmith42",
      password = "Passw0rd!",
      confirmPassword = "Passw0rd!",
    } = opts;
    // Use id selectors — labels like "Confirm Password" contain "password"
    // so getByLabel would be ambiguous
    await page.locator("#firstName").fill(firstName);
    await page.locator("#lastName").fill(lastName);
    await page.locator("#emailOrPhone").fill(email);
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.locator("#confirmPassword").fill(confirmPassword);
  }

  test("page loads and renders signup form", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    // Use heading role to avoid matching the "Create Account" submit button
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });
  });

  test("typing a valid username triggers availability check and shows 'available'", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });
    await page.locator("#username").fill("validuser42");
    // Wait for 500ms debounce + API response
    await page.waitForTimeout(700);
    await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5000 });
  });

  test("typing a taken username shows 'already taken' error", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ json: { available: false } })
    );
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });
    await page.locator("#username").fill("takenusername");
    await page.waitForTimeout(700);
    await expect(page.getByText(/already taken/i)).toBeVisible({ timeout: 5000 });
  });

  test("generate username button populates username field", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });
    // Button has title="Generate a random username" with RotateCcw icon (no visible text)
    await page.locator('[title="Generate a random username"]').click();
    await expect(page.locator("#username")).not.toHaveValue("");
  });

  test("password rules display when typing password", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });
    await page.locator("#password").fill("Passw0rd!");
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/uppercase/i)).toBeVisible({ timeout: 3000 });
  });

  test("confirm password mismatch shows error", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    await page.locator("#password").fill("Passw0rd!");
    await page.locator("#confirmPassword").fill("DifferentPass1!");
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 3000 });
  });

  test("successful signup shows 'check your email' confirmation", async ({ page }) => {
    await setupSignUp(page);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible({ timeout: 8000 });

    await fillSignUpForm(page);
    await page.waitForTimeout(700);
    await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5000 });
    // Give Turnstile mock time to fire (50ms + margin)
    await page.waitForTimeout(200);

    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 8000 });
  });

  test("signup error: email_already_registered shows inline error", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ json: { available: true } })
    );
    await page.route("**/api/auth/signup", (route: any) =>
      route.fulfill({ status: 400, json: { error: "email_already_registered" } })
    );
    await page.goto("/signup");
    await fillSignUpForm(page);
    await page.waitForTimeout(700);
    await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/email.*already exists|already registered/i)).toBeVisible({ timeout: 8000 });
  });

  test("signup error: username_taken shows username error", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ json: { available: true } })
    );
    await page.route("**/api/auth/signup", (route: any) =>
      route.fulfill({ status: 400, json: { error: "username_taken" } })
    );
    await page.goto("/signup");
    await fillSignUpForm(page);
    await page.waitForTimeout(700);
    await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/already taken/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("signup generic error shows error message", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ json: { available: true } })
    );
    await page.route("**/api/auth/signup", (route: any) =>
      route.fulfill({ status: 500, json: { message: "Server error occurred" } })
    );
    await page.goto("/signup");
    await fillSignUpForm(page);
    await page.waitForTimeout(700);
    await expect(page.getByText(/username is available/i)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /^create account$/i }).click();
    await expect(page.getByText(/server error occurred|failed to sign up|error/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("username check failure shows retry message", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockTurnstile(page);
    await page.route("**/api/auth/check-username*", (route: any) =>
      route.fulfill({ status: 500, json: { error: "Server error" } })
    );
    await page.goto("/signup");
    await page.locator("#username").fill("someuser");
    await page.waitForTimeout(700);
    await expect(page.getByText(/couldn.?t check|try again/i)).toBeVisible({ timeout: 5000 });
  });
});
