/**
 * Interview experience reviews — shared types and pure display logic.
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

export const INTERVIEW_TYPES = ["phone", "video", "onsite", "technical", "panel"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

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

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  phone: "Phone screen",
  video: "Video call",
  onsite: "On-site",
  technical: "Technical",
  panel: "Panel",
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
  roleCategories: Array<{ role: string; count: number }>;
  filteredCount: number;
  filteredOverall?: number | null;
  filteredDifficulty?: number | null;
  filteredMedianRounds?: number | null;
  categoryAverages: Partial<Record<InterviewCategory, number | null>> | null;
  hasContributed: boolean;
  gated: boolean;
  belowThreshold?: boolean;
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
  interviewType?: InterviewType | null;
  rounds?: number | null;
  processLength?: ProcessLength | null;
  roleCategory?: string | null;
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

export function difficultyLabel(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.min(5, Math.max(1, Math.round(value)));
  return DIFFICULTY_LABELS[rounded] ?? null;
}

/** "12 interviews" / "1 interview" — the unit people actually use for this. */
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
 * The server revalidates everything — this is a courtesy to the person filling the form, never
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
    errors.outcome = "Let people know how it ended — it changes how the ratings read.";
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

  if (draft.rounds != null && (draft.rounds < 1 || draft.rounds > 10)) {
    errors.rounds = "Rounds must be between 1 and 10.";
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
  if (draft.rounds != null) payload.rounds = draft.rounds;
  if (draft.interviewType) payload.interviewType = draft.interviewType;
  if (draft.processLength) payload.processLength = draft.processLength;

  const role = draft.roleCategory?.trim();
  if (role) payload.roleCategory = role;

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
