import { test, expect } from "./base";

/**
 * Cancelling "Add a manager" returns you where you came from.
 *
 * Most entry points — the header, the directory, a company page, a manager profile — link to
 * /add with no ?returnTo, and the form used to send every one of those to /directory. People
 * landed somewhere they had never been and lost their place.
 *
 * An explicit ?returnTo still wins where a caller knows better. The history fallback only covers
 * the callers that don't say, which is most of them, and which is why patching call sites one at
 * a time would not have held.
 */

const MANAGERS = { data: [], total: 0 };
const COMPANY = {
  id: 7, name: "Red Hat", slug: "red-hat", industry: "Technology", industrySlug: "technology",
  managerCount: 0, totalReviews: 0, avgRating: 0, categoryAverages: {}, managers: [],
};

const USER = { id: "u1", username: "tester", email: "t@test.com", hasContributed: true, role: "user" };

async function mockApi(page: any) {
  // The header's "Add Manager" link only renders for a signed-in user, and AuthProvider seeds
  // itself from localStorage on first render — mocking /api/auth/me alone is a frame too late.
  await page.addInitScript((u: unknown) => {
    localStorage.setItem("authUser", JSON.stringify(u));
  }, USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: MANAGERS }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.route("**/api/geo", (r: any) => r.fulfill({ json: {} }));
}

test.describe("Add a manager — cancel", () => {
  test("returns to the page you came from when no returnTo was given", async ({ page }) => {
    await mockApi(page);
    await page.goto("/companies");
    await page.getByRole("link", { name: "Add Manager" }).first().click();
    await expect(page).toHaveURL(/\/add$/);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/companies$/, { timeout: 10_000 });
  });

  test("returns to a manager profile you came from, not the directory", async ({ page }) => {
    await mockApi(page);
    await page.goto("/industries/technology/companies/red-hat");
    await page.getByRole("link", { name: "Add Manager" }).first().click();
    await expect(page).toHaveURL(/\/add$/);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/red-hat$/, { timeout: 10_000 });
  });

  test("an explicit returnTo still wins over history", async ({ page }) => {
    await mockApi(page);
    await page.goto("/companies");
    await page.goto("/add?returnTo=/explore");

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/explore$/, { timeout: 10_000 });
  });

  test("falls back to the directory when /add was opened directly", async ({ page }) => {
    // No in-app history to go back to — going back here would leave the site entirely.
    await mockApi(page);
    await page.goto("/add");

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page).toHaveURL(/\/directory$/, { timeout: 10_000 });
  });
});
