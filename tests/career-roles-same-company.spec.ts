import { test, expect } from "./base";
import {
  TEST_MANAGER_ID,
  MOCK_MANAGER,
  MOCK_ADMIN_USER,
  mockManagerPage,
} from "./fixtures";
import { roleKey } from "../client/lib/careerRoles";

/**
 * Two roles at ONE employer, which is what a promotion looks like on the trajectory.
 *
 * The chart groups a manager's history on the (company, title) pair, so a manager promoted inside
 * one company has two stages at that company. Every admin control on those stages identified a
 * stage by its COMPANY, and so could not tell the two apart:
 *
 *   - the destination list for "move the ratings" filtered out every stage at the same company,
 *     which removed the one destination an admin needs - the senior role - and left "Delete role
 *     and ratings" as the only offered action on exactly the profile where deleting is wrong;
 *   - the option values were company names, so two roles at one employer produced two options with
 *     the same value and picking either sent the ratings to whichever came first;
 *   - the request carried the company and no title, and the server then matched every rating at
 *     that employer. A delete destroyed the sibling role's genuine ratings and reported success.
 *
 * The backend regressions for the same defect are in CareerStageAdminIntegrationTest, under
 * "two roles at ONE employer". This spec covers what the admin sees and what the page sends.
 */

const VISA_ENGINEER = {
  company: "Visa", role: "Software Engineer",
  startDate: "2019-01", endDate: "2022-01", isCurrent: false,
  averageRating: 2.0, reviewCount: 1, categoryAverages: {},
  careerHistoryIds: [8911], careerHistoryId: 8911,
  careerPeriods: [{ id: 8911, startDate: "2019-01-01", endDate: "2022-01-01" }],
};

const VISA_DIRECTOR = {
  company: "Visa", role: "Director Software Engineering",
  startDate: "2022-02", endDate: null, isCurrent: true,
  averageRating: 4.0, reviewCount: 1, categoryAverages: {},
  careerHistoryIds: [8913], careerHistoryId: 8913,
  careerPeriods: [{ id: 8913, startDate: "2022-02-01", endDate: null }],
};

async function openPromotedProfile(page: any) {
  const who = { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true };
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, {
    manager: { ...MOCK_MANAGER, company: "Visa", title: "Director Software Engineering" },
    loggedIn: true,
    user: who,
  });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`), (r: any) =>
    r.fulfill({ json: { data: [] } }));
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
    r.fulfill({ json: { data: [VISA_ENGINEER, VISA_DIRECTOR] } }));
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

const deleteFor = (seg: { company: string; role: string }) =>
  `career-delete-${roleKey(seg.company, seg.role)}`;

test.describe("A manager promoted inside one company", () => {
  test("both roles are drawn, each with its own controls", async ({ page }) => {
    /*
      Keyed on the company these were one stage. The timeline also dropped any career_history row
      whose company already had a rated role, so an unrated second job never appeared at all.
    */
    await openPromotedProfile(page);
    await expect(page.getByTestId(deleteFor(VISA_ENGINEER))).toHaveCount(1);
    await expect(page.getByTestId(deleteFor(VISA_DIRECTOR))).toHaveCount(1);
  });

  test("the sibling role at the same company is offered as a destination", async ({ page }) => {
    /*
      THE REGRESSION. The destination list excluded every stage at the same company, so an admin
      wanting to move the junior role's rating onto the senior role was offered nothing and the
      only button left was the one that destroys the rating.
    */
    await openPromotedProfile(page);
    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();

    const dialog = page.getByTestId("career-stage-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("option", { name: /Director Software Engineering at Visa/ }))
      .toHaveCount(1);
    await expect(dialog.getByRole("button", { name: /Move ratings/i })).toBeVisible();
  });

  test("moving the ratings names both roles, not just the employer", async ({ page }) => {
    /*
      The request the server needs. With only company and toCompany it could not tell which role
      was meant on either end, and both normalise to "Visa": the move was refused as "onto itself"
      while a delete would have taken both roles' ratings.
    */
    let body: any = null;
    await openPromotedProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: {
        success: true, reviewsAffected: 1, merged: false,
        rolesSuperseded: 0, entriesDeleted: 0, sourceEmploymentKept: true } });
    });

    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByRole("combobox")
      .selectOption({ label: "Director Software Engineering at Visa" });
    await dialog.getByRole("button", { name: /Move ratings/i }).click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.action).toBe("reassign");
    expect(body.company).toBe("Visa");
    expect(body.title).toBe("Software Engineer");
    expect(body.toCompany).toBe("Visa");
    expect(body.toTitle).toBe("Director Software Engineering");
  });

  test("deleting one role names that role, so the other one's ratings are out of scope", async ({ page }) => {
    /*
      The destructive path. body.title is the whole difference between removing one job and
      removing every job at that employer.
    */
    let body: any = null;
    await openPromotedProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: { success: true, reviewsAffected: 1 } });
    });

    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();
    await page.getByTestId("career-stage-dialog")
      .getByRole("button", { name: /Delete role and ratings/i }).click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.action).toBe("delete");
    expect(body.company).toBe("Visa");
    expect(body.title).toBe("Software Engineer");
  });

  test("Edit opens the row the server named, not one guessed from the company", async ({ page }) => {
    /*
      The page used to find the career_history row by matching the company name and breaking ties
      on the start month. For this manager that resolved to the wrong row - so Edit rewrote the
      other stretch of their history - or to none, so the control vanished. The segments endpoint
      now returns the ids it grouped, and 8911 is the junior role's.
    */
    let putUrl: string | null = null;
    await openPromotedProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-history\/.*/, (r: any) => {
      putUrl = r.request().url();
      return r.fulfill({ status: 200, json: { success: true, updated: 1 } });
    });

    await page.getByTestId(`career-edit-${roleKey(VISA_ENGINEER.company, VISA_ENGINEER.role)}`)
      .click();
    await page.getByRole("button", { name: /^Save$/ }).click();

    await expect(async () => expect(putUrl).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(putUrl).toContain("/career-history/8911");
    expect(putUrl).not.toContain("/career-history/8913");
  });

  /*
    MOVING RATINGS AND MERGING ROLES ARE DIFFERENT ACTIONS.

    reassign used to do both: seeing two recorded employments at one employer it performed a role
    merge, superseding the source role, and everywhere else it deleted the source career_history
    row once the ratings had left. An admin correcting which job an opinion was filed under got an
    employment period superseded or deleted without asking for either.

    So the dialog now offers them separately, and these are the tests that each sends its own
    action and that the move does not claim to have removed anything.
  */
  test("merging is offered as its own action, and says so in what it sends", async ({ page }) => {
    let body: any = null;
    await openPromotedProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: {
        success: true, action: "merge", merged: true, rolesSuperseded: 1,
        reviewsAffected: 1, entriesDeleted: 0 } });
    });

    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByRole("combobox")
      .selectOption({ label: "Director Software Engineering at Visa" });
    await expect(dialog.getByTestId("career-stage-merge")).toBeVisible();
    await dialog.getByTestId("career-stage-merge").click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.action).toBe("merge");
    // Both sides are named by ROW, because a merge supersedes one employment record into another
    // and a (company, title) pair does not identify a row when a stage covers several periods.
    expect(body.careerHistoryId).toBe(8911);
    expect(body.toCareerHistoryId).toBe(8913);
  });

  test("merging is not offered across two employers", async ({ page }) => {
    /*
      Two jobs at two companies are not one employment however alike the titles, and the server
      refuses it. Offering the button anyway would be offering an action that cannot succeed.
    */
    const who = { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true };
    await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
    await mockManagerPage(page, {
      manager: { ...MOCK_MANAGER, company: "Visa", title: "Director Software Engineering" },
      loggedIn: true, user: who,
    });
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`), (r: any) =>
      r.fulfill({ json: { data: [] } }));
    await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
      r.fulfill({ json: { data: [VISA_ENGINEER, {
        ...VISA_DIRECTOR, company: "Shopify",
      }] } }));
    await page.goto(`/manager/${TEST_MANAGER_ID}`);
    await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByRole("combobox")
      .selectOption({ label: "Director Software Engineering at Shopify" });

    await expect(dialog.getByTestId("career-stage-move")).toBeVisible();
    await expect(dialog.getByTestId("career-stage-merge")).toHaveCount(0);
  });

  test("moving the ratings does not claim the role was removed", async ({ page }) => {
    /*
      The confirmation said "Reviews moved and role removed", which was true of the old behaviour
      and is now false. A message that overstates what happened is worse than none: an admin who
      reads it has no reason to look at the trajectory again.
    */
    await openPromotedProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) =>
      r.fulfill({ status: 200, json: {
        success: true, reviewsAffected: 1, merged: false,
        rolesSuperseded: 0, entriesDeleted: 0, sourceEmploymentKept: true } }));

    await page.getByTestId(deleteFor(VISA_ENGINEER)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByRole("combobox")
      .selectOption({ label: "Director Software Engineering at Visa" });
    await dialog.getByTestId("career-stage-move").click();

    await expect(page.getByText(/Ratings moved\. The role is still on the record\./))
      .toBeVisible({ timeout: 10_000 });
  });
});

/**
 * ONE TILE, TWO JOBS: the same defect one level down.
 *
 * Identifying a role by the (company, title) pair stops one role's deletion destroying a sibling
 * role's ratings. But the pair is not unique either. Somebody can leave an employer and come back
 * to the same title years later - two separate employments, identical pair, ONE tile on the chart,
 * because that is what the chart groups on.
 *
 * career_unique_known_employment is UNIQUE (manager_id, company_id, title_key, start_day), so the
 * schema permits exactly this whenever the start days differ. A stage-wide delete would take both
 * jobs while the admin was looking at one, so the server refuses until the request names the
 * period - and these are the tests that the admin can actually answer that question.
 */
const TWO_SPELLS = {
  company: "Visa", role: "Director",
  startDate: "2015-01", endDate: "2022-01", isCurrent: false,
  averageRating: 3.0, reviewCount: 2, categoryAverages: {},
  careerHistoryIds: [7001, 7002],
  // Null, because two rows back this tile and no single id describes it. The page must not guess.
  careerHistoryId: null,
  careerPeriods: [
    { id: 7001, startDate: "2015-01-01", endDate: "2017-01-01" },
    { id: 7002, startDate: "2020-01-01", endDate: "2022-01-01" },
  ],
};

async function openTwoSpellsProfile(page: any) {
  const who = { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true };
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, {
    manager: { ...MOCK_MANAGER, company: "Visa", title: "Director" },
    loggedIn: true, user: who,
  });
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/pending-edits`), (r: any) =>
    r.fulfill({ json: { data: [] } }));
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/career-segments`), (r: any) =>
    r.fulfill({ json: { data: [TWO_SPELLS] } }));
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByText("Career Performance Trajectory")).toBeVisible({ timeout: 10_000 });
}

test.describe("A role held twice at one employer", () => {
  test("the dialog asks which period, and will not delete until told", async ({ page }) => {
    let called = false;
    await openTwoSpellsProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      called = true;
      return r.fulfill({ status: 200, json: { success: true } });
    });

    await page.getByTestId(deleteFor(TWO_SPELLS)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await expect(dialog.getByTestId("career-period-choice")).toBeVisible();
    // The dates are the discriminator the schema itself uses, so they are what the admin reads.
    await expect(dialog.getByRole("option", { name: /2015-01-01 to 2017-01-01/ })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: /2020-01-01 to 2022-01-01/ })).toHaveCount(1);

    await expect(dialog.getByTestId("career-stage-delete")).toBeDisabled();
    expect(called).toBe(false);
  });

  test("choosing a period sends that row and no other", async ({ page }) => {
    let body: any = null;
    await openTwoSpellsProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: {
        success: true, entriesDeleted: 1, reviewsAffected: 0 } });
    });

    await page.getByTestId(deleteFor(TWO_SPELLS)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByLabel("Which employment period")
      .selectOption({ label: "2015-01-01 to 2017-01-01" });
    await dialog.getByTestId("career-stage-delete").click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.careerHistoryId).toBe(7001);
    expect(body.allPeriods).toBeUndefined();
  });

  test("taking both jobs has to be said out loud", async ({ page }) => {
    /*
      Removing two separate employments is allowed; it just cannot be the default reading of a
      click on one tile. allPeriods is the admin saying they meant both.
    */
    let body: any = null;
    await openTwoSpellsProfile(page);
    await page.route(/\/api\/admin\/managers\/.*\/career-stage/, (r: any) => {
      body = r.request().postDataJSON();
      return r.fulfill({ status: 200, json: {
        success: true, entriesDeleted: 2, reviewsAffected: 2 } });
    });

    await page.getByTestId(deleteFor(TWO_SPELLS)).click();
    const dialog = page.getByTestId("career-stage-dialog");
    await dialog.getByLabel("Which employment period")
      .selectOption({ label: "Every period of this role" });
    await dialog.getByTestId("career-stage-delete").click();

    await expect(async () => expect(body).not.toBeNull()).toPass({ timeout: 10_000 });
    expect(body.allPeriods).toBe(true);
    expect(body.careerHistoryId).toBeUndefined();
  });
});
