import { test, expect } from "./base";
import { MOCK_USER, mockDirectoryPage } from "./fixtures";

/**
 * A manager nobody has rated still shows its example rating, labelled.
 *
 * ## The production report this exists for
 *
 * "A user searched, the profile was auto-created, and the tile came back with an empty space
 * where the rating goes. The seed review was in the database the whole time, which is what made
 * it look random."
 *
 * It was fixed once, by awaiting the recalculation before serialising the response. Then V106
 * split provenance out: an example contributes nothing to `managers.overall_rating`, correctly,
 * and the tile - which read only that - went back to drawing nothing. Same symptom, new cause,
 * and no test caught it because every assertion was about the genuine figure.
 *
 * ## Why the second test matters as much as the first
 *
 * The easy fix is to put the example's number into `overallRating` and be done. That would also
 * feed it to the Top Rated pill, to sorting, and to every aggregate computed from the manager
 * cache - fabricated numbers ranking real people, which is precisely what `reviews.origin` was
 * added to stop. So the example travels in its own field and this spec pins down both halves:
 * the number appears, and it appears nowhere it would be mistaken for an opinion.
 */

const GHOST_WITH_EXAMPLE_ONLY = {
  id: "ghost-example-only",
  name: "Marguerite Ashdown",
  title: "Operations Director",
  company: "Thornbury Logistics",
  // Genuinely unrated: no person has rated this manager.
  overallRating: null,
  reviews: 0,
  // What the example itself says. Deliberately high enough to earn a Top Rated pill if it were
  // ever mistaken for a genuine score.
  exampleRating: 4.9,
  exampleReviews: 1,
  approvalStatus: "ghost",
  image: "M",
};

const RATED_MANAGER = {
  id: "rated-manager",
  name: "Alex Johnson",
  title: "Engineering Manager",
  company: "Acme Corp",
  overallRating: 3.8,
  reviews: 12,
  exampleRating: null,
  exampleReviews: 0,
  approvalStatus: "approved",
  image: "A",
};

test.describe("A manager with only an example rating", () => {
  test("the tile shows the example's number instead of an empty space", async ({ page }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      hasContributed: true,
      managers: [GHOST_WITH_EXAMPLE_ONLY, RATED_MANAGER],
    });
    await page.goto("/directory");

    const example = page.getByTestId("manager-card-example-rating");
    await expect(example).toBeVisible({ timeout: 10_000 });

    // Said in words, so nobody reads a demonstration as somebody's opinion.
    await expect(example).toContainText("Example rating");
  });

  /**
   * It must not be presented as a rating.
   *
   * A 4.9 example would be the highest score on the page. If it reached the genuine field it
   * would win the Top Rated pill, and the product would be advertising a manager on the strength
   * of a number it generated itself.
   */
  test("it never earns the Top Rated pill", async ({ page }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      hasContributed: true,
      managers: [GHOST_WITH_EXAMPLE_ONLY],
    });
    await page.goto("/directory");

    await expect(page.getByTestId("manager-card-example-rating")).toBeVisible({ timeout: 10_000 });

    /*
      EXACT, and lower-case "rated". The pill reads "Top rated"; the sort dropdown on this page
      offers "Top Rated" as an option. A substring match finds the dropdown and can therefore
      never fail, which is worse than having no assertion because it looks like one.
    */
    await expect(page.getByText("Top rated", { exact: true })).toHaveCount(0);
  });

  /** A manager with a real rating is unaffected: no example label, the real number shown. */
  test("a genuinely rated manager is untouched", async ({ page }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      hasContributed: true,
      managers: [RATED_MANAGER],
    });
    await page.goto("/directory");

    await expect(page.getByText("12 reviews")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("manager-card-example-rating")).toHaveCount(0);
  });

  /**
   * And the example is only a fallback.
   *
   * If a manager ever carried both - which should not happen, because the example is retired the
   * moment a genuine rating lands - the genuine one wins and the label does not appear. The tile
   * must not be the place that discovers the invariant was broken.
   */
  test("a genuine rating wins when both are somehow present", async ({ page }) => {
    await mockDirectoryPage(page, {
      loggedIn: true,
      hasContributed: true,
      managers: [{ ...RATED_MANAGER, exampleRating: 4.9, exampleReviews: 1 }],
    });
    await page.goto("/directory");

    await expect(page.getByText("12 reviews")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("manager-card-example-rating")).toHaveCount(0);
  });
});
