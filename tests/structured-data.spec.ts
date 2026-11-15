import { test, expect } from "./base";
import { TEST_MANAGER_ID, mockManagerPage } from "./fixtures";

/**
 * The JSON-LD a manager page emits, and the one field that must never come back.
 *
 * <h2>Why this exists</h2>
 *
 * <p>The page carried an {@code aggregateRating} on a {@code Person}. Google supports review
 * snippets on a fixed list of types - Book, Course, Event, HowTo, LocalBusiness, Movie, Product,
 * Recipe, SoftwareApplication - and Person is not one of them, so the markup was rejected and six
 * manager profiles were reported in Search Console as <i>Invalid object type for field
 * "&lt;parent_node&gt;"</i>. That message names the PARENT: the rating's container was a type that
 * cannot carry it.
 *
 * <p>It is an easy thing to add back, because a rating on a rated person looks obviously correct
 * and the page does have the number to hand. Hence a test rather than a comment.
 *
 * <p>The other half of the guard is the rest of the graph: deleting the rating must not take the
 * Person or the breadcrumbs with it, which are valid, useful, and the reason the block exists.
 */

/**
 * The manager page's JSON-LD graph, parsed.
 *
 * <p>NOT `.first()`. The page carries two ld+json blocks: a site-wide Organization from the shell
 * and the per-page graph from Helmet. Taking the first one picked up the Organization, whose
 * `@graph` is undefined, and the absence assertion below then passed against nothing at all -
 * which is the failure mode this whole file exists to avoid.
 */
async function graphOf(page: any) {
  /*
    Polled, because allTextContents does NOT wait: it returns whatever is in the DOM at the moment
    it is called, and Helmet injects this block after hydration. Called without a wait it saw only
    the shell's Organization and reported a missing graph on a page that had one a moment later.
  */
  let graph: any[] | undefined;
  await expect.poll(async () => {
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const found = blocks
      .map((b: string) => { try { return JSON.parse(b); } catch { return null; } })
      .find((o: any) => o && Array.isArray(o["@graph"]));
    graph = found?.["@graph"];
    return Array.isArray(graph);
  }, { timeout: 10_000, message: "the manager page must emit a JSON-LD @graph" }).toBe(true);
  return graph!;
}

test.describe("manager page structured data", () => {
  test("carries no aggregateRating, on the Person or anywhere else", async ({ page }) => {
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    const graph = await graphOf(page);
    /*
      Searched over the serialised graph rather than checked on the Person node alone. Moving the
      same invalid field onto another node in the block would be the same Search Console error
      with a different parent named, so the assertion is about the whole document.
    */
    expect(JSON.stringify(graph), "Google rejects aggregateRating on a Person")
      .not.toContain("aggregateRating");
  });

  test("still describes the person and the breadcrumbs", async ({ page }) => {
    /*
      The control. An assertion that something is absent passes just as happily when the whole
      block is gone, so this proves the markup is still there to be wrong.
    */
    await mockManagerPage(page, { loggedIn: true });
    await page.goto(`/manager/${TEST_MANAGER_ID}`);

    const graph = await graphOf(page);
    const person = graph.find((n) => n["@type"] === "Person");
    expect(person, "the page is about a person and should still say so").toBeTruthy();
    expect(person.name).toBeTruthy();
    expect(person.worksFor?.["@type"]).toBe("Organization");

    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList");
    expect(crumbs?.itemListElement?.length, "home, company, manager").toBeGreaterThanOrEqual(2);
  });
});
