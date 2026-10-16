import { LocationValue } from "@/lib/location";
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
  /**
   * Where the manager works, as answered on the form.
   *
   * <p>Supplied by every surface that shows the shared LocationField, which is all three of them.
   * Optional only so a caller that has not been migrated still compiles; when it is absent the
   * visitor's geography is used as it always was, and that path is the one being retired.
   *
   * <p>Pre-filled with the COUNTRY alone. A city or region reaches this object only when somebody
   * actually chose one.
   */
  location?: LocationValue;
}

export interface ManagerSearchOutcome {
  /** Null is never returned; an empty array means "nobody by that name". */
  results: any[];
  hasContributed: boolean;
  /** How many matched in total, which may be more than this page holds. */
  total?: number;
  /** Another PAGE exists. Ask for it with the same criteria at a higher offset. */
  hasMore?: boolean;
  /**
   * The candidate scan hit its budget, so classification may be INCOMPLETE.
   *
   * Deliberately not the same thing as `hasMore`. `hasMore` means "there are more of the matches
   * we found"; this means "there may be matches we never got as far as examining". Telling a
   * reader the second one as though it were the first would be a lie about how much we looked.
   */
  moreMatchesMayExist?: boolean;
}

/** One page of results, on every surface. */
export const PAGE_SIZE = 8;

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
/**
 * The four-field gate, in one place, for all three manager-search entry points.
 *
 * /find, /directory and the Find a Manager form on a company profile ask the same question and
 * must accept the same answers. They each carried their own copy of this rule, which is three
 * places for it to drift: a surface that demands less sends the matcher input the others would
 * have refused, and one that demands more refuses a search the others would have run.
 *
 * `companyFromPage` is the single legitimate difference. On a company profile the company is the
 * page's own verified identity rather than something typed, so there is no text to length-check -
 * but it is still SENT, and it still ranks rather than filters.
 */
export function managerSearchReady(f: {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  companyFromPage?: boolean;
}): boolean {
  const nameFilled = f.firstName.trim().length > 0 && f.lastName.trim().length >= 2;
  const detailsFilled = f.title.trim().length > 0
    && (f.companyFromPage === true || f.companyName.trim().length >= 2);
  return nameFilled && detailsFilled;
}

/**
 * The next page of an ALREADY SUBMITTED search.
 *
 * Deliberately separate from {@link searchForManager}: paging must not re-run the parts of a
 * completed search that have consequences. It creates nothing, spends no ghost eligibility and
 * records no capture - it asks the same question again, at a higher offset, and the server ranks
 * the whole match set before slicing it, so page two continues page one's ordering rather than
 * re-ranking a different subset.
 */
export async function loadMoreManagers(
  input: ManagerSearchInput,
  offset: number,
): Promise<ManagerSearchOutcome> {
  const res = await axios.get(`${API_BASE}/api/managers`, {
    params: {
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.companyName,
      title: input.title,
      limit: PAGE_SIZE,
      offset,
    },
  });
  return {
    results: res.data.data ?? [],
    hasContributed: false,
    total: res.data.total,
    hasMore: res.data.hasMore === true,
    moreMatchesMayExist: res.data.moreMatchesMayExist === true,
  };
}

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

  /*
      THE LOCATION THE PERSON ANSWERED, not the one their address implies.

      This was `await fetchGeo()`, and it sent the visitor's country, region AND city as the
      manager's location on every search. /find asks for no location, so a ghost created here was
      stamped with the SEARCHER's city and showed it on the profile - the reader seeing their own
      town on a page they just created, which reads as surveillance rather than a default.

      The field is now on the form, pre-filled with the country alone, and this is its value.
      When nobody has touched it, that is a country and nothing finer; `source` stays null so it
      can never be mistaken downstream for a place a human declared.
  */
  const geo = input.location ?? await fetchGeo();

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
  /*
    DISCOVERY GOES THROUGH THE SHARED MATCHER.

    This sent `search`, a substring query, and then returned early whenever it found anything. Two
    consequences, both of which hid managers the policy says must be shown:

      - "Aar Yip" is not a substring of "Aaron Yip", so an existing manager was missed entirely;
      - with both "Aron Yip" and "Aaron Yip" on file, searching the first returned only the first
        and exited, so the second was never looked for at all.

    Sending the four fields separately routes this to the one matching policy - name first,
    company and title as relevance - so the anonymous journey discovers exactly what a signed-in
    one does. Publication rules still differ; who exists does not.
  */
  /*
    POST, because a completed search WRITES.

    It resolves the company and creates it when we do not hold it yet. That was requested through
    `GET ...&submitted=true`, which made a read verb change the database: anything that replays a
    URL - a crawler, a link prefetch, a browser retry, a refresh - could mint company rows on its
    own. Read-only discovery is still the GET; a finished search is this.
  */
  const lookup = await axios.post(`${API_BASE}/api/managers/search`, {
    firstName: fn,
    lastName: ln,
    // The company as DISPLAYED. companyPayload() is deliberately not called here: the server
    // resolves the company itself, from what was typed.
    company: input.companyName,
    title: input.title,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const found = lookup.data.data ?? [];
  /*
    The company write for a completed search happens ON THE SERVER, as part of this POST - not
    here.

    It was fired from the browser and not awaited, which loses it whenever somebody navigates away,
    closes the tab or the request fails. Logging the failure does not retry it, and relying on the
    next visitor to search the same employer is a hope rather than a delivery guarantee. The server
    completes the work regardless of what this tab does next, and runs it alongside the matcher so
    the tiles do not queue behind it.
  */
  if (found.length > 0) {
    return {
      results: found,
      hasContributed: false,
      total: lookup.data.total ?? found.length,
      hasMore: lookup.data.hasMore === true,
      moreMatchesMayExist: lookup.data.moreMatchesMayExist === true,
    };
  }

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
    captureSearch runs ONLY if the ghost attempt fails. It used to fire first, unawaited, and that
    raced this search against itself.

    Both endpoints write a manager row for the same person. captureAnonymousSearch calls
    createPending -> a 'pending_approval' row with no submitted_by. The ghost endpoint begins with
    findCapturedByNameAndCompany, which matches 'pending_approval' on purpose so a second visitor
    adopts an existing draft instead of duplicating it.

    So when the capture's INSERT won the race, the ghost call found the row THIS SAME SEARCH had
    just written, took the adopt branch, and published nothing. The visitor got a tile pointing at
    a pending row with no submitter, and enforceSubmitterAccess refuses those to everybody:
    "Manager Not Found". Whoever won the race decided whether the search worked, which is why it
    struck a genuinely new manager on a genuine first search and looked impossible to reproduce.

    Nothing is lost by moving it. When the ghost POST succeeds the lead is already recorded - it
    either published a 'ghost' or wrote a captured draft itself. The only case captureSearch ever
    covered is the one it now handles: the POST failing outright.
  */
  let ghostRow: { id?: number | string; published?: boolean; candidates?: any[] } | null = null;
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
    // The one case the pre-emptive capture existed for: the ghost write never happened, so record
    // the lead here instead. No race now - nothing else is writing this manager.
    void captureSearch(input, geo, companyFields);
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
  if (ghostRow?.published === false) {
    /*
      Nothing was published - but the server may still have found managers worth showing.

      This returned an empty list unconditionally, and that reopened the original complaint from
      the other side. The anonymous flow only reaches this call when its own lookup found nobody,
      and that lookup is a substring match on "First Last": it catches "Aaron Yi" and "Aron Yip"
      inside "Aaron Yip" by luck, and misses "Aar Yip" and "Aaron Yap" entirely. For those the
      server correctly declines to create a second Aaron Yip - and the visitor was then shown
      nothing at all, having searched for somebody we hold.

      `candidates` carries those existing public managers, already ranked by relevance to what was
      typed. They are rendered, and `published` stays false, so the browser's one-time ghost
      allowance is NOT spent: being shown somebody who already exists is not an auto-add.
    */
    const candidates = (ghostRow as any)?.candidates ?? [];
    return { results: candidates, hasContributed: false };
  }

  /*
    Only a row the server says is PUBLISHED may become a tile, or burn this browser's slot.

    `=== false` alone was not enough. One server branch - the one that adopts an existing captured
    draft - returned no `published` field at all, and undefined is not false, so a tile was built
    for a pending row the profile page refuses to serve. That was the "Manager Not Found" outage,
    reported three times: a signed-out visitor searched a name an earlier visitor had half-typed
    into the add form, and got a clickable tile leading nowhere.

    The test is `=== true` here rather than `!== true` on the guard above, because those are not
    the same thing. Bailing out entirely on a missing field would also kill the fallback below,
    which is legitimate and safe: a create response with no id sends us to re-search, and the
    search endpoint returns only approved and ghost rows, so whatever it finds IS servable.

    So: publish-confirmed rows become a tile from the create response; anything else falls through
    to the re-search and stands or falls on what that returns.
  */
  const publiclyCreated = ghostRow?.published === true;
  if (publiclyCreated) localStorage.setItem(GHOST_KEY, "true");

  /*
    The manager we just created, shown as an ordinary locked tile, built from the create response.

    There used to be an unconditional second search here to fetch "the real row". It cost a whole
    round trip to read back something we had just written and already held, on the one path where
    somebody is actively waiting.

    It survives as a FALLBACK, for the one case it actually covered: a create response that comes
    back without an id. Then we have nothing to build a tile from and must go and look.
  */
  if (publiclyCreated && ghostRow?.id != null) {
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
