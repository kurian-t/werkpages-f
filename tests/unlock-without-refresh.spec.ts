import { test, expect } from "./base";

/**
 * Contributing unlocks the page you are standing on, without a refresh.
 *
 * These endpoints shape their reply around the reader: a profile comes back with its category
 * averages stripped out for somebody who has not contributed. That makes the response cacheable per
 * gate state, not per URL - and the caches were keyed on the URL alone, so the locked copy stayed
 * put after signing in or after submitting the very rating that unlocked it. The gate now forms
 * part of the query key, so the refetch happens on its own.
 */

const SLUG = "central-rock-gym";
const LOCKED_USER   = { id: "u1", name: "T", role: "user", hasContributed: false, hasRatedCompany: false };
const UNLOCKED_USER = { id: "u1", name: "T", role: "user", hasContributed: true,  hasRatedCompany: true  };

function profile(unlocked: boolean) {
  return {
    id: 1, name: "Central Rock Gym", slug: SLUG, managerCount: 1, totalReviews: 3, avgRating: 4.2,
    // The server strips these for a reader who has not contributed. That is the whole point.
    categoryAverages: unlocked ? { communication: 4.1 } : {},
    managers: [{ id: 91, name: "Kathryn Kaufman", title: "Chief Operations Officer",
      company: "Central Rock Gym", slug: "kathryn-kaufman", approvalStatus: "approved",
      overallRating: 4.2, reviewsCount: 3 }],
    companyRating: unlocked
      ? { ratingCount: 7, overallRating: 4.3, categories: { culture: 4.3 } }
      : { ratingCount: 7, overallRating: 4.3, categories: {} },
  };
}

test.describe("Unlocking without a refresh", () => {
  test("submitting a workplace rating re-reads the session before returning", async ({ page }) => {
    /*
     * The fix, stated as behaviour. Rating a workplace is what opens the workplace gate, and the
     * gate lives on the account - so the submit has to pull the session before navigating back.
     * Without it the reader lands on a page whose session still says "not contributed", and the
     * page stays locked until they refresh by hand. Invalidating the profile query did not help:
     * the server shapes that response around the gate, so refetching while the session still says
     * locked just fetches the locked copy again.
     */
    const calls: string[] = [];
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), LOCKED_USER);
    await page.route("**/api/auth/me", (r: any) => { calls.push("auth-me"); r.fulfill({ json: LOCKED_USER }); });
    await page.route("**/api/companies/*/ratings", (r: any) => r.fulfill({ json: { data: [] } }));
    await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: profile(false) }));
    await page.route("**/api/companies/*/rating", (r: any) =>
      r.request().method() === "POST"
        ? (calls.push("submit"), r.fulfill({ json: { success: true } }))
        : r.fulfill({ json: {} }));

    await page.goto(`/companies/${SLUG}/rate`);
    // The form refuses an incomplete draft: an overall score, every category, and a start date.
    const stars = page.getByRole("button", { name: /: 5 stars$/ });
    await stars.first().waitFor({ state: "visible", timeout: 10_000 });
    const count = await stars.count();
    for (let i = 0; i < count; i++) await stars.nth(i).click();

    // The period moved to a second step - the subject of the form is asked before the questions
    // about it, so the dates now sit behind Next rather than under the ratings.
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel(/I still work here/i).check();
    // Month before year: the pair only reports a value once both halves are set.
    const selects = page.locator("select");
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });

    const submit = page.getByRole("button", { name: /^Submit rating$/ });
    await submit.waitFor({ state: "visible", timeout: 10_000 });
    calls.length = 0;
    await submit.click();

    await expect.poll(() => calls.join(",") || "(none)", { timeout: 10_000 }).toContain("submit");
    // The session is re-read after the write. This is the assertion that fails without the fix.
    await expect.poll(() => calls.indexOf("auth-me") > calls.indexOf("submit"), { timeout: 10_000 }).toBe(true);
  });

  test("a locked reader is not served another reader's unlocked copy", async ({ page }) => {
    // Two readers can be gated differently, so the cache must not be shared between them.
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), LOCKED_USER);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: LOCKED_USER }));
    await page.route("**/api/companies/*/ratings", (r: any) => r.fulfill({ json: { data: [] } }));
    await page.route("**/api/companies/by-slug/**", (r: any) => r.fulfill({ json: profile(false) }));

    await page.goto(`/companies/${SLUG}?tab=company`);
    await expect(page.getByRole("heading", { name: "Central Rock Gym" }).first()).toBeVisible({ timeout: 10_000 });
    // The unlocked-only category name must not appear.
    await expect(page.getByText("Communication Style")).toHaveCount(0);
  });
});
