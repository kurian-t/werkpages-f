import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { SITE_HIDDEN_FROM_SEARCH } from "./PageMeta";

const ORIGIN = "https://werkpages.com";

/**
 * Routes that must never be indexed: behind a login, mid-flow, or of no use in a result page.
 *
 * <p>All of these were indexable. /admin and /settings are not things to advertise, and the
 * contribution forms are half-states that Google reports as thin or soft 404s.
 */
const NOINDEX_PREFIXES = [
  "/admin",
  "/settings",
  "/notifications",
  "/auth",
  "/signin",
  "/signup",
  "/add",              // /add and /add-interview
  "/resume",
];

/** Routes ending in one of these are a form, not a page worth ranking. */
const NOINDEX_SUFFIXES = ["/rate", "/add-interview", "/confirm"];

/**
 * Routes that declare their own head tags, and must not be given a second canonical here.
 *
 * <p>react-helmet-async does not merge two canonical links into one - it renders both, and two
 * canonicals is worse than none, because Google discards the pair and picks for itself. The
 * manager and company profiles set theirs from the row they loaded (and switch to noindex when
 * the profile is thin), which this component cannot know.
 */
const SELF_MANAGED = [
  /^\/manager\//,
  /\/managers\//,
  /^\/companies\/[^/]+$/,
  /^\/industries\/[^/]+\/companies\//,
  /^\/what-is-werkpages$/,
];

function classify(pathname: string): "noindex" | "self" | "canonical" {
  // While the site is hidden, nothing is self-managed and nothing is canonical - every route
  // gives the same answer, so no page can quietly opt itself back in. See SITE_HIDDEN_FROM_SEARCH.
  if (SITE_HIDDEN_FROM_SEARCH) return "noindex";
  if (SELF_MANAGED.some((r) => r.test(pathname))) return "self";
  if (NOINDEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "noindex";
  if (NOINDEX_SUFFIXES.some((sfx) => pathname.endsWith(sfx))) return "noindex";
  return "canonical";
}

/**
 * The head tags for every route that does not set its own, decided in one place.
 *
 * <p>Two gaps this closes, both visible in Search Console:
 *
 * <ul>
 *   <li><b>No canonical on listing pages.</b> Every listing takes query parameters - sort, page,
 *       filters - and each combination was a separate indexable URL for substantially the same
 *       content. The canonical here is built from the <em>pathname only</em>, so
 *       {@code /directory?sort=rating&page=3} consolidates onto {@code /directory}.</li>
 *   <li><b>No robots directive on private routes.</b> /admin, /settings, /notifications and the
 *       contribution forms were all crawlable.</li>
 * </ul>
 *
 * <p>Mounted once, inside the router. Adding a route needs no change here unless it should be
 * hidden, which is the point: the default is correct.
 */
export function RouteMeta() {
  const { pathname } = useLocation();
  const kind = classify(pathname);

  if (kind === "self") return null;

  return (
    <Helmet>
      {kind === "noindex"
        ? <meta name="robots" content="noindex,nofollow" />
        : <link rel="canonical" href={`${ORIGIN}${pathname}`} />}
    </Helmet>
  );
}

export { classify as __classifyForTest };
