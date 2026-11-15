import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The employment-status chip on a company profile's manager tiles.
 *
 * <p>Current, Former, or nothing at all. The third case is the one worth a test: Unknown is the
 * absence of information and the overwhelming majority of tiles have it, so announcing it on every
 * card would be noise. The API still returns the value, and this asserts that the page does not
 * render it.
 *
 * <p>It also asserts what must NOT be on the page. The date behind a status is a contributor's own
 * departure date wherever the basis is a claim, and it is never public: the API does not send it,
 * and this is the test that would notice if a future change put it into a tooltip or a title
 * attribute "just for admins".
 */

const CURRENT = {
  id: 11, name: "Scott Mcdougall", slug: "scott-mcdougall",
  title: "Manager", overallRating: 4.8, reviewsCount: 3, employmentStatus: "current",
};

const FORMER = {
  id: 12, name: "Christine Brady", slug: "christine-brady",
  title: "Assistant Store Manager", overallRating: 4.1, reviewsCount: 2,
  employmentStatus: "former",
};

const UNKNOWN = {
  id: 13, name: "Darren Whitlock", slug: "darren-whitlock",
  title: "Shift Supervisor", overallRating: 3.5, reviewsCount: 1, employmentStatus: "unknown",
};

const COMPANY = {
  id: 1, name: "Loblaw Companies Limited", slug: "loblaw-companies-limited",
  industry: "Retail", industrySlug: "retail",
  managerCount: 3, totalReviews: 6, avgRating: 4.1, categoryAverages: {},
  managers: [CURRENT, FORMER, UNKNOWN],
};

async function mockCompany(page: any) {
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: true });
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { ...MOCK_USER, hasContributed: true } }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  const serve = (r: any) => r.fulfill({ json: COMPANY });
  await page.route("**/api/companies/**", serve);
  await page.route("**/api/companies/by-slug/**", serve);
  await page.goto("/industries/retail/companies/loblaw-companies-limited");
}

const tile = (page: any, name: string) => page.getByRole("link", { name: new RegExp(name) });

test.describe("employment status on the manager tiles", () => {
  test("a current manager's tile says Current", async ({ page }) => {
    await mockCompany(page);
    const chip = tile(page, "Scott Mcdougall").getByTestId("employment-status");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("Current");
    await expect(chip).toHaveAttribute("data-status", "current");
  });

  test("a former manager's tile says Former", async ({ page }) => {
    await mockCompany(page);
    const chip = tile(page, "Christine Brady").getByTestId("employment-status");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("Former");
  });

  test("an unknown status renders no chip at all", async ({ page }) => {
    await mockCompany(page);
    await expect(tile(page, "Darren Whitlock")).toBeVisible();
    await expect(tile(page, "Darren Whitlock").getByTestId("employment-status"))
      .toHaveCount(0);
    // And the word is nowhere on the tile either, in case a future change renders it as text.
    await expect(tile(page, "Darren Whitlock")).not.toContainText("Unknown");
  });

  test("the three tiles are told apart, so one label is not painting all of them", async ({ page }) => {
    await mockCompany(page);
    await expect(page.getByTestId("employment-status")).toHaveCount(2);
    const statuses = await page.getByTestId("employment-status").evaluateAll(
      (nodes: Element[]) => nodes.map(n => n.getAttribute("data-status")));
    expect(statuses.sort()).toEqual(["current", "former"]);
  });

  test("no evidence date or resolution detail reaches the page", async ({ page }) => {
    await mockCompany(page);
    await expect(tile(page, "Scott Mcdougall")).toBeVisible();
    const html = await page.content();
    for (const leak of ["statusAsOf", "status_as_of", "statusBasis", "status_basis",
                        "statusResolvedBy", "status_resolved_by", "contributor_claim"]) {
      expect(html).not.toContain(leak);
    }
  });
});
