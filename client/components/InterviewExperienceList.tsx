import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stars } from "@/components/Stars";
import { OpinionCard, OpinionAuthor, LockedOpinions } from "@/components/OpinionCard";
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

/** What a withheld score looks like: a plausible number, always blurred, never the real one. */
const WITHHELD_SCORES = [4.2, 3.8, 4.5, 3.6, 4.0, 4.4, 3.9, 4.1, 3.7, 4.3];

/** A stable pick per row, so a stand-in does not change on every render. */
function stableIndex(seed: string, size: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
}

/**
 * One interview experience.
 *
 * <p>Its own component so the locked stack can render the real card rather than a lookalike of
 * it. A placeholder that merely resembles the thing it stands in for drifts, and then the gated
 * state and the unlocked state are visibly two different designs.
 */
function InterviewExperienceCard({
  r,
  isOpen,
  onToggle,
  blurred = false,
  revealIdentity = false,
}: {
  r: InterviewRow;
  isOpen: boolean;
  onToggle: () => void;
  /** Scores withheld: the card is whole and readable, only its numbers are blurred out. */
  blurred?: boolean;
  /**
   * Show who wrote it and when, on a card that is genuinely somebody's.
   *
   * <p>The lead card of a locked stack, and only when it is real - the proof that there are
   * actual people behind the blur. The score stays withheld either way.
   */
  revealIdentity?: boolean;
}) {
  /*
    A stand-in where the real score was withheld.

    The server strips overall_rating out of a gated row, and `?? 0` turned that into a blurred
    "0.0" over five empty stars - which does not read as a withheld rating, it reads as a
    terrible one, and it is obvious at a glance that nothing is there. The stand-in fills the
    stars too, since they light from the same number. Invented, always blurred, stable per row.
  */
  const score = blurred
    ? WITHHELD_SCORES[stableIndex(String(r.id), WITHHELD_SCORES.length)]
    : (r.overallRating ?? 0);
  return (
          <OpinionCard>
            {/* What identifies an experience: the role, the year, where. An interview review
                has no author, so this is the context a reader has instead. */}
            <div className="mb-3">
              <p className="text-[13px] font-semibold text-foreground">
                {r.roleCategory ?? "Candidate"}
                {r.interviewYear ? ` · ${r.interviewYear}` : ""}
              </p>
              {/*
                The outcome, how long it took and where - contributed detail, so it is withheld
                like the scores on every card but the lead one.
              */}
              <p className={`mt-0.5 text-xs text-muted-foreground ${
                blurred && !revealIdentity ? "blur-sm select-none" : ""
              }`}>
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
              {/*
                The shared author block - avatar, handle, age - not this file's own version of
                it. This card used to render the handle as a bare line with no avatar at all,
                so the interview tab and the workplace tab of the same company looked like two
                different products.

                Withheld with the score, except on the lead card of a locked stack when that
                card is genuinely somebody's.
              */}
              <OpinionAuthor
                name={r.author ?? "Anonymous candidate"}
                when={writtenWhen(r.createdAt, r.updatedAt)}
                blurred={blurred && !revealIdentity}
              />
              {/* The one thing the gate actually withholds. */}
              <div className={`flex flex-shrink-0 items-center gap-1.5 ${blurred ? "blur-sm select-none" : ""}`}>
                <span className="text-lg font-bold leading-none text-foreground tabular-nums">
                  {score.toFixed(1)}
                </span>
                {/* The shared Stars: half-filled where the score is, not rounded up. */}
                <Stars rating={score} showValue={false} />
              </div>
            </div>

            {/* Opens the way a workplace rating does: the average is one number, and the parts
                it is made of are what a reader is actually deciding on. */}
            {/* Always offered while gated: the stand-ins below give it something to open onto. */}
            {(blurred || (r.categories && Object.values(r.categories).some((v) => v != null))) && (
              <>
                <button
                  onClick={() =>
                    onToggle()
                  }
                  className="mt-3 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                  {isOpen ? "Hide breakdown" : "Show rating breakdown"}
                </button>

                {isOpen && (
                  <div className="mt-3 grid gap-1.5 border-t border-border/60 pt-3 sm:grid-cols-2">
                    {Object.entries(CATEGORY_LABELS).map(([key, label], i) => {
                      /*
                        Stand-ins behind the blur. The server strips every category out of a
                        gated row, so without these the breakdown opened onto nothing and the
                        control read as broken rather than withheld.
                      */
                      const v = blurred ? WITHHELD_SCORES[i % WITHHELD_SCORES.length] : r.categories?.[key];
                      if (v == null) return null;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
                        >
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <div className={`ml-2 flex flex-shrink-0 items-center gap-1 ${blurred ? "blur-sm select-none" : ""}`}>
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
          </OpinionCard>
  );
}

/*
  Rows for the cards a locked reader is not shown - ordinary rows through the ordinary card, so
  they cannot come out a different size from the real thing. Never read; the contents are blurred.
*/
const PLACEHOLDER_ROWS: InterviewRow[] = [
  { id: "locked-1", overallRating: 4.2, difficulty: 3, categories: {}, outcome: "offer",
    rounds: null, processLength: "1_2_weeks", roleCategory: "Software Engineer", interviewYear: 2024,
    interviewedFrom: null, interviewedUntil: null, country: "Canada", author: "quiet-harbour",
    createdAt: "2024-09-01T00:00:00Z", updatedAt: null } as unknown as InterviewRow,
  { id: "locked-2", overallRating: 3.6, difficulty: 4, categories: {}, outcome: "no_offer",
    rounds: null, processLength: "2_4_weeks", roleCategory: "Product Manager", interviewYear: 2024,
    interviewedFrom: null, interviewedUntil: null, country: "Canada", author: "amber-field",
    createdAt: "2024-06-01T00:00:00Z", updatedAt: null } as unknown as InterviewRow,
  { id: "locked-3", overallRating: 4.5, difficulty: 2, categories: {}, outcome: "offer",
    rounds: null, processLength: "under_1_week", roleCategory: "Data Analyst", interviewYear: 2023,
    interviewedFrom: null, interviewedUntil: null, country: "Canada", author: "north-signal",
    createdAt: "2023-12-01T00:00:00Z", updatedAt: null } as unknown as InterviewRow,
  { id: "locked-4", overallRating: 3.9, difficulty: 3, categories: {}, outcome: "no_offer",
    rounds: null, processLength: "over_1_month", roleCategory: "Designer", interviewYear: 2023,
    interviewedFrom: null, interviewedUntil: null, country: "Canada", author: "pale-thicket",
    createdAt: "2023-08-01T00:00:00Z", updatedAt: null } as unknown as InterviewRow,
  { id: "locked-5", overallRating: 4.1, difficulty: 2, categories: {}, outcome: "offer",
    rounds: null, processLength: "1_2_weeks", roleCategory: "Account Manager", interviewYear: 2023,
    interviewedFrom: null, interviewedUntil: null, country: "Canada", author: "low-tideline",
    createdAt: "2023-04-01T00:00:00Z", updatedAt: null } as unknown as InterviewRow,
];

/**
 * At least five cards behind the gate, however few real ones there are.
 *
 * <p>A stack of two says the same discouraging thing "1 opinion hidden" said. Five reads as a
 * body of opinion worth unlocking, which is the whole purpose of showing anything here.
 */
const MIN_LOCKED_CARDS = 5;

function padToMinimum<T>(real: T[], filler: T[]): T[] {
  if (real.length >= MIN_LOCKED_CARDS) return real;
  return [...real, ...filler.slice(0, MIN_LOCKED_CARDS - real.length)];
}

export function InterviewExperienceList({
  companySlug,
  companyName,
}: {
  companySlug: string;
  companyName: string;
}) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState("recent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isPending, isError } = useQuery({
    queryKey: ["company-interview-list", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/interviews/list`, {
        withCredentials: true,
      });
      return res.data as {
        data: InterviewRow[];
        gated: boolean;
      };
    },
    enabled: !!companySlug,
    retry: false,
  });

  const rows = data?.data ?? [];
  const gated = data?.gated === true;

  /*
    Gated, empty and failed are three different answers and each gets said.

    This used to be `if (rows.length === 0) return null`, which collapsed all three into nothing at
    all - and since the server withholds the rows from a gated reader, the people who had NOT
    contributed lost the sort control, the heading and any explanation along with the cards. The
    section simply vanished below the summary, which reads as a broken page rather than a locked
    one. The sidebar is a control, not data: it renders in every state.
  */
  const ordered = [...rows].sort((a, b) => {
    if (sortBy === "highest") return (b.overallRating ?? 0) - (a.overallRating ?? 0);
    if (sortBy === "lowest") return (a.overallRating ?? 0) - (b.overallRating ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div data-testid="interview-experience-list" className="flex flex-col gap-8 lg:flex-row">
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
              // Blurred with the ratings it counts - the same reasoning as the manager profile.
              <span className={`ml-2 text-xs font-normal tracking-normal text-muted-foreground/70 tabular-nums ${
                gated ? "blur-sm select-none" : ""
              }`}>
                {rows.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Personal accounts from candidates · roles and outcomes are self-reported
          </p>
        </div>

        {/*
          Locked, empty and failed are three different answers and each gets said.

          Locked gets the shared stack - the same one the manager profile and the workplace tab
          show - so a reader sees what a body of accounts looks like rather than a bare line
          reporting how much of it they are missing.
        */}
        {gated ? (
          <LockedOpinions
            notice={{
              title: "Ratings are locked",
              hint: "Share yours to see how other candidates scored interviewing here.",
              cta: {
                label: "⭐ Share your experience",
                onClick: () => navigate(
                  `/companies/${companySlug}/add-interview?returnTo=` +
                  encodeURIComponent(`/companies/${companySlug}?tab=hiring`),
                ),
              },
            }}
          >
            {padToMinimum(ordered, PLACEHOLDER_ROWS).map((r, i) => (
              <InterviewExperienceCard
                key={r.id}
                r={r}
                isOpen={expanded.has(r.id)}
                onToggle={() =>
                  setExpanded(prev => {
                    const next = new Set(prev);
                    next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                    return next;
                  })
                }
                blurred
                revealIdentity={i === 0 && ordered.length > 0}
              />
            ))}
          </LockedOpinions>
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-10 text-center">
            {isPending ? (
              <p className="text-[13px] text-muted-foreground">Loading experiences…</p>
            ) : isError ? (
              /*
                A failed request is not an empty company. Saying "no experiences yet" here would
                have hidden a 500 behind a plausible sentence - which is exactly how the missing
                job_relevance column stayed invisible.
              */
              <p className="text-[13px] text-muted-foreground">
                These experiences could not be loaded just now. Try again in a moment.
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No individual experiences have been shared for {companyName} yet.
              </p>
            )}
          </div>
        ) : null}

        {/*
          The plain list, only when there is no lock.

          This used to render unconditionally, underneath the locked stack - so a gated reader
          got the blurred cards, the notice, and then the very same experiences again below it
          in the clear. The gate was doing nothing at all on this surface.
        */}
        {!gated && (
        <div className="space-y-4">
          {ordered.map((r) => {
            return (
              // The shared shell, so this list and the locked stack that stands in for it
              // cannot come out different sizes.
              <InterviewExperienceCard
                key={r.id}
                r={r}
                isOpen={expanded.has(r.id)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                    return next;
                  })
                }
              />
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
