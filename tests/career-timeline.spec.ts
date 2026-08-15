/**
 * Regression tests for the CareerTimeline component.
 *
 * Covers:
 *  1. Year tick is visible for every company card (including low-rated cards
 *     whose tick was previously clipped by the scroll container).
 *  2. Year tick does NOT visually bleed through the card when a role is expanded
 *     (the card must render above the tick in the stacking order).
 */
import { test, expect, Page } from "./base";
import { TEST_MANAGER_ID, TEST_MANAGER_SLUG, MOCK_MANAGER } from "./fixtures";

const CATEGORY_AVERAGES: Record<string, number> = {
  "Communication Style": 1,
  "Perceived Approachability": 1,
  "Perceived Clarity of Expectations": 2,
  "Feedback Style": 1,
  "Perceived Supportiveness": 1,
  "Decision Making Style": 3,
  "Organization and Planning Style": 3,
  "Delegation Style": 2,
  "Perceived Professional Demeanor": 1,
  "Overall Working Experience": 2,
};

/** Two-company career: Blackberry (1.1 — low rating, tick near scroll edge) then BGC Partners (1.7) */
const CAREER_SEGMENTS = [
  {
    company: "Blackberry",
    role: "Manager",
    startDate: "2012-01",
    endDate: "2015-12",
    isCurrent: false,
    averageRating: 1.1,
    reviewCount: 1,
    categoryAverages: CATEGORY_AVERAGES,
  },
  {
    company: "BGC Partners",
    role: "Manager",
    startDate: "2016-01",
    endDate: null,
    isCurrent: true,
    averageRating: 1.7,
    reviewCount: 1,
    categoryAverages: CATEGORY_AVERAGES,
  },
];

/** Manager with NO careerHistory so effectiveCareerSegments uses only the API-returned segments */
const TIMELINE_MANAGER = { ...MOCK_MANAGER, careerHistory: [] };

/**
 * Manager whose career_history has TWO entries: IBM (reviewed) + Amazon (no reviews).
 * The effectiveCareerSegments fix should surface Amazon as a ghost card even though
 * it's a closed/past entry, not the currently-active one.
 */
const MANAGER_WITH_PAST_CAREER_ENTRY = {
  ...MOCK_MANAGER,
  careerHistory: [
    { company: "Amazon", title: "Director of Engineering", startDate: "2020-01-01T00:00:00Z", endDate: "2026-01-01T00:00:00Z" },
    { company: "IBM",    title: "Distinguished Engineer",  startDate: "1996-01-01T00:00:00Z", endDate: "2019-01-01T00:00:00Z" },
  ],
};

/** Career-segments returned by the API — only IBM has reviews; Amazon has none. */
const IBM_CAREER_SEGMENT = {
  company: "IBM",
  role: "Distinguished Engineer",
  startDate: "1996-01",
  endDate: "2019-12",
  isCurrent: false,
  averageRating: 3.0,
  reviewCount: 1,
  categoryAverages: {},
};

async function setupTimelinePage(page: Page) {
  // Set up all routes from scratch — avoids fixture route-ordering conflicts
  // Must be logged in: CareerTimeline is gated behind authentication in BossProfile
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { id: "test-user-1", username: "testuser", role: "user", isBanned: false, hasContributed: true } })
  );
  await page.addInitScript(() => {
    localStorage.setItem("authUser", JSON.stringify({ id: "test-user-1", username: "testuser", role: "user", isBanned: false, hasContributed: true }));
  });
  await page.route(
    new RegExp(`/api/managers/${TEST_MANAGER_ID}$`),
    (route) => route.fulfill({ json: TIMELINE_MANAGER })
  );
  await page.route(
    new RegExp(`/api/managers/by-slug/${TEST_MANAGER_SLUG}`),
    (route) => route.fulfill({ json: TIMELINE_MANAGER })
  );
  await page.route(
    new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
    (route) => route.fulfill({ json: { data: [] } })
  );
  await page.route(
    `**/api/managers/${TEST_MANAGER_ID}/career-segments`,
    (route) => route.fulfill({ json: { data: CAREER_SEGMENTS } })
  );
  await page.route(
    new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`),
    (route) => route.fulfill({ json: { data: [] } })
  );

  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

test.describe("CareerTimeline", () => {
  test("year tick is visible for all company cards including low-rated ones", async ({ page }) => {
    await setupTimelinePage(page);

    // Both company cards must have their start-year tick in the DOM and visible
    await expect(page.getByText("Blackberry", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("BGC Partners", { exact: true }).first()).toBeVisible({ timeout: 5_000 });

    // Scroll the timeline into view so the tick elements are within the layout
    await page.getByText("Career Performance Trajectory").scrollIntoViewIfNeeded();

    // Year ticks must be visible (not clipped by scroll container overflow)
    const tick2012 = page.locator('span').filter({ hasText: /^2012$/ });
    const tick2016 = page.locator('span').filter({ hasText: /^2016$/ });

    await expect(tick2012).toBeVisible({ timeout: 5_000 });
    await expect(tick2016).toBeVisible({ timeout: 5_000 });
  });

  test("trailing placeholder card always appears after the last real node", async ({ page }) => {
    // Regression: the trailing '?' ghost card previously only rendered when nodes.length === 1.
    // After the fix it must appear regardless of how many company nodes are on the timeline.
    await setupTimelinePage(page);
    await page.getByText("Career Performance Trajectory").scrollIntoViewIfNeeded();

    // The trailing card is off-screen to the right in the horizontal timeline — scroll it into view
    const trailingText = page.getByText("Performance trajectory is tracked as additional roles and companies are added.");
    await trailingText.scrollIntoViewIfNeeded();

    // The timeline has 2 real nodes (Blackberry + BGC Partners); the trailing card must still appear
    await expect(trailingText).toBeVisible({ timeout: 5_000 });
  });

  test("closed career history entry with no reviews renders as ghost card", async ({ page }) => {
    // Regression: past (closed) career_history entries were excluded from effectiveCareerSegments.
    // After the fix, Amazon (2020-2026, no reviews) must show as a ghost card alongside IBM (has reviews).
    //
    // Navigate directly to the slug URL to avoid the ID→slug redirect and any caching confusion.
    const managerSlug = TEST_MANAGER_SLUG;       // "alex-johnson"
    const companySlug = "acme-corp";

    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ json: { id: "test-user-1", username: "testuser", role: "user", isBanned: false, hasContributed: true } })
    );
    await page.addInitScript(() => {
      localStorage.setItem("authUser", JSON.stringify({ id: "test-user-1", username: "testuser", role: "user", isBanned: false, hasContributed: true }));
    });
    // Slug-based lookup used by BossProfile when URL is /companies/:co/managers/:slug
    await page.route(
      new RegExp(`/api/managers/by-slug/${managerSlug}`),
      (route) => route.fulfill({ json: MANAGER_WITH_PAST_CAREER_ENTRY })
    );
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`),
      (route) => route.fulfill({ json: { data: [] } })
    );
    await page.route(
      `**/api/managers/${TEST_MANAGER_ID}/career-segments`,
      (route) => route.fulfill({ json: { data: [IBM_CAREER_SEGMENT] } })
    );
    await page.route(
      new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`),
      (route) => route.fulfill({ json: { data: [] } })
    );

    await page.goto(`/companies/${companySlug}/managers/${managerSlug}`);
    await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Career Performance Trajectory").scrollIntoViewIfNeeded();

    // IBM shows as a real card with a rating
    await expect(page.getByText("IBM", { exact: true })).toBeVisible({ timeout: 5_000 });

    // Amazon is the next node to the right — scroll it into view then assert
    const amazonText = page.getByText("Amazon", { exact: true });
    await amazonText.scrollIntoViewIfNeeded();
    await expect(amazonText).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("No reviews yet").first()).toBeVisible({ timeout: 5_000 });

    // The Amazon ghost should show its date range (2020 – 2026)
    const amazonDateRange = page.getByText(/2020.*2026/).first();
    await amazonDateRange.scrollIntoViewIfNeeded();
    await expect(amazonDateRange).toBeVisible({ timeout: 5_000 });
  });

  test("year tick does not bleed through card when a role is expanded", async ({ page }) => {
    await setupTimelinePage(page);

    await page.getByText("Career Performance Trajectory").scrollIntoViewIfNeeded();

    // Expand the role dropdown inside the first company card (Blackberry)
    const firstCard = page.locator('[data-testid="company-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
    const roleBtn = firstCard.getByRole("button", { name: /Manager/i }).first();
    await expect(roleBtn).toBeVisible({ timeout: 5_000 });
    await roleBtn.click();

    // "Breakdown" heading confirms card is expanded
    await expect(page.getByText("Breakdown").first()).toBeVisible({ timeout: 3_000 });

    // The card must have z-index > tick's z-index so it paints on top
    await expect(page.locator('[data-testid="company-card"]').first()).toBeVisible({ timeout: 5_000 });
    const cardZ = await page.locator('[data-testid="company-card"]').first().evaluate((el: HTMLElement) => {
      return parseInt(getComputedStyle(el).zIndex) || 0;
    });

    const tick = page.locator('span').filter({ hasText: /^2012$/ });
    const tickZ = await tick.evaluate((el: HTMLElement) => {
      // Walk up to the absolute-positioned tick container
      let node: HTMLElement | null = el;
      while (node && getComputedStyle(node).position !== "absolute") {
        node = node.parentElement;
      }
      return node ? (parseInt(getComputedStyle(node).zIndex) || 0) : 0;
    });

    expect(cardZ).toBeGreaterThan(tickZ);
  });
});
