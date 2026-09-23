/**
 * Which profiles are worth putting in Google's index.
 *
 * <p>One definition, used by the manager profile, the company profile and - mirrored in SQL -
 * the sitemap. All three have to agree: a page the sitemap submits while the page itself says
 * `noindex` spends crawl budget to be refused, and a page that is indexable but never submitted
 * has to be found some other way.
 *
 * <h2>Why this is not simply "has a review"</h2>
 *
 * <p>It used to be. Every profile with `reviews_count === 0` was served `noindex` and left out
 * of the sitemap, on the reasoning that a wall of review-less profiles looks to Google like
 * mass-generated near-duplicate filler. That reasoning was sound - it is a real way to damage a
 * whole domain - but the rule drawn from it was the wrong one, for two reasons.
 *
 * <p><b>The pages are not empty.</b> A profile carries the person's name, their job title, their
 * employer, and where they work. That is unique content per page. "No reviews yet" is not the
 * same condition as "nothing on the page", and only the second one is thin.
 *
 * <p><b>The profiles are not mass-generated.</b> Auto-created profiles are filtered hard before
 * they ever exist: a name under two characters creates nothing, a recognised public figure goes
 * to the moderation queue instead, and every account gets exactly <em>one</em> auto-created
 * profile, ever. What survives all that is a specific real person somebody deliberately looked
 * up - not filler.
 *
 * <p>And suppressing them cost the top of the funnel. Somebody googling a manager by name,
 * finding the profile and leaving the first review is how this site grows. A `noindex` on every
 * review-less profile means that search never reaches the page at all.
 *
 * <h2>What is still excluded</h2>
 *
 * <p>A profile with no employer or no job title really is just a name, and there is nothing on
 * it a search result could honestly promise. Those stay out until somebody fills them in.
 */

/** A profile needs an employer and a role before it says anything a reader came for. */
export function isManagerIndexable(manager: {
  title?: string | null;
  company?: string | null;
} | null | undefined): boolean {
  if (!manager) return false;
  return hasText(manager.title) && hasText(manager.company);
}

/**
 * A company page is worth indexing once at least one manager listed on it is.
 *
 * <p>The page's value is the list of people; with nobody on it, it is a heading and an empty
 * state. A manager listed on a company page works at that company by construction, so only the
 * role is checked here - passing the company name back in would be asserting something the data
 * already guarantees.
 */
export function isCompanyIndexable(company: {
  managers?: Array<{ title?: string | null }> | null;
  managerCount?: number | null;
} | null | undefined): boolean {
  if (!company) return false;
  if (company.managers?.length) {
    return company.managers.some((m) => hasText(m.title));
  }
  // Callers that only carry a count cannot inspect roles; a listed manager is the best signal
  // available to them, and the manager's own page still decides for itself.
  return (company.managerCount ?? 0) > 0;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
