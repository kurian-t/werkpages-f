import { describe, it, expect } from "vitest";
import { companyKey, roleKey, sameCompany, sameRole, compareCareerStages, isOngoingRole, type CareerStage } from "./careerRoles";

describe("roleKey", () => {
  it("treats two roles at one employer as different stages", () => {
    /*
      THE DEFECT THIS EXISTS FOR. Keyed on the company alone these are one stage, which is how an
      admin removing the junior role of a promoted manager deleted the senior role's ratings too.
    */
    expect(roleKey("Visa", "Software Engineer"))
      .not.toBe(roleKey("Visa", "Director Software Engineering"));
  });

  it("treats one role at two employers as different stages", () => {
    expect(roleKey("Visa", "Director")).not.toBe(roleKey("Netflix", "Director"));
  });

  it("ignores the whitespace differences the chart ignores", () => {
    // Companies group whitespace-insensitively: "100 kellogg" and "100kellogg" are one employer.
    expect(roleKey("100 Kellogg", "VP")).toBe(roleKey("100kellogg", "vp"));
    // Titles collapse runs of space but keep the word separation.
    expect(roleKey("Visa", "Software  Engineer")).toBe(roleKey("visa", " Software Engineer "));
  });

  it("does not collapse titles whose words differ", () => {
    expect(roleKey("Visa", "SoftwareEngineer")).not.toBe(roleKey("Visa", "Software Engineer"));
  });

  it("handles a missing company or title without throwing", () => {
    expect(roleKey(null, undefined)).toBe(roleKey("", ""));
  });
});

describe("sameRole", () => {
  it("is true only for the same pair", () => {
    expect(sameRole({ company: "Visa", role: "CEO" }, { company: "visa", role: "ceo" })).toBe(true);
    expect(sameRole({ company: "Visa", role: "CEO" }, { company: "Visa", role: "CTO" })).toBe(false);
  });
});

describe("the key is safe to put in the DOM", () => {
  /*
    It is used as a data-testid and as a <select> option value. A NUL separator - the obvious first
    choice - is replaced inside an HTML attribute, so the handle silently stops matching.
  */
  it("contains no control characters", () => {
    // eslint-disable-next-line no-control-regex
    expect(roleKey("Visa", "Software Engineer")).not.toMatch(/[\u0000-\u001f]/);
  });

  it("cannot be made to collide by moving the separator into a name", () => {
    expect(roleKey("a:b", "c")).not.toBe(roleKey("a", "b:c"));
  });
});

describe("companyKey and sameCompany", () => {
  /*
    Merging two roles is only meaningful inside ONE employer: two jobs at two companies are not one
    employment however alike the titles, and the server refuses such a merge rather than quietly
    downgrading it to a rating move. The dialog asks this question to decide whether to offer the
    control at all, so it has to answer it the way the server does.
  */
  it("ignores the title entirely", () => {
    expect(sameCompany({ company: "Visa" }, { company: "Visa" })).toBe(true);
  });

  it("normalises whitespace the same way roleKey's company half does", () => {
    expect(companyKey("100 Kellogg")).toBe(companyKey("100kellogg"));
    expect(companyKey("  VISA  ")).toBe(companyKey("visa"));
  });

  it("does not treat two different employers as one", () => {
    expect(sameCompany({ company: "Visa" }, { company: "Shopify" })).toBe(false);
  });

  it("treats a missing company as empty rather than throwing", () => {
    expect(companyKey(null)).toBe("");
    expect(companyKey(undefined)).toBe("");
    expect(sameCompany({}, { company: "" })).toBe(true);
  });

  it("agrees with roleKey on the employer, so the two cannot disagree", () => {
    // roleKey is length-prefixed on the company, so its prefix is companyKey's own length.
    expect(roleKey("100 Kellogg", "Director").startsWith(
      `${companyKey("100 Kellogg").length}:${companyKey("100 Kellogg")}:`)).toBe(true);
  });
});

describe("ordering a trajectory when a job has no dates", () => {
  /*
    REPORTED, after a merge: "The merge tool does not move over other workplaces. The merge should
    not be forced to have a date and if there is no date, it should assume the profile without the
    date for the job is older than the job with the rating which has a date. That way we don't lose
    career history."

    The merge itself does move every employment row - ManagerMergeService.moveRoles moves the ones
    with no equivalent and moves AND supersedes the ones that have one, and
    twoUnknownPeriodRolesAreNotTreatedAsTheSameEmployment pins that an undated role arrives on the
    survivor. What went wrong is what happened to it once it arrived.

    An undated row is undated because nobody rated that job, so no rating supplied a date. The
    trajectory is ordered oldest first and sent a null start date to the BACK, which in an
    ascending list is the NEWEST position - so a job with no dates was drawn as the person's most
    recent, ahead of the dated job it actually preceded. The rule is the one stated above: no date
    means older.
  */
  const stage = (over: Partial<CareerStage> = {}): CareerStage => ({
    startDate: null, endDate: null, ...over,
  });

  it("puts a job with no dates before a job that has them", () => {
    const undated = stage({ periodKnown: false });
    const dated   = stage({ startDate: "2024-03", endDate: "2025-01", periodKnown: true });

    expect([dated, undated].sort(compareCareerStages)).toEqual([undated, dated]);
    expect([undated, dated].sort(compareCareerStages)).toEqual([undated, dated]);
  });

  it("keeps dated jobs in their own order, oldest first", () => {
    const older  = stage({ startDate: "2019-01", endDate: "2021-06", periodKnown: true });
    const newer  = stage({ startDate: "2022-02", endDate: null, periodKnown: true, isCurrent: true });

    expect([newer, older].sort(compareCareerStages)).toEqual([older, newer]);
  });

  it("puts the undated job first even when the dated one is still running", () => {
    // The case the merge produces: an unrated job with no dates, and a rated current job.
    const undated = stage({ periodKnown: false });
    const current = stage({ startDate: "2023-05", endDate: null, periodKnown: true, isCurrent: true });

    expect([current, undated].sort(compareCareerStages)).toEqual([undated, current]);
  });

  it("is a total order, so sorting is stable whichever way the list arrives", () => {
    // Two undated rows must not claim to be both before and after each other, or the sort
    // result depends on the input order and the timeline reshuffles between renders.
    //
    // Compared through Math.sign and as a pair, not as `x === y * -1`: for two equal stages both
    // answers are 0, and `0 * -1` is -0, which toBe rejects because Object.is(0, -0) is false.
    // That is an artefact of the assertion, not of the ordering.
    const a = stage({ periodKnown: false });
    const b = stage({ periodKnown: false });

    expect(compareCareerStages(a, b)).toBe(0);
    expect(compareCareerStages(b, a)).toBe(0);

    // And antisymmetric where the two genuinely differ.
    const dated = stage({ startDate: "2024-01", periodKnown: true });
    expect(Math.sign(compareCareerStages(a, dated)))
      .toBe(-Math.sign(compareCareerStages(dated, a)));
  });
});

describe("whether an undated job counts as the job they hold now", () => {
  /*
    `endDate == null` was the whole test, so a row with NO dates at all - start and end both
    absent, period_known false - was presented as the person's current role. After a merge that
    puts the absorbed profile's unrated job above the dated job somebody actually rated.

    An undated row says nothing about whether it is current, so it is not treated as current. Where
    the record DOES say, employment_status says it, and that is believed.
  */
  it("does not call a job with no dates current", () => {
    expect(isOngoingRole({ startDate: null, endDate: null, periodKnown: false })).toBe(false);
  });

  it("calls an open dated job current", () => {
    expect(isOngoingRole({ startDate: "2023-01", endDate: null, periodKnown: true })).toBe(true);
  });

  it("calls a closed job not current", () => {
    expect(isOngoingRole({ startDate: "2019-01", endDate: "2021-01", periodKnown: true })).toBe(false);
  });

  it("believes employment_status when the record states it", () => {
    // An undated row the employment-status resolution has settled as ongoing IS their job now,
    // and that is a statement in the record rather than an inference from a missing date.
    expect(isOngoingRole({ startDate: null, endDate: null, periodKnown: false,
                           employmentStatus: "ongoing" })).toBe(true);
    expect(isOngoingRole({ startDate: null, endDate: null, periodKnown: false,
                           employmentStatus: "ended" })).toBe(false);
  });
});
