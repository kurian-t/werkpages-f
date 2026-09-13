import { describe, it, expect } from "vitest";
import { strongestAndWeakest, INTERVIEW_CATEGORIES } from "@/lib/interviews";

/**
 * How many categories the interview tab calls out at each end.
 *
 * The guard is `Math.min(3, Math.floor(length / 2))`, and the halving is what stops a category
 * appearing as both a strength and a weakness. With five categories it yielded two and two, so the
 * interview tab ranked less than the manager and workplace tabs beside it. A sixth question makes
 * three and three fit without overlap - the formula did not need changing, the dataset did.
 */
describe("strongest and weakest on the interview tab", () => {
  const spread = Object.fromEntries(
    INTERVIEW_CATEGORIES.map((c, i) => [c, 1 + i * 0.5]),
  ) as any;

  it("asks six things, which is what makes three and three possible", () => {
    expect(INTERVIEW_CATEGORIES).toHaveLength(6);
  });

  it("names three at each end, like the other two tabs", () => {
    const { strongest, weakest } = strongestAndWeakest(spread);
    expect(strongest).toHaveLength(3);
    expect(weakest).toHaveLength(3);
  });

  it("never names the same category as both", () => {
    const { strongest, weakest } = strongestAndWeakest(spread);
    const names = strongest.map(([k]) => k);
    expect(names.filter((k) => weakest.some(([w]) => w === k))).toEqual([]);
  });

  it("orders each end outwards from the middle", () => {
    const { strongest, weakest } = strongestAndWeakest(spread);
    expect(strongest.map(([, v]) => v)).toEqual([...strongest.map(([, v]) => v)].sort((a, b) => b - a));
    expect(weakest.map(([, v]) => v)).toEqual([...weakest.map(([, v]) => v)].sort((a, b) => a - b));
  });
});
