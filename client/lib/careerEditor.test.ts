import { describe, it, expect } from "vitest";
import {
  originalsOf,
  Employment, PositionDraft, draftOf, emptyDraft, intentOf, changedFields, summarize,
  buildSubmission, hasAnythingToSubmit, positionProblem, orderEmployments, locationOf,
  isRemovable,
  STATUS_CHOICES,
  CHANGE_FIELDS,
} from "./careerEditor";
import { EMPTY_LOCATION } from "./location";

/**
 * The editor's model, and the one decision it exists to enforce: correcting an existing position
 * and recording a new one are different acts.
 *
 * <p>These are unit tests because the derivation is pure, and because it is the part that decides
 * whether somebody's ratings move. A screen can be re-laid-out freely; getting this wrong either
 * loses ratings or invents a job change nobody reported.
 */

function employment(over: Partial<Employment> = {}): Employment {
  return {
    id: 41,
    title: "Depot Supervisor",
    company: "Halverson Logistics",
    companyId: 7,
    startDate: "2019-01",
    endDate: null,
    periodKnown: true,
    employmentStatus: "ongoing",
    state: "accepted",
    isCurrent: true,
    claimCount: 0,
    declaredCountry: null,
    declaredState: null,
    declaredCity: null,
    declaredPrecision: null,
    companyLocationId: null,
    declaredSource: null,
    declaredText: null,
    ...over,
  };
}

/** Wraps the shared builder so each test can pass employments inline. */
function originals(...list: Employment[]): Map<string, Employment> {
  return originalsOf(list);
}

describe("intentOf", () => {
  it("calls an untouched copy of an existing employment a correction", () => {
    const e = employment();
    expect(intentOf(draftOf(e), e)).toBe("correct");
  });

  it("calls a position with no employment behind it an addition", () => {
    expect(intentOf(emptyDraft(), undefined)).toBe("add");
  });

  /*
    THE DECISION THIS FILE IS FOR.

    Changing the employer is not an edit of this employment. The employer is what ratings are
    attributed through, and role_corrections.field deliberately excludes the company, so correcting
    it in place would silently re-attribute every rating hung off it. It becomes a supersession: the
    old employment is retired pointing at a replacement, and the claims move with a record of where
    they came from.
  */
  it("calls a changed employer a supersession, not a correction", () => {
    const e = employment({ companyId: 7 });
    const moved: PositionDraft = { ...draftOf(e), company: "Marlowe Freight", companyId: 9 };
    expect(intentOf(moved, e)).toBe("supersede");
  });

  it("is still a supersession when other fields moved too", () => {
    const e = employment({ companyId: 7 });
    const moved: PositionDraft = {
      ...draftOf(e), company: "Marlowe Freight", companyId: 9, title: "Senior Supervisor",
    };
    // The employer decides, because it is the part that decides where the ratings sit. The rest of
    // the changes ride along on the replacement.
    expect(intentOf(moved, e)).toBe("supersede");
  });

  it("does not treat a re-typed identical company name as a move", () => {
    const e = employment({ companyId: 7 });
    const same: PositionDraft = { ...draftOf(e), company: "  halverson logistics  " };
    // companyId is unchanged, so this is the same employer however it was typed.
    expect(intentOf(same, e)).toBe("correct");
  });
});

describe("changedFields", () => {
  it("proposes nothing for a position nobody touched", () => {
    const e = employment();
    expect(changedFields(draftOf(e), e)).toEqual([]);
  });

  /*
    WHY THE FIELD LIST EXISTS AT ALL.

    Without it a null end date on the wire is ambiguous between "leave the end date alone" and
    "this role has no end date after all", and those are opposite instructions. The second would
    erase a date nobody questioned.
  */
  it("names only the field that moved, so an untouched date is left alone", () => {
    const e = employment({ endDate: "2023-03", employmentStatus: "ended" });
    const d: PositionDraft = { ...draftOf(e), title: "Senior Supervisor" };
    expect(changedFields(d, e)).toEqual([CHANGE_FIELDS.title]);
  });

  it("treats a start-date change as also settling whether the period is known", () => {
    const e = employment({ startDate: null, periodKnown: false });
    const d: PositionDraft = { ...draftOf(e), startDate: "2019-04" };
    expect(changedFields(d, e)).toContain(CHANGE_FIELDS.startDate);
    expect(changedFields(d, e)).toContain(CHANGE_FIELDS.periodKnown);
  });

  it("notices a status change on its own", () => {
    const e = employment({ employmentStatus: "ongoing" });
    const d: PositionDraft = { ...draftOf(e), status: "ended" };
    expect(changedFields(d, e)).toEqual([CHANGE_FIELDS.employmentStatus]);
  });

  /*
    "I'm not sure" was removed: either the manager is in the role or they is not. A stored
    `unknown` or `disputed` still has to be SHOWN as one of the two, and the honest reading is
    whatever the profile already treats it as - so opening a card on such a row must propose
    nothing, or every old record would report a change nobody made.
  */
  it("shows a stored unknown as whatever the profile already treats it as, proposing nothing", () => {
    const current = employment({ employmentStatus: "unknown", endDate: null, isCurrent: true });
    expect(draftOf(current).status).toBe("ongoing");
    expect(changedFields(draftOf(current), current)).toEqual([]);

    const past = employment({ employmentStatus: "unknown", endDate: "2019-04", isCurrent: false });
    expect(draftOf(past).status).toBe("ended");
    expect(changedFields(draftOf(past), past)).toEqual([]);
  });

  it("does the same for a disputed row, without re-asserting the dispute", () => {
    const e = employment({ employmentStatus: "disputed", isCurrent: true });
    expect(draftOf(e).status).toBe("ongoing");
    expect(changedFields(draftOf(e), e)).toEqual([]);
  });

  it("offers exactly two statuses", () => {
    expect(STATUS_CHOICES.map(c => c.value)).toEqual(["ongoing", "ended"]);
    expect(STATUS_CHOICES.some(c => /not sure/i.test(c.label))).toBe(false);
  });

  it("proposes everything an addition has a value for", () => {
    const d: PositionDraft = {
      ...emptyDraft(), title: "Night Lead", company: "Marlowe Freight", companyId: 9,
      startDate: "2023-04",
    };
    const fields = changedFields(d, undefined);
    expect(fields).toContain(CHANGE_FIELDS.title);
    expect(fields).toContain(CHANGE_FIELDS.company);
    expect(fields).toContain(CHANGE_FIELDS.startDate);
    expect(fields).toContain(CHANGE_FIELDS.employmentStatus);
  });

  it("does not propose a location for a position that never had one", () => {
    const e = employment();
    expect(locationOf(e)).toEqual(EMPTY_LOCATION);
    // Unknown is a real answer the product keeps. A title correction says nothing about where the
    // work happened, and must not blank or invent it.
    expect(changedFields({ ...draftOf(e), title: "Supervisor" }, e))
      .not.toContain(CHANGE_FIELDS.location);
  });
});

describe("buildSubmission", () => {
  it("leaves out a position whose fields all match what is recorded", () => {
    const a = employment({ id: 1 });
    const b = employment({ id: 2, title: "Night Lead", isCurrent: false, endDate: "2018-12",
                           employmentStatus: "ended" });
    const drafts = [draftOf(a), { ...draftOf(b), title: "Night Supervisor" }];

    const body = buildSubmission("Priya", "Priya", "why", drafts, originals(a, b)) as
      { positions: Record<string, unknown>[] };

    // Opening three cards and editing one is a one-position contribution.
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0].roleId).toBe(2);
    expect(body.positions[0].intent).toBe("correct");
  });

  it("sends an addition with no roleId, because it names no existing employment", () => {
    const d = { ...emptyDraft(), title: "Night Lead", company: "Marlowe", companyId: 9 };
    const body = buildSubmission("P", "P", "why", [d], originals()) as
      { positions: Record<string, unknown>[] };
    expect(body.positions[0].intent).toBe("add");
    expect(body.positions[0].roleId).toBeNull();
  });

  it("identifies a correction by id and never by company name", () => {
    const e = employment({ id: 77 });
    const body = buildSubmission("P", "P", "why", [{ ...draftOf(e), title: "X" }],
                                 originals(e)) as { positions: Record<string, unknown>[] };
    // Company name cannot distinguish two spells at one employer; only the id can.
    expect(body.positions[0].roleId).toBe(77);
  });

  it("never sends an end date for a role still held", () => {
    const d = { ...emptyDraft(), title: "Lead", company: "C", companyId: 1,
                status: "ongoing" as const, endDate: "2024-01" };
    const body = buildSubmission("P", "P", "why", [d], originals()) as
      { positions: Record<string, unknown>[] };
    expect(body.positions[0].endDate).toBeNull();
  });

  it("omits a start date rather than inventing one", () => {
    const d = { ...emptyDraft(), title: "Lead", company: "C", companyId: 1 };
    const body = buildSubmission("P", "P", "why", [d], originals()) as
      { positions: Record<string, unknown>[] };
    expect(body.positions[0].startDate).toBeNull();
    expect(body.positions[0].periodKnown).toBe(false);
  });

  it("sends a name change only when the name actually moved", () => {
    const unchanged = buildSubmission("  Priya  ", "Priya", "why", [], originals()) as
      { name: string | null };
    expect(unchanged.name).toBeNull();
    const changed = buildSubmission("Priya Iyer", "Priya", "why", [], originals()) as
      { name: string | null };
    expect(changed.name).toBe("Priya Iyer");
  });

  it("carries one explanation for the whole submission", () => {
    const e = employment();
    const body = buildSubmission("P", "P", "  because I worked there  ",
                                 [{ ...draftOf(e), title: "X" }], originals(e)) as
      { explanation: string };
    expect(body.explanation).toBe("because I worked there");
  });
});

describe("hasAnythingToSubmit", () => {
  /*
    A NAME-ONLY SUBMISSION COUNTS.

    It touches no employment, so a check that only looked at positions would disable Review Changes
    on a legitimate correction and leave somebody with no way to fix a misspelled name.
  */
  it("is true for a name change with no positions touched", () => {
    const e = employment();
    expect(hasAnythingToSubmit("Priya Iyer", "Priya", [draftOf(e)], originals(e))).toBe(true);
  });

  it("is false when nothing moved at all", () => {
    const e = employment();
    expect(hasAnythingToSubmit("Priya", "Priya", [draftOf(e)], originals(e))).toBe(false);
  });

  it("ignores a position that was added and then removed", () => {
    const removed: PositionDraft = { ...emptyDraft(), title: "Oops", company: "C", removed: true };
    expect(hasAnythingToSubmit("P", "P", [removed], originals())).toBe(false);
  });
});

describe("positionProblem", () => {
  it("requires a title and a company", () => {
    expect(positionProblem({ ...emptyDraft(), company: "C" })).toMatch(/title/i);
    expect(positionProblem({ ...emptyDraft(), title: "T" })).toMatch(/company/i);
  });

  it("refuses an end date before the start", () => {
    const d = { ...emptyDraft(), title: "T", company: "C", status: "ended" as const,
                startDate: "2020-05", endDate: "2019-01" };
    expect(positionProblem(d)).toMatch(/before the start/i);
  });

  it("refuses an end date on a role still held", () => {
    const d = { ...emptyDraft(), title: "T", company: "C", status: "ongoing" as const,
                endDate: "2024-01" };
    expect(positionProblem(d)).toMatch(/still held/i);
  });

  it("accepts a position with no dates at all", () => {
    // Unknown dates are a real answer; the employment model has somewhere to say so.
    expect(positionProblem({ ...emptyDraft(), title: "T", company: "C",
                             location: { ...EMPTY_LOCATION, precision: "city",
                                         country: "Canada", city: "Toronto" } })).toBeNull();
  });

  /*
    THE LOCATION RULE, AND THE LIMIT ON IT.

    A location is mandatory on anything a submission proposes - adding a position without one was
    accepted and the Submit button enabled, which is wrong. But it is asked ONLY of a position
    somebody is actually changing: V109 backfilled no locations, so demanding one from every row
    on screen would stop a title correction until somebody invented a location for a job they know
    nothing about.
  */
  it("requires a location on a position being proposed", () => {
    expect(positionProblem({ ...emptyDraft(), title: "T", company: "C" }))
      .toMatch(/location is needed/i);
  });

  it("does not require a location on a position nobody changed", () => {
    // An employment recorded before V109, untouched: it proposes nothing, so it blocks nothing.
    const e = { ...employment(), declaredCountry: null, declaredState: null, declaredCity: null,
                declaredPrecision: null, declaredText: null, declaredSource: null,
                companyLocationId: null };
    expect(positionProblem(draftOf(e), e)).toBeNull();
  });
});

describe("summarize", () => {
  it("describes a correction with what it was and what it becomes", () => {
    const e = employment();
    const lines = summarize("P", "P", [{ ...draftOf(e), title: "Senior Supervisor" }],
                            originals(e));
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("correct");
    expect(lines[0].details.join(" ")).toContain("Depot Supervisor");
    expect(lines[0].details.join(" ")).toContain("Senior Supervisor");
  });

  it("says plainly that a company change replaces the position", () => {
    const e = employment({ claimCount: 3 });
    const lines = summarize("P", "P",
      [{ ...draftOf(e), company: "Marlowe Freight", companyId: 9 }], originals(e));
    expect(lines[0].kind).toBe("supersede");
    expect(lines[0].details.join(" ")).toContain("replaces the position");
    // How many people it touches, before anybody commits to it.
    expect(lines[0].claimsAffected).toBe(3);
  });

  it("lists an addition separately from any correction", () => {
    const e = employment();
    const drafts = [
      { ...draftOf(e), status: "ended" as const, endDate: "2023-03" },
      { ...emptyDraft(), title: "Night Lead", company: "Marlowe", companyId: 9 },
    ];
    const lines = summarize("P", "P", drafts, originals(e));
    expect(lines.map(l => l.kind)).toEqual(["correct", "add"]);
  });

  it("includes a name correction as its own line", () => {
    const lines = summarize("Priya Iyer", "Priya", [], originals());
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("name");
  });

  it("says nothing about a position nobody changed", () => {
    const e = employment();
    expect(summarize("P", "P", [draftOf(e)], originals(e))).toEqual([]);
  });
});

describe("orderEmployments", () => {
  it("puts current positions first, then previous ones most recent first", () => {
    const current = employment({ id: 1, isCurrent: true, endDate: null });
    const recent  = employment({ id: 2, isCurrent: false, endDate: "2022-06" });
    const older   = employment({ id: 3, isCurrent: false, endDate: "2015-01" });
    expect(orderEmployments([older, current, recent]).map(e => e.id)).toEqual([1, 2, 3]);
  });

  it("keeps two concurrent current roles both at the front", () => {
    // Somebody holding two jobs at once is shown as holding two jobs at once.
    const a = employment({ id: 1, isCurrent: true });
    const b = employment({ id: 2, isCurrent: true });
    const past = employment({ id: 3, isCurrent: false, endDate: "2019-01" });
    const ordered = orderEmployments([past, a, b]);
    expect(ordered.slice(0, 2).every(e => e.isCurrent)).toBe(true);
    expect(ordered[2].id).toBe(3);
  });
});

describe("the manager-record position", () => {
  /*
    THE CASE THIS EXISTS FOR.

    Most managers carry a title and a company on their own row and have NO career_history row:
    a manager created by somebody searching for them has a current position on the profile and
    nothing in the employment table. The editor showed those managers "No positions are recorded
    yet" with only an Add button, which is wrong on its face - the profile is displaying a position
    directly above it - and left the one title most likely to be wrong uncorrectable.
  */
  const fromRecord = (over: Partial<Employment> = {}): Employment => employment({
    id: null, fromManagerRecord: true, startDate: null, endDate: null, periodKnown: false,
    claimCount: 0, ...over,
  });

  it("is found among what is recorded, despite having no id", () => {
    const e = fromRecord();
    const d = draftOf(e);
    expect(d.roleId).toBeNull();
    expect(d.fromManagerRecord).toBe(true);
    // Leaving it alone proposes nothing. Keyed by id alone it would miss its own original and
    // read as a brand-new position with every field changed.
    expect(changedFields(d, e)).toEqual([]);
    expect(hasAnythingToSubmit("P", "P", [d], originals(e))).toBe(false);
  });

  it("proposes only the field that was corrected", () => {
    const e = fromRecord({ title: "Enginering Manager" });
    const d = { ...draftOf(e), title: "Engineering Manager" };
    expect(changedFields(d, e)).toEqual([CHANGE_FIELDS.title]);
  });

  it("is sent as an addition carrying the marker, because there is no row to name yet", () => {
    const e = fromRecord({ title: "Enginering Manager" });
    const d = { ...draftOf(e), title: "Engineering Manager" };
    const body = buildSubmission("P", "P", "typo", [d], originals(e)) as
      { positions: Record<string, unknown>[] };
    expect(body.positions).toHaveLength(1);
    expect(body.positions[0].intent).toBe("add");
    expect(body.positions[0].roleId).toBeNull();
    // The marker is what tells the server to write the row from the manager record and then
    // correct it, rather than treating this as a second, duplicate employment.
    expect(body.positions[0].fromManagerRecord).toBe(true);
  });

  it("cannot be removed, unlike a position somebody added", () => {
    // It is the role the profile is displaying. Taking it out would be asking to delete it, which
    // is a moderation decision and not a form control.
    expect(isRemovable(draftOf(fromRecord()))).toBe(false);
    expect(isRemovable(emptyDraft())).toBe(true);
    expect(isRemovable(draftOf(employment({ id: 41 })))).toBe(false);
  });

  it("describes itself as a correction in the review summary", () => {
    const e = fromRecord({ title: "Enginering Manager" });
    const lines = summarize("P", "P", [{ ...draftOf(e), title: "Engineering Manager" }],
                            originals(e));
    expect(lines).toHaveLength(1);
    expect(lines[0].details.join(" ")).toContain("Engineering Manager");
  });
});

describe("where a position with unknown dates sits", () => {
  /*
    THE QUESTION THIS ANSWERS: "if the user does not know the dates, where does it sit?"

    It used to depend on which surface you looked at. The trajectory ordered ASC NULLS LAST so it
    went last; the manager detail ordered DESC with Postgres's NULLS FIRST default so it went
    first; and this list substituted "9999-99" for a missing end date, which sorts as the latest
    possible value, so "they left, date unknown" outranked a role that ended last year.

    One convention now: an unknown date sorts LAST within its group. Unknown is not recent.
  */
  it("sorts an undated previous role after every dated one", () => {
    const recent = employment({ id: 1, isCurrent: false, endDate: "2023-06", startDate: "2020-01" });
    const old    = employment({ id: 2, isCurrent: false, endDate: "2015-01", startDate: "2012-01" });
    const undated = employment({ id: 3, isCurrent: false, endDate: null, startDate: null });

    expect(orderEmployments([undated, old, recent]).map(e => e.id)).toEqual([1, 2, 3]);
  });

  it("still puts a current role above everything, dated or not", () => {
    const current = employment({ id: 1, isCurrent: true, endDate: null, startDate: null });
    const past    = employment({ id: 2, isCurrent: false, endDate: "2023-06" });
    expect(orderEmployments([past, current]).map(e => e.id)).toEqual([1, 2]);
  });

  it("orders two undated previous roles stably rather than at random", () => {
    const a = employment({ id: 7, isCurrent: false, endDate: null, startDate: null });
    const b = employment({ id: 8, isCurrent: false, endDate: null, startDate: null });
    const once  = orderEmployments([a, b]).map(e => e.id);
    const twice = orderEmployments([b, a]).map(e => e.id);
    expect(once).toEqual(twice);
  });

  it("prefers a known start date over an unknown one when neither has an end", () => {
    const known   = employment({ id: 1, isCurrent: false, endDate: null, startDate: "2018-03" });
    const unknown = employment({ id: 2, isCurrent: false, endDate: null, startDate: null });
    expect(orderEmployments([unknown, known]).map(e => e.id)).toEqual([1, 2]);
  });
});

describe("titles are normalised on submission", () => {
  /*
    THESE FIVE CASES CAME FROM edit-manager.spec.ts.

    The form this editor replaced ran every title through toJobTitleCase on save, and the admin
    editor still does. Replacing the form without this would have quietly ended the behaviour, so
    the cases move here rather than disappearing with the specs that covered them.
  */
  const titleSent = (typed: string): string | null => {
    const d = { ...emptyDraft(), title: typed, company: "Acme", companyId: 1 };
    const body = buildSubmission("P", "P", "why", [d], originals()) as
      { positions: Record<string, unknown>[] };
    return body.positions[0].title as string | null;
  };

  it("sends a lowercase title in title case", () => {
    expect(titleSent("senior depot supervisor")).toBe("Senior Depot Supervisor");
  });

  it("sends lowercase ceo as CEO", () => {
    expect(titleSent("ceo")).toBe("CEO");
  });

  it("sends lowercase vp engineering as VP Engineering", () => {
    expect(titleSent("vp engineering")).toBe("VP Engineering");
  });

  it("leaves an already-correct title unchanged", () => {
    expect(titleSent("Engineering Manager")).toBe("Engineering Manager");
  });

  it("normalises an all-caps plain title", () => {
    expect(titleSent("REGIONAL MANAGER")).toBe("Regional Manager");
  });

  it("sends null rather than an empty string when there is no title", () => {
    const d = { ...emptyDraft(), title: "   ", company: "Acme", companyId: 1 };
    const body = buildSubmission("P", "P", "why", [d], originals()) as
      { positions: Record<string, unknown>[] };
    // changedFields leaves the title out entirely when it is blank, so the position carries none.
    expect(body.positions[0]?.title ?? null).toBeNull();
  });
});
