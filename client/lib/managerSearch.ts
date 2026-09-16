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
export async function captureSearch(input: ManagerSearchInput, geo: Geo): Promise<void> {
  const fn = input.firstName.trim();
  const ln = input.lastName.trim();
  const t  = input.title.trim();
  if (!fn || !ln) return;

  const { company: companyName, companyId } = await input.companyPayload();
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

  // Slot already spent: forward to the admin queue and show nothing.
  if (localStorage.getItem(GHOST_KEY)) {
    await captureSearch(input, geo);
    return { results: [], hasContributed: false };
  }

  // Capture *before* attempting the ghost. If ghost creation fails for any reason the search is
  // still worth keeping — a failure here used to lose it entirely.
  await captureSearch(input, geo);

  let ghostRow: { id?: number | string } | null = null;
  try {
    const ghostRes = await axios.post(`${API_BASE}/api/managers/ghost`, {
      name: search,
      ...(await input.companyPayload()),
      title: t,
      country: geo.country,
      state: geo.state,
      city: geo.city,
    });
    ghostRow = ghostRes.data ?? null;
    localStorage.setItem(GHOST_KEY, "true");
  } catch {
    return { results: [], hasContributed: false };  // ghost creation failed - an ordinary miss
  }

  /*
    The manager we just created, shown as an ordinary locked tile.

    A re-search is preferred because it returns the real row; the tile below is built from the
    create response for when that read comes back empty - the row exists either way.
  */
  const justCreated = {
    id: ghostRow?.id,
    name: search,
    company: input.companyName.trim(),
    title: t,
    overallRating: 0,
    reviewsCount: 0,
  };
  const fallback = justCreated.id != null ? [justCreated] : [];
  try {
    const retry = await axios.get(`${API_BASE}/api/managers`, {
      params: { search, limit: 8, offset: 0 },
    });
    const retryData = retry.data.data ?? [];
    return { results: retryData.length > 0 ? retryData : fallback, hasContributed: false };
  } catch {
    return { results: fallback, hasContributed: false };
  }
}
