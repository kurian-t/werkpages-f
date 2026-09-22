import { test, expect } from "./base";
import {
  MOCK_USER,
  MOCK_COMPANY_LISTING,
  MOCK_COMPANY_PROFILE,
  mockDirectoryPage,
} from "./fixtures";

/**
 * Every tile is the same box, and it fits on a phone.
 *
 * ManagerTile exists because the card was decided in three places and they drifted apart. A
 * fourth copy got made anyway: CompanyTile carried its own className and the Companies page its
 * own grid with `auto-rows-[minmax(180px,auto)]` - the exact pattern ManagerTile's own comment
 * records as the bug. Measured, company tiles came out 200x180 beside 200x230 manager tiles.
 *
 * Nothing caught it because the existing size regression in company-manager-tiles.spec.ts only
 * ever compares manager tiles to other manager tiles. These compare across the two families and
 * across the two surfaces, which is where the drift actually happened.
 */

const PHONE = { width: 390, height: 844 };

async function mockCompanies(page: any, opts: { contributed?: boolean } = {}) {
  const { contributed = true } = opts;
  await page.route("**/api/auth/me", (r: any) =>
    r.fulfill({ json: { ...MOCK_USER, hasContributed: contributed } }));
  await page.addInitScript((u: any) => localStorage.setItem("authUser", JSON.stringify(u)),
    { ...MOCK_USER, hasContributed: contributed });
  await page.route("**/api/companies/listing", (r: any) =>
    r.fulfill({ json: { data: MOCK_COMPANY_LISTING } }));
  await page.route(/\/api\/companies\/by-(name|slug)/, (r: any) =>
    r.fulfill({ json: MOCK_COMPANY_PROFILE }));
  await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
}

/** Height of the first tile of a kind, or null when the surface rendered none. */
async function tileHeight(page: any, testId: string): Promise<number | null> {
  const t = page.getByTestId(testId).first();
  if (!(await t.count())) return null;
  const box = await t.boundingBox();
  return box ? Math.round(box.height) : null;
}

test.describe("One tile box, every surface", () => {
  test("a company tile is the same height as a manager tile", async ({ page }) => {
    /*
      The bug, stated directly. These are different components on different pages, which is
      exactly why they drifted: 180px against 230px, same width, sitting one tab apart.
    */
    await mockCompanies(page);
    await page.goto("/companies");
    await expect(page.getByTestId("company-tile").first()).toBeVisible({ timeout: 10_000 });
    const company = await tileHeight(page, "company-tile");

    await mockDirectoryPage(page);
    await page.goto("/directory");
    await expect(page.getByTestId("manager-tile").first()).toBeVisible({ timeout: 10_000 });
    const manager = await tileHeight(page, "manager-tile");

    expect(company).not.toBeNull();
    expect(manager).not.toBeNull();
    expect(Math.abs(company! - manager!)).toBeLessThanOrEqual(2);
  });

  test("no tile clips its own content", async ({ page }) => {
    /*
      The row height is a cap, and the box is overflow-hidden - so a tile whose content outgrows
      it loses the bottom of itself silently rather than stretching. That is the failure mode the
      cap trades for, and this is the guard that makes the trade safe to keep.
    */
    await mockCompanies(page);
    await page.goto("/companies");
    await expect(page.getByTestId("company-tile").first()).toBeVisible({ timeout: 10_000 });

    /*
      Measured as "does the content still fit", not "does the box overflow".

      scrollHeight - clientHeight is useless here: the shell is flex-col, so when the row is too
      short the children are compressed rather than pushed past the edge, and the box reports no
      overflow while the text inside is squashed. That version of this assertion passed at a
      row height of 120px, which is to say it could not fail.
    */
    const fit = await page.getByTestId("company-tile").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      const available = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const needed = Array.from(el.children)
        .reduce((a, k) => a + (k as HTMLElement).scrollHeight, 0);
      return { available: Math.round(available), needed: Math.round(needed) };
    });

    expect(fit.needed, `content needs ${fit.needed}px but the row gives ${fit.available}px`)
      .toBeLessThanOrEqual(fit.available);
  });
});

test.describe("Company tiles on a phone", () => {
  test.use({ viewport: PHONE });

  test("a column heading stays on one line", async ({ page }) => {
    /*
      Below 420px the grid is two-up, so a tile is about 173px rather than 200 and each of the
      three metric columns about 43px rather than 49. At 10px "Managers" is wider than that and
      broke mid-word: the tiles read "Manager / s" and "Compan / y".
    */
    await mockCompanies(page);
    await page.goto("/companies");
    const tile = page.getByTestId("company-tile").first();
    await expect(tile).toBeVisible({ timeout: 10_000 });

    const headings = await tile.evaluate((el) => {
      const out: { text: string; height: number; lineHeight: number }[] = [];
      el.querySelectorAll("p").forEach((p) => {
        const t = (p.textContent ?? "").trim();
        if (!/^(Managers|Company|Interview)$/.test(t)) return;
        const cs = getComputedStyle(p);
        out.push({ text: t, height: p.getBoundingClientRect().height, lineHeight: parseFloat(cs.lineHeight) });
      });
      return out;
    });

    expect(headings.length).toBe(3);
    for (const h of headings) {
      // One line: two would be roughly double, and a mid-word break is what two means here.
      expect(h.height, `"${h.text}" wrapped onto a second line`).toBeLessThan(h.lineHeight * 1.6);
    }
  });

  test("a review count does not spill into the column beside it", async ({ page }) => {
    /*
      The counts are whitespace-nowrap, so when "16 reviews" outgrew its 43px column it did not
      wrap - it overflowed, and the neighbouring columns collided into "16 reviews0 reviews" with
      no gap between them. nowrap without the width to back it is how that happens.
    */
    await mockCompanies(page);
    await page.goto("/companies");
    const tile = page.getByTestId("company-tile").first();
    await expect(tile).toBeVisible({ timeout: 10_000 });

    const overflow = await tile.evaluate((el) => {
      const bad: { text: string; over: number }[] = [];
      el.querySelectorAll("p").forEach((p) => {
        const t = (p.textContent ?? "").trim();
        if (!/reviews?$/.test(t)) return;
        const over = p.scrollWidth - p.clientWidth;
        if (over > 0) bad.push({ text: t, over });
      });
      return bad;
    });

    expect(overflow, `counts overflowed their column: ${JSON.stringify(overflow)}`).toEqual([]);
  });
});
