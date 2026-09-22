import { Users } from "lucide-react";
import { RatingColumns } from "@/components/RatingColumns";
import { ManagerTile } from "@/components/ManagerTile";
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
  /** The managers' average. Named plainly on the tile, because it is not the company's score. */
  avgRating?: number | string | null;
  /** What it is like to work there, rated separately by employees. */
  workplaceRating?: number | string | null;
  workplaceCount?: number;
  /** What it is like to interview there, rated separately by candidates. */
  interviewRating?: number | string | null;
  interviewCount?: number;
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
  const workplace = company.workplaceRating == null ? null : Number(company.workplaceRating);
  const interview = company.interviewRating == null ? null : Number(company.interviewRating);
  const workplaceCount = company.workplaceCount ?? 0;
  const interviewCount = company.interviewCount ?? 0;

  return (
    /* The shared box, not this file's own copy of it. See ManagerTile: size, corners, padding,
       border, shadow and hover are decided there and nowhere else. This carried a fourth copy,
       which is how company tiles ended up 180px tall beside 230px manager tiles. */
    <ManagerTile onClick={onClick} testId="company-tile">
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

      {/*
        Three datasets, each with its own average and its own count directly beneath it.

        "Google 4.6 · 2 opinions" read as a verdict on Google backed by two reviews. The 4.6 is
        the mean of the managers people rated there; the 2 counted manager reviews; and neither
        said anything about working there or interviewing there, both separately rated and both
        lower on this company. One number standing in for three was not a summary, it was the
        wrong answer to the question a reader thought they were asking.

        So each figure now names its population and carries its own sample size. A dataset
        nobody has contributed to is omitted rather than printed as a dash - a company with no
        workplace ratings has no workplace score, and a line saying so spends space on an
        absence.
      */}
      {/*
        Three datasets side by side, each a column: what it is, its average, how many opinions
        it rests on.

        "Google 4.6 · 2 opinions" read as a verdict on Google backed by two reviews. The 4.6 is
        the mean of the managers people rated there; it says nothing about working there or
        interviewing there, both separately rated and both different numbers on this company.
        Stacked, the three read as a headline with two footnotes; in columns they read as three
        answers to three questions, which is what they are.

        One star rather than five: three five-star rows will not fit across a 200px tile, and a
        row that has to wrap says less than a single star beside the number. The five-star form
        is still what every rating uses everywhere it has the width - see Stars.
      */}
      <div className="mt-2">
        <RatingColumns
          locked={isLocked}
          columns={[
            { label: "Managers",  value: rating,    count: reviews },
            { label: "Company",   value: workplace, count: workplaceCount },
            { label: "Interview", value: interview, count: interviewCount },
          ]}
        />
      </div>

      {/* How many managers there are, which is not a rating and does not belong in the row above. */}
      {!isLocked && managers > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users size={10} className="flex-shrink-0" />
          {managers} {managers === 1 ? "manager" : "managers"}
        </p>
      )}
    </ManagerTile>
  );
}
