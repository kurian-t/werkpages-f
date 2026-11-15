import { test, expect } from "./base";
import { mockAdminPage } from "./fixtures";

/**
 * The company logo an administrator is already looking at survives clicking Edit.
 *
 * <h2>Reported twice, from the same screen</h2>
 *
 * <p>First: the company box in the pending-manager edit form showed no logo at all, because it
 * was a bare CompanyAutocomplete rather than the CompanyField every contribution form uses.
 *
 * <p>Then: with the shared field in place the collapsed card showed the real mark, and clicking
 * "Edit details" replaced it with a grey letter. The mark INSIDE the field was derived from a
 * DOMAIN and nothing else, so a caller holding a resolved logo had no way to hand it over, and
 * the editor fell back to guessing one from the name.
 *
 * <h2>Why this fixture uses Meta Blueprint</h2>
 *
 * <p>Taken from the row that was actually reported. Its stored logo resolves
 * facebookblueprint.com, while a guess from the name produces metablueprint.com - a different
 * company. So "an image rendered" is not the assertion: the SOURCE is, because the fallback this
 * is guarding against would happily render somebody else's mark.
 */

const PENDING_WITH_LOGO = {
  id: "admin-pm-logo-1",
  name: "Rosalind Fairweather",
  title: "Operations Lead",
  company: "Meta Blueprint",
  companyId: 79,
  /* What the admin listing now sends, and did not before: the company's own stored logo. */
  logoUrl: "https://img.logo.dev/facebookblueprint.com?token=test&fallback=404",
  submittedBy: "testuser",
  createdAt: new Date().toISOString(),
  isAutoCreated: true,
};

async function openPendingEdit(page: any) {
  await mockAdminPage(page, { pendingManagers: [PENDING_WITH_LOGO] });
  await page.goto("/admin");
  await expect(page.getByText(/Rosalind Fairweather/i).first()).toBeVisible({ timeout: 10_000 });
  // The pencil beside the manager name, which is what opens the edit form.
  await page.getByRole("button", { name: /Edit manager/i }).first().click();
  const field = page.getByTestId("company-field");
  await expect(field).toBeVisible({ timeout: 10_000 });
  return field;
}

test.describe("Admin pending-manager edit: the company logo", () => {

  test("renders the stored logo rather than an initial", async ({ page }) => {
    const field = await openPendingEdit(page);
    const logo = field.locator("img").first();
    await expect(logo, "the company field fell back to a letter").toBeVisible({ timeout: 10_000 });
    await expect(logo).toHaveAttribute("src", /facebookblueprint\.com/);
  });

  test("keeps that logo when the editor is opened", async ({ page }) => {
    /*
      THE REPORTED GESTURE. The card shows the mark; clicking Edit details must not take it away.
      Asserted on the src, because the bug replaced a correct logo with a guessed one before it
      replaced it with a letter, and both are failures.
    */
    const field = await openPendingEdit(page);

    const edit = field.getByRole("button", { name: /Edit company/i });
    if (await edit.count()) await edit.first().click();

    await expect(field.locator("input").first()).toBeVisible();
    const logo = field.locator("img").first();
    await expect(logo, "the logo disappeared when the editor opened").toBeVisible({ timeout: 10_000 });
    const src = await logo.getAttribute("src");
    expect(src, "the editor rendered a logo guessed from the name").toContain("facebookblueprint.com");
    expect(src).not.toContain("metablueprint.com");
  });
});

/**
 * A company with NO stored logo, so the only thing that can draw a mark is the name itself.
 *
 * This is what pins the gate. Everywhere else in these specs a logo arrives either from a picked
 * suggestion, which sets a domain, or from the admin listing. Strip both and the mark depends
 * solely on the field being willing to show one for a SETTLED name - a value that arrived
 * pre-filled rather than typed, which is precisely what opening an edit form is.
 */
const PENDING_WITHOUT_STORED_LOGO = {
  id: "admin-pm-logo-2",
  name: "Dev Patel",
  title: "Engineering Manager",
  company: "Shopify",
  companyId: 81,
  logoUrl: null,
  submittedBy: "testuser",
  createdAt: new Date().toISOString(),
  isAutoCreated: false,
};

test.describe("Admin pending-manager edit: a company with no stored logo", () => {

  test("still reserves and renders a mark once the editor is open", async ({ page }) => {
    /*
      The collapsed card always shows SOMETHING for a company: a logo when it can resolve one,
      and the company's initial when it cannot - logoCandidates has no name guess, so a company
      with no stored url, domain or icon legitimately has no image to show. The input showed
      nothing at all, so opening the editor blanked a field that had just been showing a mark.

      Asserted on the computed padding rather than on a class name, because a class named in a
      comment still generates its rule and proves nothing about what the browser did. The gate
      and the padding are the same decision: pl-8 is applied exactly when a mark is rendered, so
      a field that reserves 32px is a field that drew one, and 12px is the bare px-3 of a field
      that drew nothing.
    */
    await mockAdminPage(page, { pendingManagers: [PENDING_WITHOUT_STORED_LOGO] });
    await page.goto("/admin");
    await expect(page.getByText(/Dev Patel/i).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Edit manager/i }).first().click();

    const field = page.getByTestId("company-field");
    await expect(field).toBeVisible({ timeout: 10_000 });

    const edit = field.getByRole("button", { name: /Edit company/i });
    if (await edit.count()) await edit.first().click();

    const input = field.locator("input").first();
    await expect(input).toBeVisible();
    const padding = await input.evaluate(
      (el) => parseFloat(getComputedStyle(el as HTMLElement).paddingLeft));
    expect(padding, "the editor reserved no room for a mark, so it drew none")
      .toBeGreaterThan(20);

    // And the mark itself is there: the initial, because this company resolves no logo.
    const mark = field.locator('div[aria-hidden="true"]').filter({ hasText: /^S$/ });
    await expect(mark.first(), "no mark was rendered beside the input")
      .toBeVisible({ timeout: 10_000 });
  });
});
