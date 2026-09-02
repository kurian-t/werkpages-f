import API_BASE from "@/lib/api";
import { topRatedTitleClearance } from "@/lib/topRated";
import { CompanyTile } from "@/components/CompanyTile";
import { TopRatedPill } from "@/components/TopRatedPill";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Building2, Users, MessageSquare, ArrowLeft, Lock } from "lucide-react";
import { IndustryTileIcon } from "@/components/IndustryTileIcon";
import { companyPath, companyPathByName } from "@/lib/urls";
import { useQuery } from "@tanstack/react-query";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { useAuth } from "@/hooks/useAuth";
import axios from "axios";

interface CompanyEntry {
  name: string;
  slug?: string;
  logoUrl?: string;
  managerCount: number;
  totalReviews: number;
  avgRating?: number;
}

interface IndustryProfileData {
  industry: string;
  slug: string;
  companyCount: number;
  managerCount: number;
  totalReviews: number;
  avgRating?: number;
  categoryAverages: Record<string, number>;
  companies: CompanyEntry[];
}

function CategoryBreakdown({ categoryAverages }: { categoryAverages: Record<string, number> }) {
  const entries = Object.entries(categoryAverages)
    .filter(([, v]) => typeof v === "number" && !isNaN(v))
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  return (
    <div className="mb-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold text-foreground">How this industry rates across the 10 categories</h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {entries.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-1/2 flex-shrink-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[#2e0562]" style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }} />
            </div>
            <span className="w-8 flex-shrink-0 text-right text-xs font-semibold text-foreground">{value.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



export default function IndustryProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLocked = !(user?.hasContributed ?? false);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["industry-profile", slug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/industries/by-slug/${slug}`);
      return res.data as IndustryProfileData;
    },
    enabled: !!slug,
    retry: false,
  });

  const companies = data?.companies ?? [];

  // Filters the companies already loaded for this industry, rather than searching all
  // companies - searching inside Technology should not surface a bank.
  const query = search.trim().toLowerCase();
  const visible = query
    ? companies.filter(co => co.name.toLowerCase().includes(query))
    : companies;

  return (
    <Layout>
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <Link to="/industries" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#2e0562] transition-colors mb-4">
            <ArrowLeft size={15} /> All industries
          </Link>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError || !data ? (
            <div>
              <h1 className="text-[24px] font-semibold text-foreground">Industry not found</h1>
              <p className="mt-1 text-sm text-muted-foreground">This industry doesn't exist or has no companies yet.</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#2e0562]/10 text-[#2e0562]">
                <IndustryTileIcon industrySlug={data.slug} size={26} />
              </div>
              <div>
                <h1 className="text-[24px] sm:text-[30px] font-semibold leading-tight tracking-tight text-foreground">
                  {data.industry}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Building2 size={13} /> {data.companyCount} {data.companyCount === 1 ? "company" : "companies"}</span>
                  <span className="flex items-center gap-1"><Users size={13} /> {data.managerCount} {data.managerCount === 1 ? "manager" : "managers"}</span>
                  <span className="flex items-center gap-1"><MessageSquare size={13} /> {data.totalReviews} {data.totalReviews === 1 ? "review" : "reviews"}</span>
                  {data.avgRating != null && (
                    <span className="flex items-center gap-1"><Star size={13} className="fill-amber-400 text-amber-400" /> {Number(data.avgRating).toFixed(1)} avg</span>
                  )}
                  {/* After the score here, rather than above it: this header is a single line of
                      stats, and the badge reads as one more fact on that line. */}
                  <TopRatedPill rating={data.avgRating} reviewCount={data.totalReviews} variant="inline" />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">

          {/* Sidebar - mirrors the /companies layout */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="industry-company-search"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3"
                >
                  Search Companies
                </label>
                <input
                  id="industry-company-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for a company…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
                {!isLoading && !isError && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {visible.length.toLocaleString()} {visible.length === 1 ? "company" : "companies"}
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
        {!isLoading && !isError && data && Object.keys(data.categoryAverages ?? {}).length > 0 && (
          <CategoryBreakdown categoryAverages={data.categoryAverages} />
        )}

        {!isLoading && !isError && data && companies.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">No companies in this industry yet.</p>
        )}

        {companies.length > 0 && isLocked && (
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

        {/* Distinguish "industry is empty" (above) from "your search matched nothing". */}
        {!isLoading && !isError && companies.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No companies match "{search.trim()}".
          </p>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-2 auto-rows-[minmax(180px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
            {visible.map((co) => (
              <CompanyTile
                company={co}
                isLocked={isLocked}
                onClick={() => navigate(co.slug ? companyPath(data?.slug, co.slug) : companyPathByName(co.name))}
              />
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
