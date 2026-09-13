import { describe, it, expect } from "vitest";
import { applyBreakdownFilter, type RatingRow } from "@/components/RatingBreakdown";

/**
 * Which categories each pill shows.
 *
 * The three states are the whole feature, and the rules that make them useful are easy to get
 * subtly wrong: All has to keep the order the categories were asked in, Highest and Lower have to
 * sort in opposite directions, and an unrated category has to stay out of both slices rather than
 * filling Lower with zeroes.
 */

const row = (key: string, value: number): RatingRow => ({ key, label: key, value });

/* Deliberately unsorted and varied, so a filter that returns its input unchanged fails. */
const ROWS: RatingRow[] = [
  row("Communication", 3.2),
  row("Clarity of expectations", 5.0),
  row("Fairness", 1.4),
  row("Organization & planning", 4.8),
  row("Professional demeanor", 4.6),
  row("Support", 2.1),
  row("Approachability", 3.9),
];

describe("applyBreakdownFilter", () => {
  it("shows every category, in the order they are asked, under All", () => {
    // Not sorted: the default view should read like the form that produced it.
    const out = applyBreakdownFilter(ROWS, "all");
    expect(out.map((r) => r.key)).toEqual(ROWS.map((r) => r.key));
  });

  it("shows the three best, best first, under Highest", () => {
    expect(applyBreakdownFilter(ROWS, "highest").map((r) => r.key)).toEqual([
      "Clarity of expectations", "Organization & planning", "Professional demeanor",
    ]);
  });

  it("shows the three worst, worst first, under Lower", () => {
    expect(applyBreakdownFilter(ROWS, "lower").map((r) => r.key)).toEqual([
      "Fairness", "Support", "Communication",
    ]);
  });

  it("never shows the same category as both a strength and a weakness", () => {
    /*
      The overlap bug. With six or fewer rated categories, a naive top-3 and bottom-3 return
      overlapping sets - a company once listed the same three categories as both its strongest and
      its weakest. Three each out of six is the exact boundary where that starts.
    */
    const six = ROWS.slice(0, 6);
    const highest = applyBreakdownFilter(six, "highest").map((r) => r.key);
    const lower = applyBreakdownFilter(six, "lower").map((r) => r.key);
    expect(highest.filter((k) => lower.includes(k))).toEqual([]);
  });

  it("leaves unrated categories out of both slices", () => {
    // A zero means nobody answered, not that they answered badly.
    const withGaps = [...ROWS, row("Never rated", 0), row("Also never rated", 0)];
    expect(applyBreakdownFilter(withGaps, "lower").map((r) => r.key))
      .not.toContain("Never rated");
    expect(applyBreakdownFilter(withGaps, "highest").map((r) => r.key))
      .not.toContain("Never rated");
  });

  it("still lists unrated categories under All", () => {
    // The reader is entitled to know the category exists and nobody has answered it.
    const withGap = [...ROWS, row("Never rated", 0)];
    expect(applyBreakdownFilter(withGap, "all").map((r) => r.key)).toContain("Never rated");
  });

  it("returns what it has when there are fewer than three rated categories", () => {
    const two = [row("A", 4.0), row("B", 2.0)];
    expect(applyBreakdownFilter(two, "highest").map((r) => r.key)).toEqual(["A", "B"]);
    expect(applyBreakdownFilter(two, "lower").map((r) => r.key)).toEqual(["B", "A"]);
  });

  it("handles an empty set without throwing", () => {
    for (const f of ["all", "highest", "lower"] as const) {
      expect(applyBreakdownFilter([], f)).toEqual([]);
    }
  });

  it("does not mutate the rows it was given", () => {
    // It sorts, and sorting in place would silently reorder the caller's array - which is the
    // same array the All view renders from.
    const original = ROWS.map((r) => r.key);
    applyBreakdownFilter(ROWS, "highest");
    applyBreakdownFilter(ROWS, "lower");
    expect(ROWS.map((r) => r.key)).toEqual(original);
  });
});
