import React from "react";

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
export function RatingRowBar({
  label, value, max = 5, stacked = false,
}: { label: string; value: number; max?: number; stacked?: boolean }) {
  const pct = Math.min(100, (value / max) * 100);

  /*
    One row shape, in every state.

    Filtering changes *which* categories you are looking at; it must not change how a category
    looks. An earlier pass gave the ranked views taller rows and a full-width bar, and the effect
    was that picking "Highest 3" appeared to swap the chart for a different component - same data,
    unrecognisable presentation. Same type sizes, same bar thickness, same row height throughout.

    No rank numbers either. A sorted list of three already reads as a ranking - the order says it
    and the bar lengths say it again, so a 1/2/3 column restates what is already on screen and
    spends width doing it.

    The bar is capped rather than flexed in the ranked view. With three rows across the full card
    width an uncapped bar becomes a banner, which is the same supersizing by another route.
  */
  return (
    <div className="flex items-center gap-3">
      <span
        /* Named, because the width class is not stable: the ranked views widen this label from
           w-44 to w-64, and a test keyed on the narrow one silently matched nothing there - the
           overlap check compared an empty list against an empty list and passed without testing
           anything. */
        data-testid="breakdown-row-label"
        className={`flex-shrink-0 text-xs text-muted-foreground leading-tight ${
          stacked ? "w-64" : "w-44"
        }`}
      >
        {label}
      </span>
      <div
        className={`h-1.5 rounded-full bg-muted overflow-hidden ${
          stacked ? "w-full max-w-[280px]" : "flex-1"
        }`}
      >
        <div className="h-full rounded-full bg-[#6d5091] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
        {value > 0 ? value.toFixed(1) : "-"}
      </span>
    </div>
  );
}

/** Which slice of the categories is on screen. */
export type BreakdownFilter = "all" | "highest" | "lower";

/** How many rows the Highest / Lower slices show. */
const SLICE = 3;

/**
 * The three slices a reader actually wants.
 *
 * Pills rather than a dropdown: there are exactly three states, and a dropdown hides two of them
 * behind a click to save space that a row of three short labels does not need. Three is small
 * enough to show.
 *
 * Highest and Lower are sorted - that is the whole point of asking for them - while All keeps the
 * order the categories are asked in, so the default view still reads the same as the form that
 * produced it.
 */
export function applyBreakdownFilter(rows: RatingRow[], filter: BreakdownFilter): RatingRow[] {
  if (filter === "all") return rows;
  // Rows nobody has rated carry no signal about whether something is a strength or a weakness,
  // so they sit out of both slices rather than filling the Lower one with zeroes.
  const rated = rows.filter((r) => r.value > 0);
  if (filter === "highest") {
    return [...rated].sort((a, b) => b.value - a.value).slice(0, SLICE);
  }
  return [...rated].sort((a, b) => a.value - b.value).slice(0, SLICE);
}

export function RatingBreakdown({
  rows,
  /* null when the surface already carries its own heading - see BossProfile, where printing one
     here produced two headings saying the same thing one line apart. */
  title = "Rating breakdown",
  subtitle,
  locked = false,
  lockedOverlay,
  bare = false,
  filterable = false,
}: {
  rows: RatingRow[];
  title?: string | null;
  subtitle?: string;
  locked?: boolean;
  /** Rendered over the blur. Each surface words its own ask. */
  lockedOverlay?: React.ReactNode;
  /**
   * Shows the All / Highest / Lower pills.
   *
   * Off by default so surfaces that already rank the categories elsewhere on the page do not
   * offer a second way to do the same thing.
   */
  filterable?: boolean;
  /**
   * Drops the card around the grid. For a surface that already sits on the page ground and has no
   * other boxes on it - a card there is one more edge for a reader to account for, around content
   * that is not a separate object.
   */
  bare?: boolean;
}) {
  const [filter, setFilter] = React.useState<BreakdownFilter>("all");
  /*
    A brief dip while the rows reflow, so the change reads as one movement rather than a flicker.
    Cleared on the next frame - the fade out and back is ~200ms total, which is enough to feel
    deliberate and not enough to feel like waiting.
  */
  const [settling, setSettling] = React.useState(false);
  const chooseFilter = (next: BreakdownFilter) => {
    if (next === filter) return;
    setSettling(true);
    setFilter(next);
  };
  React.useEffect(() => {
    if (!settling) return;
    const id = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(id);
  }, [settling]);

  /*
    Nothing to filter when there are no more rows than a slice would show, and nothing to filter
    behind a lock - the bars there are placeholders, and offering controls over withheld data
    invites a reader to operate something that cannot answer.
  */
  const showFilters = filterable && !locked && rows.filter((r) => r.value > 0).length > SLICE;
  const shown = showFilters ? applyBreakdownFilter(rows, filter) : rows;
  /* A ranking, rather than the full list in its asked order. Decides the single-column layout and
     the capped bar width. */
  const ranked = showFilters && filter !== "all";

  const pills: { id: BreakdownFilter; full: string; short: string }[] = [
    { id: "all",     full: `All ${rows.length}`, short: "All" },
    { id: "highest", full: `Highest ${SLICE}`,   short: "Highest" },
    { id: "lower",   full: `Lower ${SLICE}`,     short: "Lower" },
  ];

  return (
    /* Named so a test can scope to this breakdown: the category labels also appear inside each
       expanded review below, so an unscoped query for one matches more than this chart. */
    <div data-testid="rating-breakdown">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="text-[17px] font-semibold text-foreground tracking-tight">{title}</h2>}
          {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}

      {showFilters && (
        /*
          A tablist, not three buttons. They select which view of one dataset is on screen, which
          is what a tab is - and it means the arrow keys work and a screen reader announces "2 of
          3" rather than reading three unrelated controls.
        */
        <div role="tablist" aria-label="Filter categories" className="mb-4 flex flex-wrap gap-2">
          {pills.map((p) => {
            const active = filter === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseFilter(p.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#2e0562] bg-[#2e0562] text-white"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {/* The count is useful and the label is not worth a wrapped line on a phone. */}
                <span className="sm:hidden">{p.short}</span>
                <span className="hidden sm:inline">{p.full}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`relative ${locked ? "select-none" : ""}`}>
        {/*
          aria-hidden as well as blurred: gated content is withheld from a screen reader too, not
          merely put out of focus. A blur alone is a visual trick, not a gate.
        */}
        <div
          /*
            Deliberately not keyed on the filter.

            Keying it remounted the whole container on every click, which destroyed and rebuilt
            rows that were staying put - a hard swap. Without the key, React matches rows by
            category, so a category present in both views keeps its element and simply reflows into
            the new shape while the ones leaving are removed. The dip below carries the change; the
            rows that survive it are the same rows.
          */
          className={`${ranked ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"} ${
            bare ? "" : "rounded-xl border border-border bg-card p-5"
          } ${locked ? "pointer-events-none blur-sm" : ""} motion-safe:transition-opacity motion-safe:duration-200 ${
            settling ? "motion-safe:opacity-0" : "opacity-100"
          }`}
          aria-hidden={locked || undefined}
        >
          {shown.map((r) => (
            <RatingRowBar key={r.key} label={r.label} value={r.value} stacked={ranked} />
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
