import { test, expect } from "./base";
import { MOCK_MANAGER, MOCK_ADMIN_USER, TEST_MANAGER_ID, MOCK_COMPANY_PROFILE, mockManagerPage } from "./fixtures";

/**
 * The company logo in the admin editor, and getting rid of it.
 *
 * <p>Reported with a screenshot: an EMPTY company field with a logo still sitting in it, a wrong
 * one, and no control to remove it. The wrong logo itself came from logo.dev, which answers the
 * resolved domain knotts.com with the mark of Six Flags - Knott's Berry Farm's owner Cedar Fair
 * merged into Six Flags - so no URL we build can correct it. Being able to remove it is therefore
 * the fix, not a convenience.
 *
 * <p>The mechanism was one line in CompanyAutocomplete:
 * {@code effectiveDomain = selectedDomain ?? (initialDomain || null)}. Typing sets selectedDomain
 * to null, deliberately, because typing invalidates a selection - and the {@code ??} then fell
 * straight back to initialDomain, the company the form OPENED with. So the mark reverted to the
 * previous company rather than disappearing, and emptying the field made it permanent, because
 * the clear control was gated on there being text.
 *
 * <p>This runs on the admin editor specifically because that is a surface which passes
 * initialDomain. The add form never did, which is why nothing here was caught by the existing
 * company-logo specs.
 */

const COMPANY = "Knotts Berry Farm";
const DOMAIN  = "knotts.com";

async function openAdminEdit(page: any) {
  const manager = { ...MOCK_MANAGER, company: COMPANY, companyId: 9, companyDomain: DOMAIN };
  await mockManagerPage(page, { loggedIn: true, user: MOCK_ADMIN_USER, manager });
  // Nothing matches, so the only identity in play is the one the form opened with.
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await page.getByTestId("admin-edit-button").click();
  return page.locator('input[name="adminEditCompany"]');
}

/** The component's own wrapper, so the profile behind the editor cannot answer for it. */
function fieldOf(page: any) {
  return page.locator('div:has(> input[name="adminEditCompany"])');
}

test.describe("the company logo in the admin editor", () => {

  test("goes when the name no longer names that company", async ({ page }) => {
    const input = await openAdminEdit(page);
    const field = fieldOf(page);

    // It starts out present: this manager really is at that company.
    await expect(field.locator("img")).toHaveCount(1, { timeout: 10_000 });

    await input.fill("Something Else Entirely");
    const typedOver = await field.locator("img").evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).src));
    expect(typedOver.join(" "),
      "the previous company's logo is still shown for a different name").not.toContain(DOMAIN);

    // The screenshot's exact state: nothing typed at all.
    await input.fill("");
    const emptied = await field.locator("img").evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).src));
    expect(emptied.join(" "),
      "a logo is still shown in an empty company field").not.toContain(DOMAIN);
  });

  test("can be cleared in one action", async ({ page }) => {
    const input = await openAdminEdit(page);

    /*
      The clear control required the caller to pass onClear, and the callers did not, so there was
      no way to empty this field in one action at all.
    */
    const clear = page.getByRole("button", { name: /clear company/i });
    await expect(clear).toBeVisible({ timeout: 10_000 });
    await clear.click();

    await expect(input).toHaveValue("");
    const left = await fieldOf(page).locator("img").evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).src));
    expect(left.join(" "), "clearing left the logo behind").not.toContain(DOMAIN);
  });
});

test.describe("correcting a company's brand", () => {

  test("an admin can send a domain and a logo the resolvers cannot produce", async ({ page }) => {
    /*
      The durable half of the Knott's Berry Farm report. Clearing a wrong logo in a form helps the
      person filling it in; the next reader still sees Six Flags. logo.dev answers the correct
      domain with the owner's mark, so the only remaining authority is a person, and
      domain_source = 'ADMIN' is the one thing no resolver will overwrite.
    */
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: { ...MOCK_ADMIN_USER, hasContributed: true, hasRatedCompany: true } }));
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
      { ...MOCK_ADMIN_USER, hasContributed: true, hasRatedCompany: true });
    await page.route(/\/api\/companies\/by-(name|slug)/, (r: any) =>
      r.fulfill({ json: { ...MOCK_COMPANY_PROFILE, id: 9, name: "Knotts Berry Farm" } }));
    await page.route("**/api/companies/listing", (r: any) => r.fulfill({ json: { data: [] } }));

    let sent: any = null;
    await page.route(/\/api\/admin\/companies\/9$/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ json: { success: true } });
    });

    await page.goto("/companies/Knotts%20Berry%20Farm");
    await page.getByRole("button", { name: /rename company/i }).click();

    await page.getByLabel("Company domain").fill("knotts.com");
    await page.getByLabel("Company logo URL").fill("https://cdn.example/knotts.png");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect.poll(() => sent, { timeout: 10_000 }).not.toBeNull();
    expect(sent.name).toBe("Knotts Berry Farm");
    expect(sent.domain).toBe("knotts.com");
    expect(sent.logoUrl).toBe("https://cdn.example/knotts.png");
  });

  test("a plain rename sends no brand at all", async ({ page }) => {
    /*
      Absent means leave it. If a rename carried empty brand fields it would wipe a logo somebody
      had already corrected, which is the opposite of the point.
    */
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: { ...MOCK_ADMIN_USER, hasContributed: true, hasRatedCompany: true } }));
    await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
      { ...MOCK_ADMIN_USER, hasContributed: true, hasRatedCompany: true });
    await page.route(/\/api\/companies\/by-(name|slug)/, (r: any) =>
      r.fulfill({ json: { ...MOCK_COMPANY_PROFILE, id: 9, name: "Acme Corp" } }));
    await page.route("**/api/companies/listing", (r: any) => r.fulfill({ json: { data: [] } }));

    let sent: any = null;
    await page.route(/\/api\/admin\/companies\/9$/, (r: any) => {
      sent = r.request().postDataJSON();
      return r.fulfill({ json: { success: true } });
    });

    await page.goto("/companies/Acme%20Corp");
    await page.getByRole("button", { name: /rename company/i }).click();
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect.poll(() => sent, { timeout: 10_000 }).not.toBeNull();
    expect(sent.domain).toBeUndefined();
    expect(sent.logoUrl).toBeUndefined();
  });
});
