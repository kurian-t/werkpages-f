import { test, expect } from "./base";
import { MOCK_ADMIN_USER, MOCK_USER, mockAdminPage } from "./fixtures";

/**
 * The queue of companies waiting to go live.
 *
 * Rating a workplace we have never heard of creates the company, because refusing the rating over
 * a missing row would lose the contribution. But it does not create it *live* - an unreviewed name
 * somebody typed into a form is not a directory entry, and the gap between those two is this
 * queue.
 *
 * None of it was tested, which is the wrong state for the only thing standing between a typed
 * string and the public directory.
 *
 * The counts on each row are the other half. A pending company is reachable - findBySlug and the
 * company picker have no status filter - so the same person can attach a workplace rating, a
 * manager, and an interview experience to it before anyone has looked. A row showing only the
 * ratings understates what the decision is actually about.
 */

const TAB = "New Companies";

function company(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: "Initech",
    slug: "initech",
    ratingCount: 1,
    managerCount: 0,
    interviewCount: 0,
    createdAt: "2026-08-01T10:00:00Z",
    ...over,
  };
}

/*
  Registered after the shared admin fixture on purpose: Playwright matches routes in reverse
  registration order, so the narrower pending-companies handler has to come second to win.
*/
async function openQueue(page: any, pending: any[] = [company()], user = MOCK_ADMIN_USER) {
  await mockAdminPage(page, { user });
  await page.route(/\/api\/admin\/companies\/pending/, (r: any) =>
    r.fulfill({ json: { data: pending } }));
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: new RegExp(TAB) })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: new RegExp(TAB) }).click();
}

test.describe("The queue itself", () => {
  test("a waiting company is listed by name", async ({ page }) => {
    await openQueue(page);

    await expect(page.getByText("Initech")).toBeVisible({ timeout: 10_000 });
  });

  test("the tab carries a count, so the queue is visible without opening it", async ({ page }) => {
    /*
      An admin queue nobody opens is the same as no queue - the companies sit unreviewed and
      invisible either way. The badge is what makes the work findable.
    */
    await openQueue(page, [company(), company({ id: 8, name: "Globex", slug: "globex" })]);

    await expect(page.getByRole("button", { name: /New Companies\s*2/ })).toBeVisible({ timeout: 10_000 });
  });

  test("an empty queue says what would appear in it", async ({ page }) => {
    // "Nothing waiting" alone leaves an admin unsure whether the feature works. Naming what lands
    // here makes the empty state a description rather than an absence.
    await openQueue(page, []);

    await expect(page.getByText("Nothing waiting")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/created by a workplace rating appear here before they go live/i))
      .toBeVisible();
  });

  test("a failed load says so rather than showing an empty queue", async ({ page }) => {
    /*
      An empty queue and a broken one look identical and mean opposite things. An admin shown
      "Nothing waiting" when the request failed stops checking, and the companies wait indefinitely.
    */
    await mockAdminPage(page);
    await page.route(/\/api\/admin\/companies\/pending/, (r: any) => r.fulfill({ status: 500, json: {} }));
    await page.goto("/admin");
    await page.getByRole("button", { name: new RegExp(TAB) }).click();

    await expect(page.getByText(/Failed to load companies awaiting review/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("What each row has to say", () => {
  test("a single rating is counted in the singular", async ({ page }) => {
    // "1 ratings" on the one screen whose job is careful reading is a small thing that costs
    // confidence in the bigger numbers beside it.
    await openQueue(page, [company({ ratingCount: 1 })]);

    await expect(page.getByText(/1 rating(?!s)/)).toBeVisible({ timeout: 10_000 });
  });

  test("several ratings are counted in the plural", async ({ page }) => {
    await openQueue(page, [company({ ratingCount: 4 })]);

    await expect(page.getByText(/4 ratings/)).toBeVisible({ timeout: 10_000 });
  });

  test("managers and interviews attached to it are counted too", async ({ page }) => {
    /*
      The reason the row counts three things. One person can reach a pending company and attach a
      rating, a manager and an interview to it before anybody reviews the name - so "1 rating" on
      its own describes a fraction of what approving it would publish.
    */
    await openQueue(page, [company({ ratingCount: 2, managerCount: 3, interviewCount: 1 })]);

    await expect(page.getByText(/2 ratings/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/3 managers/)).toBeVisible();
    await expect(page.getByText(/1 interview(?!s)/)).toBeVisible();
  });

  test("counts that are zero are left out rather than shown as zero", async ({ page }) => {
    // "0 managers · 0 interviews" on most rows is noise that hides the rows where those numbers
    // are the whole point.
    await openQueue(page, [company({ ratingCount: 1, managerCount: 0, interviewCount: 0 })]);

    await expect(page.getByText(/1 rating/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/0 managers|0 interviews/)).toHaveCount(0);
  });

  test("when it arrived is shown, because a queue is worked oldest first", async ({ page }) => {
    await openQueue(page);

    await expect(page.getByText(/added /)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Deciding on one", () => {
  test("approving it sends an approval and says what happened", async ({ page }) => {
    let sent: any = null;
    await openQueue(page);
    await page.route(/\/api\/admin\/companies\/\d+\/decision/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: "Add to directory" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.approve).toBe(true);
    await expect(page.getByText("Company added to the directory")).toBeVisible();
  });

  test("rejecting it sends a rejection, worded as one", async ({ page }) => {
    // The two outcomes are not symmetrical and must not read as though they were: one publishes a
    // name to the directory, the other does not.
    let sent: any = null;
    await openQueue(page);
    await page.route(/\/api\/admin\/companies\/\d+\/decision/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: "Reject" }).click();

    await expect(async () => expect(sent).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sent.approve).toBe(false);
    await expect(page.getByText("Company rejected")).toBeVisible();
  });

  test("a decided company leaves the queue", async ({ page }) => {
    // Worked through in one pass. A row that stays after a decision gets decided twice, and the
    // second decision is made without knowing the first one happened.
    await openQueue(page);
    await page.route(/\/api\/admin\/companies\/\d+\/decision/, (r: any) =>
      r.fulfill({ status: 200, json: { success: true } }));

    await page.getByRole("button", { name: "Add to directory" }).click();

    await expect(page.getByText("Nothing waiting")).toBeVisible({ timeout: 10_000 });
  });

  test("only the decided company leaves", async ({ page }) => {
    await openQueue(page, [company(), company({ id: 8, name: "Globex", slug: "globex" })]);
    await page.route(/\/api\/admin\/companies\/8\/decision/, (r: any) =>
      r.fulfill({ status: 200, json: { success: true } }));

    await page.getByRole("button", { name: "Reject" }).nth(1).click();

    await expect(page.getByText("Globex")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("Initech")).toBeVisible();
  });

  test("a failed decision keeps the company in the queue and says so", async ({ page }) => {
    /*
      The row is removed from local state rather than by refetching, so a failure reported as
      success would take the company off the screen while it is still pending - and nobody would
      ever look at it again, because it is no longer in the only place it appears.
    */
    await openQueue(page);
    await page.route(/\/api\/admin\/companies\/\d+\/decision/, (r: any) =>
      r.fulfill({ status: 500, json: {} }));

    await page.getByRole("button", { name: "Add to directory" }).click();

    await expect(page.getByText("Could not save that decision")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Initech")).toBeVisible();
  });
});

test.describe("Who can reach the queue", () => {
  test("an ordinary account gets no admin page at all", async ({ page }) => {
    // Refused by the server too. This asserts the first of those: the queue is not somewhere an
    // ordinary reader can look, let alone act.
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
    await page.route(/\/api\/admin/, (r: any) => r.fulfill({ status: 403, json: {} }));
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: new RegExp(TAB) })).toHaveCount(0);
  });
});
