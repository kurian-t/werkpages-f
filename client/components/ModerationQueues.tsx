import { useCallback, useEffect, useState } from "react";
import { RoleAutocomplete } from "@/components/RoleAutocomplete";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Clock, Gavel, GitMerge,
  History, Link2, Pencil, RotateCcw, Users, XCircle,
} from "lucide-react";
import {
  CONFLICT_RESOLUTIONS, CaseEmployment, ConflictDetail, ConflictRow,
  DETERMINABLE_STATUSES, EMPLOYMENT_STATUS_DISPUTE, EmploymentCorrection, EmploymentDetail,
  EmploymentHistory, HeldRating, HistoryEvent, PendingEmployment, QueueSummary, ReopenOutcome,
  acceptEmployment, basisLabel, correctEmployment, describeActor, describeCorroboration,
  discardHeldRating,
  describeDeterminationScope, describeEvent, describePeriod, describeStatusTestimony,
  determineEmploymentStatus, fetchConflictDetail, fetchConflicts, fetchEmploymentDetail,
  fetchEmploymentHistory, fetchHeldRatings, fetchPendingEmployments, fetchQueueSummary,
  linkClaimToRole, mergeRoles, rejectEmployment, reopenEmployment, resolveConflict, statusLabel,
  validateDetermination, waitingFor,
} from "@/lib/moderation";

/**
 * The three moderation queues, as one component per queue.
 *
 * Rev 268 phase 4C. The point of this screen is that a moderator can answer "why is this rating
 * not public, and what would make it public" without opening a database client. So every row
 * states the reason and the action, and the reason comes from the server - which asks the same
 * publication predicate the submission path asks - rather than being re-derived here. A second
 * opinion about eligibility rendered in the browser would eventually disagree with the database,
 * and the disagreement would decide whether somebody's rating appeared.
 *
 * Nothing here is an authorization boundary. Every call fails with 401 or 403 for a non-admin
 * whatever this renders.
 */

// ── shared bits ────────────────────────────────────────────────────────────────

function Waiting({ since }: { since: string | null }) {
  const label = waitingFor(since);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" aria-hidden="true" />
      waiting {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Loading() {
  return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>;
}

/** The manager, linked, so a moderator can see who this is actually about. */
function ManagerLink({ id, slug, name }: { id: number; slug?: string | null; name: string }) {
  return (
    <Link
      to={slug ? `/manager/${slug}` : `/manager/${id}`}
      className="font-medium text-primary hover:underline"
    >
      {name}
    </Link>
  );
}

function Pill({ tone, children }: { tone: "warn" | "info" | "good" | "bad"; children: React.ReactNode }) {
  const tones = {
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    bad:  "bg-red-500/15 text-red-700 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * The counts for the tab badges.
 *
 * Re-read on demand rather than cached, because a stale count is how two moderators end up
 * working the same row.
 */
export function useModerationSummary() {
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const reload = useCallback(() => {
    fetchQueueSummary().then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { summary, reload };
}

// ── queue 1: proposed employments ──────────────────────────────────────────────

export function ProposedEmploymentsQueue({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<PendingEmployment[] | null>(null);
  const [openRole, setOpenRole] = useState<number | null>(null);

  const load = useCallback(() => {
    setRows(null);
    fetchPendingEmployments()
      .then(setRows)
      .catch(() => { setRows([]); toast.error("Could not load proposed employments"); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  if (rows === null) return <Loading />;
  if (rows.length === 0) {
    return <Empty>No employments are waiting for a decision.</Empty>;
  }

  return (
    <div className="space-y-3" data-testid="moderation-employments-panel">
      <p className="text-sm text-muted-foreground">
        Somebody said they worked for this person in a job the platform does not hold. Their rating
        is held, not discarded, until this is decided.
      </p>
      {rows.map(row => (
        <div key={row.roleId} data-testid={`employment-row-${row.roleId}`} className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setOpenRole(openRole === row.roleId ? null : row.roleId)}
            aria-expanded={openRole === row.roleId}
            aria-label={`Review proposed job: ${row.title} at ${row.company} for ${row.managerName}`}
            className="flex w-full items-start gap-3 p-4 text-left"
          >
            {openRole === row.roleId
              ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{row.title}</span>
                <span className="text-sm text-muted-foreground">at {row.company}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                for {row.managerName}
                {" · "}
                {describePeriod(row.startDate, row.endDate, row.periodKnown)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill tone="info">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {describeCorroboration(row.corroboratingAccounts, row.anonymousClaims)}
                </Pill>
                {row.heldRatings > 0 && (
                  <Pill tone="warn">
                    {row.heldRatings === 1 ? "1 rating held" : `${row.heldRatings} ratings held`}
                  </Pill>
                )}
                {/* Accepting will NOT publish these. Saying so here stops a moderator
                    expecting an outcome their click cannot deliver. */}
                {row.blockingConflicts > 0 && (
                  <Pill tone="bad">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    also blocked by a conflict
                  </Pill>
                )}
                <Waiting since={row.proposedAt} />
              </div>
            </div>
          </button>
          {openRole === row.roleId && (
            <EmploymentDetailPanel roleId={row.roleId} onChanged={changed} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── correcting a canonical employment ──────────────────────────────────────────

/**
 * What the platform asserts, beside what each contributor said.
 *
 * <p>Two columns on purpose. The left is evidence and is never editable: a finalized claim's
 * assertion is what that person said, and `claim_assertion_is_immutable` refuses to rewrite it.
 * The right is the canonical employment, which is what the directory shows and what an
 * administrator may correct. Conflating them is how a contributor's words get quietly replaced
 * by a moderator's conclusion.
 *
 * <p>Only fields the moderator actually CHANGED are sent, because the API reads a key's presence:
 * an absent endDate means "leave it", and an explicit null means "no recorded end date". Sending
 * every field every time would make those indistinguishable.
 */
function CorrectionForm({
  detail, onDone,
}: { detail: EmploymentDetail; onDone: (published: number, accepted: boolean) => void }) {
  const live = detail.employment;
  const [title, setTitle] = useState(live.title ?? "");
  const [start, setStart] = useState(live.startDate ?? "");
  const [end, setEnd] = useState(live.endDate ?? "");
  const [known, setKnown] = useState(live.periodKnown);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = () => {
    const p: EmploymentCorrection = { reason: reason.trim() };
    if (title.trim() !== (live.title ?? "")) p.title = title.trim();
    if ((start || "") !== (live.startDate ?? "")) p.startDate = start || null;
    if ((end || "") !== (live.endDate ?? "")) p.endDate = end || null;
    if (known !== live.periodKnown) p.periodKnown = known;
    return p;
  };
  const changedCount = Object.keys(patch()).length - 1;

  const save = async (thenAccept: boolean) => {
    if (!reason.trim()) { toast.error("A correction needs a reason"); return; }
    setBusy(true);
    try {
      const res = await correctEmployment(live.roleId, { ...patch(), thenAccept });
      toast.success(
        res.fieldsCorrected === 0 && !thenAccept
          ? "Nothing changed, so nothing was recorded."
          : `${res.fieldsCorrected} field${res.fieldsCorrected === 1 ? "" : "s"} corrected`
            + (res.accepted ? ", employment accepted" : "")
            + (res.ratingsPublished > 0
               ? `, ${res.ratingsPublished} rating${res.ratingsPublished === 1 ? "" : "s"} now public`
               : ""),
      );
      onDone(res.ratingsPublished, res.accepted);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not correct that employment");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid={`correction-form-${live.roleId}`}>
      <div className="rounded-lg bg-muted/40 p-3">
        {/*
          CLAIMS, NOT PEOPLE. Several contributors can describe the same job differently, and that
          disagreement is the finding rather than something to tidy away - so every assertion is
          listed, because showing one as though it spoke for everybody is how a moderator corrects
          against evidence they have not seen.

          But the heading counts CLAIMS. Three anonymous claims may be one visitor three times,
          and calling them three contributors would manufacture corroboration the platform has not
          established. The split is shown instead: claims from signed-in accounts are distinct
          people, because one contributor may hold only one claim per employment; anonymous claims
          are only claims. No identity is shown either way.
        */}
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          {detail.claims.length === 1
            ? "1 employment claim"
            : `${detail.claims.length} employment claims`}
        </p>
        {detail.claims.length > 0 && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="claim-provenance-split">
            {(() => {
              const accounts = detail.claims.filter(c => c.fromAccount).length;
              const anonymous = detail.claims.length - accounts;
              const parts: string[] = [];
              if (accounts > 0) {
                parts.push(`${accounts} from signed-in account${accounts === 1 ? "" : "s"}`);
              }
              if (anonymous > 0) {
                parts.push(`${anonymous} anonymous claim${anonymous === 1 ? "" : "s"}`
                           + (anonymous > 1 ? ", which may not be separate people" : ""));
              }
              return parts.join(" · ");
            })()}
          </p>
        )}
        {detail.claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No claim: this employment was imported rather than reported.
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.claims.map(c => (
              <li key={c.claimId} className="text-sm" data-testid={`asserted-${c.claimId}`}>
                <span className="font-medium text-foreground">
                  {c.assertedTitle ?? "no title given"}
                </span>
                <span className="text-muted-foreground">
                  {" · "}{describePeriod(c.assertedStart, c.assertedEnd, c.periodKnown)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {c.fromAccount ? "from an account" : "anonymous"}
                  {c.ratings > 0 ? ` · ${c.ratings} rating${c.ratings === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Never edited. What somebody said stays on the record whatever the platform concludes.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
        <p className="mb-2 text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
          Canonical employment
        </p>
        <label className="block text-xs text-muted-foreground">
          Job title
          <RoleAutocomplete
            value={title}
            onChange={(v) => setTitle(v)}
            placeholder="e.g. Engineering Manager"
            maxLength={100}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            testId={`correct-title-${live.roleId}`}
          />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted-foreground">
            Started
            <input
              type="date" value={start}
              onChange={e => setStart(e.target.value)}
              data-testid={`correct-start-${live.roleId}`}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Ended
            <input
              type="date" value={end}
              onChange={e => setEnd(e.target.value)}
              data-testid={`correct-end-${live.roleId}`}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        {/*
          NOT a "currently employed" checkbox. The platform holds no verified statement that
          anybody works anywhere today: employment_status is unimplemented, and a contributor's
          still_there is their account of when THEY left. So the two things the schema can
          actually express are offered, and nothing else is implied.
        */}
        <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox" checked={known}
            onChange={e => setKnown(e.target.checked)}
            data-testid={`correct-known-${live.roleId}`}
            className="mt-0.5"
          />
          <span>
            The dates are established.
            {/*
              DELIBERATELY NOT "still employed". An absent end date means no end date has been
              RECORDED, which is not evidence that the person works there today. The platform
              holds no verified statement of current employment: employment_status is
              unimplemented, and a contributor's still_there is their account of when THEY left.
              Saying "still running" here would assert something nobody has established.
            */}
            <span className="block">
              Unchecked means the employment period is unknown. Checked with the end date left
              blank means no end date has been recorded, which is not the same as confirming the
              person is still employed there.
            </span>
          </span>
        </label>
        <label className="mt-2 block text-xs text-muted-foreground">
          Why (recorded in the history, required)
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. confirmed against the employer directory"
            data-testid={`correct-reason-${live.roleId}`}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy || !reason.trim() || changedCount === 0}
            onClick={() => save(false)}
            data-testid={`save-correction-${live.roleId}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Save correction
          </button>
          {live.state === "proposed" && (
            <button
              disabled={busy || !reason.trim()}
              onClick={() => save(true)}
              data-testid={`save-and-accept-${live.roleId}`}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Save and accept
            </button>
          )}
          <span className="self-center text-xs text-muted-foreground">
            {changedCount === 0
              ? "No change yet"
              : `${changedCount} field${changedCount === 1 ? "" : "s"} will change`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── reopening a rejection ──────────────────────────────────────────────────────

/**
 * A rejection is not undone, it is SUPERSEDED by a fresh proposal.
 *
 * <p>The rejected row stays rejected and the new one records what it came from, so the decision
 * remains on the record. Nothing is republished: the new employment has no claims, so there is
 * nothing for the publication predicate to say yes to, and the claims still attached to the
 * rejection are listed here with a link action rather than moved automatically. Which of them
 * belongs to the reopened employment is a judgement, and moving them would publish ratings
 * nobody agreed to publish.
 */
function ReopenPanel({ roleId, onChanged }: { roleId: number; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReopenOutcome | null>(null);

  const reopen = async () => {
    if (!reason.trim()) { toast.error("Reopening needs a reason"); return; }
    setBusy(true);
    try {
      const res = await reopenEmployment(roleId, reason.trim());
      setOutcome(res);
      toast.success("Reopened as a fresh proposal. The rejection stays on the record.");
      /*
        onChanged() is NOT called here, and that is the fix rather than an oversight.
        It refreshes the surrounding screen, which re-renders this subtree and discards the
        outcome with it - so the list of claims still attached to the rejection appeared and
        vanished in the same instant, leaving the moderator with no way to finish except by
        looking the ids up in the database. The refresh happens when they dismiss the panel,
        by which point they have acted on it.
      */
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not reopen that employment");
    } finally { setBusy(false); }
  };

  const reconcile = async (claimId: number, target: number) => {
    setBusy(true);
    try {
      const res = await linkClaimToRole(claimId, target);
      toast.success(
        res.ratingsPublished > 0
          ? `Linked. ${res.ratingsPublished} rating${res.ratingsPublished === 1 ? "" : "s"} now public.`
          : "Linked. The rating is still held by something else.",
      );
      // Same reason: the remaining list is what the moderator is working through.
      setOutcome(o => o
        ? { ...o, claimsToReconcile: o.claimsToReconcile.filter(c => c.claimId !== claimId) }
        : o);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not link that claim");
    } finally { setBusy(false); }
  };

  if (outcome) {
    return (
      <div className="rounded-lg border border-border bg-card p-3"
           data-testid={`reopened-${roleId}`}>
        <p className="text-sm">
          Reopened as employment <span className="font-medium">#{outcome.roleId}</span>, from the
          rejection #{outcome.reopenedFrom}, which still stands.
        </p>
        <button
          onClick={() => { setOutcome(null); setReason(""); onChanged(); }}
          data-testid={`reopened-done-${roleId}`}
          className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          Done with this
        </button>
        {outcome.claimsToReconcile.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing was attached to the rejection, so there is nothing left to reconcile.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">
              Still attached to the rejection
            </p>
            <ul className="mt-1 space-y-2">
              {outcome.claimsToReconcile.map(c => (
                <li key={c.claimId}
                    data-testid={`reconcile-claim-${c.claimId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
                  <span className="text-sm">
                    {c.assertedTitle ?? "no title"}
                    <span className="text-muted-foreground">
                      {" · "}{describePeriod(c.assertedStart, c.assertedEnd, c.periodKnown)}
                      {c.ratings > 0 ? ` · ${c.ratings} rating${c.ratings === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => reconcile(c.claimId, outcome.roleId)}
                    data-testid={`reconcile-${c.claimId}-to-${outcome.roleId}`}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    Link to the reopened employment
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Each one is a decision. Linking a claim is what releases its rating, if nothing else
              is in the way.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Why this rejection should be reopened"
        data-testid={`reopen-reason-${roleId}`}
        className="min-w-[14rem] flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm"
      />
      <button
        disabled={busy || !reason.trim()}
        onClick={reopen}
        data-testid={`reopen-employment-${roleId}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reopen as a fresh proposal
      </button>
      <span className="text-xs text-muted-foreground">
        The rejection stays. No rating is republished by reopening.
      </span>
    </div>
  );
}

// ── the audit timeline ─────────────────────────────────────────────────────────

/**
 * What has happened to this employment, oldest reachable through Load older.
 *
 * <p>Two different completeness answers are shown separately, because they are different
 * questions: whether every predecessor employment was found, and whether every event was
 * returned. A page that labelled itself complete while omitting the oldest events is how somebody
 * concludes a correction never happened.
 */
function AuditTimeline({ roleId }: { roleId: number }) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [page, setPage] = useState<EmploymentHistory | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFirst = useCallback(() => {
    setEvents([]);
    fetchEmploymentHistory(roleId, null, 25)
      .then(p => { setPage(p); setEvents(p.events); })
      .catch(() => toast.error("Could not load that history"));
  }, [roleId]);
  useEffect(() => { loadFirst(); }, [loadFirst]);

  const older = async () => {
    if (!page?.nextCursor) return;
    setBusy(true);
    try {
      const next = await fetchEmploymentHistory(roleId, page.nextCursor, 25);
      setPage(next);
      setEvents(e => [...e, ...next.events]);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not load older history");
    } finally { setBusy(false); }
  };

  if (!page) return <Loading />;

  return (
    <div data-testid={`history-${roleId}`}>
      <p className="text-xs text-muted-foreground">
        {page.employmentsInScope > 1
          ? `Includes ${page.employmentsInScope - 1} absorbed employment${page.employmentsInScope === 2 ? "" : "s"}.`
          : "This employment only."}
        {!page.lineageComplete && (
          <span className="ml-1 font-medium text-amber-700" data-testid={`history-incomplete-${roleId}`}>
            The lineage contains a cycle, so this is not the whole ancestry.
          </span>
        )}
      </p>
      {events.length === 0 ? (
        <Empty>Nothing has been done to this employment yet.</Empty>
      ) : (
        <ol className="mt-2 space-y-2">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`}
                data-testid={`history-event-${i}`}
                className="rounded-md border border-border bg-card p-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{describeEvent(e)}</span>
                <span className="text-xs text-muted-foreground">
                  {e.at ? new Date(e.at).toLocaleString() : "no date"}
                </span>
              </div>
              {(e.was || e.nowIs) && (
                <p className="mt-0.5 text-xs">
                  <span className="text-muted-foreground line-through">{e.was ?? "nothing"}</span>
                  {" \u2192 "}
                  <span className="font-medium">{e.nowIs ?? "nothing"}</span>
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                by {describeActor(e)}
                {e.reason ? ` · ${e.reason}` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
                {!e.onThisRole && e.roleId
                  ? ` · on absorbed employment #${e.roleId}`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      {page.hasMore && (
        <button
          disabled={busy}
          onClick={older}
          data-testid={`history-load-older-${roleId}`}
          className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          Load older events
        </button>
      )}
      {/*
        BOTH bounds, or neither claim. Pagination being exhausted says every event in scope was
        returned; lineage completeness says the scope was right. A cyclic lineage with a finished
        page is still a partial history, and saying otherwise is how somebody concludes a
        correction never happened.
      */}
      {!page.hasMore && events.length > 0 && (
        page.lineageComplete ? (
          <p className="mt-2 text-xs text-muted-foreground">That is the whole history.</p>
        ) : (
          <p className="mt-2 text-xs font-medium text-amber-700"
             data-testid={`history-partial-${roleId}`}>
            Every event for the employments found is shown, but the lineage contains a cycle, so
            there may be earlier employments this cannot reach.
          </p>
        )
      )}
    </div>
  );
}

function EmploymentDetailPanel({ roleId, onChanged }: { roleId: number; onChanged: () => void }) {
  const [detail, setDetail] = useState<EmploymentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    setDetail(null);
    fetchEmploymentDetail(roleId)
      .then(setDetail)
      .catch(() => toast.error("Could not load that employment"));
  }, [roleId]);
  useEffect(() => { load(); }, [load]);

  if (!detail) return <Loading />;

  const accept = async () => {
    setBusy(true);
    try {
      const res = await acceptEmployment(roleId);
      if (res.alreadyDone) toast.info("That employment was already accepted");
      else if (res.ratingsPublished > 0) {
        toast.success(
          res.ratingsPublished === 1
            ? "Accepted. 1 rating is now public."
            : `Accepted. ${res.ratingsPublished} ratings are now public.`,
        );
      } else {
        // Honest about the no-op: something else is still in the way.
        toast.success("Accepted. No rating became public yet, something else is still blocking.");
      }
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not accept that employment");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    setBusy(true);
    try {
      const res = await rejectEmployment(roleId, reason.trim() || undefined);
      if (res.alreadyDone) toast.info("That employment was already rejected");
      else toast.success("Rejected. The ratings stay held and are not deleted.");
      setRejecting(false); setReason("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not reject that employment");
    } finally { setBusy(false); }
  };

  const link = async (claimId: number, targetRoleId: number) => {
    setBusy(true);
    try {
      const res = await linkClaimToRole(claimId, targetRoleId);
      toast.success(
        res.ratingsPublished > 0
          ? `Linked. ${res.ratingsPublished} rating${res.ratingsPublished === 1 ? "" : "s"} now public.`
          : "Linked. The rating is still held by something else.",
      );
      onChanged(); load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not link that claim");
    } finally { setBusy(false); }
  };

  const merge = async (keepRoleId: number) => {
    setBusy(true);
    try {
      await mergeRoles(detail.employment.managerId, keepRoleId, roleId);
      toast.success("Merged into the existing employment.");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not merge those employments");
    } finally { setBusy(false); }
  };

  const linkable = detail.managerHistory.filter(r => r.state === "accepted" || r.state === "proposed");

  return (
    <div className="border-t border-border p-4 space-y-5">
      {/* What was asserted, by how many, and whether an account stands behind it. */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">What people said</h4>
        {detail.claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">No claims resolve to this employment.</p>
        ) : (
          <ul className="space-y-2">
            {detail.claims.map(c => (
              <li key={c.claimId} className="rounded-md border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.assertedTitle ?? "(no title given)"}</span>
                  <span className="text-muted-foreground">
                    {describePeriod(c.assertedStart, c.assertedEnd, c.periodKnown)}
                  </span>
                  {c.fromAccount
                    ? <Pill tone="good">signed in</Pill>
                    : <Pill tone="info">anonymous</Pill>}
                  {c.ratings > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {c.ratings === 1 ? "1 rating" : `${c.ratings} ratings`}
                    </span>
                  )}
                </div>
                {linkable.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Same as an employment already held?
                    </span>
                    {linkable.map(r => (
                      <button
                        key={r.roleId}
                        disabled={busy}
                        data-testid={`link-claim-${c.claimId}-to-${r.roleId}`}
                        onClick={() => link(c.claimId, r.roleId)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        <Link2 className="h-3 w-3" aria-hidden="true" />
                        {r.title} at {r.company}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The ratings this decision is actually about. */}
      {detail.heldRatings.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">
            {detail.heldRatings.length === 1
              ? "1 rating waiting on this"
              : `${detail.heldRatings.length} ratings waiting on this`}
          </h4>
          <ul className="space-y-1 text-sm">
            {detail.heldRatings.map(r => (
              <li key={r.reviewId} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.overallRating ?? "-"}/5</span>
                <span className="text-muted-foreground">{r.title} at {r.company}</span>
                <Waiting since={r.submittedAt} />
                {!r.wouldPublishNow && (
                  <Pill tone="bad">accepting alone will not publish this</Pill>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The question a moderator is really answering: do we already hold this job? */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Employment already held for this person</h4>
        {detail.managerHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">None. This would be their first.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detail.managerHistory.map(r => (
              <li key={r.roleId} className="flex flex-wrap items-center gap-2">
                <span>{r.title} at {r.company}</span>
                <span className="text-muted-foreground">
                  {describePeriod(r.startDate, r.endDate, r.periodKnown)}
                </span>
                <Pill tone={r.state === "accepted" ? "good" : "info"}>{r.state}</Pill>
                {r.state === "accepted" && (
                  <button
                    disabled={busy}
                    data-testid={`merge-into-${r.roleId}`}
                    onClick={() => merge(r.roleId)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <GitMerge className="h-3 w-3" aria-hidden="true" />
                    Merge this proposal into it
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        CORRECT, THEN ACCEPT, without leaving the queue. A legitimate employment should not be
        rejected because the contributor mistyped a date, and the two steps run in one
        transaction so the employment is never briefly live with the values just corrected.
      */}
      {(detail.employment.state === "proposed" || detail.employment.state === "accepted") && (
        <section className="border-t border-border pt-4">
          {correcting ? (
            <CorrectionForm
              detail={detail}
              onDone={() => { setCorrecting(false); onChanged(); load(); }}
            />
          ) : (
            <button
              data-testid={`correct-employment-${roleId}`}
              onClick={() => setCorrecting(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Correct the title or dates
            </button>
          )}
        </section>
      )}

      {detail.employment.state === "rejected" && (
        <section className="border-t border-border pt-4">
          {/*
            onChanged ONLY, deliberately no load().

            load() clears `detail` while it refetches, which unmounts this subtree and throws away
            the reopen outcome with it - so the moderator would watch the list of outstanding
            claims vanish the moment it appeared, which is the SQL dependency this was meant to
            remove. Not reloading is also the truthful reading: reopening does not change THIS
            row. The rejection still stands, and the fresh proposal is a different employment
            that the queue will show on its own.
          */}
          <ReopenPanel roleId={roleId} onChanged={onChanged} />
        </section>
      )}

      <section className="border-t border-border pt-4">
        <button
          data-testid={`toggle-history-${roleId}`}
          onClick={() => setShowHistory(h => !h)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          {showHistory ? "Hide history" : "History of this employment"}
        </button>
        {showHistory && <div className="mt-3"><AuditTimeline roleId={roleId} /></div>}
      </section>

      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          disabled={busy}
          data-testid={`accept-employment-${roleId}`}
          onClick={accept}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          Accept employment
        </button>
        {rejecting ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why (optional)"
              className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
            <button
              disabled={busy}
              data-testid={`confirm-reject-${roleId}`}
              onClick={reject}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              onClick={() => { setRejecting(false); setReason(""); }}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            disabled={busy}
            data-testid={`reject-employment-${roleId}`}
            onClick={() => setRejecting(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Reject
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Rejecting keeps the rating. It is held, never deleted, and linking the claim elsewhere
          later releases it.
        </span>
      </section>
    </div>
  );
}

// ── queue 2: conflicts ─────────────────────────────────────────────────────────

export function ConflictsQueue({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<ConflictRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setRows(null);
    fetchConflicts()
      .then(setRows)
      .catch(() => { setRows([]); toast.error("Could not load conflicts"); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  if (rows === null) return <Loading />;
  if (rows.length === 0) return <Empty>No open conflicts.</Empty>;

  return (
    <div className="space-y-3" data-testid="moderation-conflicts-panel">
      <p className="text-sm text-muted-foreground">
        Two descriptions that might be one employment. A blocking conflict holds the rating of the
        claim it is about; an informational one does not.
      </p>
      {rows.map(row => (
        <div key={row.conflictId} data-testid={`conflict-row-${row.conflictId}`} className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setOpen(open === row.conflictId ? null : row.conflictId)}
            aria-expanded={open === row.conflictId}
            aria-label={`Resolve conflict ${row.conflictId}: ${row.kind.replace(/_/g, " ")}`}
            className="flex w-full items-start gap-3 p-4 text-left"
          >
            {open === row.conflictId
              ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.kind.replace(/_/g, " ")}</span>
                {row.blocksPublication
                  ? <Pill tone="bad"><AlertTriangle className="h-3 w-3" aria-hidden="true" />blocks publication</Pill>
                  : <Pill tone="info">informational</Pill>}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {row.managerName ?? "(manager unknown)"}
                {row.companyName ? ` at ${row.companyName}` : ""}
                {row.title ? ` · ${row.title}` : ""}
                {row.period ? ` · ${row.period}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* The distinction that decides whether a rating is held at all. */}
                <span className="text-xs text-muted-foreground">
                  {row.subjectClaims} in doubt, {row.evidenceClaims} cited as evidence
                </span>
                {row.heldRatings > 0 && (
                  <Pill tone="warn">
                    {row.heldRatings === 1 ? "1 rating held" : `${row.heldRatings} ratings held`}
                  </Pill>
                )}
                <Waiting since={row.detectedAt} />
              </div>
            </div>
          </button>
          {open === row.conflictId && (
            <ConflictDetailPanel conflictId={row.conflictId} onChanged={changed} />
          )}
        </div>
      ))}
    </div>
  );
}

function ConflictDetailPanel({ conflictId, onChanged }: { conflictId: number; onChanged: () => void }) {
  const [detail, setDetail] = useState<ConflictDetail | null>(null);
  const [resolution, setResolution] = useState<string>("kept_separate");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setDetail(null);
    fetchConflictDetail(conflictId)
      .then(setDetail)
      .catch(() => toast.error("Could not load that conflict"));
  }, [conflictId]);
  useEffect(() => { load(); }, [load]);

  if (!detail) return <Loading />;

  // The one kind whose decision is case-level and is an ANSWER rather than a resolution.
  const isStatusDispute = detail.kind === EMPLOYMENT_STATUS_DISPUTE;
  const cases: CaseEmployment[] = detail.caseEmployments ?? [];

  const resolve = async () => {
    setBusy(true);
    try {
      const res = await resolveConflict(conflictId, resolution, note.trim() || undefined);
      if (res.alreadyDone) toast.info("That conflict was already resolved");
      else if (res.ratingsPublished > 0) {
        toast.success(
          `Resolved. ${res.ratingsPublished} rating${res.ratingsPublished === 1 ? "" : "s"} now public`
          + (res.ratingsStillHeld > 0 ? `, ${res.ratingsStillHeld} still held by something else.` : "."),
        );
      } else if (res.ratingsStillHeld > 0) {
        // Why the click appeared to do nothing.
        toast.success(
          `Resolved. ${res.ratingsStillHeld} rating${res.ratingsStillHeld === 1 ? " is" : "s are"} still held by something else.`,
        );
      } else {
        toast.success("Resolved.");
      }
      setNote("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not resolve that conflict");
    } finally { setBusy(false); }
  };

  const merge = async (keepRoleId: number, supersededRoleId: number) => {
    if (!detail.managerId) return;
    setBusy(true);
    try {
      await mergeRoles(detail.managerId, keepRoleId, supersededRoleId);
      toast.success("Employments merged. Claims and ratings followed the redirection.");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not merge those employments");
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-border p-4 space-y-5">
      {isStatusDispute && <CaseRecords cases={cases} />}
      <section>
        <h4 className="mb-2 text-sm font-semibold">
          {isStatusDispute ? "What the contributors say" : "The claims involved"}
        </h4>
        <ul className="space-y-2">
          {detail.claims.map(c => (
            <li key={`${c.claimId}-${c.role}`} className="rounded-md border border-border/60 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {/* Subject or evidence, stated plainly: only a subject's rating is held. */}
                {c.role === "subject"
                  ? <Pill tone="bad">in doubt</Pill>
                  : <Pill tone="info">evidence only</Pill>}
                <span className="font-medium">{c.assertedTitle ?? "(no title given)"}</span>
                <span className="text-muted-foreground">
                  {describePeriod(c.assertedStart, c.assertedEnd, c.periodKnown)}
                </span>
                {c.fromAccount
                  ? <Pill tone="good">signed in</Pill>
                  : <Pill tone="info">anonymous</Pill>}
                {c.withdrawn && <Pill tone="warn">withdrawn</Pill>}
                {c.heldRatings > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {c.heldRatings === 1 ? "1 rating held" : `${c.heldRatings} ratings held`}
                  </span>
                )}
              </div>
              {/*
                The assertion a status dispute actually turns on, and only for that kind: the
                other kinds are about which employment a claim describes, where this line would
                be noise. It is the LATEST statement, so a contributor who has since revised
                their recollection is read as they now stand.
              */}
              {isStatusDispute && (
                <p
                  data-testid={`status-evidence-${c.claimId}`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {describeStatusTestimony(c)}
                  {c.restated && " (restated later)"}
                  {c.withdrawn && " - withdrawn, so it no longer grounds a status"}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* The two employments in question, merged through the real merge service. */}
      {detail.roleId && detail.otherRoleId && detail.managerId && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Same employment?</h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Merging keeps one and points the other at it. Claims are redirected with the change
            audited, and no rating is discarded.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => merge(detail.roleId!, detail.otherRoleId!)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <GitMerge className="h-3 w-3" aria-hidden="true" />
              Keep #{detail.roleId}, merge #{detail.otherRoleId} into it
            </button>
            <button
              disabled={busy}
              onClick={() => merge(detail.otherRoleId!, detail.roleId!)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <GitMerge className="h-3 w-3" aria-hidden="true" />
              Keep #{detail.otherRoleId}, merge #{detail.roleId} into it
            </button>
          </div>
        </section>
      )}

      {/*
        WHICH DECISION THIS KIND TAKES.

        An employment-status dispute is answered, not resolved. The five generic resolutions all
        close the queue item without saying what the status IS, and a closed dispute whose
        employment is still 'disputed' is the worst outcome available: the moderator believes they
        answered, the task is gone, the profile shows no label for ever, and a disputed record is
        deliberately inert so derivation never rescues it. "Unknown" is the honest version of
        dismissing it, and it is one of the three answers below.

        Every other kind keeps exactly the control it had.
      */}
      {isStatusDispute ? (
        <StatusDetermination conflictId={conflictId} cases={cases} onChanged={onChanged} />
      ) : (
      <section className="border-t border-border pt-4">
        <h4 className="mb-2 text-sm font-semibold">Record a decision</h4>
        <div className="space-y-2">
          {CONFLICT_RESOLUTIONS.map(r => (
            <label key={r.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`resolution-${conflictId}`}
                value={r.value}
                checked={resolution === r.value}
                onChange={() => setResolution(r.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm"
          />
          <button
            disabled={busy}
            data-testid={`resolve-conflict-${conflictId}`}
            onClick={resolve}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            Resolve
          </button>
        </div>
      </section>
      )}
    </div>
  );
}

/**
 * The case this dispute covers, and what each record in it currently says.
 *
 * <p>The one thing about this queue item a moderator cannot guess from the row is that the
 * decision is case-level. An unknown-period employment can legitimately be several rows -
 * career_unique_known_employment only stops duplicates when the period is known - and detection
 * disputes each of them under one queue item, so one answer moves all of them.
 *
 * <p>Records in the case that are NOT disputed are listed as well, because the determination
 * leaves them alone. One may already carry an earlier determination, and a moderator should see
 * that before concluding the case is unanimous.
 */
function CaseRecords({ cases }: { cases: CaseEmployment[] }) {
  return (
    <section data-testid="dispute-case-records">
      <h4 className="mb-2 text-sm font-semibold">The employment records in this case</h4>
      {/*
        The sentence is rendered even when the list is empty, which is reachable: a merge or
        another moderator's determination can empty a case while this queue item is still open on
        somebody's screen. Rendering nothing would leave them to conclude from silence.
      */}
      <p className="mb-2 text-xs text-muted-foreground" data-testid="dispute-case-scope">
        {describeDeterminationScope(cases)}
      </p>
      <ul className="space-y-2">
        {cases.map(c => (
          <li
            key={c.roleId}
            data-testid={`case-role-${c.roleId}`}
            data-will-be-determined={c.willBeDetermined ? "yes" : "no"}
            className="rounded-md border border-border/60 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              {c.willBeDetermined
                ? <Pill tone="warn">this answer applies</Pill>
                : <Pill tone="info">not disputed, left alone</Pill>}
              <span className="font-medium">{c.title ?? "(no title recorded)"}</span>
              <span className="text-muted-foreground">
                {describePeriod(c.startDate, c.endDate, c.periodKnown)}
              </span>
              <span className="text-xs text-muted-foreground">#{c.roleId}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Currently {statusLabel(c.employmentStatus)}, {basisLabel(c.statusBasis)}
              {c.statusAsOf ? `, speaking to ${c.statusAsOf.slice(0, 10)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The moderator's answer to an employment-status dispute.
 *
 * <h2>Why the date is asked for separately from the decision</h2>
 *
 * <p>status_as_of is the date the EVIDENCE speaks to, never the date of the decision. A moderator
 * reading a 2021 employment letter is establishing a fact about 2021, and recording today's date
 * would assert the manager was there this morning. The server will not accept an asserting status
 * without it, and will not accept one on Unknown, which asserts nothing.
 *
 * <h2>Validation</h2>
 *
 * <p>The rules are validateDetermination's, which are the server's rules in the server's order.
 * The button stays enabled and clicking it produces the message, because a disabled button with
 * no explanation is the version a moderator cannot get past. Nothing here is a security boundary:
 * ModerationService refuses all of it again, and the database refuses the grounding rules a third
 * time.
 */
function StatusDetermination({
  conflictId, cases, onChanged,
}: { conflictId: number; cases: CaseEmployment[]; onChanged: () => void }) {
  const [status, setStatus] = useState("");
  const [asOf, setAsOf] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  const problem = validateDetermination({ status, asOf, note });
  // How many records this click moves, said ON the button as well as in the panel above it. The
  // scope sentence explains the case; this is the number at the moment of deciding.
  const scope = cases.filter(c => c.willBeDetermined).length;

  const submit = async () => {
    if (problem) { setAsked(true); return; }
    // Belt and braces against a double click: the button is disabled while in flight AND the
    // second call returns here. The server is idempotent on the conflict's resolved_at, so the
    // worst case was already a report rather than a second decision, but a second request would
    // still toast twice and tell the moderator two different things happened.
    if (busy) return;
    setBusy(true);
    try {
      const res = await determineEmploymentStatus(conflictId, status, asOf, note);
      if (res.alreadyDone) {
        toast.info("That dispute had already been answered");
      } else {
        const n = res.rolesDetermined ?? 0;
        toast.success(
          `Determined as ${statusLabel(status)}. `
          + `${n} employment record${n === 1 ? "" : "s"} updated. No rating changed state.`,
        );
      }
      setStatus(""); setAsOf(""); setNote(""); setAsked(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not record that determination");
    } finally { setBusy(false); }
  };

  return (
    <section className="border-t border-border pt-4" data-testid="status-determination">
      <h4 className="mb-2 text-sm font-semibold">Determine the employment status</h4>
      <p className="mb-3 text-xs text-muted-foreground">
        This records your decision against the employment, names you as the one who made it, and
        takes it out of dispute. A later contributor statement can reopen it; an older one cannot,
        because you have already weighed it. No rating is published or held by this.
      </p>

      <div className="space-y-2">
        {DETERMINABLE_STATUSES.map(s => (
          <label key={s.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={`determination-${conflictId}`}
              value={s.value}
              checked={status === s.value}
              onChange={() => setStatus(s.value)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">The date the evidence speaks to</span>
          <input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            data-testid={`determination-as-of-${conflictId}`}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {status === "unknown"
              ? "Unknown asserts nothing, so leave this empty."
              : "Not today's date: the date the evidence is about."}
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Why</span>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What you read, and what it said"
            data-testid={`determination-note-${conflictId}`}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Required. This is kept with the decision.
          </span>
        </label>
      </div>

      {asked && problem && (
        <p
          role="alert"
          data-testid={`determination-problem-${conflictId}`}
          className="mt-3 text-sm text-red-600 dark:text-red-400"
        >
          {problem}
        </p>
      )}

      <div className="mt-3">
        <button
          disabled={busy}
          onClick={submit}
          data-testid={`determine-status-${conflictId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Gavel className="h-4 w-4" aria-hidden="true" />
          {busy
            ? "Recording..."
            : scope > 1 ? `Record determination for ${scope} records` : "Record determination"}
        </button>
      </div>
    </section>
  );
}

// ── queue 3: held ratings ──────────────────────────────────────────────────────

export function HeldRatingsQueue({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<HeldRating[] | null>(null);
  const [working, setWorking] = useState<number | null>(null);

  const load = useCallback(() => {
    setRows(null);
    fetchHeldRatings()
      .then(setRows)
      .catch(() => { setRows([]); toast.error("Could not load held ratings"); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (rows) onChanged?.(); }, [rows]);

  if (rows === null) return <Loading />;
  if (rows.length === 0) return <Empty>No ratings are held.</Empty>;

  return (
    <div className="space-y-3" data-testid="moderation-held-panel">
      <p className="text-sm text-muted-foreground">
        Every rating that is not public, why, and what would release it. The reason comes from the
        same database rule that decides publication, so it is the real one.
      </p>
      {rows.map(r => (
        <div key={r.reviewId} data-testid={`held-rating-${r.reviewId}`} className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.overallRating ?? "-"}/5</span>
            <span className="text-sm text-muted-foreground">
              {r.title ?? "(no title)"}{r.company ? ` at ${r.company}` : ""}
            </span>
            <span className="text-sm text-muted-foreground">for</span>
            <ManagerLink id={r.managerId} slug={r.managerSlug} name={r.managerName} />
            <Waiting since={r.submittedAt} />
          </div>
          <div className="mt-2 text-sm">
            <span className="font-medium">Why: </span>{r.whyHeld}
          </div>
          <div className="mt-1 text-sm">
            <span className="font-medium">To release: </span>{r.actionToRelease}
          </div>
          {/* Navigation from the rating to the thing holding it, which is the point. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {r.roleId && (
              <span className="text-xs text-muted-foreground">
                employment #{r.roleId}
                {r.roleState ? ` (${r.roleState})` : ""}
                {r.roleTitle ? ` · ${r.roleTitle}` : ""}
              </span>
            )}
            {r.blockingConflictId && (
              <Pill tone="bad">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                conflict #{r.blockingConflictId}: {(r.blockingConflictKind ?? "").replace(/_/g, " ")}
              </Pill>
            )}
            {r.wouldPublishNow && <Pill tone="good">ready to publish</Pill>}
          </div>

          {/*
            THE ACTION, HERE, ON THE THING THAT IS STUCK.

            This queue named the reason and the remedy and then offered no way to carry it out, so
            an admin read "accept the employment", went looking for another queue, and found the
            employment listed under a manager's name rather than the rating's. The release lives
            where the problem is reported.

            Only where there IS a release: a duplicate is held because it duplicates a rating that
            already stands, and no button should pretend otherwise.
          */}
          {/*
            A HELD RATING WITH NO RELEASE PATH STILL NEEDS AN ANSWER.

            A claim resolved as a duplicate or a rejection names no employment and raises no
            conflict, so it appears in neither of the other queues and this row offered nothing.
            The rating then sits in the queue for ever: an admin is told what is wrong and given no
            way to end it, which is the state this panel exists to prevent.

            Discard uses the review deletion an admin already has elsewhere, with the reason
            recorded, and it is a soft delete - the contribution is not destroyed. It is offered
            ONLY where nothing else can release the rating, so it never competes with accepting an
            employment or resolving a conflict.
          */}
          {!r.roleId && !r.blockingConflictId && (
            <div className="mt-3">
              <button
                type="button"
                disabled={working === -1}
                onClick={async () => {
                  if (!window.confirm(
                    "Discard this held rating? The rating it duplicates is unaffected."
                  )) return;
                  setWorking(-1);
                  try {
                    await discardHeldRating(r.reviewId);
                    toast.success("Rating discarded.");
                    load();
                  } catch {
                    toast.error("Could not discard that rating.");
                  } finally {
                    setWorking(null);
                  }
                }}
                className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/5 disabled:opacity-50"
              >
                {working === -1 ? "Discarding…" : "Discard this rating"}
              </button>
            </div>
          )}

          {r.roleId && r.roleState === "proposed" && (
            <div className="mt-3">
              <button
                type="button"
                disabled={working === r.roleId}
                onClick={async () => {
                  setWorking(r.roleId!);
                  try {
                    await acceptEmployment(r.roleId!);
                    toast.success("Employment accepted. Any rating waiting on it is now public.");
                    load();
                  } catch {
                    toast.error("Could not accept that employment.");
                  } finally {
                    setWorking(null);
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {working === r.roleId ? "Accepting…" : "Accept the employment and publish"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
