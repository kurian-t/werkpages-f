import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Phase 1 of the company-identity work: the picker returns an ID and the write path sends it.
 *
 * The point is that a company's display name stops being its identity. Two spellings of one
 * company used to create two companies, because the write path re-resolved whatever string it
 * was given. These pin the two halves that make that stop: the ID is sent when a company was
 * genuinely picked, and it is dropped the moment the text stops describing that pick.
 */

const SUGGESTIONS = [
  { id: 42, name: "Crumbl", logoUrl: undefined, industry: "Food & Beverage" },
  { id: 91, name: "Crumbl Bakery", logoUrl: undefined, industry: "Food & Beverage" },
];

async function mockPicker(page: any) {
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: { ...MOCK_USER, hasContributed: true } }));
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: true });
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: SUGGESTIONS }));
  await page.route("**/api/geo", (r: any) => r.fulfill({ json: { country: "Canada", state: "ON", city: "Toronto" } }));
}

/** Captures the body of the first request to a matching URL. */
function captureBody(page: any, pattern: string) {
  const seen: any[] = [];
  page.route(pattern, (route: any) => {
    try { seen.push(route.request().postDataJSON()); } catch { seen.push(null); }
    route.fulfill({ json: { data: [], hasContributed: false } });
  });
  return seen;
}

async function fillSearch(page: any, company: string) {
  await page.getByPlaceholder("first name").fill("Ada");
  await page.getByPlaceholder("last name").fill("Lovelace");
  await page.getByPlaceholder("job title").fill("Engineer");
  await page.getByPlaceholder("company").fill(company);
}

test.describe("Company identity travels as an ID", () => {
  test("picking a company from the typeahead sends its id", async ({ page }) => {
    await mockPicker(page);
    const bodies = captureBody(page, "**/api/managers/find-or-create");
    await page.goto("/find");

    await page.getByPlaceholder("first name").fill("Ada");
    await page.getByPlaceholder("last name").fill("Lovelace");
    await page.getByPlaceholder("job title").fill("Engineer");
    await page.getByPlaceholder("company").fill("crumb");

    await page.getByRole("option", { name: "Crumbl", exact: true }).click();
    await expect(page.getByPlaceholder("company")).toHaveValue("Crumbl");

    await page.getByRole("button", { name: /find|search/i }).first().click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0].companyId).toBe(42);
    expect(bodies[0].company).toBe("Crumbl");
  });

  test("typing after picking drops the id rather than mis-filing the manager", async ({ page }) => {
    // The dangerous case: pick Crumbl (42), keep typing, and a retained 42 would file this
    // manager under a company the user is no longer looking at. Wrong, and invisible.
    await mockPicker(page);
    const bodies = captureBody(page, "**/api/managers/find-or-create");
    await page.goto("/find");

    await page.getByPlaceholder("first name").fill("Ada");
    await page.getByPlaceholder("last name").fill("Lovelace");
    await page.getByPlaceholder("job title").fill("Engineer");
    await page.getByPlaceholder("company").fill("crumb");
    await page.getByRole("option", { name: "Crumbl", exact: true }).click();

    await page.getByPlaceholder("company").fill("Crumbl Cafe");

    await page.getByRole("button", { name: /find|search/i }).first().click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0].companyId ?? null).toBeNull();
    expect(bodies[0].company).toBe("Crumbl Cafe");
  });

  test("a company typed from scratch sends no id", async ({ page }) => {
    await mockPicker(page);
    const bodies = captureBody(page, "**/api/managers/find-or-create");
    await page.goto("/find");

    await page.getByPlaceholder("first name").fill("Ada");
    await page.getByPlaceholder("last name").fill("Lovelace");
    await page.getByPlaceholder("job title").fill("Engineer");
    await page.getByPlaceholder("company").fill("Nobody Has Stored This");

    await page.getByRole("button", { name: /find|search/i }).first().click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0].companyId ?? null).toBeNull();
  });
  test("a near match is offered before creating a new company", async ({ page }) => {
    // The duplicate-creating moment: the user types the name they know, the canonical company is
    // something slightly different, and creating is the path of least resistance. The existing
    // company is shown first; creating is still available, but as a deliberate choice.
    await mockPicker(page);
    await page.goto("/find");

    await page.getByPlaceholder("company").fill("Crumbl Cookies");

    await expect(page.getByRole("option", { name: "Crumbl", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: /Not listed\? Add/ })).toBeVisible();
  });

  test("choosing to add a new company sends no id", async ({ page }) => {
    await mockPicker(page);
    const bodies = captureBody(page, "**/api/managers/find-or-create");
    await page.goto("/find");

    await fillSearch(page, "Crumbl Cookies");
    await page.getByRole("option", { name: /Not listed\? Add/ }).click();

    await page.getByRole("button", { name: /find|search/i }).first().click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0].companyId ?? null).toBeNull();
    expect(bodies[0].company).toBe("Crumbl Cookies");
  });

  test("no create row when the typed name is an exact match", async ({ page }) => {
    await mockPicker(page);
    await page.goto("/find");

    await page.getByPlaceholder("company").fill("Crumbl");

    await expect(page.getByRole("option", { name: "Crumbl", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: /Not listed\? Add/ })).toHaveCount(0);
  });
});
