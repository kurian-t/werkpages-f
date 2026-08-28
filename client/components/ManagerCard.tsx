import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { companyLogoDomain } from "@/lib/utils";

interface Manager {
  id: number;
  name: string;
  company: string;
  title: string;
  industry?: string;
  overallRating?: number;
  reviews?: number;
  status?: string;
  country?: string;
  companyLogoUrl?: string;
  approvalStatus?: string;
}

interface ManagerCardProps {
  boss: Manager;
  isPending?: boolean;
}

const AVATAR_COLORS = [
  "#E05C5C", "#E0875C", "#D4943A", "#4CAF7D",
  "#4A90D9", "#7B68EE", "#C05CE0", "#E05C9A",
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ManagerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-20 w-20 rounded-2xl text-3xl" : size === "sm" ? "h-10 w-10 rounded-xl text-sm" : "h-16 w-16 rounded-2xl text-xl";
  return (
    <div
      className={`flex items-center justify-center font-bold text-white ${sizeClass}`}
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

export function CompanyLogoImg({ company, logoUrl, sizeClass }: { company: string; logoUrl?: string; sizeClass: string }) {
  const logoDevUrl = `https://img.logo.dev/${companyLogoDomain(company)}?token=pk_MXSjJV-uTC6-L5D_FbXZUA`;
  const initialSrc = logoUrl ?? logoDevUrl;
  const [src, setSrc] = useState(initialSrc);
  const [failed, setFailed] = useState(false);
  const initial = company.trim().charAt(0).toUpperCase();

  const handleError = () => {
    if (src !== logoDevUrl) setSrc(logoDevUrl);
    else setFailed(true);
  };

  if (failed) {
    return (
      <div className={`${sizeClass} flex-shrink-0 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[13px] font-semibold text-slate-500`}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={company}
      className={`${sizeClass} flex-shrink-0 object-contain rounded-md bg-white border border-slate-200`}
      onError={handleError}
    />
  );
}

export function CompanyRow({ company, title, industry, logoUrl, logoSize = "md", wrapTitle = false, companyClassName }: { company: string; title: string; industry?: string; logoUrl?: string; logoSize?: "md" | "lg"; wrapTitle?: boolean; companyClassName?: string }) {
  // Bumped a step (md 8→10, lg 10→12): with the industry as a third line, the old sizes
  // left the logo visually undersized against the text column beside it.
  // Changing "lg" changes the indent the manager profile uses to align its industry line -
  // see the ml-14 in BossProfile.
  const sizeClass = logoSize === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <CompanyLogoImg company={company} logoUrl={logoUrl} sizeClass={sizeClass} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-tight truncate ${companyClassName ?? "text-foreground"}`}>{company}</p>
        <p className={`text-xs text-muted-foreground ${wrapTitle ? "break-words" : "truncate"}`}>{title}</p>
        {/* Third line: the company's industry. Optional - callers that are already scoped to
            one industry (the industry profile page) leave it off, and it is null until the
            company has been classified. */}
        {industry && (
          <p className="truncate text-[11px] leading-tight text-muted-foreground/80" title={industry}>
            {industry}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ManagerCard({ boss, isPending = false }: ManagerCardProps) {
  const rating = Number(boss.overallRating);
  return (
    <Link
      to={`/manager/${boss.id}`}
      className={`group relative flex h-[210px] w-full min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md min-[420px]:w-[200px] sm:p-5 ${
        isPending
          ? "border-amber-300 hover:border-amber-400 hover:shadow-amber-100"
          : "border-border hover:border-[#2e0562]/30 hover:shadow-[#2e0562]/5"
      }`}
    >
      {/* Top rated - absolute top-right, matching the company cards exactly. */}
      {!isPending && rating >= 4.5 && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          <Star size={9} className="fill-amber-500 text-amber-500" /> Top rated
        </span>
      )}

      {/* Row 1: avatar + name */}
      <div className="flex min-w-0 items-center gap-3 mb-3">
        <div className="flex-shrink-0">
          <ManagerAvatar name={boss.name} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-[#6d28d9] transition-colors leading-tight truncate">
            {boss.name}
          </h3>
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 whitespace-nowrap mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              Pending
            </span>
          )}
        </div>
      </div>

      {/* Row 2: company row */}
      <CompanyRow company={boss.company} title={boss.title} industry={boss.industry} logoUrl={boss.companyLogoUrl} />

      {/* Row 3: rating always owns its own rows on narrow cards */}
      {!isPending && (
        <div className="mt-auto min-w-0 pt-3">
          {rating > 0 ? (
            <div className="flex min-w-0 flex-col items-start">
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
              <div className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                {(boss.reviews || 0).toLocaleString()} {boss.reviews === 1 ? "review" : "reviews"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start">
              <p className="text-xs whitespace-nowrap text-muted-foreground">No ratings yet</p>
              <div className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">0 reviews</div>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}