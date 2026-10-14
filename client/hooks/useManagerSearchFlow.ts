import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGeo } from "@/lib/geo";
import {
  CAPTURE_DEBOUNCE_MS,
  captureKey,
  captureSearch,
  loadMoreManagers,
  managerSearchReady,
  PAGE_SIZE,
  searchForManager,
  type ManagerSearchOutcome,
} from "@/lib/managerSearch";

/**
 * ONE manager-search workflow, three entry points.
 *
 * /find, /directory and the Find a Manager form on a company profile ask the same question and
 * must behave identically: the same four fields, the same name-first matching, the same fuzzy
 * detection, the same company resolution, the same ghost and admin-review rules, the same ranking.
 * Only the page around them differs, and only in two ways - how the company is obtained, and how
 * the results are drawn.
 *
 * Everything between those two ends lives here, once. It was previously written out on each page,
 * and the copies had already drifted in ways nobody could see from any single file:
 *
 *   - /directory joined the two name fields into one string and split it again at the first space,
 *     so "Mary Jane" / "Watson" reached the matcher as "Mary" / "Jane Watson" while /find sent it
 *     correctly - the same typing, two different searches;
 *   - the company profile's form captured NOTHING when somebody gave up part way through, so the
 *     one surface where the company is already known was the one that threw the answer away;
 *   - the four-field gate existed in three copies, each free to drift into accepting or refusing
 *     inputs the others would not.
 *
 * A page that needs the search to behave differently needs a written reason in CLAUDE.md, not a
 * fourth copy of this.
 */
export interface ManagerSearchFields {
  firstName: string;
  lastName: string;
  title: string;
  /** The company as DISPLAYED. On a company profile this is the page's own verified identity. */
  companyName: string;
  /**
   * Resolves the company at submit time, and may create it. Kept as a resolver rather than a value
   * because that is the one part that genuinely differs between the three surfaces.
   */
  companyPayload: () => Promise<{ company: string; companyId: number | null }>;
  /**
   * True on a company profile, where the company comes from the page rather than a text box. It
   * is still SENT, and it still ranks rather than filters: somebody searched on Amazon's page for
   * a manager who works at QuadReal must still be shown the QuadReal one.
   */
  companyFromPage?: boolean;
  isLoggedIn: boolean;
}

export function useManagerSearchFlow(fields: ManagerSearchFields) {
  // The latest values, so the callbacks below never close over a stale render.
  const latest = useRef(fields);
  useEffect(() => { latest.current = fields; });

  const ready = managerSearchReady(fields);

  const buildInput = useCallback(
    (over?: { firstName?: string; lastName?: string; title?: string }) => {
      const f = latest.current;
      return {
        firstName: (over?.firstName ?? f.firstName).trim(),
        lastName:  (over?.lastName  ?? f.lastName).trim(),
        title:     (over?.title     ?? f.title).trim(),
        companyPayload: f.companyPayload,
        companyName: f.companyName,
        isLoggedIn: f.isLoggedIn,
      };
    },
    [],
  );

  /**
   * Captures a search the person never finished.
   *
   * The button stays gated on every field, so a half-filled search is never submitted - and
   * without this it was never recorded either. Keyed on what would actually be sent, so refining
   * the company or title captures the better version once and idle keystrokes do not re-post.
   */
  const lastCaptured = useRef<string>("");
  useEffect(() => {
    const fn = fields.firstName.trim();
    const ln = fields.lastName.trim();
    const t  = fields.title.trim();
    const c  = fields.companyName.trim();
    if (!fn || !ln) return;
    if (!c && !t) return;   // a bare name tells an admin nothing

    const key = captureKey({ firstName: fn, lastName: ln, title: t, companyName: c });
    if (lastCaptured.current === key) return;
    lastCaptured.current = key;

    const timer = setTimeout(() => {
      void (async () => {
        const geo = await fetchGeo().catch(() => ({}) as Awaited<ReturnType<typeof fetchGeo>>);
        await captureSearch(buildInput(), geo);
      })();
    }, CAPTURE_DEBOUNCE_MS);   // let them finish typing before deciding they have stopped
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.firstName, fields.lastName, fields.title, fields.companyName]);

  /*
    PAGING, shared by all three surfaces.

    The server ranks the whole match set and then slices it, so a later page continues the first
    one's ordering instead of re-ranking a smaller set. The criteria are the ones already captured
    in `latest`, so asking for more cannot quietly change the question.

    `extra` holds the pages after the first. Each surface renders its own tiles - a stack here, a
    grid there - so it concatenates these onto its own first page rather than this hook owning the
    list and dictating the layout.
  */
  const [extra, setExtra] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [mayBeIncomplete, setMayBeIncomplete] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstPageCount = useRef(0);

  const noteOutcome = useCallback((outcome: ManagerSearchOutcome, firstPage: boolean) => {
    if (firstPage) {
      setExtra([]);
      firstPageCount.current = outcome.results.length;
    }
    setHasMore(outcome.hasMore === true);
    setMayBeIncomplete(outcome.moreMatchesMayExist === true);
  }, []);

  /** Runs the search. Overrides exist for the surfaces that re-run a remembered search. */
  const runSearch = useCallback(
    async (over?: { firstName?: string; lastName?: string; title?: string }): Promise<ManagerSearchOutcome> => {
      const outcome = await searchForManager(buildInput(over));
      noteOutcome(outcome, true);
      return outcome;
    },
    [buildInput, noteOutcome],
  );

  /**
   * Fetches the next page and keeps it.
   *
   * Read-only by construction - see loadMoreManagers. Somebody asking to see more of what they
   * already searched for must not create anything, and must not spend their one ghost.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const offset = firstPageCount.current + extra.length;
      const outcome = await loadMoreManagers(buildInput(), offset);
      setExtra((prev) => [...prev, ...outcome.results]);
      setHasMore(outcome.hasMore === true);
      setMayBeIncomplete(outcome.moreMatchesMayExist === true);
    } catch {
      // A failed page leaves what is already on screen alone, and the control stays available.
      setHasMore(true);
    } finally {
      setLoadingMore(false);
    }
  }, [buildInput, extra.length, loadingMore]);

  /** Clears paging state when a surface abandons its results. */
  const resetPaging = useCallback(() => {
    setExtra([]);
    setHasMore(false);
    setMayBeIncomplete(false);
    firstPageCount.current = 0;
  }, []);

  return { ready, runSearch, loadMore, resetPaging,
           extraResults: extra, hasMore, mayBeIncomplete, loadingMore, pageSize: PAGE_SIZE };
}
