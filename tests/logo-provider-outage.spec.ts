import { test, expect } from "./base";
import { MOCK_MANAGERS_LIST, mockDirectoryPage } from "./fixtures";

/**
 * A logo.dev outage must not strip every logo from the site.
 *
 * On 2026-09-26 logo.dev's monthly allowance ran out - 500k requests, spent by a token that
 * ships in this bundle, so every visitor draws on it. It answered
 *
 *     429 {"msg":"monthly request limit exceeded"}
 *
 * for every domain. There was exactly one provider between the stored URL and the letter
 * initial, so the whole site rendered as letters for days. Nothing failed, nothing alerted; the
 * live site just quietly looked broken.
 *
 * The chain now has a free, unmetered rung beneath logo.dev. These tests hold it there: the one
 * below proves a 429 still yields a LOGO, and the fallback-to-initial behaviour keeps its own
 * coverage in company-logo-fallback.spec.ts for when every source is gone.
 */

const COMPANY = MOCK_MANAGERS_LIST[0].company as string;

/** Exactly what production saw: logo.dev refusing everything, everything else fine. */
async function withLogoDevOverQuota(page: any) {
  await page.route(/img\.logo\.dev/, (r: any) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ msg: "monthly request limit exceeded" }),
    }),
  );
}

test.describe("When logo.dev has burned its monthly quota", () => {
  /** A manager whose company identity IS resolved - the only case a provider is asked about. */
  const RESOLVED = MOCK_MANAGERS_LIST.map((m: any) => ({ ...m, companyDomain: "example.com" }));

  test("Brandfetch is tried for the same domain", async ({ page }) => {
    /*
      The failover, and the reason it needs no database: Brandfetch's URL is built from the SAME
      domain logo.dev was given, so a company that has never been stored still gets a second
      chance. Asserted on the request, because the stub in base.ts answers both providers.
    */
    const asked: string[] = [];
    page.on("request", (r) => { if (r.url().includes("brandfetch")) asked.push(r.url()); });

    await withLogoDevOverQuota(page);
    await mockDirectoryPage(page, { managers: RESOLVED } as any);
    await page.goto("/directory");
    await expect(page.getByText(MOCK_MANAGERS_LIST[0].name).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    expect(asked.length, "logo.dev failing must hand over to Brandfetch").toBeGreaterThan(0);
    expect(asked[0]).toContain("example.com");
    expect(asked[0], "an unknown brand must 404 rather than serve a placeholder")
      .toContain("fallback/404");
  });

  test("a company with no resolved identity asks nobody", async ({ page }) => {
    /*
      The other half. A domain guessed from a name renders a DIFFERENT company's logo with full
      confidence - lime.com is not Lime - so an unresolved company is worth no request at all.
    */
    const asked: string[] = [];
    page.on("request", (r) => {
      if (/logo\.dev|brandfetch/.test(r.url())) asked.push(r.url());
    });

    await mockDirectoryPage(page);
    await page.goto("/directory");
    await expect(page.getByText(MOCK_MANAGERS_LIST[0].name).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    expect(asked, "no identity means no guess").toHaveLength(0);
  });
});
