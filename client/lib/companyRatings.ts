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
}

export type CompanyRatingErrors = Partial<Record<CompanyCategory | "overallRating" | "workedFrom" | "workedUntil", string>>;

export function emptyCompanyRatingDraft(): CompanyRatingDraft {
  return { overallRating: null, ratings: {}, workedFrom: "", workedUntil: null, stillHere: false };
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

export function isCompanyRatingComplete(draft: CompanyRatingDraft): boolean {
  return Object.keys(validateCompanyRating(draft)).length === 0;
}

export function toCompanyRatingPayload(draft: CompanyRatingDraft) {
  return {
    overallRating: draft.overallRating,
    ratings: draft.ratings,
    workedFrom: draft.workedFrom,
    workedUntil: draft.stillHere ? null : draft.workedUntil,
  };
}
