import { test, expect } from "./base";
import { mockAdminPage } from "./fixtures";

/**
 * THE JOB TITLES TAB: the catalogue's one review path.
 *
 * <h2>Why it exists</h2>
 *
 * <p>The title picker offers "Not listed? Add &lt;what you typed&gt;" for a title it cannot find.
 * That row keeps the contributor's wording and records nothing: a title entered the site by being
 * submitted, and `job_titles` could only change by writing a migration. V116 reserved
 * `source = 'promoted'` for exactly this and nothing ever wrote it.
 *
 * <p>So the gap was not in the picker, it was that nobody could ever say yes. These tests cover
 * the saying-yes.
 */

const UNLISTED = {
  data: [
    { title: "Chief Vibes Officer", matchKey: "chief vibes officer", managerCount: 12, pendingCount: 2, lastUsed: null },
    { title: "Head of Hamsters",    matchKey: "head of hamsters",    managerCount: 1,  pendingCount: 0, lastUsed: null },
  ],
};

async function openTitlesTab(page: any, opts: { unlisted?: any } = {}) {
  const promoted: string[] = [];
  /*
    AFTER mockAdminPage, not before. It installs one catch-all handler for /api/admin/ "to avoid
    LIFO ordering surprises", and routes are last-registered-wins, so anything registered earlier
    is simply never reached: these two endpoints answered with its default empty list and the tab
    rendered nothing.
  */
  await mockAdminPage(page);
  await page.route("**/api/admin/job-titles/unlisted**", (r: any) =>
    r.fulfill({ json: opts.unlisted ?? UNLISTED }));
  await page.route("**/api/admin/job-titles/promote", (r: any) => {
    promoted.push(JSON.parse(r.request().postData() ?? "{}").title);
    return r.fulfill({ json: { success: true, added: true, title: promoted[promoted.length - 1] } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Job Titles" }).click();
  return promoted;
}

test.describe("Admin: job titles nobody has catalogued", () => {
  test("lists the titles in use that the suggestion list does not hold", async ({ page }) => {
    await openTitlesTab(page);

    await expect(page.getByTestId("unlisted-title-row")).toHaveCount(2);
    await expect(page.getByText("Chief Vibes Officer")).toBeVisible();
    /*
      The count is the decision. A spelling twelve people use is a different proposition from one
      somebody typed once, and without it an admin is approving blind.
    */
    await expect(page.getByText("12 managers · 2 awaiting review")).toBeVisible();
    await expect(page.getByText("1 manager", { exact: false })).toBeVisible();
  });

  test("adding one sends the title and takes it off the list", async ({ page }) => {
    const promoted = await openTitlesTab(page);

    await page.getByTestId("unlisted-title-row")
      .filter({ hasText: "Chief Vibes Officer" })
      .getByRole("button", { name: /add to title list/i })
      .click();

    await expect.poll(() => promoted).toEqual(["Chief Vibes Officer"]);
    // Off the LIST, because the question it asked has been answered. Scoped to the rows rather
    // than the page: the confirmation toast quotes the title back, so a page-wide check finds it
    // and fails on whichever browser is still showing the toast.
    await expect(page.getByTestId("unlisted-title-row")).toHaveCount(1);
    await expect(page.getByTestId("unlisted-title-row")
      .filter({ hasText: "Chief Vibes Officer" })).toHaveCount(0);
  });

  test("an empty list says so rather than showing nothing", async ({ page }) => {
    // A blank panel reads as a page that failed to load. This one is a real answer.
    await openTitlesTab(page, { unlisted: { data: [] } });

    await expect(page.getByText(/every title in use is already in the list/i)).toBeVisible();
    await expect(page.getByTestId("unlisted-title-row")).toHaveCount(0);
  });
});
