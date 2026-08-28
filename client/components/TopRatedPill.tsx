import { Star } from "lucide-react";
import { isTopRated } from "@/lib/topRated";

interface TopRatedPillProps {
  rating: number | string | null | undefined;
  reviewCount: number | string | null | undefined;
  /**
   * Cards position the pill absolutely in their top-right corner; the manager profile sits it
   * inline beside the name. Everything else about it stays identical, because the badge meaning
   * the same thing everywhere is the point.
   */
  variant?: "corner" | "inline";
  /** Suppresses the pill regardless of rating - used where the rating itself is hidden. */
  hidden?: boolean;
}

/**
 * The amber "Top rated" badge.
 *
 * One component so the markup cannot drift the way it did when four files each held their own
 * copy, and so the eligibility rule is applied in exactly one place.
 */
export function TopRatedPill({ rating, reviewCount, variant = "corner", hidden }: TopRatedPillProps) {
  if (hidden || !isTopRated(rating, reviewCount)) return null;

  // self-start keeps the inline variant hugging its text: as a child of a flex column it would
  // otherwise stretch to the column's full width and read as a bar rather than a badge.
  const position =
    variant === "corner" ? "absolute right-2 top-2" : "relative self-start";

  return (
    <span
      className={`${position} inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700`}
    >
      <Star size={9} className="fill-amber-500 text-amber-500" aria-hidden="true" /> Top rated
    </span>
  );
}
