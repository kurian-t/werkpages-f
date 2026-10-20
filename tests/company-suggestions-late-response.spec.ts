import { test, expect } from "./base";
import { MOCK_USER } from "./fixtures";

/**
 * A company search that comes back after the person has moved on must not open its list.
 *
 * <h2>What went wrong</h2>
 *
 * <p>The suggestion request is debounced by 300ms and the list opens when it resolves. That open
 * was unconditional, so if the response landed after focus had already left the company field, a
 * list appeared over whatever the person had moved to. The list is portalled, so it then floated
 * there until something dismissed it, and moving between fields dismisses nothing.
 *
 * <p>It became reachable when the list was changed to open for the "Not listed? Add ..." row as
 * well as for real results. Before that, a company with no suggestions opened nothing, so a late
 * response was harmless.
 *
 * <h2>What it looked like</h2>
 *
 * <p>Two open listboxes at once on the add-manager form, captured from a failing run:
 *
 * <pre>
 *   combobox "Location" [expanded] [active]: London
 *   listbox: London, Ontario, Canada / London, England, United Kingdom
 *   listbox: "+ Not listed? Add Acme Corp"        &lt;- the company's, over the location's
 * </pre>
 *
 * <p>At phone width the company list covered the location suggestions and swallowed the click.
 * Playwright reported the location option as visible, enabled and stable and retried the click for
 * thirty seconds while a sibling {@code <li role="option">} intercepted every attempt.
 *
 * <h2>Why it needed forcing</h2>
 *
 * <p>Three tests in {@code location-cross-country.spec.ts} caught this, and only in a full loaded
 * run: 9 of 48 failed under {@code --repeat-each=6 --workers=8}, and all 8 passed in isolation.
 * The fault needs the company response to arrive after focus has left, which on an idle machine it
 * never does. So the delay here is explicit, which is the difference between a regression test and
 * a coin toss.
 */

const COMPANY = { id: 1, name: "Acme Corp", slug: "acme-corp" };

const WORLD = [
  { kind: "geo", label: "Toronto, Ontario, Canada", country: "Canada",
    state: "Ontario", city: "Toronto", precision: "city" },
];

// Phone width, where the two lists overlap. The stale list is wrong at any width; this is where it
// costs somebody the click.
test.use({ viewport: { width: 390, height: 844 } });

test.describe("a late company response", () => {

  test("does not open a list over the field the person moved to", async ({ page }) => {
    await page.route("**/api/auth/me", (r) => r.fulfill({ json: MOCK_USER }));
    await page.route(/\/api\/geo/, (r) => r.fulfill({ json: { country: "Canada" } }));
    await page.route("**/api/companies", (r) => r.fulfill({ json: [COMPANY.name] }));
    await page.route("**/api/company-locations/suggest**", (r) => {
      const q = (new URL(r.request().url()).searchParams.get("q") ?? "").toLowerCase();
      return r.fulfill({ json: WORLD.filter((s) => s.label.toLowerCase().includes(q)) });
    });

    /*
      Late, and empty. Empty is what makes the create row the whole content of the list, and late
      is what makes it arrive after focus has gone. Both are needed, and both are what happens by
      accident on a busy machine.
    */
    await page.route("**/api/companies/suggest**", async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await r.fulfill({ json: [] });
    });

    await page.goto("/add");
    await page.locator('input[name="firstName"]').fill("Dana");
    await page.locator('input[name="lastName"]').fill("Okafor");
    await page.locator('input[name="title"]').fill("Operations Lead");
    await page.locator('input[name="company"]').fill(COMPANY.name);

    // Straight on to the location field, without waiting for the company search.
    const edit = page.getByRole("button", { name: /edit location details/i });
    if (await edit.count()) await edit.click();
    const location = page.getByPlaceholder(/city, province, or the workplace itself/i);
    await location.fill("Toronto");

    const option = page.getByText(/Toronto, Ontario, Canada/).first();
    await expect(option).toBeVisible({ timeout: 10_000 });

    // Long enough for the held company response to land and, before the fix, to open its list.
    await page.waitForTimeout(2_500);

    expect(await page.locator('[role="listbox"]').count()).toBe(1);
    await expect(page.getByText(/not listed/i)).toHaveCount(0);

    // The symptom itself: the location suggestion is still selectable.
    await option.click({ timeout: 8_000 });
    await expect(page.getByText(/Toronto, Ontario/).first()).toBeVisible();
  });
});
