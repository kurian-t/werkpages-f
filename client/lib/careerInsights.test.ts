import { describe, it, expect } from "vitest";
import {
  computeCareerSegments,
  computeTransitions,
  generateCareerInsights,
  computeConsistencyScore,
  type ReviewForTimeline,
  type CareerSegment,
} from "./careerInsights";

// ── Helpers ────────────────────────────────────────────────────────────────────

function rev(
  company: string,
  title: string,
  rating: number,
  from?: string,
  until?: string,
  ratings?: Record<string, number>
): ReviewForTimeline {
  return { managerCompany: company, managerTitle: title, overallRating: rating, workedFrom: from, workedUntil: until, ratings };
}

function seg(
  company: string,
  role: string,
  avgRating: number,
  reviewCount = 1,
  startDate: string | null = null,
  endDate: string | null = null,
  isCurrent = false
): CareerSegment {
  return { company, role, averageRating: avgRating, reviewCount, startDate, endDate, isCurrent, categoryAverages: {} };
}

// ── computeCareerSegments ─────────────────────────────────────────────────────

describe("computeCareerSegments", () => {
  it("returns empty array for empty input", () => {
    expect(computeCareerSegments([])).toEqual([]);
  });

  it("filters out reviews with missing company", () => {
    expect(computeCareerSegments([rev("", "Manager", 4)])).toEqual([]);
  });

  it("filters out reviews with missing title", () => {
    expect(computeCareerSegments([rev("Acme", "", 4)])).toEqual([]);
  });

  it("filters out reviews with zero rating", () => {
    expect(computeCareerSegments([rev("Acme", "Manager", 0)])).toEqual([]);
  });

  it("creates one segment for a single review", () => {
    const segs = computeCareerSegments([rev("Acme", "Manager", 4)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].company).toBe("Acme");
    expect(segs[0].role).toBe("Manager");
    expect(segs[0].averageRating).toBe(4);
    expect(segs[0].reviewCount).toBe(1);
  });

  it("groups reviews with same company+title into one segment", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2021-01", "2022-01"),
      rev("Acme", "Manager", 3, "2020-06", "2021-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs).toHaveLength(1);
    expect(segs[0].reviewCount).toBe(2);
    expect(segs[0].averageRating).toBe(3.5);
  });

  it("creates separate segments for different companies", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2020-01", "2021-01"),
      rev("Globex", "Manager", 3, "2021-01", "2022-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs).toHaveLength(2);
  });

  it("creates separate segments for different titles at same company", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2020-01", "2021-01"),
      rev("Acme", "Senior Manager", 5, "2021-01", "2022-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs).toHaveLength(2);
  });

  it("sorts segments chronologically by startDate", () => {
    const reviews = [
      rev("Globex", "Manager", 3, "2022-01", "2023-01"),
      rev("Acme", "Manager", 4, "2020-01", "2021-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs[0].company).toBe("Acme");
    expect(segs[1].company).toBe("Globex");
  });

  it("puts segments without startDate at the end", () => {
    const reviews = [
      rev("Acme", "Manager", 4),
      rev("Globex", "Director", 3, "2020-01", "2021-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs[0].company).toBe("Globex");
    expect(segs[1].company).toBe("Acme");
  });

  it("marks segment as current when a review has no workedUntil", () => {
    const segs = computeCareerSegments([rev("Acme", "Manager", 4, "2023-01")]);
    expect(segs[0].isCurrent).toBe(true);
    expect(segs[0].endDate).toBeNull();
  });

  it("sets correct startDate from earliest workedFrom", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2021-06", "2022-01"),
      rev("Acme", "Manager", 3, "2020-01", "2021-06"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs[0].startDate).toBe("2020-01");
  });

  it("sets correct endDate from latest workedUntil", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2020-01", "2021-06"),
      rev("Acme", "Manager", 3, "2021-06", "2023-01"),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs[0].endDate).toBe("2023-01");
  });

  it("computes category averages", () => {
    const reviews = [
      rev("Acme", "Manager", 4, "2020-01", "2021-01", { communication: 4, leadership: 5 }),
      rev("Acme", "Manager", 3, "2021-01", "2022-01", { communication: 2, leadership: 3 }),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs[0].categoryAverages.communication).toBe(3);
    expect(segs[0].categoryAverages.leadership).toBe(4);
  });

  it("grouping is case-insensitive for company and title", () => {
    const reviews = [
      rev("acme", "manager", 4),
      rev("ACME", "MANAGER", 3),
    ];
    const segs = computeCareerSegments(reviews);
    expect(segs).toHaveLength(1);
    expect(segs[0].reviewCount).toBe(2);
  });
});

// ── computeTransitions ────────────────────────────────────────────────────────

describe("computeTransitions", () => {
  it("returns empty array for fewer than 2 segments", () => {
    expect(computeTransitions([])).toEqual([]);
    expect(computeTransitions([seg("Acme", "Manager", 4)])).toEqual([]);
  });

  it("returns one transition for two segments", () => {
    const segs = [seg("Acme", "Manager", 4), seg("Globex", "Director", 5)];
    const transitions = computeTransitions(segs);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].ratingDelta).toBe(1);
  });

  it("calculates ratingDelta correctly (positive)", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Globex", "Manager", 4.5)];
    const transitions = computeTransitions(segs);
    expect(transitions[0].ratingDelta).toBe(1.5);
  });

  it("calculates ratingDelta correctly (negative)", () => {
    const segs = [seg("Acme", "Director", 5), seg("Globex", "Manager", 3)];
    const transitions = computeTransitions(segs);
    expect(transitions[0].ratingDelta).toBe(-2);
  });

  it("classifies same_company_new_role transition", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Acme", "Director", 4)];
    const transitions = computeTransitions(segs);
    expect(transitions[0].type).toBe("same_company_new_role");
  });

  it("classifies new_company_same_role transition", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Globex", "Manager", 4)];
    const transitions = computeTransitions(segs);
    expect(transitions[0].type).toBe("new_company_same_role");
  });

  it("classifies new_company_new_role transition", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Globex", "Director", 4)];
    const transitions = computeTransitions(segs);
    expect(transitions[0].type).toBe("new_company_new_role");
  });

  it("returns n-1 transitions for n segments", () => {
    const segs = [
      seg("A", "M1", 3),
      seg("B", "M2", 4),
      seg("C", "M3", 5),
      seg("D", "M4", 3),
    ];
    expect(computeTransitions(segs)).toHaveLength(3);
  });
});

// ── generateCareerInsights ────────────────────────────────────────────────────

describe("generateCareerInsights", () => {
  it("returns null for fewer than 2 segments", () => {
    expect(generateCareerInsights([])).toBeNull();
    expect(generateCareerInsights([seg("Acme", "Manager", 4)])).toBeNull();
  });

  it("returns a result for 2 segments", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Globex", "Director", 4.5)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    expect(result!.headline).toBeTruthy();
    expect(result!.overallTrend).toBeDefined();
  });

  it("identifies stable trend (small delta, low volatility)", () => {
    const segs = [seg("A", "M", 4), seg("B", "N", 4.2)];
    const result = generateCareerInsights(segs);
    expect(result!.overallTrend).toBe("stable");
  });

  it("identifies upward trend (delta > 0.3, volatility <= 1.0)", () => {
    // 3 → 3.5: overallDelta = 0.5 > 0.3, volatility = 0.5 <= 1.0 → upward
    const segs = [seg("A", "M", 3), seg("B", "N", 3.5)];
    const result = generateCareerInsights(segs);
    expect(result!.overallTrend).toBe("upward");
  });

  it("identifies downward trend (delta < -0.3, volatility <= 1.0)", () => {
    // 4.5 → 4: overallDelta = -0.5 < -0.3, volatility = 0.5 <= 1.0 → downward
    const segs = [seg("A", "M", 4.5), seg("B", "N", 4)];
    const result = generateCareerInsights(segs);
    expect(result!.overallTrend).toBe("downward");
  });

  it("identifies mixed trend (high volatility)", () => {
    const segs = [seg("A", "M", 5), seg("B", "N", 1), seg("C", "O", 5)];
    const result = generateCareerInsights(segs);
    expect(result!.overallTrend).toBe("mixed");
  });

  it("has low confidence for single review per segment", () => {
    const segs = [seg("A", "M", 3, 1), seg("B", "N", 5, 1)];
    const result = generateCareerInsights(segs);
    expect(result!.confidence).toBe("low");
  });

  it("has medium confidence for 4+ total reviews", () => {
    const segs = [seg("A", "M", 3, 2), seg("B", "N", 5, 2)];
    const result = generateCareerInsights(segs);
    expect(result!.confidence).toBe("medium");
  });

  it("has high confidence for 10+ reviews across 3+ segments with 2+ per segment", () => {
    const segs = [
      seg("A", "M", 3, 4),
      seg("B", "N", 4, 3),
      seg("C", "O", 5, 3),
    ];
    const result = generateCareerInsights(segs);
    expect(result!.confidence).toBe("high");
  });

  it("returns supportingSignals and possibleInterpretations arrays", () => {
    const segs = [seg("A", "M", 2, 1), seg("B", "N", 5, 1)];
    const result = generateCareerInsights(segs);
    expect(Array.isArray(result!.supportingSignals)).toBe(true);
    expect(Array.isArray(result!.possibleInterpretations)).toBe(true);
  });

  it("returns a confidenceReason string", () => {
    const segs = [seg("A", "M", 3), seg("B", "N", 4)];
    const result = generateCareerInsights(segs);
    expect(typeof result!.confidenceReason).toBe("string");
    expect(result!.confidenceReason.length).toBeGreaterThan(0);
  });

  it("headline mentions both ratings for 2-segment upward trend", () => {
    const segs = [seg("Acme", "Manager", 3), seg("Globex", "Director", 5)];
    const result = generateCareerInsights(segs);
    expect(result!.headline).toContain("3");
    expect(result!.headline).toContain("5");
  });

  it("headline mentions both ratings for 2-segment downward trend", () => {
    const segs = [seg("Acme", "Manager", 5), seg("Globex", "Director", 3)];
    const result = generateCareerInsights(segs);
    expect(result!.headline).toContain("5");
    expect(result!.headline).toContain("3");
  });

  it("includes signal about tight rating range for stable performer", () => {
    const segs = [seg("A", "M", 4.0), seg("B", "N", 4.2)];
    const result = generateCareerInsights(segs);
    expect(result!.supportingSignals.some(s => s.includes("0.2") || s.includes("tight"))).toBe(true);
  });

  it("adds interpretation for large drop when type is new_company_same_role", () => {
    const segs = [seg("Acme", "Manager", 5), seg("Globex", "Manager", 2)];
    const result = generateCareerInsights(segs);
    expect(result!.possibleInterpretations.length).toBeGreaterThan(0);
  });

  it("adds internal-role-change decline interpretation (same_company_new_role worst drop)", () => {
    // same company, different role, rating drops > 0.75 — exercises the 'else' branch in worst-drop logic
    const segs = [seg("Acme", "Manager", 5), seg("Acme", "Director", 4)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    const hasInternalDeclineMsg = result!.possibleInterpretations.some(s =>
      s.includes("internal role change") || s.includes("mismatch")
    );
    expect(hasInternalDeclineMsg).toBe(true);
  });

  it("adds internal-role-change improvement interpretation (same_company_new_role best gain)", () => {
    // same company, different role, rating improves > 0.75 — exercises the 'same_company_new_role' branch in best-gain logic
    const segs = [seg("Acme", "Manager", 3), seg("Acme", "Director", 4.5)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    const hasInternalGainMsg = result!.possibleInterpretations.some(s =>
      s.includes("internal change") || s.includes("alignment")
    );
    expect(hasInternalGainMsg).toBe(true);
  });

  it("adds high-variability interpretation when volatility > 1.2", () => {
    // 3-segment case with volatility > 1.2 → exercises the volatility > 1.2 branch
    const segs = [seg("A", "M", 2, 1), seg("B", "N", 4, 1), seg("C", "O", 2, 1)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    const hasVariabilityMsg = result!.possibleInterpretations.some(s =>
      s.includes("context-dependent") || s.includes("variab")
    );
    expect(hasVariabilityMsg).toBe(true);
  });

  it("gradual increase headline for 3+ upward segments with small best gain", () => {
    // 3 segments, upward trend, best gain <= 1.0 → 'Gradual increase' headline
    const segs = [seg("A", "M", 3.0), seg("B", "N", 3.3), seg("C", "O", 3.6)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    expect(result!.overallTrend).toBe("upward");
    expect(result!.headline).toContain("Gradual increase");
  });

  it("gradual decrease headline for 3+ downward segments with small worst drop", () => {
    // 3 segments, downward trend, worst drop >= -0.75 → 'Gradual decrease' headline
    const segs = [seg("A", "M", 4.0), seg("B", "N", 3.7), seg("C", "O", 3.4)];
    const result = generateCareerInsights(segs);
    expect(result).not.toBeNull();
    expect(result!.overallTrend).toBe("downward");
    expect(result!.headline).toContain("Gradual decrease");
  });
});

// ── computeConsistencyScore ───────────────────────────────────────────────────

describe("computeConsistencyScore", () => {
  it("returns null for fewer than 2 segments", () => {
    expect(computeConsistencyScore([])).toBeNull();
    expect(computeConsistencyScore([seg("A", "M", 4)])).toBeNull();
  });

  it("returns a result with expected fields", () => {
    const segs = [seg("A", "M", 3), seg("B", "N", 4)];
    const result = computeConsistencyScore(segs);
    expect(result).not.toBeNull();
    expect(result!.profile).toBeDefined();
    expect(result!.riskLevel).toBeDefined();
    expect(result!.score).toBeDefined();
    expect(result!.standardDeviation).toBeDefined();
    expect(result!.headline).toBeTruthy();
    expect(result!.description).toBeTruthy();
    expect(result!.hrInterpretation).toBeTruthy();
  });

  it("identifies stable_performer when sd < 0.35", () => {
    // Ratings 4.0 and 4.2 → sd ≈ 0.1 → stable_performer
    const segs = [seg("A", "M", 4.0), seg("B", "N", 4.2)];
    const result = computeConsistencyScore(segs);
    expect(result!.profile).toBe("stable_performer");
    expect(result!.riskLevel).toBe("low");
  });

  it("identifies volatile_performer when sd >= 0.85", () => {
    // Ratings 1 and 5 → sd = 2 → volatile_performer
    const segs = [seg("A", "M", 1), seg("B", "N", 5)];
    const result = computeConsistencyScore(segs);
    expect(result!.profile).toBe("volatile_performer");
    expect(result!.riskLevel).toBe("high");
  });

  it("identifies improver with monotonically increasing ratings and delta >= 0.8", () => {
    // 2 → 3 → 4 → all positive deltas, overallDelta = 2
    const segs = [seg("A", "M", 2), seg("B", "N", 3), seg("C", "O", 4)];
    const result = computeConsistencyScore(segs);
    expect(result!.profile).toBe("improver");
    expect(result!.riskLevel).toBe("declining");
  });

  it("identifies decliner with monotonically decreasing ratings and delta <= -0.8", () => {
    // 5 → 4 → 3 → all negative deltas, overallDelta = -2
    const segs = [seg("A", "M", 5), seg("B", "N", 4), seg("C", "O", 3)];
    const result = computeConsistencyScore(segs);
    expect(result!.profile).toBe("decliner");
    expect(result!.riskLevel).toBe("increasing");
  });

  it("identifies context_dependent when not matching other profiles", () => {
    // 3 → 4 → 3: sd ≈ 0.47 (in the 0.35–0.85 range), not improver (not all positive), not decliner
    const segs = [seg("A", "M", 3), seg("B", "N", 4), seg("C", "O", 3)];
    const result = computeConsistencyScore(segs);
    expect(result!.profile).toBe("context_dependent");
    expect(result!.riskLevel).toBe("medium");
  });

  it("score is 100 for perfectly stable (sd=0)", () => {
    const segs = [seg("A", "M", 4), seg("B", "N", 4), seg("C", "O", 4)];
    const result = computeConsistencyScore(segs);
    expect(result!.score).toBe(100);
    expect(result!.standardDeviation).toBe(0);
  });

  it("score is between 0 and 100", () => {
    const segs = [seg("A", "M", 1), seg("B", "N", 5)];
    const result = computeConsistencyScore(segs);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
  });

  it("higher sd yields lower score", () => {
    const stable = computeConsistencyScore([seg("A", "M", 4), seg("B", "N", 4.1)]);
    const volatile_ = computeConsistencyScore([seg("A", "M", 1), seg("B", "N", 5)]);
    expect(stable!.score).toBeGreaterThan(volatile_!.score);
  });
});
