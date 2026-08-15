import { test, expect } from "./base";

async function mockLandingPage(page: any, opts: { stats?: any; companies?: string[] } = {}) {
  const {
    stats = { totalManagers: 142, totalReviews: 389 },
    companies = ["Acme Corp", "Skynet Inc", "Globex"],
  } = opts;

  await page.route("**/api/auth/me", (route: any) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );
  await page.route("**/api/stats", (route: any) =>
    route.fulfill({ json: stats })
  );
  await page.route("**/api/companies", (route: any) =>
    route.fulfill({ json: { data: companies } })
  );
}

test.describe("Landing page (/)", () => {
  test.describe("Hero section", () => {
    test("hero heading is visible", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByRole("heading", { name: /had a great manager/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("subheading mentions rating anonymously", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.locator("p:visible").filter({ hasText: /rate them anonymously/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("'Continue with Google' CTA button is present", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByRole("button", { name: /continue with google/i })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("'Continue with Facebook, Microsoft, or email' button is present", async ({
      page,
    }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByRole("button", { name: /continue with facebook/i })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("account-not-shared reassurance is shown below the sign-in buttons", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.locator("p:visible").filter({ hasText: /your account is never shared with employers or managers/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("'Just browsing' link is visible", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.locator("a:visible").filter({ hasText: /just browsing/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("'Just browsing' link navigates to /directory", async ({ page }) => {
      await mockLandingPage(page);
      await page.route(/\/api\/managers\?/, (route: any) =>
        route.fulfill({ json: { data: [], total: 0 } })
      );
      await page.goto("/");

      await page.locator("a:visible").filter({ hasText: /just browsing/i }).first().click();

      await expect(page).toHaveURL(/\/directory/, { timeout: 5_000 });
    });
  });

  test.describe("Trust & Safety section", () => {
    test("'Your safety, answered' heading is visible", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByText(/your safety, answered/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("anonymity question and answer are shown", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/is it really anonymous/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/your name never appears on any review/i)).toBeVisible();
    });

    test("employer visibility question and answer are shown", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/can my employer find out/i)).toBeVisible({ timeout: 10_000 });
    });

    test("fake reviews question is addressed", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/what stops fake reviews/i)).toBeVisible({ timeout: 10_000 });
    });

    test("legality question is addressed", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/is this allowed/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Sample review section", () => {
    test("'Here's what a review looks like' heading is visible", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByText(/here's what a review looks like/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("sample review shows a manager role and company", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByText(/engineering manager · acme corp/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("sample review shows rating categories", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/communication style/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/delegation style/i).first()).toBeVisible();
      await expect(page.getByText(/overall working experience/i).first()).toBeVisible();
    });

    test("sample review is labelled 'Example only'", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page.getByText(/example only/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("How it works section", () => {
    test("'How it works' heading is visible", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByText(/^how it works$/i)
      ).toBeVisible({ timeout: 10_000 });
    });

    test("three contributor-focused steps are shown", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(
        page.getByText(/think of a manager you've had/i)
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/rate them in 2 minutes/i)).toBeVisible();
      await expect(page.getByText(/help the next person decide/i)).toBeVisible();
    });
  });

  test.describe("Page title and metadata", () => {
    test("page title contains Werkpages", async ({ page }) => {
      await mockLandingPage(page);
      await page.goto("/");

      await expect(page).toHaveTitle(/werkpages/i, { timeout: 10_000 });
    });
  });
});
