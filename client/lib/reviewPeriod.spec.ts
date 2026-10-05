import { describe, it, expect } from "vitest";
import { formatReviewPeriod, reviewEndDate } from "./reviewPeriod";

/*
  Reported from production: a rating card read "Jan 2021 – Present" for a manager who had
  already left that role. `workedUntil` is the REVIEWER's date and they were still at the
  company; `effectiveWorkedUntil` is that date capped at the manager's own departure.

  Three pages each had their own copy of this formatting, so the fix only ever landed on one.
*/
describe("reviewEndDate", () => {
  it("prefers the capped date over the reviewer's own", () => {
    expect(reviewEndDate({ workedUntil: null, effectiveWorkedUntil: "2022-06-01" }))
      .toBe("2022-06-01");
  });

  it("falls back to the reviewer's date when the API sends no capped one", () => {
    expect(reviewEndDate({ workedUntil: "2023-01-01" })).toBe("2023-01-01");
  });

  it("is null when the role is genuinely still open", () => {
    expect(reviewEndDate({ workedFrom: "2021-01-01" })).toBeNull();
  });
});

describe("formatReviewPeriod", () => {
  it("does not say Present once the manager has left the role", () => {
    const text = formatReviewPeriod({
      workedFrom: "2021-01-01",
      workedUntil: null,
      effectiveWorkedUntil: "2022-06-01",
    });
    expect(text).toBe("Jan 2021 – Jun 2022");
    expect(text).not.toContain("Present");
  });

  it("still says Present while the role is open", () => {
    expect(formatReviewPeriod({ workedFrom: "2021-01-01" })).toBe("Jan 2021 – Present");
  });

  /* Account Settings says "Current" where the profile says "Present" - deliberate wording. */
  it("uses the caller's word for an open role", () => {
    expect(formatReviewPeriod({ workedFrom: "2021-01-01" }, { openLabel: "Current" }))
      .toBe("Jan 2021 – Current");
  });

  it("uses the caller's placeholder when there is no start date", () => {
    expect(formatReviewPeriod({ workedUntil: "2022-06-01" }, { emptyStart: "No date" }))
      .toBe("No date – Jun 2022");
  });

  /* The profile's own list renders unguarded, and rendered "No date – " before. Unchanged. */
  it("leaves the open label off when there is no start date either", () => {
    expect(formatReviewPeriod({}, { emptyStart: "No date" })).toBe("No date – ");
  });
});

/*
  "Present" is the only value on a card that changes meaning while nobody touches it, and it only
  ever changes in the direction of claiming MORE than was attested. Somebody who wrote
  "Jan 2024 - Present" in March 2024 stood behind fourteen months; left alone, the same card
  asserts thirty-one by late 2026. Nothing confirmed the extra seventeen.

  Capping it to the attestation month was considered and rejected: "Jan 2024 - Mar 2024" says the
  relationship ENDED in March, which the reviewer never claimed and which is probably false for
  somebody still in the job. That trades one wrong statement for a worse one, and invents an end
  date with no source. Bounding the open claim with the date it was last stood behind states only
  facts.
*/
describe("an open-ended period is bounded by when it was last attested", () => {
  const NOW = new Date("2026-10-04T12:00:00Z");

  it("says how old the claim is once its month has passed", () => {
    expect(formatReviewPeriod(
      { workedFrom: "2024-01-01", updatedAt: "2024-03-14T09:00:00Z" },
      { now: NOW },
    )).toBe("Jan 2024 – Present · as of Mar 2024");
  });

  it("stays silent inside the month it was attested, where it would add nothing", () => {
    // Still October 2026: "as of Oct 2026" tells a reader what they already assume, and every
    // freshly written card would carry the noise.
    expect(formatReviewPeriod(
      { workedFrom: "2024-01-01", updatedAt: "2026-10-01T09:00:00Z" },
      { now: NOW },
    )).toBe("Jan 2024 – Present");
  });

  it("does not age a period the manager's departure already closed", () => {
    // The two rules compose. A real end date is not a stale claim, so qualifying it would be
    // both wrong and confusing.
    expect(formatReviewPeriod(
      { workedFrom: "2021-01-01", workedUntil: null, effectiveWorkedUntil: "2022-06-01",
        updatedAt: "2021-02-01T09:00:00Z" },
      { now: NOW },
    )).toBe("Jan 2021 – Jun 2022");
  });

  it("claims nothing when there is no attestation date to claim", () => {
    // An older client, or a projection that does not send updatedAt. Saying "as of" without a
    // date behind it would be the same unsourced assertion this exists to remove.
    expect(formatReviewPeriod({ workedFrom: "2024-01-01" }, { now: NOW }))
      .toBe("Jan 2024 – Present");
  });

  it("leaves a withheld period alone", () => {
    expect(formatReviewPeriod(
      { workedFrom: "2024-01-01", datesHidden: true, updatedAt: "2024-03-14T09:00:00Z" },
      { now: NOW, hiddenLabel: "Dates hidden from everyone" },
    )).toBe("Dates hidden from everyone");
  });

  it("honours a surface's own wording for both labels", () => {
    expect(formatReviewPeriod(
      { workedFrom: "2024-01-01", updatedAt: "2024-03-14T09:00:00Z" },
      { now: NOW, openLabel: "Current", asOfLabel: "last confirmed" },
    )).toBe("Jan 2024 – Current · last confirmed Mar 2024");
  });
});

/*
  Company ratings reached this formatter late. CompanyRatingList carried its own monthYear and
  its own " - Present", so when manager reviews learned to age an open claim, company ratings
  went on asserting an open-ended stay for ever - the same bug, one component over, because the
  formatting existed twice.

  That surface says "the period is open" with a `current` boolean rather than a null end date,
  and has no effectiveWorkedUntil, because nobody leaves a company the way a manager leaves a
  post. The mapping from one to the other is the only place this can now go wrong, so it is
  pinned here.
*/
describe("the shape company ratings pass in", () => {
  const NOW = new Date("2026-10-04T12:00:00Z");
  const fromCompanyRating = (r: { workedFrom: string | null; workedUntil: string | null;
                                  current: boolean; updatedAt?: string | null }) =>
    formatReviewPeriod(
      { workedFrom: r.workedFrom, workedUntil: r.current ? null : r.workedUntil,
        updatedAt: r.updatedAt },
      { now: NOW },
    );

  it("ages a still-here rating, the case that was asserting for ever", () => {
    expect(fromCompanyRating({
      workedFrom: "2022-03-01", workedUntil: null, current: true,
      updatedAt: "2024-05-10T09:00:00Z",
    })).toBe("Mar 2022 – Present · as of May 2024");
  });

  it("leaves a departed rating alone", () => {
    expect(fromCompanyRating({
      workedFrom: "2022-03-01", workedUntil: "2024-08-01", current: false,
      updatedAt: "2024-05-10T09:00:00Z",
    })).toBe("Mar 2022 – Aug 2024");
  });

  it("ignores a stale end date when the author says they are still there", () => {
    // current wins over whatever workedUntil happens to hold, or a rating that was reopened
    // would show an end date its author has withdrawn.
    expect(fromCompanyRating({
      workedFrom: "2022-03-01", workedUntil: "2023-01-01", current: true,
      updatedAt: "2024-05-10T09:00:00Z",
    })).toBe("Mar 2022 – Present · as of May 2024");
  });
});
