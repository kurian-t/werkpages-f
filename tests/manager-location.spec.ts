import { test, expect } from "./base";
import { mockAddBossPage } from "./fixtures";

/**
 * Where the work happened — one field, however specific the person happens to be.
 *
 * The company is already chosen by the time this control is used, so the question is never "search
 * the map". It is "which of this company's places did you mean", and that is one question. Country,
 * province and city as separate controls would make somebody navigate our storage schema to say
 * "the Walmart on Ottawa Street".
 *
 * Two rules these tests exist to hold:
 *
 *   - a visible value submitted unchanged is a confirmed value, and may be published;
 *   - typed text is search input, a selected suggestion is location data, and nothing typed is ever
 *     parsed into geography.
 */

async function openForm(page: any, suggestions?: any[]) {
  await mockAddBossPage(page);
  if (suggestions) await mockSuggestions(page, suggestions);
  await page.goto("/add");
  await page.locator('input[name="firstName"]').fill("Jordan");
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="title"]').fill("Engineering Manager");
  await page.locator('input[name="company"]').fill("Acme Corp");
  // The company autocomplete leaves its own listbox open, and its options would otherwise be what
  // a role="option" query finds.
  await page.keyboard.press("Escape");
}

async function mockSuggestions(page: any, items: any[]) {
  await page.route(/\/api\/company-locations\/suggest/, (route: any) => route.fulfill({ json: items }));
}

const WALMART_BRANCH = {
  kind: "place",
  label: "Walmart Supercentre",
  detail: "1005 Ottawa St N · Kitchener, ON",
  country: "Canada", state: "Ontario", city: "Kitchener",
  precision: "exact", companyLocationId: 382,
};

const WATERLOO = {
  kind: "geo",
  label: "Waterloo, Ontario, Canada",
  country: "Canada", state: "Ontario", city: "Waterloo",
  precision: "city",
};

/**
 * A building offered from the search corpus rather than from our own database.
 *
 * Note what it does NOT have: a companyLocationId. The corpus is map data in S3, so this place has
 * no row yet — it only becomes one if somebody actually picks it. The whole place travels back on
 * submit so the server can promote it.
 */
const CORPUS_BRANCH = {
  kind: "place",
  label: "Walmart",
  detail: "1400 Ottawa St S · Kitchener, ON",
  country: "Canada", city: "Kitchener",
  precision: "exact",
  corpusPlace: {
    sourcePlaceId: "cc3d9060-4200-49da-abf6-8db4334cc1ce",
    name: "Walmart",
    brandName: "Walmart",
    street: "1400 Ottawa St S",
    city: "Kitchener",
    stateCode: "ON",
    countryCode: "CA",
    postalCode: "N2E 4E2",
  },
};

test.describe("The location control", () => {
  test("starts empty, and offers to be filled in", async ({ page }) => {
    /*
      It used to open holding the visitor's own geography, read from their IP.

      That was removed deliberately: the guess is often wrong, and a wrong city attached to a
      named person at a named company is identifying in a way nobody agreed to. An unanswered
      question is better than a confidently wrong answer, so the field starts blank and the
      person says where they worked.
    */
    await openForm(page);

    await expect(page.getByText("San Francisco, California, United States")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /edit location details/i })).toBeVisible();
  });

  test("no separate country, province or city controls are rendered", async ({ page }) => {
    // The storage is normalized; the form is not. Nobody should have to understand our hierarchy
    // to say where they worked.
    await openForm(page);

    await expect(page.getByLabel("Province / State")).toHaveCount(0);
    await expect(page.getByLabel("City")).toHaveCount(0);
  });

  test("nothing is attached to the form that the person did not type", async ({ page }) => {
    /*
      The rule this protects is unchanged; the way it is satisfied has moved.

      A value somebody can see, change and send unchanged was treated as a declaration, which is
      why the IP guess was allowed to prefill the visible field. It turned out people submit what
      is already there without reading it, so the guess was being published as though somebody
      had confirmed it. Now nothing is offered at all, and the only location the form can send is
      one that was chosen from the suggestion list.
    */
    await openForm(page);

    await expect(page.getByText("San Francisco, California, United States")).toHaveCount(0);
    await expect(page.getByText(/California/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /edit location details/i })).toBeEnabled();
  });

  test("editing opens one free-form field, empty and ready to type into", async ({ page }) => {
    // One field, not a country/province/city hierarchy - and, now, one that starts blank rather
    // than holding a guess the person would have to notice in order to correct.
    await openForm(page);

    await page.getByRole("button", { name: /edit location details/i }).click();

    await expect(page.getByLabel("Location *")).toHaveValue("");
    // Named for its field: several fields on this form collapse, so "Done editing" alone is
    // ambiguous both to a screen reader and to a locator.
    await expect(page.getByRole("button", { name: /done editing location/i })).toBeVisible();
  });
});

test.describe("Choosing a place", () => {
  test("an exact workplace collapses to its address", async ({ page }) => {
    await openForm(page, [WALMART_BRANCH]);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Walmart Kit");
    await page.getByRole("option", { name: /Walmart Supercentre/ }).click();

    await expect(page.getByText("1005 Ottawa St N · Kitchener, ON")).toBeVisible();
  });

  test("a coarse place is a complete answer on its own", async ({ page }) => {
    // Nobody is made to pick a street address to file a rating. Somebody who only knows the city
    // should be able to say exactly that and stop.
    await openForm(page, [WATERLOO]);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Waterloo");
    await page.getByRole("option", { name: /Waterloo, Ontario, Canada/ }).click();

    await expect(page.getByText("Waterloo, Ontario, Canada")).toBeVisible();
  });

  test("both kinds are offered together", async ({ page }) => {
    // A building for somebody who knows the branch, geography for everybody else - in one list,
    // because both are valid answers to the same question.
    await openForm(page, [WATERLOO, WALMART_BRANCH]);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Water");

    // Scoped to this control's own listbox: the company autocomplete has options of its own.
    const listbox = page.locator("#addboss-location-suggestions");
    await expect(listbox.getByRole("option")).toHaveCount(2);
    await expect(listbox.getByText(/use this general location/i)).toBeVisible();
    await expect(listbox.getByText("1005 Ottawa St N · Kitchener, ON")).toBeVisible();
  });

  test("typing alone never becomes a location", async ({ page }) => {
    /*
      Typed text is search input. Parsing arbitrary text into normalized geography is how a
      directory fills up with places that do not exist, so a query matching nothing leaves the
      previous answer standing.
    */
    await openForm(page, []);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Waterlooo");
    await page.getByRole("button", { name: /done editing location/i }).click();

    // Nothing matched, so nothing was chosen, so there is still no location - and specifically
    // the typed text has NOT been turned into one.
    await expect(page.getByText("Waterlooo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /edit location details/i })).toBeVisible();
  });
});

test.describe("What reaches the server", () => {
  /** The early ghost capture is the first request the form makes, once step 1 is valid. */
  async function captureGhostBody(page: any) {
    const seen: any = { body: null };
    await page.route(/\/api\/managers\/ghost/, (route: any) => {
      seen.body = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 1, created: true, published: true } });
    });
    return seen;
  }

  test("a form nobody gave a location to sends none", async ({ page }) => {
    /*
      This asserted the opposite: that an untouched form declared the IP-derived location it had
      prefilled. That was the bug. The early ghost capture fires as soon as step 1 is valid, so
      the guess was reaching the server - and being published - before the person had even seen
      step 2, let alone agreed to it.

      The declared keys are the only ones the backend publishes, so the assertion that matters is
      that they are absent until somebody picks a place.
    */
    await mockAddBossPage(page);
    const seen = await captureGhostBody(page);
    await page.goto("/add");

    await page.locator('input[name="firstName"]').fill("Jordan");
    await page.locator('input[name="lastName"]').fill("Smith");
    await page.locator('input[name="title"]').fill("Engineering Manager");
    await page.locator('input[name="company"]').fill("Acme Corp");

    await expect(async () => expect(seen.body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(seen.body.declaredCountry).toBeFalsy();
    expect(seen.body.declaredState).toBeFalsy();
    expect(seen.body.declaredCity).toBeFalsy();
    expect(seen.body.declaredPrecision).toBeFalsy();
  });

  test("an exact pick sends the workplace id and no coarse values", async ({ page }) => {
    /*
      The building already knows where it is. Sending a city alongside would let a form that had
      drifted publish a place the address is not in, so the server derives the coarse values from
      the location row instead.
    */
    await mockAddBossPage(page);
    await mockSuggestions(page, [WALMART_BRANCH]);
    const seen = await captureGhostBody(page);
    await page.goto("/add");

    await page.locator('input[name="firstName"]').fill("Jordan");
    await page.locator('input[name="lastName"]').fill("Smith");
    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Walmart Kit");
    await page.getByRole("option", { name: /Walmart Supercentre/ }).click();
    await page.locator('input[name="title"]').fill("Engineering Manager");
    await page.locator('input[name="company"]').fill("Acme Corp");
    await page.keyboard.press("Escape");

    await expect(async () => expect(seen.body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(seen.body.declaredPrecision).toBe("exact");
    expect(seen.body.companyLocationId).toBe(382);
    expect(seen.body.declaredCity).toBeUndefined();
  });

  test("a corpus pick sends the whole place, because it has no id yet", async ({ page }) => {
    /*
      A building offered from the corpus is not in our database. Sending an id would mean creating
      a row for every place somebody scrolled past; instead the place travels back on submit and
      the server promotes only what was actually chosen.
    */
    await mockAddBossPage(page);
    await mockSuggestions(page, [CORPUS_BRANCH]);
    const seen = await captureGhostBody(page);
    await page.goto("/add");

    await page.locator('input[name="firstName"]').fill("Riley");
    await page.locator('input[name="lastName"]').fill("Chen");
    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel("Location *").fill("Walmart Kit");
    await page.getByRole("option", { name: /Walmart/ }).first().click();
    await page.locator('input[name="title"]').fill("Store Manager");
    await page.locator('input[name="company"]').fill("Walmart");
    await page.keyboard.press("Escape");

    await expect(async () => expect(seen.body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(seen.body.declaredPrecision).toBe("exact");
    expect(seen.body.companyLocationId).toBeUndefined();
    expect(seen.body.corpusPlace).toBeTruthy();
    expect(seen.body.corpusPlace.sourcePlaceId).toBe("cc3d9060-4200-49da-abf6-8db4334cc1ce");
    expect(seen.body.corpusPlace.street).toBe("1400 Ottawa St S");
    // Coarse values are still omitted: the building knows where it is, and the server derives them
    // from the promoted row rather than trusting a form that may have drifted.
    expect(seen.body.declaredCity).toBeUndefined();
  });
});

/**
 * GeoNames is CC BY 4.0, which obliges attribution wherever the data is surfaced.
 *
 * <p>It was surfaced in production with no credit at all: the location picker has always offered
 * GeoNames rows and neither product named the source anywhere. Attribution-only is the easiest
 * licence in the corpus to comply with and it was the one being missed.
 *
 * <p>Asserted in the suggestion list rather than the page footer, because that is where the data
 * appears. A test on a footer would keep passing if the credit and the data ever parted company.
 */
test.describe("Crediting the location data", () => {
  test("the suggestion list names GeoNames and Overture", async ({ page }) => {
    await openForm(page, [WATERLOO]);

    await page.getByRole("button", { name: /edit location details/i }).click();
    await page.getByLabel(/^Location \*/).fill("Waterloo");
    await expect(page.getByRole("option", { name: /Waterloo, Ontario, Canada/ })).toBeVisible();

    const listbox = page.locator("#addboss-location-suggestions").locator("..");
    await expect(listbox.getByRole("link", { name: /GeoNames/i })).toBeVisible();
    await expect(listbox.getByRole("link", { name: /CC BY 4\.0/i })).toBeVisible();
    await expect(listbox.getByRole("link", { name: /Overture/i })).toBeVisible();
  });
});
