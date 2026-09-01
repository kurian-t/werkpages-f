import { test, expect } from "./base";

/**
 * Choosing the company from inside the interview form.
 *
 * Previously the company came only from the URL, so the only way to say anything about
 * interviewing somewhere was to find that company's page first and start from there. Everyone who
 * did not happen to be on that page simply did not contribute.
 *
 * The one rule that does not bend: an interview review never brings a company into existence.
 * InterviewService is explicit about why - a company that exists only because someone claims to
 * have interviewed there has no verifiable anchor. So the field selects, it does not create.
 */

const USER = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", hasContributed: true };

const SUGGESTIONS = [
  { id: 7, name: "Red Hat", slug: "red-hat" },
  { id: 8, name: "Redis", slug: "redis" },
];

async function mock(page: any) {
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), USER);
  // Catch-alls first: Playwright matches in reverse registration order.
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: { name: "Red Hat", slug: "red-hat" } }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
  await page.route("**/api/geo", (r: any) => r.fulfill({ json: { country: "CA", state: "ON", city: "Toronto" } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: SUGGESTIONS }));
}

test.describe("Choosing a company on the interview form", () => {
  test("the form opens without a company and asks for one", async ({ page }) => {
    await mock(page);
    await page.goto("/add-interview");

    await expect(page.getByText("Which company?")).toBeVisible({ timeout: 10_000 });
    // No company in the heading, because none has been chosen.
    await expect(page.getByRole("heading", { name: "Your interview" })).toBeVisible();
  });

  test("the structured-only guarantee still holds here", async ({ page }) => {
    // The company field is a text input, which is exactly what an interview form must not grow.
    // It identifies a company; it is not somewhere to describe the experience.
    await mock(page);
    await page.goto("/add-interview");

    await expect(page.getByText("Which company?")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("the removed help text is gone", async ({ page }) => {
    await mock(page);
    await page.goto("/add-interview");

    await expect(page.getByText("Which company?")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/No free text/)).toHaveCount(0);
  });

  test("picking a company names it in the heading", async ({ page }) => {
    await mock(page);
    await page.goto("/add-interview");

    await page.getByPlaceholder("Search companies").fill("Red");
    await page.getByText("Red Hat", { exact: true }).click();

    await expect(page.getByRole("heading", { name: /Your interview at Red Hat/ })).toBeVisible({ timeout: 10_000 });
  });

  test("typing a company without picking it does not count as a choice", async ({ page }) => {
    // The whole point of select-not-create. A name nobody picked refers to no company row, and
    // submitting it would either fail or invent one.
    await mock(page);
    await page.goto("/add-interview");

    await page.getByPlaceholder("Search companies").fill("Red Hat");
    await page.getByPlaceholder("Search companies").blur();

    await expect(page.getByRole("heading", { name: "Your interview" })).toBeVisible();
  });

  test("arriving from a company page still pre-fills, and stays editable", async ({ page }) => {
    // The old entry point keeps working - and the company is no longer frozen, so someone who
    // opened the wrong one can fix it here instead of navigating away.
    await mock(page);
    await page.goto("/companies/red-hat/add-interview");

    await expect(page.getByRole("heading", { name: /Your interview at Red Hat/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("Search companies")).toHaveValue("Red Hat");

    await page.getByPlaceholder("Search companies").fill("Redis");
    await page.getByText("Redis", { exact: true }).click();
    await expect(page.getByRole("heading", { name: /Your interview at Redis/ })).toBeVisible();
  });
});
