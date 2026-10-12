import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * The location on the workplace-rating form is required.
 *
 * <h2>Why this was invisible</h2>
 *
 * The field has carried a required asterisk the whole time, and the form never enforced it:
 * {@code validateCompanyRating} checks the overall, all ten categories and both dates, and cannot
 * see the location at all - the location is separate state, not part of the draft it validates.
 *
 * It stayed unnoticed because the field is PREFILLED from the reader's IP geography. In ordinary
 * use it is never empty, so nothing is ever blocked and the asterisk appears to be honoured. It is
 * only empty when geo resolves nothing - a VPN, a datacentre address, a failed request - and those
 * ratings went in with no location while the form still displayed a required marker.
 *
 * That is the worst version of a validation gap: a promise on screen, no enforcement behind it, and
 * a trigger that a developer testing from a normal connection will never hit.
 *
 * <h2>What is asserted</h2>
 *
 * Geo is stubbed to return nothing, which is the only state in which the field starts empty. Then
 * the step must refuse to advance and say why. The prefill itself is asserted separately, because
 * enforcing the field must not come at the cost of making everybody type their own city.
 */

const COMPANY = {
  id: 1, name: "Red Hat", slug: "red-hat", industry: "Software", industrySlug: "software",
  managerCount: 3, totalReviews: 9, avgRating: 4.0, managers: [],
  categoryAverages: {}, companyRating: null,
};

/** The form, with geo answering NOTHING so the location field starts genuinely empty. */
async function openFormWithoutGeo(page: any, suggestions: any[] = []) {
  const user = { ...MOCK_USER, hasContributed: true };
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
  // No country: orUserGeo leaves the field alone, which is the empty case this spec is about.
  await page.route(/\/api\/geo/, (r: any) => r.fulfill({ json: {} }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.route("**/api/company-locations/suggest**", (r: any) => r.fulfill({ json: suggestions }));
  await page.route("**/api/companies/*/rating", (r: any) => {
    if (r.request().method() === "POST") return r.fallback();
    return r.fulfill({ json: { review: null } });
  });
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));

  await page.goto("/companies/red-hat/rate");
  await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
  // On to step 2, which holds the location and the dates.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });
}

/** Fills the working period, so the only thing left missing is the location. */
async function fillDates(page: any) {
  await page.getByLabel("From month").selectOption("03");
  await page.getByLabel("From year").selectOption({ index: 3 });
  await page.getByRole("checkbox", { name: /current/i }).check();
}

test.describe("The workplace rating asks for a location, and means it", () => {
  test("the field is marked required", async ({ page }) => {
    // The control. The asterisk is already there; this stops it being removed as "unused".
    await openFormWithoutGeo(page);

    /*
      The heading text, not "Location": this field asks its question as a section heading on this
      form - "Where did you work?", matched in size to "When did you work here?" beside it. The
      shared component still says "Location" wherever it is used as an ordinary field label.
    */
    const label = page.locator('label[for="rating-location"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText("Where did you work?");
    await expect(label).toContainText("*");
  });

  test("the step will not advance without a location", async ({ page }) => {
    /*
      The bug. Dates complete, location empty, and the form let the person straight through to the
      ratings step and on to submission.
    */
    await openFormWithoutGeo(page);
    await expect(page.getByTestId("rating-location-value")).toHaveText(/no location set/i);

    await fillDates(page);
    await page.getByRole("button", { name: "Next" }).click();

    // Still on the dates step, and told why.
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
    await expect(page.getByLabel("From month")).toBeVisible();
    await expect(page.getByText(/where.*(work|location)|location is required|add a location/i).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("with a location chosen, the step advances", async ({ page }) => {
    // The other half: enforcement must not block somebody who HAS answered.
    await openFormWithoutGeo(page, [
      { kind: "corpus", label: "Toronto, Ontario, Canada", precision: "city",
        country: "Canada", state: "Ontario", city: "Toronto" },
    ]);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByPlaceholder("City, province, or the workplace itself").fill("Toronto");
    await page.getByText("Toronto, Ontario, Canada").first().click();
    await expect(page.getByTestId("rating-location-value")).toContainText("Toronto", { timeout: 10_000 });

    await fillDates(page);
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText(/Step 3 of 3/)).toBeVisible({ timeout: 10_000 });
  });

  test("a resolvable IP location does NOT fill the field", async ({ page }) => {
    /*
      The decision this spec exists to hold: the person states where they worked, and an IP address
      never speaks for them.

      It used to prefill the full city-level guess from Cloudflare's headers, on the reasoning that
      a value somebody can see and submit unchanged counts as declared. Rejected, because an IP says
      where the browser is tonight and most people accept whatever a form has already filled in - so
      "Kitchener" because a datacentre is in Kitchener was indistinguishable from a real answer.

      Geo here resolves cleanly to Kitchener. The field must still be empty, and the step must still
      refuse to advance.
    */
    const user = { ...MOCK_USER, hasContributed: true };
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)), user);
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: user }));
    await page.route(/\/api\/geo/, (r: any) =>
      r.fulfill({ json: { country: "Canada", state: "Ontario", city: "Kitchener" } }));
    await page.route("**/api/company-locations/suggest**", (r: any) => r.fulfill({ json: [] }));
    await page.route("**/api/companies/*/rating", (r: any) => {
      if (r.request().method() === "POST") return r.fallback();
      return r.fulfill({ json: { review: null } });
    });
    await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: COMPANY }));

    await page.goto("/companies/red-hat/rate");
    await expect(page.getByText(/Step 1 of 3/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByLabel("From month")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("rating-location-value")).toHaveText(/no location set/i);
    await expect(page.getByTestId("rating-location-value")).not.toContainText("Kitchener");

    await fillDates(page);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();
  });
});
