import { describe, it, expect } from "vitest";
import { TOP_RATED_MIN_REVIEWS, TOP_RATED_THRESHOLD, isTopRated } from "./topRated";

describe("isTopRated", () => {
  it("awards the badge on a high rating with enough reviews behind it", () => {
    expect(isTopRated(4.5, 3)).toBe(true);
    expect(isTopRated(5, 100)).toBe(true);
  });

  it("treats the threshold as inclusive", () => {
    expect(isTopRated(TOP_RATED_THRESHOLD, TOP_RATED_MIN_REVIEWS)).toBe(true);
    expect(isTopRated(TOP_RATED_THRESHOLD - 0.1, 10)).toBe(false);
  });

  it("withholds the badge from a perfect score with too few reviews", () => {
    // This is the case the minimum exists for: one five-star review used to earn "Top rated",
    // which on a profile page is the headline and gets screenshotted.
    expect(isTopRated(5, 1)).toBe(false);
    expect(isTopRated(5, TOP_RATED_MIN_REVIEWS - 1)).toBe(false);
  });

  it("withholds it from a low rating no matter how many reviews", () => {
    expect(isTopRated(3.9, 500)).toBe(false);
  });

  it("accepts numeric strings, which is how some API fields arrive", () => {
    expect(isTopRated("4.7", "12")).toBe(true);
    expect(isTopRated("4.7", "1")).toBe(false);
  });

  it("fails closed on anything it cannot read", () => {
    // An unknown review count is not evidence of quality.
    expect(isTopRated(4.9, null)).toBe(false);
    expect(isTopRated(4.9, undefined)).toBe(false);
    expect(isTopRated(null, 10)).toBe(false);
    expect(isTopRated(undefined, undefined)).toBe(false);
    expect(isTopRated("", "")).toBe(false);
    expect(isTopRated("not a number", 10)).toBe(false);
    expect(isTopRated(4.9, "lots")).toBe(false);
    expect(isTopRated(Number.NaN, 10)).toBe(false);
    expect(isTopRated(Number.POSITIVE_INFINITY, 10)).toBe(false);
  });

  it("treats zero reviews as not rated at all", () => {
    expect(isTopRated(0, 0)).toBe(false);
    expect(isTopRated(4.9, 0)).toBe(false);
  });
});
