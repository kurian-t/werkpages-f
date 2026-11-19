import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Loader2 } from "lucide-react";
import API_BASE from "@/lib/api";
import { CompanyField } from "@/components/CompanyField";

/**
 * A career-editor contribution, as a moderator reads it.
 *
 * <p>The legacy summary columns are all null for one of these: the substance is the change set, so
 * it is fetched and shown here instead.
 *
 * <p><b>Three versions of every position travel together.</b> What the employment said when the
 * contribution was written, what the contributor proposes, and what it says now. A moderator
 * reading only the proposal cannot tell a correction from a revert, and cannot see that somebody
 * else has already fixed it. Where the first and the last disagree the position is marked stale,
 * and approving the contribution is refused until it has been looked at, because applying it would
 * undo whoever got there first.
 */
export interface ChangeSetPosition {
  id: number;
  intent: "correct" | "add" | "supersede";
  roleId: number | null;
  changedFields: string[];
  position: number;
  was: Record<string, unknown>;
  proposed: Record<string, unknown>;
  current: Record<string, unknown>;
  stale: boolean;
  needsCompanyResolution: boolean;
}

export interface ChangeSet {
  id: string;
  managerId: number;
  managerName: string;
  changeFormat: string;
  status: string;
  explanation: string | null;
  currentName: string;
  proposedName: string | null;
  positions: ChangeSetPosition[];
}

const INTENT_LABEL: Record<string, string> = {
  correct: "Correct this position",
  add: "Add a position",
  supersede: "Change the employer",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  company: "Company",
  location: "Location",
  start_date: "Start date",
  end_date: "End date",
  period_known: "Dates known",
  employment_status: "Employment status",
};

function val(o: Record<string, unknown>, key: string): string {
  const v = o?.[key];
  if (v === null || v === undefined || v === "") return "not stated";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function ChangeSetReview({
  editId,
  onCompanyResolved,
  companyChoices,
}: {
  editId: string;
  /** Records the company a moderator picked for one position, keyed by change-row id. */
  onCompanyResolved: (positionId: number, companyId: number | null, name: string) => void;
  companyChoices: Record<number, { companyId: number | null; name: string }>;
}) {
  const [data, setData] = useState<ChangeSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/api/admin/pending-edits/${editId}/change-set`)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setError("Could not load this change set."); });
    return () => { cancelled = true; };
  }, [editId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading change set...
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid={`change-set-${editId}`}>
      {data.explanation && (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            How they know
          </p>
          <p className="mt-1 text-sm text-foreground">{data.explanation}</p>
        </div>
      )}

      {data.proposedName && data.proposedName !== data.currentName && (
        <div
          data-testid="change-set-name"
          className="rounded-lg border border-border p-3"
        >
          <p className="text-sm font-semibold text-foreground">Correct the manager's name</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.currentName} to <span className="font-semibold text-foreground">{data.proposedName}</span>
          </p>
        </div>
      )}

      {data.positions.length === 0 && !data.proposedName && (
        <p className="text-sm text-muted-foreground">This contribution proposes nothing.</p>
      )}

      {data.positions.map(p => (
        <div
          key={p.id}
          data-testid={`change-position-${p.id}`}
          data-intent={p.intent}
          data-stale={p.stale ? "yes" : "no"}
          className={`rounded-lg border p-3 ${p.stale ? "border-destructive" : "border-border"}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {INTENT_LABEL[p.intent] ?? p.intent}
              {p.roleId !== null && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  employment #{p.roleId}
                </span>
              )}
            </p>
            {p.intent === "supersede" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                replaces, not edits
              </span>
            )}
          </div>

          {p.stale && (
            <div
              data-testid={`stale-${p.id}`}
              className="mb-2 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-xs text-foreground">
                This employment has changed since the contribution was submitted. Approving it would
                undo that change, so approval is refused until you have compared the three columns
                below.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {(["was", "proposed", "current"] as const).map(which => (
              <div key={which} className="rounded-lg bg-muted/40 p-2">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  {which === "was" ? "At submission" : which === "proposed" ? "Proposed" : "Now"}
                </p>
                {p.intent === "add" && which !== "proposed" ? (
                  <p className="text-xs text-muted-foreground">not recorded</p>
                ) : (
                  p.changedFields.filter(f => FIELD_LABEL[f] && f !== "period_known").map(f => {
                    const key = f === "start_date" ? "startDate"
                      : f === "end_date" ? "endDate"
                      : f === "employment_status" ? "employmentStatus"
                      : f;
                    return (
                      <p key={f} className="text-xs">
                        <span className="text-muted-foreground">{FIELD_LABEL[f]}: </span>
                        <span className="font-medium text-foreground">{val(p[which], key)}</span>
                      </p>
                    );
                  })
                )}
              </div>
            ))}
          </div>

          {/*
            RESOLVE THE COMPANY, PER POSITION.

            Approval refuses to turn a typed company name into an identity, because matching text
            to whichever row currently holds it is what produced duplicate companies. A moderator
            choosing it here is a human resolving identity, which is what the refusal asks for.

            Keyed by this position, because a change set can carry two positions that each name a
            company with no record yet, and one answer cannot serve both.
          */}
          {p.needsCompanyResolution && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3"
                 data-testid={`resolve-company-${p.id}`}>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                This company has no record yet. Choose which one is meant.
              </p>
              <CompanyField
                value={companyChoices[p.id]?.name ?? String(p.proposed.company ?? "")}
                onChange={v => onCompanyResolved(p.id, null, v)}
                onCompanyIdChange={id => onCompanyResolved(p.id, id ?? null,
                  companyChoices[p.id]?.name ?? String(p.proposed.company ?? ""))}
                onSuggestionPicked={sug => onCompanyResolved(p.id, sug.id ?? null, sug.name)}
                required
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
