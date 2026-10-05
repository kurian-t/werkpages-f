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
  /**
   * The author asked for the period not to be published.
   *
   * Honoured on EVERY surface, including the author's own. The first version of this masked the
   * dates for other people and left the author seeing theirs, which meant the one person who
   * needed to know whether the setting had worked was the only one who could not tell: their
   * review looked exactly as it had before. Showing them what everybody else sees is the whole
   * point of the control.
   *
   * The dates are still delivered to the author by the API - the edit form opens with them, and
   * the overlap check reads them - so this is a display rule, not an absence of data.
   */
  datesHidden?: boolean | null;
  /**
   * When the reviewer last stood behind this answer.
   *
   * Only consulted for an open-ended period. "Present" is the one value on a card that changes
   * meaning while nobody touches it, and it only ever changes in the direction of claiming more:
   * somebody who wrote "Jan 2024 - Present" in March attested to fourteen months, and a year
   * later the same card asserts twenty-six. Nothing confirmed the extra twelve.
   */
  updatedAt?: string | null;
}

/**
 * The end date to SHOW. Falls back to the raw date when the API has not sent a capped one.
 *
 * Null when the author withheld the period, so nothing derived from it - a "still there" badge,
 * a tenure figure - can reintroduce what the control was asked to hide.
 */
export function reviewEndDate(review: ReviewPeriod): string | null {
  if (review.datesHidden) return null;
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
/**
 * " · as of Mar 2024", or "" when saying so would add nothing.
 *
 * Bounds an open-ended claim with a fact instead of inventing one. Capping "Present" to the
 * month it was attested would read as "the relationship ENDED in March", which the reviewer
 * never said and which is probably untrue - a different false statement, and a worse one for
 * somebody who still works there. This states what was attested and when, and lets a reader
 * discount a two-year-old "as of" themselves.
 *
 * Suppressed inside the attestation month: while it is still March, "as of Mar" tells a reader
 * nothing they do not already assume, and every fresh card would carry noise.
 */
function asOfSuffix(attested: string | null | undefined, label: string, now: Date): string {
  if (!attested) return "";
  const at = new Date(attested);
  if (Number.isNaN(at.getTime())) return "";
  if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) return "";
  const when = at.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return ` · ${label} ${when}`;
}

export function formatReviewPeriod(
  review: ReviewPeriod,
  opts: {
    emptyStart?: string;
    openLabel?: string;
    hiddenLabel?: string;
    asOfLabel?: string;
    /** Injectable so the suppression rule is testable without waiting for a month to pass. */
    now?: Date;
  } = {},
): string {
  const {
    emptyStart = "", openLabel = "Present", hiddenLabel = "Dates hidden",
    asOfLabel = "as of", now = new Date(),
  } = opts;
  /*
    Said in words rather than left blank. A blank reads as missing data - "they never filled it
    in" - where the author needs to see that a choice they made is in force, and is the same
    thing every other reader sees.
  */
  if (review.datesHidden) return hiddenLabel;
  const end = reviewEndDate(review);
  const start = review.workedFrom ? monthYear(review.workedFrom) : emptyStart;
  /*
    Only an open end is aged. When the manager's departure has already capped this, the card
    shows a real end date and there is nothing stale to qualify - the two rules compose rather
    than compete.
  */
  const isOpen = !end && !!review.workedFrom;
  const endText = end ? monthYear(end) : isOpen ? openLabel : "";
  const asOf = isOpen ? asOfSuffix(review.updatedAt, asOfLabel, now) : "";
  return `${start} – ${endText}${asOf}`;
}
