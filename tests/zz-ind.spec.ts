import { test } from "./base";
const DATA = { industry: "Technology", slug: "technology", companyCount: 1, managerCount: 1,
  totalReviews: 2, avgRating: 4.6,
  categoryAverages: { "Communication Style": 3.4, "Feedback Style": 3.1, "Delegation Style": 2.9,
    "Perceived Supportiveness": 4.2, "Decision Making Style": 3.8, "Overall Working Experience": 4.0 },
  companies: [{ name: "Red Hat", slug: "red-hat", managerCount: 1, totalReviews: 2, avgRating: 4.6 }] };
test("industry layout", async ({ page }) => {
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ status: 401, json: {} }));
  await page.route(/\/api\/industries\//, (r: any) => r.fulfill({ json: DATA }));
  await page.goto("/industries/technology");
  await page.waitForTimeout(1500);
  for (const t of ["1 company", "1 manager", "2 reviews", "4.6 avg"]) {
    console.log(`HEADER "${t}":`, await page.getByText(t, { exact: true }).count());
  }
  console.log("OLD CHART BOX:", await page.getByText(/rates across the 10 categories/i).count());
  console.log("EYEBROW:", await page.getByText(/Industry ratings/i).count());
  const search = await page.getByPlaceholder(/Search for a company/i).boundingBox();
  const rule = await page.locator(".border-t.border-border").first().boundingBox();
  if (rule && search) console.log(`RULE x=${Math.round(rule.x)} w=${Math.round(rule.width)} | SEARCH y=${Math.round(search.y)} vs RULE y=${Math.round(rule.y)}`);
});
