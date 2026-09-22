import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

/** Every canonical URL on this site is absolute and on this origin. */
const ORIGIN = "https://werkpages.com";

/**
 * Werkpages is not meant to be found in search yet. One switch, honoured everywhere.
 *
 * <p>RateMyManagers is the product taking real traffic, and the two sites serve the same
 * managers, companies and reviews out of the same database. If Google indexes Werkpages it does
 * not gain a second site - it gains a duplicate of the first, and the two compete for the same
 * queries. That is a decision to make deliberately, when Werkpages is ready to take over, and not
 * by leaving the door open.
 *
 * <p>The door was open. robots.txt said {@code Allow: /}, every profile self-canonicalised to
 * werkpages.com, and the backend has served {@code /sitemap.xml} the whole time. Nothing was
 * stopping it being indexed - it simply had not been submitted and little links to it yet. That
 * is luck, not a control.
 *
 * <p><b>Why noindex and not {@code Disallow: /}.</b> They are not interchangeable and picking the
 * wrong one backfires. {@code Disallow} stops Google <em>fetching</em> the page - which means it
 * never reads the noindex either, so a URL it learns about from a link elsewhere can still be
 * listed, bare, with no description and no way to remove it. Allowing the crawl and answering
 * with {@code noindex} is what actually keeps the pages out.
 *
 * <p><b>To launch Werkpages in search:</b> set this to {@code false}, delete the matching
 * {@code <meta name="robots">} from {@code index.html}, and restore the {@code Sitemap:} line in
 * {@code public/robots.txt}. All three, or the site stays half-hidden in a way nothing reports.
 */
export const SITE_HIDDEN_FROM_SEARCH = true;

/**
 * The head tags every page needs, decided in one place.
 *
 * <p>Two things were missing across most of the site and both cost crawl budget:
 *
 * <ul>
 *   <li><b>No canonical.</b> Only three pages declared one. Every listing page takes query
 *       parameters - sort, page, filters - and each combination is a separate URL serving
 *       substantially the same content. The canonical here is built from the <em>pathname</em>
 *       only, so {@code /directory?sort=rating&page=3} consolidates onto {@code /directory}.</li>
 *   <li><b>No robots directive on private pages.</b> /admin, /settings, /notifications and the
 *       contribution forms were all indexable. They are thin, useless in results, and in the
 *       admin case not something to advertise.</li>
 * </ul>
 *
 * <p>A page is either indexable and canonical, or it is noindex - never both, which is why
 * `noindex` and the canonical link are mutually exclusive below. A canonical on a noindex page
 * sends two contradictory signals about the same URL.
 */
export function PageMeta({
  title,
  description,
  noindex = false,
  canonicalPath,
}: {
  title?: string;
  description?: string;
  /** Keep this page out of the index. For anything behind a login or without public value. */
  noindex?: boolean;
  /** Overrides the pathname, for a page that should point at a different canonical URL. */
  canonicalPath?: string;
}) {
  const { pathname } = useLocation();
  const path = canonicalPath ?? pathname;

  return (
    <Helmet>
      {title ? <title>{title}</title> : null}
      {description ? <meta name="description" content={description} /> : null}
      {noindex || SITE_HIDDEN_FROM_SEARCH
        ? <meta name="robots" content="noindex,nofollow" />
        : <link rel="canonical" href={`${ORIGIN}${path}`} />}
    </Helmet>
  );
}

/** Shorthand for a page that should never appear in search results. */
export function NoIndex({ title }: { title?: string }) {
  return <PageMeta title={title} noindex />;
}
