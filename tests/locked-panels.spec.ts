import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Every locked panel is the same panel.
 *
 * <p>The company page had four of them in three styles: two header overlays with a padlock and no
 * call to action, an interview list with a padlock and a different type scale, and two plain
 * cards with a button - beside a manager profile that used none of those. Each had been written
 * by somebody matching the one next to it by eye, and the page read as several products.
 *
 * <p>They now all render through `LockedNotice`. These tests assert the things that actually
 * drifted: the padlock glyph, and whether the shared component is the one on the page at all.
 */

const COMPANY = {
  id: 1, name: "Loblaw Companies Limited", slug: "loblaw-companies-limited",
  industry: "Retail", industrySlug: "retail",
  managerCount: 2, totalReviews: 6, avgRating: 4.1, categoryAverages: {},
  managers: [
    { id: 11, name: "Scott Mcdougall", slug: "scott-mcdougall", title: "Manager",
      overallRating: 4.8, reviewsCount: 3, company: "Loblaw Companies Limited" },
  ],
};

async function lockedCompany(page: any) {
  const user = { ...MOCK_USER, hasContributed: false };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/users/me/submitted-managers", (r: any) => r.fulfill({ json: { data: [] } }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));
  await page.goto("/industries/retail/companies/loblaw-companies-limited");
  await expect(page.getByText("Scott Mcdougall")).toBeVisible({ timeout: 10_000 });
}

test.describe("Locked panels", () => {
  test("a locked company page states the gate through the shared notice", async ({ page }) => {
    await lockedCompany(page);

    // The header's figures are covered by the shared overlay, not by a hand-rolled box.
    const overlay = page.getByTestId("locked-overlay").first();
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText(/locked/i)).toBeVisible();
  });

  /*
    No padlock glyph anywhere in a locked panel.

    The manager profile never drew one - the blurred content behind the notice already reads as
    withheld - while the company page drew one in three different sizes and opacities. It was the
    single most visible thing making these panels look unrelated to each other.
  */
  test("locked panels draw no padlock glyph", async ({ page }) => {
    await lockedCompany(page);

    for (const testId of ["locked-overlay", "locked-panel"]) {
      const panels = page.getByTestId(testId);
      for (let i = 0; i < await panels.count(); i++) {
        await expect(panels.nth(i).locator("svg.lucide-lock")).toHaveCount(0);
      }
    }
  });

  /*
    The manager profile is the reference, and it is now literally the same component - not a
    lookalike that happens to agree today. If this one drifts, everything above drifts with it.
  */
  test("the manager profile's own lock is the same shared panel", async ({ page }) => {
    const user = { ...MOCK_USER, hasContributed: false };
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await page.route("**/api/managers/1", (r: any) => r.fulfill({
      json: { id: 1, name: "Scott Mcdougall", company: "Loblaw Companies Limited",
              title: "Manager", overallRating: 4.2, reviewsCount: 3, approvalStatus: "approved",
              categoryAverages: {} },
    }));
    await page.route("**/api/managers/1/reviews**", (r: any) => r.fulfill({ json: { data: [] } }));
    await page.goto("/manager/1");

    /*
      "Overview is locked" was the old section name. The generated Overview sentence is gone -
      RatingHighlights and the category breakdown took its place - so the panel names what is
      actually withheld: the categories.
    */
    await expect(page.getByText(/categories locked/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("locked-overlay").first()).toBeVisible();
    await expect(page.getByTestId("locked-overlay").first().locator("svg.lucide-lock")).toHaveCount(0);
  });
});
