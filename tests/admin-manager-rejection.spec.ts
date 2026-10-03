import { test, expect } from "./base";
import { mockAdminPage } from "./fixtures";

/**
 * Rejecting a pending manager, and saying whether it was the submitter's fault.
 *
 * The panel had one button: Reject. The backend debited the submitter 20 confidence points on
 * every rejection, so a submission taken down because it duplicated a manager already in the
 * directory cost its submitter exactly as much as typing "iufsflk sfsfsf" into the add form.
 * Duplicates come from the people who contribute most, so the accounts quietly pushed into the
 * watched and then restricted bands were disproportionately the good ones.
 *
 * The category is the point of this dialog rather than decoration, and it is never defaulted:
 * confidence is invisible to the person carrying it and cannot be appealed by them, which makes
 * a debit nobody deliberately chose one that nobody can defend later.
 *
 * The backend test is the one that proves the penalty itself (AdminManagerRejectionIntegrationTest).
 * These prove the moderator is asked, and that the answer reaches the server unchanged.
 */

/**
 * Opens the pending queue and gets as far as the open reject dialog.
 *
 * The rejection route is registered AFTER mockAdminPage deliberately. The fixture installs one
 * catch-all handler for /api/admin that answers every POST with {success:true}, and Playwright
 * matches in reverse registration order - so a route registered before it never sees the
 * request. Getting that backwards makes these tests pass while asserting nothing, which is worse
 * than failing: the request body is simply never captured and every assertion on it is vacuous.
 */
async function openRejectDialog(page: any, onReject?: (route: any) => void) {
  await mockAdminPage(page);
  if (onReject) await page.route("**/api/admin/pending-managers/*/reject", onReject);

  await page.goto("/admin");
  await expect(page.getByText("John Doe")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /^reject$/i }).first().click();
  await expect(page.getByRole("heading", { name: /reject manager\?/i }))
    .toBeVisible({ timeout: 3_000 });
  return page.getByRole("dialog");
}

test.describe("The rejection category", () => {
  test("is asked for, and nothing is rejected until one is chosen", async ({ page }) => {
    /*
      The guard that makes the choice deliberate. Before this the dialog could be confirmed
      immediately, and the only possible outcome was the penalised one.
    */
    let called = false;
    const dialog = await openRejectDialog(page, (r: any) => {
      called = true;
      r.fulfill({ json: { success: true } });
    });

    await expect(dialog.getByText("Why are you rejecting this?")).toBeVisible();
    await expect(page.getByTestId("reject-category-junk")).toBeVisible();
    await expect(page.getByTestId("reject-category-duplicate")).toBeVisible();
    await expect(page.getByTestId("reject-category-correction")).toBeVisible();
    await expect(page.getByTestId("reject-category-other")).toBeVisible();

    await expect(dialog.getByRole("button", { name: /^reject$/i })).toBeDisabled();
    expect(called).toBe(false);
  });

  test("junk is what gets sent when junk is chosen", async ({ page }) => {
    let body: any = null;
    const dialog = await openRejectDialog(page, (r: any) => {
      body = r.request().postDataJSON();
      r.fulfill({ json: { success: true, category: "junk", confidencePenalty: true } });
    });

    await page.getByTestId("reject-category-junk").click();
    await dialog.getByRole("button", { name: /^reject$/i }).click();

    await expect.poll(() => body?.category, { timeout: 10_000 }).toBe("junk");
  });

  test("duplicate is what gets sent when duplicate is chosen", async ({ page }) => {
    /*
      THE REGRESSION, at this layer. Every rejection used to carry the junk penalty because the
      category did not exist; sending "junk" from here would debit somebody for a duplicate that
      was never their fault.
    */
    let body: any = null;
    const dialog = await openRejectDialog(page, (r: any) => {
      body = r.request().postDataJSON();
      r.fulfill({ json: { success: true, category: "duplicate", confidencePenalty: false } });
    });

    await page.getByTestId("reject-category-duplicate").click();
    await dialog.getByRole("button", { name: /^reject$/i }).click();

    await expect.poll(() => body?.category, { timeout: 10_000 }).toBe("duplicate");
    expect(body?.category).not.toBe("junk");
  });

  test("the free-text reason still rides along, and is not the category", async ({ page }) => {
    /*
      The two answer different questions and must not be conflated: "reason" is prose the
      submitter reads in their notification, "category" is what the backend acts on. Before the
      fix only the prose existed, which is why nothing could act on it.
    */
    let body: any = null;
    const dialog = await openRejectDialog(page, (r: any) => {
      body = r.request().postDataJSON();
      r.fulfill({ json: { success: true, category: "other", confidencePenalty: false } });
    });

    await page.getByTestId("reject-category-other").click();
    await dialog.getByRole("textbox").fill("We already list this person under a different spelling.");
    await dialog.getByRole("button", { name: /^reject$/i }).click();

    await expect.poll(() => body?.category, { timeout: 10_000 }).toBe("other");
    expect(body?.reason).toContain("different spelling");
  });
});

test.describe("What the moderator is told afterwards", () => {
  test("reports the penalty the server applied, not the one the category implies", async ({ page }) => {
    /*
      Junk on a manager created by somebody's /find search penalises nobody: they typed into a
      search box, were never notified, and a score they cannot see must not move on it. The panel
      cannot work that out from the category, so it reads confidencePenalty back off the response.
      Inferring it here would tell a moderator they had docked somebody when they had not.
    */
    const dialog = await openRejectDialog(page, (r: any) =>
      r.fulfill({ json: { success: true, category: "junk", confidencePenalty: false } }));

    await page.getByTestId("reject-category-junk").click();
    await dialog.getByRole("button", { name: /^reject$/i }).click();

    await expect(page.getByText(/confidence was not affected/i)).toBeVisible({ timeout: 10_000 });
  });

  test("says so when it did lower the submitter's confidence", async ({ page }) => {
    const dialog = await openRejectDialog(page, (r: any) =>
      r.fulfill({ json: { success: true, category: "junk", confidencePenalty: true } }));

    await page.getByTestId("reject-category-junk").click();
    await dialog.getByRole("button", { name: /^reject$/i }).click();

    await expect(page.getByText(/confidence was lowered/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a chosen category does not leak into the next rejection", async ({ page }) => {
    /*
      The dialog is one piece of state reused for every row in the queue. Leaving the previous
      choice selected means the next Reject click is already armed with somebody else's verdict,
      and the guard above would not stop it because something is selected.
    */
    const dialog = await openRejectDialog(page, (r: any) =>
      r.fulfill({ json: { success: true, category: "junk", confidencePenalty: true } }));

    await page.getByTestId("reject-category-junk").click();
    await dialog.getByRole("button", { name: /^reject$/i }).click();
    await expect(page.getByText(/confidence was lowered/i)).toBeVisible({ timeout: 10_000 });

    // Reopen on whatever is still in the queue; the verdict must have been forgotten.
    const rejectButtons = page.getByRole("button", { name: /^reject$/i });
    if (await rejectButtons.count() > 0) {
      await rejectButtons.first().click();
      const reopened = page.getByRole("dialog");
      await expect(reopened.getByRole("button", { name: /^reject$/i })).toBeDisabled();
    }
  });
});
