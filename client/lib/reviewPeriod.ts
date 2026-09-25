/**
 * The one place a rating's working period becomes text.
 *
 * Three surfaces had their own copy of this - the profile's rating list, the "your ratings" strip
 * on the profile, and Account Settings - so a fix ever only landed on one of them at a time.
 *
 * `effectiveWorkedUntil` is `workedUntil` capped at the date the MANAGER left that role, per the
 * career history. The raw `workedUntil` belongs to the REVIEWER, who may still be at a company
 * the manager has since left - which is why a departed manager's card read "... - Present".
 *
 * Display uses the capped value. Edit forms and overlap checks keep reading the raw `workedUntil`:
 * writing the capped value back would silently rewrite the reviewer's own answer.
 */
export interface ReviewPeriod {
  workedFrom?: string | null;
  workedUntil?: string | null;
  effectiveWorkedUntil?: string | null;
}

/** The end date to SHOW. Falls back to the raw date when the API has not sent a capped one. */
export function reviewEndDate(review: ReviewPeriod): string | null {
  return review.effectiveWorkedUntil ?? review.workedUntil ?? null;
}

function monthYear(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * "Mar 2019 – Aug 2024", or "Mar 2019 – Present" while the role is open.
 *
 * `emptyStart` and `openLabel` exist because the three callers word those two cases differently
 * and that wording is deliberate - Account Settings says "Current", the profile says "Present".
 */
export function formatReviewPeriod(
  review: ReviewPeriod,
  opts: { emptyStart?: string; openLabel?: string } = {},
): string {
  const { emptyStart = "", openLabel = "Present" } = opts;
  const end = reviewEndDate(review);
  const start = review.workedFrom ? monthYear(review.workedFrom) : emptyStart;
  const endText = end ? monthYear(end) : review.workedFrom ? openLabel : "";
  return `${start} – ${endText}`;
}
