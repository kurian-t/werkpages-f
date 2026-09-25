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
