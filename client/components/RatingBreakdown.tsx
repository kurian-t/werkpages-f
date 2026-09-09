import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * How a set of category scores is shown, wherever they appear.
 *
 * There were two of these: the company page drew its own bars under a heading called "All ten",
 * and the manager page drew near-identical bars under "Performance Breakdown". Same rows, same
 * geometry, same colour, two implementations - so they drifted, and a change to one was invisible
 * to the other.
 *
 * The heading is "Rating breakdown" in both places now. "All ten" described the implementation
 * (there happen to be ten company categories) rather than what the reader is looking at, and it
 * meant nothing on a manager profile, which has a different number.
 */

export interface RatingRow {
  key: string;
  label: string;
  value: number;
}

/**
 * One labelled bar, in the manager profile's layout.
 *
 * A flex row with a fixed-width label, not a grid. The grid version of this rendered no bar at
 * all: an `auto` track sizes to intrinsic content, and a `flex-1` track inside one has no basis to
 * grow from, so it collapsed to zero and the page showed labels and numbers with nothing between
 * them. The manager profile already had this right.
 */
export function RatingRowBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-[#6d5091] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
        {value > 0 ? value.toFixed(1) : "-"}
      </span>
    </div>
  );
}

/** Kept for callers that lay out their own label. */
export function RatingBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-[#6d5091] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * Every category, in the order they are asked.
 *
 * Deliberately not sorted: the highest and lowest are already called out above, and re-sorting
 * here would make the same list read differently in two places on one page.
 */
export function RatingBreakdown({
  rows,
  title = "Rating breakdown",
  subtitle,
  locked = false,
  lockedOverlay,
}: {
  rows: RatingRow[];
  title?: string;
  subtitle?: string;
  locked?: boolean;
  /** Rendered over the blur. Each surface words its own ask. */
  lockedOverlay?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold text-foreground tracking-tight">{title}</h2>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className={`relative ${locked ? "select-none" : ""}`}>
        {/*
          aria-hidden as well as blurred: gated content is withheld from a screen reader too, not
          merely put out of focus. A blur alone is a visual trick, not a gate.
        */}
        <div
          className={`grid gap-3 sm:grid-cols-2 rounded-xl border border-border bg-card p-5 ${
            locked ? "pointer-events-none blur-sm" : ""
          }`}
          aria-hidden={locked || undefined}
        >
          {rows.map((r) => (
            <RatingRowBar key={r.key} label={r.label} value={r.value} />
          ))}
        </div>
        {locked && lockedOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/60 text-center">
            {lockedOverlay}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The two that answer "what is it like here" before the full list does.
 *
 * "Highest rated" and "Lower rated" rather than "Strongest" and "Weakest": these are averages of
 * what people scored, not a verdict on the place, and the softer pair says that without
 * pretending the difference is not there.
 */
export function HighLowCards({ rows }: { rows: RatingRow[] }) {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  const highest = ranked.slice(0, 3);
  const lowest = [...ranked].reverse().slice(0, 3);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AreaCard
        title="Highest rated"
        icon={<TrendingUp size={16} className="text-emerald-600" />}
        rows={highest}
      />
      <AreaCard
        title="Lower rated"
        icon={<TrendingDown size={16} className="text-amber-600" />}
        rows={lowest}
      />
    </div>
  );
}

function AreaCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: RatingRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-[13px] font-semibold text-foreground tracking-tight">{title}</h3>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <RatingRowBar key={r.key} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

/**
 * How much weight a reader should give the average, stated rather than left to be inferred.
 *
 * A 4.8 from three people and a 4.8 from ninety are the same number and not the same claim. The
 * page already says how many ratings there are; this says what that count means, which is the
 * part people skip.
 */
export function confidenceLabel(count: number): string {
  if (count < 5) return "Low confidence";
  if (count < 20) return "Moderate confidence";
  return "High confidence";
}
