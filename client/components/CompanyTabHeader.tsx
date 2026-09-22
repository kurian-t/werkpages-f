import React from "react";
import { Stars } from "@/components/Stars";
import { RatingHighlights } from "@/components/RatingHighlights";
import { Building2, MessageSquare, Star, TrendingDown, TrendingUp, Users } from "lucide-react";

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
  icon?: "managers" | "rated" | "reviews" | "companies";
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
  hideCount = false,
  scoreLabel,
  counts = [],
  highlights = [],
  highlightsFootnote,
  action,
  lockedOverlay,
  averages,
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
  /**
   * Drop the "N opinions (limited data, interpret cautiously)" line under the score.
   *
   * <p>Independent of {@link locked}, and deliberately so: a surface can state its average
   * publicly and still not want to advertise how thin the sample behind it is. The industry page
   * does exactly that - its ratings are open to everybody, but a reader who has not contributed
   * is not shown "2 opinions".
   */
  hideCount?: boolean;
  /** The tab's own control, right-aligned on the eyebrow row. */
  action?: React.ReactNode;
  /**
   * A block of averages in place of the single score - see RatingColumns.
   *
   * <p>For a surface that rates more than one thing. When given, `score` and `scoreLabel` are
   * not drawn: two presentations of the same figures on one row is how a header ends up saying
   * the same thing twice.
   */
  averages?: React.ReactNode;
  /**
   * Rendered over the gated figures, saying what unlocks them. Each tab words its own ask.
   *
   * <p>Pass a {@link LockedOverlay} - it brings the scrim and the positioning with it. This used
   * to be bare content that the header wrapped in its own centred, scrimmed box, which meant
   * every other locked surface in the product wrapped its own, slightly differently.
   */
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
              {/*
                Locked keeps its washed-out row - a placeholder, not a score. Unlocked draws the
                shared Stars, which fills by halves: this loop used Math.floor, so 4.9 showed
                four stars and understated the score as badly as rounding overstated it.
              */}
              {locked || !showValue
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={13} aria-hidden="true"
                          className={locked ? "fill-amber-300/40 text-amber-300/40" : "text-border"} />
                  ))
                : <Stars rating={score!} size={13} showValue={false} />}
            </div>
            {scoreLabel && <span className="text-sm text-muted-foreground">{scoreLabel}</span>}
          </div>

          {/* Narrow on purpose: the caveat wraps under the stars in a column rather than running
              the width of the row, so the score and what qualifies it read as one object. */}
          {!hideCount && (
          /*
            Blurred with the score it qualifies.

            It sits under the lock overlay's wash, which dimmed it without hiding a character -
            so a locked reader could read "2 manager opinions (limited data, interpret
            cautiously)" perfectly well. The sample size is part of what contributing buys, and
            it is the least persuasive thing this header can say to somebody deciding whether to
            add the third.
          */
          <p className={`mt-0.5 max-w-[11rem] text-xs leading-snug text-muted-foreground ${
            locked ? "blur-sm select-none" : ""
          }`}>
              {countValue > 0
                ? `${countValue.toLocaleString()} ${countValue === 1 ? countLabel : countLabel + "s"}${
                    countValue < 3 ? " (limited data, interpret cautiously)" : ""
                  }`
                : `No ${countLabel}s yet`}
          </p>
          )}

        </div>
      </div>

      {/* Under the figure it refers to, and the full width of it: a control the width of its own
          label leaves a ragged right edge against the block above, and the button is the one thing
          here you are meant to act on. */}
      {/*
        Not rendered at all while the lock overlay is up.

        The overlay carries the unlock control itself now, centred in the notice, which is where
        a reader looks the moment they are told they cannot see something. Keeping this one as
        well put the same ask on the row twice - "Rate a manager" beside "Rate a manager" - and
        the two were different sizes and colours into the bargain.

        Once unlocked it comes back: it is the tab's own control, not a lock affordance.
      */}
      {action && !(locked && lockedOverlay) && (
        <div className="relative z-20 mt-4 w-full [&>button]:w-full [&>div]:w-full [&>div>button]:w-full">
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
            What the company is made of, on the left with the heading: how many managers, how many
            of them anyone has rated, how many opinions there are.

            Withheld while locked, not dimmed. These sit under the overlay's bg-background/75
            wash, which greyed "1 manager" without hiding a character of it - a figure presented
            as withheld and then handed over anyway, which is worse than either showing it or
            not. The same blurred pill the locked company tiles use stands in, and the real count
            never reaches the page: a blur is a visual effect, still readable in devtools and
            still announced by a screen reader.

            `metricsPublic` is the opt-out for a tab whose counts genuinely are not gated.
          */}
          {metrics.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${hasHeading ? "mt-4" : "mt-0"}`}>
              {metrics.map((m) => (
                <span key={m.label} className="flex items-center gap-1.5">
                  {m.icon === "companies" && <Building2 size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {m.icon === "managers" && <Users size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {m.icon === "rated" && <Star size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {m.icon === "reviews" && <MessageSquare size={15} aria-hidden="true" className="text-muted-foreground" />}
                  {locked && !metricsPublic ? (
                    <span
                      aria-hidden="true"
                      data-testid="withheld-metric"
                      className="inline-block h-2.5 w-20 rounded-full bg-[#6d5091]/20 blur-[3px]"
                    />
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{m.value}</span>
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                    </>
                  )}
                </span>
              ))}
            </div>
          )}

          {/*
            The one category people rate highest and the one they rate lowest. A summary, not a
            replacement for the breakdown below - it answers "what is it like here" before the
            reader has to scroll, which is the question they arrived with.
          */}
          {/* The shared block, so a manager profile states these identically. */}
          <RatingHighlights highlights={highlights} locked={locked} className="mt-4" />

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
            takes the width of the figure it belongs to rather than the width of the page.

            Centred until the row stops wrapping. On a phone this block drops onto a line of its
            own, and left-aligning a 200px column under a full-width heading reads as a stray
            element rather than the page's main action. From sm up the row holds and it returns to
            the right, where it belongs opposite the eyebrow. */}
        {/*
          One score, or a block of them.

          The industry page rates three separate things and had been showing only the managers'
          average under a label that read as a summary of all of it. A tab that genuinely has
          one number keeps the single score; one that has three passes them here and gets the
          width to lay them out.
        */}
        <div className={`mx-auto w-full flex-shrink-0 sm:mx-0 ${averages
            /*
              Centred against the column opposite, not pinned to its top.

              The left side carries an eyebrow, a subtitle and its counts before the category
              rows begin, so a top-aligned block of three averages started level with the
              eyebrow and ran out long before the left column did. self-center only - the
              parent stays items-start, because every other tab's single score does belong at
              the top.
            */
            ? "sm:ml-auto sm:w-auto sm:max-w-[240px] sm:self-center"
            : "max-w-[200px]"}`}>
          {averages ?? scoreBlock}
        </div>
      </div>

        {/*
          Transparent to the pointer, deliberately.

          The overlay covers the whole header, and the header's action slot holds "Rate a manager" -
          the one control that unlocks what the overlay is covering. Without pointer-events-none it
          swallowed the click, so a locked reader was shown an instruction and then prevented from
          following it. Nothing inside here is interactive, so letting clicks through costs nothing.
        */}
        {locked && lockedOverlay}
      </div>

      <div className="mt-6 border-t border-border" />
    </div>
  );
}
