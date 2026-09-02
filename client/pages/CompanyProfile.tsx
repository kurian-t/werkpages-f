import API_BASE from "@/lib/api";
import { TopRatedPill } from "@/components/TopRatedPill";
import { CompanyTile } from "@/components/CompanyTile";
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Building2, Users, MessageSquare, TrendingUp, TrendingDown, ChevronLeft, PlusCircle, Lock, Pencil } from "lucide-react";
import { IndustryIcon } from "@/components/IndustryIcon";
import { companyPath, managerPath } from "@/lib/urls";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ManagerAvatar, CompanyLogoImg, CompanyRow } from "@/components/ManagerCard";
import { useAuth } from "@/hooks/useAuth";
import LockedManagerCard from "@/components/LockedManagerCard";
import ManagerCard from "@/components/ManagerCard";
import { fetchGeo } from "@/lib/geo";
import { InterviewPanel } from "@/components/InterviewPanel";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
const FAKE_NAME_PARTS = new Set([
  "test", "fake", "admin", "null", "undefined", "anonymous",
  "unknown", "none", "nope", "asdf", "qwerty", "aaaa", "xxxx", "blah", "lorem", "ipsum",
]);
const FAKE_FULL_NAMES = new Set([
  "john doe", "jane doe", "john smith", "jane smith",
  "test user", "test manager", "test test",
  "foo bar", "foo foo", "bar baz",
  "first last", "firstname lastname",
]);
const NAME_LETTERS_ONLY = /^[a-zA-ZÀ-ÖØ-öø-ÿ'**\\\**-**\\\**s]+$/;
function validateManagerName(firstName: string, lastName: string): string | null {
  const f = firstName.trim();
  const l = lastName.trim();
  if (!NAME_LETTERS_ONLY.test(f) || !NAME_LETTERS_ONLY.test(l)) {
    return "Name should only contain letters";
  }
  const fl = f.toLowerCase();
  const ll = l.toLowerCase();
  if (FAKE_NAME_PARTS.has(fl) || FAKE_NAME_PARTS.has(ll)) {
    return "This doesn't appear to be a real person's name";
  }
  if (FAKE_FULL_NAMES.has(`${fl} ${ll}`)) {
    return "This doesn't appear to be a real person's name";
  }
  return null;
}
interface ManagerEntry {
  id: number;
  name: string;
  title: string;
  image?: string;
  overallRating?: number;
  reviewsCount: number;
  company: string;
  companyLogoUrl?: string;
  approvalStatus?: string;
  slug?: string;
}
interface CompanyData {
  id: number;
  name: string;
  slug?: string;
  logoUrl?: string;
  industry?: string;
  industrySlug?: string;
  managerCount: number;
  totalReviews: number;
  avgRating?: number;
  categoryAverages: Record<string, number>;
  managers: ManagerEntry[];
  /** The company this one belongs to, when it belongs to one. */
  partOf?: GroupCompany;
  /** The companies that belong to this one. */
  companiesInGroup?: GroupCompany[];
  /**
   * Management across the whole group. A separate figure from avgRating above, never a
   * replacement: this company's rating still means this company's managers.
   */
  groupStats?: {
    companyCount: number;
    managerCount: number;
    totalReviews: number;
    avgRating?: number;
  };
}
/**
 * A company related to this one by ownership. Deliberately carries its own rating and counts:
 * a subsidiary's score is its own, never folded into its parent's.
 */
interface GroupCompany {
  id: number;
  name: string;
  slug?: string;
  logoUrl?: string;
  managerCount?: number;
  totalReviews?: number;
  avgRating?: number;
  relationshipType?: string;
}
function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          className={s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-none text-border"}
        />
      ))}
    </div>
  );
}
function RatingBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-[#6d5091]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-6 text-right">{value.toFixed(1)}</span>
    </div>
  );
}
const GHOST_SLOTS = [
  { initials: "JW", name: "James Wilson",   role: "Senior Product Manager",   color: "bg-violet-500", rating: "4.3", reviews: 12 },
  { initials: "SC", name: "Sarah Chen",     role: "Director of Engineering",  color: "bg-sky-500",    rating: "3.8", reviews: 7  },
  { initials: "MT", name: "Michael Torres", role: "VP of Operations",         color: "bg-emerald-600",rating: "4.7", reviews: 21 },
];
function GhostManagerCard({ index, company, logoUrl, isLoggedIn }: { index: number; company: string; logoUrl?: string; isLoggedIn: boolean }) {
  const slot = GHOST_SLOTS[index % GHOST_SLOTS.length];
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-background p-5 shadow-sm select-none pointer-events-none relative overflow-hidden">
      {/* Badge - identical to LockedManagerCard */}
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
        <Lock size={10} />
        {"Rate to unlock"}
      </div>
      {/* Avatar - same size as LockedManagerCard's default ManagerAvatar, blurred */}
      <div className={`h-16 w-16 rounded-2xl ${slot.color} flex items-center justify-center blur-sm`}>
        <span className="text-xl font-bold text-white">{slot.initials}</span>
      </div>
      {/* Blurred name */}
      <h3 className="mt-3 text-[15px] font-semibold text-foreground leading-tight blur-sm pr-16">{slot.name}</h3>
      {/* Company row - logo + name visible, role blurred - matches CompanyRow layout */}
      <div className="mt-2 mb-auto flex items-center gap-2">
        <CompanyLogoImg company={company} logoUrl={logoUrl} sizeClass="h-8 w-8 rounded-md flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{company}</p>
          <p className="text-xs text-muted-foreground truncate blur-sm">{slot.role}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 blur-sm select-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`text-base leading-none ${i <= Math.round(parseFloat(slot.rating)) ? "text-amber-400" : "text-muted-foreground/25"}`}>★</span>
        ))}
        <span className="ml-1 text-sm font-semibold text-foreground">{slot.rating}</span>
      </div>
    </div>
  );
}
const SIDEBAR_INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";
export default function CompanyProfile() {
  const { industrySlug: industryParam, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Sidebar search state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasContributed, setSearchHasContributed] = useState(false);
  const [ghostAdded, setGhostAdded] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [renameMode, setRenameMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const allFilled = firstName.trim().length > 0 && lastName.trim().length >= 2 && title.trim().length > 0;
  const handleRename = async () => {
    if (!data || !newName.trim()) return;
    setRenaming(true);
    try {
      await axios.put(`${API_BASE}/api/admin/companies/${data.id}`, { name: newName.trim() });
      setRenameMode(false);
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
      queryClient.invalidateQueries({ queryKey: ["company-listing"] });
      navigate("/companies", { replace: true });
      toast.success("Company renamed successfully");
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      toast.error(msg || "Failed to rename company");
    } finally {
      setRenaming(false);
    }
  };
  const clearSearch = () => {
    setFirstName("");
    setLastName("");
    setTitle("");
    setSearchResults(null);
    setGhostAdded(false);
    setSearchHasContributed(false);
    setSearchError(null);
  };
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allFilled) return;
    const nameError = validateManagerName(firstName, lastName);
    if (nameError) {
      setSearchError(nameError);
      setSearchResults([]);
      setGhostAdded(false);
      setSearchLoading(false);
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    setGhostAdded(false);
    try {
      const geo = await fetchGeo();
      if (user) {
        const res = await axios.post(`${API_BASE}/api/managers/find-or-create`, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          title: title.trim(),
          company: data?.name ?? "",
          country: geo.country,
          state: geo.state,
          city: geo.city,
        });
        setSearchResults(res.data.data ?? []);
        setSearchHasContributed(res.data.hasContributed ?? false);
        queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
      } else {
        const search = `${firstName.trim()} ${lastName.trim()}`;
        const res = await axios.get(`${API_BASE}/api/managers`, {
          params: { search, limit: 8, offset: 0 },
        });
        const anonData = res.data.data ?? [];
        setSearchHasContributed(false);
        if (anonData.length > 0) {
          setSearchResults(anonData);
        } else {
          const ghostKey = "rmm_anon_ghost_created";
          if (!localStorage.getItem(ghostKey)) {
            let ghostCreated = false;
            try {
              await axios.post(`${API_BASE}/api/managers/ghost`, {
                name: `${firstName.trim()} ${lastName.trim()}`,
                company: data?.name ?? "",
                title: title.trim(),
                country: geo.country,
                state: geo.state,
                city: geo.city,
              });
              localStorage.setItem(ghostKey, "true");
              ghostCreated = true;
            } catch {
              // Ghost creation failed - leave results empty
            }
            if (ghostCreated) {
              queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
              try {
                const retryRes = await axios.get(`${API_BASE}/api/managers`, {
                  params: { search, limit: 8, offset: 0 },
                });
                const retryData = retryRes.data.data ?? [];
                if (retryData.length > 0) {
                  setSearchResults(retryData);
                } else {
                  setGhostAdded(true);
                  setSearchResults([]);
                }
              } catch {
                setGhostAdded(true);
                setSearchResults([]);
              }
            } else {
              setSearchResults([]);
            }
          } else {
            setSearchResults([]);
          }
        }
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };
  const isLocked = !user?.hasContributed;
  // A company profile answers two different questions for two different readers: what it is
  // like to work here, and what it is like to try to get hired here. They share a company but
  // nothing else - different reviewers, different ratings, different contribution gate.
  // The tab lives in the URL, not in component state. Without that, a refresh drops you back on
  // the first tab, the link you share never opens where you were, and returning from the add
  // form lands on the wrong half of the page.
  // The interview tab is not shown until someone has rated a manager. Manager ratings are the
  // primary data this site collects, and a second contribution surface offered alongside them
  // competes for the same attention. Once that first review exists the product expands: the tab
  // appears, still locked, and an interview experience is what opens it.
  const canSeeInterviewTab = !isLocked;
  const requestedTab = searchParams.get("tab");
  const activeTab: "working" | "hiring" =
    requestedTab === "hiring" && canSeeInterviewTab ? "hiring" : "working";
  const setActiveTab = (next: "working" | "hiring" | ((current: "working" | "hiring") => "working" | "hiring")) => {
    const value = typeof next === "function" ? next(activeTab) : next;
    const params = new URLSearchParams(searchParams);
    // "working" is the default, so it stays out of the URL and the canonical link is unchanged.
    if (value === "hiring") params.set("tab", "hiring");
    else params.delete("tab");
    // replace, not push: flipping a tab is not a navigation someone wants to press Back through.
    setSearchParams(params, { replace: true });
  };
  // Detect whether the URL param is a slug (lowercase, no spaces) or a legacy name.
  // Name-based navigation from the search form still works through the by-name fallback.
  const isSlugParam = !!companySlug && /^[a-z0-9-]+$/.test(companySlug);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-profile-slug", companySlug],
    queryFn: async () => {
      if (isSlugParam) {
        const res = await axios.get(`${API_BASE}/api/companies/by-slug/${companySlug}`);
        return res.data as CompanyData;
      }
      const decoded = decodeURIComponent(companySlug ?? "");
      const res = await axios.get(`${API_BASE}/api/companies/by-name`, {
        params: { company: decoded },
      });
      return res.data as CompanyData;
    },
    enabled: !!companySlug,
    // Inherit the global staleTime: 0 so the company's manager count / stats refresh in the
    // background on every mount/focus - keeping them current for all users, not 5-min stale.
    retry: false,
  });
  // The tab strip shows how many interview experiences exist before you open the tab. This uses
  // the same query key the panel uses with no filters applied, so React Query serves both from
  // one request rather than fetching twice.
  const { data: interviewStats } = useCompanyInterviews(data?.slug ?? "");
  const interviewCount = interviewStats?.reviewCount ?? null;
  const totalContributions = (data?.totalReviews ?? 0) + (interviewCount ?? 0);
  // Collapse every historical URL variant into the one canonical form for Google: legacy
  // company-name URLs (/companies/Revolut), the flat slug URL (/companies/revolut), and any
  // nested URL whose industry segment went stale after the company was reclassified.
  // The industry segment is descriptive - the company slug alone resolves the page.
  useEffect(() => {
    if (!data?.slug) return;
    const canonical = companyPath(data.industrySlug, data.slug);
    if (window.location.pathname !== canonical) {
      // Carry the query string across, or the canonical redirect silently discards ?tab.
      navigate(canonical + window.location.search, { replace: true });
    }
  }, [isSlugParam, industryParam, data?.slug, data?.industrySlug, navigate]);
  if (isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  if (isError || !data) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <Building2 size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-lg font-semibold text-foreground">Something went wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">Unable to load this company. Please try again.</p>
          <button
            onClick={() => navigate("/companies")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Browse all companies
          </button>
        </div>
      </Layout>
    );
  }
  const decoded = data.name;
  const catEntries = Object.entries(data.categoryAverages)
    .filter(([, v]) => typeof v === "number" && !isNaN(v))
    .sort(([, a], [, b]) => b - a);
  const strongest = catEntries.slice(0, 3);
  const weakest   = catEntries.slice(-3).reverse();
  const hasAreas  = catEntries.length >= 3;
  // Whether to show unlocked tiles in the results column
  const resultsUnlocked = searchResults !== null ? searchHasContributed : !isLocked;
  const canonicalUrl = `https://werkpages.com${companyPath(data.industrySlug, data.slug ?? companySlug)}`;
  // Thin pages (no reviews yet) are near-duplicate empty templates - keep them out of the index
  // until they have real content, so Google doesn't flag them as duplicates. "follow" preserves
  // link equity to the managers/pages that ARE worth indexing.
  const isThin = (data.totalReviews ?? 0) === 0;
  const pageTitle = `${data.name} Manager Reviews & Ratings | Werkpages`;
  const pageDescription = `Browse anonymous reviews of managers at ${data.name}. See ratings, leadership styles, and employee experiences at ${data.name} on Werkpages.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${canonicalUrl}#organization`,
        "name": data.name,
        "url": canonicalUrl,
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Companies", "item": "https://werkpages.com/companies" },
          { "@type": "ListItem", "position": 2, "name": data.name, "item": canonicalUrl },
        ],
      },
    ],
  };
  return (
    <>
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      {isThin && <meta name="robots" content="noindex,follow" />}
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
    <Layout>
      {/* Back nav */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={15} />
            All Companies
          </button>
        </div>
      </div>
      {/* Hero */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-start gap-4">
            <CompanyLogoImg
              company={data.name}
              logoUrl={data.logoUrl}
              sizeClass="h-16 w-16 rounded-xl"
            />
            <div className="flex-1 min-w-0">
              {renameMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameMode(false); }}
                    autoFocus
                    className="text-2xl font-bold tracking-tight bg-background border border-border rounded-lg px-2 py-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-w-0"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleRename}
                      disabled={renaming || !newName.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {renaming ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setRenameMode(false)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{data.name}</h1>
                  {user?.role === "admin" && (
                    <button
                      onClick={() => { setNewName(data.name); setRenameMode(true); }}
                      aria-label="Rename company"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* Industry - under the company name, links through to the industry page.
                  Absent until the AI classifier has run for this company. */}
              {data.industry && data.industrySlug && (
                <div className="mt-1.5">
                  {/* Plain text with the industry glyph, matching the manager profile -
                      the pill treatment made the same information read as two different
                      things across the two pages. */}
                  <Link
                    to={`/industries/${data.industrySlug}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-primary transition-colors"
                  >
                    <IndustryIcon industrySlug={data.industrySlug} size={12} className="flex-shrink-0" />
                    <span className="break-words">{data.industry}</span>
                  </Link>
                </div>
              )}

              {/* "Part of Loblaw Companies". Context, not a redirect: this company's own rating
                  sits directly below and means exactly what it always did. The relationship type
                  behind this (brand, subsidiary, division) is not shown, because a reader does not
                  need the corporate vocabulary to understand who owns whom. */}
              {data.partOf && (
                <div className="mt-1.5">
                  <Link
                    to={data.partOf.slug ? `/companies/${data.partOf.slug}` : "#"}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-primary transition-colors"
                  >
                    <Building2 size={12} className="flex-shrink-0" />
                    <span className="break-words">
                      Part of <span className="font-medium">{data.partOf.name}</span>
                    </span>
                  </Link>
                </div>
              )}

              {/* Above the score it is a statement about: you read "Top rated", then the number
                  that earned it. Hidden while the rating itself is hidden. */}
              <TopRatedPill
                rating={data.avgRating}
                reviewCount={data.totalReviews}
                variant="inline"
                hidden={isLocked}
              />

              {data.avgRating != null && (
                <div className="mt-1.5 flex items-center gap-2">
                  {isLocked ? (
                    <>
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="h-3.5 w-3.5 rounded-full bg-amber-300/40 blur-[2px]" />
                        ))}
                      </div>
                      <div className="h-5 w-8 rounded bg-[#6d5091]/20 blur-[3px]" />
                    </>
                  ) : (
                    <>
                      <StarDisplay rating={data.avgRating} />
                      <span className="text-lg font-semibold text-foreground">{data.avgRating.toFixed(1)}</span>
                    </>
                  )}
                  <span className="text-sm text-muted-foreground">avg manager rating</span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {isLocked ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Users size={14} />
                      <span className="inline-block h-3 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={14} />
                      <span className="inline-block h-3 w-14 rounded-full bg-[#6d5091]/20 blur-[3px]" />
                    </span>
                  </>
                ) : (
                  <>
                    {data.managerCount > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users size={14} />
                        {data.managerCount} {data.managerCount === 1 ? "manager" : "managers"}
                      </span>
                    )}
                    {/*
                      Everything people have contributed about this company, both tabs combined:
                      opinions about working here plus experiences of interviewing here. The header
                      is the summary of the whole page, so counting only one tab understates it.

                      Hidden at zero, like every other count on the page. A header whose only
                      content is "0 reviews" is the page telling you there is nothing here before
                      you have had a chance to look.
                    */}
                    {totalContributions > 0 && (
                      <span className="flex items-center gap-1.5">
                        <MessageSquare size={14} />
                        {totalContributions} {totalContributions === 1 ? "review" : "reviews"}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/*
          Two tabs, not one merged page. Manager ratings come from people who worked here for
          months; interview ratings come from people who spent three afternoons here and may never
          have been hired. Blending them into one score would flatter or damn a company for the
          wrong reason.

          Folder tabs rather than a floating control: the selected tab has no bottom border and
          sits one pixel over the panel's top edge, so tab and panel read as one physical surface.
          That connection is what tells you the tab governs the content below it - a detached
          control leaves you guessing what it changes.

          None of that applies to a single tab. A lone folder tab is a control that switches
          nothing, and the notch it cuts out of the panel's top edge reads as a rendering fault
          rather than as structure. Until the interview tab is earned this is one plain card with
          a heading, and the tab chrome appears at the moment there is a second place to go.
        */}
        {canSeeInterviewTab && (
        <div
          role="tablist"
          aria-label="Company sections"
          onKeyDown={(e) => {
            // Arrow keys move between tabs, as a keyboard or screen-reader user expects from a
            // tablist; Tab alone should jump past the whole control into the panel.
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            setActiveTab((current) => (current === "working" ? "hiring" : "working"));
          }}
          className="flex max-w-3xl items-stretch gap-1"
        >
          {(([
            {
              id: "working",
              emoji: "\u{1F465}",
              title: `What it's like to work at ${decoded}`,
              // Empty rather than "0 manager opinions". The tab already says what it is; a count
              // of nothing only tells the reader not to bother opening it.
              count: data.totalReviews > 0
                ? `${data.totalReviews} manager ${data.totalReviews === 1 ? "opinion" : "opinions"}`
                : "",
            },
            {
              id: "hiring",
              emoji: "\u{1F4AC}",
              title: `What it's like to interview at ${decoded}`,
              count: interviewCount == null
                ? "\u2014"
                : interviewCount > 0
                  ? `${interviewCount} candidate ${interviewCount === 1 ? "experience" : "experiences"}`
                  : "",
            },
          ] as const).filter((tab) => tab.id === "working" || canSeeInterviewTab)).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-t-xl border border-border px-2.5 py-2.5 text-left sm:gap-2.5 sm:px-4 sm:py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d5091] ${
                  active
                    ? // -mb-px pulls the tab down onto the panel's top edge and border-b-0 opens
                      // its floor, so tab and panel read as one continuous surface.
                      "-mb-px z-10 border-b-0 bg-card"
                    : // Unselected tabs keep their outline so both read as tabs, and sit on a
                      // recessed fill so the selected one is clearly the raised, active page.
                      "bg-muted/50 hover:bg-muted"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 -bottom-px z-20 h-0.5 bg-card"
                  />
                )}
                {/*
                  Circled like a browser tab's favicon. The circle keeps its own light fill and
                  ring rather than inheriting the tab's, so it reads on both the white active tab
                  and the recessed inactive one. The bottom padding offsets an emoji's asymmetric
                  bearing - items-center centres the line box, but the visible glyph sits below
                  its centreline, so without it the emoji looks low in the circle.
                */}
                <span
                  aria-hidden="true"
                  className={`hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-background pb-[3px] text-sm leading-none ring-1 ring-border transition-opacity min-[400px]:flex ${
                    active ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                  }`}
                >
                  {tab.emoji}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-semibold leading-snug transition-colors sm:text-sm ${
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {tab.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {tab.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        )}

        {/*
          The page surface the tabs attach to. Without it the active tab is a shape floating over
          the background and the connection it is trying to make has nothing to connect to - the
          tab's open floor only reads as a folder when there is a panel edge for it to sit on.

          Rounded on all four corners when it stands alone: the flat top edge exists to meet a
          tab, and with no tab above it the square corners look like a card that lost its lid.
        */}
        <div
          className={`border border-border bg-card p-5 sm:p-7 ${
            canSeeInterviewTab ? "rounded-b-2xl" : "rounded-2xl"
          }`}
        >
        {activeTab === "hiring" ? (
          <div role="tabpanel" id="panel-hiring" aria-labelledby="tab-hiring">
            <InterviewPanel
              companySlug={data.slug ?? companySlug ?? ""}
              companyName={decoded}
              onAddInterview={() => navigate(`/companies/${data.slug ?? companySlug}/add-interview`)}
              onEditInterview={(reviewId) =>
                navigate(`/companies/${data.slug ?? companySlug}/add-interview?edit=${reviewId}`)
              }
            />
          </div>
        ) : (
        // Only a tabpanel while a tablist exists. Standing alone it is just the page, and
        // aria-labelledby would point at a tab id that is not in the document - a dangling
        // reference leaves a screen reader announcing the region with no name at all.
        <div {...(canSeeInterviewTab
          ? { role: "tabpanel", id: "panel-working", "aria-labelledby": "tab-working" }
          : {})}>
        {/*
          The tab carried this heading and its count. Without the tab the card would open on
          "Strongest Areas" with nothing saying whose strengths they are or how many people are
          behind them, so the heading moves inside.
        */}
        {!canSeeInterviewTab && (
          <div className="mb-6 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-background pb-[3px] text-sm leading-none ring-1 ring-border min-[400px]:flex"
            >
              {"\u{1F465}"}
            </span>
            <span className="min-w-0">
              <h2 className="text-[13px] font-semibold leading-snug text-foreground sm:text-sm">
                What it's like to work at {decoded}
              </h2>
              {/*
                Blurred like every other figure on a locked page. The heading still says what
                this card holds; how much of it is one more thing rating a manager reveals.
                aria-hidden with an sr-only note, so the number is gated rather than merely
                out of focus - a blur a screen reader reads straight out is not a lock.
              */}
              <span
                aria-hidden="true"
                className="mt-0.5 block select-none text-xs leading-snug text-muted-foreground blur-[3px]"
              >
                {data.totalReviews} manager {data.totalReviews === 1 ? "opinion" : "opinions"}
              </span>
              <span className="sr-only">
                Manager opinion count hidden until you rate a manager
              </span>
            </span>
          </div>
        )}
        {/* Strongest / Weakest areas */}
        {(isLocked || hasAreas) && (
          <div className="mb-10">
            {isLocked ? (
              <div>
                <div className="relative">
                <div className="grid gap-6 sm:grid-cols-2 blur-sm select-none pointer-events-none">
                  {[{ label: "Strongest Areas", icon: <TrendingUp size={16} className="text-green-600" />, vals: [4.8, 4.6, 4.3] }, { label: "Weakest Areas", icon: <TrendingDown size={16} className="text-amber-500" />, vals: [2.9, 2.7, 2.4] }].map(({ label, icon, vals }) => (
                    <div key={label} className="rounded-2xl border border-border bg-background p-5">
                      <div className="flex items-center gap-2 mb-4">
                        {icon}
                        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
                      </div>
                      <div className="space-y-3">
                        {vals.map((v, i) => (
                          <div key={i}>
                            <div className="h-2.5 w-3/4 rounded bg-muted mb-1.5" />
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full bg-[#6d5091]" style={{ width: `${(v / 5) * 100}%` }} />
                              </div>
                              <span className="text-xs font-medium text-foreground w-6 text-right">{v.toFixed(1)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-background/60 rounded-lg">
                  <Lock size={20} className="mb-1.5 text-muted-foreground opacity-70" />
                  <p className="text-sm font-semibold text-foreground">Company insights are locked</p>
                  <p className="mt-1 text-xs text-muted-foreground">Rate any manager to unlock</p>
                  <button
                    onClick={() => navigate(`/add?returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                  >
                    ⭐ Rate a manager
                  </button>
                </div>
                </div>
                <div className="mt-4 rounded-xl border border-border bg-background p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">Company insights are locked</p>
                  <p className="mt-1 text-xs text-muted-foreground">Rate any manager to see strongest and weakest areas.</p>
                  <button
                    onClick={() => navigate(`/add?returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                  >
                    ⭐ Rate a manager to unlock
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp size={16} className="text-green-600" />
                      <h2 className="text-sm font-semibold text-foreground">Strongest Areas</h2>
                    </div>
                    <div className="space-y-3">
                      {strongest.map(([key, val]) => (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-muted-foreground">{key}</span>
                          </div>
                          <RatingBar value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingDown size={16} className="text-amber-500" />
                      <h2 className="text-sm font-semibold text-foreground">Weakest Areas</h2>
                    </div>
                    <div className="space-y-3">
                      {weakest.map(([key, val]) => (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-muted-foreground">{key}</span>
                          </div>
                          <RatingBar value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Based on {data.totalReviews} {data.totalReviews === 1 ? "review" : "reviews"} across {data.managerCount} {data.managerCount === 1 ? "manager" : "managers"}.
                  {data.totalReviews < 10 && " Small sample size - treat as indicative only."}
                </p>
              </div>
            )}
          </div>
        )}
        {/* Manager section - same two-column layout as Directory */}
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left sidebar - Find a Manager */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-3">
                  Find a Manager
                </label>
                <form onSubmit={handleSearch} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First name"
                      className={SIDEBAR_INPUT}
                    />
                    <input
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last name"
                      className={SIDEBAR_INPUT}
                    />
                  </div>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Job title"
                    className={SIDEBAR_INPUT}
                  />
                  <p className="text-xs text-muted-foreground px-0.5">at {decoded}</p>
                  <button
                    type="submit"
                    disabled={!allFilled || searchLoading}
                    style={{ backgroundColor: !allFilled || searchLoading ? '#c0b4d0' : '#2e0562' }}
                    className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
                  >
                    {searchLoading ? "Searching…" : "Search"}
                  </button>
                </form>
                {searchResults !== null && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                  >
                    Clear search
                  </button>
                )}
              </div>
            </div>
          </aside>
          {/* Right - manager tiles */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Managers at {data.name}
            </h2>
            {searchResults !== null ? (
              searchError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                  <p className="text-sm font-semibold text-destructive">{searchError}</p>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 auto-rows-[minmax(210px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                    {searchResults.map((boss: any) =>
                      resultsUnlocked ? (
                        <ManagerCard
                          key={boss.id}
                          boss={{ ...boss, reviews: boss.reviewsCount ?? 0, company: data.name, companyLogoUrl: data.logoUrl }}
                          to={data.slug && boss.slug ? managerPath(data.industrySlug, data.slug, boss.slug) : `/manager/${boss.id}`}
                        />
                      ) : (
                        <LockedManagerCard
                          key={boss.id}
                          boss={boss}
                          isLoggedIn={!!user}
                          forceShowCompany={boss.approvalStatus === 'ghost'}
                          blurTitle={boss.approvalStatus === 'ghost'}
                          blurRating={boss.approvalStatus === 'ghost'}
                        />
                      )
                    )}
                  </div>
                  {!resultsUnlocked && (
                    <div className="mt-6 rounded-xl border border-border bg-background p-5 text-center">
                      <p className="text-sm font-semibold text-foreground">Rate a manager to unlock ratings</p>
                      <p className="mt-1 text-xs text-muted-foreground">It's anonymous and takes 2 minutes.</p>
                      <button
                        onClick={() => navigate(`/add?returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                      >
                        ⭐ Rate a manager
                      </button>
                    </div>
                  )}
                </>
              ) : ghostAdded ? (
                <div className="rounded-xl border border-border bg-background p-6 text-center">
                  <p className="text-sm font-semibold text-foreground">Manager added!</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your manager was added to the database. Search again to see their profile.
                  </p>
                  <button
                    onClick={() => navigate("/signin", { state: { returnTo: window.location.pathname } })}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    Sign in to rate
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background/50 py-16 text-center px-6">
                  <p className="text-lg font-semibold text-foreground">No results found</p>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                    Try a different spelling or add them yourself.
                  </p>
                  <button
                    onClick={() => navigate(`/add?returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    + Add Manager
                  </button>
                </div>
              )
            ) : isLocked ? (
              <>
                <div className="grid grid-cols-2 auto-rows-[minmax(210px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                  {data.managers.slice(0, 3).map((mgr) => (
                    <LockedManagerCard
                      key={mgr.id}
                      boss={mgr as any}
                      isLoggedIn={!!user}
                      forceShowCompany={mgr.approvalStatus === 'ghost'}
                      blurTitle={mgr.approvalStatus === 'ghost'}
                      blurRating={mgr.approvalStatus === 'ghost'}
                    />
                  ))}
                  {data.managers.slice(3).map((mgr) => (
                    <LockedManagerCard key={mgr.id} boss={mgr as any} isLoggedIn={!!user} blurRating blurCompany />
                  ))}
                  {Array.from({ length: Math.max(0, 9 - data.managers.length) }, (_, i) => (
                    <GhostManagerCard key={`ghost-${i}`} index={i} company={decoded} logoUrl={data.logoUrl} isLoggedIn={!!user} />
                  ))}
                </div>
                <div className="mt-6 rounded-xl border border-border bg-background p-5 text-center">
                  <p className="text-sm font-semibold text-foreground">Rate a manager to unlock ratings</p>
                  <p className="mt-1 text-xs text-muted-foreground">It's anonymous and takes 2 minutes.</p>
                  <button
                    onClick={() => navigate(`/add?returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                  >
                    ⭐ Rate a manager
                  </button>
                </div>
              </>
            ) : data.managers.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/50 py-12 text-center">
                <Building2 size={36} className="mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm font-medium text-foreground">No managers listed yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Be the first to add a manager at {data.name}.</p>
                <Link
                  to={`/add?company=${encodeURIComponent(data.name)}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <PlusCircle size={15} />
                  Add a manager
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 auto-rows-[minmax(210px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                {data.managers.map((mgr) => (
                  <ManagerCard
                    key={mgr.id}
                    boss={{ ...mgr, reviews: mgr.reviewsCount ?? 0, company: data.name, companyLogoUrl: data.logoUrl }}
                    to={data.slug && mgr.slug ? managerPath(data.industrySlug, data.slug, mgr.slug) : `/manager/${mgr.id}`}
                  />
                ))}
              </div>
            )}

            {/*
              The other companies in this group.

              Each keeps its own rating, shown here as its own number. There is deliberately no
              combined group score: blending a grocery chain's store managers into its parent's
              corporate average would produce a figure that flatters or damns either one for the
              wrong reason. A group-wide metric, if it ever exists, belongs beside these as its own
              clearly labelled thing rather than quietly replacing what a company's rating means.
            */}
            {data.companiesInGroup && data.companiesInGroup.length > 0 && (
              <div className="mt-10">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                  Companies in this group
                </h2>

                {/*
                  The group figure, stated as its own thing.

                  It sits here rather than beside the company's headline rating on purpose. Up
                  there it would read as a correction to that number; down here, under the list of
                  companies it actually covers, it reads as what it is. Both numbers are labelled,
                  and neither is a toggle that silently changes what the other means - a rating
                  whose definition depends on a control someone flipped is a number nobody can
                  quote.
                */}
                {data.groupStats && data.groupStats.avgRating != null && !isLocked && (
                  <div className="mb-5 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Management across the group
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <StarDisplay rating={Number(data.groupStats.avgRating)} />
                      <span className="text-lg font-semibold leading-none text-foreground">
                        {Number(data.groupStats.avgRating).toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Based on {data.groupStats.totalReviews.toLocaleString()}{" "}
                      {data.groupStats.totalReviews === 1 ? "opinion" : "opinions"} across{" "}
                      {data.groupStats.managerCount.toLocaleString()}{" "}
                      {data.groupStats.managerCount === 1 ? "manager" : "managers"} at{" "}
                      {data.groupStats.companyCount.toLocaleString()}{" "}
                      {data.groupStats.companyCount === 1 ? "company" : "companies"}.
                      {" "}{data.name}'s own rating above covers only its own managers.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 auto-rows-[minmax(180px,auto)] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                  {data.companiesInGroup.map((co) => (
                    <CompanyTile
                      company={co}
                      isLocked={isLocked}
                      onClick={() => navigate(companyPath(data.industrySlug, co.slug))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
        )}
        </div>
      </div>

    </Layout>
    </>
  );
}