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


/*
  The handoff from the add-manager form.

  The offer belongs on the profile, not on the form: a successful submission navigates straight to
  the new manager's page, so a dialog opened on the form would unmount before anybody could read
  it. The form leaves a one-shot flag and the profile consumes it exactly once.

  sessionStorage, not localStorage: this must not survive the tab. A flag that outlived the visit
  would open the dialog on some unrelated profile days later.
*/
const JUST_ADDED_KEY = "rmm_just_added_manager";

export function markJustAddedManager(): void {
  try {
    sessionStorage.setItem(JUST_ADDED_KEY, "1");
  } catch {
    // Storage blocked. The submission still worked; only the follow-up offer is lost.
  }
}

/** True once per submission, then never again - reading it clears it. */
export function consumeJustAddedManager(): boolean {
  try {
    if (sessionStorage.getItem(JUST_ADDED_KEY) !== "1") return false;
    sessionStorage.removeItem(JUST_ADDED_KEY);
    return true;
  } catch {
    return false;
  }
}

/*
  The handoff from the workplace-rating form.

  Same one-shot shape as the add-manager flag, and for the same reason: the offer belongs on the
  page that SHOWS the rating, not on the form that submitted it. Asking on the form meant deciding
  about two further contributions while the one just written was still hidden behind the question.
*/
const JUST_RATED_COMPANY_KEY = "rmm_just_rated_company";

export function markJustRatedCompany(): void {
  try {
    sessionStorage.setItem(JUST_RATED_COMPANY_KEY, "1");
  } catch {
    // Storage blocked. The rating still landed; only the follow-up offer is lost.
  }
}

/** True once per rating, then never again - reading it clears it. */
export function consumeJustRatedCompany(): boolean {
  try {
    if (sessionStorage.getItem(JUST_RATED_COMPANY_KEY) !== "1") return false;
    sessionStorage.removeItem(JUST_RATED_COMPANY_KEY);
    return true;
  } catch {
    return false;
  }
}
