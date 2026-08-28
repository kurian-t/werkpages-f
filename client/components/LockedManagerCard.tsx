import { Lock, Star } from "lucide-react";
import { isTopRated, topRatedTitleClearance } from "@/lib/topRated";
import { TopRatedPill } from "@/components/TopRatedPill";
import { Link } from "react-router-dom";
import { ManagerAvatar, CompanyRow, CompanyLogoImg } from "./ManagerCard";

/** Matches ManagerCard, Companies and Industries - one threshold everywhere. */
interface LockedManager {
  id: number;
  name: string;
  company?: string;
  title?: string;
  industry?: string;
  companyLogoUrl?: string;
  approvalStatus?: string;
  overallRating?: number | null;
  /** Needed for the Top rated badge: a high average off one review does not earn it. */
  reviewsCount?: number | null;
}

interface LockedManagerCardProps {
  boss: LockedManager;
  isLoggedIn: boolean;
  narrowSearch?: boolean;
  asLink?: boolean;
  blurRating?: boolean;
  blurCompany?: boolean;
  blurTitle?: boolean;
  forceShowCompany?: boolean;
}

function BlurPlaceholder({ width }: { width: string }) {
  return (
    <div
      className={`h-3.5 rounded-full bg-muted-foreground/20 blur-[3px] ${width}`}
    />
  );
}

function LockedRating({ overallRating, blur }: { overallRating?: number | null; blur: boolean }) {
  if (!blur && overallRating && overallRating > 0) {
    const filled = Math.round(overallRating);
    return (
      <div className="mt-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`text-base leading-none ${i <= filled ? "text-amber-400" : "text-muted-foreground/25"}`}>★</span>
        ))}
        <span className="ml-1 text-sm font-semibold text-foreground">{overallRating.toFixed(1)}</span>
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-3.5 w-3.5 rounded-full bg-amber-300/40 blur-[2px]" />
      ))}
      <BlurPlaceholder width="w-8" />
    </div>
  );
}

export default function LockedManagerCard({ boss, isLoggedIn: _isLoggedIn, narrowSearch = false, asLink = true, blurRating = false, blurCompany = false, blurTitle = false, forceShowCompany = false }: LockedManagerCardProps) {
  const isGhost = boss.approvalStatus === "ghost";
  const blurDetails = !forceShowCompany && (blurCompany || narrowSearch || isGhost || !boss.company);

  const inner = (
    <div className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm relative overflow-hidden cursor-pointer hover:shadow-md hover:border-primary/30 transition-all">
      {/* Badge. Top rated wins when the rating is actually visible: a card showing 4.7 while
          also saying "Rate to unlock" is contradictory, and this is the same amber pill the
          company and manager cards use so the three read as one thing. */}
      {!blurRating && isTopRated(boss.overallRating, boss.reviewsCount) ? (
        <TopRatedPill rating={boss.overallRating} reviewCount={boss.reviewsCount} />
      ) : (
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
          <Lock size={10} />
          {narrowSearch ? "Narrow search" : "Rate to unlock"}
        </div>
      )}

      <ManagerAvatar name={boss.name} />

      <h3 className={`mt-3 text-[15px] font-semibold text-foreground leading-tight ${topRatedTitleClearance(boss.overallRating, boss.reviewsCount)}`}>
        {boss.name}
      </h3>

      <div className="mt-2 mb-auto">
        {blurDetails ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 flex-shrink-0 rounded-md bg-muted-foreground/10 blur-[3px]" />
            <div className="flex flex-col gap-1.5">
              <BlurPlaceholder width="w-28" />
              <BlurPlaceholder width="w-20" />
            </div>
          </div>
        ) : blurTitle ? (
          <div className="flex items-center gap-2">
            <CompanyLogoImg company={boss.company ?? ""} logoUrl={boss.companyLogoUrl} sizeClass="h-10 w-10" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate text-foreground">{boss.company}</p>
              <BlurPlaceholder width="w-24" />
            </div>
          </div>
        ) : (
          <CompanyRow
            company={boss.company}
            title={boss.title ?? ""}
            industry={boss.industry}
            logoUrl={boss.companyLogoUrl}
          />
        )}
      </div>

      <LockedRating overallRating={boss.overallRating} blur={blurRating} />
    </div>
  );

  if (blurDetails || !asLink) return <div>{inner}</div>;
  return <Link to={`/manager/${boss.id}`}>{inner}</Link>;
}
