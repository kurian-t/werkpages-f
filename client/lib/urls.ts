/**
 * Canonical URL shapes for company and manager pages.
 *
 *   /industries/:industrySlug/companies/:companySlug
 *   /industries/:industrySlug/companies/:companySlug/managers/:managerSlug
 *
 * The industry segment is descriptive, not identifying: a company's industry can change when
 * the classifier reruns or an admin corrects it, and every route resolves on the company and
 * manager slugs alone. A stale or wrong industry segment therefore still finds the page — the
 * profile pages redirect to the canonical path once the real industry is known.
 *
 * Older shapes (/companies/:c, /companies/:c/managers/:m, /manager/:id) remain routable and
 * redirect here, so existing links and Google's index keep working.
 */

/** Industry slug used when a company has not been classified yet. Matches IndustryTaxonomy. */
export const UNCLASSIFIED_INDUSTRY_SLUG = "other";

function industrySegment(industrySlug?: string | null) {
  const trimmed = (industrySlug ?? "").trim();
  return trimmed || UNCLASSIFIED_INDUSTRY_SLUG;
}

/** Canonical path for a company profile. */
export function companyPath(industrySlug: string | null | undefined, companySlug: string) {
  return `/industries/${industrySegment(industrySlug)}/companies/${companySlug}`;
}

/** Canonical path for a manager profile. */
export function managerPath(
  industrySlug: string | null | undefined,
  companySlug: string,
  managerSlug: string,
) {
  return `${companyPath(industrySlug, companySlug)}/managers/${managerSlug}`;
}

/**
 * Company path when only the name is known (no slug yet) — the legacy lookup-by-name route.
 * Kept un-nested because the industry cannot be known without resolving the company first.
 */
export function companyPathByName(name: string) {
  return `/companies/${encodeURIComponent(name)}`;
}
