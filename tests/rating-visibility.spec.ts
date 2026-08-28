/**
 * rating-visibility.spec.ts
 *
 * Comprehensive tests for the rating gate: numeric ratings are only visible to
 * users who have contributed at least one review (hasContributed = true).
 *
 * Rules under test:
 *  Directory:
 *    - Non-contributor (logged-out OR logged-in) → all ratings blurred; "Rate to unlock" CTA shown
 *    - Contributor → real numeric ratings visible; no CTA
 *
 *  CompanyProfile (locked = !hasContributed):
 *    - First ≤3 real managers always show real ratings (teaser)
 *    - Real managers beyond position 3 → rating blurred, name still visible
 *    - Ghost padding cards (filling to 9) → fake visible ratings (4.3 / 3.8 / 4.7 cycling)
 *    - Company stats (manager count, review count, avg rating) blurred when locked
 *    - "Company insights are locked" shown when locked; category names hidden
 *    - Non-contributor and logged-out user both land in the same locked state
 *
 *  CompanyProfile (unlocked = hasContributed):
 *    - All manager ratings visible; no ghost padding
 *    - Company stats visible
 *    - Category analysis (Strongest/Weakest Areas) unlocked
 *    - No "Rate a manager to unlock ratings" CTA
 *
 *  FindManagerForm (/find):
 *    - Non-contributor → name-only card: no title, no numeric rating, no rating dots
 *    - Non-contributor → "Rate a manager to unlock ratings" CTA shown
 *    - Contributor → full ManagerCard with title visible
 *    - Contributor → "See all results in directory" link shown; no CTA
 *    - Fake-name search (e.g. "Test Person") → "No manager found", never "Something went wrong"
 */

import { test, expect, Page } from "./base";
import {
  MOCK_COMPANY_PROFILE,
  MOCK_MANAGERS_LIST,
  MOCK_USER,
  TEST_COMPANY_SLUG,
  TEST_MANAGER_ID,
  mockDirectoryPage,
  mockFindManagerPage,
} from "./fixtures";

// ─── Local fixtures ───────────────────────────────────────────────────────────

/**
 * Company profile with 4 real managers.
 * Used to verify the "top 3 show real rating, position 4+ blurred" rule.
 *
 * Ratings are deliberately chosen NOT to overlap with GHOST_SLOTS (4.3 / 3.8 / 4.7)
 * so assertions stay unambiguous.
 */
const MOCK_COMPANY_PROFILE_MANY_MANAGERS = {
  ...MOCK_COMPANY_PROFILE,
  managerCount: 4,
  managers: [
    { id: "m1", name: "Lena Torres",  title: "Engineering Manager",     overallRating: 4.1, reviewsCount: 8, company: "Acme Corp", approvalStatus: "approved" },
    { id: "m2", name: "Omar Hassan",  title: "Director of Engineering",  overallRating: 3.6, reviewsCount: 4, company: "Acme Corp", approvalStatus: "approved" },
    { id: "m3", name: "Nina Park",    title: "VP of Engineering",        overallRating: 4.8, reviewsCount: 6, company: "Acme Corp", approvalStatus: "approved" },
    { id: "m4", name: "Ben Castro",   title: "Tech Lead",                overallRating: 2.2, reviewsCount: 2, company: "Acme Corp", approvalStatus: "approved" },
  ],
};

// A company profile where the first manager is a ghost (fake seed rating).
// Used to verify ghost ratings are blurred for non-contributors.
const MOCK_COMPANY_PROFILE_WITH_GHOST = {
  ...MOCK_COMPANY_PROFILE,
  managerCount: 2,
  managers: [
    { id: "ghost-mgr", name: "Bob Burgers",  title: "Manager", overallRating: 3.6, reviewsCount: 0, company: "Acme Corp", approvalStatus: "ghost" },
    { id: "real-mgr",  name: "Lena Torres",  title: "Engineering Manager", overallRating: 4.1, reviewsCount: 8, company: "Acme Corp", approvalStatus: "approved" },
  ],
};

// ─── CompanyProfile mock helper ───────────────────────────────────────────────

async function mockCompanyProfile(
  page: Page,
  opts: {
    loggedIn?: boolean;
    hasContributed?: boolean;
    profile?: typeof MOCK_COMPANY_PROFILE;
  } = {}
) {
  const {
    loggedIn = false,
    hasContributed = false,
    profile = MOCK_COMPANY_PROFILE,
  } = opts;

  await page.route("**/api/auth/me", (route) =>
    loggedIn
      ? route.fulfill({ json: { ...MOCK_USER, hasContributed } })
      : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );

  if (loggedIn) {
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, { ...MOCK_USER, hasContributed });
  }

  await page.route(/\/api\/companies\/by-slug/, (route) =>
    route.fulfill({ json: profile })
  );

  await page.route(/\/api\/companies\/by-name/, (route) =>
    route.fulfill({ json: profile })
  );

  await page.route("**/api/companies/suggest**", (route) =>
    route.fulfill({ json: [] })
  );

  // Notifications bell fires on every page load for logged-in users
  await page.route("**/api/notifications**", (route) =>
    route.fulfill({ json: { data: [] } })
  );

  // Geo needed for sidebar search form submit - not called on page load, but
  // intercept it defensively so any accidental call doesn't reach the real server.
  await page.route(/\/api\/geo/, (route) =>
    route.fulfill({ json: { country: "United States", state: "California", city: "San Francisco" } })
  );
}

// ─── Shared search helper for FindManagerForm tests ───────────────────────────

async function fillAndSubmitSearch(
  page: Page,
  overrides: { firstName?: string; lastName?: string; title?: string; company?: string } = {}
) {
  const {
    firstName = "Alex",
    lastName  = "Johnson",
    title     = "Engineering Manager",
    company   = "Acme Corp",
  } = overrides;

  await page.getByPlaceholder("First name").fill(firstName);
  await page.getByPlaceholder("Last name").fill(lastName);
  await page.getByPlaceholder(/job title/i).fill(title);
  await page.getByPlaceholder("Company").fill(company);
  await page.getByRole("button", { name: /^search$/i }).click();
}

// ═════════════════════════════════════════════════════════════════════════════
// DIRECTORY
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Directory - rating visibility", () => {
  // ── logged out ──────────────────────────────────────────────────────────────

  test("logged-out: numeric ratings are NOT shown", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // MOCK_MANAGERS_LIST has Alex=3.8, Sarah=4.5 - neither must appear as text
    await expect(page.getByText("3.8")).not.toBeVisible();
    await expect(page.getByText("4.5")).not.toBeVisible();
  });

  test("logged-out: both managers in the list have ratings hidden", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(page.getByText("Sarah Connor")).toBeVisible({ timeout: 10_000 });
    // Confirm the second manager's rating is also hidden
    await expect(page.getByText("4.5")).not.toBeVisible();
  });

  test("logged-out: 'Rate a manager to unlock ratings' CTA is shown", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  // ── logged in, not contributed ──────────────────────────────────────────────

  test("logged-in non-contributor: numeric ratings are NOT shown", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true, hasContributed: false });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("3.8")).not.toBeVisible();
    await expect(page.getByText("4.5")).not.toBeVisible();
  });

  test("logged-in non-contributor: 'Rate a manager to unlock ratings' CTA is shown", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true, hasContributed: false });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("non-contributor shows LockedManagerCard badge ('Rate to unlock') on each card", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: false });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // Every locked card carries this badge
    await expect(page.getByText(/rate to unlock/i).first()).toBeVisible();
  });

  // ── logged in, contributed ──────────────────────────────────────────────────

  test("contributor: numeric ratings ARE shown for all managers", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true, hasContributed: true });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("3.8")).toBeVisible();
    await expect(page.getByText("4.5")).toBeVisible();
  });

  test("contributor: 'Rate a manager to unlock ratings' CTA is NOT shown", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true, hasContributed: true });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).not.toBeVisible();
  });

  test("contributor: manager cards link to profile (ManagerCard rendered, not LockedManagerCard)", async ({ page }) => {
    await mockDirectoryPage(page, { loggedIn: true, hasContributed: true });
    await page.goto("/directory");

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // Contributor sees real ManagerCard which renders a link
    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPANY PROFILE - LOCKED STATE
// ═════════════════════════════════════════════════════════════════════════════

test.describe("CompanyProfile - locked state (≤3 real managers)", () => {
  // MOCK_COMPANY_PROFILE has 2 managers: Alex Johnson (4.3) and Sam Lee (3.9)
  // With 2 managers < 3 threshold: both show real ratings (teaser)
  // Remaining 7 ghost cards show fake ratings 4.3, 3.8, 4.7 cycling

  test("logged-out: manager names are visible", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Sam Lee")).toBeVisible();
  });

  test("logged-out: real ratings visible for first ≤3 managers (teaser)", async ({ page }) => {
    // Locked state shows first 3 real managers WITH their real ratings as a teaser
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "4.3" appears on Alex's card AND in ghost slot 0 AND in the fake insight bar -
    // .first() avoids strict-mode violation while still proving the rating IS shown.
    await expect(page.getByText("4.3").first()).toBeVisible(); // Alex Johnson's rating
    await expect(page.getByText("3.9").first()).toBeVisible(); // Sam Lee's rating
  });

  test("logged-in non-contributor: same locked state as logged-out", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // Real ratings visible in teaser
    await expect(page.getByText("4.3").first()).toBeVisible();
    await expect(page.getByText("3.9").first()).toBeVisible();
    // But company stats are blurred
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("ghost padding cards show fake visible ratings (3.8 only appears on ghost cards)", async ({ page }) => {
    // 3.8 is GHOST_SLOTS[1].rating - it does NOT appear in MOCK_COMPANY_PROFILE's real managers
    // (Alex=4.3, Sam=3.9) so seeing 3.8 proves a ghost card rendered it
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // With 7 ghost cards cycling [4.3, 3.8, 4.7], "3.8" appears at positions 1 and 4
    // and "4.7" appears at positions 2 and 5 - .first() avoids strict-mode.
    await expect(page.getByText("3.8").first()).toBeVisible();
    // 4.7 is GHOST_SLOTS[2].rating - also only on ghost cards
    await expect(page.getByText("4.7").first()).toBeVisible();
  });

  test("'Rate to unlock' badge is visible on manager cards", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate to unlock/i).first()).toBeVisible();
  });

  test("'Rate a manager to unlock ratings' CTA is shown when locked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("company avg rating is NOT shown as numeric text when locked", async ({ page }) => {
    // avgRating = 4.1 in MOCK_COMPANY_PROFILE; must be blurred, not shown as "4.1"
    // Note: 4.1 is also NOT in any real manager's rating in this profile (Alex=4.3, Sam=3.9)
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // The hero avg rating area should show blur dots, not the text "4.1"
    // We confirm "4.1" is absent as an independent text node (it doesn't appear in real-manager ratings either)
    await expect(page.locator("span.text-lg.font-semibold").filter({ hasText: "4.1" })).not.toBeVisible();
  });

  test("company manager count is NOT shown as text when locked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "2 managers" text should not appear - it's replaced by a blur placeholder span
    await expect(page.getByText(/\b2 managers\b/)).not.toBeVisible();
  });

  test("company review count is NOT shown as text when locked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\b12 reviews\b/)).not.toBeVisible();
  });

  test("'Company insights are locked' message is shown", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/company insights are locked/i).first()).toBeVisible();
  });

  test("category analysis names (e.g. 'Communication Style') are NOT visible when locked", async ({ page }) => {
    // In locked state, category names are replaced by blurred placeholder bars
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Communication Style")).not.toBeVisible();
  });
});

test.describe("CompanyProfile - locked state (4+ real managers: top-3 teaser rule)", () => {
  // MOCK_COMPANY_PROFILE_MANY_MANAGERS has 4 managers:
  //   pos 1: Lena Torres  (4.1) → visible
  //   pos 2: Omar Hassan  (3.6) → visible
  //   pos 3: Nina Park    (4.8) → visible
  //   pos 4: Ben Castro   (2.2) → blurred (no numeric text)
  //
  // Ratings 4.1, 3.6, 4.8, 2.2 are all distinct from GHOST_SLOTS values (4.3, 3.8, 4.7)

  test("all four manager names are visible", async ({ page }) => {
    await mockCompanyProfile(page, {
      hasContributed: false,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Omar Hassan")).toBeVisible();
    await expect(page.getByText("Nina Park")).toBeVisible();
    // 4th manager name IS visible even though rating is blurred
    await expect(page.getByText("Ben Castro")).toBeVisible();
  });

  test("first 3 manager ratings ARE visible", async ({ page }) => {
    await mockCompanyProfile(page, {
      hasContributed: false,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("4.1").first()).toBeVisible(); // pos 1
    await expect(page.getByText("3.6").first()).toBeVisible(); // pos 2
    // "4.8" also appears in the locked fake insight bar (Strongest Areas[0] = 4.8)
    await expect(page.getByText("4.8").first()).toBeVisible(); // pos 3
  });

  test("4th manager rating is NOT visible (blurred)", async ({ page }) => {
    await mockCompanyProfile(page, {
      hasContributed: false,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    // Ben Castro's rating (2.2) must not appear - blurred via blurRating prop
    await expect(page.getByText("2.2")).not.toBeVisible();
  });

  test("ghost padding cards are present and show fake ratings", async ({ page }) => {
    // 4 real managers → 5 ghost cards; ghost[0]=4.3, ghost[1]=3.8, ghost[2]=4.7
    // None of these overlap with the real manager ratings (4.1, 3.6, 4.8, 2.2)
    await mockCompanyProfile(page, {
      hasContributed: false,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    // "4.3" appears in ghost[0], ghost[3], AND fake insight bar - .first() avoids strict-mode.
    await expect(page.getByText("4.3").first()).toBeVisible(); // ghost slot fake rating
    // "3.8" appears in ghost[1] and ghost[4] - .first() avoids strict-mode.
    await expect(page.getByText("3.8").first()).toBeVisible(); // ghost slot fake rating
    // "4.7" appears only in ghost[2] (5 ghost cards cycle [4.3,3.8,4.7,4.3,3.8]) - unique.
    await expect(page.getByText("4.7")).toBeVisible(); // ghost slot fake rating
  });

  test("still shows 'Rate a manager to unlock ratings' CTA with 4+ managers", async ({ page }) => {
    await mockCompanyProfile(page, {
      hasContributed: false,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPANY PROFILE - UNLOCKED STATE
// ═════════════════════════════════════════════════════════════════════════════

test.describe("CompanyProfile - unlocked state (contributed)", () => {
  test("all real manager ratings visible when unlocked (2-manager profile)", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "4.3" also appears as the "Communication Style" category value; "3.9" as "Decision Making Style"
    await expect(page.getByText("4.3").first()).toBeVisible(); // Alex
    await expect(page.getByText("3.9").first()).toBeVisible(); // Sam
  });

  test("all 4 real manager ratings visible when unlocked (4-manager profile)", async ({ page }) => {
    await mockCompanyProfile(page, {
      loggedIn: true,
      hasContributed: true,
      profile: MOCK_COMPANY_PROFILE_MANY_MANAGERS,
    });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    // No blurring in unlocked state - ALL four ratings must be visible.
    // "4.1" also appears in hero avgRating and "Organization and Planning Style" category bar.
    await expect(page.getByText("4.1").first()).toBeVisible();
    await expect(page.getByText("3.6")).toBeVisible();
    await expect(page.getByText("4.8")).toBeVisible();
    await expect(page.getByText("2.2")).toBeVisible(); // was blurred in locked state
  });

  test("company manager count is visible when unlocked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "2 managers" appears in both the hero stat span and the insights footer paragraph
    await expect(page.getByText(/\b2 managers\b/).first()).toBeVisible();
  });

  test("company review count is visible when unlocked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "12 reviews" appears in both the hero stat span and the insights footer paragraph
    await expect(page.getByText(/\b12 reviews\b/).first()).toBeVisible();
  });

  test("no 'Rate a manager to unlock ratings' CTA when unlocked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).not.toBeVisible();
  });

  test("no ghost padding cards when unlocked (all real cards shown)", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // Ghost slot names are only in the DOM when in locked state
    // In unlocked state the grid shows real manager links, no ghost cards
    await expect(page.getByText(/rate to unlock/i)).not.toBeVisible();
  });

  test("'Company insights are locked' message is NOT shown when unlocked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/company insights are locked/i)).not.toBeVisible();
  });

  test("category analysis names are visible when unlocked", async ({ page }) => {
    // In unlocked state, real category names from categoryAverages are shown
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    // "Communication Style" only appears when category analysis is unlocked
    await expect(page.getByText("Communication Style")).toBeVisible();
  });

  test("strongest and weakest areas headings visible when unlocked", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Strongest Areas")).toBeVisible();
    await expect(page.getByText("Weakest Areas")).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPANY PROFILE - ghost manager rating visibility
// ═════════════════════════════════════════════════════════════════════════════

test.describe("CompanyProfile - ghost manager ratings hidden for non-contributors", () => {
  // Ghost managers have a fake seed rating. Non-contributors must never see it -
  // they should see the manager's name but not the rating number.

  test("non-contributor (logged-out): ghost manager name visible but rating hidden", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false, profile: MOCK_COMPANY_PROFILE_WITH_GHOST });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Bob Burgers")).toBeVisible({ timeout: 10_000 });
    // "3.6" is the ghost seed rating - it must NOT be visible to non-contributors
    await expect(page.getByText("3.6")).not.toBeVisible();
  });

  test("non-contributor (logged-in, never rated): ghost manager name visible but rating hidden", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: false, profile: MOCK_COMPANY_PROFILE_WITH_GHOST });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Bob Burgers")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("3.6")).not.toBeVisible();
  });

  test("contributor: ghost manager rating IS visible (everything unlocked)", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true, profile: MOCK_COMPANY_PROFILE_WITH_GHOST });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Bob Burgers")).toBeVisible({ timeout: 10_000 });
    // Contributor sees everything - ghost rating visible
    await expect(page.getByText("3.6").first()).toBeVisible();
  });

  test("real manager in same profile still shows its rating for non-contributor (top-3 teaser)", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false, profile: MOCK_COMPANY_PROFILE_WITH_GHOST });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByText("Lena Torres")).toBeVisible({ timeout: 10_000 });
    // Lena Torres is approved with a real rating (4.1) - visible in top-3 teaser slot
    await expect(page.getByText("4.1")).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FIND MANAGER FORM (/find)
// ═════════════════════════════════════════════════════════════════════════════

test.describe("FindManagerForm (/find) - rating visibility", () => {
  // ── non-contributor results ────────────────────────────────────────────────

  test("non-contributor (logged-in): results show name only - no title", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: false,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    // Title must NOT appear on the locked name-only card
    await expect(page.getByText("Engineering Manager")).not.toBeVisible();
  });

  test("non-contributor (logged-in): results show name only - no numeric rating", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: false,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    // Numeric rating must not appear on the name-only card
    await expect(page.getByText("3.8")).not.toBeVisible();
    await expect(page.getByText("4.5")).not.toBeVisible();
  });

  test("non-contributor (logged-out): results show name only - no title", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: false,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText("Engineering Manager")).not.toBeVisible();
    await expect(page.getByText("3.8")).not.toBeVisible();
  });

  test("non-contributor: 'Rate a manager to unlock ratings' CTA shown after search", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: false,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).toBeVisible();
  });

  test("non-contributor: results are links to the locked profile page", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: false,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    // Tile is now a link - non-contributor can click through to the locked profile
    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
  });

  // ── contributor results ────────────────────────────────────────────────────

  test("contributor: results show manager title (full ManagerCard rendered)", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    // ManagerCard renders the title - confirms full card is shown
    await expect(page.getByText("Engineering Manager")).toBeVisible();
  });

  test("contributor: 'See all results in directory' link visible", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/see all results in directory/i)).toBeVisible();
  });

  test("contributor: 'Rate a manager to unlock ratings' CTA NOT shown", async ({ page }) => {
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/rate a manager to unlock ratings/i)).not.toBeVisible();
  });

  test("contributor: result cards link to the manager profile", async ({ page }) => {
    const { TEST_MANAGER_ID } = await import("./fixtures");
    await mockFindManagerPage(page, {
      loggedIn: true,
      hasContributed: true,
      searchResults: MOCK_MANAGERS_LIST,
    });
    await page.goto("/find");

    await fillAndSubmitSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
  });

  // ── fake-name validation ───────────────────────────────────────────────────

  test("fake first name ('Test') triggers 'No manager found' - not 'Something went wrong'", async ({ page }) => {
    // Client-side name validation intercepts FAKE_NAME_PARTS before any API call
    await mockFindManagerPage(page, { loggedIn: false });
    await page.goto("/find");

    await fillAndSubmitSearch(page, { firstName: "Test", lastName: "Person" });

    await expect(page.getByText(/no manager found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("'john doe' (fake full name) triggers 'No manager found' - not an error", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: false });
    await page.goto("/find");

    await fillAndSubmitSearch(page, { firstName: "John", lastName: "Doe" });

    await expect(page.getByText(/no manager found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("fake-name validation does not trigger any API call", async ({ page }) => {
    let apiCallMade = false;
    await mockFindManagerPage(page, { loggedIn: false });
    await page.goto("/find");

    page.on("request", (req) => {
      if (req.url().includes("/api/managers")) apiCallMade = true;
    });

    await fillAndSubmitSearch(page, { firstName: "Test", lastName: "Manager" });
    await expect(page.getByText(/no manager found/i)).toBeVisible({ timeout: 5_000 });

    // Name validation must short-circuit before any API call
    expect(apiCallMade).toBe(false);
  });
});
