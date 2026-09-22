import API_BASE from "@/lib/api";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, X, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import ManagerCard from "@/components/ManagerCard";
import LockedManagerCard from "@/components/LockedManagerCard";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { LockedPanelCard } from "@/components/LockedNotice";
import { TILE_GRID } from "@/components/ManagerTile";
import PendingSubmissions, { useMyPendingSubmissions } from "@/components/PendingSubmissions";
import { useAnalytics } from "@/hooks/useAnalytics";
import { captureSearch, captureKey, searchForManager, CAPTURE_DEBOUNCE_MS } from "@/lib/managerSearch";
import { fetchGeo } from "@/lib/geo";
import axios from "axios";

const PAGE_SIZE = 20;

export default function Directory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { track } = useAnalytics();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get("search") || "");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [hoverRating, setHoverRating] = useState(0);

  const [companyInput, setCompanyInput] = useState("");

  const [firstName,     setFirstName]     = useState(searchParams.get("search")?.split(" ")[0] || "");
  const [lastName,      setLastName]      = useState(searchParams.get("search")?.split(" ").slice(1).join(" ") || "");
  const [searchTitle,   setSearchTitle]   = useState("");
  const [searchCompany, setSearchCompany] = useState("");

  const [appliedTitle,         setAppliedTitle]         = useState("");
  const [appliedSearchCompany, setAppliedSearchCompany] = useState("");

  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    }, { replace: true });
  }, [page]);

  const allFilled = !!(firstName.trim() && lastName.trim().length >= 2 && searchTitle.trim() && searchCompany.trim().length >= 2);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!allFilled) return;
    const combined = `${firstName.trim()} ${lastName.trim()}`;
    setSearchQuery(combined);
    setAppliedSearch(combined);
    setAppliedTitle(searchTitle.trim());
    setAppliedSearchCompany(searchCompany.trim());
    setPage(1);
    track("directory_searched", { query_length: combined.length });
  }, [allFilled, firstName, lastName, searchTitle, searchCompany, track]);

  // Name + title + company is a search for one person. Anything less is browsing the directory,
  // which is a different query entirely. Signed-in or not no longer branches here — the shared
  // search owns that, which is what stopped the two halves drifting.
  const isFullSearch = !!(appliedSearch && appliedTitle && appliedSearchCompany);

  /**
   * Captures a search the person never completed, exactly as /find does.
   *
   * Somebody who types a name and a company here and then gives up used to leave nothing behind:
   * only /find recorded partial searches, so the same act on this page was silently discarded.
   */
  const lastCapturedRef = useRef<string>("");
  useEffect(() => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const t  = searchTitle.trim();
    const c  = searchCompany.trim();
    if (!fn || !ln) return;
    if (!c && !t) return;  // a bare name tells an admin nothing

    const key = captureKey({ firstName: fn, lastName: ln, title: t, companyName: c });
    if (lastCapturedRef.current === key) return;
    lastCapturedRef.current = key;

    const timer = setTimeout(() => {
      void (async () => {
        const geo = await fetchGeo().catch(() => ({}) as Awaited<ReturnType<typeof fetchGeo>>);
        await captureSearch({
          firstName: fn, lastName: ln, title: t,
          companyPayload: async () => ({ company: c, companyId: null }),
          companyName: c,
          isLoggedIn: !!user,
        }, geo);
      })();
    }, CAPTURE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [firstName, lastName, searchTitle, searchCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching: fetching, isLoading, isError } = useQuery({
    queryKey: ["managers-directory", page, appliedSearch, appliedTitle, appliedSearchCompany, selectedCompany, sortBy, isFullSearch],
    queryFn: async () => {
      // A full search - name, title and company - is the same act as /find, so it runs the same
      // code. Signed in it resolves server-side; signed out it looks up, creates the ghost once per
      // browser and returns a locked tile. Both branches used to live here in a second copy.
      if (isFullSearch) {
        const [first, ...rest] = appliedSearch.split(" ");
        const outcome = await searchForManager({
          firstName: first,
          lastName: rest.join(" "),
          title: appliedTitle,
          companyPayload: async () => ({ company: appliedSearchCompany, companyId: null }),
          companyName: appliedSearchCompany,
          isLoggedIn: !!user,
        });
        return { data: outcome.results, total: outcome.results.length, hasContributed: outcome.hasContributed };
      }
      const offset = (page - 1) * PAGE_SIZE;
      const params: any = { limit: PAGE_SIZE, offset };
      if (appliedSearch) params.search = appliedSearch;
      if (selectedCompany) params.company = selectedCompany;
      if (sortBy) params.sortBy = sortBy;
      const res = await axios.get(`${API_BASE}/api/managers`, { params });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });


  // The shared hook, not a local copy of the query: the company profile shows the same tiles, and
  // two fetches of the same list is two chances for the two pages to disagree about what is pending.
  const submittedManagers = useMyPendingSubmissions();

  const hasContributed = user?.hasContributed ?? false;

  const bosses: any[] = data?.data || [];
  const total: number = data?.total || 0;
  const error = isError ? "Failed to fetch managers" : null;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredBosses = useMemo(() => {
    const filtered = bosses.filter((boss: any) =>
      minRating === 0 || (boss.overallRating != null && boss.overallRating >= minRating)
    );
    if (!sortBy) {
      return [...filtered].sort((a, b) => {
        if (a.community && !b.community) return -1;
        if (!a.community && b.community) return 1;
        return 0;
      });
    }
    return filtered;
  }, [minRating, sortBy, bosses]);


  const clearFilters = useCallback(() => {
    setFirstName("");
    setLastName("");
    setSearchTitle("");
    setSearchCompany("");
    setSearchQuery("");
    setAppliedSearch("");
    setAppliedTitle("");
    setAppliedSearchCompany("");
    setMinRating(0);
    setSortBy("");
    setSelectedCompany("");
    setCompanyInput("");
    setPage(1);
  }, []);

  const hasActiveFilters = appliedSearch || minRating > 0 || selectedCompany;

  return (
    <Layout>
      {/* Hero */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Small/medium: image above text */}
          <div className="flex flex-col items-center lg:hidden py-6 gap-3">
            <img src="/manager-insights-v6.webp" alt="" width="900" height="600" decoding="async" className="max-h-[220px] w-auto" />
            <div className="text-center">
              <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground">
                Uncover the manager behind the job offer
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Read candid opinions from people who've worked with them.
              </p>
            </div>
          </div>
          {/* Large: image left, text right */}
          <div className="hidden lg:flex items-center gap-12 py-10">
            <div className="flex-shrink-0">
              <img src="/manager-insights-v6.webp" alt="" width="900" height="600" decoding="async" className="h-[300px] w-auto" />
            </div>
            <div>
              <h1 className="text-[32px] font-semibold leading-snug tracking-tight text-foreground">
                Uncover the manager<br />behind the job offer
              </h1>
              <p className="mt-3 max-w-md text-base text-muted-foreground">
                Read candid opinions from people who've worked with them. Know what others think about a manager's leadership style, communication, and culture fit.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">

          <aside className={`lg:w-56 flex-shrink-0 ${showFilters ? "block" : "hidden lg:block"}`}>
            <div className="space-y-6">

              {/* Person search */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3">Find a Manager</label>
                <form onSubmit={handleSearch} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    />
                    <input
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    />
                  </div>
                  <input
                    value={searchTitle}
                    onChange={e => setSearchTitle(e.target.value)}
                    placeholder="Job title"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                  <CompanyAutocomplete
                    value={searchCompany}
                    onChange={val => setSearchCompany(val)}
                    placeholder="Company"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                  <button
                    type="submit"
                    disabled={!allFilled}
                    style={{ backgroundColor: !allFilled ? '#c0b4d0' : '#2e0562' }}
                    className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
                  >
                    Search
                  </button>
                </form>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3">Minimum Rating</label>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => { setMinRating(minRating === star ? 0 : star); setPage(1); }}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${star} star${star > 1 ? "s" : ""} and up`}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        size={22}
                        className={
                          star <= (hoverRating || minRating)
                            ? "fill-amber-400 text-amber-400"
                            : "fill-none text-border"
                        }
                      />
                    </button>
                  ))}
                  {(hoverRating > 0 || minRating > 0) && (
                    <span className="ml-1.5 text-sm font-medium" style={{ color: "#6B21E8" }}>
                      and up
                    </span>
                  )}
                </div>
                {minRating > 0 && (
                  <button
                    onClick={() => { setMinRating(0); setPage(1); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {appliedSearch && (
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {fetching ? "Loading…" : `${total} result${total === 1 ? "" : "s"} for "${appliedSearch}"`}
                  </p>
                )}
                {/* Active filter chips */}
                {hasActiveFilters && (
                  <>
                    {selectedCompany && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {selectedCompany}
                        <button onClick={() => { setSelectedCompany(""); setCompanyInput(""); setPage(1); }} className="text-muted-foreground hover:text-foreground ml-0.5"><X size={11} /></button>
                      </span>
                    )}
                    {minRating > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {minRating}★+
                        <button onClick={() => { setMinRating(0); setPage(1); }} className="text-muted-foreground hover:text-foreground ml-0.5"><X size={11} /></button>
                      </span>
                    )}
                    <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear all</button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`lg:hidden inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    showFilters ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:bg-muted/60"
                  }`}
                >
                  <SlidersHorizontal size={15} />
                  Filters
                </button>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                >
                  <option value="">Featured</option>
                  <option value="rating">Top Rated</option>
                  <option value="reviews">Most Reviewed</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </div>
            </div>


            {/* Thin loading bar */}
            <div className="mb-4 h-0.5 w-full rounded-full bg-border overflow-hidden">
              {fetching && <div className="h-full bg-primary rounded-full animate-pulse w-full" />}
            </div>

            {!fetching && error && (
              <div className="rounded-xl border border-border bg-background/50 py-12 text-center">
                <p className="text-base font-semibold text-foreground">Something went wrong</p>
                <p className="mt-1.5 text-sm text-muted-foreground">Unable to load managers. Please try again.</p>
              </div>
            )}

            {!error && isLoading && (
              <div className={TILE_GRID}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-full w-full rounded-2xl border border-border bg-card p-4 shadow-sm min-[420px]:w-[200px] sm:p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-muted animate-pulse flex-shrink-0" />
                      <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                    <div className="mt-3 h-3.5 w-24 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {!error && !isLoading && (
              <div className={`transition-opacity duration-150 ${fetching ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
                {filteredBosses.length > 0 || submittedManagers.length > 0 ? (
                  <>
                    {/* Pending submissions - only visible to the submitting user */}
                    <PendingSubmissions
                      submissions={submittedManagers}
                      dividerBelow={filteredBosses.length > 0}
                    />

                    {filteredBosses.length > 0 && (
                      <div className={TILE_GRID}>
                        {filteredBosses.map((boss: any) =>
                          hasContributed ? (
                            <ManagerCard key={boss.id} boss={boss} />
                          ) : (
                            <div
                              key={boss.id}
                              className="h-full w-full min-w-0 rounded-2xl min-[420px]:w-[200px] [&>*]:box-border [&>*]:h-full [&>*]:w-full [&>*]:min-w-0 [&>*]:max-w-full"
                            >
                              <LockedManagerCard boss={boss} isLoggedIn={!!user} blurRating />
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {!hasContributed && filteredBosses.length > 0 && (
                      <LockedPanelCard
                        className="mt-6"
                        title="Rate a manager to unlock ratings"
                        hint="It's anonymous and takes 2 minutes."
                        cta={{ label: "⭐ Rate a manager", onClick: () => navigate("/add") }}
                      />
                    )}

                    {!appliedSearch && minRating === 0 && totalPages > 1 && (
                      <div className="mt-10 flex items-center justify-center gap-2">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="rounded-lg border border-border bg-background p-2 text-foreground transition-all hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={18} />
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                          .reduce((acc: (number | string)[], p, idx, arr) => {
                            if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, idx) =>
                            p === "..." ? (
                              <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
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
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    )}
                  </>
                ) : !fetching ? (
                  <div className="rounded-xl border border-border bg-background/50 py-16 text-center px-6">
                    <p className="text-lg font-semibold text-foreground">No results for "{appliedSearch}"</p>
                    <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                      Be the first to add them. It only takes 2 minutes and helps others make smarter career decisions.
                    </p>
                    <button
                      onClick={() => navigate("/add")}
                      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      + Add {appliedSearch || "a Manager"}
                    </button>
                    <p className="mt-3 text-xs text-muted-foreground">Star ratings only · Delete at any time · Anonymous by default</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}