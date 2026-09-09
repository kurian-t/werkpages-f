import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronDown, Star } from "lucide-react";
import API_BASE from "@/lib/api";
import { COMPANY_CATEGORIES, COMPANY_CATEGORY_LABELS } from "@/lib/companyRatings";
import { getAvatarColor, getInitials } from "@/components/ManagerCard";

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
  mine: boolean;
}

const monthYear = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;

export function CompanyRatingList({
  companySlug,
  totalCount,
}: {
  companySlug: string;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  // The reader's own first. It is the one they came back to check.
  const ordered = [...rows].sort((a, b) => Number(b.mine) - Number(a.mine));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Employee ratings</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {totalCount} {totalCount === 1 ? "person has" : "people have"} rated this workplace
        </p>
      </div>

      <div className="space-y-4">
        {ordered.map((r) => {
          const isExpanded = r.mine || expanded.has(r.id);
          const score = r.overallRating ?? 0;
          // Anonymous by construction, so the avatar is seeded from the row's own id rather than a
          // name. Stable per rating, and it reveals nothing.
          const seed = r.mine ? "You" : r.id;

          return (
            <div
              key={r.id}
              className={`rounded-xl border bg-card p-5 shadow-sm ${
                r.mine ? "border-[#2e0562]/30 ring-1 ring-[#2e0562]/10" : "border-border"
              }`}
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
                    {r.mine ? "You" : getInitials("Anonymous Employee")}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {r.mine ? "Your rating" : "Anonymous employee"}
                      </span>
                      {r.mine && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap flex-shrink-0">
                          ✓ You
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
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

              {/* Their own is always open - there is nothing to reveal to somebody who wrote it. */}
              {!r.mine && (
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
              )}

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
  );
}
