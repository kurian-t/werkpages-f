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
  const rating = Number(boss.overallRating);
  return (
    <Link
      to={`/manager/${boss.id}`}
      className={`group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${
        isPending
          ? "border-amber-300 hover:border-amber-400 hover:shadow-amber-100"
          : "border-border hover:border-[#2e0562]/30 hover:shadow-[#2e0562]/5"
      }`}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0">
          <ManagerAvatar name={boss.name} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-[#2e0562] transition-colors leading-tight truncate">
            {boss.name}
          </h3>
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 whitespace-nowrap mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              Pending
            </span>
          )}
          {!isPending && rating >= 4.5 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 whitespace-nowrap mt-0.5">
              ★ Top Rated
            </span>
          )}
        </div>
      </div>

      {/* Company row */}
      <CompanyRow company={boss.company} title={boss.title} logoUrl={boss.companyLogoUrl} />

      {/* Stars + review count */}
      {!isPending && (
        <div className="mt-3 flex items-center justify-between">
          {rating > 0 ? (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={13}
                  aria-hidden="true"
                  className={s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-border"}
                />
              ))}
              <span className="ml-1 text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No ratings yet</p>
          )}
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {(boss.reviews || 0).toLocaleString()} {boss.reviews === 1 ? "review" : "reviews"}
          </span>
        </div>
      )}
    </Link>
  );
}
