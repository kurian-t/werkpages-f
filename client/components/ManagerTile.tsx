import { Link } from "react-router-dom";

/**
 * The box every manager tile is drawn in.
 *
 * <p><b>One implementation of the outer card, always.</b> What goes inside differs by surface —
 * a live manager shows a rating, a gated one shows a blurred placeholder, a teaser shows an
 * invented role — but the box itself does not. Size, corners, padding, border, shadow and hover
 * are decided here and nowhere else.
 *
 * <p>This exists because they were decided in three places. `ManagerCard` fixed its own height,
 * `LockedManagerCard` had no height at all, and `CompanyProfile` carried a third copy called
 * `GhostManagerCard` whose comments claimed — in three separate places — to match the others.
 * They sat in one grid on one page, and the teasers stood a head taller than the managers beside
 * them. A comment asserting two files agree is not a mechanism for keeping them agreeing.
 *
 * <p><b>Height comes from the grid row, not from the card.</b> A card that sizes itself to its own
 * content is what makes one tile taller than its neighbours.
 *
 * <p>And the row height is a <b>fixed</b> 230px rather than `minmax(…, auto)`. With `auto`, each
 * row sizes to its own tallest card independently — so a grid holding a gated tile, an ungated one
 * and a teaser came out at 220.8px, 214.8px and 210px in three consecutive rows. Every tile
 * matched its neighbours and no two rows matched each other, which reads exactly like the bug it
 * was supposed to have fixed. 230 clears the tallest variant measured; the cap is deliberate, so
 * a future variant that would overflow it fails the size regression instead of silently
 * stretching its row.
 */
export const TILE_ROW_HEIGHT = 230;
export const TILE_GRID =
  "grid grid-cols-2 auto-rows-[230px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4";

export function ManagerTile({
  to,
  tone = "default",
  inert = false,
  layout = "grid",
  testId,
  children,
}: {
  /** Where the tile goes. Omitted for a tile that is not clickable. */
  to?: string;
  /**
   * Where this tile is being placed.
   *
   * <p><b>grid</b> — in a {@link TILE_GRID}: a fixed 200px column, filling its row's height so
   * every tile in the row matches. <b>stack</b> — in a plain vertical list, as the search form
   * uses: full width, its own height. The two are genuinely different placements, not a styling
   * preference, and a tile sized for one looks wrong in the other.
   */
  layout?: "grid" | "stack";
  /** Pending tiles are amber, so a submission awaiting review reads as different at a glance. */
  tone?: "default" | "pending";
  /** A tile that represents nobody — the teaser slots. No hover, no pointer, no link. */
  inert?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  const box = layout === "grid"
    // min-h as well as h-full, so a tile dropped into something that is not a TILE_GRID still has
    // a sensible floor rather than collapsing to its content.
    ? "h-full min-h-[230px] w-full min-[420px]:w-[200px]"
    : "w-full";
  const className =
    // overflow-hidden: content is clipped to the card rather than escaping its corners, which is
    // what the rounded border is for. It was on the locked card before this shell existed.
    `group relative flex ${box} min-w-0 flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all sm:p-5 ` +
    (inert
      ? "select-none pointer-events-none border-border"
      : tone === "pending"
        ? "border-amber-300 hover:shadow-md hover:border-amber-400 hover:shadow-amber-100"
        : "border-border hover:shadow-md hover:border-[#2e0562]/30 hover:shadow-[#2e0562]/5");

  if (!to || inert) {
    return <div className={className} data-testid={testId ?? "manager-tile"}>{children}</div>;
  }
  return <Link to={to} className={className} data-testid={testId ?? "manager-tile"}>{children}</Link>;
}
