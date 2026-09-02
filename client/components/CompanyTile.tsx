import { Star, Users, MessageSquare } from "lucide-react";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { TopRatedPill } from "@/components/TopRatedPill";

/**
 * One company, as a tile.
 *
 * There were three copies of this markup - the companies directory, the industry profile, and the
 * "companies in this group" grid on a company page - written separately and drifting apart ever
 * since. The group copy never rendered a review count and read a different logo field, so the same
 * company showed a rating and a logo on its own page and a bare letter with no reviews when listed
 * under its parent. Nobody introduced that on purpose; it is what three copies of a tile do.
 *
 * So there is one now. Anything that should be true of a company tile is true here or nowhere.
 */

export interface CompanyTileData {
  name: string;
  logoUrl?: string;
  industry?: string;
  managerCount?: number;
  totalReviews?: number;
  avgRating?: number | string | null;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
          aria-hidden="true"
          className={`flex-shrink-0 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-border"}`}
        />
      ))}
      <span className="ml-1 flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-none text-foreground">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

function LockedStars() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-3 w-3 rounded-full bg-amber-300/40 blur-[2px]" />
      ))}
      <div className="ml-1 h-3 w-6 rounded-full bg-[#6d5091]/20 blur-[3px]" />
    </div>
  );
}

export function CompanyTile({
  company,
  onClick,
  isLocked = false,
  showIndustry = false,
}: {
  company: CompanyTileData;
  onClick: () => void;
  isLocked?: boolean;
  showIndustry?: boolean;
}) {
  const managers = company.managerCount ?? 0;
  const reviews = company.totalReviews ?? 0;
  const rating = company.avgRating == null ? null : Number(company.avgRating);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-full w-full min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all min-[420px]:w-[200px] sm:p-5"
    >
      {/*
        The badge gets its own row instead of the top-right corner. This card puts the name beside
        a 48px logo, so a corner badge leaves the first line about 44px on a 200px card - too
        narrow to clear by padding (it truncates the name to "Ciel Lu...") and too narrow to flow
        around (the name breaks mid-word). Out of the title's line there is no collision to solve.

        The row is reserved on every card, not only the ones that earned a badge, so logos and
        names line up across a grid where some tiles have it and some do not.
      */}
      <div className="mb-1.5 flex h-[18px] items-start justify-end">
        <TopRatedPill rating={rating ?? undefined} reviewCount={reviews} hidden={isLocked} variant="inline" />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <CompanyLogoImg company={company.name} logoUrl={company.logoUrl} sizeClass="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sm text-foreground group-hover:text-[#6d28d9] leading-tight transition-colors line-clamp-2">
            {company.name}
          </h2>
          {/*
            Plain text, not a Link: the whole tile is a <button>, and nesting an anchor inside one
            is invalid HTML and steals the tile's click. The industry is clickable on the company
            profile page instead.
          */}
          {showIndustry && company.industry && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={company.industry}>
              {company.industry}
            </p>
          )}
        </div>
      </div>

      {isLocked ? <LockedStars /> : rating != null && <Stars rating={rating} />}

      {/*
        Zero is not worth printing. A tile that says "0 reviews" spends a line advertising an
        absence; one that says "2 managers" and stops has said everything true about it. Each stat
        stands or falls on its own, and the row disappears when neither has anything to report.

        The locked placeholders are exempt - they are a deliberate teaser, not a fact.
      */}
      {(isLocked || managers > 0 || reviews > 0) && (
        <div className="mt-3 flex flex-col items-start gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
          {(isLocked || managers > 0) && (
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
              <Users size={11} className="flex-shrink-0" />
              {isLocked
                ? <span className="inline-block h-2.5 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                : <span className="whitespace-nowrap">{managers} {managers === 1 ? "manager" : "managers"}</span>}
            </span>
          )}
          {(isLocked || reviews > 0) && (
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
              <MessageSquare size={11} className="flex-shrink-0" />
              {isLocked
                ? <span className="inline-block h-2.5 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                : <span className="whitespace-nowrap">{reviews} {reviews === 1 ? "review" : "reviews"}</span>}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
