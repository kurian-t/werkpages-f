import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, Star } from "lucide-react";
import API_BASE from "@/lib/api";
import { PROCESS_LENGTH_LABELS, type ProcessLength } from "@/lib/interviews";

/**
 * The individual interview experiences behind the average.
 *
 * The workplace tab lists the ratings its average is made of, for a reason that applies here even
 * more strongly: two candidates can meet the same company in the same month and come away with
 * completely different accounts of it. An average of four is one number; four experiences with
 * their outcomes and rounds is what a reader came for.
 *
 * Built to the same card, heading and sidebar as the workplace list, because they are the same
 * feature one tab apart.
 */

interface InterviewRow {
  id: string;
  overallRating: number | null;
  difficulty: number | null;
  outcome: string | null;
  rounds: number | null;
  processLength: string | null;
  roleCategory: string | null;
  interviewYear: number | null;
  country: string | null;
  createdAt: string;
  updatedAt?: string | null;
  categories?: Record<string, number | null> | null;
  /** The handle its author picked. Null on experiences written before authors existed. */
  author?: string | null;
}

/** The parts of a process, in the order the form asks them. */
const CATEGORY_LABELS: Record<string, string> = {
  communication:        "Communication",
  respectForTime:       "Respect for your time",
  roleClarity:          "Clarity about the role",
  processFairness:      "Fairness of the process",
  nextStepTransparency: "Transparency about next steps",
  jobRelevance:         "Role relevance",
};

const OUTCOME_LABELS: Record<string, string> = {
  offer: "Received an offer",
  no_offer: "No offer",
  withdrew: "Withdrew",
  pending: "Still waiting",
};

/*
  The stored value is an enum - "2_4_weeks" - and printing it raw put database vocabulary on the
  page. The form already has a label for every one of them; this uses the same map so the card and
  the form say the same words.
*/
const lengthLabel = (v: string | null) =>
  v ? PROCESS_LENGTH_LABELS[v as ProcessLength] ?? v.replace(/_/g, " ") : null;

/** When it was written, said the way the manager profile says it. */
function writtenWhen(createdAt: string, updatedAt?: string | null): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return "";
  const updated = updatedAt ? new Date(updatedAt) : null;
  if (updated && !isNaN(updated.getTime()) && updated.getTime() - created.getTime() > 5000) {
    return `edited ${formatDistanceToNow(updated)} ago`;
  }
  return `${formatDistanceToNow(created)} ago`;
}

export function InterviewExperienceList({
  companySlug,
  companyName,
}: {
  companySlug: string;
  companyName: string;
}) {
  const [sortBy, setSortBy] = useState("recent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["company-interview-list", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/interviews/list`, {
        withCredentials: true,
      });
      return res.data as { data: InterviewRow[]; gated: boolean };
    },
    enabled: !!companySlug,
    retry: false,
  });

  const rows = data?.data ?? [];
  // Nothing to show, or nothing this reader has earned. The panel above already explains the gate,
  // so an empty section here would only repeat it.
  if (rows.length === 0) return null;

  const ordered = [...rows].sort((a, b) => {
    if (sortBy === "highest") return (b.overallRating ?? 0) - (a.overallRating ?? 0);
    if (sortBy === "lowest") return (a.overallRating ?? 0) - (b.overallRating ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="lg:w-56 flex-shrink-0">
        <label
          htmlFor="interview-sort"
          className="mb-3 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Sort by
        </label>
        <select
          id="interview-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
        >
          <option value="recent">Most Recent</option>
          <option value="highest">Highest Rated</option>
          <option value="lowest">Lowest Rated</option>
        </select>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Opinions on interviews at {companyName}
            {rows.length > 0 && (
              <span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground/70 tabular-nums">
                {rows.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Personal accounts from candidates · roles and outcomes are self-reported
          </p>
        </div>

        <div className="space-y-4">
          {ordered.map((r) => {
            const score = r.overallRating ?? 0;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                {/* What identifies an experience: the role, the year, where. An interview review
                    has no author, so this is the context a reader has instead. */}
                <div className="mb-3">
                  <p className="text-[13px] font-semibold text-foreground">
                    {r.roleCategory ?? "Candidate"}
                    {r.interviewYear ? ` · ${r.interviewYear}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      r.outcome ? OUTCOME_LABELS[r.outcome] ?? r.outcome : null,
                      r.rounds ? `${r.rounds} ${r.rounds === 1 ? "round" : "rounds"}` : null,
                      lengthLabel(r.processLength),
                      r.country,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  {/* Who wrote it, then when - the order every other card on the site uses. */}
                  <div className="min-w-0">
                    {r.author && (
                      <p className="text-sm font-medium text-foreground">{r.author}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {writtenWhen(r.createdAt, r.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <span className="text-lg font-bold leading-none text-foreground tabular-nums">
                      {score.toFixed(1)}
                    </span>
                    <div className="flex gap-0.5" role="img" aria-label={`${score} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          aria-hidden="true"
                          className={i < Math.round(score) ? "fill-amber-400 text-amber-400" : "text-border"}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Opens the way a workplace rating does: the average is one number, and the parts
                    it is made of are what a reader is actually deciding on. */}
                {r.categories && Object.values(r.categories).some((v) => v != null) && (
                  <>
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                          return next;
                        })
                      }
                      className="mt-3 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${expanded.has(r.id) ? "rotate-180" : ""}`}
                      />
                      {expanded.has(r.id) ? "Hide breakdown" : "Show rating breakdown"}
                    </button>

                    {expanded.has(r.id) && (
                      <div className="mt-3 grid gap-1.5 border-t border-border/60 pt-3 sm:grid-cols-2">
                        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                          const v = r.categories?.[key];
                          if (v == null) return null;
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
                            >
                              <span className="text-xs text-muted-foreground">{label}</span>
                              <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                                <span className="text-xs font-semibold text-foreground tabular-nums">
                                  {v.toFixed(1)}
                                </span>
                                <Star size={10} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
