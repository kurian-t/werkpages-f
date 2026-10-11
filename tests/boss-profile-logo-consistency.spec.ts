import { test, expect } from "./base";
import { MOCK_MANAGER, MOCK_USER, TEST_MANAGER_ID, mockManagerPage } from "./fixtures";

/**
 * One company, one logo.
 *
 * <h2>The bug</h2>
 *
 * The profile header and the career trajectory showed two different marks for the SAME employer,
 * on the same page, at the same time.
 *
 * They were read from two different tables. The header took {@code managers.company_logo_url} - a
 * logo stored on the manager row - while a career tile takes {@code companies.logo_url} for the
 * company its {@code career_history} row points at. Nothing keeps those two columns equal: they
 * are filled by different paths at different times, and each can resolve a different domain for
 * the same brand. So one employer could carry one logo above the fold and another on the tile for
 * that very job.
 *
 * <h2>The rule being protected</h2>
 *
 * The trajectory is the authority, because {@code companies.logo_url} is the shared identity the
 * company page and every company tile already use. The header follows the NEWEST tile that is
 * about the manager's current company, so "the latest tile matches the header" holds by
 * construction. Past tiles keep the logo of the company THEY were at - a past employer showing
 * its own mark was an earlier fix here, and this must not undo it.
 *
 * <h2>Why it is asserted this way</h2>
 *
 * By collecting every rendered logo for one company name and requiring a single distinct src.
 * Asserting "the header shows X" would pass while a tile below it still showed Y, which is exactly
 * the state that shipped. The invariant is that one company cannot produce two images.
 */

/* Deliberately different values for the same company. That difference IS the bug. */
const COMPANY_ROW_LOGO  = "https://img.logo.dev/acme-identity.example?token=test";
const STALE_MANAGER_LOGO = "https://img.logo.dev/stale-manager-snapshot.example?token=test";
const PAST_COMPANY_LOGO  = "https://img.logo.dev/initech-identity.example?token=test";

/**
 * A manager at Acme Corp whose manager row carries a stale logo, whose current company's own row
 * carries the real one, and who has a past job at Initech with its own.
 */
const MANAGER = {
  ...MOCK_MANAGER,
  companyLogoUrl: STALE_MANAGER_LOGO,
  careerHistory: [
    {
      id: "ch-2",
      title: "Engineering Manager",
      company: "Acme Corp",
      startDate: "2021-06",
      endDate: null,
      companyLogoUrl: COMPANY_ROW_LOGO,
    },
    {
      id: "ch-1",
      title: "Team Lead",
      company: "Initech",
      startDate: "2018-01",
      endDate: "2021-05",
      companyLogoUrl: PAST_COMPANY_LOGO,
    },
  ],
};

/* A 1x1 PNG, served in place of a real logo request. See serveLogos. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMB/6s1pgQAAAAASUVORK5CYII=",
  "base64");

/**
 * Make every logo host load, rather than fail.
 *
 * Not the cause of the failure this spec had - that was the sideways scroll, see logoSrcsFor - but
 * worth keeping on its own merits.
 *
 * The URLs above are example domains that resolve to nothing, so each <img> fired onError, and
 * CompanyLogoImg answers that by recording the dead URL in a module-level `failedLogos` set and
 * walking to the next candidate. Letting that happen makes what the DOM finally holds depend on
 * how quickly a lookup fails, which is not something this spec should be sensitive to.
 *
 * It also stops the suite firing requests at img.logo.dev, which is metered.
 */
async function serveLogos(page: any) {
  for (const pattern of ["**img.logo.dev/**", "**cdn.brandfetch.io/**"]) {
    await page.route(pattern, (r: any) =>
      r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  }
}

async function openProfile(page: any, manager: unknown = MANAGER) {
  await serveLogos(page);
  await mockManagerPage(page, {
    manager: manager as any, loggedIn: true, user: { ...MOCK_USER, hasContributed: true },
  });
  await page.goto(`/manager/${TEST_MANAGER_ID}`);
  await expect(page.getByRole("heading", { name: MOCK_MANAGER.name, exact: true }))
    .toBeVisible({ timeout: 10_000 });
}

/**
 * Every rendered logo for one company, by the alt text CompanyLogoImg gives its img.
 *
 * CompanyLogoImg renders its <img> only once the element is near the viewport; until then it holds
 * an aria-hidden placeholder of the same size. So a logo that has not been scrolled to does not
 * exist in the DOM, and every element has to be brought on screen before counting.
 *
 * BOTH AXES, and the second one is the one that matters. The career trajectory is a horizontally
 * scrolling strip - it says "Scroll to explore" - so on a phone the LATEST role, which is the
 * rightmost tile and the very one that has to agree with the header, sits off the right edge.
 * Scrolling the window down can never reach it: the page is not what scrolls.
 *
 * That is why this spec passed on desktop and failed on Mobile Chrome. A wide viewport fits both
 * tiles with no sideways scroll at all, so the bug in this helper was invisible there. Diagnosing
 * it as vertical lazy-loading, and then as a logo load race, fixed neither - it is a different
 * axis, not a timing problem.
 */
async function logoSrcsFor(page: any, company: string, minCount = 1): Promise<string[]> {
  const imgs = page.locator(`img[alt="${company}"]`);
  /*
    The walk is INSIDE the poll and re-measures every pass, because the trajectory's size is not
    known until it has rendered and its strip cannot be scrolled before it exists.
  */
  await expect.poll(async () => {
    await page.evaluate(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)));

      const vStep = Math.max(200, Math.floor(window.innerHeight / 2));
      for (let y = 0; y <= document.body.scrollHeight; y += vStep) {
        window.scrollTo(0, y);
        await raf();
      }

      // Then every sideways-scrolling strip on the page, to its far end. Found by measurement
      // rather than by class name, so it keeps working if the trajectory's markup changes.
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const hStep = Math.max(100, Math.floor(el.clientWidth / 2));
        for (let x = 0; x <= el.scrollWidth; x += hStep) {
          el.scrollLeft = x;
          await raf();
        }
      }

      window.scrollTo(0, 0);
    });
    return imgs.count();
  }, { timeout: 20_000, message: `waiting for ${minCount} rendered logo(s) for ${company}` })
    .toBeGreaterThanOrEqual(minCount);

  return imgs.evaluateAll((els: Element[]) =>
    els.map((e) => (e as HTMLImageElement).getAttribute("src") ?? ""));
}

/**
 * Which company a logo URL is for, ignoring which token fetched it.
 *
 * logoCandidates deliberately offers a stored img.logo.dev URL AND the same domain rebuilt with
 * the current token, so that a URL saved with a rotated-out token still resolves. Those two are
 * the same logo. Comparing raw srcs called them a disagreement, and firefox proved it: when two
 * <img> elements ask for one intercepted URL the second request errors, the chain steps to the
 * token-refreshed rung, and the test reported "two logos" for two fetches of one image.
 *
 * So identity is the DOMAIN the logo is for, which is what "the same logo" actually means. The
 * bug this spec guards is a different company's mark appearing - acme-identity against
 * stale-manager-snapshot - and those are still two identities, so it is still caught.
 */
function logoIdentity(src: string): string {
  const logoDev = /^https?:\/\/img\.logo\.dev\/([^/?#]+)/i.exec(src);
  if (logoDev) return decodeURIComponent(logoDev[1]).toLowerCase();
  const brandfetch = /^https?:\/\/cdn\.brandfetch\.io\/([^/?#]+)/i.exec(src);
  if (brandfetch) return decodeURIComponent(brandfetch[1]).toLowerCase();
  return src.split("?")[0];
}

test.describe("One company never shows two different logos", () => {
  test("the header and the career tile agree for the current employer", async ({ page }) => {
    await openProfile(page);

    const srcs = await logoSrcsFor(page, "Acme Corp", 2);

    // More than one place renders it, or this proves nothing.
    expect(srcs.length, "expected the header AND a career tile for the current company")
      .toBeGreaterThan(1);
    expect(new Set(srcs.map(logoIdentity)).size,
      `one company, one logo - got ${JSON.stringify(srcs)}`).toBe(1);
  });

  test("the agreed logo is the company's own, not the manager row's stale snapshot", async ({ page }) => {
    /*
      Direction matters. Making the tile follow the header would also make them agree, and would
      be wrong: the manager row's copy is the one that goes stale, and the company's row is what
      the company page and company tiles show.
    */
    await openProfile(page);

    const srcs = await logoSrcsFor(page, "Acme Corp", 2);

    expect(srcs.every((s) => s.includes("acme-identity"))).toBe(true);
    expect(srcs.some((s) => s.includes("stale-manager-snapshot"))).toBe(false);
  });

  test("a past employer keeps its own logo", async ({ page }) => {
    /*
      The earlier fix in this area, guarded. Past companies once inherited the manager's current
      logo, so an old job displayed the new employer's brand. Sharing one logo for the CURRENT
      company must not spread it backwards.
    */
    await openProfile(page);

    const past = await logoSrcsFor(page, "Initech");

    expect(past.every((s) => s.includes("initech-identity")).valueOf()).toBe(true);
    expect(past.some((s) => s.includes("acme-identity"))).toBe(false);
    expect(past.some((s) => s.includes("stale-manager-snapshot"))).toBe(false);
  });

  test("a company with no logo of its own falls back to the manager's stored one", async ({ page }) => {
    /*
      The fallback, which is why this is a preference and not a hard switch. A company row that has
      no logo yet must not blank the header - the manager's stored copy is better than nothing, and
      the tile uses the same fallback, so the two still agree.
    */
    await openProfile(page, {
      ...MANAGER,
      careerHistory: [{ ...MANAGER.careerHistory[0], companyLogoUrl: null }],
    });

    const srcs = await logoSrcsFor(page, "Acme Corp");

    expect(new Set(srcs.map(logoIdentity)).size,
      `still one logo - got ${JSON.stringify(srcs)}`).toBe(1);
    expect(srcs[0]).toContain("stale-manager-snapshot");
  });
});
