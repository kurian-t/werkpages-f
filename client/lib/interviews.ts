/**
 * Interview experience reviews - shared types and pure display logic.
 *
 * Everything here is deliberately free of React and network calls so the rules that shape what a
 * reader sees can be tested directly. Two of those rules carry most of the weight:
 *
 * - **Outcome is never averaged away.** Candidates who were rejected rate a process markedly lower
 *   than those who were hired. A single blended number mostly measures who was most annoyed, so
 *   the panel always offers the split and labels which slice is on screen.
 * - **Difficulty is not quality.** A hard interview is not a bad interview. Difficulty is shown
 *   with its own vocabulary and never enters a rating, a ranking, or a "strongest areas" list.
 */

export const INTERVIEW_OUTCOMES = ["offer", "no_offer", "withdrew", "pending"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

/**
 * Formats a single round can take. A process is an ordered list of these - "phone screen, then a
 * panel, then a VP conversation" - which a single format field could never express.
 */
export const ROUND_TYPES = [
  "recruiter_screen", "phone", "video", "hiring_manager",
  "technical", "take_home", "pair_programming", "case_study",
  "panel", "onsite", "executive",
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const MAX_ROUNDS = 10;

export const PROCESS_LENGTHS = ["under_1_week", "1_2_weeks", "2_4_weeks", "over_1_month"] as const;
export type ProcessLength = (typeof PROCESS_LENGTHS)[number];

/** Rating categories, in the order the form and the breakdown render them. */
export const INTERVIEW_CATEGORIES = [
  "communication",
  "respectForTime",
  "roleClarity",
  "processFairness",
  "nextStepTransparency",
] as const;
export type InterviewCategory = (typeof INTERVIEW_CATEGORIES)[number];

export const OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  offer: "Received an offer",
  no_offer: "No offer",
  withdrew: "Withdrew",
  pending: "Still in process",
};

/** Short forms for pills and filter buttons, where the long label does not fit. */
export const OUTCOME_SHORT_LABELS: Record<InterviewOutcome, string> = {
  offer: "Offer",
  no_offer: "No offer",
  withdrew: "Withdrew",
  pending: "Pending",
};

export const CATEGORY_LABELS: Record<InterviewCategory, string> = {
  communication: "Communication",
  respectForTime: "Respect for your time",
  roleClarity: "Clarity about the role",
  processFairness: "Fairness of the process",
  nextStepTransparency: "Transparency about next steps",
};

export const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  recruiter_screen: "Recruiter screen",
  phone: "Phone interview",
  video: "Video interview",
  hiring_manager: "Hiring manager",
  technical: "Technical interview",
  take_home: "Take-home exercise",
  pair_programming: "Pair programming",
  case_study: "Case study",
  panel: "Panel interview",
  onsite: "On-site",
  executive: "Executive",
};

export const PROCESS_LENGTH_LABELS: Record<ProcessLength, string> = {
  under_1_week: "Under a week",
  "1_2_weeks": "1–2 weeks",
  "2_4_weeks": "2–4 weeks",
  over_1_month: "Over a month",
};

/**
 * Difficulty gets its own vocabulary rather than star language. "5 stars" reads as praise;
 * "Very hard" reads as a fact, which is what this field actually is.
 */
export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Very easy",
  2: "Easy",
  3: "Average",
  4: "Hard",
  5: "Very hard",
};

/** The filter row above the breakdown. `null` means every outcome combined. */
export const OUTCOME_FILTERS: ReadonlyArray<{ value: InterviewOutcome | null; label: string }> = [
  { value: null, label: "All" },
  { value: "offer", label: "Offer" },
  { value: "no_offer", label: "No offer" },
];

/** One population's ratings. A series nobody falls into still appears, with null averages. */
export interface CategorySeries {
  count: number;
  overallRating: number | null;
  communication: number | null;
  respectForTime: number | null;
  roleClarity: number | null;
  processFairness: number | null;
  nextStepTransparency: number | null;
}

export interface CategoryComparison {
  overall: CategorySeries;
  offer: CategorySeries;
  noOffer: CategorySeries;
}

/** The three series, in the order the chart stacks them. */
export const COMPARISON_SERIES = [
  // One family, not a traffic light. "No offer" is a cool slate rather than a red: a rejection is
  // a different population, not a bad score, and colouring it as a warning would editorialise the
  // very comparison the chart exists to present neutrally.
  { key: "overall", label: "Overall",   color: "#67458F" },
  { key: "offer",   label: "Got offer", color: "#8C73B2" },
  { key: "noOffer", label: "No offer",  color: "#7F8798" },
] as const;

/** Shared bar track. Soft enough that the filled portion carries the reading. */
export const COMPARISON_TRACK_COLOR = "#E8E9ED";
export type ComparisonSeriesKey = (typeof COMPARISON_SERIES)[number]["key"];

export interface OutcomeBucket {
  count: number;
  avgRating: number | null;
}

export interface CompanyInterviewStats {
  reviewCount: number;
  avgRating: number | null;
  avgDifficulty: number | null;
  medianRounds: number | null;
  outcomeSplit: Record<string, OutcomeBucket>;
  roleCategories?: Array<{ role: string; count: number }>;
  typicalRounds?: Array<{ round: number; type: RoundType; reportedBy: number }>;
  /** The role and country the comparison was narrowed to, or null for all. */
  role?: string | null;
  country?: string | null;
  countries?: Array<{ country: string; count: number }>;
  /** The caller's own review here, if signed in and they have one. */
  myInterview?: InterviewReview | null;
  categoryComparison: CategoryComparison | null;
  categoryAverages: Partial<Record<InterviewCategory, number | null>> | null;
  hasContributed: boolean;
  gated: boolean;
  belowThreshold?: boolean;
}

/** A stored review, as the API echoes it back. */
export interface InterviewReview {
  id: string;
  overallRating: number | null;
  communication: number | null;
  respectForTime: number | null;
  roleClarity: number | null;
  processFairness: number | null;
  nextStepTransparency: number | null;
  difficulty: number | null;
  outcome: InterviewOutcome;
  rounds: number | null;
  processLength: ProcessLength | null;
  roleCategory: string | null;
  country: string | null;
  city: string | null;
  interviewYear: number;
}

export interface InterviewDraft {
  overallRating: number | null;
  communication?: number | null;
  respectForTime?: number | null;
  roleClarity?: number | null;
  processFairness?: number | null;
  nextStepTransparency?: number | null;
  difficulty?: number | null;
  outcome: InterviewOutcome | null;
  rounds: RoundType[];
  processLength?: ProcessLength | null;
  roleCategory?: string | null;
  /** Country of the POSITION, not where the candidate lives. */
  country?: string | null;
  /** Inferred alongside the country, never asked for. Cleared if the country is changed. */
  city?: string | null;
  interviewYear: number | null;
}

// ── Display helpers ─────────────────────────────────────────────────────────

/** Bucket for one outcome, tolerating a response that predates the always-present split. */
export function outcomeBucket(
  stats: Pick<CompanyInterviewStats, "outcomeSplit">,
  outcome: InterviewOutcome,
): OutcomeBucket {
  return stats.outcomeSplit?.[toCamel(outcome)] ?? { count: 0, avgRating: null };
}

/**
 * Share of reported processes that ended in an offer, 0–100.
 *
 * Deliberately excludes withdrawals and in-flight processes from the denominator: someone who
 * pulled out was never turned down, and counting them as a rejection would understate a company
 * that simply takes a long time.
 */
export function offerRate(stats: Pick<CompanyInterviewStats, "outcomeSplit">): number | null {
  const offers = outcomeBucket(stats, "offer").count;
  const rejections = outcomeBucket(stats, "no_offer").count;
  const decided = offers + rejections;
  if (decided === 0) return null;
  return Math.round((offers / decided) * 100);
}

/**
 * The gap between what people who got an offer said and what people who were rejected said.
 *
 * This is the number that justifies collecting outcome at all. A large positive gap means the
 * experience diverges sharply by result, which is exactly what a candidate reading the page wants
 * warning about. Returns null unless both sides have data to compare.
 */
export function outcomeGap(stats: Pick<CompanyInterviewStats, "outcomeSplit">): number | null {
  const offer = outcomeBucket(stats, "offer").avgRating;
  const noOffer = outcomeBucket(stats, "no_offer").avgRating;
  if (offer == null || noOffer == null) return null;
  return Math.round((offer - noOffer) * 10) / 10;
}

/** Category averages as sorted entries, best first. Nulls are dropped, not rendered as zero. */
export function sortedCategories(
  averages: CompanyInterviewStats["categoryAverages"],
): Array<[InterviewCategory, number]> {
  if (!averages) return [];
  return INTERVIEW_CATEGORIES.flatMap((key) => {
    const value = averages[key];
    return typeof value === "number" && !Number.isNaN(value)
      ? ([[key, value]] as Array<[InterviewCategory, number]>)
      : [];
  }).sort((a, b) => b[1] - a[1]);
}

/**
 * Splits category averages into strongest and weakest, the way the Working tab does.
 *
 * <p>With five categories a 3/3 split would repeat the middle one in both columns, which reads as
 * a mistake. Halving keeps the two columns disjoint.
 */
export function strongestAndWeakest(
  averages: CompanyInterviewStats["categoryAverages"],
): { strongest: Array<[InterviewCategory, number]>; weakest: Array<[InterviewCategory, number]> } {
  const sorted = sortedCategories(averages);
  if (sorted.length < 2) return { strongest: sorted, weakest: [] };
  const take = Math.min(3, Math.floor(sorted.length / 2));
  return { strongest: sorted.slice(0, take), weakest: sorted.slice(-take).reverse() };
}

/**
 * How much weight the numbers can bear, in the reader's terms.
 *
 * <p>Self-selected reviews in single digits move a lot with each new one. Saying so is more use
 * than a decimal place that implies precision the sample cannot support.
 */
/**
 * The category where the two outcomes disagree most.
 *
 * <p>The single most useful line the comparison can produce: it names the part of the process
 * that people experience completely differently depending on how it ended, which is usually where
 * a company's real problem is. Null unless both series have something to compare.
 */
export function biggestOutcomeGap(
  comparison: CategoryComparison | null,
): { category: InterviewCategory; gap: number } | null {
  if (!comparison) return null;

  let best: { category: InterviewCategory; gap: number } | null = null;
  for (const category of INTERVIEW_CATEGORIES) {
    const offer = comparison.offer[category];
    const noOffer = comparison.noOffer[category];
    if (offer == null || noOffer == null) continue;
    const gap = Math.round((offer - noOffer) * 10) / 10;
    if (best == null || Math.abs(gap) > Math.abs(best.gap)) best = { category, gap };
  }
  return best != null && best.gap !== 0 ? best : null;
}

export function confidenceLabel(count: number): "low" | "moderate" | "high" {
  if (count < 10) return "low";
  if (count < 30) return "moderate";
  return "high";
}

export function difficultyLabel(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.min(5, Math.max(1, Math.round(value)));
  return DIFFICULTY_LABELS[rounded] ?? null;
}

/** "12 interviews" / "1 interview" - the unit people actually use for this. */
export function describeCount(count: number): string {
  return `${count} ${count === 1 ? "interview" : "interviews"}`;
}

/**
 * Whether the numbers on screen deserve a small-sample caveat. Averages over a handful of
 * self-selected reports are indicative at best, and saying so is more useful than a false decimal.
 */
export function isSmallSample(count: number): boolean {
  return count > 0 && count < 10;
}

/** Years offered in the form: this year back through nine prior ones, newest first. */
export function interviewYearOptions(currentYear: number): number[] {
  return Array.from({ length: 10 }, (_, i) => currentYear - i);
}

// ── Validation ──────────────────────────────────────────────────────────────

export type InterviewDraftErrors = Partial<Record<keyof InterviewDraft, string>>;

/**
 * Client-side mirror of the server's rules, so a mistake is caught before the round trip.
 *
 * The server revalidates everything - this is a courtesy to the person filling the form, never
 * the enforcement point.
 */
export function validateInterviewDraft(
  draft: InterviewDraft,
  currentYear: number,
): InterviewDraftErrors {
  const errors: InterviewDraftErrors = {};

  if (draft.overallRating == null) {
    errors.overallRating = "Give the experience an overall rating.";
  } else if (draft.overallRating < 0 || draft.overallRating > 5) {
    errors.overallRating = "Rating must be between 0 and 5.";
  }

  if (!draft.outcome) {
    errors.outcome = "Let people know how it ended - it changes how the ratings read.";
  }

  if (draft.interviewYear == null) {
    errors.interviewYear = "Which year was this?";
  } else if (draft.interviewYear > currentYear) {
    errors.interviewYear = "That year hasn't happened yet.";
  } else if (draft.interviewYear < currentYear - 9) {
    errors.interviewYear = "Only the last 10 years can be added.";
  }

  if (draft.difficulty != null && (draft.difficulty < 1 || draft.difficulty > 5)) {
    errors.difficulty = "Difficulty runs from 1 to 5.";
  }

  if (draft.rounds.length > MAX_ROUNDS) {
    errors.rounds = `A process can have at most ${MAX_ROUNDS} rounds.`;
  }

  if (draft.roleCategory != null && draft.roleCategory.trim().length > 100) {
    errors.roleCategory = "Keep the role under 100 characters.";
  }

  for (const category of INTERVIEW_CATEGORIES) {
    const value = draft[category];
    if (value != null && (value < 0 || value > 5)) {
      errors[category] = "Rating must be between 0 and 5.";
    }
  }

  return errors;
}

/**
 * Whether every field on a step has been answered.
 *
 * <p>The form gates Next and Share on this rather than only on what the server strictly requires.
 * It costs the contributor more effort, and it buys comparability: a corpus where most reviews
 * skipped difficulty and half the categories cannot be sliced usefully, which is the whole point
 * of collecting it. Partial submissions are still valid to the API - this is a rule about what
 * the form asks for, not about what the data model permits.
 */
export function isStepComplete(draft: InterviewDraft, step: "process" | "ratings"): boolean {
  if (step === "process") {
    return (
      draft.outcome != null &&
      draft.interviewYear != null &&
      draft.difficulty != null &&
      draft.processLength != null &&
      (draft.country ?? "").trim().length > 0 &&
      // Rounds are deliberately not required. Someone recalling a process from last year may
      // genuinely not remember its shape, and forcing a guess would put invented structure into
      // the one field where ordering is the whole value.
      (draft.roleCategory ?? "").trim().length > 0
    );
  }
  return (
    draft.overallRating != null &&
    INTERVIEW_CATEGORIES.every((category) => draft[category] != null)
  );
}

/** Strips blanks so optional fields arrive absent rather than as empty strings or NaN. */
export function toInterviewPayload(draft: InterviewDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    overallRating: draft.overallRating,
    outcome: draft.outcome,
    interviewYear: draft.interviewYear,
  };

  for (const category of INTERVIEW_CATEGORIES) {
    const value = draft[category];
    if (value != null) payload[category] = value;
  }

  if (draft.difficulty != null) payload.difficulty = draft.difficulty;
  if (draft.rounds.length > 0) payload.rounds = draft.rounds;
  if (draft.processLength) payload.processLength = draft.processLength;

  const role = draft.roleCategory?.trim();
  if (role) payload.roleCategory = role;

  const country = draft.country?.trim();
  if (country) payload.country = country;

  const city = draft.city?.trim();
  if (city) payload.city = city;

  return payload;
}

/**
 * Turns a failed submission into something worth reading.
 *
 * The two interesting cases are the one-per-year conflict and the daily ceiling; both are
 * deliberate rules rather than faults, so they get an explanation instead of "something went
 * wrong".
 */
export function interviewErrorMessage(status: number | undefined, code: string | undefined): string {
  if (status === 409 || code === "interview_review_exists_for_year") {
    return "You've already reviewed an interview at this company for that year. Pick a different year, or delete the earlier one.";
  }
  if (status === 429 || code === "daily_limit_reached") {
    return "You've added the most interviews we allow in a day. Try again tomorrow.";
  }
  if (status === 403 || code === "account_suspended") {
    return "Your account can't post reviews right now.";
  }
  if (status === 401) {
    return "Sign in to add an interview review.";
  }
  if (status === 404) {
    return "We couldn't find this company.";
  }
  return "We couldn't save that. Please try again.";
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
