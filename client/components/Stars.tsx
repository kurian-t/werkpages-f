import { Star } from "lucide-react";

/**
 * A rating, drawn.
 *
 * There were six copies of this - StarRating twice, Stars three times, StarDisplay once - and
 * they had already drifted: different star sizes, some showing the number beside them and some
 * not, one omitting aria-hidden. Nobody chose that; it is what copies do.
 *
 * Not to be confused with components/StarRating.tsx, which despite the name is an *input* - it
 * takes value/onChange and is how somebody submits a rating. This is display only.
 */

export function Stars({
  rating,
  size = 12,
  showValue = true,
  valueClass = "text-sm",
}: {
  rating: number;
  size?: number;
  /** The number beside the stars. Off where the surrounding layout prints it separately. */
  showValue?: boolean;
  /**
   * Type size for the number, so it scales with the stars.
   *
   * <p>It was fixed at text-sm, which meant shrinking `size` gave you small stars beside a
   * full-size number - the two stopped reading as one object. A caller drawing a secondary
   * rating shrinks both together.
   */
  valueClass?: string;
}) {
  return (
    <div
      className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {/*
        Half stars, because rounding lied.

        The fill was `s <= Math.round(rating)`, so 4.5 drew five solid stars - identical to a
        perfect 5.0 - and 4.6, 4.7 and 4.8 did too. A rating is the one thing on these cards
        that must not overstate itself, and the number beside the stars said 4.5 while the
        stars said full marks.

        Each star fills by how much of it the rating covers, snapped to halves: conventional,
        and it avoids a 62%-filled star that reads as a rendering fault rather than a score.
      */}
      {[1, 2, 3, 4, 5].map((s) => {
        const covered = Math.max(0, Math.min(1, rating - (s - 1)));
        const fill = covered >= 0.75 ? 1 : covered >= 0.25 ? 0.5 : 0;
        return (
          <span
            key={s}
            className="relative inline-flex flex-shrink-0"
            style={{ width: size, height: size }}
          >
            <Star size={size} aria-hidden="true" className="absolute inset-0 fill-none text-border" />
            {fill > 0 && (
              // Clipped from the left, so a half star is the left half - the direction a rating fills.
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star size={size} aria-hidden="true" className="fill-amber-400 text-amber-400" />
              </span>
            )}
          </span>
        );
      })}
      {showValue && (
        <span className={`ml-1 flex-shrink-0 whitespace-nowrap font-semibold leading-none text-foreground ${valueClass}`}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

/**
 * The placeholder shown in place of a rating someone has not earned the right to see yet.
 *
 * Deliberately shaped like a rating rather than blank: it says "there is a number here" without
 * saying what it is, which is the whole point of the contribution gate.
 */
export function LockedStars() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-3 w-3 rounded-full bg-amber-300/40 blur-[2px]" />
      ))}
      <div className="ml-1 h-3 w-6 rounded-full bg-[#6d5091]/20 blur-[3px]" />
    </div>
  );
}
