import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The company profile against a payload that is missing a field.
 *
 * <h2>The bug</h2>
 *
 * The page read {@code Object.entries(data.categoryAverages)} with no guard, so a response that
 * omitted the key threw {@code Cannot convert undefined or null to object} during render and the
 * whole page became the error boundary - "Something went wrong" in place of the company, its
 * managers and its ratings. One absent key, no company page.
 *
 * It had never been caught because every company spec routes the API to a fixture that happens to
 * include the field, and no test had ever rendered this page from a thinner one. It surfaced only
 * when an unrelated spec reused a minimal company object.
 *
 * <h2>Why it is worth a test rather than a shrug</h2>
 *
 * The API does send it on every path today, so this was latent. It is still the wrong thing to
 * rely on: the value crosses the network and is read through an unchecked {@code as CompanyData}
 * cast, which makes the type an assertion about a JSON body rather than a fact about it. The field
 * is also contribution-gated, which puts it precisely where some future change is most likely to
 * start withholding it - and the failure mode is not a missing section, it is no page at all.
 *
 * The sibling industry page asked the same question of the same field and had a guard. That is the
 * whole story: two copies, one guarded. Both now read it through client/lib/categoryAverages, and
 * the unit tests there cover the ranking rules. This covers the thing those cannot - that the page
 * actually renders.
 */

/* Deliberately missing categoryAverages. That absence IS the test. */
const COMPANY_WITHOUT_CATEGORY_AVERAGES = {
  id: 1,
  name: "Red Hat",
  slug: "red-hat",
  industry: "Software",
  industrySlug: "software",
  managerCount: 12,
  totalReviews: 127,
  avgRating: 3.9,
  managers: [],
  companyRating: null,
};

async function openCompany(page: any, company: unknown) {
  const user = { ...MOCK_USER, hasContributed: true, hasRatedCompany: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: company }));
  await page.goto("/companies/red-hat");
}

test.describe("A company payload missing its category averages", () => {
  test("still renders the company rather than an error page", async ({ page }) => {
    await openCompany(page, COMPANY_WITHOUT_CATEGORY_AVERAGES);

    // The company itself, which is what the reader came for.
    await expect(page.getByText("Red Hat").first()).toBeVisible({ timeout: 10_000 });
    // The error boundary's words. Asserted explicitly, because "the heading is visible" would
    // also pass on a page that had thrown AFTER painting the heading.
    await expect(page.getByText("An unexpected error occurred")).toHaveCount(0);
  });

  test("shows no strongest or weakest areas, rather than inventing them", async ({ page }) => {
    /*
      Absent information stays absent. The alternative - treating a missing map as zeros - would
      print categories nobody rated, which on a page about how a workplace treats people is worse
      than showing nothing.
    */
    await openCompany(page, COMPANY_WITHOUT_CATEGORY_AVERAGES);
    await expect(page.getByText("Red Hat").first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Strongest", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Weakest", { exact: false })).toHaveCount(0);
  });

  test("an empty map behaves the same as an absent one", async ({ page }) => {
    // What an unrated company genuinely sends: the key is present and the object is empty. The
    // two must not diverge, or the page works for real data and breaks on a technicality.
    await openCompany(page, { ...COMPANY_WITHOUT_CATEGORY_AVERAGES, categoryAverages: {} });

    await expect(page.getByText("Red Hat").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("An unexpected error occurred")).toHaveCount(0);
  });

  test("a null map behaves the same as an absent one", async ({ page }) => {
    // JSON null is a different value from undefined, and Object.entries rejects both.
    await openCompany(page, { ...COMPANY_WITHOUT_CATEGORY_AVERAGES, categoryAverages: null });

    await expect(page.getByText("Red Hat").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("An unexpected error occurred")).toHaveCount(0);
  });
});
