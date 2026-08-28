import { Page } from "@playwright/test";

// ─── IDs ─────────────────────────────────────────────────────────────────────

export const TEST_MANAGER_ID = "playwright-test-manager";
export const TEST_PENDING_MANAGER_ID = "pending-manager-1";

// ─── Mock users ──────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: "test-user-1",
  username: "testuser",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  role: "user",
  isBanned: false,
  hasContributed: true,
};

export const MOCK_ADMIN_USER = {
  id: "admin-user-1",
  username: "adminuser",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  role: "admin",
  isBanned: false,
};

export const MOCK_BANNABLE_USER = {
  id: "normal-user-1",
  username: "normaluser",
  firstName: "Normal",
  lastName: "User",
  isBanned: false,
};

// ─── Mock managers ───────────────────────────────────────────────────────────

export const TEST_COMPANY_SLUG = "acme-corp";
export const TEST_MANAGER_SLUG = "alex-johnson";

export const MOCK_MANAGER = {
  id: TEST_MANAGER_ID,
  slug: TEST_MANAGER_SLUG,
  companySlug: TEST_COMPANY_SLUG,
  name: "Alex Johnson",
  title: "Engineering Manager",
  company: "Acme Corp",
  status: "active",
  approvalStatus: "approved",
  image: "A",
  bio: "A test manager for Playwright tests.",
  overallRating: 3.8,
  totalRatings: 12,
  linkedinUrl: null,
  companyLogoUrl: null,
  careerHistory: [
    {
      id: "ch-1",
      title: "Engineering Manager",
      company: "Acme Corp",
      startDate: "2020-01",
      endDate: null,
    },
  ],
};

export const MOCK_PENDING_MANAGER = {
  id: TEST_PENDING_MANAGER_ID,
  slug: TEST_PENDING_MANAGER_ID,
  name: "Jane Smith",
  title: "Product Manager",
  company: "Beta Corp",
  status: "active",
  approvalStatus: "pending_approval",
  image: "J",
  bio: "A pending manager submission.",
  overallRating: null,
  totalRatings: 0,
  linkedinUrl: null,
  companyLogoUrl: null,
  careerHistory: [],
};

export const MOCK_MANAGERS_LIST = [
  {
    id: TEST_MANAGER_ID,
    name: "Alex Johnson",
    title: "Engineering Manager",
    company: "Acme Corp",
    overallRating: 3.8,
    reviews: 12,
    approvalStatus: "approved",
    image: "A",
  },
  {
    id: "manager-2",
    name: "Sarah Connor",
    title: "Product Manager",
    company: "Skynet Inc",
    overallRating: 4.5,
    reviews: 8,
    approvalStatus: "approved",
    image: "S",
  },
];

export const MOCK_COMPANIES_LIST = ["Acme Corp", "Skynet Inc", "Beta Corp"];

// Visitor geo as resolved from /api/geo (Cloudflare headers). Used to pre-fill the
// Add Manager form and to stamp ghost/find-or-create submissions.
export const MOCK_GEO = { country: "United States", state: "California", city: "San Francisco" };

// ─── Mock reviews ─────────────────────────────────────────────────────────────

export const RATING_CATEGORIES = [
  "Communication Style",
  "Perceived Approachability",
  "Perceived Clarity of Expectations",
  "Feedback Style",
  "Perceived Supportiveness",
  "Decision Making Style",
  "Organization and Planning Style",
  "Delegation Style",
  "Perceived Professional Demeanor",
  "Overall Working Experience",
];

export const MOCK_EXISTING_REVIEW = {
  id: "review-1",
  author: "testuser",
  authorType: "username",
  overallRating: 4,
  ratings: Object.fromEntries(RATING_CATEGORIES.map((c) => [c, 4])),
  managerTitle: "Engineering Manager",
  managerCompany: "Acme Corp",
  workedFrom: "2021-01",
  workedUntil: "2022-12",
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: null,
  helpfulCount: 0,
  managerId: TEST_MANAGER_ID,
};

/** Review as returned by GET /api/users/me/reviews (has managerName) */
export const MOCK_MY_REVIEW = {
  ...MOCK_EXISTING_REVIEW,
  managerName: "Alex Johnson",
};

export const MOCK_PENDING_SUBMISSION = {
  id: "pending-sub-1",
  name: "Jane Smith",
  title: "Product Manager",
  company: "Beta Corp",
  approvalStatus: "pending_approval",
  bio: null,
  linkedinUrl: null,
  image: "J",
  status: "active",
};

// ─── Mock notifications ───────────────────────────────────────────────────────

export const MOCK_NOTIFICATION_APPROVED = {
  id: "notif-1",
  type: "manager_approved",
  title: "Manager Approved",
  message: "Your manager submission 'Alex Johnson' has been approved and is now live.",
  read: false,
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  managerId: TEST_MANAGER_ID,
};

export const MOCK_NOTIFICATION_REJECTED = {
  id: "notif-2",
  type: "manager_rejected",
  title: "Manager Rejected",
  message: "Your submitted manager profile for Bad Manager at Some Corp was not approved. Reason: Duplicate profile",
  read: true,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  managerId: null,
};

// ─── Mock admin data ──────────────────────────────────────────────────────────

export const MOCK_PENDING_ADMIN_MANAGER = {
  id: "admin-pm-1",
  name: "John Doe",
  title: "VP Engineering",
  company: "Foo Inc",
  submittedBy: "testuser",
  createdAt: new Date().toISOString(),
  isAutoCreated: false,
};

export const MOCK_AUTO_CREATED_ADMIN_MANAGER = {
  id: "admin-pm-auto-1",
  name: "Go Person",
  title: "Engineer",
  company: "Go",
  submittedBy: null,
  createdAt: new Date().toISOString(),
  isAutoCreated: true,
};

export const MOCK_EDIT_REQUEST = {
  id: "edit-req-1",
  managerId: TEST_MANAGER_ID,
  managerName: "Alex Johnson",
  requestedBy: "testuser",
  proposedTitle: "Senior Engineering Manager",
  proposedCompany: "Acme Corp",
  currentTitle: "Engineering Manager",
  currentCompany: "Acme Corp",
  createdAt: new Date().toISOString(),
};

export const MOCK_BANNED_USER_ENTRY = {
  id: "ban-1",
  userId: "banned-user-1",
  username: "baduser",
  reason: "Spam",
  bannedBy: "adminuser",
  bannedAt: new Date().toISOString(),
};

export const MOCK_ADMIN_COMPANIES = [
  { id: 1, name: "Acme Corp",  status: "approved", managerCount: 3 },
  { id: 2, name: "Skynet Inc", status: "approved", managerCount: 1 },
];

/** Mock fixture for AddBoss search results (duplicate detection) */
export const MOCK_SIMILAR_MANAGERS: any[] = [];

// ─── Mock company data ────────────────────────────────────────────────────────

export const MOCK_COMPANY_LISTING = [
  {
    name: "Acme Corp",
    slug: TEST_COMPANY_SLUG,
    managerCount: 3,
    totalReviews: 15,
    avgRating: 4.1,
  },
  {
    name: "Skynet Inc",
    slug: "skynet-inc",
    managerCount: 1,
    totalReviews: 5,
    avgRating: 3.8,
  },
];

export const MOCK_COMPANY_PROFILE = {
  id: 1,
  name: "Acme Corp",
  managerCount: 2,
  totalReviews: 12,
  avgRating: 4.1,
  categoryAverages: {
    "Communication Style": 4.3,
    "Perceived Approachability": 4.5,
    "Perceived Clarity of Expectations": 4.0,
    "Feedback Style": 3.8,
    "Perceived Supportiveness": 4.2,
    "Decision Making Style": 3.9,
    "Organization and Planning Style": 4.1,
    "Delegation Style": 3.7,
    "Perceived Professional Demeanor": 4.4,
    "Overall Working Experience": 4.0,
  },
  managers: [
    {
      id: TEST_MANAGER_ID,
      name: "Alex Johnson",
      title: "Engineering Manager",
      overallRating: 4.3,
      reviewsCount: 8,
      company: "Acme Corp",
      approvalStatus: "approved",
    },
    {
      id: "manager-2",
      name: "Sam Lee",
      title: "Director of Engineering",
      overallRating: 3.9,
      reviewsCount: 4,
      company: "Acme Corp",
      approvalStatus: "approved",
    },
  ],
};

// ─── Page-level mock setup helpers ───────────────────────────────────────────

/**
 * Sets up API mocks for the manager profile page (BossProfile).
 * Register routes BEFORE navigating.
 */
export async function mockManagerPage(
  page: Page,
  opts: {
    manager?: typeof MOCK_MANAGER;
    existingUserReviews?: typeof MOCK_EXISTING_REVIEW[];
    loggedIn?: boolean;
    hasContributed?: boolean;
    user?: typeof MOCK_USER;
  } = {}
) {
  const {
    manager = MOCK_MANAGER,
    existingUserReviews = [],
    loggedIn = false,
    hasContributed = true,
    user = MOCK_USER,
  } = opts;

  await page.route("**/api/auth/me", (route) => {
    if (loggedIn) {
      route.fulfill({ json: { ...user, hasContributed } });
    } else {
      route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    }
  });

  await page.route(
    new RegExp(`/api/managers/${manager.id}$`),
    (route) => {
      route.fulfill({ json: manager });
    }
  );

  // Slug-based lookup (used when navigating to /companies/:companySlug/managers/:managerSlug)
  await page.route(
    new RegExp(`/api/managers/by-slug/${manager.slug}`),
    (route) => {
      route.fulfill({ json: manager });
    }
  );

  // Reviews endpoint - GET (feed + per-user), POST (submit), DELETE (single review)
  await page.route(
    new RegExp(`/api/managers/${manager.id}/reviews`),
    (route) => {
      const method = route.request().method();

      if (method === "POST") {
        route.fulfill({
          status: 201,
          json: { ...MOCK_EXISTING_REVIEW, id: "review-new" },
        });
        return;
      }
      if (method === "DELETE") {
        route.fulfill({ status: 200, json: { success: true } });
        return;
      }

      const url = route.request().url();
      if (url.includes("userId=")) {
        route.fulfill({ json: { data: existingUserReviews } });
      } else {
        route.fulfill({ json: { data: [] } });
      }
    }
  );

  await page.route(
    `**/api/managers/${manager.id}/career-segments`,
    (route) => route.fulfill({ json: { data: [] } })
  );

  await page.route(
    `**/api/managers/${manager.id}/pending-edits`,
    (route) => route.fulfill({ json: { data: [] } })
  );

  if (loggedIn) {
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, { ...user, hasContributed });
  }
}

/**
 * Sets up API mocks for the Directory page.
 */
export async function mockDirectoryPage(
  page: Page,
  opts: {
    loggedIn?: boolean;
    hasContributed?: boolean;
    managers?: any[];
    searchResultsEmpty?: boolean;
    pendingSubmissions?: any[];
  } = {}
) {
  const {
    loggedIn = false,
    hasContributed = true,
    managers = MOCK_MANAGERS_LIST,
    searchResultsEmpty = false,
    pendingSubmissions = [],
  } = opts;

  await page.route("**/api/auth/me", (route) => {
    if (loggedIn) {
      route.fulfill({ json: { ...MOCK_USER, hasContributed } });
    } else {
      route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    }
  });

  // Matches /api/managers?limit=...&offset=... (the list endpoint)
  await page.route(/\/api\/managers\?/, (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search") || "";
    if (searchResultsEmpty || (search && search !== "")) {
      const filtered = searchResultsEmpty
        ? []
        : managers.filter((m) =>
            m.name.toLowerCase().includes(search.toLowerCase())
          );
      route.fulfill({
        json: { data: filtered, total: filtered.length },
      });
    } else {
      route.fulfill({ json: { data: managers, total: managers.length } });
    }
  });

  await page.route(/\/api\/geo/, (route) => route.fulfill({ json: MOCK_GEO }));

  await page.route("**/api/companies", (route) => {
    route.fulfill({ json: MOCK_COMPANIES_LIST });
  });

  await page.route(/\/api\/companies\/suggest/, (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("query") || "").toLowerCase();
    const matches = MOCK_COMPANIES_LIST
      .filter(c => c.toLowerCase().includes(query))
      .slice(0, 6)
      .map(name => ({
        name,
        domain: `${name.toLowerCase().replace(/\s+/g, "")}.com`,
      }));
    route.fulfill({ json: matches });
  });

  await page.route("**/api/users/me/submitted-managers", (route) => {
    if (loggedIn) {
      route.fulfill({ json: { data: pendingSubmissions } });
    } else {
      route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    }
  });

  if (loggedIn) {
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, { ...MOCK_USER, hasContributed });
  }
}

/**
 * Sets up API mocks for the AccountSettings page (/settings).
 * All list endpoints return { data: [...] } to match Axios res.data.data access.
 */
export async function mockAccountSettingsPage(
  page: Page,
  opts: {
    reviews?: any[];
    submittedManagers?: any[];
    user?: typeof MOCK_USER;
  } = {}
) {
  const { reviews = [MOCK_MY_REVIEW], submittedManagers = [], user = MOCK_USER } = opts;

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: user })
  );

  // Returns paginated response - component reads res.data.data, res.data.total
  await page.route(/\/api\/users\/me\/reviews/, (route) =>
    route.fulfill({ json: { data: reviews, total: reviews.length, limit: 50, offset: 0 } })
  );

  await page.route("**/api/users/me/submitted-managers", (route) =>
    route.fulfill({ json: { data: submittedManagers } })
  );

  // Edit/delete review endpoint (PUT and DELETE)
  await page.route(new RegExp("/api/managers/.+/reviews/.+"), (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      route.fulfill({ status: 200, json: { ...MOCK_MY_REVIEW } });
    } else if (method === "DELETE") {
      route.fulfill({ status: 200, json: { success: true } });
    } else {
      route.continue();
    }
  });

  // Edit submitted manager
  await page.route(new RegExp("/api/managers/[^/]+$"), (route) => {
    if (route.request().method() === "PUT") {
      route.fulfill({ status: 200, json: MOCK_PENDING_MANAGER });
    } else {
      route.continue();
    }
  });

  await page.addInitScript((u) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
}

/**
 * Sets up API mocks for the Admin page (/admin).
 * Uses a SINGLE route handler to avoid Playwright's LIFO route ordering issue
 * (last-registered route fires first, breaking specific handlers).
 * All list endpoints return { data: [...] } to match res.data.data access.
 */
export async function mockAdminPage(
  page: Page,
  opts: {
    user?: typeof MOCK_ADMIN_USER;
    pendingManagers?: any[];
    editRequests?: any[];
    bannedUsers?: any[];
    allUsers?: any[];
    similarManagers?: any[];
    companies?: any[];
  } = {}
) {
  const {
    user = MOCK_ADMIN_USER,
    pendingManagers = [MOCK_PENDING_ADMIN_MANAGER],
    editRequests = [MOCK_EDIT_REQUEST],
    bannedUsers = [MOCK_BANNED_USER_ENTRY],
    allUsers = [MOCK_USER, MOCK_BANNABLE_USER],
    similarManagers = [
      MOCK_MANAGER,
      { ...MOCK_MANAGER, id: "manager-dup", name: "Alex Johnson (Duplicate)" },
    ],
    companies = MOCK_ADMIN_COMPANIES,
  } = opts;

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: user })
  );

  // Single handler for all /api/admin/* routes to avoid LIFO ordering surprises
  await page.route(/\/api\/admin/, (route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (method === "GET") {
      if (url.includes("/pending-managers")) {
        route.fulfill({ json: { data: pendingManagers } });
      } else if (url.includes("/pending-edits")) {
        route.fulfill({ json: { data: editRequests } });
      } else if (url.includes("/banned-users")) {
        route.fulfill({ json: { data: bannedUsers } });
      } else if (url.includes("/users")) {
        route.fulfill({ json: { data: allUsers } });
      } else if (url.includes("/companies")) {
        route.fulfill({ json: { data: companies } });
      } else {
        route.fulfill({ json: { data: [] } });
      }
    } else {
      // POST / PUT / DELETE - admin actions (approve, reject, ban, unban, merge, rename)
      route.fulfill({ status: 200, json: { success: true } });
    }
  });

  // Merge duplicate search - under /api/managers/similar, not /api/admin/
  await page.route(/\/api\/managers\/similar/, (route) =>
    route.fulfill({ json: { data: similarManagers } })
  );

  await page.addInitScript((u) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
}

/**
 * Sets up API mocks for the Notifications page (/notifications).
 */
export async function mockNotificationsPage(
  page: Page,
  opts: {
    notifications?: any[];
    user?: typeof MOCK_USER;
  } = {}
) {
  const { notifications = [MOCK_NOTIFICATION_APPROVED, MOCK_NOTIFICATION_REJECTED], user = MOCK_USER } = opts;

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: user })
  );

  // Returns { data: [...] } - component does res.data.data
  await page.route("**/api/notifications", (route) =>
    route.fulfill({ json: { data: notifications } })
  );

  await page.route(/\/api\/notifications\/.+\/read/, (route) =>
    route.fulfill({ status: 200, json: { success: true } })
  );

  await page.addInitScript((u) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, user);
}

/**
 * Sets up API mocks for the AddBoss page (/add).
 */
export async function mockAddBossPage(
  page: Page,
  opts: {
    loggedIn?: boolean;
    user?: typeof MOCK_USER;
    similarManagers?: any[];
    submitResponse?: { status?: number; json?: any };
  } = {}
) {
  const {
    loggedIn = false,
    user = MOCK_USER,
    similarManagers = [],
    submitResponse = { status: 201, json: { id: "new-manager-1", slug: "new-manager-1" } },
  } = opts;

  await page.route("**/api/auth/me", (route) => {
    if (loggedIn) {
      route.fulfill({ json: user });
    } else {
      route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    }
  });

  await page.route(/\/api\/geo/, (route) => route.fulfill({ json: MOCK_GEO }));

  await page.route(/\/api\/managers\/similar/, (route) =>
    route.fulfill({ json: { data: similarManagers } })
  );

  await page.route(/\/api\/managers$/, (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: submitResponse.status ?? 201, json: submitResponse.json });
    } else {
      route.continue();
    }
  });

  // Mock the manager profile page after redirect
  await page.route(/\/api\/managers\/new-manager-1/, (route) =>
    route.fulfill({ json: { ...MOCK_MANAGER, id: "new-manager-1" } })
  );

  if (loggedIn) {
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, user);
  }
}

/**
 * Sets up API mocks for the FindYourManager page (/find).
 */
export async function mockFindManagerPage(
  page: Page,
  opts: {
    loggedIn?: boolean;
    hasContributed?: boolean;
    searchResults?: any[];
    emptySearch?: boolean;
  } = {}
) {
  const { loggedIn = false, hasContributed = true, searchResults = MOCK_MANAGERS_LIST, emptySearch = false } = opts;

  await page.route("**/api/auth/me", (route) => {
    if (loggedIn) {
      route.fulfill({ json: MOCK_USER });
    } else {
      route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    }
  });

  await page.route(/\/api\/geo/, (route) => route.fulfill({ json: MOCK_GEO }));

  // Non-logged-in fallback: GET /api/managers?search=...
  await page.route(/\/api\/managers\?/, (route) => {
    if (emptySearch) {
      route.fulfill({ json: { data: [], total: 0 } });
    } else {
      route.fulfill({ json: { data: searchResults, total: searchResults.length } });
    }
  });

  // Logged-in path: POST /api/managers/find-or-create
  await page.route("**/api/managers/find-or-create", (route) => {
    if (emptySearch) {
      route.fulfill({ json: { data: [], created: false, hasContributed } });
    } else {
      route.fulfill({ json: { data: searchResults, created: false, hasContributed } });
    }
  });

  if (loggedIn) {
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, MOCK_USER);
  }
}

/**
 * Mocks the Cloudflare Turnstile widget so it auto-completes in tests.
 * Call this before page.goto() for any test that needs Turnstile to pass.
 */
export async function mockTurnstile(page: Page) {
  // Block the real Cloudflare script so it doesn't overwrite our mock
  await page.route(/challenges\.cloudflare\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  // Define window.turnstile before any page scripts run
  await page.addInitScript(() => {
    (window as any).turnstile = {
      render: (_container: unknown, opts: any) => {
        setTimeout(() => opts?.callback?.("mock-turnstile-token"), 50);
        return "mock-widget-id";
      },
      reset: () => {},
      remove: () => {},
      getResponse: () => "mock-turnstile-token",
      isExpired: () => false,
    };
  });
}

// ─── Reusable action helpers ──────────────────────────────────────────────────

/**
 * Clicks all 5-star buttons on the ratings step (one per category, 10 total).
 */
export async function rateAllFiveStars(page: Page) {
  const fiveStarButtons = page.getByRole("button", { name: "Rate 5 stars" });
  const count = await fiveStarButtons.count();
  for (let i = 0; i < count; i++) {
    await fiveStarButtons.nth(i).click();
  }
}

/**
 * Checks the first-hand-experience attestation on step 3. Required before any review can be
 * submitted, in both the add-manager flow and the rate-a-manager flow.
 */
export async function attestFirstHandExperience(page: Page) {
  await page.locator('input[name="attestation"]').check();
}

/**
 * Opens the new review form - uses .first() because there are two "Write a Review"
 * buttons on the page (header action button + bottom CTA).
 */
export async function clickWriteAReview(page: Page) {
  await page
    .getByRole("button", { name: /write a review/i })
    .first()
    .click();
}
