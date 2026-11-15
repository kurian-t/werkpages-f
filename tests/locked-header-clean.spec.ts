import { test, expect, Page } from "./base";
import { MOCK_COMPANY_PROFILE, MOCK_USER, TEST_COMPANY_SLUG } from "./fixtures";

/**
 * A locked tab shows its notice on a plain background, with nothing behind it.
 *
 * <h2>What this is, and what it replaced</h2>
 *
 * <p>The first attempt blurred the heading row so the notice could be read over it. That was
 * wrong: a blurred heading is still shapes behind the words you are trying to read, and on a
 * phone the notice sits directly on top of it, so the two fight. Blur made it worse at the size
 * it most needed to be legible.
 *
 * <p>So the content is not rendered at all while the gate is up. These tests assert absence of
 * the content AND absence of any blur, because either one coming back is the same regression
 * wearing a different hat.
 *
 * <p>Nothing of value disappears. The eyebrow and subtitle are a label and a sentence the page
 * states again elsewhere, the counts were already withheld, and the score was never in the DOM
 * while locked.
 */

async function mockCompanyProfile(
  page: Page,
  opts: {
    loggedIn?: boolean;
    hasContributed?: boolean;
    profile?: typeof MOCK_COMPANY_PROFILE;
  } = {}
) {
  const {
    loggedIn = false,
    hasContributed = false,
    profile = MOCK_COMPANY_PROFILE,
  } = opts;

  await page.route("**/api/auth/me", (route) =>
    loggedIn
      ? route.fulfill({ json: { ...MOCK_USER, hasContributed } })
      : route.fulfill({ status: 401, json: { error: "Unauthorized" } })
  );

  if (loggedIn) {
    await page.addInitScript((u: typeof MOCK_USER) => {
      localStorage.setItem("authUser", JSON.stringify(u));
    }, { ...MOCK_USER, hasContributed });
  }

  await page.route(/\/api\/companies\/by-slug/, (route) =>
    route.fulfill({ json: profile })
  );

  await page.route(/\/api\/companies\/by-name/, (route) =>
    route.fulfill({ json: profile })
  );

  await page.route("**/api/companies/suggest**", (route) =>
    route.fulfill({ json: [] })
  );

  // Notifications bell fires on every page load for logged-in users
  await page.route("**/api/notifications**", (route) =>
    route.fulfill({ json: { data: [] } })
  );

  // Geo needed for sidebar search form submit - not called on page load, but
  // intercept it defensively so any accidental call doesn't reach the real server.
  await page.route(/\/api\/geo/, (route) =>
    route.fulfill({ json: { country: "United States", state: "California", city: "San Francisco" } })
  );
}

/** Every filter the browser is actually applying inside the tab header. */
async function filtersInHeader(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="locked-only"]')?.closest(".relative");
    if (!root) return [] as string[];
    return Array.from(root.querySelectorAll("*"))
      .map((el) => getComputedStyle(el).filter)
      .filter((f) => f && f !== "none");
  });
}

test.describe("a locked tab header", () => {
  test("renders the notice and nothing behind it", async ({ page }) => {
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    await expect(page.getByTestId("locked-only")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/insights are locked/i).first()).toBeVisible();

    /*
      The heading is GONE, not hidden. Asserting on visibility would pass against a blurred or
      transparent element, which is exactly the thing being removed.
    */
    await expect(page.getByText("Manager opinions", { exact: true })).toHaveCount(0);
  });

  test("applies no blur to anything in the header", async ({ page }) => {
    /*
      The regression guard. Re-adding a blur to make the notice readable is the obvious fix and
      the wrong one, so the absence of blur is asserted from the browser rather than the source.
    */
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
    await expect(page.getByTestId("locked-only")).toBeVisible({ timeout: 10_000 });

    expect(await filtersInHeader(page), "nothing behind the notice, so nothing to blur").toEqual([]);
  });

  test("is legible on a phone, and the notice is not clipped", async ({ page }) => {
    /*
      The size this was reported at. The box gets its height from a min-height now that the
      content which used to provide one is gone, so the risk is the notice overflowing it.
    */
    await page.setViewportSize({ width: 375, height: 780 });
    await mockCompanyProfile(page, { loggedIn: false, hasContributed: false });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);

    const box = page.getByTestId("locked-only");
    await expect(box).toBeVisible({ timeout: 10_000 });
    const outer = (await box.boundingBox())!;
    const cta = (await page.getByRole("button", { name: /rate a manager|rate this workplace/i })
      .first().boundingBox())!;

    expect(cta.y + cta.height, "the button must sit inside the notice box, not spill out of it")
      .toBeLessThanOrEqual(outer.y + outer.height + 1);
    expect(outer.width, "and the box must not exceed the viewport").toBeLessThanOrEqual(375);
  });

  test("an unlocked header still shows its heading", async ({ page }) => {
    /*
      The control. "The heading is absent" passes just as well when the whole header is broken,
      so this proves the content comes back for somebody who has contributed.
    */
    await mockCompanyProfile(page, { loggedIn: true, hasContributed: true });
    await page.goto(`/companies/${TEST_COMPANY_SLUG}`);
    await expect(page.getByText("Alex Johnson")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Manager opinions", { exact: true })).toBeVisible();
    await expect(page.getByTestId("locked-only")).toHaveCount(0);
  });
});
