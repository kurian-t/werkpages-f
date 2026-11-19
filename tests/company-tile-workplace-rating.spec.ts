import { test, expect } from "./base";
import { MOCK_USER, TEST_COMPANY_SLUG } from "./fixtures";

/**
 * The workplace score on a company tile, which is not the managers' score.
 *
 * A single average beside a company name reads as a verdict on the company. It is not one: it is
 * the mean of the managers somebody rated there, and it says nothing about what working there is
 * like, which is rated separately and is routinely a different number. A tile that shows one
 * figure is answering a question the reader did not ask.
 *
 * So each dataset names its population and carries its own sample size, and a dataset nobody has
 * contributed to shows a dash rather than borrowing the other one's number.
 *
 * The figures come from company_stats_live, the projection the database maintains through the
 * triggers V89 installed, with the workplace columns V79 added. Nothing in either client or
 * either service recomputes them, and this is the test that would fail if somebody started.
 */

const LISTING = [
  {
    name: "Acme Corp",
    slug: TEST_COMPANY_SLUG,
    managerCount: 3,
    totalReviews: 15,
    avgRating: 4.1,
    workplaceRating: 2.4,
    workplaceCount: 9,
    interviewRating: 3.2,
    interviewCount: 4,
  },
  {
    // Rated as a workplace by nobody. The column must say so rather than repeat 3.8.
    name: "Skynet Inc",
    slug: "skynet-inc",
    managerCount: 1,
    totalReviews: 5,
    avgRating: 3.8,
    workplaceRating: null,
    workplaceCount: 0,
    interviewRating: null,
    interviewCount: 0,
  },
];

async function openDirectory(page: any, opts: { contributed?: boolean } = {}) {
  const { contributed = true } = opts;
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { ...MOCK_USER, hasContributed: contributed } }));
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: contributed });
  await page.route("**/api/companies/listing", (r: any) => r.fulfill({ json: { data: LISTING } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.goto("/companies");
  await expect(page.getByTestId("company-tile").first()).toBeVisible({ timeout: 10_000 });
}

test.describe("What a tile says it is measuring", () => {
  test("the three datasets are labelled, so none reads as the company's score", async ({ page }) => {
    await openDirectory(page);
    const tile = page.getByTestId("company-tile").first();

    await expect(tile.getByText("Managers", { exact: true })).toBeVisible();
    await expect(tile.getByText("Company", { exact: true })).toBeVisible();
    await expect(tile.getByText("Interview", { exact: true })).toBeVisible();
  });

  test("the workplace average is its own number, not the managers' one", async ({ page }) => {
    /*
      2.4 against 4.1 on the same company is the whole point. Working somewhere and being managed
      by a particular person there are different experiences and get different scores, and a tile
      showing only 4.1 told the reader the opposite of what the workplace ratings say.
    */
    await openDirectory(page);
    const tile = page.getByTestId("company-tile").first();

    await expect(tile.getByText("4.1")).toBeVisible();
    await expect(tile.getByText("2.4")).toBeVisible();
    await expect(tile.getByText("3.2")).toBeVisible();
  });

  test("each average carries its own sample size", async ({ page }) => {
    // 15 manager reviews and 9 workplace ratings. One count under two averages would attribute
    // the larger sample to whichever figure the eye landed on.
    await openDirectory(page);
    const tile = page.getByTestId("company-tile").first();

    await expect(tile.getByText("15 reviews")).toBeVisible();
    await expect(tile.getByText("9 reviews")).toBeVisible();
  });

  test("a company nobody has rated as a workplace shows a dash, not the other figure", async ({ page }) => {
    /*
      The failure this rules out: falling back to avgRating when workplaceRating is absent, which
      would publish "Skynet, 3.8 as a workplace" on the evidence of nobody at all.
    */
    await openDirectory(page);
    const skynet = page.getByTestId("company-tile").nth(1);

    await expect(skynet.getByText("3.8")).toBeVisible();
    /*
      Exactly once. This is the assertion that would catch the fallback: 3.8 belongs to the
      managers column, and a tile that borrowed it for the workplace figure would show it twice.
    */
    await expect(skynet.getByText("3.8")).toHaveCount(1);
    /*
      .first() because the two brands have a different number of datasets - one of them rates
      interviews as well - so a company nobody has rated for anything renders more than one dash
      and more than one zero count. Asserting a count here would make this test product-specific
      for no gain; what it is about is that the unrated column says "nothing" rather than
      repeating the managers' figure.
    */
    await expect(skynet.getByText("\u2013").first()).toBeVisible();
    await expect(skynet.getByText("0 reviews").first()).toBeVisible();
  });
});

test.describe("The contribution gate still applies to both", () => {
  test("neither figure reaches a reader who has not contributed", async ({ page }) => {
    /*
      The gate is on the figures, not on one of them. Adding a second dataset to the tile is
      exactly the kind of change that leaks one: the workplace score is withheld for the same
      reason the manager score is.
    */
    await openDirectory(page, { contributed: false });
    const tile = page.getByTestId("company-tile").first();

    await expect(tile.getByText("4.1")).toHaveCount(0);
    await expect(tile.getByText("2.4")).toHaveCount(0);
    await expect(tile.getByText("9 reviews")).toHaveCount(0);
  });

  test("the labels stay, so the reader can see what is being withheld", async ({ page }) => {
    await openDirectory(page, { contributed: false });
    const tile = page.getByTestId("company-tile").first();

    await expect(tile.getByText("Managers", { exact: true })).toBeVisible();
    await expect(tile.getByText("Company", { exact: true })).toBeVisible();
    await expect(tile.getByText("Interview", { exact: true })).toBeVisible();
  });
});
