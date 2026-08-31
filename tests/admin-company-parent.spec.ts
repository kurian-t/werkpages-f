import { test, expect } from "./base";
import { MOCK_ADMIN_USER } from "./fixtures";

/**
 * Setting corporate structure from the admin panel.
 *
 * This sits next to the merge tool because the two get confused, and confusing them is expensive
 * in one direction: merging Zehrs into Loblaw would destroy the distinction between a store
 * manager and a corporate one, while linking two records of the same company is a click to undo.
 * The copy on each panel is doing that work, so it is asserted here.
 */

const COMPANIES = [
  { id: 1, name: "Loblaw Companies", slug: "loblaw-companies" },
  { id: 2, name: "Zehrs Markets", slug: "zehrs-markets" },
];

async function openCompaniesTab(page: any) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), MOCK_ADMIN_USER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_ADMIN_USER }));
  // Catch-all first: Playwright matches routes in reverse registration order.
  await page.route("**/api/admin/**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/admin/companies**", (r: any) => r.fulfill({ json: { data: COMPANIES } }));
  await page.goto("/admin");
  await page.getByRole("button", { name: /^Companies$/ }).first().click();
}

test.describe("Admin corporate structure", () => {
  test("linking a company to its parent sends the relationship", async ({ page }) => {
    const sent: any[] = [];
    await openCompaniesTab(page);
    await page.route("**/api/admin/companies/*/parent", (route: any) => {
      sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
      route.fulfill({ json: { success: true } });
    });

    await page.getByPlaceholder("e.g. Zehrs Markets").fill("zehrs");
    await page.getByRole("button", { name: "Zehrs Markets" }).click();
    await page.getByPlaceholder("e.g. Loblaw Companies").fill("loblaw");
    await page.getByRole("button", { name: "Loblaw Companies" }).click();
    await page.getByRole("button", { name: /Link companies/i }).click();

    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0].url).toContain("/api/admin/companies/2/parent");
    expect(sent[0].body.parentId).toBe(1);
  });

  test("the two panels say which is which", async ({ page }) => {
    // The distinction the whole feature rests on, stated where the mistake would be made.
    await openCompaniesTab(page);

    await expect(page.getByText(/For two records of the/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/like Zehrs and Loblaw/)).toBeVisible();
    await expect(page.getByText(/Both\s+keep their own page, managers and ratings/)).toBeVisible();
  });

  test("the merge panel no longer promises deletion", async ({ page }) => {
    await openCompaniesTab(page);
    await expect(page.getByText(/duplicate is retired, keeping its link working/)).toBeVisible({ timeout: 10_000 });
  });

  test("a company cannot be made part of itself", async ({ page }) => {
    await openCompaniesTab(page);

    await page.getByPlaceholder("e.g. Zehrs Markets").fill("zehrs");
    await page.getByRole("button", { name: "Zehrs Markets" }).click();
    await page.getByPlaceholder("e.g. Loblaw Companies").fill("zehrs");
    await page.getByRole("button", { name: "Zehrs Markets" }).click();

    await expect(page.getByText("A company cannot be part of itself.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Link companies/i })).toBeDisabled();
  });

  test("detaching sends a delete for the selected company", async ({ page }) => {
    const deleted: string[] = [];
    await openCompaniesTab(page);
    await page.route("**/api/admin/companies/*/parent", (route: any) => {
      if (route.request().method() === "DELETE") deleted.push(route.request().url());
      route.fulfill({ json: { success: true, removed: true } });
    });

    await page.getByPlaceholder("e.g. Zehrs Markets").fill("zehrs");
    await page.getByRole("button", { name: "Zehrs Markets" }).click();
    await page.getByRole("button", { name: /Detach from parent/i }).click();

    await expect.poll(() => deleted.length).toBeGreaterThan(0);
    expect(deleted[0]).toContain("/api/admin/companies/2/parent");
  });
});
