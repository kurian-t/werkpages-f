import API_BASE from "@/lib/api";
import { CompanyTile } from "@/components/CompanyTile";
import { CompanyTabHeader } from "@/components/CompanyTabHeader";
import { RatingColumns } from "@/components/RatingColumns";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ArrowLeft } from "lucide-react";
import { IndustryTileIcon } from "@/components/IndustryTileIcon";
import { companyPath, companyPathByName } from "@/lib/urls";
import { useQuery } from "@tanstack/react-query";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { useAuth } from "@/hooks/useAuth";
import axios from "axios";
import { Pagination, paginate } from "@/components/Pagination";

const PAGE_SIZE = 20;

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
  /** The same industry rated as a place to work and as a place to interview. */
  workplaceRating?: number | string | null;
  workplaceCount?: number;
  interviewRating?: number | string | null;
  interviewCount?: number;
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
/** Ratings arrive as a number or a numeric string depending on the driver; null means none. */
const num = (v: unknown): number | null =>
  v == null || v === "" || isNaN(Number(v)) ? null : Number(v);

function IndustryRatings({ data, hideCount }: { data: IndustryProfileData; hideCount: boolean }) {
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
      /*
        Three averages, not one.

        This page rated three separate things and showed only the managers' average, under a
        label - "industry rating" - that read as a summary of all of it. The other two were in
        the payload and nowhere on the page.
      */
      averages={
        <div>
          {/* Left, like every other heading on this page - "Industry ratings", "Strongest",
              "Weakest" and "Search companies" are all flush left, and this one alone was
              centred, which on a phone made the whole block look like it belonged elsewhere. */}
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Industry averages
          </p>
          <RatingColumns
            layout="rows"
            columns={[
              { label: "managers avg",   value: num(data.avgRating),       count: data.totalReviews ?? 0 },
              { label: "company avg",    value: num(data.workplaceRating), count: data.workplaceCount ?? 0 },
              { label: "interviews avg", value: num(data.interviewRating), count: data.interviewCount ?? 0 },
            ]}
          />
        </div>
      }
      score={data.avgRating ?? null}
      /*
        "manager opinion", not "review".

        This average is AVG(managers.overall_rating) over the industry - manager reviews only.
        Workplace ratings and interview experiences are separate datasets with separate gates and
        neither is in it. Labelling the number "industry rating" over a count of bare "reviews"
        invited exactly the reading it should not: that it summarises everything known about the
        industry.
      */
      countLabel="review"
      countValue={data.totalReviews ?? 0}
      scoreLabel="avg manager rating"
      /*
        The industry's average stays public - this page is deliberately not gated. What is not
        shown to somebody who has yet to rate a manager is how few reviews it rests on: "2
        reviews (limited data, interpret cautiously)" is the least inviting thing the page can
        say to the one reader it is trying to turn into a contributor.
      */
      hideCount={hideCount}
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
  const [page, setPage] = useState(1);

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
  const matching = query
    ? companies.filter(co => co.name.toLowerCase().includes(query))
    : companies;

  // Paged like the companies listing. paginate() clamps, so narrowing the search while on a later
  // page lands on the last page with results rather than on an empty grid.
  const { visible, totalPages, safePage } = paginate(matching, page, PAGE_SIZE);

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
          <IndustryRatings data={data} hideCount={isLocked} />
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
                    {matching.length.toLocaleString()} {matching.length === 1 ? "company" : "companies"}
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

        {/*
          No lock banner above the companies.

          The industry's own ratings are public - they are right there at the top of this page -
          so a card announcing that ratings are locked contradicted the page it sat on. What is
          actually gated here is each company's score, and the tiles below say so themselves, one
          per company, where the withheld number is. The banner added a second, louder voice
          saying the same thing about figures the reader could already see.
        */}

        {/* Distinguish "industry is empty" (above) from "your search matched nothing". */}
        {!isLoading && !isError && companies.length > 0 && matching.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No companies match "{search.trim()}".
          </p>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-2 auto-rows-[minmax(180px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
            {visible.map((co) => (
              /* Keyed by identity: without it React reuses tiles by position across pages, and
                 CompanyLogoImg keeps the previous company's logo. See Companies.tsx. */
              <CompanyTile
                key={co.slug ?? co.name}
                company={co}
                isLocked={isLocked}
                onClick={() => navigate(co.slug ? companyPath(data?.slug, co.slug) : companyPathByName(co.name))}
              />
            ))}
          </div>
        )}

        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
