import { describe, it, expect } from "vitest";
import { categoryAverageEntries, rankCategoryAverages } from "./categoryAverages";

/**
 * The reason this module exists, asserted.
 *
 * Two bugs, both caused by three surfaces each keeping their own copy of these few lines: a crash
 * on a payload without the field, and a category shown as best and worst at once. Tested here
 * rather than through a browser because it is arithmetic about a map - a question that can be
 * asked in a millisecond without a page, a fixture or a mocked endpoint.
 */
describe("reading category averages", () => {
  /*
    Regression. CompanyProfile called Object.entries(data.categoryAverages) with no guard, so a
    response that omitted the key threw "Cannot convert undefined or null to object" and the page
    rendered an error boundary instead of the company. IndustryProfile, asking the same question of
    the same field, had a guard and was fine.
  */
  it("survives a payload with no category averages at all", () => {
    expect(categoryAverageEntries(undefined)).toEqual([]);
    expect(categoryAverageEntries(null)).toEqual([]);
    expect(rankCategoryAverages(undefined).ranked).toEqual([]);
    expect(rankCategoryAverages(null).strongest).toEqual([]);
    expect(rankCategoryAverages(null).weakest).toEqual([]);
  });

  it("survives an empty map, which is what an unrated company actually sends", () => {
    expect(categoryAverageEntries({})).toEqual([]);
    expect(rankCategoryAverages({}).ranked).toEqual([]);
  });

  /*
    Absent information stays absent. Coercing a null to 0.0 would print a score nobody gave, and
    on a page about how a workplace treats people a fabricated zero is worse than a blank.
  */
  it("drops categories that are not real numbers rather than coercing them", () => {
    const entries = categoryAverageEntries({
      Communication: 4.2,
      Clarity: null as unknown as number,
      Support: undefined as unknown as number,
      Fairness: NaN,
      Growth: "3.5" as unknown as number,
    });

    expect(entries).toEqual([{ label: "Communication", value: 4.2 }]);
  });

  it("ranks best first", () => {
    const { ranked } = rankCategoryAverages({ Low: 1.5, High: 4.8, Mid: 3.0 });

    expect(ranked.map((c) => c.label)).toEqual(["High", "Mid", "Low"]);
  });

  it("gives the worst first among the weakest, so the worst is not buried", () => {
    const { weakest } = rankCategoryAverages({
      A: 5, B: 4.5, C: 4, D: 3, E: 2, F: 1,
    });

    expect(weakest.map((c) => c.label)).toEqual(["F", "E", "D"]);
  });

  /*
    Regression, and the one that was found and fixed twice in two different files.

    slice(0, 3) and slice(-3) overlap on any list of six or fewer, so with five categories the
    third-best was also reported as the third-worst - a category shown as a strength and a weakness
    at the same time, which reads as broken data.
  */
  it("never names the same category both strongest and weakest", () => {
    for (const size of [1, 2, 3, 4, 5, 6]) {
      const averages: Record<string, number> = {};
      for (let i = 0; i < size; i++) averages[`c${i}`] = size - i;

      const { strongest, weakest } = rankCategoryAverages(averages);
      const overlap = strongest.filter((s) => weakest.some((w) => w.label === s.label));

      expect(overlap, `${size} categories produced an overlap`).toEqual([]);
    }
  });

  it("splits a long list into three and three", () => {
    const averages: Record<string, number> = {};
    for (let i = 0; i < 10; i++) averages[`c${i}`] = 10 - i;

    const { strongest, weakest } = rankCategoryAverages(averages);

    expect(strongest.map((c) => c.label)).toEqual(["c0", "c1", "c2"]);
    expect(weakest.map((c) => c.label)).toEqual(["c9", "c8", "c7"]);
  });

  it("does not mutate the caller's object", () => {
    // The ranking sorts, and sorting the caller's array in place is how a render order quietly
    // changes somewhere unrelated.
    const averages = { A: 1, B: 3, C: 2 };
    rankCategoryAverages(averages);

    expect(Object.keys(averages)).toEqual(["A", "B", "C"]);
  });
});
