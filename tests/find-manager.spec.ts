import { test, expect } from "./base";
import { MOCK_MANAGERS_LIST, MOCK_USER, TEST_MANAGER_ID, mockFindManagerPage } from "./fixtures";

// Helper: fill all four required fields and submit the search form
async function fillAndSearch(
  page: Parameters<typeof mockFindManagerPage>[0],
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

test.describe("FindYourManager page (/find)", () => {
  test("page loads with structured search fields", async ({ page }) => {
    await mockFindManagerPage(page);
    await page.goto("/find");

    await expect(page.getByPlaceholder("First name")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("Last name")).toBeVisible();
    await expect(page.getByPlaceholder(/job title/i)).toBeVisible();
    await expect(page.getByPlaceholder("Company")).toBeVisible();
  });

  test("page is accessible when not logged in", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: false });
    await page.goto("/find");

    await expect(page.getByPlaceholder("First name")).toBeVisible({ timeout: 10_000 });
  });

  test("empty state shows browse prompt before searching", async ({ page }) => {
    await mockFindManagerPage(page);
    await page.goto("/find");

    await expect(page.getByText(/want to browse instead/i)).toBeVisible({ timeout: 5_000 });
  });

  test("search button is disabled until all fields are filled", async ({ page }) => {
    await mockFindManagerPage(page);
    await page.goto("/find");

    const btn = page.getByRole("button", { name: /^search$/i });
    await expect(btn).toBeDisabled({ timeout: 5_000 });

    await page.getByPlaceholder("First name").fill("Alex");
    await expect(btn).toBeDisabled(); // still missing other fields
  });

  test("filling all fields enables the search button", async ({ page }) => {
    await mockFindManagerPage(page);
    await page.goto("/find");

    const btn = page.getByRole("button", { name: /^search$/i });
    await page.getByPlaceholder("First name").fill("Alex");
    await page.getByPlaceholder("Last name").fill("Johnson");
    await page.getByPlaceholder(/job title/i).fill("Engineering Manager");
    await page.getByPlaceholder("Company").fill("Acme Corp");

    await expect(btn).toBeEnabled();
  });

  test("searching returns matching manager cards", async ({ page }) => {
    await mockFindManagerPage(page, { searchResults: MOCK_MANAGERS_LIST });
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Acme Corp")).toBeVisible();
  });

  test("results list shows 'See all results in directory' link for contributors", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: true, hasContributed: true, searchResults: MOCK_MANAGERS_LIST });
    await page.goto("/find");

    await fillAndSearch(page);

    await expect(page.getByText(/see all results in directory/i)).toBeVisible({ timeout: 5_000 });
  });

  test("no-results state shows 'No manager found' and sign-in CTA for logged-out users", async ({ page }) => {
    await mockFindManagerPage(page, { emptySearch: true });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "NoSuch", lastName: "Person" });

    await expect(page.getByText(/no manager found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/sign in to add this manager/i)).toBeVisible();
  });

  test("no-results state shows 'Add manager' CTA for logged-in users", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: true, emptySearch: true });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Ghost", lastName: "Manager" });

    await expect(page.getByText(/no manager found/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /\+ add manager/i })).toBeVisible();
  });

  test("'View directory' navigates to /directory", async ({ page }) => {
    await mockFindManagerPage(page);
    await page.goto("/find");

    // Before any search, a "View directory" link is shown
    await expect(page.getByText(/view directory/i)).toBeVisible({ timeout: 5_000 });
    await page.getByText(/view directory/i).click();
    await expect(page).toHaveURL(/\/directory/, { timeout: 5_000 });
  });

  test("contributor result cards link to the manager profile", async ({ page }) => {
    const { TEST_MANAGER_ID } = await import("./fixtures");
    await mockFindManagerPage(page, { loggedIn: true, hasContributed: true, searchResults: MOCK_MANAGERS_LIST });
    await page.goto("/find");

    await fillAndSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
  });

  test("non-contributor result cards are clickable links to the locked profile", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: true, hasContributed: false, searchResults: MOCK_MANAGERS_LIST });
    await page.goto("/find");

    await fillAndSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });

    // Tile is a link so the user can click through to the locked profile page
    await expect(
      page.getByRole("link", { name: /alex johnson/i }).first()
    ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
  });

  test("no-results 'Add manager' button navigates to /add for logged-in users", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: true, emptySearch: true });
    await page.goto("/find");

    await fillAndSearch(page, { firstName: "Ghost", lastName: "Manager" });

    await expect(
      page.getByRole("button", { name: /\+ add manager/i })
    ).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /\+ add manager/i }).click();
    await expect(page).toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("logged-in user search uses find-or-create endpoint", async ({ page }) => {
    await mockFindManagerPage(page, { loggedIn: true, searchResults: MOCK_MANAGERS_LIST });
    await page.goto("/find");

    let usedFindOrCreate = false;
    page.on("request", (req) => {
      if (req.url().includes("find-or-create") && req.method() === "POST")
        usedFindOrCreate = true;
    });

    await fillAndSearch(page);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    expect(usedFindOrCreate).toBe(true);
  });

  // ── Auto-unlock after rating ─────────────────────────────────────────────────

  test("tiles auto-unlock when user returns to /find after rating a manager", async ({ page }) => {
    // Simulate: user previously searched for Alex Johnson, then rated a manager.
    // AddBoss sets rmm_just_rated in sessionStorage; FindManagerForm should
    // detect it on mount, re-run the search, and show unlocked tiles.
    await mockFindManagerPage(page, { loggedIn: true, hasContributed: true, searchResults: MOCK_MANAGERS_LIST });

    await page.addInitScript(() => {
      sessionStorage.setItem("rmm_just_rated", "1");
      sessionStorage.setItem("rmm_find_search", JSON.stringify({
        firstName: "Alex",
        lastName:  "Johnson",
        title:     "Engineering Manager",
        company:   "Acme Corp",
      }));
    });

    await page.goto("/find");

    // Tiles should auto-search and show the unlocked full card - no "Rate to unlock" badge
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Acme Corp").first()).toBeVisible();
    await expect(page.getByText("Engineering Manager").first()).toBeVisible();
    await expect(page.getByText("3.8").first()).toBeVisible();
    await expect(page.getByText("Rate to unlock")).not.toBeVisible();

    // sessionStorage flag must be cleared so it doesn't trigger again on next visit
    const flagCleared = await page.evaluate(() => sessionStorage.getItem("rmm_just_rated"));
    expect(flagCleared).toBeNull();
  });

  // ── Locked tile shape: logged-out user ───────────────────────────────────────
  // These tests lock in the exact visual contract of the locked result card.
  // If ANY of these break, the tile design has changed - confirm with the team first.

  test.describe("locked tile - logged-out user", () => {
    test.beforeEach(async ({ page }) => {
      await mockFindManagerPage(page, { loggedIn: false, searchResults: MOCK_MANAGERS_LIST });
      await page.goto("/find");
      await fillAndSearch(page);
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    });

    test("shows manager full name", async ({ page }) => {
      await expect(page.getByText("Alex Johnson").first()).toBeVisible();
    });

    test("shows company name unblurred", async ({ page }) => {
      await expect(page.getByText("Acme Corp").first()).toBeVisible();
    });

    test("shows Rate to unlock badge", async ({ page }) => {
      await expect(page.getByText("Rate to unlock").first()).toBeVisible();
    });

    test("does not show manager title as readable text", async ({ page }) => {
      // Title is replaced by a blurred placeholder div - "Engineering Manager"
      // must never appear as readable text in the locked tile.
      await expect(page.getByText("Engineering Manager")).not.toBeVisible();
    });

    test("does not show the overall rating number", async ({ page }) => {
      // Rating is replaced by blurred amber dots - the number "3.8" must not
      // appear as readable text in the locked tile.
      await expect(page.getByText("3.8")).not.toBeVisible();
    });

    test("tile is a navigable link to the locked profile", async ({ page }) => {
      // Non-contributor can click through to the locked profile page
      await expect(
        page.getByRole("link", { name: /alex johnson/i }).first()
      ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
    });
  });

  // ── Locked tile shape: logged-in user who has NOT rated yet ──────────────────

  test.describe("locked tile - logged-in user who has not rated", () => {
    test.beforeEach(async ({ page }) => {
      await mockFindManagerPage(page, { loggedIn: true, hasContributed: false, searchResults: MOCK_MANAGERS_LIST });
      await page.goto("/find");
      await fillAndSearch(page);
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    });

    test("shows manager full name", async ({ page }) => {
      await expect(page.getByText("Alex Johnson").first()).toBeVisible();
    });

    test("shows company name unblurred", async ({ page }) => {
      await expect(page.getByText("Acme Corp").first()).toBeVisible();
    });

    test("shows Rate to unlock badge", async ({ page }) => {
      await expect(page.getByText("Rate to unlock").first()).toBeVisible();
    });

    test("does not show manager title as readable text", async ({ page }) => {
      await expect(page.getByText("Engineering Manager")).not.toBeVisible();
    });

    test("does not show the overall rating number", async ({ page }) => {
      await expect(page.getByText("3.8")).not.toBeVisible();
    });

    test("tile is a navigable link to the locked profile", async ({ page }) => {
      // Non-contributor can click through to the locked profile page
      await expect(
        page.getByRole("link", { name: /alex johnson/i }).first()
      ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
    });
  });

  // ── Unlocked tile shape: logged-in contributor ───────────────────────────────

  test.describe("unlocked tile - logged-in contributor", () => {
    test.beforeEach(async ({ page }) => {
      await mockFindManagerPage(page, { loggedIn: true, hasContributed: true, searchResults: MOCK_MANAGERS_LIST });
      await page.goto("/find");
      await fillAndSearch(page);
      await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    });

    test("shows manager full name", async ({ page }) => {
      await expect(page.getByText("Alex Johnson").first()).toBeVisible();
    });

    test("shows company name", async ({ page }) => {
      await expect(page.getByText("Acme Corp").first()).toBeVisible();
    });

    test("shows manager title as readable text", async ({ page }) => {
      await expect(page.getByText("Engineering Manager").first()).toBeVisible();
    });

    test("shows overall rating number", async ({ page }) => {
      await expect(page.getByText("3.8").first()).toBeVisible();
    });

    test("does not show Rate to unlock badge", async ({ page }) => {
      await expect(page.getByText("Rate to unlock")).not.toBeVisible();
    });

    test("tile is a navigable link to the manager profile", async ({ page }) => {
      const { TEST_MANAGER_ID } = await import("./fixtures");
      await expect(
        page.getByRole("link", { name: /alex johnson/i }).first()
      ).toHaveAttribute("href", new RegExp(`/manager/${TEST_MANAGER_ID}`));
    });
  });
});

// ── Name and title normalisation ──────────────────────────────────────────────
// When a logged-in user submits the find form, the payload sent to
// POST /api/managers/find-or-create must have title-cased names and
// correctly-cased job titles regardless of what the user typed.

test.describe("FindYourManager - name and title normalisation", () => {
  async function captureAndSearch(
    page: Parameters<typeof mockFindManagerPage>[0],
    input: { firstName: string; lastName: string; title: string; company?: string }
  ) {
    let captured: any = null;

    await mockFindManagerPage(page, { loggedIn: true, hasContributed: true });

    // Override find-or-create AFTER mockFindManagerPage so this handler fires first (LIFO)
    await page.route("**/api/managers/find-or-create", async (route) => {
      try { captured = route.request().postDataJSON() ?? {}; } catch { captured = {}; }
      route.fulfill({ json: { data: MOCK_MANAGERS_LIST, created: false, hasContributed: true } });
    });

    await page.addInitScript((u) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, MOCK_USER);

    await page.goto("/find");

    await page.getByPlaceholder("First name").fill(input.firstName);
    await page.getByPlaceholder("Last name").fill(input.lastName);
    await page.getByPlaceholder(/job title/i).fill(input.title);
    await page.getByPlaceholder(/company/i).fill(input.company ?? "Acme Corp");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 5_000 });
    return captured;
  }

  test("all-lowercase name is sent as title case", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "al", lastName: "valado", title: "Service Manager",
    });
    expect(body).not.toBeNull();
    expect(body.firstName).toBe("Al");
    expect(body.lastName).toBe("Valado");
  });

  test("all-caps name is sent as title case", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "AL", lastName: "VALADO", title: "Service Manager",
    });
    expect(body.firstName).toBe("Al");
    expect(body.lastName).toBe("Valado");
  });

  test("hyphenated last name is title-cased correctly", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "mary", lastName: "smith-jones", title: "Manager",
    });
    expect(body.firstName).toBe("Mary");
    expect(body.lastName).toBe("Smith-Jones");
  });

  test("lowercase ceo title is sent as CEO", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "Alex", lastName: "Johnson", title: "ceo",
    });
    expect(body.title).toBe("CEO");
  });

  test("lowercase vp engineering is sent as VP Engineering", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "Alex", lastName: "Johnson", title: "vp engineering",
    });
    expect(body.title).toBe("VP Engineering");
  });

  test("multi-word plain title is sent in title case", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "Alex", lastName: "Johnson", title: "service manager",
    });
    expect(body.title).toBe("Service Manager");
  });

  test("uppercase CFO is preserved as CFO", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "Alex", lastName: "Johnson", title: "CFO",
    });
    expect(body.title).toBe("CFO");
  });

  test("svp of sales is sent as SVP Of Sales", async ({ page }) => {
    const body = await captureAndSearch(page, {
      firstName: "Alex", lastName: "Johnson", title: "svp of sales",
    });
    expect(body.title).toBe("SVP Of Sales");
  });
});
