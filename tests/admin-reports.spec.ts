import { test, expect } from "./base";
import { MOCK_ADMIN_USER, mockAdminPage } from "./fixtures";

/**
 * The queue of reports filed against manager profiles.
 *
 * The Report button on a profile has worked since it shipped: it validates the reason, refuses a
 * second report from the same account and writes a row. Nothing ever read that row. The only
 * SELECT against `reports` in either backend was the duplicate check itself, so no admin had seen
 * a single report, while the profile page thanked each reporter and promised that "our team will
 * review this profile".
 *
 * It is the correction route the Terms of Service and the Privacy Policy both point a rated person
 * at, which is why an unbuilt admin screen was not a missing convenience. A named individual
 * disputing their own profile was being sent to a dead end.
 *
 * These specs cover the screen. The chain behind it - a real admin session, the real router built
 * from the shipped spec, the real database - is covered by
 * ReportQueueJourneyIntegrationTest, because a mocked API cannot tell whether an endpoint exists.
 */

const TAB = "Reports";

function report(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    managerId: 42,
    managerName: "Ingrid Solberg",
    managerSlug: "ingrid-solberg",
    reason: "incorrect_person",
    comment: "This is a different Ingrid Solberg.",
    status: "open",
    createdAt: "2026-11-01T10:00:00Z",
    reporter: "quietmoose",
    reporterKnown: true,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    ...over,
  };
}

/*
  Registered after the shared admin fixture on purpose: Playwright matches routes in reverse
  registration order, so the narrower reports handler has to come second to win.
*/
async function mockReports(page: any, rows: any[] = [report()], user = MOCK_ADMIN_USER) {
  await mockAdminPage(page, { user });
  await page.route(/\/api\/admin\/reports(\?|$)/, (r: any) =>
    r.fulfill({ json: { data: rows, total: rows.length, status: "open" } }));
}

async function openQueue(page: any, rows: any[] = [report()], user = MOCK_ADMIN_USER) {
  await mockReports(page, rows, user);
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: new RegExp(TAB) })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: new RegExp(TAB) }).click();
}

/*
  EXACT, because `name` matches a substring by default and the state filter above the list is
  labelled "dismissed". `{ name: "Dismiss" }` matched that filter too, and since the filter row
  renders before the fetched cards arrive it won the race: the click switched the list to the
  dismissed state and posted nothing. Exact names cannot collide with it.
*/
const dismiss      = (page: any) => page.getByRole("button", { name: "Dismiss",      exact: true });
const markResolved = (page: any) => page.getByRole("button", { name: "Mark resolved", exact: true });

test.describe("Reading the queue", () => {
  test("a report names the profile, what was alleged and what the reporter wrote", async ({ page }) => {
    await openQueue(page);

    /*
      BY ROLE, not by text. The comment in this fixture is "This is a different Ingrid Solberg.",
      which contains the manager's name, so getByText matches the link AND the comment and fails
      strict mode. Asserting the link is also the stronger assertion: the name has to be the thing
      you can click through to.
    */
    await expect(page.getByRole("link", { name: "Ingrid Solberg" })).toBeVisible({ timeout: 10_000 });
    // The stored value is `incorrect_person`; an admin should not have to read enum names.
    await expect(page.getByText("Wrong person")).toBeVisible();
    await expect(page.getByText("This is a different Ingrid Solberg.")).toBeVisible();
    await expect(page.getByText(/quietmoose/)).toBeVisible();
  });

  test("the profile is one click away, because a report is about a page", async ({ page }) => {
    await openQueue(page);

    await expect(page.getByRole("link", { name: "Ingrid Solberg" }))
      .toHaveAttribute("href", "/manager/42");
  });

  test("the tab carries the open count BEFORE the tab is opened", async ({ page }) => {
    /*
      The whole failure this feature existed inside was invisibility. A badge that only appears
      once somebody thinks to click the tab would reproduce it: reports would still sit unread,
      and nothing on the page would say so. The count is fetched on mount for that reason.
    */
    await mockReports(page, [report(), report({ id: "22222222-2222-2222-2222-222222222222" })]);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: /Reports\s*2/ })).toBeVisible({ timeout: 10_000 });
  });

  test("a report left behind by a deleted account still appears, and says so", async ({ page }) => {
    /*
      reports.user_id is ON DELETE SET NULL, so deleting an account leaves its reports standing
      with nobody named against them. The allegation about the profile is still worth reading, so
      the row has to render rather than being dropped or blanked.
    */
    await openQueue(page, [report({ reporter: null, reporterKnown: false })]);

    await expect(page.getByText("no account attached")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Ingrid Solberg" })).toBeVisible();
  });
});

test.describe("Deciding a report", () => {
  test("marking it resolved sends the action with the note, and the row leaves the list", async ({ page }) => {
    await openQueue(page);
    await expect(markResolved(page)).toBeVisible({ timeout: 10_000 });

    let body: any = null;
    await page.route(/\/api\/admin\/reports\/.+\/resolve/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, status: "resolved" } });
    });

    await page.getByPlaceholder("What did you conclude? (optional)").fill("Profile corrected.");
    await markResolved(page).click();

    await expect.poll(() => body?.action, { timeout: 10_000 }).toBe("resolved");
    expect(body.note).toBe("Profile corrected.");
    // Gone from the list, so the queue visibly drains rather than needing a reload to look done.
    await expect(page.getByText("This is a different Ingrid Solberg.")).toBeHidden();
  });

  test("dismissing sends dismissed, and an empty note is sent as null rather than an empty string", async ({ page }) => {
    await openQueue(page);
    await expect(dismiss(page)).toBeVisible({ timeout: 10_000 });

    let body: any = null;
    await page.route(/\/api\/admin\/reports\/.+\/resolve/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, status: "dismissed" } });
    });

    await dismiss(page).click();

    await expect.poll(() => body?.action, { timeout: 10_000 }).toBe("dismissed");
    /*
      Null, not "". The database refuses a blank note - reports_resolution_note_meaningful in V114
      - precisely so that "no conclusion recorded" and "a conclusion that is empty" cannot both be
      storable and mean different things to whoever reads the queue next.
    */
    expect(body.note).toBeNull();
  });

  test("a report somebody else already decided is reported as such, not as a failure", async ({ page }) => {
    /*
      Two admins working the same queue is the normal case, not an edge one. A 409 means the other
      one got there first: that is information, and showing a red "could not save" would send this
      admin looking for a bug that is not there.
    */
    await openQueue(page);
    await expect(markResolved(page)).toBeVisible({ timeout: 10_000 });
    await page.route(/\/api\/admin\/reports\/.+\/resolve/, (r: any) =>
      r.fulfill({ status: 409, json: { error: "already_decided" } }));

    await markResolved(page).click();

    await expect(page.getByText(/already decided that report/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The decided history", () => {
  test("a resolved report shows who decided it and what they concluded", async ({ page }) => {
    /*
      Kept rather than deleted, and readable afterwards. Without this the only record of why a
      profile was left alone is in the memory of whichever admin made the call.
    */
    await openQueue(page, [report({
      status: "resolved",
      resolvedBy: "journeyadmin",
      resolvedAt: "2026-11-20T09:00:00Z",
      resolutionNote: "Checked the employment record; it is the right person.",
    })]);

    await expect(page.getByText(/Resolved by journeyadmin/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Checked the employment record/)).toBeVisible();
    // No decision controls on something already decided.
    await expect(markResolved(page)).toBeHidden();
  });
});
