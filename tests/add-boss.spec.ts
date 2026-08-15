import { test, expect } from "./base";
import { mockAddBossPage, rateAllFiveStars } from "./fixtures";

// Helper: fill Step 1 (manager info) using name attributes since inputs have no htmlFor.
// Country is omitted — the geo mock pre-fills "United States", so the chip view shows.
async function fillStep1(page: any) {
  await page.locator('input[name="firstName"]').fill("Jordan");
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
}

// Helper: fill Step 2 (work timeline)
async function fillStep2(page: any) {
  await page.getByLabel("From month").selectOption("01");
  await page.getByLabel("From year").selectOption("2022");
  await page.getByRole("checkbox", { name: /^current$/i }).check();
}

test.describe("AddBoss — 3-step flow", () => {
  test("page loads at step 1 showing manager info fields", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await expect(
      page.getByText(/step 1 of 3/i)
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
  });

  test("step 1: country and state/province pre-fill from inferred geo and show as chip", async ({
    page,
  }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    // Geo pre-fills country+state; the chip view shows the detected location.
    await expect(page.getByText("United States, California")).toBeVisible({ timeout: 5_000 });
    // Inputs are hidden; clicking "Edit location" reveals them.
    await page.getByRole("button", { name: /edit location/i }).click();
    await expect(page.locator('select[name="country"]')).toHaveValue("United States");
    await expect(page.locator('input[name="state"]')).toHaveValue("California");
  });

  test("step 1: Next is disabled until required fields are filled", async ({
    page,
  }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled({ timeout: 5_000 });

    await fillStep1(page);

    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled({ timeout: 3_000 });
  });

  test("step 1: no manager tenure fields are shown", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    // Manager tenure was removed — must not exist anywhere on step 1
    await expect(page.getByText(/manager.*tenure/i)).not.toBeVisible({ timeout: 5_000 });
  });


  test("advancing from step 1 shows step 2 (work timeline)", async ({
    page,
  }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel("From month")).toBeVisible();
  });

  test("step 2: Next is disabled until dates are selected", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 5_000 });

    // Next stays disabled while the work dates are empty, so the user cannot
    // advance and hit date errors on the final step.
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled({ timeout: 3_000 });

    await fillStep2(page);

    // After filling dates, Next is enabled and advances to step 3
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled({ timeout: 3_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("advancing from step 2 shows step 3 (ratings)", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 5_000 });

    // Star rating inputs should be present
    await expect(page.getByRole("button", { name: /rate 5 stars/i }).first()).toBeVisible();
  });

  test("step 3: 'About your review' trust card is visible", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/about your review/i)).toBeVisible({ timeout: 5_000 });
  });

  test("step 3: Submit triggers auth modal when logged out", async ({ page }) => {
    await mockAddBossPage(page, { loggedIn: false });
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await rateAllFiveStars(page);

    // When logged out, button says "Continue to Sign In"
    await page.getByRole("button", { name: /continue to sign in/i }).click();

    // Auth modal opens
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("step 3: logged-in user can submit and sees success toast", async ({
    page,
  }) => {
    await mockAddBossPage(page, { loggedIn: true });
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await rateAllFiveStars(page);

    // When logged in, button says "Submit Review"
    await page.getByRole("button", { name: /submit review/i }).click();

    await expect(
      page.getByText(/jordan smith submitted for review/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("ready banner appears when logged-in user returns to /add with a saved draft", async ({
    page,
  }) => {
    // Simulate the OAuth-return scenario: draft was saved, user now logs in via OAuth,
    // gets redirected back to /add. The draft restore effect detects user + draft → shows banner.
    const draft = {
      savedAt: Date.now(),
      step: "ratings",
      formData: { firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", company: "Acme Corp", country: "Canada", linkedinUrl: "", status: "active" },
      ratings: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`cat${i}`, 5])),
      workedFrom: { month: "01", year: "2022" },
      workedUntil: { month: "", year: "" },
      currentlyWorking: true,
      authorType: "username",
      generatedName: "anonymous-test",
    };

    await mockAddBossPage(page, { loggedIn: true });
    await page.addInitScript((d) => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify(d));
    }, draft);

    await page.goto("/add");

    await expect(
      page.getByText(/you're signed in/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Back button from step 2 returns to step 1", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 3_000 });

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("Back button from step 3 returns to step 2", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    await fillStep1(page);
    await page.getByRole("button", { name: /^next$/i }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: /^next$/i }).click();

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible({ timeout: 3_000 });
  });

  test("draft restores form data when navigating back to /add", async ({
    page,
  }) => {
    await mockAddBossPage(page, { loggedIn: false });

    // Seed a draft in localStorage as if the user partially filled the form and left
    const draft = {
      savedAt: Date.now(),
      step: "info",
      formData: {
        firstName: "Drafted",
        lastName: "Manager",
        title: "CTO",
        company: "Draft Corp",
        country: "Canada",
        linkedinUrl: "",
        status: "active",
      },
      ratings: {},
      workedFrom: { month: "", year: "" },
      workedUntil: { month: "", year: "" },
      currentlyWorking: false,
      authorType: "username",
      generatedName: "anon-user",
    };

    await page.addInitScript((d: any) => {
      localStorage.setItem("rmm_pending_manager", JSON.stringify(d));
    }, draft);

    await page.goto("/add");

    // Draft is restored — the previously filled fields are pre-populated
    await expect(
      page.locator('input[name="firstName"]')
    ).toHaveValue("Drafted", { timeout: 5_000 });
    await expect(
      page.locator('input[name="lastName"]')
    ).toHaveValue("Manager");
    await expect(
      page.locator('input[name="company"]')
    ).toHaveValue("Draft Corp");
  });

  test("cancel button closes the form", async ({ page }) => {
    await mockAddBossPage(page);
    await page.goto("/add");

    // The form overlay should be open
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    // After cancel, navigated away from /add
    await expect(page).not.toHaveURL(/\/add/, { timeout: 5_000 });
  });

  test("cancel with returnTo param navigates back to company profile", async ({ page }) => {
    await mockAddBossPage(page);
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/companies/by-name**", (route) =>
      route.fulfill({ json: { name: "Acme Corp", logoUrl: null, managerCount: 0, totalReviews: 0, avgRating: null, categoryAverages: {}, managers: [] } })
    );
    await page.route("**/api/companies/suggest**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/add?returnTo=/companies/Acme%20Corp");

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page).toHaveURL(/\/companies\/Acme/, { timeout: 5_000 });
  });

  test("X button with returnTo param navigates back to company profile", async ({ page }) => {
    await mockAddBossPage(page);
    await page.route("**/api/companies/listing", (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.route("**/api/companies/by-name**", (route) =>
      route.fulfill({ json: { name: "Acme Corp", logoUrl: null, managerCount: 0, totalReviews: 0, avgRating: null, categoryAverages: {}, managers: [] } })
    );
    await page.route("**/api/companies/suggest**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/add?returnTo=/companies/Acme%20Corp");

    await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

    // X close button is the first button in the header row
    await page.getByRole("button", { name: /^close$/i }).click();

    await expect(page).toHaveURL(/\/companies\/Acme/, { timeout: 5_000 });
  });
});
