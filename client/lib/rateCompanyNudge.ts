/**
 * The prompt to rate a company, offered once someone has just rated one of its managers.
 *
 * It appears as a toast on the manager's own profile rather than as a screen of its own, because
 * people want to look at the profile they just changed. Taking them somewhere else to ask a
 * second question fights the behaviour instead of using it.
 *
 * Three ways out, two meanings: Rate opens the form, and both "Maybe later" and the ✕ suppress it.
 * Making those two behave differently would be a trap - somebody who closes a prompt has answered
 * it, whatever they clicked.
 */

const KEY_PREFIX = "wp_company_rate_nudge:";

/** Long enough that a dismissal is respected, short enough that a change of mind is possible. */
const SUPPRESS_DAYS = 30;

/**
 * localStorage rather than the server: this is a nudge, not data. Per-device is the right
 * granularity, and it needs no round trip at the moment somebody is reading their own review.
 *
 * Every read and write is guarded - private windows and blocked site data throw on access, and a
 * prompt is never worth breaking a page over.
 */
export function isNudgeSuppressed(companyId: number | string): boolean {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + companyId);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function suppressNudge(companyId: number | string): void {
  try {
    localStorage.setItem(
      KEY_PREFIX + companyId,
      String(Date.now() + SUPPRESS_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    // Private mode, or storage disabled. The prompt simply reappears next visit, which is a far
    // better failure than a thrown exception on a page somebody is reading.
  }
}
