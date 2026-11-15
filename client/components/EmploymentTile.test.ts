import { describe, it, expect } from "vitest";
import { employmentPeriod } from "./EmploymentTile";
import type { Employment } from "@/lib/roleAwareSubmission";

/**
 * The period line on a job tile, which is the evidence somebody uses to tell two people apart.
 *
 * A contributor looking at three profiles called Bob Burger decides between them on where and when
 * each one worked. Getting the dates wrong, or showing dates that were never confirmed as though
 * they were fact, makes them rule out the right person.
 */

function job(over: Partial<Employment> = {}): Employment {
  return {
    roleId: 1,
    companyId: 2,
    company: "Adobe",
    title: "Engineering Manager",
    state: "accepted",
    periodKnown: true,
    startDate: "2018-01-01",
    endDate: "2022-12-01",
    selectable: true,
    ...over,
  } as Employment;
}

describe("employmentPeriod", () => {
  it("reads as a person would write it", () => {
    expect(employmentPeriod(job())).toBe("Jan 2018 – Dec 2022");
  });

  it("says Present for a job with no end date", () => {
    expect(employmentPeriod(job({ startDate: "2023-03-01", endDate: null }))).toBe(
      "Mar 2023 – Present",
    );
  });

  /*
    AN UNCONFIRMED PERIOD IS NOT A PERIOD.

    A record can carry a start date nobody ever confirmed. Printing it looks identical to a
    confirmed one, and a contributor who worked for the person in 2019 will rule them out on the
    strength of a date the product never actually knew. Absence is the honest answer.
  */
  it("shows nothing when the period is not known, even with a date present", () => {
    expect(employmentPeriod(job({ periodKnown: false }))).toBeNull();
    expect(employmentPeriod(job({ periodKnown: false, endDate: null }))).toBeNull();
  });

  it("shows nothing when there is no start date", () => {
    expect(employmentPeriod(job({ startDate: null }))).toBeNull();
  });

  // A search-created manager's current role arrives with no dates at all. That tile still has to
  // render, because it is usually the only job the person has.
  it("survives a job with no dates at all", () => {
    expect(
      employmentPeriod(job({ periodKnown: false, startDate: null, endDate: null })),
    ).toBeNull();
  });

  it("falls back to the year when the month is unreadable", () => {
    expect(employmentPeriod(job({ startDate: "2018", endDate: null }))).toBeNull();
  });
});
