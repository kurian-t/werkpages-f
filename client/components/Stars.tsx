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
}: {
  rating: number;
  size?: number;
  /** The number beside the stars. Off where the surrounding layout prints it separately. */
  showValue?: boolean;
}) {
  return (
    <div
      className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          aria-hidden="true"
          className={`flex-shrink-0 ${
            s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-border"
          }`}
        />
      ))}
      {showValue && (
        <span className="ml-1 flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-none text-foreground">
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
