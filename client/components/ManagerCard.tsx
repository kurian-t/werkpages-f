import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { logoDevUrl as buildLogoDevUrl, logoCandidates, companyIdentityOf } from "@/lib/logo";
import { TopRatedPill } from "@/components/TopRatedPill";
import { Stars } from "@/components/Stars";
import { ManagerTile } from "@/components/ManagerTile";

interface Manager {
  id: number;
  name: string;
  company: string;
  title: string;
  industry?: string;
  overallRating?: number;
  reviews?: number;
  /**
   * The platform example's own number, when this manager has no genuine rating.
   *
   * Separate from overallRating on purpose. An example is outside every statistic by provenance,
   * so the genuine figure is correctly absent for a brand-new ghost - and the tile, reading only
   * that, drew an empty space where the rating goes. Keeping them apart is what stops a fabricated
   * number reaching the Top Rated pill or any sort order.
   */
  exampleRating?: number | null;
  exampleReviews?: number | null;
  status?: string;
  country?: string;
  companyLogoUrl?: string;
  approvalStatus?: string;
  /**
   * Current, former or unknown, for this manager AT THE COMPANY whose page is showing the tile.
   *
   * Absent everywhere else, and that is deliberate: the directory shows a manager without a
   * company context, so there is no employment to be current at. An absent value renders nothing
   * rather than rendering "Unknown".
   */
  employmentStatus?: string;
}

interface ManagerCardProps {
  boss: Manager;
  isPending?: boolean;
  /**
   * Where the tile links. Defaults to /manager/:id.
   *
   * Exists so a company page can point at the canonical nested path without keeping its own copy
   * of this markup - which is what it used to do, and why an unrated manager there rendered
   * "No ratings yet0 reviews" while the same tile in the directory did not.
   */
  to?: string;
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

/**
 * A company's logo, or its initial.
 *
 * <p>`from` is the record the logo belongs to - a company row, a manager row, anything carrying
 * the company's resolved identity. It is read by companyIdentityOf, which understands every
 * shape the API returns, so a call site passes ONE prop and cannot forget half of a pair.
 *
 * <p>`domain` and `brandfetchIconUrl` remain as overrides for callers holding the values loose.
 */
export function CompanyLogoImg({ company, logoUrl, from, domain, brandfetchIconUrl, sizeClass, eager = false }: { company: string; logoUrl?: string; from?: unknown; domain?: string | null; brandfetchIconUrl?: string | null; sizeClass: string; eager?: boolean }) {
  const identity = companyIdentityOf(from);
  const useDomain = domain ?? identity.domain;
  const useIcon   = brandfetchIconUrl ?? identity.brandfetchIconUrl;
  /*
    Every source worth trying, best first: the stored URL, then logo.dev, then the free
    unmetered fallback. The order lives in lib/logo.ts because the career timeline walks the
    same one - when logo.dev's monthly quota ran out, a chain that stopped at logo.dev turned
    every logo on the site into a letter.
  */
  const candidates = logoCandidates(company, logoUrl, useDomain, useIcon);
  const preferred = candidates[0];
  // Skip any candidate already known to fail, so a repeat visit goes straight to the letter
  // instead of re-requesting its way back down to it.
  const firstUntried = candidates.find((c) => !failedLogos.has(c)) ?? null;

  const [ref, near] = useNearViewport<HTMLDivElement>(LOGO_PRELOAD_MARGIN, eager);
  const [src, setSrc] = useState<string | null>(firstUntried);
  const initial = company.trim().charAt(0).toUpperCase();

  // useState reads its argument once per instance, so a reused instance keeps the previous
  // company's logo no matter what props arrive. Callers should key this by company - and where one
  // forgets, this resyncs rather than displaying a logo belonging to somebody else, which is a
  // worse failure than no logo at all.
  const shownFor = useRef(preferred);
  useEffect(() => {
    if (shownFor.current !== preferred) {
      shownFor.current = preferred;
      setSrc(firstUntried);
    }
  }, [preferred, firstUntried]);

  const handleError = () => {
    if (src) rememberLogoFailure(src);
    // Down the list, never back up it. Running out is what "show the initial" means.
    setSrc(candidates.find((c) => c !== src && !failedLogos.has(c)) ?? null);
  };

  // Same box, same border, same space. Reserving the layout here is what keeps lazy loading from
  // shifting anything as logos arrive.
  const boxClass = `${sizeClass} flex-shrink-0 rounded-md border border-slate-200`;

  if (!near) return <div ref={ref} className={`${boxClass} bg-white`} aria-hidden="true" />;

  if (src === null) {
    return (
      /*
        Decorative, and hidden from assistive technology.

        The company's name is always rendered beside this, so the initial adds nothing a screen
        reader needs - and it actively harms: inside a typeahead option it became part of the
        option's accessible NAME, turning "Crumbl" into "C Crumbl" and breaking selection by
        name for anyone navigating that way. The <img> it replaced carried alt="" and was
        already decorative; this restores that.
      */
      <div
        aria-hidden="true"
        className={`${boxClass} bg-slate-100 flex items-center justify-center text-[13px] font-semibold text-slate-500`}
      >
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

export function CompanyRow({ company, title, industry, logoUrl, from, domain, brandfetchIconUrl, logoSize = "md", wrapTitle = false, companyClassName }: { company: string; title: string; industry?: string; logoUrl?: string; from?: unknown; domain?: string | null; brandfetchIconUrl?: string | null; logoSize?: "md" | "lg"; wrapTitle?: boolean; companyClassName?: string }) {
  // Bumped a step (md 8→10, lg 10→12): with the industry as a third line, the old sizes
  // left the logo visually undersized against the text column beside it.
  // Changing "lg" changes the indent the manager profile uses to align its industry line -
  // see the ml-14 in BossProfile.
  const sizeClass = logoSize === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <CompanyLogoImg company={company} logoUrl={logoUrl} from={from} domain={domain} brandfetchIconUrl={brandfetchIconUrl} sizeClass={sizeClass} eager={logoSize === "lg"} />
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

export default function ManagerCard({ boss, isPending = false, to }: ManagerCardProps) {
  const rating = Number(boss.overallRating);
  /*
    Shown ONLY when there is no genuine rating. A manager with both has been rated by a person,
    and the example is retired the moment that happens, so the two should never coincide; the
    guard is here because a tile must not be the place that discovers otherwise.
  */
  const exampleRating = Number(boss.exampleRating);
  const showExample = !(rating > 0) && exampleRating > 0;
  return (
    // The shared box, not this file's own copy of it. See ManagerTile.
    <ManagerTile to={to ?? `/manager/${boss.id}`} tone={isPending ? "pending" : "default"}>
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
          {/*
            CURRENT OR FORMER, and nothing at all for unknown.

            "Current" is a claim about somebody's present employment, so it is only shown where
            there is accepted employment and the evidence for it is still fresh. "Former" only
            claims that every known episode finished.

            Unknown renders NOTHING rather than a third chip. It is the absence of information,
            and the overwhelming majority of tiles have it: a manager reaching a company page by
            the company string or by a rating has no accepted employment record at all, which is
            the correct answer and not a thing to announce on every card. The API still returns
            the value, so a surface that wants to show it can.
          */}
          {!isPending && (boss.employmentStatus === "current"
            || boss.employmentStatus === "former") && (
            <span
              data-testid="employment-status"
              data-status={boss.employmentStatus}
              className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                boss.employmentStatus === "current"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {boss.employmentStatus === "current" ? "Current" : "Former"}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: company row */}
      <CompanyRow company={boss.company} title={boss.title} industry={boss.industry} logoUrl={boss.companyLogoUrl} from={boss} />

      {/* Row 3: rating always owns its own rows on narrow cards */}
      {!isPending && (
        <div className="mt-auto min-w-0 pt-3">
          {showExample ? (
            /*
              THE EXAMPLE, LABELLED IN WORDS rather than with the ExampleRatingBadge pill.

              That pill is an InfoPill carrying a tooltip, and this whole tile is a link. Nesting
              an interactive tooltip inside an anchor is how a tile stops being clickable, which
              is the failure mode this flow has had in production more than once. The label still
              says plainly what the number is, which is the point of it.
            */
            <div className="flex min-w-0 flex-col items-start"
                 data-testid="manager-card-example-rating">
              <Stars rating={exampleRating} />
              <div className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                Example rating
              </div>
            </div>
          ) : rating > 0 ? (
            <div className="flex min-w-0 flex-col items-start">
              {/*
                The shared Stars, not a local five-star loop.

                This one rounded, so 4.5 drew five solid stars - indistinguishable from a
                perfect score, with the number beside it saying otherwise. Every copy of this
                loop in the product had the same bug, which is what copies do.
              */}
              <Stars rating={rating} />
              <div className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                {(boss.reviews || 0).toLocaleString()} {boss.reviews === 1 ? "review" : "reviews"}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </ManagerTile>
  );
}