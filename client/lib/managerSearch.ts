import axios from "axios";
import API_BASE from "@/lib/api";
import { fetchGeo } from "@/lib/geo";
import { validateManagerName } from "@/lib/managerName";

/**
 * Searching for a manager, owned in one place.
 *
 * Three surfaces let somebody look for a manager by name: /find, the directory, and a company
 * page. They are the same act with three different form layouts around it, and until now they were
 * three independent implementations of it. They had already drifted — only /find recorded a partial
 * search for the admin queue, and only /find refused an obvious placeholder name, which meant the
 * other two could write junk ghosts the first one was built to prevent.
 *
 * This is the same argument, and the same fix, as {@link useCompanySelection}: the rules live in
 * one place because "every copy must remember" is not a rule a codebase can keep.
 *
 * What stays with the caller is only what is genuinely theirs: the form layout, and what they do
 * with the results. Everything about *what searching means* is here.
 */

/** One ghost per browser, ever. The key is shared so all three surfaces honour the same slot. */
export const GHOST_KEY = "rmm_anon_ghost_created";

/** How long to let somebody keep typing before deciding they have stopped. */
export const CAPTURE_DEBOUNCE_MS = 1500;

export interface ManagerSearchInput {
  firstName: string;
  lastName: string;
  title: string;
  /**
   * Resolves the company to send. Each surface owns how its company is chosen — an autocomplete
   * on /find, a filter box in the directory, the page's own company on a company profile — but all
   * three must end up sending the same shape.
   */
  companyPayload: () => Promise<{ company: string; companyId: number | null }>;
  /** The company as displayed. Used for the capture gate and the locked tile. */
  companyName: string;
  isLoggedIn: boolean;
}

export interface ManagerSearchOutcome {
  /** Null is never returned; an empty array means "nobody by that name". */
  results: any[];
  hasContributed: boolean;
}

type Geo = Awaited<ReturnType<typeof fetchGeo>>;

/**
 * Records a search that may never be completed, for the admin queue.
 *
 * A name on its own is not worth an admin's time: there is nothing to tell two people of that name
 * apart. A name with a company, or a name with a job title, is a real lead — and those used to be
 * thrown away because the endpoint demanded all four fields.
 *
 * Fire-and-forget by design. The person searching should never wait on, or see, our bookkeeping.
 */
export async function captureSearch(
  input: ManagerSearchInput,
  geo: Geo,
  /**
   * An already-resolved company, when the caller has one.
   *
   * Resolving it can CREATE a company, so a search that resolved it here *and* again for the ghost
   * paid for that round trip twice. Callers on the search path resolve once and pass it in; the
   * debounced capture in the forms has nothing to reuse and still resolves its own.
   */
  resolved?: { company: string; companyId: number | null },
): Promise<void> {
  const fn = input.firstName.trim();
  const ln = input.lastName.trim();
  const t  = input.title.trim();
  if (!fn || !ln) return;

  const { company: companyName, companyId } = resolved ?? await input.companyPayload();
  if (!companyName && !t) return;  // a bare name tells an admin nothing

  axios.post(`${API_BASE}/api/managers/anonymous-capture`, {
    name: `${fn} ${ln}`,
    company: companyName || null,
    companyId,
    title: t || null,
    country: geo.country,
    state: geo.state,
  }).catch(() => {});
}

/** The key a debounced capture dedupes on, so refining a field captures the better version. */
export function captureKey(input: { firstName: string; lastName: string; title: string; companyName: string }): string {
  return `${input.firstName.trim()}|${input.lastName.trim()}|${input.title.trim()}|${input.companyName.trim()}`
    .toLowerCase();
}

/**
 * The search itself.
 *
 * Signed in, the server resolves it. Signed out, we look the name up, and on a miss create the
 * manager once per browser and hand back an ordinary locked tile — that is the feature, not a side
 * effect: somebody searching for a manager nobody has rated yet should *find* one, and be able to
 * open the profile and rate them. Nothing in the result may reveal that a row was written.
 *
 * Throws on a network or server failure so the caller can show its own error; every other outcome
 * is an ordinary result.
 */
export async function searchForManager(input: ManagerSearchInput): Promise<ManagerSearchOutcome> {
  const fn = input.firstName.trim();
  const ln = input.lastName.trim();
  const t  = input.title.trim();

  // An obvious placeholder is answered here rather than round-tripped. Each one that reaches the
  // server for a signed-in reader creates a manager, so the cost of not checking is a directory
  // filling up with people who do not exist.
  if (validateManagerName(fn, ln)) {
    return { results: [], hasContributed: false };
  }

  const geo = await fetchGeo();

  if (input.isLoggedIn) {
    const res = await axios.post(`${API_BASE}/api/managers/find-or-create`, {
      firstName: fn,
      lastName:  ln,
      title:     t,
      ...(await input.companyPayload()),
      country:   geo.country,
      state:     geo.state,
      city:      geo.city,
    });
    return { results: res.data.data ?? [], hasContributed: res.data.hasContributed ?? false };
  }

  const search = `${fn} ${ln}`;
  const lookup = await axios.get(`${API_BASE}/api/managers`, {
    params: { search, limit: 8, offset: 0 },
  });
  const found = lookup.data.data ?? [];
  if (found.length > 0) return { results: found, hasContributed: false };

  /*
    The company is resolved ONCE, here.

    It used to be resolved inside captureSearch and again inside the ghost POST, and resolving it
    can CREATE a company - so a single search made that round trip twice. Everything below reuses
    this.
  */
  const companyFields = await input.companyPayload();

  // Slot already spent: forward to the admin queue and show nothing.
  if (localStorage.getItem(GHOST_KEY)) {
    void captureSearch(input, geo, companyFields);
    return { results: [], hasContributed: false };
  }

  /*
    Captured before the ghost is attempted, and deliberately NOT awaited.

    Before: `await captureSearch(...)`, which waited on a company-creation POST purely for
    bookkeeping while the person sat looking at a spinner. The comment on captureSearch has always
    said the searcher should never wait on it; now they do not. Ordering is preserved - the request
    still leaves first - we simply stop blocking on its response.
  */
  void captureSearch(input, geo, companyFields);

  let ghostRow: { id?: number | string; published?: boolean } | null = null;
  try {
    const ghostRes = await axios.post(`${API_BASE}/api/managers/ghost`, {
      name: search,
      ...companyFields,
      title: t,
      country: geo.country,
      state: geo.state,
      city: geo.city,
      // A deliberate search that found nobody, so the manager is auto-added live ('ghost') and
      // shown back as a clickable tile. The add form posts to this same endpoint WITHOUT this
      // flag, because a half-typed form must never publish anybody.
      fromSearch: true,
    });
    ghostRow = ghostRes.data ?? null;
  } catch {
    return { results: [], hasContributed: false };  // ghost creation failed - an ordinary miss
  }

  /*
    `published` is the server telling us whether a PUBLIC manager exists, not merely that a row was
    written. It is false when the site-wide ceiling is in force: the search still records a pending
    row for an admin, but nothing public was created.

    Both behaviours below hang off it, and both are bugs if they do not:

      - a tile built from an unpublished row links to a profile the server refuses to serve, which
        is exactly the "Manager not found" outage;
      - setting GHOST_KEY for a ghost that was never created burns this browser's one auto-add
        forever, for something it never received.
  */
  if (ghostRow?.published === false) return { results: [], hasContributed: false };

  localStorage.setItem(GHOST_KEY, "true");

  /*
    The manager we just created, shown as an ordinary locked tile, built from the create response.

    There used to be an unconditional second search here to fetch "the real row". It cost a whole
    round trip to read back something we had just written and already held, on the one path where
    somebody is actively waiting.

    It survives as a FALLBACK, for the one case it actually covered: a create response that comes
    back without an id. Then we have nothing to build a tile from and must go and look.
  */
  if (ghostRow?.id != null) {
    return {
      results: [{
        id: ghostRow.id,
        name: search,
        company: input.companyName.trim(),
        title: t,
        overallRating: 0,
        reviewsCount: 0,
      }],
      hasContributed: false,
    };
  }

  try {
    const retry = await axios.get(`${API_BASE}/api/managers`, {
      params: { search, limit: 8, offset: 0 },
    });
    return { results: retry.data.data ?? [], hasContributed: false };
  } catch {
    return { results: [], hasContributed: false };
  }
}
