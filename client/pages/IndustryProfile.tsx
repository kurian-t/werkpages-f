import API_BASE from "@/lib/api";
import { CompanyTile } from "@/components/CompanyTile";
import { CompanyTabHeader } from "@/components/CompanyTabHeader";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ArrowLeft, Lock } from "lucide-react";
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

/*
  The industry's ratings, in the shape the rest of the site states ratings in.

  This was a card of its own - "How this industry rates across the 10 categories" - with its own
  bar style and its own heading, sitting above the company list. Three different presentations of
  the same idea across three pages taught a reader nothing and made the industry page look like a
  different product. It now uses CompanyTabHeader, the same component the workplace and interview
  tabs use, so an average reads the same way wherever it appears.
*/
function IndustryRatings({ data }: { data: IndustryProfileData }) {
  const entries = Object.entries(data.categoryAverages ?? {})
    .filter(([, v]) => typeof v === "number" && !isNaN(v))
    .map(([label, value]) => ({ label, value }));
  if (entries.length === 0) return null;

  /*
    One sorted list, split - never two independent slices. Taking a top three and a bottom three
    from a short list returns the same rows in both, and a category then appears as a strength and
    a weakness at once.
  */
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const cut = Math.max(3, sorted.length - 3);

  return (
    <CompanyTabHeader
      eyebrow="Industry ratings"
      subtitle={`How managers are rated across ${data.industry}`}
      score={data.avgRating ?? null}
      countLabel="review"
      countValue={data.totalReviews ?? 0}
      scoreLabel="industry rating"
      metrics={[
        { icon: "companies",
          value: String(data.companyCount ?? 0),
          label: (data.companyCount ?? 0) === 1 ? "company" : "companies" },
        { icon: "managers",
          value: String(data.managerCount ?? 0),
          label: (data.managerCount ?? 0) === 1 ? "manager" : "managers" },
      ]}
      highlights={[
        ...sorted.slice(0, 3).map((e) => ({ direction: "up" as const, label: e.label, value: e.value })),
        ...sorted.slice(cut).map((e) => ({ direction: "down" as const, label: e.label, value: e.value })),
      ]}
    />
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
                {/*
                  Identity only: the icon and the name, the way a company page carries a logo and a
                  name.

                  The company, manager and review counts and the average used to sit here as four
                  stats. The ratings header below now states all of them, in the shape the rest of
                  the site states them - so keeping them here printed the same figures twice within
                  one screen. The top-rated badge goes with them: it qualifies the average, and the
                  average is no longer on this line.
                */}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/*
          Full content width, above the two-column layout.

          It used to sit inside the right-hand column, so its closing rule started level with the
          sidebar and stopped short - a line that looked like a mistake rather than a division. The
          company page puts its equivalent header here, with everything else below the rule; this
          now matches, and the search reads as part of what follows rather than as a neighbour of
          the ratings.
        */}
        {!isLoading && !isError && data && Object.keys(data.categoryAverages ?? {}).length > 0 && (
          <IndustryRatings data={data} />
        )}

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
