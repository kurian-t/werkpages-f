/**
 * Choosing which companies to offer an admin who is typing a name.
 *
 * <h2>Why this exists</h2>
 *
 * The admin companies tab fetches every company and filtered them with
 * `name.toLowerCase().includes(query)`, then took the first few of a list the server returns in
 * alphabetical order. Searching `TD`, to say that TD Auto Finance is part of TD Bank, returned
 * Academy Sports + Outdoors, Aircastle LTD, Amrize Ltd and three more like them: every one
 * contains the letters "td", in Ou-TD-oors and L-TD. The companies actually named TD were below
 * the cut and no amount of further typing brought them up, because every extra character still
 * matched something earlier in the alphabet.
 *
 * A substring match is not wrong. It is the weakest kind of match, and it was being treated as
 * the only kind.
 *
 * <h2>The order</h2>
 *
 *   1. the name the person typed, exactly
 *   2. a name that STARTS with what they typed      - "TD Bank" for "TD"
 *   3. a name with a WORD that starts with it       - "Royal Bank of Canada" for "bank"
 *   4. a name that merely contains it               - "Aircastle LTD" for "td"
 *
 * Alphabetical within a tier, so the list does not reorder itself between keystrokes.
 *
 * <p>Tier 4 is kept rather than dropped: a mid-word match is a real match, and an admin hunting
 * for Outdoors must still find it. It just stops crowding out the company whose name this is.
 *
 * <p>Deliberately NOT applied to the public company autocomplete, which is ranked by the server
 * against a different question. This is the admin list, which arrives whole and unranked.
 */

/** Everything the ranking needs. Callers pass their own richer rows straight through. */
interface Named {
  name: string;
}

/** Splits a name into the words a person would consider it to be made of. */
function words(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

/** Lower is better. Four tiers, and -1 for no match at all. */
function tier(name: string, query: string): number {
  const n = name.toLowerCase().trim();
  if (n === query) return 0;
  if (n.startsWith(query)) return 1;
  if (words(name).some(w => w.startsWith(query))) return 2;
  if (n.includes(query)) return 3;
  return -1;
}

/**
 * The best `limit` matches for `query`, strongest first.
 *
 * @param companies every company, in any order
 * @param query     what the admin has typed; case and surrounding space are ignored
 * @param limit     how many rows the caller's list shows
 */
export function rankCompanyMatches<T extends Named>(
  companies: T[],
  query: string,
  limit: number,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return companies
    .map(c => ({ c, t: tier(c.name, q) }))
    .filter(x => x.t >= 0)
    .sort((a, b) => a.t !== b.t
      ? a.t - b.t
      // localeCompare, so "Ltd." and "LTD" do not order by byte value.
      : a.c.name.localeCompare(b.c.name, undefined, { sensitivity: "base" }))
    .slice(0, limit)
    .map(x => x.c);
}
