import API_BASE from "@/lib/api";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Building2, Users, MessageSquare, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { TopRatedPill } from "@/components/TopRatedPill";

import { companyPath, companyPathByName } from "@/lib/urls";
import { useAuth } from "@/hooks/useAuth";
import axios from "axios";

const PAGE_SIZE = 20;

interface CompanyEntry {
  name: string;
  slug?: string;
  logoUrl?: string;
  industry?: string;
  industrySlug?: string;
  managerCount: number;
  totalReviews: number;
  avgRating?: number;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
          className={`flex-shrink-0 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-border"}`}
        />
      ))}
      <span className="ml-1 flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-none text-foreground">{rating.toFixed(1)}</span>
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

export default function Companies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);

  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    }, { replace: true });
  }, [page]);

  const hasContributed = user?.hasContributed ?? false;
  const isLocked = !hasContributed;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-listing"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/listing`);
      return res.data.data as CompanyEntry[];
    },
    // Inherit the global staleTime: 0 so persisted data shows instantly and a background
    // refetch runs on every mount/focus. This keeps manager counts current for ALL users
    // as soon as they open the Companies tab, rather than showing a 5-minute-stale snapshot.
  });

  const companies = data ?? [];
  const totalPages = Math.ceil(companies.length / PAGE_SIZE);
  const displayed = companies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // industrySlug is optional: the company cards know it, but the autocomplete only yields a
  // name, and the industry cannot be known until the company is resolved. Without it we send
  // the un-nested lookup URL, and CompanyProfile redirects to the canonical path on load.
  const goToCompany = (name: string, slug?: string, industrySlug?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    navigate(slug ? companyPath(industrySlug, slug) : companyPathByName(trimmed));
  };

  return (
    <Layout>
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Small/medium: image above text */}
          <div className="flex flex-col items-center lg:hidden py-6 gap-3">
            <img src="/company-insights-v1.webp" alt="" width="900" height="600" decoding="async" className="max-h-[220px] w-auto" />
            <div className="text-center">
              <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground">
                See the culture behind the company
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Explore how leadership is rated across roles and teams.
              </p>
            </div>
          </div>
          {/* Large: image left, text right */}
          <div className="hidden lg:flex items-center gap-12 py-10">
            <div className="flex-shrink-0">
              <img src="/company-insights-v1.webp" alt="" width="900" height="600" decoding="async" className="h-[300px] w-auto" />
            </div>
            <div>
              <h1 className="text-[32px] font-semibold leading-snug tracking-tight text-foreground">
                See the culture<br />behind the company
              </h1>
              <p className="mt-3 max-w-md text-base text-muted-foreground">
                Explore companies by how their managers are perceived. Understand what others think about their leadership style, communication, and culture fit.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">

          {/* Sidebar - mirrors /directory layout */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3">Search Companies</label>
                <form onSubmit={(e) => { e.preventDefault(); goToCompany(search); }}>
                  <CompanyAutocomplete
                    value={search}
                    onChange={setSearch}
                    onSuggestionSelect={(name) => goToCompany(name)}
                    onClear={() => setSearch("")}
                    placeholder="Search for a company…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                </form>
                {!isLoading && !isError && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {companies.length.toLocaleString()} {companies.length === 1 ? "company" : "companies"}
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">

        {isLoading && (
          <div className="grid grid-cols-2 auto-rows-[minmax(180px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-full w-full rounded-2xl border border-border bg-card p-4 shadow-sm animate-pulse min-[420px]:w-[200px] sm:p-5">
                <div className="flex min-w-0 items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="h-4 w-28 rounded bg-muted" />
                </div>
                <div className="h-3 w-20 rounded bg-muted mb-2" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-border bg-background/50 py-12 text-center">
            <p className="text-base font-semibold text-foreground">Something went wrong</p>
            <p className="mt-1 text-sm text-muted-foreground">Unable to load companies. Please try again.</p>
          </div>
        )}

        {!isLoading && !isError && companies.length === 0 && (
          <div className="rounded-xl border border-border bg-background/50 py-16 text-center">
            <Building2 size={40} className="mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-base font-semibold text-foreground">No companies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a manager to get started.</p>
          </div>
        )}

        {!isLoading && !isError && companies.length > 0 && (
          <>
            {isLocked && (
              <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-center">
                <Lock size={18} className="mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm font-semibold text-foreground">Rate a manager to unlock ratings</p>
                <p className="mt-1 text-xs text-muted-foreground">Company ratings become visible after you submit your first review.</p>
                <button
                  onClick={() => navigate("/add")}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors"
                >
                  ⭐ Rate a manager
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 auto-rows-[minmax(180px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
              {displayed.map((co) => (
                <button
                  key={co.name}
                  onClick={() => goToCompany(co.name, co.slug, co.industrySlug)}
                  className="group relative h-full w-full min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all min-[420px]:w-[200px] sm:p-5"
                >
                  {/*
                    The badge gets its own row instead of the top-right corner. This card puts the
                    name beside a 48px logo, so a corner badge leaves the first line about 44px on
                    a 200px card - too narrow to clear by padding (it truncates the name to
                    "Ciel Lu...") and too narrow to flow around (the name breaks mid-word). Out of
                    the title's line there is no collision to solve.

                    The row is reserved on every card, not only the ones that earned a badge, so
                    logos and names line up across a grid where some tiles have it and some do not.
                  */}
                  <div className="mb-1.5 flex h-[18px] items-start justify-end">
                    <TopRatedPill
                      rating={co.avgRating}
                      reviewCount={co.totalReviews}
                      hidden={isLocked}
                      variant="inline"
                    />
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <CompanyLogoImg
                      company={co.name}
                      logoUrl={co.logoUrl}
                      sizeClass="h-12 w-12"
                    />
                    <div className="min-w-0 flex-1">
                      {/* Full width: nothing overlaps this line any more. */}
                      <h2 className="font-semibold text-sm text-foreground group-hover:text-[#6d28d9] leading-tight transition-colors line-clamp-2">
                        {co.name}
                      </h2>
                      {/* Plain text, not a Link: this whole card is a <button>, and nesting an
                          anchor inside it is invalid HTML and steals the card's click. The
                          industry is clickable on the company profile page instead. */}
                      {co.industry && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={co.industry}>
                          {co.industry}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isLocked && co.avgRating != null && <StarRating rating={co.avgRating} />}
                  {!isLocked && co.avgRating == null && <p className="text-xs text-muted-foreground">No ratings yet</p>}
                  {isLocked && <LockedStars />}

                  <div className="mt-3 flex flex-col items-start gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                      <Users size={11} className="flex-shrink-0" />
                      {isLocked
                        ? <span className="inline-block h-2.5 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                        : <span className="whitespace-nowrap">{co.managerCount} {co.managerCount === 1 ? "manager" : "managers"}</span>}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                      <MessageSquare size={11} className="flex-shrink-0" />
                      {isLocked
                        ? <span className="inline-block h-2.5 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                        : <span className="whitespace-nowrap">{co.totalReviews} {co.totalReviews === 1 ? "review" : "reviews"}</span>}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-border bg-background p-2 text-foreground transition-all hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                          page === p
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-border bg-background p-2 text-foreground transition-all hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
          </div>{/* end flex-1 */}
        </div>{/* end flex-row */}
      </div>
    </Layout>
  );
}