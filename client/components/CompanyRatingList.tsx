import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronDown, Star } from "lucide-react";
import API_BASE from "@/lib/api";
import { COMPANY_CATEGORIES, COMPANY_CATEGORY_LABELS } from "@/lib/companyRatings";
import { getAvatarColor, getInitials } from "@/components/ManagerCard";
import { formatDistanceToNow } from "date-fns";
import { Stars } from "@/components/Stars";
import { OpinionCard, OpinionAuthor, LockedOpinions } from "@/components/OpinionCard";

/**
 * The individual ratings behind a company's average.
 *
 * An average alone asks to be taken on trust. This is what it is made of, so a reader can see the
 * spread - whether a 4.2 is everybody saying 4.2, or half saying 5 and half saying 3, which is the
 * thing an average is worst at conveying.
 *
 * Built to the same card as a manager review, deliberately and down to the details: the same
 * avatar circle and colour function, the same rating-and-stars block, the same chevron that
 * rotates, the same two-column grid of muted chips when it opens. Two lists of ratings on one site
 * that look like two different products is a worse outcome than either look on its own.
 */

interface CompanyRatingRow {
  id: string;
  overallRating: number | null;
  categories: Record<string, number | null>;
  workedFrom: string | null;
  workedUntil: string | null;
  current: boolean;
  createdAt: string;
  updatedAt?: string | null;
  /** The handle its author picked. Null on ratings written before authors existed. */
  author: string | null;
  mine: boolean;
}

const monthYear = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;

/**
 * When it was written, the way a manager review says it.
 *
 * "3 days ago" rather than "September 2026": a reader judging whether an opinion still applies
 * wants the distance, not the date, and the manager profile has always said it that way. An edit
 * says so out loud - a rating changed last week is not the same claim as one untouched since it
 * was written.
 */
function writtenWhen(createdAt: string, updatedAt?: string | null): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return "";
  const updated = updatedAt ? new Date(updatedAt) : null;
  if (updated && !isNaN(updated.getTime()) && updated.getTime() - created.getTime() > 5000) {
    return `edited ${formatDistanceToNow(updated)} ago`;
  }
  return `${formatDistanceToNow(created)} ago`;
}

/**
 * What a withheld score looks like: a plausible number, always blurred, never the real one.
 *
 * <p>Ten of them so a ten-category breakdown does not read as the same figure repeated.
 */
const WITHHELD_SCORES = [4.2, 3.8, 4.5, 3.6, 4.0, 4.4, 3.9, 4.1, 3.7, 4.3];

/** A stable pick per row, so a stand-in does not change on every render. */
function stableIndex(seed: string, size: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
}

/**
 * One workplace rating.
 *
 * <p>Its own component so the locked stack can render the real card rather than a lookalike of
 * it. A placeholder that merely resembles the thing it stands in for drifts, and then the gated
 * state and the unlocked state are visibly two different designs.
 */
function WorkplaceRatingCard({
  r,
  expanded,
  onToggle,
  blurred = false,
  revealIdentity = false,
}: {
  r: CompanyRatingRow;
  expanded: boolean;
  onToggle: () => void;
  /** Scores withheld: the card is whole and readable, only its numbers are blurred out. */
  blurred?: boolean;
  /**
   * Show who wrote it and when, on a card that is genuinely somebody's.
   *
   * <p>The lead card of a locked stack, and only when it is real. It is the proof that there are
   * actual people behind the blur - without it the whole stack could be invention, and a reader
   * has no reason to believe otherwise. The score stays withheld: that is what contributing
   * buys, and it is the same on every card here.
   */
  revealIdentity?: boolean;
}) {
  /*
    A stand-in where the real score was withheld.

    The server strips overall_rating out of a gated row, and `?? 0` turned that into a blurred
    "0.0" over five empty stars - which is not a withheld rating, it is a terrible one. The
    stand-in is invented, always blurred, and stable per row so it does not change on a render.
  */
  const score = blurred
    ? WITHHELD_SCORES[stableIndex(r.id, WITHHELD_SCORES.length)]
    : (r.overallRating ?? 0);
  // Anonymous by construction, so the avatar is seeded from the row's own id rather than a
  // name. Stable per rating, and it reveals nothing.
  // Seeded from the handle so the avatar colour and initials belong to the name shown.
  // Falling back to the row id keeps older, unsigned ratings stable and distinct.
  const seed = r.author ?? r.id;
  const displayName = r.author ?? "Anonymous employee";
  return (
          <OpinionCard>
            {/* Tenure first - the context a reader needs before the number means anything. */}
            <div className="mb-3">
              <p className="text-[13px] font-semibold text-foreground">
                {r.current ? "Current employee" : "Former employee"}
              </p>
              {/* Tenure is contributed detail, withheld like the scores on every card but the lead one. */}
              {(r.workedFrom || r.workedUntil) && (
                <p className={`text-xs text-muted-foreground mt-0.5 ${
                  blurred && !revealIdentity ? "blur-sm select-none" : ""
                }`}>
                  {monthYear(r.workedFrom) ?? ""}
                  {" – "}
                  {r.current ? "Present" : monthYear(r.workedUntil) ?? ""}
                </p>
              )}
            </div>

            {/* Rating + author row, matching the manager review card exactly. */}
            <div className="flex items-center justify-between gap-3 mb-3">
              {/*
                Who wrote it goes with the score.

                A workplace rating carries no written opinion - the card is a tenure line, a
                handle and a number - so leaving "Anonymous employee · 13 days ago" legible
                beside a blurred score showed the reader nothing they could use and made the
                card look half-broken rather than locked.
              */}
              <OpinionAuthor
                name={displayName}
                when={writtenWhen(r.createdAt, r.updatedAt)}
                blurred={blurred && !revealIdentity}
              />

              {/* The one thing the gate actually withholds. */}
              <div className={`flex-shrink-0 flex items-center gap-1.5 ${blurred ? "blur-sm select-none" : ""}`}>
                <span className="text-lg font-bold text-foreground tabular-nums leading-none">
                  {score.toFixed(1)}
                </span>
                {/* The shared Stars: half-filled where the score is, not rounded up. */}
                <Stars rating={score} showValue={false} />
              </div>
            </div>

            <button
                onClick={onToggle}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                {expanded ? "Hide breakdown" : "Show rating breakdown"}
              </button>

            {expanded && (
              <div className="grid gap-1.5 sm:grid-cols-2 mt-3 pt-3 border-t border-border/60">
                {COMPANY_CATEGORIES.map((c, i) => {
                  /*
                    Stand-ins behind the blur.

                    The server strips every category out of a gated row, so without this the
                    breakdown opened onto nothing at all - a reader clicked "Show rating
                    breakdown" and got an empty panel, which reads as a broken control rather
                    than a withheld one. The numbers here are invented and unreadable; what they
                    convey is that there is a full breakdown to be had.
                  */
                  const v = blurred ? WITHHELD_SCORES[i % WITHHELD_SCORES.length] : r.categories?.[c];
                  if (v == null) return null;
                  return (
                    <div
                      key={String(c)}
                      className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
                    >
                      <span className="text-xs text-muted-foreground">{COMPANY_CATEGORY_LABELS[c]}</span>
                      <div className={`flex items-center gap-1 flex-shrink-0 ml-2 ${blurred ? "blur-sm select-none" : ""}`}>
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
          </OpinionCard>
  );
}

/*
  Rows for the cards a locked reader is not shown.

  Never read, because the cards are blurred - they exist so the blur has the shape of a real
  rating rather than the shape of an empty box. They are ordinary rows through the ordinary card,
  so they cannot come out a different size from the real thing.
*/
const PLACEHOLDER_ROWS: CompanyRatingRow[] = [
  { id: "locked-1", overallRating: 4.2, categories: {}, workedFrom: "2022-03", workedUntil: "2024-08",
    current: false, createdAt: "2024-09-01T00:00:00Z", author: "quiet-harbour", mine: false },
  { id: "locked-2", overallRating: 3.6, categories: {}, workedFrom: "2023-01", workedUntil: null,
    current: true, createdAt: "2024-06-01T00:00:00Z", author: "amber-field", mine: false },
  { id: "locked-3", overallRating: 4.5, categories: {}, workedFrom: "2019-06", workedUntil: "2022-11",
    current: false, createdAt: "2023-12-01T00:00:00Z", author: "north-signal", mine: false },
  { id: "locked-4", overallRating: 3.9, categories: {}, workedFrom: "2021-02", workedUntil: "2023-07",
    current: false, createdAt: "2023-08-01T00:00:00Z", author: "pale-thicket", mine: false },
  { id: "locked-5", overallRating: 4.1, categories: {}, workedFrom: "2020-09", workedUntil: null,
    current: true, createdAt: "2023-04-01T00:00:00Z", author: "low-tideline", mine: false },
];

/**
 * At least five cards behind the gate, however few real ones there are.
 *
 * <p>A stack of two says the same discouraging thing the old "1 opinion hidden" line said. Five
 * reads as a body of opinion worth unlocking, which is the entire purpose of showing anything
 * here at all.
 */
const MIN_LOCKED_CARDS = 5;

function padToMinimum<T>(real: T[], filler: T[]): T[] {
  if (real.length >= MIN_LOCKED_CARDS) return real;
  return [...real, ...filler.slice(0, MIN_LOCKED_CARDS - real.length)];
}

export function CompanyRatingList({
  companySlug,
  companyName,
  onRate,
}: {
  companySlug: string;
  companyName: string;
  /** Opens the rate-this-workplace form — the way out of the lock below. */
  onRate: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("recent");

  const { data, isPending, isError } = useQuery({
    queryKey: ["company-ratings", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/ratings`, {
        withCredentials: true,
      });
      return res.data as {
        data: CompanyRatingRow[];
        gated?: boolean;
      };
    },
    enabled: !!companySlug,
    retry: false,
  });

  const rows = data?.data ?? [];
  const gated = data?.gated === true;

  /*
    Gated, empty and failed are three different answers and each gets said.

    This used to be `if (rows.length === 0) return null`, and the tab mounted it only for an
    unlocked reader - so somebody who had not rated a workplace lost the sort control, the
    heading and any explanation along with the cards. The whole section simply was not there,
    which reads as a broken page rather than a locked one, while the interviews tab one click
    away said plainly that its accounts were locked and offered the way in.

    The sidebar is a control, not data: it renders in every state. This is the same fix the
    interview list already carries, applied to the list it was never applied to.
  */

  /*
    Sorted the way the manager profile sorts its reviews, with the same three options. Still no
    floating your own to the top - the order is whatever the reader chose, for every card equally.
  */
  const ordered = [...rows].sort((a, b) => {
    if (sortBy === "highest") return (b.overallRating ?? 0) - (a.overallRating ?? 0);
    if (sortBy === "lowest")  return (a.overallRating ?? 0) - (b.overallRating ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    /*
      Constrained and headed the way the manager profile heads its reviews. A column of review
      cards running the full width of the page is hard to read and looks nothing like the same
      feature one click away, so the width, the heading size and the sub-line all come from there.
    */
    <div>

      {/*
        Sidebar left, cards right - the Managers tab's own two-column shape. The control that
        governs a list belongs beside it, not stacked above it where it reads as a heading.
      */}
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-56 flex-shrink-0">
          <label
            htmlFor="rating-sort"
            className="mb-3 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Sort by
          </label>
          <select
            id="rating-sort"
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
        {/* Over the reviews, not over the whole row. It titles the list; spanning the sidebar too
            made it read as a heading for the sort control as well. */}
        <div className="mb-4">
          {/* The Managers tab's own section heading: uppercase, tracked out, muted. One page should
              not label its two lists in two different voices. */}
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Opinions on working at {companyName}
            {/* The count is a value, not part of the label - darker and untracked so it reads as
                a number rather than another word in the heading. */}
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
            Personal opinions shared by employees · tenure and roles are self-reported
          </p>
        </div>

        {/*
          Locked, empty and failed are three different answers and each gets said.

          Locked gets the shared stack - the same one the manager profile and the interview tab
          show - so a reader who has not rated a workplace sees what a body of opinion looks like
          rather than a bare line reporting how much of it they are missing. The words differ
          from the panel above on purpose: that one says "Rate a workplace to unlock them", and
          repeating it verbatim a few hundred pixels lower reads as the page stuttering.
        */}
        {gated ? (
          <LockedOpinions
            notice={{
              title: "Ratings are locked",
              hint: `Rate a workplace to see how people scored working at ${companyName}.`,
              cta: { label: "⭐ Rate this workplace", onClick: onRate },
            }}
          >
            {padToMinimum(ordered, PLACEHOLDER_ROWS).map((r, i) => (
              <WorkplaceRatingCard
                key={r.id}
                r={r}
                expanded={expanded.has(r.id)}
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
              <p className="text-[13px] text-muted-foreground">Loading opinions…</p>
            ) : isError ? (
              /*
                A failed request is not a company nobody has rated. Saying "no opinions yet" here
                would hide a 500 behind a plausible sentence.
              */
              <p className="text-[13px] text-muted-foreground">
                We couldn't load these opinions. Please try again in a moment.
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Nobody has written about working at {companyName} yet.
              </p>
            )}
          </div>
        ) : null}

        {/*
          The plain list, only when there is no lock.

          This used to render unconditionally, underneath the locked stack - so a gated reader
          got the blurred cards, the "Ratings are locked" notice, and then the very same ratings
          again below it in the clear. The gate was doing nothing at all on this surface.
        */}
        {!gated && (
        <div className="space-y-4">
        {ordered.map((r) => {
          const isExpanded = expanded.has(r.id);
          return (
            /*
              Every card the same, including your own. The manager profile does not ring or badge
              the review you wrote - editing it lives in the header, not in the list - and a
              highlighted card here made the same feature look different one click away.

              The shared shell, so this list and the locked stack that stands in for it cannot
              come out different sizes.
            */
            <WorkplaceRatingCard
              key={r.id}
              r={r}
              expanded={isExpanded}
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
    </div>
  );
}
