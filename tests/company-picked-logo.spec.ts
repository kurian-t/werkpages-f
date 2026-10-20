import { test, expect } from "./base";

/**
 * The logo you PICKED is the logo that stays.
 *
 * Reported from production three times, and reproduced on localhost: type "lime", pick
 * "Lime" (li.me) from the dropdown - the green Lime mark appears - then click "Done editing",
 * and the collapsed card shows an unrelated company's blue "F" instead.
 *
 * Nothing was wrong with the pick. The collapsed card rendered only the logo its CALLER passed
 * down, and AddBoss held the picked logo in its own state without threading it back. With no
 * logo prop, CompanyLogoImg falls back to guessing a domain from the NAME - and
 * companyLogoDomain("Lime") is "lime.com", which is a different company altogether. The real
 * one is li.me.
 *
 * That is why re-editing never helped: the card was never reading the pick.
 *
 * The assertions below are deliberately about the two domains and not about "some image":
 * a wrong logo is still a logo, and a test that only checks an <img> rendered passes through
 * the entire bug.
 */

const USER = { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", hasContributed: true };

/* The real shape: Lime's domain is li.me, which no name-guess can produce. */
const SUGGESTIONS = [
  { id: 41, name: "Lime Lush Boutique", slug: "lime-lush-boutique", domain: "limelush.com" },
  { id: 42, name: "Lime",               slug: "lime",              domain: "li.me" },
  { id: 43, name: "Lime Rock Park",     slug: "lime-rock-park",    domain: "limerock.com" },
];

async function mock(page: any) {
  await page.addInitScript((u: unknown) => localStorage.setItem("authUser", JSON.stringify(u)), USER);
  await page.route("**/api/managers**", (r: any) => r.fulfill({ json: { data: [], total: 0 } }));
  await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: USER }));
  await page.route("**/api/geo", (r: any) => r.fulfill({ json: { country: "CA", state: "ON", city: "Toronto" } }));
  // Catch-all FIRST: Playwright matches routes in reverse registration order, so the narrower
  // /suggest route has to be registered last or the catch-all swallows it.
  await page.route("**/api/companies/**", (r: any) => r.fulfill({ json: { name: "Lime", slug: "lime" } }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: SUGGESTIONS }));
}

/** Picks "Lime" from the dropdown on the add-manager form. */
async function pickLime(page: any) {
  await page.goto("/add");
  const field = page.getByTestId("company-field");
  await expect(field).toBeVisible({ timeout: 10_000 });

  const input = field.locator("input").first();
  await input.click();
  await input.fill("lime");

  // The exact row, not a prefix match - "Lime Lush Boutique" also starts with "Lime".
  await page.getByText("Lime", { exact: true }).first().click();
  return field;
}

test.describe("The company logo you picked", () => {
  test("survives clicking Done editing", async ({ page }) => {
    await mock(page);
    const field = await pickLime(page);

    // Collapse the field - this is the exact click that used to swap the logo.
    const done = field.getByRole("button", { name: /Done editing/i });
    if (await done.count()) await done.first().click();

    const logo = field.locator("img").first();
    await expect(logo).toHaveAttribute("src", /li\.me/, { timeout: 10_000 });
  });

  test("is never replaced by one guessed from the company name", async ({ page }) => {
    /*
      The heart of it. "lime.com" is what the name guess produces and it belongs to somebody
      else, so its appearance anywhere in this field is the bug itself.
    */
    await mock(page);
    const field = await pickLime(page);

    const done = field.getByRole("button", { name: /Done editing/i });
    if (await done.count()) await done.first().click();

    const src = await field.locator("img").first().getAttribute("src");
    expect(src).not.toContain("lime.com");
  });

  test("goes away when the name no longer names that company", async ({ page }) => {
    /*
      REPORTED: a wrong logo that could not be deleted. The screenshot showed an EMPTY company
      field with a logo still sitting in it and no control to remove it.

      effectiveDomain = selectedDomain ?? (initialDomain || null). Typing sets selectedDomain to
      null - "typing invalidates the selection" - and the ?? then fell straight back to
      initialDomain, so the mark reverted to the company that was there BEFORE instead of
      disappearing. Emptying the field made it worse: the clear control is gated on
      value.length > 0, so it vanished too and the logo became unremovable.
    */
    await mock(page);
    const field = await pickLime(page);

    const edit = field.getByRole("button", { name: /Edit company/i });
    if (await edit.count()) await edit.first().click();
    const input = field.locator("input").first();
    await input.fill("Something Else Entirely");

    const typedOver = await field.locator("img").evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).src));
    expect(typedOver.join(" "), "Lime's logo is still shown for a different company")
      .not.toContain("li.me");

    // And the case in the screenshot: nothing typed at all.
    await input.fill("");
    const emptied = await field.locator("img").evaluateAll(
      (els) => els.map((e) => (e as HTMLImageElement).src));
    expect(emptied.join(" "), "a logo is still shown in an empty company field")
      .not.toContain("li.me");
  });
});
