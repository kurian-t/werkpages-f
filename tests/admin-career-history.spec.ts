import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_USER,
  MOCK_ADMIN_USER,
  mockManagerPage,
} from "./fixtures";

/**
 * Correcting a manager's career history, which only an admin can do.
 *
 * The timeline is assembled from reviews plus career-history rows, and a wrong row there is
 * unusually load-bearing: it decides which reviews group under which employer, so a bad company or
 * a bad date silently reattributes other people's reviews to the wrong job. That is why these
 * controls exist and why they are admin-only.
 *
 * None of it ran - not the controls appearing for the right person, not the two writes, not the
 * confirmation before a delete.
 */

/*
  The editable rows come from the manager's own career_history, not from the reviews-derived
  segments the API returns: careerHistoryId is attached only where a real career_history row backs
  the card, and that is exactly the set an admin can correct. A segment inferred purely from
  reviews has no row to edit, so it correctly gets no controls.
*/
const CATEGORY_AVERAGES = {
  "Communication Style": 3.0, "Perceived Approachability": 3.0,
  "Perceived Clarity of Expectations": 3.0, "Feedback Style": 3.0,
  "Perceived Supportiveness": 3.0, "Decision Making Style": 3.0,
  "Organization and Planning Style": 3.0, "Delegation Style": 3.0,
  "Perceived Professional Demeanor": 3.0, "Overall Working Experience": 3.0,
};

const CAREER_HISTORY = [
  { id: 11, title: "Engineering Lead", company: "Globex",    startDate: "2018-02", endDate: "2021-05" },
  { id: 12, title: "Director",        company: "Acme Corp", startDate: "2021-06", endDate: null },
];

async function open(page: any, { admin = true }: { admin?: boolean } = {}) {
  const who = admin
    ? { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true }
    : { ...MOCK_USER, role: "user", hasContributed: true };
  /*
    Seeded into localStorage as well as served from /api/auth/me. The timeline is behind the
    contribution gate and reads the session synchronously on first render - without the seed the
    page paints locked, and the career rows never mount for the assertions to find.
  */
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, {
    manager: { ...MOCK_MANAGER, careerHistory: CAREER_HISTORY },
    loggedIn: true,
    user: who,
  });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`), (r: any) =>
    r.fulfill({ json: { data: [] } }));
  // After the fixture, so this answers the timeline's own request.
  // No reviews-derived segments, so the timeline is built entirely from career_history - which is
  // the branch that attaches careerHistoryId and therefore the admin controls.
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
    r.fulfill({ json: { data: [] } }));
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

test.describe("Who gets the career-history controls", () => {
  test("an admin does", async ({ page }) => {
    await open(page);

    await expect(page.getByRole("button", { name: "Edit Globex career entry" }))
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Delete Globex career entry" })).toBeVisible();
  });

  test("an ordinary contributor does not", async ({ page }) => {
    /*
      Editing a career row changes which employer other people's reviews are filed under. Open to
      anyone, it would be a way to move somebody else's criticism onto a different company.
    */
    await open(page, { admin: false });

    await expect(page.getByRole("button", { name: /career entry$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Delete .* career entry$/ })).toHaveCount(0);
  });
});

test.describe("Editing an entry", () => {
  async function openEditor(page: any) {
    await open(page);
    await page.getByRole("button", { name: "Edit Globex career entry" }).click();
  }

  test("the editor opens on the row that was clicked", async ({ page }) => {
    // Pre-filled from that row, so an admin fixing one field is not retyping the other three.
    await openEditor(page);

    const company = page.locator('input[value="Globex"]');
    await expect(company).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[value="Engineering Lead"]')).toBeVisible();
  });

  test("a corrected entry is saved against its own id", async ({ page }) => {
    /*
      Against the entry id, never against position. The timeline is sorted for display, so a
      write keyed on index would edit whichever row happened to be drawn there.
    */
    let sentTo: string | null = null;
    let body: any = null;
    await openEditor(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-history\/\d+/, (r: any) => {
      sentTo = r.request().url();
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.locator('input[value="Engineering Lead"]').fill("Head of Engineering");
    await page.getByRole("button", { name: /^Save/ }).last().click();

    await expect(async () => expect(sentTo).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(sentTo).toContain("/career-history/11");
    expect(body.title).toBe("Head of Engineering");
  });

  test("Save is refused while a required field is blank", async ({ page }) => {
    // A row with no company or no start date cannot group reviews, which is its only job.
    await openEditor(page);

    await page.locator('input[value="Globex"]').fill("");

    await expect(page.getByRole("button", { name: /^Save/ }).last()).toBeDisabled();
  });

  test("closing the editor changes nothing", async ({ page }) => {
    let wrote = false;
    await openEditor(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-history\/\d+/, (r: any) => {
      wrote = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.locator('input[value="Engineering Lead"]').fill("Something else");
    await page.getByRole("button", { name: /^Cancel|^Close/ }).last().click();

    expect(wrote).toBe(false);
  });
});

test.describe("Deleting an entry", () => {
  test("it asks before removing anything", async ({ page }) => {
    /*
      Deleting a career row re-files every review that grouped under it. A single click with no
      confirmation is far too cheap for something that rearranges other people's contributions.
    */
    let deleted = false;
    await open(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-history\/\d+/, (r: any) => {
      if (r.request().method() === "DELETE") deleted = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: "Delete Globex career entry" }).click();

    expect(deleted).toBe(false);
    await expect(page.getByRole("button", { name: /delete|remove/i }).last()).toBeVisible();
  });

  test("confirming deletes the entry that was chosen", async ({ page }) => {
    let url: string | null = null;
    await open(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-history\/\d+/, (r: any) => {
      if (r.request().method() === "DELETE") url = r.request().url();
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByRole("button", { name: "Delete Globex career entry" }).click();
    await page.getByRole("button", { name: /^Delete$|Yes|Confirm/ }).last().click();

    await expect(async () => expect(url).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(url).toContain("/career-history/11");
  });
});
