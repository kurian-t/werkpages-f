import { test, expect } from "./base";

/**
 * The company's overall rating reads the same way the manager's does.
 *
 * The Working here tab used to spell out "out of 5" under the number and give the sample its own
 * column labelled "Low confidence" / "based on sample size". The manager profile does neither, so
 * one score looked like a different kind of measurement depending which page you were on.
 */

const SLUG = "central-rock-gym";

function profile(ratingCount: number, avg: number) {
  return {
    id: 1,
    name: "Central Rock Gym",
    slug: SLUG,
    managerCount: 1,
    totalReviews: 3,
    avgRating: 4.2,
    categoryAverages: { communication: 4.1 },
    managers: [
      { id: 91, name: "Kathryn Kaufman", title: "Chief Operations Officer", company: "Central Rock Gym",
        slug: "kathryn-kaufman", approvalStatus: "approved", overallRating: 4.2, reviewsCount: 3 },
    ],
    companyRating: {
      ratingCount,
      overallRating: avg,
      categories: { culture: avg, management: avg, workLife: avg },
    },
  };
}

const VIEWER = {
  id: "u1",
  name: "Test Viewer",
  email: "viewer@example.com",
  role: "user",
  hasContributed: true,
  hasRatedCompany: true,
};

async function openWorkingHere(page: any, ratingCount: number, avg = 4.3) {
  // The app seeds its session from localStorage before the first request, so mocking /api/auth/me
  // alone leaves the page rendering signed-out.
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), VIEWER);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: VIEWER }));
  await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: profile(ratingCount, avg) }));
  await page.route("**/api/companies/*/ratings", (r: any) => r.fulfill({ json: { data: [] } }));
  // The tab lives in the URL, so it can be opened directly.
  await page.goto(`/companies/${SLUG}?tab=company`);
  // Assert the strip actually rendered before asserting anything about its wording - otherwise
  // every "this text is absent" check below passes for the wrong reason.
  await expect(page.getByText(avg.toFixed(1)).first()).toBeVisible({ timeout: 10_000 });
}

test.describe("Company rating strip", () => {
  test("shows the score the way the manager profile does", async ({ page }) => {
    await openWorkingHere(page, 12);
    await expect(page.getByText("12 ratings").first()).toBeVisible();
  });

  test("does not spell out 'out of 5' as visible text", async ({ page }) => {
    // The stars carry it as an accessible label; the page does not say it in prose.
    await openWorkingHere(page, 12);
    await expect(page.getByText("out of 5", { exact: true })).toHaveCount(0);
  });

  test("does not label the sample with a confidence phrase", async ({ page }) => {
    await openWorkingHere(page, 2);
    await expect(page.getByText(/low confidence/i)).toHaveCount(0);
    await expect(page.getByText(/based on sample size/i)).toHaveCount(0);
  });

  test("warns inline when the sample is small, in the manager profile's words", async ({ page }) => {
    await openWorkingHere(page, 2);
    await expect(page.getByText(/limited data, interpret cautiously/i).first()).toBeVisible();
  });

  test("no caveat once the sample is big enough", async ({ page }) => {
    await openWorkingHere(page, 12);
    await expect(page.getByText(/limited data, interpret cautiously/i)).toHaveCount(0);
  });
});
