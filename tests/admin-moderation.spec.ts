import { test, expect } from "./base";
import { MOCK_USER, mockAdminPage } from "./fixtures";

/**
 * The admin moderation queues: proposed employment, conflicts, and held ratings.
 *
 * <h2>What this proves and what it does not</h2>
 *
 * <p>It proves the screen asks the server for the right thing, shows a moderator why a rating is
 * not public and what would release it, counts corroboration honestly, and reports what the server
 * actually did rather than assuming success.
 *
 * <p>It does NOT prove a rating was published. A mocked route answering 200 would pass whatever the
 * backend did, which is precisely how a decision that published nothing could reach production
 * looking fine. ModerationIntegrationTest owns that half, against a real database and the real
 * publication predicate.
 *
 * <h2>Route order</h2>
 *
 * <p>Every route here is registered AFTER mockAdminPage, which installs one catch-all for
 * /api/admin. Playwright matches in reverse registration order, so a route registered first never
 * sees the request and every assertion below would be vacuous.
 */

const SUMMARY = {
  pendingEmployments: 2,
  oldestEmploymentAt: new Date(Date.now() - 32 * 86_400_000).toISOString(),
  openConflicts: 1,
  openBlockingConflicts: 1,
  oldestConflictAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  heldRatings: 3,
  oldestHeldRatingAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
};

/** Two signed-in contributors agree, and two anonymous claims might be one visitor twice. */
const CORROBORATED = {
  roleId: 41,
  managerId: 7,
  managerName: "Priya Raghunathan",
  managerSlug: "priya-r",
  managerStatus: "approved",
  companyId: 3,
  company: "Halverson Logistics",
  title: "Depot Supervisor",
  startDate: "2023-03-01",
  endDate: null,
  periodKnown: true,
  provenance: "contributor",
  proposedAt: new Date(Date.now() - 32 * 86_400_000).toISOString(),
  corroboratingAccounts: 2,
  anonymousClaims: 2,
  totalClaims: 4,
  heldRatings: 3,
  blockingConflicts: 0,
};

const ALSO_CONFLICTED = {
  ...CORROBORATED,
  roleId: 42,
  title: "Dispatch Lead",
  corroboratingAccounts: 1,
  anonymousClaims: 0,
  totalClaims: 1,
  heldRatings: 1,
  blockingConflicts: 1,
};

const DETAIL = {
  employment: { ...CORROBORATED, state: "proposed" },
  claims: [
    {
      claimId: 101, assertedTitle: "Depot Supervisor", assertedStart: "2023-03-01",
      assertedEnd: null, periodKnown: true, stillThere: false, resolution: "created",
      finalizedAt: new Date().toISOString(), fromAccount: true, ratings: 1,
    },
    {
      claimId: 102, assertedTitle: "depot supervisor", assertedStart: "2023-03-01",
      assertedEnd: null, periodKnown: true, stillThere: false, resolution: "created",
      finalizedAt: new Date().toISOString(), fromAccount: false, ratings: 1,
    },
  ],
  heldRatings: [
    { reviewId: "r-1", submittedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      overallRating: 4, title: "Depot Supervisor", company: "Halverson Logistics",
      wouldPublishNow: true },
    { reviewId: "r-2", submittedAt: new Date().toISOString(), overallRating: 3,
      title: "Depot Supervisor", company: "Halverson Logistics", wouldPublishNow: false },
  ],
  managerHistory: [
    { roleId: 40, company: "Halverson Logistics", title: "Dispatch Lead", state: "accepted",
      periodKnown: true, startDate: "2021-01-01", endDate: "2023-02-01" },
  ],
};

const CONFLICT = {
  conflictId: 55,
  kind: "possible_duplicate",
  blocksPublication: true,
  managerId: 7,
  managerName: "Priya Raghunathan",
  companyName: "Halverson Logistics",
  title: "Depot Supervisor",
  period: "2023",
  detectedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  roleId: 41,
  otherRoleId: 40,
  subjectClaims: 1,
  evidenceClaims: 1,
  heldRatings: 1,
};

const CONFLICT_DETAIL = {
  ...CONFLICT,
  resolvedAt: null,
  resolution: null,
  note: null,
  claims: [
    { claimId: 101, role: "subject", assertedTitle: "Depot Supervisor",
      assertedStart: "2023-03-01", assertedEnd: null, periodKnown: true, stillThere: false,
      resolution: "created", finalizedAt: new Date().toISOString(), fromAccount: true,
      resolvedRoleId: 41, heldRatings: 1, ratings: 1 },
    { claimId: 103, role: "evidence", assertedTitle: "Dispatch Lead",
      assertedStart: "2021-01-01", assertedEnd: "2023-02-01", periodKnown: true,
      stillThere: false, resolution: "linked", finalizedAt: new Date().toISOString(),
      fromAccount: true, resolvedRoleId: 40, heldRatings: 0, ratings: 1 },
  ],
};

/**
 * An employment-status dispute, which is the one conflict kind answered rather than resolved.
 *
 * <p>Informational by design: it never held a rating, which is why blocksPublication is false and
 * heldRatings is 0. The claim is attached as EVIDENCE and never as the subject, because the
 * employment is what is in doubt and not the contributor's rating.
 */
const STATUS_DISPUTE = {
  conflictId: 77,
  kind: "employment_status_dispute",
  blocksPublication: false,
  managerId: 7,
  managerName: "Priya Raghunathan",
  companyName: "Halverson Logistics",
  title: "Depot Supervisor",
  period: "unknown",
  detectedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  roleId: 41,
  otherRoleId: null,
  subjectClaims: 0,
  evidenceClaims: 2,
  heldRatings: 0,
};

/**
 * Its detail: a case of THREE employment records, two disputed and one not.
 *
 * <p>This is the shape that makes the queue item unlike every other one. career_history's
 * uniqueness only stops duplicate live roles when the period is KNOWN, so an unknown-period
 * employment can legitimately be several rows and detection disputes each of them under one case.
 * The third row already carries somebody else's determination and the answer leaves it alone.
 *
 * <p>The evidence is two claims: one whose latest statement was restated later, and one since
 * withdrawn. Both are facts a moderator needs before overriding what contributors said.
 */
const STATUS_DISPUTE_DETAIL = {
  ...STATUS_DISPUTE,
  resolvedAt: null,
  resolution: null,
  note: null,
  claims: [
    { claimId: 201, role: "evidence", assertedTitle: "Depot Supervisor",
      assertedStart: "2021-01-01", assertedEnd: "2023-02-01", periodKnown: true,
      stillThere: true, resolution: "linked", finalizedAt: new Date().toISOString(),
      fromAccount: true, resolvedRoleId: 41, heldRatings: 0, ratings: 1,
      withdrawn: false, leftOn: "2024-08-01", saidAt: new Date().toISOString(),
      restated: true },
    { claimId: 202, role: "evidence", assertedTitle: "Depot Supervisor",
      assertedStart: "2022-01-01", assertedEnd: "2023-05-01", periodKnown: true,
      stillThere: true, resolution: "linked", finalizedAt: new Date().toISOString(),
      fromAccount: false, resolvedRoleId: 41, heldRatings: 0, ratings: 1,
      withdrawn: true, leftOn: "2023-05-01", saidAt: null, restated: false },
  ],
  caseEmployments: [
    { roleId: 41, title: "Depot Supervisor", startDate: null, endDate: "2024-02-01",
      periodKnown: false, employmentStatus: "disputed", statusAsOf: null, statusBasis: null,
      willBeDetermined: true },
    { roleId: 43, title: "Depot Supervisor", startDate: null, endDate: "2024-03-01",
      periodKnown: false, employmentStatus: "disputed", statusAsOf: null, statusBasis: null,
      willBeDetermined: true },
    { roleId: 45, title: "Depot Supervisor", startDate: null, endDate: null,
      periodKnown: false, employmentStatus: "ended", statusAsOf: "2024-01-31T00:00:00Z",
      statusBasis: "moderator", willBeDetermined: false },
  ],
};

const HELD = [
  {
    reviewId: "r-1", submittedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    managerId: 7, managerName: "Priya Raghunathan", managerSlug: "priya-r",
    title: "Depot Supervisor", company: "Halverson Logistics", overallRating: 4,
    claimId: 101, roleId: 41, roleState: "proposed", roleTitle: "Depot Supervisor",
    blockingConflictId: null, blockingConflictKind: null,
    whyHeld: "The employment it names is proposed.",
    actionToRelease: "Accept the employment.",
    wouldPublishNow: false,
  },
  {
    reviewId: "r-3", submittedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    managerId: 7, managerName: "Priya Raghunathan", managerSlug: "priya-r",
    title: "Dispatch Lead", company: "Halverson Logistics", overallRating: 2,
    claimId: 104, roleId: 40, roleState: "accepted", roleTitle: "Dispatch Lead",
    blockingConflictId: 55, blockingConflictKind: "possible_duplicate",
    whyHeld: "It is the subject of an open possible_duplicate conflict.",
    actionToRelease: "Resolve that conflict.",
    wouldPublishNow: false,
  },
];

/** A reopen outcome: the rejection stands, nothing is published, one claim is outstanding. */
const REOPENED = {
  reopenedFrom: 41,
  roleId: 44,
  state: "proposed",
  ratingsPublished: 0,
  claimsToReconcile: [
    { claimId: 105, assertedTitle: "Depot Supervisor", assertedStart: "2023-03-01",
      assertedEnd: null, periodKnown: true, stillThere: false, resolution: null,
      finalizedAt: new Date().toISOString(), fromAccount: true, ratings: 1 },
  ],
  heldRatings: [
    { reviewId: "r-9", submittedAt: new Date().toISOString(), overallRating: 4,
      title: "Depot Supervisor", company: "Halverson Logistics", wouldPublishNow: false },
  ],
};

/** A rejected employment, which is what the reopen action needs to be offered. */
const REJECTED_DETAIL = {
  employment: { ...CORROBORATED, state: "rejected", reopenedFrom: null, supersededBy: null },
  claims: DETAIL.claims,
  heldRatings: DETAIL.heldRatings,
  managerHistory: [],
};

/**
 * A timeline whose events include one on an ABSORBED employment, a platform actor and a
 * withdrawn one, because those are the three the screen has to describe differently.
 */
const HISTORY = {
  roleId: 41,
  employmentsInScope: 2,
  lineageComplete: true,
  cycleDetected: false,
  hasMore: false,
  nextCursor: null,
  events: [
    { kind: "role_correction", roleId: 41, onThisRole: true,
      at: new Date(Date.now() - 86_400_000).toISOString(), what: "title",
      was: "Depot Supervisor", nowIs: "Depot Manager", reason: "employer directory",
      detail: null, actorKind: "admin", by: "mina" },
    { kind: "claim_resolution", roleId: 41, onThisRole: true,
      at: new Date(Date.now() - 2 * 86_400_000).toISOString(), what: "resolved",
      was: null, nowIs: "linked", reason: "automatic", detail: "claim 101",
      actorKind: "platform", by: null },
    { kind: "role_correction", roleId: 40, onThisRole: false,
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(), what: "start_date",
      was: "2021-01-01", nowIs: "2020-06-01", reason: "payroll", detail: null,
      actorKind: "withdrawn", by: null },
  ],
};

/** Two pages, so Load older has somewhere to go. */
const HISTORY_PAGE_1 = {
  ...HISTORY,
  hasMore: true,
  nextCursor: "Y3Vyc29yLW9uZQ",
  events: [HISTORY.events[0]],
};
const HISTORY_PAGE_2 = {
  ...HISTORY,
  hasMore: false,
  nextCursor: null,
  events: [HISTORY.events[1], HISTORY.events[2]],
};

type Routes = {
  employments?: any[];
  detail?: any;
  conflicts?: any[];
  conflictDetail?: any;
  held?: any[];
  onAccept?: (route: any) => void;
  onReject?: (route: any) => void;
  onResolve?: (route: any) => void;
  onDetermine?: (route: any) => void;
  onLink?: (route: any) => void;
  onMerge?: (route: any) => void;
  onCorrect?: (route: any) => void;
  onReopen?: (route: any) => void;
  history?: any;
  historyPages?: any[];
};

async function openAdmin(page: any, r: Routes = {}) {
  await mockAdminPage(page);

  await page.route("**/api/admin/moderation/summary", (route: any) =>
    route.fulfill({ json: SUMMARY }));
  await page.route("**/api/admin/moderation/employments?*", (route: any) =>
    route.fulfill({ json: { data: r.employments ?? [CORROBORATED, ALSO_CONFLICTED] } }));
  await page.route("**/api/admin/moderation/employments/*", (route: any) =>
    route.fulfill({ json: r.detail ?? DETAIL }));
  await page.route("**/api/admin/moderation/conflicts?*", (route: any) =>
    route.fulfill({ json: { data: r.conflicts ?? [CONFLICT] } }));
  await page.route("**/api/admin/moderation/conflicts/*", (route: any) =>
    route.fulfill({ json: r.conflictDetail ?? CONFLICT_DETAIL }));
  await page.route("**/api/admin/moderation/held-ratings?*", (route: any) =>
    route.fulfill({ json: { data: r.held ?? HELD } }));
  await page.route("**/api/admin/moderation/roles/merge", (route: any) =>
    r.onMerge ? r.onMerge(route) : route.fulfill({ json: { rolesMerged: 1 } }));

  /*
    The ACTION routes go last, and each names its own final segment.

    Two Playwright rules bite here, and together they silently sent every POST to the
    catch-all in mockAdminPage, which answers with a success of a different shape - so the
    button appeared to do nothing and the assertion timed out against a path that was never set.

      * `*` matches within ONE path segment. ".../employments/*" therefore does NOT match
        ".../employments/41/accept", so branching on the url inside that handler never ran.
      * routes match in REVERSE registration order, so a specific pattern has to be registered
        AFTER the general one to win.
  */
  await page.route("**/api/admin/moderation/employments/*/accept", (route: any) =>
    r.onAccept
      ? r.onAccept(route)
      : route.fulfill({ json: { roleId: 41, state: "accepted", alreadyDone: false, ratingsPublished: 2 } }));
  await page.route("**/api/admin/moderation/employments/*/reject", (route: any) =>
    r.onReject
      ? r.onReject(route)
      : route.fulfill({ json: { roleId: 41, state: "rejected", alreadyDone: false, ratingsHeld: 2 } }));
  await page.route("**/api/admin/moderation/conflicts/*/resolve", (route: any) =>
    r.onResolve
      ? r.onResolve(route)
      : route.fulfill({ json: { conflictId: 55, alreadyDone: false, ratingsPublished: 1, ratingsStillHeld: 0 } }));
  await page.route("**/api/admin/moderation/conflicts/*/determine-status", (route: any) =>
    r.onDetermine
      ? r.onDetermine(route)
      : route.fulfill({ json: { conflictId: 77, alreadyDone: false, status: "ended", asOf: "2024-06-30", rolesDetermined: 2 } }));
  await page.route("**/api/admin/moderation/claims/*/link", (route: any) =>
    r.onLink
      ? r.onLink(route)
      : route.fulfill({ json: { claimId: 101, fromRoleId: 41, toRoleId: 40, alreadyDone: false, ratingsPublished: 1 } }));
  await page.route("**/api/admin/moderation/employments/*/correct", (route: any) =>
    r.onCorrect
      ? r.onCorrect(route)
      : route.fulfill({ json: { roleId: 41, state: "accepted", fieldsCorrected: 2, accepted: true, ratingsPublished: 1 } }));
  await page.route("**/api/admin/moderation/employments/*/reopen", (route: any) =>
    r.onReopen ? r.onReopen(route) : route.fulfill({ json: REOPENED }));
  /*
    The history route has to come after the detail route for the same reason the action routes
    do: ".../employments/*" does not match ".../employments/41/history", but the catch-all in
    mockAdminPage does, and it answers with a shape this screen cannot read.
  */
  await page.route("**/api/admin/moderation/employments/*/history**", (route: any) => {
    if (r.historyPages) {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      const page1 = r.historyPages[0];
      route.fulfill({ json: cursor ? r.historyPages[1] : page1 });
      return;
    }
    route.fulfill({ json: r.history ?? HISTORY });
  });

  await page.goto("/admin");
}

test.describe("the moderation queues are reachable from the admin page", () => {
  test("each queue has a tab, and the tab carries its backlog", async ({ page }) => {
    await openAdmin(page);

    // The counts belong on the bar, because a moderator should not have to open three tabs to
    // find out whether there is anything to do.
    const jobs = page.getByRole("button", { name: /proposed jobs/i });
    await expect(jobs).toContainText("2");
    await expect(page.getByRole("button", { name: /^conflicts/i })).toContainText("1");
    await expect(page.getByRole("button", { name: /held ratings/i })).toContainText("3");
  });

  test("the oldest wait is shown, not just the count", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();

    // A queue of two where the oldest has waited a month is not a healthy queue, and the count
    // alone hides exactly that. Under 60 days reads in weeks, which is the resolution a moderator
    // actually acts on.
    await expect(page.getByText(/oldest has waited 4 weeks/i)).toBeVisible();
  });
});

test.describe("proposed employment", () => {
  test("corroboration separates signed-in contributors from anonymous claims", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();

    const row = page.getByTestId("employment-row-41");
    await expect(row).toBeVisible();
    // THE POINT: two anonymous claims may be one person who cleared their cookies. Presenting
    // "4 contributors" would manufacture the corroboration a moderator is about to act on.
    await expect(row).toContainText("2 signed-in contributors");
    await expect(row).toContainText("2 anonymous claims (may not be separate people)");
    await expect(row).not.toContainText("4 signed-in");
  });

  test("a row also blocked by a conflict says so before the moderator clicks", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();

    // Accepting will not publish it, and promising otherwise wastes the decision.
    await expect(page.getByTestId("employment-row-42")).toContainText(/also blocked by a conflict/i);
    await expect(page.getByTestId("employment-row-41")).not.toContainText(/also blocked/i);
  });

  test("the detail view shows what was asserted, the ratings waiting, and the history", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();

    const row = page.getByTestId("employment-row-41");
    await expect(row).toContainText("2 ratings waiting on this");
    // The question a moderator is really answering: do we hold this job already?
    await expect(row).toContainText("Employment already held for this person");
    await expect(row).toContainText("Dispatch Lead");
    // And the honest warning on the one acceptance will not release.
    await expect(row).toContainText(/accepting alone will not publish this/i);
  });

  test("accepting tells the server which employment, and reports what became public", async ({ page }) => {
    let path = "";
    await openAdmin(page, {
      onAccept: (route: any) => {
        path = new URL(route.request().url()).pathname;
        route.fulfill({ json: { roleId: 41, state: "accepted", alreadyDone: false, ratingsPublished: 2 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();
    await page.getByTestId("accept-employment-41").click();

    // The id in the path is the whole instruction: accepting the wrong employment publishes
    // somebody's rating against the wrong job.
    await expect.poll(() => path).toBe("/api/admin/moderation/employments/41/accept");
    await expect(page.getByText(/2 ratings are now public/i)).toBeVisible();
  });

  test("accepting that releases nothing says so rather than claiming success", async ({ page }) => {
    await openAdmin(page, {
      onAccept: (route: any) =>
        route.fulfill({ json: { roleId: 41, state: "accepted", alreadyDone: false, ratingsPublished: 0 } }),
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();
    await page.getByTestId("accept-employment-41").click();

    // A moderator who clicks and sees nothing happen deserves to be told why.
    await expect(page.getByText(/something else is still blocking/i)).toBeVisible();
  });

  test("rejecting asks for a reason and promises the rating is kept", async ({ page }) => {
    let body: any = null;
    await openAdmin(page, {
      onReject: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { roleId: 41, state: "rejected", alreadyDone: false, ratingsHeld: 2 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();

    // Stated on the screen, because "reject" reads like "delete" and it is not one.
    await expect(page.getByTestId("employment-row-41"))
      .toContainText(/Rejecting keeps the rating\. It is held, never deleted/i);

    await page.getByTestId("reject-employment-41").click();
    await page.getByPlaceholder(/why \(optional\)/i).fill("not a real job");
    await page.getByTestId("confirm-reject-41").click();

    await expect.poll(() => body?.reason).toBe("not a real job");
    await expect(page.getByText(/ratings stay held and are not deleted/i)).toBeVisible();
  });

  test("a claim can be pointed at an employment already held, without digging in the database", async ({ page }) => {
    let linked: any = null;
    await openAdmin(page, {
      onLink: (route: any) => {
        linked = { path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() };
        route.fulfill({ json: { claimId: 101, fromRoleId: 41, toRoleId: 40, alreadyDone: false, ratingsPublished: 1 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();
    await page.getByTestId("link-claim-101-to-40").click();

    await expect.poll(() => linked?.path).toBe("/api/admin/moderation/claims/101/link");
    await expect.poll(() => linked?.body?.roleId).toBe(40);
    await expect(page.getByText(/1 rating now public/i)).toBeVisible();
  });

  test("a server refusal is shown in the server's own words", async ({ page }) => {
    await openAdmin(page, {
      onAccept: (route: any) =>
        route.fulfill({ status: 400, json: { message: "Only a proposed employment can be accepted; this one is rejected" } }),
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByRole("button", { name: /Review proposed job: Depot Supervisor/i }).click();
    await page.getByTestId("accept-employment-41").click();

    // Swallowing it would leave a moderator clicking a button that silently does nothing.
    await expect(page.getByText(/this one is rejected/i)).toBeVisible();
  });
});

test.describe("conflicts", () => {
  test("a blocking conflict is marked as one, and evidence is distinguished from doubt", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /^conflicts/i }).click();

    const row = page.getByTestId("conflict-row-55");
    await expect(row).toContainText(/blocks publication/i);
    // The distinction that decides whether a rating is held at all.
    await expect(row).toContainText("1 in doubt, 1 cited as evidence");

    await page.getByRole("button", { name: /Resolve conflict 55/i }).click();
    await expect(row).toContainText(/in doubt/);
    await expect(row).toContainText(/evidence only/);
  });

  test("an ambiguous role can be resolved by merging, without repairing relationships by hand", async ({ page }) => {
    let merged: any = null;
    await openAdmin(page, {
      onMerge: (route: any) => {
        merged = route.request().postDataJSON();
        route.fulfill({ json: { rolesMerged: 1 } });
      },
    });
    await page.getByRole("button", { name: /^conflicts/i }).click();
    await page.getByRole("button", { name: /Resolve conflict 55/i }).click();

    await page.getByRole("button", { name: /Keep #40, merge #41 into it/i }).click();

    // Through the real merge service, which redirects claims and follows withdrawn ratings.
    await expect.poll(() => merged?.managerId).toBe(7);
    await expect.poll(() => merged?.keepRoleId).toBe(40);
    await expect.poll(() => merged?.supersededRoleId).toBe(41);
    await expect(page.getByText(/Claims and ratings followed the redirection/i)).toBeVisible();
  });

  test("a decision is recorded with the resolution the moderator picked", async ({ page }) => {
    let body: any = null;
    await openAdmin(page, {
      onResolve: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { conflictId: 55, alreadyDone: false, ratingsPublished: 1, ratingsStillHeld: 0 } });
      },
    });
    await page.getByRole("button", { name: /^conflicts/i }).click();
    await page.getByRole("button", { name: /Resolve conflict 55/i }).click();

    await page.getByRole("radio", { name: /Kept separate/i }).check();
    await page.getByPlaceholder(/note \(optional\)/i).fill("different depots");
    await page.getByTestId("resolve-conflict-55").click();

    await expect.poll(() => body?.resolution).toBe("kept_separate");
    await expect.poll(() => body?.note).toBe("different depots");
    await expect(page.getByText(/1 rating now public/i)).toBeVisible();
  });

  test("resolving that leaves a rating held says what is still in the way", async ({ page }) => {
    await openAdmin(page, {
      onResolve: (route: any) =>
        route.fulfill({ json: { conflictId: 55, alreadyDone: false, ratingsPublished: 0, ratingsStillHeld: 2 } }),
    });
    await page.getByRole("button", { name: /^conflicts/i }).click();
    await page.getByRole("button", { name: /Resolve conflict 55/i }).click();
    await page.getByTestId("resolve-conflict-55").click();

    await expect(page.getByText(/2 ratings are still held by something else/i)).toBeVisible();
  });
});

/**
 * Answering an employment-status dispute.
 *
 * <h2>What these prove and what they do not</h2>
 *
 * <p>They prove the screen shows a moderator the case they are deciding, reads the evidence as it
 * now stands, refuses each invalid combination with its own message, sends exactly what was
 * chosen, cannot be submitted twice, and reports what the server says happened rather than
 * assuming.
 *
 * <p>They do NOT prove an employment status changed. A mocked 200 would pass whatever the backend
 * did. ModerationIntegrationTest owns that half against a real database, including the
 * case-level write and the determination surviving later contributor testimony.
 *
 * <h2>The one rule a browser cannot reach</h2>
 *
 * <p>A malformed date, 2026-02-30 or 30/06/2024, cannot be typed into the native date control:
 * Chromium refuses the value before the page sees it. That rule is real and is enforced in
 * validateDetermination and again in ModerationService, and it is proved in
 * client/lib/moderation.test.ts. What is reachable here is a missing date and a future one, and
 * both are below.
 */
test.describe("employment-status disputes", () => {
  const openDispute = async (page: any, r: any = {}) => {
    await openAdmin(page, {
      conflicts: [STATUS_DISPUTE], conflictDetail: STATUS_DISPUTE_DETAIL, ...r,
    });
    await page.getByRole("button", { name: /^conflicts/i }).click();
    await page.getByRole("button", { name: /Resolve conflict 77/i }).click();
    await expect(page.getByTestId("status-determination")).toBeVisible();
  };

  test("the case is shown, because one answer moves every disputed record in it", async ({ page }) => {
    await openDispute(page);

    // The one thing about this queue item a moderator cannot guess from the row.
    await expect(page.getByTestId("dispute-case-scope"))
      .toContainText(/all 2 disputed employment records in this case/i);
    await expect(page.getByTestId("case-role-41")).toHaveAttribute("data-will-be-determined", "yes");
    await expect(page.getByTestId("case-role-43")).toHaveAttribute("data-will-be-determined", "yes");
    // And at the moment of deciding, not only in the paragraph above it.
    await expect(page.getByTestId("determine-status-77"))
      .toContainText(/record determination for 2 records/i);
  });

  test("a record in the case that is not disputed is shown as left alone", async ({ page }) => {
    await openDispute(page);

    // It already carries somebody else's determination, and this answer does not overwrite it.
    // A moderator who could not see it would conclude the case was unanimous.
    const untouched = page.getByTestId("case-role-45");
    await expect(untouched).toHaveAttribute("data-will-be-determined", "no");
    await expect(untouched).toContainText(/not disputed, left alone/i);
    await expect(untouched).toContainText(/currently former, determined by a moderator/i);
    await expect(page.getByTestId("dispute-case-scope"))
      .toContainText(/1 other record in the case is not disputed/i);
  });

  test("the evidence is read as the contributor now states it, not as first given", async ({ page }) => {
    await openDispute(page);

    // The claim was created saying they left in February 2023 and later restated August 2024.
    // Showing the frozen assertion would present a contradiction nobody is making any more.
    const restated = page.getByTestId("status-evidence-201");
    await expect(restated).toContainText(/still there when they left, in 2024-08/i);
    await expect(restated).toContainText(/restated later/i);
  });

  test("a withdrawn claim is still shown, and marked as grounding nothing", async ({ page }) => {
    await openDispute(page);

    // The dispute was raised on it, so hiding it would hide why the queue item exists. What it no
    // longer does is support a status, and a moderator deciding on withdrawn evidence alone is a
    // different decision from one deciding on evidence that stands.
    await expect(page.getByTestId("status-evidence-202"))
      .toContainText(/withdrawn, so it no longer grounds a status/i);
  });

  test("the three answers replace the five generic resolutions", async ({ page }) => {
    await openDispute(page);

    await expect(page.getByRole("radio", { name: /^Current/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Former/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Unknown/ })).toBeVisible();

    // Resolving this kind generically would close the queue item while leaving the employment
    // 'disputed' for ever: inert, unlabelled, and with nothing left pointing at it.
    await expect(page.getByRole("radio", { name: /Kept separate/i })).toHaveCount(0);
    await expect(page.getByTestId("resolve-conflict-77")).toHaveCount(0);
  });

  test("every other kind keeps the generic resolution control it had", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /^conflicts/i }).click();
    await page.getByRole("button", { name: /Resolve conflict 55/i }).click();

    await expect(page.getByRole("radio", { name: /Kept separate/i })).toBeVisible();
    await expect(page.getByTestId("resolve-conflict-55")).toBeVisible();
    await expect(page.getByTestId("status-determination")).toHaveCount(0);
    await expect(page.getByTestId("dispute-case-records")).toHaveCount(0);
  });

  test("an asserting answer with no evidence date is refused before it is sent", async ({ page }) => {
    let sent = 0;
    await openDispute(page, { onDetermine: (route: any) => { sent += 1; route.fulfill({ json: {} }); } });

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-note-77").fill("employer directory");
    await page.getByTestId("determine-status-77").click();

    await expect(page.getByTestId("determination-problem-77"))
      .toContainText(/former has to say what date the evidence speaks to/i);
    // Not merely a message: the request must not have happened. status_as_of is what the public
    // label is computed from, and a determination without one is not a weaker record, it is a
    // constraint violation.
    expect(sent).toBe(0);
  });

  test("Unknown with a date is refused, because Unknown asserts nothing", async ({ page }) => {
    await openDispute(page);

    // Reachable in exactly this order: a date typed first, then the moderator decides the
    // evidence does not settle it. Silently dropping what they typed would be worse than saying.
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByRole("radio", { name: /^Unknown/ }).check();
    await page.getByTestId("determination-note-77").fill("nothing conclusive either way");
    await page.getByTestId("determine-status-77").click();

    await expect(page.getByTestId("determination-problem-77"))
      .toContainText(/unknown asserts nothing/i);
  });

  test("evidence cannot speak to a future date", async ({ page }) => {
    await openDispute(page);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.getByRole("radio", { name: /^Current/ }).check();
    await page.getByTestId("determination-as-of-77").fill(tomorrow);
    await page.getByTestId("determination-note-77").fill("spoke to the employer");
    await page.getByTestId("determine-status-77").click();

    await expect(page.getByTestId("determination-problem-77"))
      .toContainText(/cannot speak to a future date/i);
  });

  test("a determination must record why", async ({ page }) => {
    await openDispute(page);

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByTestId("determine-status-77").click();

    // It overrides what contributors said. The reason is the only thing that makes that
    // reviewable afterwards.
    await expect(page.getByTestId("determination-problem-77")).toContainText(/must record why/i);
  });

  test("the determination sends exactly what was chosen, and reports the case-level result", async ({ page }) => {
    let body: any = null;
    let listed = 0;
    await openDispute(page, {
      onDetermine: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { conflictId: 77, alreadyDone: false, status: "ended", asOf: "2024-06-30", rolesDetermined: 2 } });
      },
    });
    page.on("request", (req: any) => {
      if (/\/api\/admin\/moderation\/conflicts\?/.test(req.url())) listed += 1;
    });

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByTestId("determination-note-77").fill("employer directory lists a successor");
    await page.getByTestId("determine-status-77").click();

    await expect.poll(() => body?.status).toBe("ended");
    // The date the EVIDENCE speaks to, not the date of the decision.
    await expect.poll(() => body?.asOf).toBe("2024-06-30");
    await expect.poll(() => body?.note).toBe("employer directory lists a successor");

    // Two records moved from one click, and no rating changed state: an employment-status
    // dispute never held one, so a moderator should not be left wondering what it released.
    await expect(page.getByText(/2 employment records updated/i)).toBeVisible();
    await expect(page.getByText(/no rating changed state/i)).toBeVisible();
    // And the queue is re-read rather than patched in the browser. The listener is attached
    // after the tab's own first fetch, so any request it counts is the reload.
    await expect.poll(() => listed).toBeGreaterThan(0);
  });

  test("Unknown is sent with no date at all, rather than with a fabricated one", async ({ page }) => {
    let body: any = null;
    await openDispute(page, {
      onDetermine: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { conflictId: 77, alreadyDone: false, rolesDetermined: 2 } });
      },
    });

    await page.getByRole("radio", { name: /^Unknown/ }).check();
    await page.getByTestId("determination-note-77").fill("the two accounts cannot be reconciled");
    await page.getByTestId("determine-status-77").click();

    await expect.poll(() => body?.status).toBe("unknown");
    await expect.poll(() => body?.asOf).toBeNull();
  });

  test("a double click records one determination, not two", async ({ page }) => {
    let sent = 0;
    await openDispute(page, {
      onDetermine: async (route: any) => {
        sent += 1;
        await new Promise(r => setTimeout(r, 600));
        route.fulfill({ json: { conflictId: 77, alreadyDone: false, rolesDetermined: 2 } });
      },
    });

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByTestId("determination-note-77").fill("employer directory");

    const button = page.getByTestId("determine-status-77");
    await button.click();
    await button.click({ force: true, timeout: 2000 }).catch(() => {});

    await expect(page.getByText(/employment records updated/i)).toBeVisible();
    expect(sent).toBe(1);
  });

  test("an already-answered dispute is reported, not reported as a new decision", async ({ page }) => {
    await openDispute(page, {
      onDetermine: (route: any) =>
        route.fulfill({ json: { conflictId: 77, alreadyDone: true, rolesDetermined: 0 } }),
    });

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByTestId("determination-note-77").fill("employer directory");
    await page.getByTestId("determine-status-77").click();

    // Two moderators on the same queue. The first decision stands and the second is told so,
    // rather than being shown a success for a write that did not happen.
    await expect(page.getByText(/already been answered/i)).toBeVisible();
  });

  test("a refused determination says why and keeps what was typed", async ({ page }) => {
    await openDispute(page, {
      onDetermine: (route: any) => route.fulfill({
        status: 400,
        json: { message: "Conflict 77 is a possible_duplicate, not an employment-status dispute." },
      }),
    });

    await page.getByRole("radio", { name: /^Former/ }).check();
    await page.getByTestId("determination-as-of-77").fill("2024-06-30");
    await page.getByTestId("determination-note-77").fill("employer directory lists a successor");
    await page.getByTestId("determine-status-77").click();

    await expect(page.getByText(/not an employment-status dispute/i)).toBeVisible();
    // Retyping a reason because the server refused the request is how a moderator ends up
    // writing a shorter one.
    await expect(page.getByTestId("determination-note-77"))
      .toHaveValue("employer directory lists a successor");
    await expect(page.getByTestId("determination-as-of-77")).toHaveValue("2024-06-30");
  });

  test("a non-admin never reaches the determination at all", async ({ page }) => {
    // Not a security assertion: ModerationService resolves the caller to an admin before it reads
    // a row, and determine-status fails with 401 or 403 whatever this renders. What this proves is
    // that the screen does not offer it.
    await mockAdminPage(page, { user: MOCK_USER as any });
    await page.goto("/admin");

    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("status-determination")).toHaveCount(0);
  });
});

test.describe("held ratings", () => {
  test("every held rating names the real reason and the action that would release it", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /held ratings/i }).click();

    // The entire purpose of the screen: why is this not public, and what would make it public.
    const waitingOnEmployment = page.getByTestId("held-rating-r-1");
    await expect(waitingOnEmployment).toContainText("The employment it names is proposed.");
    await expect(waitingOnEmployment).toContainText("Accept the employment.");

    const waitingOnConflict = page.getByTestId("held-rating-r-3");
    await expect(waitingOnConflict).toContainText("open possible_duplicate conflict");
    await expect(waitingOnConflict).toContainText("Resolve that conflict.");
    await expect(waitingOnConflict).toContainText("conflict #55");
  });

  test("a held rating links to the person it is about, and says how long it has waited", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /held ratings/i }).click();

    const row = page.getByTestId("held-rating-r-1");
    await expect(row.getByRole("link", { name: "Priya Raghunathan" }))
      .toHaveAttribute("href", "/manager/priya-r");
    // Nine days of somebody's contribution being invisible.
    await expect(row).toContainText(/waiting 9 days/i);
  });

  test("an empty queue says so rather than looking broken", async ({ page }) => {
    await openAdmin(page, { held: [] });
    await page.getByRole("button", { name: /held ratings/i }).click();

    await expect(page.getByText(/no ratings are held/i)).toBeVisible();
  });
});

test.describe("correcting a canonical employment", () => {

  test("the contributor's claims are shown beside the editable canonical values", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();

    const form = page.getByTestId("correction-form-41");
    await expect(form).toBeVisible();
    // CLAIMS, not people: two claims, one from an account and one anonymous.
    await expect(form.getByText("2 employment claims")).toBeVisible();
    await expect(page.getByTestId("claim-provenance-split"))
      .toContainText("1 from signed-in account");
    await expect(page.getByTestId("claim-provenance-split")).toContainText("1 anonymous claim");
    // Every assertion is listed rather than one standing for the rest.
    await expect(page.getByTestId("asserted-101")).toBeVisible();
    await expect(page.getByTestId("asserted-102")).toBeVisible();
    // And the canonical side is the editable one.
    await expect(page.getByTestId("correct-title-41")).toHaveValue("Depot Supervisor");
  });

  test("the period control does not claim the person is still employed", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    /*
      An absent end date means no end date has been RECORDED. The product holds no verified
      statement that anybody works anywhere today, so the screen must not imply one.
    */
    const form = page.getByTestId("correction-form-41");
    await expect(form).toContainText("no end date has been recorded");
    await expect(form).not.toContainText(/currently employed/i);
    await expect(form).not.toContainText(/still running/i);
  });

  test("a correction cannot be saved without a reason", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    await page.getByTestId("correct-title-41").fill("Engineering Manager");
    await expect(page.getByTestId("save-correction-41")).toBeDisabled();
    await page.getByTestId("correct-reason-41").fill("confirmed with the employer");
    await expect(page.getByTestId("save-correction-41")).toBeEnabled();
  });

  test("only the fields that changed are sent", async ({ page }) => {
    let body: any = null;
    await openAdmin(page, {
      onCorrect: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { roleId: 41, state: "proposed", fieldsCorrected: 1, accepted: false, ratingsPublished: 0 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    await page.getByTestId("correct-title-41").fill("Engineering Manager");
    await page.getByTestId("correct-reason-41").fill("title confirmed");
    await page.getByTestId("save-correction-41").click();

    await expect.poll(() => body).not.toBeNull();
    expect(body.title).toBe("Engineering Manager");
    expect(body.reason).toBe("title confirmed");
    /*
      THE KEYS THAT ARE ABSENT ARE THE POINT. The API reads presence: sending startDate or
      endDate here would ask the server to change dates nobody touched, and sending endDate:null
      would clear a recorded end date.
    */
    expect("startDate" in body).toBe(false);
    expect("endDate" in body).toBe(false);
    expect("periodKnown" in body).toBe(false);
  });

  test("clearing the end date sends an explicit null", async ({ page }) => {
    let body: any = null;
    await openAdmin(page, {
      detail: { ...DETAIL, employment: { ...DETAIL.employment, endDate: "2023-09-01" } },
      onCorrect: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { roleId: 41, state: "proposed", fieldsCorrected: 1, accepted: false, ratingsPublished: 0 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    await page.getByTestId("correct-end-41").fill("");
    await page.getByTestId("correct-reason-41").fill("no end date on the record");
    await page.getByTestId("save-correction-41").click();

    await expect.poll(() => body).not.toBeNull();
    expect("endDate" in body).toBe(true);
    expect(body.endDate).toBeNull();
  });

  test("correct and accept is one action and reports what became public", async ({ page }) => {
    let body: any = null;
    await openAdmin(page, {
      onCorrect: (route: any) => {
        body = route.request().postDataJSON();
        route.fulfill({ json: { roleId: 41, state: "accepted", fieldsCorrected: 2, accepted: true, ratingsPublished: 1 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    await page.getByTestId("correct-title-41").fill("Engineering Manager");
    await page.getByTestId("correct-reason-41").fill("confirmed with the employer");
    await page.getByTestId("save-and-accept-41").click();

    await expect.poll(() => body).not.toBeNull();
    expect(body.thenAccept).toBe(true);
    await expect(page.getByText(/2 fields corrected.*accepted.*1 rating now public/i)).toBeVisible();
  });

  test("a duplicate-employment refusal is shown, not swallowed", async ({ page }) => {
    await openAdmin(page, {
      onCorrect: (route: any) => route.fulfill({
        status: 409,
        json: { message: "That correction would duplicate an employment this manager already has at the same company, with the same title and start date. Merge the two instead." },
      }),
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("correct-employment-41").click();
    await page.getByTestId("correct-title-41").fill("Dispatch Lead");
    await page.getByTestId("correct-reason-41").fill("merging these");
    await page.getByTestId("save-correction-41").click();
    await expect(page.getByText(/would duplicate an employment/i)).toBeVisible();
  });
});

test.describe("reopening a rejected employment", () => {

  test("reopening keeps the rejection and lists what is left to reconcile", async ({ page }) => {
    await openAdmin(page, { detail: REJECTED_DETAIL });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();

    await page.getByTestId("reopen-reason-41").fill("the employer confirmed it after all");
    await page.getByTestId("reopen-employment-41").click();

    const panel = page.getByTestId("reopened-41");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("#44");
    await expect(panel).toContainText("#41");
    await expect(panel).toContainText(/still stands/i);
    // The outstanding claim is actionable, not a number to copy into SQL.
    await expect(page.getByTestId("reconcile-claim-105")).toBeVisible();
    await expect(page.getByTestId("reconcile-105-to-44")).toBeVisible();
  });

  test("reopening cannot be done without a reason", async ({ page }) => {
    await openAdmin(page, { detail: REJECTED_DETAIL });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await expect(page.getByTestId("reopen-employment-41")).toBeDisabled();
    await page.getByTestId("reopen-reason-41").fill("a reason");
    await expect(page.getByTestId("reopen-employment-41")).toBeEnabled();
  });

  test("an outstanding claim is reconciled through the ordinary link action", async ({ page }) => {
    let linked: string | null = null;
    await openAdmin(page, {
      detail: REJECTED_DETAIL,
      onLink: (route: any) => {
        linked = route.request().url();
        route.fulfill({ json: { claimId: 105, fromRoleId: 41, toRoleId: 44, alreadyDone: false, ratingsPublished: 1 } });
      },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("reopen-reason-41").fill("confirmed");
    await page.getByTestId("reopen-employment-41").click();
    await page.getByTestId("reconcile-105-to-44").click();

    await expect.poll(() => linked).not.toBeNull();
    expect(linked).toContain("/claims/105/link");
    await expect(page.getByText(/1 rating now public/i)).toBeVisible();
  });
});

test.describe("the audit timeline", () => {

  test("each event says what changed, who did it and which employment", async ({ page }) => {
    await openAdmin(page);
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("toggle-history-41").click();

    const history = page.getByTestId("history-41");
    await expect(history).toBeVisible();
    await expect(history).toContainText("Corrected job title");
    await expect(history).toContainText("Depot Supervisor");
    await expect(history).toContainText("Depot Manager");
    await expect(history).toContainText("by mina");
    // A platform event had nobody deciding it, and must not read as a missing person.
    await expect(history).toContainText("the platform, automatically");
    // An erased administrator reads as withdrawn, not as absent.
    await expect(history).toContainText("an administrator since deleted");
    // An event on an absorbed employment keeps its own identity.
    await expect(history).toContainText("on absorbed employment #40");
    await expect(history).toContainText("Includes 1 absorbed employment");
  });

  test("older events are reachable and the end is stated once it is reached", async ({ page }) => {
    await openAdmin(page, { historyPages: [HISTORY_PAGE_1, HISTORY_PAGE_2] });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("toggle-history-41").click();

    await expect(page.getByTestId("history-event-0")).toBeVisible();
    await expect(page.getByTestId("history-event-1")).toHaveCount(0);
    await page.getByTestId("history-load-older-41").click();
    await expect(page.getByTestId("history-event-2")).toBeVisible();
    await expect(page.getByTestId("history-load-older-41")).toHaveCount(0);
    await expect(page.getByTestId("history-41")).toContainText("That is the whole history");
  });

  test("a cyclic lineage is never presented as the whole history", async ({ page }) => {
    await openAdmin(page, {
      history: { ...HISTORY, lineageComplete: false, cycleDetected: true, hasMore: false },
    });
    await page.getByRole("button", { name: /proposed jobs/i }).click();
    await page.getByTestId("employment-row-41").getByRole("button", { name: /review/i }).click();
    await page.getByTestId("toggle-history-41").click();

    await expect(page.getByTestId("history-incomplete-41")).toBeVisible();
    await expect(page.getByTestId("history-partial-41")).toBeVisible();
    await expect(page.getByTestId("history-41")).not.toContainText("That is the whole history");
  });
});
