import React from "react";
import { MessageSquare, Star, TrendingDown, TrendingUp, Users } from "lucide-react";

/**
 * The header every tab on a company page opens with.
 *
 * The three tabs answered the same question — what is this place like — in three different shapes:
 * one led with a heading and a count, one with a metric row, one with neither. Switching tabs felt
 * like switching products, and the score on each meant something subtly different because nothing
 * presented it the same way twice.
 *
 * So the shape is fixed here: what this tab covers, what you can do about it, the score, how much
 * it is worth trusting, and whatever few numbers that tab genuinely has. Each tab supplies the
 * content; none of them decide the layout.
 */

export interface TabMetric {
  value: string;
  label: string;
  /** Which glyph sits in front of it. Omitted where a figure needs no icon. */
  icon?: "managers" | "rated" | "reviews";
}

/** The best and worst scoring category, summarised in one line each. */
export interface TabHighlight {
  direction: "up" | "down";
  label: string;
  value: number;
}

/** An icon-and-count pair, the way the header used to state managers and reviews. */
export interface TabCount {
  icon: "managers" | "reviews";
  text: string;
}

export function CompanyTabHeader({
  eyebrow,
  subtitle,
  score,
  countLabel,
  countValue,
  metrics = [],
  locked = false,
  metricsPublic = false,
  scoreLabel,
  counts = [],
  highlights = [],
  highlightsFootnote,
  action,
  lockedOverlay,
}: {
  /** e.g. "Workplace experience" - rendered uppercase. Omitted where the page already says it. */
  eyebrow?: string;
  /** One line saying whose experience this is. Omitted where the eyebrow already says it. */
  subtitle?: string;
  /** The headline average, or null when there is nothing to show. */
  score: number | null;
  /** The noun for the sample: "review", "opinion", "experience". */
  countLabel: string;
  countValue: number;
  /** The few numbers this tab actually has. Tabs with none pass nothing. */
  metrics?: TabMetric[];
  /** What the score is of - "avg manager rating". Sits beside the number, not under it. */
  scoreLabel?: string;
  /** Counts of things, on their own line under the score, each with its icon. */
  counts?: TabCount[];
  /** Best and worst category. Gated with the rest of the ratings. */
  highlights?: TabHighlight[];
  /** What the categories above rest on - the sample, and whether to trust it. */
  highlightsFootnote?: string;
  /** Withholds the score from a reader who has not contributed. Words stay readable. */
  locked?: boolean;
  /** Set when this tab's metrics are counts of things, not ratings, and so are not gated. */
  metricsPublic?: boolean;
  /** The tab's own control, right-aligned on the eyebrow row. */
  action?: React.ReactNode;
  /** Rendered over the gated figures, saying what unlocks them. Each tab words its own ask. */
  lockedOverlay?: React.ReactNode;
}) {
  const hasScore = score != null && score > 0;
  /*
    Withheld, not merely blurred.
    A blur is a visual effect: the number is still in the DOM, still readable in devtools, still
    announced by a screen reader. For a gated figure that is not a lock, so a locked header renders
    a placeholder and the real value never reaches the page. The blur stays for the look of it.
  */
  const showValue = hasScore && !locked;

  /*
    Built once, placed in one of two spots. With an eyebrow above it the score is a second line of
    the header; without one it is the header, and belongs on the same row as the action rather than
    stranded beneath a button floating on an empty line.
  */
  /*
    The manager profile's strip.

    The number carries the glance; everything that qualifies it - the stars and the small-sample
    caveat - stacks in a column beside it, so a reader who only wants the score is not made to read
    the rest.
  */
  const scoreBlock = (
    <div>
      {/* items-center: the number sits against the middle of the stars-and-caveat column rather
          than its first line, so it reads as one figure with its qualifiers beside it. */}
      <div className={`flex items-center gap-3 ${locked ? "select-none" : ""}`}>
        <span
          className={`text-2xl font-bold text-[#6d5091] tabular-nums leading-none whitespace-nowrap ${
            locked ? "blur-sm" : ""
          }`}
        >
          {showValue ? score!.toFixed(1) : "-"}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-0.5"
              role="img"
              aria-label={showValue ? `${score!.toFixed(1)} out of 5 stars` : "rating hidden until you contribute"}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  aria-hidden="true"
                  className={
                    locked
                      ? "fill-amber-300/40 text-amber-300/40"
                      : showValue && i < Math.floor(score!)
                        ? "fill-amber-400 text-amber-400"
                        : "text-border"
                  }
                />
              ))}
            </div>
            {scoreLabel && <span className="text-sm text-muted-foreground">{scoreLabel}</span>}
          </div>

          {/* Narrow on purpose: the caveat wraps under the stars in a column rather than running
              the width of the row, so the score and what qualifies it read as one object. */}
          <p className="mt-0.5 max-w-[11rem] text-xs leading-snug text-muted-foreground">
              {countValue > 0
                ? `${countValue.toLocaleString()} ${countValue === 1 ? countLabel : countLabel + "s"}${
                    countValue < 3 ? " (limited data, interpret cautiously)" : ""
                  }`
                : `No ${countLabel}s yet`}
          </p>

        </div>
      </div>

      {/* Under the figure it refers to, and the full width of it: a control the width of its own
          label leaves a ragged right edge against the block above, and the button is the one thing
          here you are meant to act on. */}
      {action && (
        <div className="mt-4 w-full [&>button]:w-full [&>div]:w-full [&>div>button]:w-full">
          {action}
        </div>
      )}
    </div>
  );

  const hasHeading = Boolean(eyebrow || subtitle);

  return (
    <div className="mb-6">
      {/*
        The positioning anchor for the locked overlay.

        It used to be a `relative` wrapper further down, around the block that held the score. The
        redesign moved the score up into the row below and left that wrapper around an empty div -
        so it had no height, and an `inset-0` overlay inside a zero-height box is zero-sized. Every
        tab still passed its "…are locked / …to unlock" copy and none of it was ever visible: the
        figures were correctly withheld, and nothing on screen said why.

        Anchoring here covers the content the gate actually applies to.
      */}
      <div className="relative">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </h2>
          )}
          {subtitle && <p className="mt-1 text-[13px] text-foreground">{subtitle}</p>}
          {/*
            What the company is made of, on the left with the heading. These are counts of rows -
            how many managers, how many of them anyone has rated, how many opinions there are - so
            they describe the place rather than judge it, and the gate does not withhold them.
          */}
          {metrics.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${hasHeading ? "mt-4" : "mt-0"}`}>
              {metrics.map((m) => (
                <span key={m.label} className="flex items-center gap-1.5">
                  {m.icon === "managers" && <Users size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {m.icon === "rated" && <Star size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {m.icon === "reviews" && <MessageSquare size={15} aria-hidden="true" className="text-muted-foreground" />}
                  <span className="text-sm font-semibold text-foreground tabular-nums">{m.value}</span>
                  <span className="text-sm text-muted-foreground">{m.label}</span>
                </span>
              ))}
            </div>
          )}

          {/*
            The one category people rate highest and the one they rate lowest. A summary, not a
            replacement for the breakdown below - it answers "what is it like here" before the
            reader has to scroll, which is the question they arrived with.
          */}
          {highlights.length > 0 && (
            <div className={`mt-4 flex flex-wrap gap-x-6 gap-y-4 ${locked ? "select-none" : ""}`}>
              {(["up", "down"] as const).map((dir) => {
                const rows = highlights.filter((h) => h.direction === dir);
                if (rows.length === 0) return null;
                return (
                  <div key={dir} className="min-w-0">
                    {/* Heading above the block, not inside it - it names the group, and a label
                        sharing a border with the rows reads as one of them. */}
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {dir === "up" ? "Strongest" : "Weakest"}
                    </p>
                    {/* The glyph in a square tile, the same shape and size a company logo takes
                        beside its name and title. Not a card around the whole group - the rows are
                        part of the header, and the square is what carries the icon. */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                        {dir === "up"
                          ? <TrendingUp size={18} aria-hidden="true" className="text-green-600" />
                          : <TrendingDown size={18} aria-hidden="true" className="text-amber-500" />}
                      </div>
                      <div className="min-w-0">
                        {rows.map((h) => (
                          <p key={h.label} className="flex items-baseline gap-3 text-[11px] leading-relaxed">
                            <span className={`w-48 flex-shrink-0 truncate text-muted-foreground ${locked ? "blur-sm" : ""}`}>
                              {h.label}
                            </span>
                            <span className={`w-7 flex-shrink-0 text-right font-semibold text-foreground tabular-nums ${locked ? "blur-sm" : ""}`}>
                              {h.value.toFixed(1)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/*
            What those categories rest on. Hidden for now, deliberately not deleted: the sentence
            and the figures behind it are still correct, and this is the only place that carries the
            caveat now that the boxes are gone. Drop the `hidden` class to bring it back.
          */}
          {highlights.length > 0 && highlightsFootnote && (
            <p hidden className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {highlightsFootnote}
            </p>
          )}
        </div>
        {/* The rating, what it is made of, and the control for it - one block, kept together on
            the right so the eyebrow has the left of the row to itself. Capped so the button below
            takes the width of the figure it belongs to rather than the width of the page. */}
        <div className="w-full max-w-[200px] flex-shrink-0">{scoreBlock}</div>
      </div>

        {/*
          Transparent to the pointer, deliberately.

          The overlay covers the whole header, and the header's action slot holds "Rate a manager" -
          the one control that unlocks what the overlay is covering. Without pointer-events-none it
          swallowed the click, so a locked reader was shown an instruction and then prevented from
          following it. Nothing inside here is interactive, so letting clicks through costs nothing.
        */}
        {locked && lockedOverlay && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-background/75 text-center">
            {lockedOverlay}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-border" />
    </div>
  );
}
