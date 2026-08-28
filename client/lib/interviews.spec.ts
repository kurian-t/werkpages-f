import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  INTERVIEW_CATEGORIES,
  INTERVIEW_OUTCOMES,
  OUTCOME_FILTERS,
  OUTCOME_LABELS,
  OUTCOME_SHORT_LABELS,
  describeCount,
  difficultyLabel,
  interviewErrorMessage,
  interviewYearOptions,
  isSmallSample,
  offerRate,
  outcomeBucket,
  outcomeGap,
  sortedCategories,
  toInterviewPayload,
  validateInterviewDraft,
  type InterviewDraft,
} from "./interviews";

const CURRENT_YEAR = 2026;

function split(parts: Record<string, { count: number; avgRating: number | null }>) {
  return {
    outcomeSplit: {
      offer: { count: 0, avgRating: null },
      noOffer: { count: 0, avgRating: null },
      withdrew: { count: 0, avgRating: null },
      pending: { count: 0, avgRating: null },
      ...parts,
    },
  };
}

function draft(overrides: Partial<InterviewDraft> = {}): InterviewDraft {
  return {
    overallRating: 4,
    outcome: "offer",
    interviewYear: CURRENT_YEAR,
    ...overrides,
  };
}

describe("outcomeBucket", () => {
  it("maps a snake_case outcome onto its camelCase key in the response", () => {
    const stats = split({ noOffer: { count: 3, avgRating: 2.1 } });
    expect(outcomeBucket(stats, "no_offer")).toEqual({ count: 3, avgRating: 2.1 });
  });

  it("returns an empty bucket rather than undefined for a missing outcome", () => {
    expect(outcomeBucket({ outcomeSplit: {} }, "offer")).toEqual({ count: 0, avgRating: null });
  });

  it("survives a response with no split at all", () => {
    expect(outcomeBucket({ outcomeSplit: undefined as never }, "pending"))
      .toEqual({ count: 0, avgRating: null });
  });
});

describe("offerRate", () => {
  it("is the share of decided processes that ended in an offer", () => {
    expect(offerRate(split({
      offer: { count: 3, avgRating: 4 },
      noOffer: { count: 1, avgRating: 2 },
    }))).toBe(75);
  });

  it("excludes withdrawals and in-flight processes from the denominator", () => {
    // Someone who pulled out was never turned down; counting them as a rejection would
    // understate a company that simply takes a long time to decide.
    expect(offerRate(split({
      offer: { count: 1, avgRating: 4 },
      noOffer: { count: 1, avgRating: 2 },
      withdrew: { count: 8, avgRating: 3 },
      pending: { count: 8, avgRating: 3 },
    }))).toBe(50);
  });

  it("is null when nothing has been decided either way", () => {
    expect(offerRate(split({ pending: { count: 4, avgRating: 3 } }))).toBeNull();
    expect(offerRate(split({}))).toBeNull();
  });

  it("rounds to a whole percentage", () => {
    expect(offerRate(split({
      offer: { count: 1, avgRating: 4 },
      noOffer: { count: 2, avgRating: 2 },
    }))).toBe(33);
  });
});

describe("outcomeGap", () => {
  it("measures how far apart the two sides rate the same process", () => {
    expect(outcomeGap(split({
      offer: { count: 4, avgRating: 4.6 },
      noOffer: { count: 4, avgRating: 3.1 },
    }))).toBe(1.5);
  });

  it("can be negative when rejected candidates rated it higher", () => {
    expect(outcomeGap(split({
      offer: { count: 2, avgRating: 3.0 },
      noOffer: { count: 2, avgRating: 4.0 },
    }))).toBe(-1);
  });

  it("is null unless both sides have something to compare", () => {
    expect(outcomeGap(split({ offer: { count: 2, avgRating: 4 } }))).toBeNull();
    expect(outcomeGap(split({ noOffer: { count: 2, avgRating: 4 } }))).toBeNull();
    expect(outcomeGap(split({}))).toBeNull();
  });

  it("avoids floating point noise in the difference", () => {
    expect(outcomeGap(split({
      offer: { count: 1, avgRating: 4.3 },
      noOffer: { count: 1, avgRating: 4.1 },
    }))).toBe(0.2);
  });
});

describe("sortedCategories", () => {
  it("orders categories best first", () => {
    expect(sortedCategories({
      communication: 3.0,
      respectForTime: 4.5,
      roleClarity: 2.0,
    })).toEqual([
      ["respectForTime", 4.5],
      ["communication", 3.0],
      ["roleClarity", 2.0],
    ]);
  });

  it("drops nulls rather than rendering them as zero", () => {
    // A category nobody rated is absent, not terrible — showing it as 0.0 would be a lie.
    expect(sortedCategories({ communication: 4, roleClarity: null })).toEqual([["communication", 4]]);
  });

  it("returns nothing when averages are withheld", () => {
    expect(sortedCategories(null)).toEqual([]);
  });

  it("ignores NaN", () => {
    expect(sortedCategories({ communication: Number.NaN, roleClarity: 3 })).toEqual([["roleClarity", 3]]);
  });
});

describe("difficultyLabel", () => {
  it("names each level rather than using star language", () => {
    // "5 stars" reads as praise; a hard interview is a fact, not a compliment.
    expect(difficultyLabel(1)).toBe("Very easy");
    expect(difficultyLabel(5)).toBe("Very hard");
  });

  it("rounds an average to the nearest level", () => {
    expect(difficultyLabel(3.4)).toBe("Average");
    expect(difficultyLabel(3.6)).toBe("Hard");
  });

  it("clamps values outside the scale instead of returning nothing", () => {
    expect(difficultyLabel(0.2)).toBe("Very easy");
    expect(difficultyLabel(7)).toBe("Very hard");
  });

  it("is null when there is no difficulty to describe", () => {
    expect(difficultyLabel(null)).toBeNull();
    expect(difficultyLabel(undefined)).toBeNull();
    expect(difficultyLabel(Number.NaN)).toBeNull();
  });
});

describe("describeCount and isSmallSample", () => {
  it("uses the singular for one", () => {
    expect(describeCount(1)).toBe("1 interview");
    expect(describeCount(0)).toBe("0 interviews");
    expect(describeCount(12)).toBe("12 interviews");
  });

  it("flags a handful of self-selected reports as indicative only", () => {
    expect(isSmallSample(1)).toBe(true);
    expect(isSmallSample(9)).toBe(true);
    expect(isSmallSample(10)).toBe(false);
  });

  it("does not caveat an empty company — there is nothing to caveat", () => {
    expect(isSmallSample(0)).toBe(false);
  });
});

describe("interviewYearOptions", () => {
  it("offers this year back through nine more, newest first", () => {
    const years = interviewYearOptions(CURRENT_YEAR);
    expect(years).toHaveLength(10);
    expect(years[0]).toBe(CURRENT_YEAR);
    expect(years[9]).toBe(CURRENT_YEAR - 9);
  });
});

describe("validateInterviewDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateInterviewDraft(draft(), CURRENT_YEAR)).toEqual({});
  });

  it("requires an overall rating", () => {
    expect(validateInterviewDraft(draft({ overallRating: null }), CURRENT_YEAR).overallRating)
      .toBeDefined();
  });

  it("rejects an out-of-range overall rating", () => {
    expect(validateInterviewDraft(draft({ overallRating: 6 }), CURRENT_YEAR).overallRating).toBeDefined();
    expect(validateInterviewDraft(draft({ overallRating: -1 }), CURRENT_YEAR).overallRating).toBeDefined();
  });

  it("requires an outcome, and says why it matters", () => {
    const error = validateInterviewDraft(draft({ outcome: null }), CURRENT_YEAR).outcome;
    expect(error).toBeDefined();
    expect(error).toMatch(/how it ended/i);
  });

  it("rejects a year that has not happened and one too far back", () => {
    expect(validateInterviewDraft(draft({ interviewYear: CURRENT_YEAR + 1 }), CURRENT_YEAR).interviewYear)
      .toBeDefined();
    expect(validateInterviewDraft(draft({ interviewYear: CURRENT_YEAR - 10 }), CURRENT_YEAR).interviewYear)
      .toBeDefined();
    expect(validateInterviewDraft(draft({ interviewYear: null }), CURRENT_YEAR).interviewYear)
      .toBeDefined();
  });

  it("accepts the oldest year still in range", () => {
    expect(validateInterviewDraft(draft({ interviewYear: CURRENT_YEAR - 9 }), CURRENT_YEAR)).toEqual({});
  });

  it("bounds difficulty and rounds", () => {
    expect(validateInterviewDraft(draft({ difficulty: 0 }), CURRENT_YEAR).difficulty).toBeDefined();
    expect(validateInterviewDraft(draft({ difficulty: 6 }), CURRENT_YEAR).difficulty).toBeDefined();
    expect(validateInterviewDraft(draft({ rounds: 0 }), CURRENT_YEAR).rounds).toBeDefined();
    expect(validateInterviewDraft(draft({ rounds: 11 }), CURRENT_YEAR).rounds).toBeDefined();
  });

  it("treats omitted optional fields as valid", () => {
    expect(validateInterviewDraft(
      draft({ difficulty: null, rounds: null, roleCategory: null }), CURRENT_YEAR,
    )).toEqual({});
  });

  it("bounds the role text", () => {
    expect(validateInterviewDraft(draft({ roleCategory: "x".repeat(101) }), CURRENT_YEAR).roleCategory)
      .toBeDefined();
    expect(validateInterviewDraft(draft({ roleCategory: "  Engineering  " }), CURRENT_YEAR)).toEqual({});
  });

  it("bounds every category rating", () => {
    for (const category of INTERVIEW_CATEGORIES) {
      const errors = validateInterviewDraft(draft({ [category]: 9 }), CURRENT_YEAR);
      expect(errors[category]).toBeDefined();
    }
  });
});

describe("toInterviewPayload", () => {
  it("sends only the required fields for a minimal draft", () => {
    expect(toInterviewPayload(draft())).toEqual({
      overallRating: 4,
      outcome: "offer",
      interviewYear: CURRENT_YEAR,
    });
  });

  it("includes optional fields that were filled in", () => {
    const payload = toInterviewPayload(draft({
      communication: 5,
      difficulty: 3,
      rounds: 4,
      interviewType: "video",
      processLength: "2_4_weeks",
      roleCategory: "Engineering",
    }));
    expect(payload).toMatchObject({
      communication: 5,
      difficulty: 3,
      rounds: 4,
      interviewType: "video",
      processLength: "2_4_weeks",
      roleCategory: "Engineering",
    });
  });

  it("omits a cleared role rather than sending an empty string", () => {
    // The server treats blank as absent, but sending it at all is noise on the wire.
    expect(toInterviewPayload(draft({ roleCategory: "   " }))).not.toHaveProperty("roleCategory");
  });

  it("trims the role", () => {
    expect(toInterviewPayload(draft({ roleCategory: "  Design  " }))).toMatchObject({
      roleCategory: "Design",
    });
  });

  it("keeps a zero rating, which is a real score rather than a blank", () => {
    expect(toInterviewPayload(draft({ communication: 0 }))).toMatchObject({ communication: 0 });
  });
});

describe("interviewErrorMessage", () => {
  it("explains the one-per-year rule instead of blaming the user", () => {
    const message = interviewErrorMessage(409, "interview_review_exists_for_year");
    expect(message).toMatch(/already reviewed/i);
    expect(message).toMatch(/different year/i);
  });

  it("explains the daily ceiling", () => {
    expect(interviewErrorMessage(429, "daily_limit_reached")).toMatch(/in a day/i);
  });

  it("covers suspension, signed-out and missing company", () => {
    expect(interviewErrorMessage(403, undefined)).toMatch(/can't post/i);
    expect(interviewErrorMessage(401, undefined)).toMatch(/sign in/i);
    expect(interviewErrorMessage(404, undefined)).toMatch(/couldn't find/i);
  });

  it("falls back to something honest for anything else", () => {
    expect(interviewErrorMessage(500, undefined)).toMatch(/try again/i);
    expect(interviewErrorMessage(undefined, undefined)).toMatch(/try again/i);
  });

  it("recognises the code even when the status is missing", () => {
    expect(interviewErrorMessage(undefined, "daily_limit_reached")).toMatch(/in a day/i);
  });
});

describe("label tables", () => {
  it("labels every outcome in both long and short form", () => {
    for (const outcome of INTERVIEW_OUTCOMES) {
      expect(OUTCOME_LABELS[outcome]).toBeTruthy();
      expect(OUTCOME_SHORT_LABELS[outcome]).toBeTruthy();
    }
  });

  it("labels every rating category", () => {
    for (const category of INTERVIEW_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("labels every difficulty level", () => {
    for (let level = 1; level <= 5; level++) {
      expect(DIFFICULTY_LABELS[level]).toBeTruthy();
    }
  });

  it("offers All alongside the two outcomes that actually diverge", () => {
    expect(OUTCOME_FILTERS.map((f) => f.value)).toEqual([null, "offer", "no_offer"]);
  });
});
