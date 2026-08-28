/**
 * The single definition of "Top rated".
 *
 * This used to be a `const TOP_RATED_THRESHOLD = 4.5` copy-pasted into four files, each with its
 * own copy of the pill markup. Fixing the rule meant finding every copy, and missing one showed
 * the same manager as top rated on one page and not another.
 */

/** A rating at or above this is eligible. */
export const TOP_RATED_THRESHOLD = 4.5;

/**
 * How many reviews it takes before the badge means anything.
 *
 * Without this, one five-star review earns "Top rated" - which is a credibility problem rather
 * than a rounding one, especially on a profile page where the badge is the headline and gets
 * screenshotted. It matches the caution applied elsewhere: interview category averages are hidden
 * below three reports, and small samples carry an explicit warning.
 */
export const TOP_RATED_MIN_REVIEWS = 3;

/**
 * Whether something qualifies for the badge.
 *
 * Deliberately absolute rather than relative to the page you are on. "Top rated within this
 * industry" sounds smarter but means the same manager carries the badge on one page and loses it
 * on another, which reads as a bug rather than as nuance.
 *
 * Missing or unparseable input fails closed - an unknown review count is not evidence of quality.
 */
export function isTopRated(
  rating: number | string | null | undefined,
  reviewCount: number | string | null | undefined,
): boolean {
  const value = toNumber(rating);
  const reviews = toNumber(reviewCount);
  if (value == null || reviews == null) return false;
  return value >= TOP_RATED_THRESHOLD && reviews >= TOP_RATED_MIN_REVIEWS;
}

function toNumber(input: number | string | null | undefined): number | null {
  if (input == null || input === "") return null;
  const value = typeof input === "number" ? input : Number(input);
  return Number.isFinite(value) ? value : null;
}
