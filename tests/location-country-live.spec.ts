import { test, expect } from "./base";
import type { APIRequestContext } from "@playwright/test";
import { MOCK_USER } from "./fixtures";

/**
 * Country search, against the REAL backend and the REAL corpus.
 *
 * <h2>Why this file exists when location-cross-country.spec.ts already passes</h2>
 *
 * That spec mocks `/api/company-locations/suggest` with a fixture, deliberately: it was written to
 * prove the FRONTEND stops sending the current country as a filter, and a fixture is the right
 * tool for that. The cost is that it cannot see what the server actually answers.
 *
 * And the server was answering badly. Typing "USA" returned eight Canadian businesses - USANA
 * Health Sciences, Usang Kitchenware, usagisushi.ca - and no country at all, while the geography
 * corpus held a United States row with a population of 327 million the whole time. "United
 * Kingdom" returned Kingdom, Illinois and Kingdom Come, Kentucky. Every mocked test passed
 * throughout, because the fixture answered the way the server was supposed to.
 *
 * So these tests talk to the real thing, through the Vite proxy, which is the path a browser
 * takes.
 *
 * <h2>A missing or stale backend fails, it does not pass</h2>
 *
 * The bug above was invisible for two days because the process serving :8888 had been running
 * since before the fix was built. A dev server that predates the change is worse than a stopped
 * one: it looks healthy and serves the old behaviour.
 *
 * So the state of the backend is established before anything is asserted, and the three outcomes
 * are kept apart:
 *
 *   - answering correctly  -> the tests run;
 *   - answering, but with no country for "United States" -> STALE, and the failure says so;
 *   - not answering at all -> absent. Failed locally, where a backend is expected; skipped in CI,
 *     where there is deliberately no backend to talk to.
 *
 * What is NOT done here is quietly falling back to a fixture, which is how this went unnoticed.
 */

/** The eight names from the report, with the corpus's own spelling where it differs from the JDK's. */
const FULL_NAMES: Array<[string, RegExp]> = [
  ["United States",  /^United States$/],
  ["United Kingdom", /^United Kingdom$/],
  ["Canada",         /^Canada$/],
  ["France",         /^France$/],
  ["Germany",        /^Germany$/],
  ["Jamaica",        /^Jamaica$/],
  ["Grenada",        /^Grenada$/],
  ["India",          /^India$/],
];

/** Every alias the report asked for, plus the ones that exercise the same table. */
const ALIASES: Array<[string, RegExp]> = [
  ["USA",         /^United States$/],
  ["US",          /^United States$/],
  ["U.S.A.",      /^United States$/],
  ["America",     /^United States$/],
  ["UK",          /^United Kingdom$/],
  ["GB",          /^United Kingdom$/],
  ["Britain",     /^United Kingdom$/],
  ["UAE",         /^United Arab Emirates$/],
  // The corpus calls NL "The Netherlands" and the JDK calls it "Netherlands". The country is
  // matched by ISO code precisely so the two do not have to agree.
  ["Holland",     /Netherlands/],
  ["South Korea", /Korea/],
];

type State = "ok" | "stale" | "absent";
let cached: State | null = null;

async function suggest(request: APIRequestContext, q: string) {
  const res = await request.get(
    `/api/company-locations/suggest?q=${encodeURIComponent(q)}`, { timeout: 60_000 });
  if (!res.ok()) throw new Error(`suggest("${q}") returned HTTP ${res.status()}`);
  return (await res.json()) as Array<Record<string, any>>;
}

async function backendState(request: APIRequestContext): Promise<State> {
  if (cached) return cached;
  try {
    const rows = await suggest(request, "United States");
    const top = rows[0];
    cached = top?.kind === "geo" && top?.precision === "country" ? "ok" : "stale";
  } catch {
    cached = "absent";
  }
  return cached;
}

const STALE = [
  'The backend answered, but "United States" did not come back as a country.',
  "That is what a process older than the fix looks like: it serves the behaviour it was built",
  "with. Rebuild and restart it, then run this again:",
  "",
  "  cd <backend repo> && mvn -o clean package -DskipTests",
  "  kill <pid listening on the API port>   # exact pid, never pkill -f",
  "  nohup ~/.local/bin/start-<product>-backend.sh > /tmp/<product>-backend.log 2>&1 &",
].join("\n");

const ABSENT = [
  "No backend answered the suggest endpoint through the Vite proxy.",
  "These tests are about what the SERVER returns, so there is nothing to assert without one and",
  "nothing is mocked in its place - a fixture here is what hid the original bug for two days.",
  "Start the backend for this product and run again.",
].join("\n");

/** Fails on a stale backend, fails locally on a missing one, and skips only in CI. */
async function requireLiveBackend(request: APIRequestContext) {
  const state = await backendState(request);
  test.skip(state === "absent" && !!process.env.CI,
    "CI runs the client against a prebuilt bundle with no backend; nothing to query.");
  expect(state, state === "stale" ? STALE : ABSENT).toBe("ok");
}

test.describe("country search against the real corpus", () => {

  test("every full country name resolves to its own country", async ({ request }) => {
    await requireLiveBackend(request);
    for (const [typed, expected] of FULL_NAMES) {
      const rows = await suggest(request, typed);
      const top = rows[0];
      expect(top, `"${typed}" returned nothing`).toBeTruthy();
      expect(top.kind, `"${typed}" led with a ${top?.kind}, not geography`).toBe("geo");
      expect(top.precision, `"${typed}" led with a ${top?.precision}, not a country`).toBe("country");
      expect(top.label, `"${typed}" led with ${top?.label}`).toMatch(expected);
    }
  });

  test("the abbreviations people type resolve to the same countries", async ({ request }) => {
    await requireLiveBackend(request);
    for (const [typed, expected] of ALIASES) {
      const rows = await suggest(request, typed);
      const top = rows[0];
      expect(top, `"${typed}" returned nothing`).toBeTruthy();
      /*
        The country must LEAD. It is not enough for it to be present somewhere in the list: the
        list is eight long and the complaint was that businesses held every seat, so a country in
        ninth place is a country nobody can pick.
      */
      expect(top.precision, `"${typed}" led with ${top?.kind}:${top?.label}`).toBe("country");
      expect(top.label, `"${typed}" led with ${top?.label}`).toMatch(expected);
    }
  });

  test("a city named with its region resolves to that city", async ({ request }) => {
    await requireLiveBackend(request);
    const cases: Array<[string, RegExp]> = [
      ["London, England",   /^London, England, United Kingdom$/],
      ["Toronto, Ontario",  /^Toronto, Ontario, Canada$/],
      ["Paris, Texas",      /^Paris, Texas, United States$/],
      ["Cambridge, Ontario", /^Cambridge, Ontario, Canada$/],
    ];
    for (const [typed, expected] of cases) {
      const rows = await suggest(request, typed);
      expect(rows[0]?.label, `"${typed}" led with ${rows[0]?.label}`).toMatch(expected);
    }
  });

  test("the eight-result limit does not hide other countries", async ({ request }) => {
    await requireLiveBackend(request);
    /*
      Ranking by prominence alone let one city's own subdivisions take every seat: "Paris"
      returned eight rows and all eight were French, because Paris 15 Vaugirard and the other
      arrondissements each outrank Paris, Texas on population. They are the same city, and
      between them they made every other Paris on earth unreachable.

      The client can only reorder what the server sends, so a limit that hides places is the same
      defect as a filter that excluded them.
    */
    for (const typed of ["Paris", "London", "Cambridge", "Richmond", "Waterloo"]) {
      const rows = await suggest(request, typed);
      const countries = new Set(
        rows.filter((r) => r.kind === "geo").map((r) => r.country).filter(Boolean));
      expect(countries.size,
        `"${typed}" offered only ${[...countries].join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  });
});

test.describe("the location field, against the real corpus", () => {

  async function openAddManager(page: any) {
    // Auth and company lookups are mocked because they are not what is under test. The location
    // suggest endpoint deliberately is NOT.
    await page.route("**/api/auth/me", (r: any) => r.fulfill({ json: MOCK_USER }));
    await page.route(/\/api\/geo/, (r: any) => r.fulfill({ json: { country: "Canada" } }));
    await page.route("**/api/companies/suggest**", (r: any) => r.fulfill({ json: [] }));
    await page.goto("/add");
    await page.locator('input[name="firstName"]').fill("Dana");
    await page.locator('input[name="lastName"]').fill("Okafor");
    await page.locator('input[name="title"]').fill("Operations Lead");
  }

  async function typeLocation(page: any, text: string) {
    const edit = page.getByRole("button", { name: /edit location details/i });
    if (await edit.count()) await edit.click();
    const input = page.getByPlaceholder(/city, province, or the workplace itself/i);
    await input.fill(text);
    return input;
  }

  test("typing an alias offers the country in the dropdown", async ({ page, request }) => {
    await requireLiveBackend(request);
    await openAddManager(page);
    await typeLocation(page, "USA");

    /*
      The reported symptom, in the browser, with nothing mocked between the field and the corpus:
      "nothing in the drop down appears". What actually appeared was eight businesses.
    */
    await expect(page.getByText(/^United States$/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("an existing country can be replaced by a different one", async ({ page, request }) => {
    await requireLiveBackend(request);
    await openAddManager(page);

    await typeLocation(page, "Toronto");
    const toronto = page.getByText(/Toronto, Ontario, Canada/).first();
    await expect(toronto).toBeVisible({ timeout: 20_000 });
    await toronto.click();

    /*
      The invariant: an existing location must never prevent somebody searching for or selecting a
      different one. Asserted here against the real server, so it covers both halves - the client
      not sending the country as a filter, and the server not assuming one.
    */
    await typeLocation(page, "United Kingdom");
    const uk = page.getByText(/^United Kingdom$/).first();
    await expect(uk).toBeVisible({ timeout: 20_000 });
    await uk.click();

    await expect(page.getByText(/United Kingdom/).first()).toBeVisible();
  });
});
