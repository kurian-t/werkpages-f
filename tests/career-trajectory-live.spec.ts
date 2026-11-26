/**
 * The career trajectory, against the REAL backend and the REAL database.
 *
 * <h2>Why live, and why LOCAL ONLY</h2>
 *
 * The ordering rule is unit tested in client/lib/careerRoles.test.ts, which is where the logic
 * belongs. What a unit test cannot show is that the two new fields actually arrive: `periodKnown`
 * and `employmentStatus` were missing from the careerHistory JSON entirely, so the page could not
 * tell "nobody dated this employment" from "this employment is still running" and drew every
 * undated job as the person's current one. A mocked fixture would have supplied whatever fields
 * the test author remembered.
 *
 * It needs a backend and a migrated database, so it must never run in CI. Its project is DEFINED
 * ONLY when CAREER_TRAJECTORY_LIVE=1, the same mechanism title-picker-live uses: Playwright runs
 * every project a config declares, so testIgnore alone is not enough and the project itself has
 * to not exist. No workflow sets that variable.
 *
 * Running it:  pnpm test:trajectory
 */
import { test, expect } from "./base";

/** Marguerite Danforth: three employments, one of them undated. Seeded in the local database. */
const MANAGER = 21;

test.describe("The career trajectory, live", () => {
  test("the backend sends whether a period is known and what the status is", async ({ request }) => {
    const res = await request.get(`/api/managers/${MANAGER}`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const m = body.data ?? body;
    const history = m.careerHistory ?? [];
    expect(history.length).toBeGreaterThan(1);

    for (const row of history) {
      // Present on every row, not just the ones that happen to have dates.
      expect(row).toHaveProperty("periodKnown");
      expect(row).toHaveProperty("employmentStatus");
    }

    // And at least one row has no stated period, which is the case the page got wrong.
    expect(history.some((r: any) => r.periodKnown === false)).toBeTruthy();
  });

  test("an undated employment is sent as the OLDEST, not the newest", async ({ request }) => {
    /*
      The aggregate orders start_date DESC NULLS LAST, so in a newest-first list an undated row
      comes last. getCareerHistory used a bare DESC, whose PostgreSQL default is NULLS FIRST, and
      disagreed with this about the same rows.
    */
    const body = await (await request.get(`/api/managers/${MANAGER}`)).json();
    const history = (body.data ?? body).careerHistory ?? [];

    const firstUndated = history.findIndex((r: any) => r.startDate == null);
    const lastDated    = history.reduce(
      (acc: number, r: any, i: number) => (r.startDate != null ? i : acc), -1);

    expect(firstUndated).toBeGreaterThan(lastDated);
  });

  /*
    THE DOM ORDERING IS NOT TESTED HERE, DELIBERATELY.

    The Career Performance Trajectory is contribution-gated: an anonymous visitor is shown "Rate a
    manager to unlock the performance trajectory" and the tiles are never rendered. A live spec has
    no contributor session to offer - that is the auth-fixture gap tracked as issue 26 - so
    asserting on the tiles here would only ever assert on the gate.

    The rendering and the order are covered in tests/career-trajectory-order.spec.ts, which mocks
    the profile and can therefore say hasContributed: true. What is proved HERE is the half a mock
    cannot prove: that the real backend sends periodKnown and employmentStatus at all, and sends an
    undated employment as the oldest.
  */
});
