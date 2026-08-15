import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { companyLogoDomain } from "@/lib/utils";

interface Manager {
  id: number;
  name: string;
  company: string;
  title: string;
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
  // Try the stored URL first (Clearbit or explicit logo.dev), fall back to logo.dev derived
  // from the company name, then show a letter placeholder as last resort.
  const initialSrc = logoUrl ?? logoDevUrl;
  const [src, setSrc] = useState(initialSrc);
  const [failed, setFailed] = useState(false);
  const initial = company.trim().charAt(0).toUpperCase();

  const handleError = () => {
    if (src !== logoDevUrl) {
      setSrc(logoDevUrl);
    } else {
      setFailed(true);
    }
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

export function CompanyRow({ company, title, logoUrl, logoSize = "md", wrapTitle = false, companyClassName }: { company: string; title: string; logoUrl?: string; logoSize?: "md" | "lg"; wrapTitle?: boolean; companyClassName?: string }) {
  const sizeClass = logoSize === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    <div className="flex items-center gap-2">
      <CompanyLogoImg company={company} logoUrl={logoUrl} sizeClass={sizeClass} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-tight truncate ${companyClassName ?? "text-foreground"}`}>{company}</p>
        <p className={`text-xs text-muted-foreground ${wrapTitle ? "break-words" : "truncate"}`}>{title}</p>
      </div>
    </div>
  );
}

export default function ManagerCard({ boss, isPending = false }: ManagerCardProps) {
  return (
    <Link
      to={`/manager/${boss.id}`}
      className={`group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${
        isPending
          ? "border-amber-300 hover:border-amber-400 hover:shadow-amber-100"
          : "border-border hover:border-primary/30 hover:shadow-primary/5"
      }`}
    >
      {isPending && (
        <div className="mb-3 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            Pending
          </span>
        </div>
      )}

      {!isPending && Number(boss.overallRating) >= 4.5 && (
        <div className="mb-3 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 whitespace-nowrap">
            ★ Top Rated
          </span>
        </div>
      )}

      <ManagerAvatar name={boss.name} />

      <h3 className="mt-3 text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
        {boss.name}
      </h3>

      <div className="mt-2 mb-auto">
        <CompanyRow company={boss.company} title={boss.title} logoUrl={boss.companyLogoUrl} />
      </div>

      {!isPending && (
        <div className="mt-4 flex items-center gap-1.5">
          <Star
            size={14}
            aria-hidden="true"
            className={boss.overallRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
          />
          <span className="text-sm font-bold text-foreground">
            {boss.overallRating ? Number(boss.overallRating).toFixed(1) : "No ratings"}
          </span>
          {Number(boss.overallRating) > 0 && (
            <span className="text-xs text-muted-foreground">
              ({(boss.reviews || 0).toLocaleString()} {boss.reviews === 1 ? "review" : "reviews"})
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
