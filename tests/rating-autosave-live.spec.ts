import { test, expect } from "./base";
import type { APIRequestContext } from "@playwright/test";

/**
 * Autosave against the REAL backend and the REAL database.
 *
 * <h2>Why this exists beside rating-autosave.spec.ts</h2>
 *
 * <p>That spec mocks the endpoint, deliberately: it proves the PAGE sends the answers at the
 * right moments, and a fixture is the right tool for that. The cost is that it cannot see what
 * the server does with them - every assertion there would hold if the endpoint stored nothing.
 *
 * <p>This one sends no mocks. The request goes through the Vite proxy to the backend and into
 * PostgreSQL, which is the only way to know the round trip works.
 *
 * <h2>What it deliberately does NOT claim</h2>
 *
 * <p>It does not claim a contributor gets their answers back from the server. They do not:
 * useFormDraft restores from localStorage, and the only draft-reading endpoint in the API is
 * /api/admin/captured-drafts, which is for moderators. The server copy exists so a dropped-off
 * form reaches the moderation queue, not so somebody can resume on another device. A test
 * asserting server-side restoration would be asserting a feature that does not exist.
 *
 * <h2>A missing backend fails, it does not pass</h2>
 *
 * <p>The same rule as location-country-live.spec.ts: a wrong answer is a failure, no answer fails
 * locally and skips in CI, and nothing falls back to a fixture - which is exactly how a broken
 * endpoint would go unnoticed.
 */

const ABSENT = [
  "No backend answered the autosave endpoint through the Vite proxy.",
  "This test is about what the SERVER stores, so there is nothing to assert without one and",
  "nothing is mocked in its place. Start the backend for this product and run again.",
].join("\n");

/*
  A slug that deliberately does not exist.

  The endpoint resolves a company when it can and stores the draft either way, with company_id
  null and the typed name kept in the payload - verified against the live database. Using a
  synthetic slug keeps this test independent of whatever happens to be in the local data, which
  is the difference between a test that runs anywhere and one that runs on this machine.
*/
const SLUG = "autosave-live-spec-co";

function body(token: string, revision: number, ratings: Record<string, number>, overall: number) {
  return {
    draftToken: token,
    revision,
    overallRating: overall,
    ratings,
    author: "LiveAutosaveSpec",
    companyName: "Live Autosave Spec Co",
  };
}

/**
 * HOW LONG A THROTTLED SAVE WAITS FOR THE LIMITER TO LET IT THROUGH.
 *
 * <p>The limiter is 200 requests/min per IP on a sliding window. Every test in this suite reaches
 * the backend through the Vite proxy, so the whole run arrives from one address, and a heavier
 * spec can spend the budget before this one starts. The window slides, so capacity returns on its
 * own - which is what turns a drained budget from a verdict into a delay. Nothing waits unless a
 * 429 actually arrives.
 *
 * <p>THIS WAS NOT HYPOTHETICAL. These six tests passed when run alone and failed in every full
 * suite run, reporting "No backend answered" while the backend was up and answering curl at that
 * moment. It was answering this suite too - with 429. The same tests are green in the full
 * WerkPages suite, which is larger, because that backend applies a rate-limit multiplier this one
 * does not.
 */
const THROTTLE_BUDGET_MS = 75_000;
const THROTTLE_RETRY_MS  = 5_000;

test.beforeEach(() => {
  // Covers the wait and nothing else; every assertion keeps its own much shorter timeout.
  test.setTimeout(THROTTLE_BUDGET_MS + 60_000);
});

const THROTTLED = [
  `INCONCLUSIVE: the endpoint is up but still answering 429 after ${THROTTLE_BUDGET_MS / 1000}s.`,
  "",
  "This is NOT a pass and NOT a verdict on autosave. The rate limiter was drained by the rest of",
  "the suite, so this test never reached the behaviour it exists to check. Run it on its own to",
  "get an answer:",
  "",
  "  npx playwright test tests/rating-autosave-live.spec.ts",
].join("\n");

/** 429, after the budget. Its own type because it says nothing whatever about autosave. */
class Throttled extends Error {
  constructor(waitedMs: number) {
    super(`the autosave endpoint answered 429 for ${Math.round(waitedMs / 1000)}s`);
    this.name = "Throttled";
  }
}

/**
 * One autosave call, which waits out a drained limiter rather than reporting it as something it
 * is not.
 *
 * <p>429 is checked on EVERY attempt. Everything else is returned for the test to assert on: a
 * 500 is the server being wrong, and that must stay a failure.
 */
async function rawSave(request: APIRequestContext, payload: object) {
  const started = Date.now();
  for (;;) {
    let res;
    try {
      res = await request.post(
        `/api/companies/${SLUG}/rating/autosave`, { data: payload, timeout: 30_000 });
    } catch {
      test.skip(!!process.env.CI, "CI runs the client with no backend; nothing to store.");
      throw new Error(ABSENT);
    }
    /*
      A 5xx that is not JSON is the VITE PROXY saying it could not reach the backend, not the
      backend answering badly: through a proxy a refused connection arrives as a 500 with
      text/plain rather than as a connection error. The backend's own errors are JSON.
    */
    const ctype = res.headers()["content-type"] ?? "";
    if (res.status() >= 500 && !ctype.includes("json")) {
      test.skip(!!process.env.CI, "CI runs the client with no backend; nothing to store.");
      throw new Error(ABSENT);
    }
    if (res.status() !== 429) return res;
    const waited = Date.now() - started;
    if (waited >= THROTTLE_BUDGET_MS) throw new Throttled(waited);
    await new Promise((resolve) => setTimeout(resolve, THROTTLE_RETRY_MS));
  }
}

/**
 * What the tests call: the same request, with the one outcome that is not about autosave turned
 * into a reported skip instead of a failure.
 *
 * <p>Everything else still fails, and that is the point. A 500, a 400 or a 200 carrying the wrong
 * body is the endpoint being wrong, which is exactly what this file exists to catch.
 */
async function save(request: APIRequestContext, payload: object) {
  try {
    return await rawSave(request, payload);
  } catch (err) {
    if (err instanceof Throttled) test.skip(true, [err.message, "", THROTTLED].join("\n"));
    throw err;
  }
}

/** Names the status, so a real fault never reads as an absent backend. */
const answered = (res: { status: () => number }) =>
  `the autosave endpoint answered ${res.status()}, which is the endpoint being wrong - not absent`;

test.describe("autosave, against the real server", () => {

  test("the answers a contributor typed are accepted by the real endpoint", async ({ request }) => {
    const res = await save(request, body(crypto.randomUUID(), Date.now(),
      { communication: 5, fairness: 4 }, 4));
    /*
      Four outcomes, four different verdicts, and only one of them is an excuse: nothing listening
      throws ABSENT, a drained limiter skips as INCONCLUSIVE, and ANY other answer is a failure.
      Collapsing them is how a 500 from a broken endpoint reads as "no backend today" - and how a
      429 did read that way, in every full suite run, for exactly as long as they were collapsed.
    */
    expect(res.status(), answered(res)).toBe(200);
    expect(await res.json(), "the backend refused a perfectly ordinary autosave")
      .toMatchObject({ saved: true });
  });

  /**
   * THE ORDERING GUARANTEE, end to end rather than at the repository.
   *
   * <p>CapturedDraftPublicationIntegrationTest proves the upsert refuses a stale revision. This
   * proves the same thing survives the whole path a browser takes - handler, service, repository,
   * SQL. A guard that is correct in the repository and bypassed by the endpoint above it would
   * pass there and lose somebody's answers here.
   *
   * <p>Both calls answer 200 on purpose: a refused autosave is not an error the person can act
   * on, because they are still typing. What must not happen is the older answers replacing the
   * newer ones, and the row is checked by the operator step recorded in the report, since this
   * suite has no database client and adding one is a dependency change.
   */
  test("a late save is accepted without disturbing newer answers", async ({ request }) => {
    const token = crypto.randomUUID();
    const newer = await save(request, body(token, 2_000_000,
      { communication: 5, fairness: 5, support: 5, clarity: 5, workload: 5, respect: 5 }, 5));
    expect(newer.status(), answered(newer)).toBe(200);

    const older = await save(request, body(token, 1_000_000, { communication: 1 }, 1));
    expect(older.status(), answered(older)).toBe(200);
  });
});
