/**
 * The gate state a gated response was fetched under.
 *
 * Some endpoints shape their reply around the viewer: a company or manager profile comes back with
 * its category averages stripped out for somebody who has not contributed yet. That makes the
 * response cacheable per gate state, not per URL - and the caches were keyed on the URL alone.
 *
 * The result was a page that stayed locked after signing in, or after submitting the very rating
 * that unlocked it, until the reader hit refresh. Invalidating by hand at each place the gate could
 * flip is what had been tried, and it kept regressing, because there is always one more place.
 *
 * Putting this in the query key instead makes it structural: when the gate flips, the key changes,
 * and every gated query refetches on its own. Nothing to remember at the call site.
 */
export interface GateState {
  id?: string | number | null;
  /** Opened by rating a manager - gates manager data. */
  hasContributed?: boolean;
  /** Opened by rating a workplace - gates company data. Separate gate, separate key. */
  hasRatedCompany?: boolean;
}

export function gateKey(user: GateState | null | undefined): string {
  if (!user) return "anon";
  // Every gate goes in. There is one gate per dataset - rating a manager does not buy the
  // workplace numbers and the reverse holds too - so a key that tracked only one of them would
  // leave the other stale in exactly the way this exists to prevent.
  return [
    user.id ?? "unknown",
    user.hasContributed ? "m1" : "m0",
    user.hasRatedCompany ? "c1" : "c0",
  ].join(":");
}
