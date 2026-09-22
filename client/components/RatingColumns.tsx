import { Star } from "lucide-react";
import { Stars } from "@/components/Stars";

/**
 * Three datasets side by side: what each one is, its average, and how many opinions it rests on.
 *
 * <p>One number beside a company name reads as a verdict on the company. It is the mean of the
 * managers people rated there, and it says nothing about what working there is like or what
 * interviewing there is like — both separately rated, and routinely different figures. Stacked,
 * the three read as a headline with two footnotes; in columns they read as three answers to
 * three questions, which is what they are.
 *
 * <p>Shared by the company tile and the industry header, because they are the same object at two
 * sizes. Written twice they would drift the way every other pair in this product has.
 */
/**
 * Below this, an average is reported with a caveat.
 *
 * <p>Three, the same as `CompanyTabHeader`'s `countValue < 3` and the interview service's
 * `MIN_REVIEWS_TO_SHOW_AVERAGES`. Stated once here rather than as a third literal 3.
 */
export const MIN_OPINIONS_FOR_CONFIDENCE = 3;

/** "a", "a and b", "a, b and c" - `join(" and ")` gave "a and b and c". */
const listOf = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export interface RatingColumn {
  label: string;
  value: number | null;
  count: number;
}

export function RatingColumns({
  columns,
  layout = "inline",
  locked = false,
}: {
  columns: RatingColumn[];
  /**
   * <b>inline</b> — three columns, star beside the number, for a 200px tile where vertical
   * space is the constraint. <b>rows</b> — one per line, the figure on the left and its label
   * and count to the right, the same shape the Strongest/Weakest block uses in a page header.
   */
  layout?: "inline" | "rows";
  /** Withheld: the shape stays, the figures do not. */
  locked?: boolean;
}) {
  /*
    Which datasets rest on too little to lean on. Fewer than three, the product's rule
    everywhere; zero is not "limited data", it is no data, and shows as a dash instead.
  */
  const thin = columns
    .filter(c => c.value != null && c.count > 0 && c.count < MIN_OPINIONS_FOR_CONFIDENCE)
    .map(c => c.label.replace(/\s*avg$/i, ""));

  if (layout === "rows") {
    /*
      The Strongest/Weakest shape: the figure on the left, what it is and what it rests on to
      its right. A header has the width for it, and reading down a column of numbers with their
      labels beside them is easier than reading across three headed columns.
    */
    return (
      /*
        One per line, the Strongest/Weakest grammar: figure left, what it is and what it rests
        on to its right. A fixed-width figure column keeps the stars and decimals aligned down
        the stack whatever the values are.

        Spaced to sit level with the category rows opposite - a tight stack left the right-hand
        column visibly shorter than the left and the header looked lopsided.
      */
      <div className="space-y-4">
        {columns.map(col => (
          /*
            The header's own score block, three times.

            Its grammar exactly: the number carries the glance, and everything qualifying it -
            the stars, what it is of, the sample it rests on - stacks in a column beside it. The
            sizes are the header's too (24px bold in the brand purple, 13px stars, 14px label,
            12px caption) rather than a scale invented for this block, which is what made it
            read as something bolted on from another page.
          */
          <div key={col.label} className="flex items-center gap-3">
            <span className="whitespace-nowrap text-2xl font-bold leading-none tabular-nums text-[#6d5091]">
              {locked || col.value == null ? "-" : col.value.toFixed(1)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {locked || col.value == null ? (
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <Star key={i} size={13} aria-hidden="true"
                            className={locked ? "fill-amber-300/40 text-amber-300/40" : "text-border"} />
                    ))}
                  </div>
                ) : (
                  <Stars rating={col.value} size={13} showValue={false} />
                )}
                <span className="whitespace-nowrap text-sm text-muted-foreground">{col.label}</span>
              </div>
              <p className="mt-0.5 whitespace-nowrap text-xs leading-snug text-muted-foreground">
                {locked ? "" : `${col.count} ${col.count === 1 ? "review" : "reviews"}`}
              </p>
            </div>
          </div>
        ))}
        {/*
          The same caveat the rest of the product attaches to a thin sample, on the same rule:
          fewer than three. CompanyTabHeader appends it at `countValue < 3` and the interview
          service withholds averages under `MIN_REVIEWS_TO_SHOW_AVERAGES = 3`; a fourth number
          here would be a fourth thing to keep in step.

          Shown when any one of the three is thin, and it names which - "limited data" over a
          block of three averages, two of them well-evidenced, would caveat the wrong figures.
        */}
        {!locked && thin.length > 0 && (
          <p className="pt-1 text-center text-[11px] leading-snug text-muted-foreground">
            {thin.length === columns.length
              /* Naming all three is the same as naming none of them, and reads worse. */
              ? "Limited data, interpret cautiously"
              : `Limited data on ${listOf(thin)}, interpret cautiously`}
          </p>
        )}
      </div>
    );
  }

  const stacked = false;
  return (
    <div className={`grid grid-cols-3 text-center ${stacked ? "gap-3" : "gap-1.5"}`}>
      {columns.map(col => (
        <div key={col.label} className="min-w-0">
          {/*
            Sentence case and no letter-spacing. Uppercase with tracking needed 58px for
            "MANAGERS" in a 49px column, so all three headings ellipsed - a heading that cannot
            say its own word is worse than a quieter one.
          */}
          <p className={`leading-tight text-muted-foreground ${stacked ? "text-xs" : "text-[10px]"}`}>
            {col.label}
          </p>

          {locked ? (
            // The gate, in the same shape: a figure is here and you cannot read it yet.
            <div className={`flex justify-center ${stacked ? "mt-2" : "mt-1"}`}>
              <span className="inline-block h-3 w-8 rounded-full bg-[#6d5091]/20 blur-[3px]" />
            </div>
          ) : col.value != null ? (
            <div className={stacked
              ? "mt-1.5 flex flex-col items-center gap-0.5"
              : "mt-0.5 flex items-center justify-center gap-0.5"}>
              <Star
                size={stacked ? 15 : 11}
                aria-hidden="true"
                className="flex-shrink-0 fill-amber-400 text-amber-400"
              />
              <span className={`font-semibold tabular-nums leading-none text-foreground ${
                stacked ? "text-xl" : "text-sm"
              }`}>
                {col.value.toFixed(1)}
              </span>
            </div>
          ) : (
            /* Nobody has rated this one. A dash says so in the width a number would take. */
            <p className={`font-semibold leading-none text-muted-foreground/40 ${
              stacked ? "mt-1.5 text-xl" : "mt-0.5 text-sm"
            }`}>
              –
            </p>
          )}

          {/*
            One line, always.

            "2 opinions" wraps in a 49px tile column at 10px, and a count split across two lines
            reads as two facts. A size down buys the width; nowrap makes it a guarantee rather
            than something that holds until a company has ten of them.
          */}
          <p className={`whitespace-nowrap leading-tight text-muted-foreground ${
            stacked ? "mt-1.5 text-xs" : "mt-1 text-[10px]"
          }`}>
            {locked ? "" : `${col.count} ${col.count === 1 ? "review" : "reviews"}`}
          </p>
        </div>
      ))}
    </div>
  );
}
