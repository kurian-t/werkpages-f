import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Changing which company a workplace rating is about, mid-form.
 *
 * <h2>The bug</h2>
 *
 * Open "edit my rating of Shopify", change the company to Discord, press Next, and the dates were
 * Shopify's - along with the stars and the hide-dates box.
 *
 * <h2>Why the obvious fix did not work</h2>
 *
 * Picking a suggestion only navigates when it carries a slug, and this picker is backed by
 * Clearbit: it answers <code>{name, domain}</code> for companies that mostly have no row here, so
 * a pick almost never has one. {@code companySlug} therefore stays on the company the page opened
 * with, and a reset keyed on the slug never fires.
 *
 * A reset keyed on the field alone is not enough either. {@code mine} is fetched for the URL's
 * company, so clearing the form for Discord and then letting the existing-rating effect run
 * re-applied Shopify's answers on top of it. The subject of the form has to gate that effect, not
 * just trigger a clear.
 *
 * <h2>The fixture matters here</h2>
 *
 * The first version of this spec mocked suggestions WITH a slug. Picking one navigated, the reset
 * fired, and the test passed against code that was still broken in the browser. The mock below is
 * shaped like the real endpoint on purpose.
 */

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 3, totalReviews: 9, avgRating: 4.0, managers: [],
  categoryAverages: {}, companyRating: null,
};

const RED_HAT_RATING = {
  id: "r1", overallRating: 3, ratings: {},
  workedFrom: "2019-03-01", workedUntil: "2021-07-01", author: "CoolLynx30",
  datesHidden: true,
};

async function openForm(page: any) {
  const user = { ...MOCK_USER, hasContributed: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  await page.route(/\/api\/geo/, (r: any) =>
    r.fulfill({ json: { country: "United States", state: "California", city: "San Francisco" } }));
  /*
    Answers for the company actually asked for, rather than returning Red Hat for every slug.

    Returning one company for all of them is why the redirect assertion below failed while the app
    was behaving correctly: landing on /companies/canonical loaded a payload that said it was Red
    Hat, so the profile's canonical redirect moved the URL to Red Hat's address. The fixture, not
    the code, produced the wrong final URL.
  */
  await page.route("**/api/companies/**", (r: any) => {
    const slug = r.request().url().match(/\/api\/companies\/(?:by-slug\/)?([^/?]+)/)?.[1] ?? "red-hat";
    if (slug === "red-hat") return r.fulfill({ json: COMPANY });
    const name = slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    return r.fulfill({ json: { ...COMPANY, id: 2, name, slug } });
  });
  /*
    Shaped like the REAL endpoint: it proxies Clearbit and answers {name, domain}, with no id and
    no slug. A fixture kinder than production is what let this ship twice.
  */
  await page.route("**/api/companies/suggest**", (r: any) =>
    r.fulfill({ json: [{ name: "Canonical", domain: "canonical.com" }] }));
  // After the catch-all, so it wins. Only Red Hat has a rating.
  await page.route("**/api/companies/*/rating", (r: any) => {
    if (r.request().method() === "POST") return r.fallback();
    const slug = r.request().url().match(/companies\/([^/]+)\/rating/)?.[1] ?? "";
    return r.fulfill({ json: { review: slug === "red-hat" ? RED_HAT_RATING : null } });
  });

  await page.goto("/companies/red-hat/rate");
  await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
}

/** Swaps the company in the field to one the directory does not hold. */
async function changeCompanyTo(page: any, name: string) {
  await page.getByRole("button", { name: /edit company details/i }).click();
  await page.getByPlaceholder("e.g. Acme Corp").fill(name.slice(0, 5));
  await page.getByText(name).first().click();
  /*
    Asserted deliberately: a Clearbit suggestion has no slug, so there is nothing to navigate to
    and the URL keeps naming the company the page opened with. The form must change subject anyway.
  */
  await expect(page).toHaveURL(/\/companies\/red-hat\/rate/);
  await page.getByRole("button", { name: /done editing company/i }).click();
}

async function openDatesStep(page: any) {
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
}

test.describe("Changing the company a rating is about", () => {
  test("the loaded rating really is there to begin with", async ({ page }) => {
    // The control. Without this, every assertion below could pass on a form that never loaded.
    await openForm(page);
    await openDatesStep(page);

    await expect(page.getByLabel("From year")).toHaveValue("2019");
    await expect(page.getByRole("checkbox", { name: /hide/i })).toBeChecked();
  });

  test("clears the dates when the company changes", async ({ page }) => {
    await openForm(page);
    await openDatesStep(page);
    await expect(page.getByLabel("From year")).toHaveValue("2019");
    await page.getByRole("button", { name: "Back" }).click();

    await changeCompanyTo(page, "Canonical");
    await openDatesStep(page);

    await expect(page.getByLabel("From month")).toHaveValue("");
    await expect(page.getByLabel("From year")).toHaveValue("");
    await expect(page.getByLabel("Until month")).toHaveValue("");
    await expect(page.getByLabel("Until year")).toHaveValue("");
  });

  test("clears the hide-dates choice when the company changes", async ({ page }) => {
    /*
      Reported alongside the dates. It is a privacy decision about one company's rating, so
      carrying it onto a different company's is making a choice on somebody's behalf.
    */
    await openForm(page);
    await changeCompanyTo(page, "Canonical");
    await openDatesStep(page);

    await expect(page.getByRole("checkbox", { name: /hide/i })).not.toBeChecked();
  });

  test("clears the star ratings when the company changes", async ({ page }) => {
    // Reported alongside the dates: the stars are the rating itself.
    await openForm(page);
    await changeCompanyTo(page, "Canonical");

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await page.getByRole("button", { name: "Next" }).click();

    // Nothing pre-filled: no category carries the previous company's score.
    await expect(page.getByRole("button", { name: /: [1-5] stars$/ }).first()).toBeVisible();
    await expect(page.locator("svg.fill-amber-400")).toHaveCount(0);
  });

  test("submitting for a changed company lands on THAT company, not the one posted to", async ({ page }) => {
    /*
      Regression. The server files the rating against the company the author NAMED, but this page
      posts to the slug it opened with - so the two differ exactly when somebody changed the
      company. Returning them to the posted slug sent them to the previous company's page, where
      the rating they had just written is nowhere to be seen. For a company this submission had
      only just created, that read as the rating vanishing.

      The server now answers with the company it landed on, and the client follows it.
    */
    await openForm(page);
    await changeCompanyTo(page, "Canonical");

    await page.route("**/api/companies/*/rating", (r: any) => {
      if (r.request().method() !== "POST") return r.fallback();
      // Shaped like the real response: the company it was FILED against, not the one posted to.
      return r.fulfill({ json: { id: "new", companySlug: "canonical", companyName: "Canonical" } });
    });

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("From month").selectOption("03");
    await page.getByLabel("From year").selectOption({ index: 3 });
    await page.getByRole("checkbox", { name: /current/i }).check();
    await page.getByRole("button", { name: "Next" }).click();

    const stars = page.getByRole("button", { name: /: 4 stars$/ });
    const n = await stars.count();
    for (let i = 0; i < n; i++) await stars.nth(i).click();
    await page.locator('input[name="attestation"]').check();
    await page.getByRole("button", { name: /submit rating|update rating/i }).click();

    await expect(page).toHaveURL(/\/companies\/canonical\?tab=company$/, { timeout: 10_000 });
  });

  test("the subject follows the field, so a stale URL does not re-seed the form", async ({ page }) => {
    /*
      The second half of the fix. `mine` is still fetched for red-hat because the URL still says
      red-hat, so the existing-rating effect has to be gated on the subject - otherwise it reloads
      Shopify's answers over the form that was just cleared for Discord.

      Asserted by going forward and back, which is what re-runs that effect.
    */
    await openForm(page);
    await changeCompanyTo(page, "Canonical");
    await openDatesStep(page);
    await page.getByRole("button", { name: "Back" }).click();
    await openDatesStep(page);

    await expect(page.getByLabel("From year")).toHaveValue("");
  });
});
