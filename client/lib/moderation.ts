import axios from "axios";
import API_BASE from "@/lib/api";

/**
 * The admin moderation queues: the work the role-aware contribution flow creates.
 *
 * Rev 268 phase 4C. Every one of these endpoints resolves the caller to an admin in
 * ModerationService before it reads a row, so nothing here is a security boundary - hiding a
 * button does not protect an endpoint, and these calls fail with 401 or 403 for anybody else
 * regardless of what the page renders.
 *
 * All of it is read from the server on demand. None of these counts is cached in the page, because
 * a stale queue count is how two moderators end up working the same row.
 */

export type QueueSummary = {
  pendingEmployments: number;
  oldestEmploymentAt: string | null;
  openConflicts: number;
  openBlockingConflicts: number;
  oldestConflictAt: string | null;
  heldRatings: number;
  oldestHeldRatingAt: string | null;
};

export type PendingEmployment = {
  roleId: number;
  managerId: number;
  managerName: string;
  managerSlug: string | null;
  managerStatus: string;
  companyId: number | null;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  periodKnown: boolean;
  provenance: string;
  proposedAt: string | null;
  /** Distinct ACCOUNTS. A real count of separate people. */
  corroboratingAccounts: number;
  /** Claims, not people: several may be one visitor. Never presented as distinct individuals. */
  anonymousClaims: number;
  totalClaims: number;
  heldRatings: number;
  blockingConflicts: number;
};

export type ClaimEvidence = {
  claimId: number;
  assertedTitle: string | null;
  assertedStart: string | null;
  assertedEnd: string | null;
  periodKnown: boolean;
  stillThere: boolean | null;
  resolution: string | null;
  finalizedAt: string | null;
  fromAccount: boolean;
  ratings: number;
};

export type HeldRatingBrief = {
  reviewId: string;
  submittedAt: string | null;
  overallRating: number | null;
  title: string | null;
  company: string | null;
  wouldPublishNow: boolean;
};

export type ManagerHistoryRow = {
  roleId: number;
  company: string | null;
  title: string | null;
  state: string;
  periodKnown: boolean;
  startDate: string | null;
  endDate: string | null;
};

export type EmploymentDetail = {
  /** reopenedFrom and supersededBy are how a moderator walks backwards through this job. */
  employment: PendingEmployment & {
    state: string;
    reopenedFrom: number | null;
    supersededBy: number | null;
  };
  claims: ClaimEvidence[];
  heldRatings: HeldRatingBrief[];
  managerHistory: ManagerHistoryRow[];
};

export type ConflictRow = {
  conflictId: number;
  kind: string;
  blocksPublication: boolean;
  managerId: number | null;
  managerName: string | null;
  companyName: string | null;
  title: string | null;
  period: string | null;
  detectedAt: string | null;
  roleId: number | null;
  otherRoleId: number | null;
  subjectClaims: number;
  evidenceClaims: number;
  heldRatings: number;
};

/**
 * What a cited claim says NOW, rather than what it said when it was made.
 *
 * `stillThere` and `leftOn` are the latest statement the contributor has given; the `asserted*`
 * fields on the same row stay the claim's own frozen assertion. For an employment-status dispute
 * these two are the evidence, because a dispute is raised when somebody says the manager was
 * still there at a date the record says they had already gone.
 *
 * A withdrawn claim is still shown - the dispute was raised on it - but it no longer grounds any
 * status, which is a different decision from one whose evidence stands.
 */
export type StatusTestimony = {
  withdrawn: boolean;
  leftOn: string | null;
  saidAt: string | null;
  restated: boolean;
};

export type ConflictClaim = ClaimEvidence & {
  role: string;
  resolvedRoleId: number | null;
  heldRatings: number;
} & Partial<StatusTestimony>;

/**
 * One employment record in a dispute's case.
 *
 * A determination applies to the CASE - manager, employer, normalised title, period - and not to
 * the single role the queue row names, because an unknown-period employment can legitimately be
 * several rows and detection disputes each of them under one queue item.
 *
 * `willBeDetermined` is the server's own `employment_status = 'disputed'`, the same predicate the
 * write selects on. It is not re-derived here: a second opinion in the browser about which rows a
 * click affects would eventually disagree with the rows it actually changed.
 */
export type CaseEmployment = {
  roleId: number;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  periodKnown: boolean;
  employmentStatus: string;
  statusAsOf: string | null;
  statusBasis: string | null;
  willBeDetermined: boolean;
};

export type ConflictDetail = ConflictRow & {
  resolvedAt: string | null;
  resolution: string | null;
  note: string | null;
  claims: ConflictClaim[];
  /** Empty for every kind but an employment-status dispute. */
  caseEmployments: CaseEmployment[];
};

export type HeldRating = {
  reviewId: string;
  submittedAt: string | null;
  managerId: number;
  managerName: string;
  managerSlug: string | null;
  title: string | null;
  company: string | null;
  overallRating: number | null;
  claimId: number | null;
  roleId: number | null;
  roleState: string | null;
  roleTitle: string | null;
  blockingConflictId: number | null;
  blockingConflictKind: string | null;
  whyHeld: string;
  actionToRelease: string;
  wouldPublishNow: boolean;
};

/**
 * A correction, with PRESENCE separate from value.
 *
 * <p>Only the keys present are changed, and `endDate: null` means "no recorded end date", which
 * is a real correction. Omitting the key leaves it alone. A nullable field cannot carry both.
 */
export type EmploymentCorrection = {
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  periodKnown?: boolean;
  reason: string;
  thenAccept?: boolean;
};

export type CorrectionOutcome = {
  roleId: number;
  state: string;
  fieldsCorrected: number;
  accepted: boolean;
  ratingsPublished: number;
};

export type ReopenOutcome = {
  reopenedFrom: number;
  roleId: number;
  state: string;
  ratingsPublished: number;
  claimsToReconcile: ClaimEvidence[];
  heldRatings: HeldRatingBrief[];
};

/** Who did it. Four kinds, because "nobody recorded" and "nobody decided" are different. */
export type ActorKind = "admin" | "platform" | "author" | "withdrawn";

export type HistoryEvent = {
  kind: string;
  roleId: number | null;
  onThisRole: boolean;
  at: string | null;
  what: string | null;
  was: string | null;
  nowIs: string | null;
  reason: string | null;
  detail: string | null;
  actorKind: ActorKind;
  by: string | null;
};

/**
 * One page of a timeline.
 *
 * <p>`lineageComplete` answers whether every predecessor employment was found; `hasMore` answers
 * whether every event was returned. They are different questions and neither stands in for the
 * other: a role with 250 events has a complete lineage and an incomplete page.
 */
export type EmploymentHistory = {
  roleId: number;
  events: HistoryEvent[];
  employmentsInScope: number;
  lineageComplete: boolean;
  cycleDetected: boolean;
  hasMore: boolean;
  nextCursor: string | null;
};

export const CONFLICT_RESOLUTIONS = [
  { value: "merged",                label: "Merged",                blurb: "The two describe one employment and have been combined" },
  { value: "kept_separate",         label: "Kept separate",         blurb: "Genuinely different employments; both stand" },
  { value: "corrected",             label: "Corrected",             blurb: "One side was wrong and has been fixed" },
  { value: "dismissed",             label: "Dismissed",             blurb: "Not a real conflict" },
  { value: "superseded_the_legacy", label: "Superseded the legacy", blurb: "A legacy row gave way to the claimed one" },
] as const;

/**
 * The one conflict kind that is answered with a determination rather than a resolution.
 *
 * The generic resolutions close a dispute without saying what the employment status IS, which for
 * this kind is the worst available outcome: the queue item disappears, the moderator believes they
 * have answered, and the employment stays `disputed` for ever. A disputed record is deliberately
 * inert, so derivation will never rescue it either. Hence a separate control, and the generic one
 * withheld.
 */
export const EMPLOYMENT_STATUS_DISPUTE = "employment_status_dispute";

/**
 * The three answers a moderator may give.
 *
 * `disputed` is the state being left, not an answer to it, and offering it would let somebody
 * close a queue item by restating the problem. The server's DETERMINABLE list is the same three.
 *
 * No blurb names the freshness window in months. That policy lives in one place on the server
 * (EmploymentStatusResolver.FRESHNESS_MONTHS) and a number repeated here would be a second copy
 * that nobody updates.
 */
export const DETERMINABLE_STATUSES = [
  {
    value: "ongoing",
    label: "Current",
    blurb: "Still in the job as of the evidence date. Presents as Current while that evidence is "
         + "fresh, and as Unknown once it is not.",
  },
  {
    value: "ended",
    label: "Former",
    blurb: "Had already left by the evidence date. Presents as Former, and does not decay.",
  },
  {
    value: "unknown",
    label: "Unknown",
    blurb: "The evidence does not settle it. No employment label is shown, and because it asserts "
         + "nothing it carries no date.",
  },
] as const;

/** A stored employment status in the words the rest of the product uses. */
export function statusLabel(status: string | null): string {
  switch (status) {
    case "ongoing":  return "Current";
    case "ended":    return "Former";
    case "unknown":  return "Unknown";
    case "disputed": return "Disputed";
    default:         return status ?? "unknown";
  }
}

/** How a status came to be what it is, for a moderator reading a case. */
export function basisLabel(basis: string | null): string {
  switch (basis) {
    case "end_date":          return "from the employment record's end date";
    case "contributor_claim": return "from a contributor's claim";
    case "moderator":         return "determined by a moderator";
    case null:                return "nothing grounding it";
    default:                  return basis ?? "nothing grounding it";
  }
}

export type Determination = {
  status: string;
  /** As typed. "" means no date given, which is a real state and not a missing one. */
  asOf: string;
  note: string;
};

/** A calendar day, rejected rather than rolled over: 2026-02-30 is not a date. */
function parseDay(day: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function dayString(when: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
}

/**
 * The determination's own rules, asked before the request is sent.
 *
 * <b>This is not a security boundary and is not the authority.</b> ModerationService refuses every
 * one of these again, and the database refuses the grounding ones a third time through
 * `employment_status_is_grounded`. What it buys is a moderator being told which field is wrong
 * instead of being handed a 400 about a constraint.
 *
 * The rules are the server's, in the server's order: a real status, an asserting status carries
 * the date its evidence speaks to, `unknown` carries none because it asserts nothing, a date is a
 * real day and not in the future, and there is always a reason.
 *
 * @returns the message to show, or null when the determination may be sent
 */
export function validateDetermination(d: Determination, today = new Date()): string | null {
  const chosen = DETERMINABLE_STATUSES.find(s => s.value === d.status);
  if (!chosen) return "Choose what this employment status is.";

  const asOf = d.asOf.trim();
  if (chosen.value === "unknown" && asOf) {
    return "Unknown asserts nothing about anybody's employment, so it cannot carry an evidence "
         + "date.";
  }
  if (chosen.value !== "unknown" && !asOf) {
    return `${chosen.label} has to say what date the evidence speaks to.`;
  }
  if (asOf) {
    if (!parseDay(asOf)) return "The evidence date must be a real day, written as YYYY-MM-DD.";
    if (asOf > dayString(today)) return "Evidence cannot speak to a future date.";
  }
  if (!d.note.trim()) {
    return "A determination overrides what contributors said, so it must record why.";
  }
  return null;
}

/**
 * How many employment records this one decision answers, said out loud.
 *
 * The case-level scope is the single thing about this queue item that a moderator cannot guess
 * from the row, and getting it wrong in either direction matters: believing they answered one
 * record when they answered four, or leaving a sibling disputed because they thought they had to
 * answer each separately.
 *
 * Records in the case that are not disputed are counted separately and never folded in, because
 * the determination deliberately leaves them alone.
 */
export function describeDeterminationScope(cases: CaseEmployment[]): string {
  const disputed = cases.filter(c => c.willBeDetermined).length;
  const untouched = cases.length - disputed;
  const head = disputed === 0
    ? "No disputed employment record is left in this case."
    : disputed === 1
      ? "This answers the one disputed employment record in this case."
      : `This one answer applies to all ${disputed} disputed employment records in this case.`;
  if (untouched === 0) return head;
  return `${head} ${untouched === 1 ? "1 other record" : `${untouched} other records`} in the `
       + `case ${untouched === 1 ? "is" : "are"} not disputed and ${untouched === 1 ? "keeps" : "keep"} `
       + "the answer it already has.";
}

/** What a contributor's latest statement says about whether the manager was still there. */
export function describeStatusTestimony(c: ConflictClaim): string {
  if (c.stillThere === true) {
    return c.leftOn
      ? `Says the manager was still there when they left, in ${c.leftOn.slice(0, 7)}`
      : "Says the manager was still there, but gives no date of their own";
  }
  if (c.stillThere === false) {
    return c.leftOn
      ? `Says the manager had gone by ${c.leftOn.slice(0, 7)}`
      : "Says the manager was no longer there";
  }
  return "Says nothing about whether the manager was still there";
}

const base = `${API_BASE}/api/admin/moderation`;

export async function fetchQueueSummary(): Promise<QueueSummary> {
  const res = await axios.get(`${base}/summary`);
  return res.data as QueueSummary;
}

export async function fetchPendingEmployments(limit = 50, offset = 0): Promise<PendingEmployment[]> {
  const res = await axios.get(`${base}/employments`, { params: { limit, offset } });
  return (res.data?.data ?? []) as PendingEmployment[];
}

export async function fetchEmploymentDetail(roleId: number): Promise<EmploymentDetail> {
  const res = await axios.get(`${base}/employments/${roleId}`);
  return res.data as EmploymentDetail;
}

/**
 * Discard a held rating that nothing can release.
 *
 * Uses the review deletion an admin already has, with the reason recorded, so there is one way to
 * remove a rating rather than a second one invented for this queue. It is a soft delete.
 */
export async function discardHeldRating(reviewId: string): Promise<void> {
  await axios.delete(`${API_BASE}/api/admin/reviews/${reviewId}`, { data: { reason: "duplicate" } });
}

export async function acceptEmployment(roleId: number) {
  const res = await axios.post(`${base}/employments/${roleId}/accept`);
  return res.data as { roleId: number; state: string; alreadyDone: boolean; ratingsPublished: number };
}

export async function rejectEmployment(roleId: number, reason?: string) {
  const res = await axios.post(`${base}/employments/${roleId}/reject`, { reason: reason ?? null });
  return res.data as { roleId: number; state: string; alreadyDone: boolean; ratingsHeld: number };
}

export async function fetchConflicts(limit = 50, offset = 0): Promise<ConflictRow[]> {
  const res = await axios.get(`${base}/conflicts`, { params: { limit, offset } });
  return (res.data?.data ?? []) as ConflictRow[];
}

export async function fetchConflictDetail(conflictId: number): Promise<ConflictDetail> {
  const res = await axios.get(`${base}/conflicts/${conflictId}`);
  return res.data as ConflictDetail;
}

export async function resolveConflict(conflictId: number, resolution: string, note?: string) {
  const res = await axios.post(`${base}/conflicts/${conflictId}/resolve`, {
    resolution,
    note: note ?? null,
  });
  return res.data as {
    conflictId: number; alreadyDone: boolean;
    ratingsPublished: number; ratingsStillHeld: number;
  };
}

/**
 * Answer an employment-status dispute.
 *
 * Idempotent on the server: an already-answered dispute comes back as `alreadyDone` rather than
 * failing, so a double-click is reported and not a second decision. `rolesDetermined` is how many
 * employment records actually moved, which is the number worth telling the moderator because it is
 * the case-level consequence of one click.
 *
 * No rating changes state. An employment-status dispute never held one, so there is nothing to
 * release and nothing here reports a publication.
 */
export async function determineEmploymentStatus(
  conflictId: number, status: string, asOf: string | null, note: string,
) {
  const res = await axios.post(`${base}/conflicts/${conflictId}/determine-status`, {
    status,
    asOf: asOf && asOf.trim() ? asOf.trim() : null,
    note,
  });
  return res.data as {
    conflictId: number; alreadyDone: boolean;
    status?: string; asOf?: string | null; rolesDetermined: number;
  };
}

export async function linkClaimToRole(claimId: number, roleId: number) {
  const res = await axios.post(`${base}/claims/${claimId}/link`, { roleId });
  return res.data as {
    claimId: number; fromRoleId: number | null; toRoleId: number;
    alreadyDone: boolean; ratingsPublished: number;
  };
}

export async function mergeRoles(managerId: number, keepRoleId: number, supersededRoleId: number) {
  const res = await axios.post(`${base}/roles/merge`, { managerId, keepRoleId, supersededRoleId });
  return res.data as Record<string, unknown>;
}

export async function fetchHeldRatings(limit = 50, offset = 0): Promise<HeldRating[]> {
  const res = await axios.get(`${base}/held-ratings`, { params: { limit, offset } });
  return (res.data?.data ?? []) as HeldRating[];
}

/** "4 days", "3 weeks". The number that makes a neglected queue visible at a glance. */
export function waitingFor(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}

/** A period a moderator can read, including the honest "unknown". */
export function describePeriod(
  start: string | null, end: string | null, periodKnown: boolean,
): string {
  if (!periodKnown) return "Period not stated";
  if (!start) return "Period not stated";
  const from = start.slice(0, 7);
  return end ? `${from} to ${end.slice(0, 7)}` : `${from} to now`;
}

/**
 * Corroboration in words, counted honestly.
 *
 * Authenticated accounts and anonymous claims are never added together. Two anonymous claims may
 * be one person who cleared their cookies, and a moderator about to accept an employment ON the
 * strength of corroboration must not be handed a number that manufactures it.
 */
export function describeCorroboration(accounts: number, anonymous: number): string {
  const parts: string[] = [];
  if (accounts > 0) {
    parts.push(accounts === 1 ? "1 signed-in contributor" : `${accounts} signed-in contributors`);
  }
  if (anonymous > 0) {
    parts.push(anonymous === 1
      ? "1 anonymous claim (may not be a separate person)"
      : `${anonymous} anonymous claims (may not be separate people)`);
  }
  return parts.length ? parts.join(", ") : "No claims attached";
}

export async function correctEmployment(
  roleId: number, patch: EmploymentCorrection,
): Promise<CorrectionOutcome> {
  const res = await axios.post(`${base}/employments/${roleId}/correct`, patch);
  return res.data;
}

export async function reopenEmployment(roleId: number, reason: string): Promise<ReopenOutcome> {
  const res = await axios.post(`${base}/employments/${roleId}/reopen`, { reason });
  return res.data;
}

export async function fetchEmploymentHistory(
  roleId: number, cursor?: string | null, limit = 50,
): Promise<EmploymentHistory> {
  const res = await axios.get(`${base}/employments/${roleId}/history`, {
    params: { limit, ...(cursor ? { cursor } : {}) },
  });
  return res.data;
}

/** What an audit event says happened, in words rather than column names. */
export function describeEvent(e: HistoryEvent): string {
  switch (e.kind) {
    case "role_correction":
      return `Corrected ${fieldLabel(e.what)}`;
    case "claim_correction":
      return `Determination on a contributor's claim: ${fieldLabel(e.what)}`;
    case "claim_resolution":
      return `Claim ${e.what ?? "resolved"}`;
    case "manager_merge":
      return "Manager profiles merged";
    case "company_merge":
      return "Employer records merged";
    case "review_supersession":
      return "A rating was superseded";
    case "conflict":
      return `Conflict: ${(e.what ?? "").replace(/_/g, " ")}`;
    default:
      return e.kind;
  }
}

function fieldLabel(field: string | null): string {
  switch (field) {
    case "title":        return "job title";
    case "start_date":   return "start date";
    case "end_date":     return "end date";
    case "period_known": return "whether the dates are known";
    case "company_id":   return "employer";
    default:             return field ?? "a field";
  }
}

/**
 * Who, said accurately.
 *
 * <p>A platform event had nobody deciding it, which is not the same as an administrator whose
 * name is missing, and an author-reclaimed supersession deliberately records no identity at all.
 * Rendering any of these as "unknown" would misreport what the audit says.
 */
export function describeActor(e: HistoryEvent): string {
  switch (e.actorKind) {
    case "admin":     return e.by ?? "an administrator";
    case "platform":  return "the platform, automatically";
    case "author":    return "the contributor, not recorded by design";
    case "withdrawn": return "an administrator since deleted";
    default:          return "unknown";
  }
}
