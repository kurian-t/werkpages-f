import { describe, it, expect } from "vitest";
import { isManagerIndexable, isCompanyIndexable } from "./indexability";

/**
 * The rule that decides what Google is allowed to see.
 *
 * This replaced "has at least one review", which was excluding 738 pages. The fear behind the old
 * rule was legitimate - a wall of review-less profiles can read as mass-generated near-duplicate
 * filler and drag a whole domain down - but it conflated "nobody has rated this person yet" with
 * "there is nothing on this page", and only the second is thin.
 *
 * These assertions are the line between those two conditions. If someone later decides to tighten
 * it again, the cases below say what was deliberately let in and why.
 */

describe("isManagerIndexable", () => {
  it("indexes a profile with a role and an employer even with no reviews", () => {
    /*
      The whole point of the change. This profile has a real person's role and employer on it -
      unique content - and somebody googling that name is exactly who it is for. Under the old
      rule it was noindex, so that search never reached it, and the first review never got
      written. That is the growth loop the old rule was closing off.
    */
    expect(isManagerIndexable({ title: "Engineering Manager", company: "Acme Corp" })).toBe(true);
  });

  it("excludes a profile with no employer", () => {
    // A name and a job title with nowhere to attach them. Nothing a search result could promise.
    expect(isManagerIndexable({ title: "Engineering Manager", company: "" })).toBe(false);
    expect(isManagerIndexable({ title: "Engineering Manager", company: null })).toBe(false);
  });

  it("excludes a profile with no role", () => {
    expect(isManagerIndexable({ title: "", company: "Acme Corp" })).toBe(false);
    expect(isManagerIndexable({ title: null, company: "Acme Corp" })).toBe(false);
  });

  it("treats whitespace as absent", () => {
    // These columns are NOT NULL, so "empty" arrives as blanks rather than null. A page whose
    // employer is three spaces is just as empty as one whose employer is missing.
    expect(isManagerIndexable({ title: "   ", company: "Acme Corp" })).toBe(false);
    expect(isManagerIndexable({ title: "Manager", company: "  \t " })).toBe(false);
  });

  it("is false for nothing at all rather than throwing", () => {
    // Called during render while the profile is still loading.
    expect(isManagerIndexable(null)).toBe(false);
    expect(isManagerIndexable(undefined)).toBe(false);
  });
});

describe("isCompanyIndexable", () => {
  it("indexes a company with at least one manager who has a role", () => {
    expect(isCompanyIndexable({ managers: [{ title: "Engineering Manager" }] })).toBe(true);
  });

  it("excludes a company whose only managers have no role", () => {
    expect(isCompanyIndexable({ managers: [{ title: "" }, { title: null }] })).toBe(false);
  });

  it("excludes a company with nobody on it", () => {
    // A heading and an empty state. There is no list, which is the reason to visit the page.
    expect(isCompanyIndexable({ managers: [], managerCount: 0 })).toBe(false);
  });

  it("falls back to the count when the roster was not loaded", () => {
    // Listing surfaces carry a count without the roster; the manager's own page still decides
    // for itself, so this only has to avoid submitting a company with nobody on it.
    expect(isCompanyIndexable({ managerCount: 3 })).toBe(true);
    expect(isCompanyIndexable({ managerCount: 0 })).toBe(false);
  });

  it("is false for nothing at all rather than throwing", () => {
    expect(isCompanyIndexable(null)).toBe(false);
    expect(isCompanyIndexable(undefined)).toBe(false);
  });
});
