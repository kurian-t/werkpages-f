import { Lock, Star } from "lucide-react";
import { isTopRated, topRatedTitleClearance } from "@/lib/topRated";
import { TopRatedPill } from "@/components/TopRatedPill";
import { ManagerAvatar, CompanyRow, CompanyLogoImg } from "./ManagerCard";
import { ManagerTile } from "@/components/ManagerTile";
import { Stars } from "@/components/Stars";

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
  /**
   * A card for a manager who is not there yet — the "there could be more here" slots on a thin
   * company page. Name, role and rating are invented and blurred; only the company is real.
   *
   * <p>A prop rather than a second component. CompanyProfile had its own GhostManagerCard, whose
   * comments read "identical to LockedManagerCard", "same size as LockedManagerCard's default
   * ManagerAvatar" and "matches CompanyRow layout" — three claims that were each true when
   * written and none of which the compiler was checking. It drifted, and the teasers ended up
   * visibly taller than the real tiles beside them.
   */
  teaser?: { initials: string; name: string; role: string; color: string; rating: string };
  /** Passed straight to the shared shell; see ManagerTile. */
  layout?: "grid" | "stack";
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
    return (
      // The shared Stars. This drew ★ glyphs with Math.round, so it both looked unlike every
      // other rating in the product and rounded 4.5 up to five.
      <div className="mt-4">
        <Stars rating={overallRating} />
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

export default function LockedManagerCard({ boss, isLoggedIn: _isLoggedIn, narrowSearch = false, asLink = true, blurRating = false, blurCompany = false, blurTitle = false, forceShowCompany = false, teaser, layout = "grid" }: LockedManagerCardProps) {
  /*
   * Ghost is a live status, not a hidden one.
   *
   * `ghost` means the record was created automatically - the first time a signed-in user searches
   * for a manager nobody has added yet - and it is auto-approved and public from that moment. It
   * appears in the directory, in search, and in the counts. Blurring its company and title purely
   * for being a ghost contradicted that: a manager somebody had just brought into existence was
   * unreadable on the company page, which is exactly where you would go to look for them.
   *
   * What the gate withholds is ratings, which are earned. Who someone is and where they work is
   * not gated for any other live manager, and a ghost is a live manager.
   */
  const blurDetails = !forceShowCompany && (blurCompany || narrowSearch || !boss.company);

  // A tile only links where the profile page will actually serve somebody: not a teaser, who is
  // nobody, and not a card whose details are withheld - there is nothing on it to click through
  // from. See CLAUDE.md section 41.
  const linkTo = teaser || blurDetails || !asLink ? undefined : `/manager/${boss.id}`;

  const inner = (
    // The shared box, not this file's own copy of it. See ManagerTile.
    <ManagerTile to={linkTo} tone="default" inert={!!teaser} layout={layout}>
      {!teaser && !blurRating && isTopRated(boss.overallRating, boss.reviewsCount) ? (
        <TopRatedPill rating={boss.overallRating} reviewCount={boss.reviewsCount} />
      ) : (
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
          <Lock size={10} />
          {narrowSearch ? "Narrow search" : "Rate to unlock"}
        </div>
      )}

      {teaser ? (
        <div className={`h-16 w-16 flex-shrink-0 rounded-2xl ${teaser.color} flex items-center justify-center blur-sm`}>
          <span className="text-xl font-bold text-white">{teaser.initials}</span>
        </div>
      ) : (
        <ManagerAvatar name={boss.name} />
      )}

      <h3 className={`mt-3 truncate text-[15px] font-semibold text-foreground leading-tight ${
        teaser ? "blur-sm pr-16" : topRatedTitleClearance(boss.overallRating, boss.reviewsCount)
      }`}>
        {teaser ? teaser.name : boss.name}
      </h3>

      <div className="mt-2 mb-auto min-w-0">
        {teaser ? (
          <div className="flex items-center gap-2">
            <CompanyLogoImg company={boss.company ?? ""} logoUrl={boss.companyLogoUrl} sizeClass="h-8 w-8 rounded-md flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate text-foreground">{boss.company}</p>
              <p className="truncate text-xs text-muted-foreground blur-sm">{teaser.role}</p>
            </div>
          </div>
        ) : blurDetails ? (
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

      {teaser ? (
        /*
          The teaser's own invented rating, present in the DOM and blurred out - not the empty
          placeholder a real gated card gets.

          It reads as "there is a number here you cannot have yet", which is the entire point of
          these slots; a blank row would just look like a manager nobody has rated. The regression
          is "ghost placeholder cards have blurred ratings": the value must be there AND must be
          inside something carrying blur-sm, so it can never be read but is plainly a figure.
        */
        <div className="mt-4 flex select-none items-center gap-1 blur-sm">
          {[1, 2, 3, 4, 5].map(i => (
            <span
              key={i}
              className={`text-base leading-none ${
                i <= Math.round(parseFloat(teaser.rating)) ? "text-amber-400" : "text-muted-foreground/25"
              }`}
            >
              ★
            </span>
          ))}
          <span className="ml-1 text-sm font-semibold text-foreground">{teaser.rating}</span>
        </div>
      ) : (
        <LockedRating overallRating={boss.overallRating} blur={blurRating} />
      )}
    </ManagerTile>
  );

  return inner;
}
