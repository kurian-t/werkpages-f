import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Saying where you worked when the corpus cannot tell us.
 *
 * <h2>The rule</h2>
 *
 * <p>Location is mandatory. Choosing a suggestion is not. A workplace the corpus has never heard
 * of, a query it answers with nothing, or a corpus that is simply unreachable must never be the
 * reason somebody cannot contribute.
 *
 * <h2>Why the old behaviour looked reasonable</h2>
 *
 * <p>"Typed text is search input, a selected suggestion is location data" is a real rule and it
 * still holds: nothing may invent normalized geography out of a string, because that is how
 * "Waterlooo" becomes a confirmed city. But it was written when the field arrived PREPOPULATED
 * with the visitor's inferred geography, so "keep the last valid selection" always had something
 * to keep. Prepopulation was later removed - an IP guess must not be published as fact about a
 * real manager - and the rule was left standing with nothing behind it. Typing an answer the
 * corpus could not match then silently restored the previous value, which on an empty field meant
 * no location at all.
 *
 * <p>So a typed answer is accepted and stored AS TYPED, marked unverified. Accepting it is not the
 * same as corroborating it, and only the second was ever forbidden.
 */

const COMPANY = { id: 1, name: "Acme Corp", slug: "acme-corp" };

/** The add-manager form, with the corpus answering in whatever way the test needs. */
async function openAddManager(page: any, corpus: "empty" | "down" | any[] = "empty") {
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
  await page.route(/\/api\/geo/, (r: any) => r.fulfill({ json: {} }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.route("**/api/companies", (r: any) => r.fulfill({ json: [COMPANY.name] }));
  await page.route("**/api/company-locations/suggest**", (r: any) => {
    if (corpus === "down") return r.fulfill({ status: 503, json: { error: "corpus unavailable" } });
    return r.fulfill({ json: corpus === "empty" ? [] : corpus });
  });
  await page.goto("/add");
}

async function fillStepOne(page: any) {
  await page.locator('input[name="firstName"]').fill("Dana");
  await page.locator('input[name="lastName"]').fill("Okafor");
  await page.locator('input[name="title"]').fill("Operations Lead");
  await page.locator('input[name="company"]').fill(COMPANY.name);
}

/** Types a location and commits it with Done editing, selecting nothing. */
async function typeLocation(page: any, text: string) {
  await page.getByRole("button", { name: /edit location details/i }).click();
  await page.getByPlaceholder(/city, province, or the workplace itself/i).fill(text);
  await page.getByRole("button", { name: /done editing location/i }).click();
}

test.describe("A location the corpus cannot supply", () => {
  test("a typed answer is kept, and the form moves on", async ({ page }) => {
    await openAddManager(page, "empty");
    await fillStepOne(page);

    await typeLocation(page, "Gorsebrook Mill, Antigonish, Nova Scotia");

    // Kept, and shown back exactly as written.
    await expect(page.getByTestId("addboss-location-value"))
      .toContainText("Gorsebrook Mill", { timeout: 10_000 });

    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a corpus OUTAGE does not stop somebody contributing", async ({ page }) => {
    /*
      The suggestion lookup fails outright rather than returning an empty list. To the person
      filling the form these are indistinguishable, and they must behave the same: neither is a
      reason their answer cannot be recorded.
    */
    await openAddManager(page, "down");
    await fillStepOne(page);

    await typeLocation(page, "Ontario, Canada");

    await expect(page.getByTestId("addboss-location-value"))
      .toContainText("Ontario", { timeout: 10_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2/i)).toBeVisible({ timeout: 10_000 });
  });

  test("being only as specific as you know is enough", async ({ page }) => {
    // Country alone is a legitimate final answer; the ladder is about precision, not completeness.
    await openAddManager(page, "empty");
    await fillStepOne(page);

    await typeLocation(page, "Canada");

    await expect(page.getByTestId("addboss-location-value")).toContainText("Canada", { timeout: 10_000 });
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText(/step 2/i)).toBeVisible({ timeout: 10_000 });
  });

  test("no location at all is still refused", async ({ page }) => {
    await openAddManager(page, "empty");
    await fillStepOne(page);

    /*
      The form gates by DISABLING Next rather than by letting the click through and complaining
      afterwards, so that is what is asserted. Clicking a disabled button proves nothing.
    */
    await expect(page.getByRole("button", { name: /^next$/i })).toBeDisabled();

    // And the gate opens on an answer, including one the corpus never offered.
    await typeLocation(page, "Canada");
    await expect(page.getByRole("button", { name: /^next$/i })).toBeEnabled({ timeout: 10_000 });
  });

  test("a suggestion, when there is one, is still preferred over the raw text", async ({ page }) => {
    // The autocomplete is unchanged: picking a place still yields structured, corroborated data.
    await openAddManager(page, [
      { kind: "geo", label: "Toronto, Ontario, Canada", precision: "city",
        country: "Canada", state: "Ontario", city: "Toronto" },
    ]);
    await fillStepOne(page);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByPlaceholder(/city, province, or the workplace itself/i).fill("Toronto");
    await page.getByText("Toronto, Ontario, Canada").first().click();

    await expect(page.getByTestId("addboss-location-value"))
      .toContainText("Toronto", { timeout: 10_000 });
  });
});
