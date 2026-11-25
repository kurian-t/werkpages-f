/**
 * Rating a company as a workplace.
 *
 * The ten below are deliberately things one manager does not control. Anything a manager decides
 * belongs in the manager rating instead - "role clarity" was considered and dropped for exactly
 * that reason, being all but identical to the manager category "clarity of expectations". Two
 * numbers measuring one thing is worse than one number.
 */

export const COMPANY_CATEGORIES = [
  "work_life_balance",
  "compensation_benefits",
  "career_growth",
  "job_security",
  "workload_sustainability",
  "senior_leadership",
  "company_communication",
  "flexibility",
  "inclusion_belonging",
  "tools_resources",
] as const;

export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number];

export const COMPANY_CATEGORY_LABELS: Record<CompanyCategory, string> = {
  work_life_balance:       "Work–life balance",
  compensation_benefits:   "Compensation & benefits",
  career_growth:           "Career growth",
  job_security:            "Job security",
  workload_sustainability: "Workload sustainability",
  senior_leadership:       "Senior leadership",
  company_communication:   "Company communication",
  flexibility:             "Flexibility",
  inclusion_belonging:     "Inclusion & belonging",
  tools_resources:         "Tools & resources",
};

/** One line under each label, so people rate the same thing as each other. */
export const COMPANY_CATEGORY_HINTS: Record<CompanyCategory, string> = {
  work_life_balance:       "Whether the job left room for a life outside it.",
  compensation_benefits:   "Pay and benefits for the work you did.",
  career_growth:           "Whether there was somewhere to go from here.",
  job_security:            "How stable the job felt.",
  workload_sustainability: "Whether the workload was survivable long term.",
  senior_leadership:       "The people above your manager, and their direction.",
  company_communication:   "How well the company explained decisions and changes.",
  flexibility:             "Hours, remote work, and how much say you had.",
  inclusion_belonging:     "Whether people were treated fairly and felt they belonged.",
  tools_resources:         "Whether you had what you needed to do the job.",
};

export interface CompanyRatingDraft {
  overallRating: number | null;
  ratings: Partial<Record<CompanyCategory, number>>;
  workedFrom: string;
  workedUntil: string | null;
  stillHere: boolean;
  /** Withhold the period from everyone, the author included. See HideDatesField. */
  datesHidden: boolean;
}

/*
  "location" is in this union although validateCompanyRating never sets it.

  The location is held outside the draft - it is resolved server-side against the company's places,
  not scored like a category - so the draft validator genuinely cannot see it. The form fills this
  key in itself. Keeping it here means one error surface rather than a second parallel one, which is
  how the field ended up displaying a required asterisk that nothing enforced.
*/
export type CompanyRatingErrors = Partial<Record<CompanyCategory | "overallRating" | "workedFrom" | "workedUntil" | "location", string>>;

export function emptyCompanyRatingDraft(): CompanyRatingDraft {
  return { overallRating: null, ratings: {}, workedFrom: "", workedUntil: null,
           stillHere: false, datesHidden: false };
}

/**
 * Every category is required, and so is the overall.
 *
 * No N/A. A corpus where half the ratings skipped career growth cannot be sliced by career growth
 * - the same trade the interview form already makes, and for the same reason.
 */
export function validateCompanyRating(draft: CompanyRatingDraft): CompanyRatingErrors {
  const errors: CompanyRatingErrors = {};

  if (draft.overallRating == null) {
    errors.overallRating = "Give the workplace an overall rating.";
  }
  for (const category of COMPANY_CATEGORIES) {
    if (draft.ratings[category] == null) {
      errors[category] = "Required.";
    }
  }

  if (!draft.workedFrom) {
    errors.workedFrom = "When did you start?";
  }
  if (!draft.stillHere && !draft.workedUntil) {
    errors.workedUntil = "When did you leave?";
  }
  if (draft.workedFrom && draft.workedUntil && draft.workedUntil < draft.workedFrom) {
    errors.workedUntil = "This is before your start date.";
  }

  return errors;
}

/** The three steps the workplace form walks through, in order. */
export type CompanyRatingStep = "details" | "dates" | "ratings";

/**
 * Whether a step has been answered well enough to leave it.
 *
 * Separate from validateCompanyRating, which asks "is the whole thing submittable". The Next
 * button needs the question per step, the way AddBoss asks it with its own nextDisabled and
 * AddInterview asks it through isStepComplete. This form had neither, so Next stayed solid while
 * "Where did you work?" read "No location set" and the period was empty: the click was correctly
 * refused and the errors appeared, but a button that looks usable and does nothing reads as a
 * broken page.
 *
 * The location is PASSED IN rather than read from the draft. It is resolved server-side against
 * the company's places and deliberately lives outside the draft, which is how its required
 * asterisk went months with nothing enforcing it.
 */
export function isCompanyStepComplete(
  draft: CompanyRatingDraft,
  step: CompanyRatingStep,
  context: { locationSet: boolean },
): boolean {
  if (step === "details") {
    // The company is prefilled from the page this opened on and the field enforces its own
    // choice, so there is no unanswered mandatory question to hold anybody on this step.
    return true;
  }
  if (step === "dates") {
    return context.locationSet
      && draft.workedFrom.trim().length > 0
      && (draft.stillHere || (draft.workedUntil ?? "").trim().length > 0);
  }
  return draft.overallRating != null
    && COMPANY_CATEGORIES.every((category) => draft.ratings[category] != null);
}

export function isCompanyRatingComplete(draft: CompanyRatingDraft): boolean {
  return Object.keys(validateCompanyRating(draft)).length === 0;
}

export function toCompanyRatingPayload(draft: CompanyRatingDraft) {
  return {
    overallRating: draft.overallRating,
    ratings: draft.ratings,
    workedFrom: draft.workedFrom,
    workedUntil: draft.stillHere ? null : draft.workedUntil,
    // Both the real submit and the drop-off capture go through here, so a draft keeps the choice
    // somebody made before they were bounced to sign in.
    datesHidden: draft.datesHidden,
  };
}
