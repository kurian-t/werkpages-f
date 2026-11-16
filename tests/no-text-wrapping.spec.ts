/**
 * Regression tests: ensure buttons, badges, and labels never wrap onto multiple lines.
 *
 * Each test simulates a narrow mobile viewport (375px - iPhone SE) and checks that
 * critical UI elements have a clientHeight consistent with a single line of text.
 * If text wraps, the element grows taller and the assertion fails.
 */
import { test, expect, Page } from "./base";
import {
  mockManagerPage,
  mockDirectoryPage,
  mockAccountSettingsPage,
  MOCK_MY_REVIEW,
  MOCK_USER,
  MOCK_MANAGERS_LIST,
} from "./fixtures";

const MOBILE_VIEWPORT = { width: 375, height: 812 };

/** Returns true if the element's height suggests single-line rendering. */
async function isSingleLine(page: Page, locator: any): Promise<boolean> {
  return locator.evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const contentHeight = el.clientHeight - paddingTop - paddingBottom;
    return contentHeight <= lineHeight * 1.4;
  });
}

test.describe("No text wrapping on mobile (375px)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("Directory: Filters button stays on one line when search is active", async ({ page }) => {
    await mockDirectoryPage(page, { managers: [] });
    await page.goto("/directory");

    // On mobile, sidebar is hidden - open it via the Filters button first
    const filtersBtn = page.getByRole("button", { name: /filters/i });
    await expect(filtersBtn).toBeVisible({ timeout: 5_000 });
    await filtersBtn.click();

    // Fill all 4 required fields then submit
    await page.getByPlaceholder("First name").fill("Very");
    await page.getByPlaceholder("Last name").fill("Long Name");
    await page.getByPlaceholder("Job title").fill("Senior Engineering Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Brokerlink Insurance Company");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(filtersBtn).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, filtersBtn)).toBe(true);
  });

  test("Directory: Clear all button stays on one line after search", async ({ page }) => {
    await mockDirectoryPage(page);
    await page.goto("/directory");

    // On mobile, sidebar is hidden - open it via the Filters button first
    const filtersBtn = page.getByRole("button", { name: /filters/i });
    await filtersBtn.click();

    // Fill all 4 required fields then submit
    await page.getByPlaceholder("First name").fill("Bob");
    await page.getByPlaceholder("Last name").fill("Smith");
    await page.getByPlaceholder("Job title").fill("Manager");
    await page.getByPlaceholder("Company", { exact: true }).fill("Acme");
    await page.getByRole("button", { name: /^search$/i }).click();

    // The "Clear all" button appears after a search and must stay on one line
    const clearAll = page.getByText("Clear all").first();
    await expect(clearAll).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, clearAll)).toBe(true);
  });

  test("BossProfile: Registered badge stays on one line", async ({ page }) => {
    // Need loggedIn=true so hasContributed=true and reviews are visible (not locked)
    await mockManagerPage(page, { loggedIn: true });
    await page.route(
      new RegExp(`/api/managers/playwright-test-manager/reviews`),
      (route) => route.fulfill({ json: { data: [{ ...MOCK_MY_REVIEW, verified: true }] } })
    );
    await page.goto(`/manager/playwright-test-manager`);

    /*
      BY TEST ID, because the badge is no longer a span with a title attribute.

      It became an InfoPill - a TooltipTrigger wrapping a span - so the explanation lives in a
      Tooltip rather than in `title`, and `span[title*="registered account"]` matched nothing. The
      pill carries data-testid="registered-badge" for exactly this, and a test id does not move
      when the presentation does, which is the point of having one.
    */
    const badge = page.getByTestId("registered-badge").first();
    await expect(badge).toBeVisible({ timeout: 8_000 });
    expect(await isSingleLine(page, badge)).toBe(true);
  });

  test("AccountSettings: Pending badge stays on one line", async ({ page }) => {
    await mockAccountSettingsPage(page, {
      submittedManagers: [
        {
          id: "m1",
          name: "Some Manager With A Very Long Name Indeed",
          title: "Director",
          company: "A Very Long Company Name",
          approvalStatus: "pending_approval",
          image: "S",
          status: "active",
        },
      ],
    });
    await page.goto("/settings");

    const badge = page.getByText("Pending").first();
    await expect(badge).toBeVisible({ timeout: 8_000 });
    expect(await isSingleLine(page, badge)).toBe(true);
  });

  test("ManagerCard: Pending badge stays on one line", async ({ page }) => {
    await mockDirectoryPage(page, {
      pendingSubmissions: [{ ...MOCK_MANAGERS_LIST[0], approvalStatus: "pending_approval" }],
      loggedIn: true,
    });
    await page.goto("/directory");

    const badge = page.getByText("Pending").first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, badge)).toBe(true);
  });

  test("ManagerCard: Top Rated badge stays on one line", async ({ page }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      managers: [{ ...MOCK_MANAGERS_LIST[0], overallRating: 4.9, approvalStatus: "approved" }],
    });
    await page.goto("/directory");

    // Badge is now an amber pill at the card's top-right with a lucide Star icon,
    // matching the company cards - the literal "★ Top Rated" text is gone.
    // exact: the sort dropdown has an <option>Top Rated</option> that a loose
    // match also picks up. The badge is lowercase "rated", the option is not.
    const badge = page.getByText("Top rated", { exact: true }).first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, badge)).toBe(true);
  });

  test("SignIn: social login buttons stay on one line", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/signin");

    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    await expect(googleBtn).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, googleBtn)).toBe(true);

    const msBtn = page.getByRole("button", { name: /continue with microsoft/i });
    expect(await isSingleLine(page, msBtn)).toBe(true);
  });

  test("SignUp: social login buttons stay on one line", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } })
    );
    await page.goto("/signup");

    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    await expect(googleBtn).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, googleBtn)).toBe(true);
  });

  /*
    THE SIGN-UP VALIDATION ICONS no longer exist; the form that had them is gone.

    What this guaranteed is that a validation message and its icon stay on one line on a narrow
    screen - a real bug once, where the tick wrapped below the text and read as a second,
    unlabelled control. The form that can still refuse is /complete-profile, so the guarantee is
    asserted there instead.
  */
  test("the profile-completion validation message does not wrap", async ({ page }) => {
    const user = { id: "u1", username: "user_1a2b3c4d", email: "n@e.test", profileComplete: false };
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 200, json: { user } }));
    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, user);

    await page.goto("/complete-profile");
    await page.getByLabel(/^username$/i).fill("perfectly_fine_name");

    const hint = page.getByText(/looks good/i);
    await expect(hint).toBeVisible({ timeout: 8_000 });
    const box = await hint.boundingBox();
    expect(box, "the hint must render").not.toBeNull();
    // One line: a wrapped message is roughly twice the height of an unwrapped one.
    if (box) expect(box.height).toBeLessThan(32);
  });

  test("Header: user menu button stays on one line", async ({ page }) => {
    await mockAccountSettingsPage(page, { user: { ...MOCK_USER, username: "averylongusername" } });
    await page.goto("/settings");

    const userBtn = page.locator('button:has(svg)').filter({ hasText: /averylongusername|^$/ }).first();
    await expect(userBtn).toBeVisible({ timeout: 5_000 });
    expect(await isSingleLine(page, userBtn)).toBe(true);
  });

  // ── ManagerCard mobile layout ────────────────────────────────────────────────
  // Guards the flex-col + mt-auto fix that keeps rating section at card bottom and
  // all cards in a row at the same height, even on narrow 2-column mobile grids.


});
