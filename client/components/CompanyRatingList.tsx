import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronDown, Star } from "lucide-react";
import API_BASE from "@/lib/api";
import { COMPANY_CATEGORIES, COMPANY_CATEGORY_LABELS } from "@/lib/companyRatings";
import { getAvatarColor, getInitials } from "@/components/ManagerCard";
import { formatDistanceToNow } from "date-fns";

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

export function CompanyRatingList({ companySlug, companyName }: { companySlug: string; companyName: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("recent");

  const { data } = useQuery({
    queryKey: ["company-ratings", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/ratings`, {
        withCredentials: true,
      });
      return (res.data?.data ?? []) as CompanyRatingRow[];
    },
    enabled: !!companySlug,
    retry: false,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

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
            Opinions on {companyName}
            {/* The count is a value, not part of the label - darker and untracked so it reads as
                a number rather than another word in the heading. */}
            {rows.length > 0 && (
              <span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground/70 tabular-nums">
                {rows.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Personal opinions shared by employees · tenure and roles are self-reported
          </p>
        </div>

        <div className="space-y-4">
        {ordered.map((r) => {
          const isExpanded = expanded.has(r.id);
          const score = r.overallRating ?? 0;
          // Anonymous by construction, so the avatar is seeded from the row's own id rather than a
          // name. Stable per rating, and it reveals nothing.
          // Seeded from the handle so the avatar colour and initials belong to the name shown.
          // Falling back to the row id keeps older, unsigned ratings stable and distinct.
          const seed = r.author ?? r.id;
          const displayName = r.author ?? "Anonymous employee";

          return (
            <div
              key={r.id}
              /*
                Every card the same, including your own. The manager profile does not ring or badge
                the review you wrote - editing it lives in the header, not in the list - and a
                highlighted card here made the same feature look different one click away.
              */
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              {/* Tenure first - the context a reader needs before the number means anything. */}
              <div className="mb-3">
                <p className="text-[13px] font-semibold text-foreground">
                  {r.current ? "Current employee" : "Former employee"}
                </p>
                {(r.workedFrom || r.workedUntil) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {monthYear(r.workedFrom) ?? ""}
                    {" – "}
                    {r.current ? "Present" : monthYear(r.workedUntil) ?? ""}
                  </p>
                )}
              </div>

              {/* Rating + author row, matching the manager review card exactly. */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: getAvatarColor(seed) }}
                  >
                    {getInitials(displayName)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{displayName}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {writtenWhen(r.createdAt, r.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1.5">
                  <span className="text-lg font-bold text-foreground tabular-nums leading-none">
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

              <button
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                      return next;
                    })
                  }
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <ChevronDown size={13} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  {isExpanded ? "Hide breakdown" : "Show rating breakdown"}
                </button>

              {isExpanded && (
                <div className="grid gap-1.5 sm:grid-cols-2 mt-3 pt-3 border-t border-border/60">
                  {COMPANY_CATEGORIES.map((c) => {
                    const v = r.categories?.[c];
                    if (v == null) return null;
                    return (
                      <div
                        key={String(c)}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
                      >
                        <span className="text-xs text-muted-foreground">{COMPANY_CATEGORY_LABELS[c]}</span>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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
            </div>
          );
        })}
        </div>
        </div>
      </div>
    </div>
  );
}
