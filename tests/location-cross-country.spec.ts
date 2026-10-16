import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * Replacing a location with one in a DIFFERENT country.
 *
 * <h2>The invariant</h2>
 *
 * <p><b>An existing location must never prevent somebody searching for or selecting a different
 * one.</b> It sounds obvious. It was broken three times, in three different ways, because the
 * country of the value being edited was sent as a hard filter on the search for its replacement -
 * and a filter like that makes itself permanent.
 *
 * <h2>What it looked like</h2>
 *
 * <p>With a saved location in Canada: typing "United Kingdom" offered a freight company in
 * Montreal and no country at all; typing "London, England" offered England in ARKANSAS. Both are
 * what a worldwide corpus returns once you have already excluded the world.
 *
 * <p>Two earlier fixes were conditional - widen if nothing came back, then widen if no GEOGRAPHY
 * came back - and each condition was satisfied by an irrelevant result: a pub called "Lord
 * Kitchener" the first time, England, Arkansas the second.
 *
 * <h2>Why this is a browser test</h2>
 *
 * <p>The API was never the problem and answered all of these correctly when called directly. The
 * fault was entirely in how the component used the country, which only the real interaction shows.
 */

const COMPANY = { id: 1, name: "Acme Corp", slug: "acme-corp" };

/** Everything the corpus knows, worldwide. The server does not filter it; the component must not. */
const WORLD = [
  { kind: "geo", label: "London, Ontario, Canada", country: "Canada",
    state: "Ontario", city: "London", precision: "city" },
  { kind: "geo", label: "Toronto, Ontario, Canada", country: "Canada",
    state: "Ontario", city: "Toronto", precision: "city" },
  { kind: "geo", label: "United Kingdom", country: "United Kingdom", precision: "country" },
  { kind: "geo", label: "London, England, United Kingdom", country: "United Kingdom",
    state: "England", city: "London", precision: "city" },
  { kind: "geo", label: "Paris, Île-de-France, France", country: "France",
    state: "Île-de-France", city: "Paris", precision: "city" },
];

/** Every suggest URL the component asked for, so the filter can be asserted on directly. */
function recordSuggestCalls(page: any) {
  const urls: string[] = [];
  page.route("**/api/company-locations/suggest**", (r: any) => {
    const url = r.request().url();
    urls.push(url);
    const q = (new URL(url).searchParams.get("q") ?? "").toLowerCase();
    // Mimic the server: match the whole query against the label, worldwide.
    return r.fulfill({ json: WORLD.filter((s) => s.label.toLowerCase().includes(q.split(",")[0].trim())) });
  });
  return urls;
}

async function openAddManager(page: any) {
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
  await page.route(/\/api\/geo/, (r: any) => r.fulfill({ json: { country: "Canada" } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.route("**/api/companies", (r: any) => r.fulfill({ json: [COMPANY.name] }));
  const urls = recordSuggestCalls(page);
  await page.goto("/add");
  await page.locator('input[name="firstName"]').fill("Dana");
  await page.locator('input[name="lastName"]').fill("Okafor");
  await page.locator('input[name="title"]').fill("Operations Lead");
  await page.locator('input[name="company"]').fill(COMPANY.name);
  return urls;
}

async function openLocationEditor(page: any) {
  const edit = page.getByRole("button", { name: /edit location details/i });
  if (await edit.count()) await edit.click();
}

async function searchLocation(page: any, text: string) {
  await openLocationEditor(page);
  const input = page.getByPlaceholder(/city, province, or the workplace itself/i);
  await input.fill(text);
  return input;
}

/** Types a query and picks the suggestion whose label matches. */
async function selectLocation(page: any, text: string, label: RegExp) {
  await searchLocation(page, text);
  const option = page.getByText(label).first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

test.describe("an existing location never blocks a different one", () => {

  test("the search is never constrained by the country being edited", async ({ page }) => {
    /*
      THE ROOT CAUSE, ASSERTED DIRECTLY.

      Every other failure in this file is a symptom of the request carrying the current country.
      If this assertion holds, none of them can come back - and it holds for every surface,
      because they all mount the same component.
    */
    const urls = await openAddManager(page);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await searchLocation(page, "United Kingdom");
    await expect.poll(() => urls.length, { timeout: 10_000 }).toBeGreaterThan(1);

    for (const url of urls) {
      const params = new URL(url).searchParams;
      expect(params.get("country"), `country must not filter: ${url}`).toBeNull();
      expect(params.get("state"), `state must not filter: ${url}`).toBeNull();
    }
  });

  test("Canada to United Kingdom", async ({ page }) => {
    await openAddManager(page);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await selectLocation(page, "United Kingdom", /^United Kingdom$/);
    await expect(page.getByText(/United Kingdom/).first()).toBeVisible();
  });

  test("Canada to London, England", async ({ page }) => {
    // The case that returned England, ARKANSAS: one irrelevant geo row convinced the old code
    // that the narrow search had succeeded.
    await openAddManager(page);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await selectLocation(page, "London, England", /London, England, United Kingdom/);
    await expect(page.getByText(/London, England/).first()).toBeVisible();
  });

  test("United Kingdom back to Toronto, Ontario", async ({ page }) => {
    // The reverse direction matters just as much: a saved UK location must not trap somebody
    // in the UK.
    await openAddManager(page);
    await selectLocation(page, "United Kingdom", /^United Kingdom$/);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await expect(page.getByText(/Toronto, Ontario/).first()).toBeVisible();
  });

  test("a city in one country to a city in another", async ({ page }) => {
    await openAddManager(page);
    await selectLocation(page, "London", /London, Ontario, Canada/);
    await selectLocation(page, "Paris", /Paris, Île-de-France, France/);
    await expect(page.getByText(/Paris/).first()).toBeVisible();
  });

  test("a populated location down to a country only", async ({ page }) => {
    // Coarsening is a legitimate edit: somebody who no longer wants to name the city.
    await openAddManager(page);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await selectLocation(page, "United Kingdom", /^United Kingdom$/);
    await expect(page.getByText(/Toronto/)).toHaveCount(0);
  });

  test("an empty location to any country", async ({ page }) => {
    await openAddManager(page);
    await selectLocation(page, "Paris", /Paris, Île-de-France, France/);
    await expect(page.getByText(/Paris/).first()).toBeVisible();
  });

  test("the current country is preferred but never exclusive", async ({ page }) => {
    /*
      The soft preference replacing the old filter: with Canada already chosen, "London" still
      offers BOTH Londons, with the Canadian one first. Ranking may reorder the list; it may not
      remove anything from it.
    */
    await openAddManager(page);
    await selectLocation(page, "Toronto", /Toronto, Ontario, Canada/);
    await searchLocation(page, "London");
    await expect(page.getByText(/London, Ontario, Canada/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/London, England, United Kingdom/)).toBeVisible();
  });
});
