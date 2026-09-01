import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { companyLogoDomain } from "@/lib/utils";
import { TopRatedPill } from "@/components/TopRatedPill";

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

/**
 * How far ahead of the viewport a logo starts loading.
 *
 * Native loading="lazy" would be one attribute, but the browser owns its threshold and will not
 * tell you what it is. This is the number we actually want to control: far enough ahead that a
 * logo is always ready by the time it is scrolled to, close enough that a long directory page does
 * not fetch every logo on it. Tiles are a little over 200px tall, so this is roughly three rows.
 */
const LOGO_PRELOAD_MARGIN = "800px";

/**
 * Logo domains that have already failed this session.
 *
 * Domains here are guessed from company names - "Zehrs Markets" becomes zehrsmarkets.com - so a
 * large share of them will never resolve. Without this, every tile for such a company re-requests
 * the same known-bad URL on every render and every page, and each one is billed.
 *
 * sessionStorage rather than localStorage: a logo that was missing an hour ago may exist now, and
 * a permanent negative cache would hide it indefinitely.
 */
const failedLogos = new Set<string>(
  (() => {
    try {
      if (typeof sessionStorage === "undefined") return [];
      return JSON.parse(sessionStorage.getItem("wp_failed_logos") ?? "[]") as string[];
    } catch {
      return [];
    }
  })(),
);

function rememberLogoFailure(url: string) {
  failedLogos.add(url);
  try {
    sessionStorage?.setItem("wp_failed_logos", JSON.stringify([...failedLogos]));
  } catch {
    // Private mode, or storage full. The in-memory Set still works for this page.
  }
}

/**
 * True once the element is within `rootMargin` of the viewport, and true from then on.
 *
 * Never flips back: a logo that has been loaded should not be discarded and re-fetched when it
 * scrolls away, which would turn one request into one per pass.
 */
function useNearViewport<T extends Element>(rootMargin: string, skip: boolean) {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(skip);

  useEffect(() => {
    if (skip || near) return;
    const el = ref.current;
    // No observer (jsdom, very old browsers) means load immediately. Degrading to the previous
    // behaviour is correct here; degrading to a permanently blank logo is not.
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [skip, near, rootMargin]);

  return [ref, near] as const;
}

export function CompanyLogoImg({ company, logoUrl, sizeClass, eager = false }: { company: string; logoUrl?: string; sizeClass: string; eager?: boolean }) {
  const logoDevUrl = `https://img.logo.dev/${companyLogoDomain(company)}?token=pk_MXSjJV-uTC6-L5D_FbXZUA`;
  const preferred = logoUrl ?? logoDevUrl;
  // Skip any candidate already known to fail, so a repeat visit goes straight to the letter
  // instead of re-requesting its way back down to it.
  const firstUntried = !failedLogos.has(preferred) ? preferred
                     : !failedLogos.has(logoDevUrl) ? logoDevUrl
                     : null;

  const [ref, near] = useNearViewport<HTMLDivElement>(LOGO_PRELOAD_MARGIN, eager);
  const [src, setSrc] = useState<string | null>(firstUntried);
  const initial = company.trim().charAt(0).toUpperCase();

  const handleError = () => {
    if (src) rememberLogoFailure(src);
    if (src !== logoDevUrl && !failedLogos.has(logoDevUrl)) setSrc(logoDevUrl);
    else setSrc(null);
  };

  // Same box, same border, same space. Reserving the layout here is what keeps lazy loading from
  // shifting anything as logos arrive.
  const boxClass = `${sizeClass} flex-shrink-0 rounded-md border border-slate-200`;

  if (!near) return <div ref={ref} className={`${boxClass} bg-white`} aria-hidden="true" />;

  if (src === null) {
    return (
      <div className={`${boxClass} bg-slate-100 flex items-center justify-center text-[13px] font-semibold text-slate-500`}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={company}
      // Belt and braces beneath the observer above: if this ever renders outside one, the browser
      // still declines to fetch a logo nobody can see.
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`${boxClass} object-contain bg-white`}
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
      <CompanyLogoImg company={company} logoUrl={logoUrl} sizeClass={sizeClass} eager={logoSize === "lg"} />
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
      {/* Top rated - absolute top-right, matching the company cards exactly. The shared component
          rather than a local copy of the markup: this file kept its own, which is how it ended up
          being the one surface that awarded the badge off a single five-star review. */}
      <TopRatedPill rating={rating} reviewCount={boss.reviews} hidden={isPending} />

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
          ) : null}
        </div>
      )}
    </Link>
  );
}