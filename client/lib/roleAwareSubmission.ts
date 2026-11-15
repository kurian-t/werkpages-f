/**
 * The role-aware contribution flow: asking who the contributor means instead of guessing.
 *
 * ## Why this exists
 *
 * The legacy form took a typed name, found candidates by exact company, ran an edit-distance
 * comparison and attached the rating to whichever manager was within one edit of what was typed.
 * One person accumulated eight profiles that way, and twenty-one people ended up with two public
 * profiles each with their reviews split between them.
 *
 * **Fuzzy matching may help somebody FIND a manager. It must never decide who that manager is.**
 * Everything here is built so the contributor decides and the platform records the decision.
 *
 * ## The flag
 *
 * Off unless `VITE_ROLE_AWARE_SUBMISSION` is exactly "true". The server has its own flag and
 * answers 404 on these endpoints while it is off, so both have to be on for the flow to work and
 * neither alone can expose it. The legacy path keeps serving every submission until then.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

export function roleAwareSubmissionEnabled(): boolean {
  return ((import.meta.env.VITE_ROLE_AWARE_SUBMISSION as string) ?? "").trim() === "true";
}

/** One job a manager held, as offered for selection. */
export interface Employment {
  /**
   * The canonical employment record's id, or null.
   *
   * **Null is not an error and must never be sent as a selection.** A manager's current role often
   * has no `career_history` row behind it - search-created managers never do - so there is nothing
   * for a claim to resolve to. Such an employment is still shown, because hiding it would make the
   * person look like they had never worked anywhere, but choosing it is the "add the missing
   * employment" path.
   */
  roleId: number | null;
  companyId: number | null;
  company: string | null;
  title: string | null;
  /** `proposed` holds the rating until a moderator accepts the employment; `accepted` publishes. */
  state: string;
  periodKnown: boolean;
  startDate: string | null;
  endDate: string | null;
  /** False exactly when `roleId` is null. Read this rather than re-deriving it. */
  selectable: boolean;
  /*
    THE EMPLOYER'S LOGO IDENTITY, resolved rather than guessed.

    All three come from the company record the employment points at. The renderer tries them in
    order, and given only a name it guesses a domain - which draws a confident logo belonging to
    somebody else.
  */
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  companyBrandfetchIconUrl?: string | null;
  isCurrentRoleWithoutRecord: boolean;
}

export interface Candidate {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  image?: string | null;
  overallRating?: number | null;
  reviews?: number | null;
  employments: Employment[];
}

export interface IdentifyResult {
  candidates: Candidate[];
  /**
   * CONFIRMED, PLAUSIBLE or NONE. For DISPLAY only: a plausible candidate is shown as a weaker
   * match and is never pre-selected. Acting on this value would reintroduce the guess.
   */
  nameClass: "CONFIRMED" | "PLAUSIBLE" | "NONE";
  /** The candidate budget truncated the scan, so say "there may be others" rather than implying the list is complete. */
  incompleteEvidence: boolean;
  entered: { firstName: string; lastName: string; company: string | null; title: string | null };
}

/**
 * Who the contributor might mean. **Read-only: creates no manager, company, claim or review.**
 *
 * That is the property the old journey broke. It fired `POST /api/managers/ghost` the moment the
 * first step validated, so merely typing a name published a provisional profile. Removing fuzzy
 * attachment while keeping that would have swapped one source of duplicate profiles for another.
 */
export async function identifyManager(input: {
  firstName: string;
  lastName: string;
  company?: string | null;
  title?: string | null;
  companyId?: number | null;
}): Promise<IdentifyResult> {
  const res = await fetch(`${API_BASE}/api/managers/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Same cookie session as every other call. Identification is read-only either way, but a
    // signed-in caller should be recognised consistently across the journey.
    credentials: "include",
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company ?? null,
      title: input.title ?? null,
      companyId: input.companyId ?? null,
    }),
  });
  if (res.status === 404) {
    // The server's flag is off. Treated as "the flow does not exist" rather than as an error, so a
    // half-enabled deployment degrades to the legacy path instead of showing somebody a failure.
    throw new RoleAwareDisabledError();
  }
  if (!res.ok) throw new Error(`identify failed: ${res.status}`);
  return (await res.json()) as IdentifyResult;
}

export class RoleAwareDisabledError extends Error {
  constructor() {
    super("The role-aware contribution flow is not enabled");
    this.name = "RoleAwareDisabledError";
  }
}

/**
 * What the contributor has decided so far.
 *
 * Three shapes, one per Rev 268 path, and the type makes the invalid fourth unrepresentable: there
 * is no variant carrying a manager id with a null role id as if it were a resolved selection.
 */
export type IdentitySelection =
  /** They picked a person AND one of that person's canonical employments. */
  | { kind: "existing"; managerId: number; managerName: string; roleId: number; employment: Employment }
  /** They picked a person, but none of the employments shown is the job they worked under. */
  | { kind: "proposeEmployment"; managerId: number; managerName: string }
  /** None of the candidates is the person. The manager and the employment are both new. */
  | { kind: "proposeManager" };

/** Whether an employment may be sent as a `selectedRoleId`. */
export function isSelectable(e: Employment): boolean {
  return e.selectable && e.roleId !== null;
}

/**
 * A short, plain description of an employment for the picker.
 *
 * No product vocabulary. A contributor never needs to know what a role claim, a canonicalization
 * or an employment-resolution conflict is, so this says "Dispatch Lead at Halverson Logistics,
 * from 2023" and stops.
 */
export function describeEmployment(e: Employment): string {
  const where = [e.title, e.company].filter(Boolean).join(" at ");
  if (!e.periodKnown || !e.startDate) return where;
  const from = e.startDate.slice(0, 7);
  const to = e.endDate ? e.endDate.slice(0, 7) : "now";
  return `${where}, ${from} to ${to}`;
}

/**
 * What happens to the rating once submitted, in the contributor's terms.
 *
 * Said plainly and in advance, because "held for review" arriving as a surprise after somebody has
 * written a rating reads as rejection.
 */
export function publicationNote(selection: IdentitySelection): string | null {
  if (selection.kind === "existing") {
    return selection.employment.state === "accepted"
      ? null
      : "This job is still being confirmed, so your rating will appear once someone checks it.";
  }
  return "You're adding something new, so your rating will appear once someone checks it.";
}

/** What the server decided about a submitted rating. */
export interface RateWithRoleResult {
  reviewId: string;
  claimId: number;
  /**
   * The manager the rating is now against, whichever path it took.
   *
   * On the "add someone new" path the client sent no manager id - there was nobody to name - so
   * this is the only way it learns where the contribution ended up, and it is where the person
   * is sent afterwards.
   */
  managerId: number;
  roleId: number | null;
  resolution: string;
  /** False is normal, not a failure: a proposed employment waits for a moderator. */
  live: boolean;
  heldBecause: string | null;
  /** True when this submission had already been recorded and nothing new was written. */
  replayed: boolean;
}

/** A refusal the contributor can act on, as opposed to something that went wrong. */
export class RateWithRoleRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RateWithRoleRefused";
  }
  /** They have already used both of their ratings for this manager. */
  get isOutOfOpportunities() {
    return this.status === 409;
  }
  /** Their selection went stale, or the draft moved. They choose again; nothing is lost. */
  get isStale() {
    return this.status === 400;
  }
}

/**
 * Submit the rating against the manager and employment the contributor chose.
 *
 * **There is no fallback here, and that is the point.** If this fails the caller shows an error and
 * keeps every answer. It must never retry through the legacy submission or `createManager`, because
 * those run the fuzzy attachment: "retry the old way" would file the rating against whichever
 * manager was within one edit of the typed name, reached only when something had already gone
 * wrong and nobody was watching.
 *
 * A submission somebody can retry is recoverable. A rating silently attributed to the wrong human
 * is not.
 */
export async function rateWithRole(payload: Record<string, unknown>): Promise<RateWithRoleResult> {
  const res = await fetch(`${API_BASE}/api/managers/rate-with-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    /*
      THE COOKIE, because that is how this client authenticates: App.tsx sets
      axios.defaults.withCredentials and the session lives in an HttpOnly auth_token cookie. There
      is no bearer interceptor to borrow a token from.

      Omitting this would make every signed-in submission arrive anonymous: the rating would still
      be saved, which is worse than failing, because the contributor would never be credited and
      their rating opportunity would never be charged.
    */
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (res.status === 404) throw new RoleAwareDisabledError();
  if (res.status === 400 || res.status === 409) {
    const body = await res.json().catch(() => ({ error: "" }));
    throw new RateWithRoleRefused(res.status, body.error || "That didn't work. Please try again.");
  }
  if (!res.ok) throw new Error(`rate-with-role failed: ${res.status}`);
  return (await res.json()) as RateWithRoleResult;
}

/** What the server holds after an autosave. */
export interface ClaimDraftResult {
  saved: boolean;
  reason?: string | null;
  claimId?: number;
  /**
   * The revision the SERVER now holds, which may be newer than the one just sent if another tab
   * got there first. Adopt it rather than counting on your own: that is what stops two tabs
   * fighting, each convinced its number is current.
   */
  revision?: number;
  /** The rating is already submitted, so stop autosaving: the claim is a saved observation now. */
  finalized?: boolean;
  resolved?: boolean;
}

/**
 * Save the selection as a draft. Finalizes nothing and charges no opportunity.
 *
 * Returns `saved: false` with `reason: "no_manager_selected_yet"` on the "none of these" path,
 * because `role_claims.manager_id` is NOT NULL: a claim cannot exist before the manager does.
 * That is not a failure and must not be shown as one - the drop-off capture already holds that
 * draft, and it publishes nothing.
 */
export async function autosaveRoleClaim(payload: Record<string, unknown>): Promise<ClaimDraftResult> {
  const res = await fetch(`${API_BASE}/api/managers/role-claim-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (res.status === 404) throw new RoleAwareDisabledError();
  if (!res.ok) throw new Error(`autosave failed: ${res.status}`);
  return (await res.json()) as ClaimDraftResult;
}
