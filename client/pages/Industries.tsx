import API_BASE from "@/lib/api";
import { TopRatedPill } from "@/components/TopRatedPill";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Building2, Users, Briefcase } from "lucide-react";
import { IndustryTileIcon } from "@/components/IndustryTileIcon";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface IndustryEntry {
  industry: string;
  slug: string;
  companyCount: number;
  managerCount: number;
  totalReviews: number;
  avgRating?: number;
}

/** Matches Companies.tsx and IndustryProfile.tsx — one threshold across every card type. */
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

// The Industries hero illustration.
function IndustryHeroImage({ imgClass }: { imgClass: string }) {
  return (
    <div className="w-fit">
      <img src="/industry-insights-v1.webp" alt="" width="900" height="931"
           className={imgClass} fetchPriority="high" decoding="async" />
    </div>
  );
}

export default function Industries() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["industry-listing"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/industries/listing`);
      return res.data.data as IndustryEntry[];
    },
  });

  const industries = data ?? [];

  // Client-side filter: the taxonomy is fixed at 24 entries and they all arrive in one
  // response, so there is nothing to fetch per keystroke.
  const query = search.trim().toLowerCase();
  const visible = query
    ? industries.filter(ind => ind.industry.toLowerCase().includes(query))
    : industries;

  return (
    <Layout>
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Small/medium: image above text */}
          <div className="flex flex-col items-center lg:hidden py-6 gap-3">
            <IndustryHeroImage imgClass="w-[330px] max-w-full h-auto" />
            <div className="text-center">
              <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground">
                Compare workplace experiences by industry
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                See how leadership is perceived across every corner of the world of work.
              </p>
            </div>
          </div>
          {/* Large: image left, text right */}
          <div className="hidden lg:flex items-center gap-12 py-10">
            <div className="flex-shrink-0">
              <IndustryHeroImage imgClass="w-[450px] h-auto" />
            </div>
            <div>
              <h1 className="text-[32px] font-semibold leading-snug tracking-tight text-foreground">
                Compare workplace<br />experiences by industry
              </h1>
              <p className="mt-3 max-w-md text-base text-muted-foreground">
                See how leadership is perceived across every corner of the world of work. Explore industries by how their managers are rated, and understand the culture behind each sector.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">

          {/* Sidebar — mirrors the /companies layout */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="industry-search"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3"
                >
                  Search Industries
                </label>
                <input
                  id="industry-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for an industry…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
                {!isLoading && !isError && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {visible.length.toLocaleString()} {visible.length === 1 ? "industry" : "industries"}
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground">Loading industries…</p>
        )}
        {isError && (
          <p className="text-center text-sm text-muted-foreground">Couldn't load industries. Please try again.</p>
        )}
        {!isLoading && !isError && industries.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Briefcase size={20} className="mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm font-semibold text-foreground">No industries yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Industries appear once companies have been classified.</p>
          </div>
        )}

        {/* Distinguish "nothing classified yet" (above) from "your search matched nothing". */}
        {!isLoading && !isError && industries.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No industries match "{search.trim()}".
          </p>
        )}

        {!isLoading && !isError && visible.length > 0 && (
          // 220px, not 200px: after 32px padding and the 40px icon plus its 12px gap, a 200px
          // cell left ~116px for the name, and "Telecommunications" needs ~126px at text-sm.
          // global.css applies `overflow-wrap: anywhere` to headings, so it broke mid-word
          // ("Telecommunic / ations") rather than overflowing.
          <div className="grid grid-cols-2 auto-rows-[180px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,220px)] min-[420px]:gap-4">
            {visible.map((ind) => (
              <button
                key={ind.slug}
                onClick={() => navigate(`/industries/${ind.slug}`)}
                className="group relative h-full w-full min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all min-[420px]:w-[220px] sm:p-5"
              >
                {/* Same badge as the company cards. No isLocked gate here: industry averages
                    are aggregate figures, not a specific manager's rating, so they are public. */}
                <TopRatedPill rating={ind.avgRating} reviewCount={ind.totalReviews} />
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#2e0562]/10 text-[#2e0562]">
                    <IndustryTileIcon industrySlug={ind.slug} size={20} />
                  </div>
                  {/* hyphens-auto so any name still too long to fit breaks as "Telecommu-
                      nications" rather than silently mid-word. Belt and braces alongside the
                      wider cell — the taxonomy is fixed at 24 names, but the longest of them
                      should not depend on a pixel measurement staying true. */}
                  <h2
                    lang="en"
                    className="min-w-0 flex-1 font-semibold text-sm text-foreground group-hover:text-[#6d28d9] leading-tight transition-colors line-clamp-2 hyphens-auto"
                  >
                    {ind.industry}
                  </h2>
                </div>

                {ind.avgRating != null
                  ? <StarRating rating={ind.avgRating} />
                  : <p className="text-xs text-muted-foreground">No ratings yet</p>}

                {/* flex-wrap + shrink-0, not min-w-0: min-w-0 let each stat shrink below its
                    own content width, and whitespace-nowrap then pushed the text out of that
                    shrunken box, so "13 companies" ran straight into the managers icon and the
                    gap looked like it had vanished. Now each stat keeps its intrinsic width and
                    the row wraps to a second line when the card is too narrow for both. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <Building2 size={11} className="flex-shrink-0" />
                    {ind.companyCount} {ind.companyCount === 1 ? "company" : "companies"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <Users size={11} className="flex-shrink-0" />
                    {ind.managerCount} {ind.managerCount === 1 ? "manager" : "managers"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
