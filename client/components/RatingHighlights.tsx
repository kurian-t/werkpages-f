import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * The strongest and weakest categories, side by side.
 *
 * <p>Lifted out of `CompanyTabHeader` so a manager profile states these the same way a company
 * page does. The profile used to carry an "Overview" instead — a generated sentence above two
 * lists headed "Key Strengths" and "Lower-rated categories" — which said the same thing as this
 * block in a different voice, a different type scale and a different layout, on two pages a
 * reader moves between constantly.
 */
export interface RatingHighlight {
  direction: "up" | "down";
  label: string;
  value: number;
}

/** Below this, an average is reported with a caveat. Three, as everywhere else in the product. */
const MIN_OPINIONS_FOR_CONFIDENCE = 3;

export function RatingHighlights({
  highlights,
  locked = false,
  className = "",
  opinionCount,
}: {
  highlights: RatingHighlight[];
  /** Blurs the labels and figures. The headings and glyphs stay, so the shape reads as gated. */
  locked?: boolean;
  className?: string;
  /**
   * How many opinions these averages rest on. Stated beneath them, with the product's usual
   * caveat under three - six category scores drawn from one or two opinions look far more
   * settled than they are, and the block gives no hint of that on its own.
   */
  opinionCount?: number;
}) {
  if (highlights.length === 0) return null;
  return (
    <div className={className}>
    <div className={`flex flex-wrap gap-x-6 gap-y-4 ${locked ? "select-none" : ""}`}>
      {(["up", "down"] as const).map((dir) => {
        const rows = highlights.filter((h) => h.direction === dir);
        if (rows.length === 0) return null;
        return (
          <div key={dir} className="min-w-0">
            {/* Heading above the block, not inside it - it names the group, and a label sharing
                a border with the rows reads as one of them. */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {dir === "up" ? "Strongest" : "Weakest"}
            </p>
            {/* The glyph in a square tile, the same shape and size a company logo takes beside
                its name and title. */}
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
    {opinionCount != null && opinionCount > 0 && (
      /*
        Withheld with the figures it describes.

        The sample size is part of what contributing buys: "Based on 2 opinions" over a blurred
        breakdown tells a locked reader exactly how thin the data is, which is both a disclosure
        of the gated content and the least persuasive thing the section could say to somebody
        deciding whether to add a third.
      */
      <p className={`mt-2 text-[11px] leading-snug text-muted-foreground ${
        locked ? "blur-sm select-none" : ""
      }`}>
        {`Based on ${opinionCount} ${opinionCount === 1 ? "review" : "reviews"}`}
        {opinionCount < MIN_OPINIONS_FOR_CONFIDENCE && " · Limited data, interpret cautiously"}
      </p>
    )}
    </div>
  );
}
