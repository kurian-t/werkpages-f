import { describe, it, expect } from "vitest";
import {
  CaseEmployment, ConflictClaim, basisLabel, describeDeterminationScope,
  describeStatusTestimony, statusLabel, validateDetermination,
} from "./moderation";

/**
 * The employment-status determination's own rules, and the sentences the moderation screen says
 * about a case.
 *
 * <h2>What this proves and what it does not</h2>
 *
 * <p>These are the checks asked BEFORE the request, so that a moderator sees which field is wrong
 * instead of a 400 about a database constraint. They are not the authority and this file does not
 * pretend otherwise: ModerationService refuses every one of them again, and
 * employment_status_is_grounded refuses the grounding pair a third time.
 * ModerationIntegrationTest owns that half.
 *
 * <p>What is worth proving here is that each rule is a SEPARATE rule with its own message. A
 * single "invalid determination" would be the version a moderator cannot get past, and the
 * combination rules in particular - an asserting status needing a date, Unknown refusing one - are
 * the two somebody meets on their first use of the screen.
 */

const determination = (over: Partial<{ status: string; asOf: string; note: string }> = {}) => ({
  status: "ended",
  asOf: "2024-06-30",
  note: "Employer directory lists a successor from July 2024",
  ...over,
});

const TODAY = new Date(2026, 10, 9); // 9 November 2026, local, as the browser sees it

describe("validateDetermination", () => {
  it("accepts an asserting status with a past evidence date and a reason", () => {
    expect(validateDetermination(determination(), TODAY)).toBeNull();
  });

  it("accepts Unknown with no date at all", () => {
    expect(validateDetermination(
      determination({ status: "unknown", asOf: "" }), TODAY,
    )).toBeNull();
  });

  it("asks for a status before anything else", () => {
    // The screen opens with nothing chosen, which is not the same as a wrong choice.
    expect(validateDetermination(determination({ status: "" }), TODAY))
      .toMatch(/choose what this employment status is/i);
  });

  it("refuses a status the server would not accept", () => {
    // 'disputed' is the state being LEFT, not an answer to it. Offering it anywhere would let
    // somebody close a queue item by restating the problem.
    expect(validateDetermination(determination({ status: "disputed" }), TODAY))
      .toMatch(/choose what this employment status is/i);
  });

  it("requires the evidence date for Current, naming the status", () => {
    const problem = validateDetermination(
      determination({ status: "ongoing", asOf: "" }), TODAY,
    );
    expect(problem).toMatch(/current/i);
    expect(problem).toMatch(/date the evidence speaks to/i);
  });

  it("requires the evidence date for Former", () => {
    expect(validateDetermination(determination({ asOf: "" }), TODAY))
      .toMatch(/former has to say what date the evidence speaks to/i);
  });

  it("refuses an evidence date on Unknown, because Unknown asserts nothing", () => {
    // The reachable version of this: a moderator types a date, then decides the evidence does not
    // settle it. Silently discarding what they typed would be worse than saying so.
    expect(validateDetermination(
      determination({ status: "unknown", asOf: "2024-06-30" }), TODAY,
    )).toMatch(/unknown asserts nothing/i);
  });

  it("rejects a day that does not exist rather than rolling it over", () => {
    // new Date("2026-02-30") is not March 2nd here. A date that silently became a different date
    // would be recorded as evidence about a day nobody read.
    expect(validateDetermination(determination({ asOf: "2026-02-30" }), TODAY))
      .toMatch(/must be a real day/i);
  });

  it("rejects a malformed date", () => {
    expect(validateDetermination(determination({ asOf: "30/06/2024" }), TODAY))
      .toMatch(/must be a real day/i);
  });

  it("refuses evidence that speaks to the future", () => {
    expect(validateDetermination(determination({ asOf: "2026-11-10" }), TODAY))
      .toMatch(/cannot speak to a future date/i);
  });

  it("accepts today, which is not the future", () => {
    // The boundary, because an off-by-one here blocks the commonest determination of all: a
    // moderator reading something that is true as they read it.
    expect(validateDetermination(determination({ asOf: "2026-11-09" }), TODAY)).toBeNull();
  });

  it("requires a reason, and whitespace is not one", () => {
    expect(validateDetermination(determination({ note: "   " }), TODAY))
      .toMatch(/must record why/i);
  });

  it("reports the status problem before the missing reason", () => {
    // Order matters: a moderator who has chosen nothing should be told to choose, not to explain
    // a choice they have not made.
    expect(validateDetermination({ status: "", asOf: "", note: "" }, TODAY))
      .toMatch(/choose what this employment status is/i);
  });
});

const role = (over: Partial<CaseEmployment> = {}): CaseEmployment => ({
  roleId: 1,
  title: "Depot Supervisor",
  startDate: "2023-03-01",
  endDate: null,
  periodKnown: true,
  employmentStatus: "disputed",
  statusAsOf: null,
  statusBasis: null,
  willBeDetermined: true,
  ...over,
});

describe("describeDeterminationScope", () => {
  it("says so when one answer moves several records", () => {
    // The whole reason this sentence exists. career_unique_known_employment only stops duplicate
    // live roles when the period is KNOWN, so an unknown-period employment can legitimately be
    // several rows and detection disputes each of them under one queue item.
    const said = describeDeterminationScope([
      role({ roleId: 1 }), role({ roleId: 2 }), role({ roleId: 3 }),
    ]);
    expect(said).toMatch(/all 3 disputed employment records/i);
  });

  it("does not claim a plural when there is one record", () => {
    expect(describeDeterminationScope([role()])).toMatch(/the one disputed employment record/i);
  });

  it("counts the records it will NOT touch separately", () => {
    // A sibling carrying somebody else's determination is left exactly as it is, and a moderator
    // should see that before concluding the case is unanimous.
    const said = describeDeterminationScope([
      role({ roleId: 1 }),
      role({ roleId: 2, employmentStatus: "ended", statusBasis: "moderator", willBeDetermined: false }),
    ]);
    expect(said).toMatch(/the one disputed employment record/i);
    expect(said).toMatch(/1 other record in the case is not disputed and keeps the answer it already has/i);
  });

  it("is honest when there is nothing left to answer", () => {
    // Reachable: a merge or an earlier determination can empty the case while the queue item is
    // still open on somebody's screen.
    expect(describeDeterminationScope([
      role({ employmentStatus: "ended", willBeDetermined: false }),
    ])).toMatch(/no disputed employment record is left/i);
  });

  it("says nothing is left rather than nothing at all for an empty case", () => {
    expect(describeDeterminationScope([])).toMatch(/no disputed employment record is left/i);
  });
});

const claim = (over: Partial<ConflictClaim> = {}): ConflictClaim => ({
  claimId: 9,
  role: "evidence",
  assertedTitle: "Depot Supervisor",
  assertedStart: "2021-01-01",
  assertedEnd: "2023-02-01",
  periodKnown: true,
  stillThere: true,
  resolution: "linked",
  finalizedAt: null,
  fromAccount: true,
  ratings: 1,
  resolvedRoleId: 41,
  heldRatings: 0,
  withdrawn: false,
  // DELIBERATELY different from assertedEnd above: this contributor first said they left in
  // February 2023 and later restated August 2024. A fixture where the two agree cannot tell
  // whether the sentence is built from the latest statement or from the frozen assertion, and a
  // mutation proved it: reading assertedEnd passed every assertion here.
  leftOn: "2024-08-01",
  saidAt: "2024-08-02T10:00:00Z",
  restated: true,
  ...over,
});

describe("describeStatusTestimony", () => {
  it("reads a still-there claim as evidence about the date that contributor left", () => {
    // The observation the whole model rests on: still_there is not a claim about today.
    expect(describeStatusTestimony(claim()))
      .toMatch(/still there when they left, in 2024-08/i);
  });

  it("does not invent a date when the contributor gave none", () => {
    // A still_there claim with no end date of its own asserts nothing datable, and the resolver
    // answers 'unknown' rather than inventing a Current.
    expect(describeStatusTestimony(claim({ leftOn: null })))
      .toMatch(/gives no date of their own/i);
  });

  it("reads the other direction too", () => {
    expect(describeStatusTestimony(claim({ stillThere: false })))
      .toMatch(/had gone by 2024-08/i);
  });

  it("says plainly when the claim is silent on it", () => {
    expect(describeStatusTestimony(claim({ stillThere: null })))
      .toMatch(/nothing about whether the manager was still there/i);
  });
});

describe("the labels a moderator reads", () => {
  it("names each stored status in the product's own words", () => {
    expect(statusLabel("ongoing")).toBe("Current");
    expect(statusLabel("ended")).toBe("Former");
    expect(statusLabel("unknown")).toBe("Unknown");
    expect(statusLabel("disputed")).toBe("Disputed");
  });

  it("distinguishes the three ways a status came to be", () => {
    // 'moderator' is the one basis with a human behind it, and reading it as the others would
    // misreport who decided.
    expect(basisLabel("end_date")).toMatch(/employment record's end date/i);
    expect(basisLabel("contributor_claim")).toMatch(/contributor's claim/i);
    expect(basisLabel("moderator")).toMatch(/determined by a moderator/i);
    expect(basisLabel(null)).toMatch(/nothing grounding it/i);
  });
});
