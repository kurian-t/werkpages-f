import { test, expect } from "./base";
import { TEST_MANAGER_ID, MOCK_MANAGER, MOCK_USER, MOCK_ADMIN_USER, mockManagerPage } from "./fixtures";

/**
 * A moderator removing somebody else's rating, and saying why.
 *
 * Admins could not delete a rating at all - the only delete path checked author ownership - so a
 * fake 5-star written in ten seconds to get past the contribution gate could be seen and not
 * removed.
 *
 * The reason is the point of this UI rather than decoration: only "junk" debits the author's
 * confidence. A duplicate or a data correction is not their fault, and an unexplained penalty is
 * one nobody can defend six months later. So the reason is chosen explicitly, never defaulted.
 */

const CATEGORY_AVERAGES = {
  "Communication Style": 4.0, "Perceived Approachability": 4.0,
  "Perceived Clarity of Expectations": 4.0, "Feedback Style": 4.0,
  "Perceived Supportiveness": 4.0, "Decision Making Style": 4.0,
  "Organization and Planning Style": 4.0, "Delegation Style": 4.0,
  "Perceived Professional Demeanor": 4.0, "Overall Working Experience": 4.0,
};

const REVIEW = {
  id: "11111111-2222-3333-4444-555555555555",
  managerId: TEST_MANAGER_ID,
  author: "QuietPanda42",
  overallRating: 5.0,
  ratings: CATEGORY_AVERAGES,
  managerCompany: MOCK_MANAGER.company,
  managerTitle: MOCK_MANAGER.title,
  verified: false,
  helpfulCount: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  workedFrom: "2024-01-01",
  workedUntil: null,
  disposition: "live",
};

/** Opens the profile with one rating on it, as an admin or an ordinary reader. */
async function open(page: any, { admin = true }: { admin?: boolean } = {}) {
  const who = admin
    ? { ...MOCK_ADMIN_USER, role: "admin", hasContributed: true }
    : { ...MOCK_USER, role: "user", hasContributed: true };

  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), who);
  await mockManagerPage(page, { manager: MOCK_MANAGER, loggedIn: true, user: who });

  // After the fixture: Playwright matches in reverse registration order, and the fixture serves
  // an empty feed. Without a rating on the page there is no card to moderate.
  await page.route(new RegExp(`/api/managers/${TEST_MANAGER_ID}/reviews`), (r: any) => {
    if (r.request().method() !== "GET") return r.fallback();
    return r.fulfill({ json: { data: [REVIEW], total: 1 } });
  });

  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByTestId("admin-review-moderation").or(page.getByText(REVIEW.author)).first())
    .toBeVisible({ timeout: 10_000 });
}

test.describe("Who can delete somebody else's rating", () => {
  test("an admin can", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Delete rating" })).toBeVisible({ timeout: 10_000 });
  });

  test("an ordinary reader cannot", async ({ page }) => {
    /* Backend authorisation is what actually protects this; the control simply must not be there. */
    await open(page, { admin: false });
    await expect(page.getByRole("button", { name: "Delete rating" })).toHaveCount(0);
  });
});

test.describe("The deletion reason", () => {
  test("is asked for before anything is deleted", async ({ page }) => {
    let called = false;
    await page.route("**/api/admin/reviews/**", (r: any) => { called = true; r.fulfill({ json: { success: true } }); });

    await open(page);
    await page.getByRole("button", { name: "Delete rating" }).click();

    await expect(page.getByText("Why are you deleting this rating?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Junk \/ fake contribution/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Duplicate/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Data correction/ })).toBeVisible();
    expect(called).toBe(false);
  });

  test("says which reason was chosen - junk", async ({ page }) => {
    let body: any = null;
    await page.route("**/api/admin/reviews/**", (r: any) => {
      body = r.request().postDataJSON();
      r.fulfill({ json: { success: true, reason: "junk", confidencePenalty: true } });
    });

    await open(page);
    await page.getByRole("button", { name: "Delete rating" }).click();
    await page.getByRole("button", { name: /Junk \/ fake contribution/ }).click();

    await expect.poll(() => body?.reason, { timeout: 10_000 }).toBe("junk");
  });

  test("says which reason was chosen - duplicate, which carries no penalty", async ({ page }) => {
    /*
      The distinction the whole dialog exists for. Sending "junk" here would debit an author for
      a duplicate that was never their fault.
    */
    let body: any = null;
    await page.route("**/api/admin/reviews/**", (r: any) => {
      body = r.request().postDataJSON();
      r.fulfill({ json: { success: true, reason: "duplicate", confidencePenalty: false } });
    });

    await open(page);
    await page.getByRole("button", { name: "Delete rating" }).click();
    await page.getByRole("button", { name: /Duplicate/ }).click();

    await expect.poll(() => body?.reason, { timeout: 10_000 }).toBe("duplicate");
  });

  test("can be backed out of without deleting", async ({ page }) => {
    let called = false;
    await page.route("**/api/admin/reviews/**", (r: any) => { called = true; r.fulfill({ json: { success: true } }); });

    await open(page);
    await page.getByRole("button", { name: "Delete rating" }).click();
    await page.getByRole("button", { name: "Cancel" }).first().click();

    await expect(page.getByText("Why are you deleting this rating?")).toHaveCount(0);
    expect(called).toBe(false);
  });
});
