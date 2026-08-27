import API_BASE from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Building2, Users, Briefcase } from "lucide-react";
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
      <img src="/industry-insights-v1.png" alt="" className={imgClass} />
    </div>
  );
}

export default function Industries() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["industry-listing"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/industries/listing`);
      return res.data.data as IndustryEntry[];
    },
  });

  const industries = data ?? [];

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

        {!isLoading && !isError && industries.length > 0 && (
          <div className="grid grid-cols-2 auto-rows-[180px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
            {industries.map((ind) => (
              <button
                key={ind.slug}
                onClick={() => navigate(`/industries/${ind.slug}`)}
                className="group h-full w-full min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all min-[420px]:w-[200px] sm:p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#2e0562]/10 text-[#2e0562]">
                    <Briefcase size={18} />
                  </div>
                  <h2 className="min-w-0 flex-1 font-semibold text-sm text-foreground group-hover:text-[#6d28d9] leading-tight transition-colors line-clamp-2">
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
    </Layout>
  );
}
