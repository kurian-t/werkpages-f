// ─────────────────────────────────────────────────────────────────────────────
// Career-timeline insight engine
// All insights are deterministic — no AI, everything traceable to review data.
// ─────────────────────────────────────────────────────────────────────────────

export type ConsistencyProfile =
  | "stable_performer"
  | "context_dependent"
  | "volatile_performer"
  | "improver"
  | "decliner";

export type RiskLevel = "low" | "medium" | "high" | "declining" | "increasing";

export interface ConsistencyResult {
  profile: ConsistencyProfile;
  riskLevel: RiskLevel;
  /** 0–100; higher = more consistent / predictable */
  score: number;
  standardDeviation: number;
  headline: string;
  description: string;
  hrInterpretation: string;
}

export interface ReviewForTimeline {
  managerCompany: string;
  managerTitle: string;
  workedFrom?: string | null;
  workedUntil?: string | null;
  overallRating: number;
  ratings?: Record<string, number>;
}

export interface CareerSegment {
  company: string;
  logoUrl?: string;
  role: string;
  startDate: string | null;   // "YYYY-MM"
  endDate: string | null;     // "YYYY-MM" or null if current
  isCurrent: boolean;
  averageRating: number;
  reviewCount: number;
  categoryAverages: Record<string, number>;
  careerHistoryId?: number | null; // set only for ghost segments sourced from career_history table
}

export type TransitionType =
  | "same_company_new_role"
  | "new_company_same_role"
  | "new_company_new_role";

export interface Transition {
  from: CareerSegment;
  to: CareerSegment;
  ratingDelta: number;
  type: TransitionType;
}

export type ConfidenceLevel = "high" | "medium" | "low";
export type TrendType = "upward" | "downward" | "stable" | "mixed";

export interface CareerInsightsResult {
  headline: string;
  supportingSignals: string[];
  possibleInterpretations: string[];
  confidence: ConfidenceLevel;
  confidenceReason: string;
  overallTrend: TrendType;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function popStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── Segment computation ───────────────────────────────────────────────────────

export function computeCareerSegments(reviews: ReviewForTimeline[]): CareerSegment[] {
  const valid = reviews.filter(
    (r) => r.managerCompany?.trim() && r.managerTitle?.trim() && r.overallRating > 0,
  );
  if (valid.length === 0) return [];

  // Group by normalised (company, role) key
  const groups = new Map<string, ReviewForTimeline[]>();
  for (const rev of valid) {
    const key =
      rev.managerCompany.trim().toLowerCase() +
      "|||" +
      rev.managerTitle.trim().toLowerCase();
    const bucket = groups.get(key) ?? [];
    bucket.push(rev);
    groups.set(key, bucket);
  }

  const segments: CareerSegment[] = [];

  for (const groupRevs of groups.values()) {
    const first = groupRevs[0];

    const fromDates = groupRevs
      .map((r) => r.workedFrom)
      .filter((d): d is string => !!d)
      .sort();
    const untilDates = groupRevs
      .map((r) => r.workedUntil)
      .filter((d): d is string => !!d)
      .sort();
    const isCurrent = groupRevs.some((r) => !r.workedUntil);

    const avgRating =
      groupRevs.reduce((s, r) => s + r.overallRating, 0) / groupRevs.length;

    // Category averages
    const catTotals: Record<string, { sum: number; n: number }> = {};
    for (const rev of groupRevs) {
      for (const [cat, val] of Object.entries(rev.ratings ?? {})) {
        if (!catTotals[cat]) catTotals[cat] = { sum: 0, n: 0 };
        catTotals[cat].sum += val;
        catTotals[cat].n++;
      }
    }
    const categoryAverages: Record<string, number> = {};
    for (const [cat, { sum, n }] of Object.entries(catTotals)) {
      categoryAverages[cat] = r1(sum / n);
    }

    segments.push({
      company: first.managerCompany.trim(),
      role: first.managerTitle.trim(),
      startDate: fromDates[0] ?? null,
      endDate: isCurrent ? null : (untilDates[untilDates.length - 1] ?? null),
      isCurrent,
      averageRating: r1(avgRating),
      reviewCount: groupRevs.length,
      categoryAverages,
    });
  }

  // Sort chronologically; undated segments go last
  segments.sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  return segments;
}

// ── Transition computation ────────────────────────────────────────────────────

function classifyTransition(a: CareerSegment, b: CareerSegment): TransitionType {
  const sameCompany = a.company.toLowerCase() === b.company.toLowerCase();
  const sameRole = a.role.toLowerCase() === b.role.toLowerCase();
  if (sameCompany) return "same_company_new_role";
  if (sameRole) return "new_company_same_role";
  return "new_company_new_role";
}

export function computeTransitions(segments: CareerSegment[]): Transition[] {
  return segments.slice(0, -1).map((seg, i) => ({
    from: seg,
    to: segments[i + 1],
    ratingDelta: r1(segments[i + 1].averageRating - seg.averageRating),
    type: classifyTransition(seg, segments[i + 1]),
  }));
}

// ── Insight generation ────────────────────────────────────────────────────────

export function generateCareerInsights(
  segments: CareerSegment[],
): CareerInsightsResult | null {
  if (segments.length < 2) return null;

  const transitions = computeTransitions(segments);
  const ratings = segments.map((s) => s.averageRating);
  const overallDelta = r1(ratings[ratings.length - 1] - ratings[0]);
  const maxR = Math.max(...ratings);
  const minR = Math.min(...ratings);
  const volatility = r1(maxR - minR);
  const totalReviews = segments.reduce((s, seg) => s + seg.reviewCount, 0);
  const minSegReviews = Math.min(...segments.map((s) => s.reviewCount));
  const n = segments.length;

  // ── Overall trend ──────────────────────────────────────────────────────────
  let overallTrend: TrendType;
  if (Math.abs(overallDelta) <= 0.3 && volatility <= 0.5) {
    overallTrend = "stable";
  } else if (overallDelta > 0.3 && volatility <= 1.0) {
    overallTrend = "upward";
  } else if (overallDelta < -0.3 && volatility <= 1.0) {
    overallTrend = "downward";
  } else {
    overallTrend = "mixed";
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence: ConfidenceLevel;
  if (totalReviews >= 10 && n >= 3 && minSegReviews >= 2) {
    confidence = "high";
  } else if (totalReviews >= 4 && n >= 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  let confidenceReason: string;
  if (confidence === "high") {
    confidenceReason = `${totalReviews} reviews across ${n} roles. Strong signal.`;
  } else if (confidence === "medium") {
    confidenceReason = `${totalReviews} review${totalReviews === 1 ? "" : "s"} across ${n} role${n === 1 ? "" : "s"}. More data would increase confidence.`;
  } else {
    confidenceReason = minSegReviews < 2
      ? `One or more roles have only a single review. Treat as a preliminary signal.`
      : `Only ${totalReviews} review${totalReviews === 1 ? "" : "s"} total. Treat as a preliminary signal.`;
  }

  // ── Key transitions ───────────────────────────────────────────────────────
  const worstT = transitions.reduce((a, b) =>
    b.ratingDelta < a.ratingDelta ? b : a,
  );
  const bestT = transitions.reduce((a, b) =>
    b.ratingDelta > a.ratingDelta ? b : a,
  );

  // ── Headline ──────────────────────────────────────────────────────────────
  const firstR = segments[0].averageRating;
  const lastR  = segments[n - 1].averageRating;

  let headline: string;
  if (overallTrend === "stable") {
    headline = n === 2
      ? `Consistent across both roles, ratings within ${volatility.toFixed(1)} stars (${minR} to ${maxR})`
      : `Steady performer across ${n} roles, ratings stayed within ${volatility.toFixed(1)} stars (${minR} to ${maxR})`;
  } else if (overallTrend === "upward") {
    if (n === 2) {
      headline = `Average rating increased by +${Math.abs(overallDelta).toFixed(1)} after moving to ${segments[1].company} (${firstR} → ${lastR})`;
    } else if (bestT.ratingDelta > 1.0) {
      headline = `Upward trend in ratings: ${firstR} → ${lastR} over ${n} roles; strongest gain (+${bestT.ratingDelta.toFixed(1)}) at ${bestT.to.company}`;
    } else {
      headline = `Gradual increase in ratings: ${firstR} → ${lastR} over ${n} roles (+${Math.abs(overallDelta).toFixed(1)} overall)`;
    }
  } else if (overallTrend === "downward") {
    if (n === 2) {
      headline = `Average rating decreased by ${Math.abs(overallDelta).toFixed(1)} after moving to ${segments[1].company} (${firstR} → ${lastR})`;
    } else if (worstT.ratingDelta < -0.75) {
      headline = `Downward trend in ratings: sharpest drop (${worstT.ratingDelta.toFixed(1)}) at ${worstT.to.company}; ${firstR} → ${lastR} overall`;
    } else {
      headline = `Gradual decrease in ratings: ${firstR} → ${lastR} over ${n} roles (${overallDelta.toFixed(1)} overall)`;
    }
  } else {
    // mixed
    const peakSeg   = segments.reduce((a, b) => b.averageRating > a.averageRating ? b : a);
    const troughSeg = segments.reduce((a, b) => b.averageRating < a.averageRating ? b : a);
    if (n === 2) {
      headline = `Average rating varied by ${volatility.toFixed(1)} across both roles (${firstR} → ${lastR})`;
    } else {
      headline = `Mixed ratings: highest at ${peakSeg.averageRating} at ${peakSeg.company}, lowest at ${troughSeg.averageRating} at ${troughSeg.company}`;
    }
  }

  // ── Supporting signals ────────────────────────────────────────────────────
  const signals: string[] = [];

  signals.push(
    volatility < 0.5
      ? `Ratings stayed within a tight ${volatility.toFixed(1)}-star range (${minR}–${maxR})`
      : `Ratings span ${volatility.toFixed(1)} stars across career (${minR} low, ${maxR} high)`,
  );

  if (worstT.ratingDelta < -0.75) {
    signals.push(
      `Largest drop: ${worstT.ratingDelta.toFixed(1)} stars after moving to ${worstT.to.company}`,
    );
  }
  if (bestT.ratingDelta > 0.75) {
    signals.push(
      `Largest gain: +${bestT.ratingDelta.toFixed(1)} stars after moving to ${bestT.to.company}`,
    );
  }

  const internalGain = transitions.find(
    (t) => t.type === "same_company_new_role" && t.ratingDelta > 0.3,
  );
  if (internalGain) {
    signals.push(
      `Rating improved following an internal role change at ${internalGain.from.company}`,
    );
  }

  const sameRoleDrop = transitions.find(
    (t) => t.type === "new_company_same_role" && t.ratingDelta < -0.5,
  );
  if (sameRoleDrop) {
    signals.push(
      `Rating declined when bringing the same role to ${sameRoleDrop.to.company}`,
    );
  }

  if (minSegReviews < 2) {
    signals.push(
      "One or more segments have a single review. Treat those data points with caution.",
    );
  }

  // ── Possible interpretations ──────────────────────────────────────────────
  const interpretations: string[] = [];

  if (worstT.ratingDelta < -0.75) {
    if (worstT.type === "new_company_new_role") {
      interpretations.push(
        `The decline at ${worstT.to.company} involved both a new company and a new role, making the primary cause difficult to isolate`,
      );
    } else if (worstT.type === "new_company_same_role") {
      interpretations.push(
        `The drop after moving to ${worstT.to.company} in the same role type may suggest challenges adapting to a different company environment`,
      );
    } else {
      interpretations.push(
        `The decline after an internal role change at ${worstT.from.company} may reflect a mismatch with the new responsibilities`,
      );
    }
  }

  if (bestT.ratingDelta > 0.75) {
    if (bestT.type === "same_company_new_role") {
      interpretations.push(
        `The improvement after an internal change at ${bestT.from.company} could reflect stronger alignment with the new responsibilities`,
      );
    } else {
      interpretations.push(
        `The rating increase at ${bestT.to.company} may suggest a better fit with that environment or culture`,
      );
    }
  }

  if (overallTrend === "stable") {
    interpretations.push(
      "Consistent performance across different environments may indicate adaptability regardless of context",
    );
  }

  if (volatility > 1.2) {
    interpretations.push(
      "High variability across career stages may suggest that performance is context-dependent",
    );
  }

  return {
    headline,
    supportingSignals: signals.slice(0, 5),
    possibleInterpretations: interpretations.slice(0, 3),
    confidence,
    confidenceReason,
    overallTrend,
  };
}

// ── Consistency score ─────────────────────────────────────────────────────────

export function computeConsistencyScore(
  segments: CareerSegment[],
): ConsistencyResult | null {
  if (segments.length < 2) return null;

  const ratings     = segments.map((s) => s.averageRating);
  const sd          = r1(popStdDev(ratings));
  const overallDelta = r1(ratings[ratings.length - 1] - ratings[0]);

  // Detect monotonic direction (allow ≤0.1 tolerance for near-flat steps)
  const deltas = ratings.slice(1).map((r, i) => r - ratings[i]);
  const allPositive = deltas.every((d) => d >= -0.1);
  const allNegative = deltas.every((d) => d <= 0.1);

  // Classify
  let profile: ConsistencyProfile;
  if (sd < 0.35) {
    profile = "stable_performer";
  } else if (sd >= 0.85) {
    profile = "volatile_performer";
  } else if (overallDelta >= 0.8 && allPositive) {
    profile = "improver";
  } else if (overallDelta <= -0.8 && allNegative) {
    profile = "decliner";
  } else {
    profile = "context_dependent";
  }

  // Score: 0–100 (higher = more consistent). Max meaningful SD on a 5-pt scale ≈ 2.
  const score = Math.round(Math.max(0, Math.min(100, 100 * (1 - sd / 2))));

  const riskLevel: Record<ConsistencyProfile, RiskLevel> = {
    stable_performer:   "low",
    context_dependent:  "medium",
    volatile_performer: "high",
    improver:           "declining",
    decliner:           "increasing",
  };

  const headlines: Record<ConsistencyProfile, string> = {
    stable_performer:   "Low variation in ratings",
    context_dependent:  "Variable by context",
    volatile_performer: "High variation in ratings",
    improver:           "Upward change in ratings",
    decliner:           "Downward change in ratings",
  };

  const descriptions: Record<ConsistencyProfile, string> = {
    stable_performer:   "Reviewer ratings remain tightly clustered across environments and roles, with little variation regardless of context.",
    context_dependent:  "Reviewer ratings vary meaningfully across environments. Some contexts received higher scores, others lower.",
    volatile_performer: "Reviewer ratings have varied considerably across roles and environments, with no consistent pattern.",
    improver:           "Reviewer ratings show a clear upward trajectory over time, improving across each successive role.",
    decliner:           "Reviewer ratings have trended downward across roles over time. This pattern may reflect changes in context, responsibilities, or team fit.",
  };

  const hrInterpretations: Record<ConsistencyProfile, string> = {
    stable_performer:   "Safe hire. Predictable and process-driven. Well-suited for scaling teams or roles where reliability matters more than upside.",
    context_dependent:  "Performance depends on team maturity, company stage, and reporting structure. Great if placed correctly — risky if not.",
    volatile_performer: "Significant variation across contexts makes outcomes difficult to predict. Environment, team fit, and role scope appear to be material factors in performance.",
    improver:           "Strong potential. Coachable and trajectory-focused. Worth betting on — particularly if recent performance is strong.",
    decliner:           "Red flag for senior or expanding roles. May not scale. Possible leadership fatigue or mismatch with increasing complexity.",
  };

  return {
    profile,
    riskLevel:         riskLevel[profile],
    score,
    standardDeviation: sd,
    headline:          headlines[profile],
    description:       descriptions[profile],
    hrInterpretation:  hrInterpretations[profile],
  };
}
