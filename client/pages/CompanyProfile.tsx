import API_BASE from "@/lib/api";
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate, Link } from "react-router-dom";
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
import { fetchGeo } from "@/lib/geo";
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
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm select-none pointer-events-none relative overflow-hidden">
      {/* Badge — identical to LockedManagerCard */}
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
        <Lock size={10} />
        {"Rate to unlock"}
      </div>
      {/* Avatar — same size as LockedManagerCard's default ManagerAvatar, blurred */}
      <div className={`h-16 w-16 rounded-2xl ${slot.color} flex items-center justify-center blur-sm`}>
        <span className="text-xl font-bold text-white">{slot.initials}</span>
      </div>
      {/* Blurred name */}
      <h3 className="mt-3 text-[15px] font-semibold text-foreground leading-tight blur-sm pr-16">{slot.name}</h3>
      {/* Company row — logo + name visible, role blurred — matches CompanyRow layout */}
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
/** Matches ManagerCard, LockedManagerCard, Companies and Industries. */
const TOP_RATED_THRESHOLD = 4.5;

const SIDEBAR_INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";
export default function CompanyProfile() {
  const { industrySlug: industryParam, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
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
              // Ghost creation failed — leave results empty
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
    // background on every mount/focus — keeping them current for all users, not 5-min stale.
    retry: false,
  });
  // Collapse every historical URL variant into the one canonical form for Google: legacy
  // company-name URLs (/companies/Revolut), the flat slug URL (/companies/revolut), and any
  // nested URL whose industry segment went stale after the company was reclassified.
  // The industry segment is descriptive — the company slug alone resolves the page.
  useEffect(() => {
    if (!data?.slug) return;
    const canonical = companyPath(data.industrySlug, data.slug);
    if (window.location.pathname !== canonical) {
      navigate(canonical, { replace: true });
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
  // Thin pages (no reviews yet) are near-duplicate empty templates — keep them out of the index
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

              {/* Industry — under the company name, links through to the industry page.
                  Absent until the AI classifier has run for this company. */}
              {data.industry && data.industrySlug && (
                <div className="mt-1.5">
                  {/* Plain text with the industry glyph, matching the manager profile —
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
                    <span className="flex items-center gap-1.5">
                      <Users size={14} />
                      {data.managerCount} {data.managerCount === 1 ? "manager" : "managers"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={14} />
                      {data.totalReviews} {data.totalReviews === 1 ? "review" : "reviews"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Strongest / Weakest areas */}
        {(isLocked || hasAreas) && (
          <div className="mb-10">
            {isLocked ? (
              <div>
                <div className="relative">
                <div className="grid gap-6 sm:grid-cols-2 blur-sm select-none pointer-events-none">
                  {[{ label: "Strongest Areas", icon: <TrendingUp size={16} className="text-green-600" />, vals: [4.8, 4.6, 4.3] }, { label: "Weakest Areas", icon: <TrendingDown size={16} className="text-amber-500" />, vals: [2.9, 2.7, 2.4] }].map(({ label, icon, vals }) => (
                    <div key={label} className="rounded-2xl border border-border bg-card p-5">
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
                <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
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
                  <div className="rounded-2xl border border-border bg-card p-5">
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
                  <div className="rounded-2xl border border-border bg-card p-5">
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
                  {data.totalReviews < 10 && " Small sample size — treat as indicative only."}
                </p>
              </div>
            )}
          </div>
        )}
        {/* Manager section — same two-column layout as Directory */}
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left sidebar — Find a Manager */}
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
          {/* Right — manager tiles */}
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
                  <div className="grid grid-cols-2 auto-rows-[210px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                    {searchResults.map((boss: any) =>
                      resultsUnlocked ? (
                        <Link
                          key={boss.id}
                          to={data.slug && boss.slug ? managerPath(data.industrySlug, data.slug, boss.slug) : `/manager/${boss.id}`}
                          className="group relative flex h-full w-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-[#2e0562]/30 transition-all min-[420px]:w-[200px] sm:p-5"
                        >
                          {/* Same amber pill as the manager, company and industry cards. */}
                          {Number(boss.overallRating) >= TOP_RATED_THRESHOLD && (
                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              <Star size={9} className="fill-amber-500 text-amber-500" /> Top rated
                            </span>
                          )}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex-shrink-0"><ManagerAvatar name={boss.name} size="sm" /></div>
                            <p className="text-sm font-semibold text-foreground group-hover:text-[#6d28d9] transition-colors leading-tight truncate flex-1 min-w-0">{boss.name}</p>
                          </div>
                          <CompanyRow company={data.name} title={boss.title} logoUrl={data.logoUrl} />
                          <div className="mt-auto min-w-0 pt-3">
                            {Number(boss.overallRating) > 0 ? (
                              <div className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap">
                                {[1,2,3,4,5].map((s) => (
                                  <Star key={s} size={13} aria-hidden="true"
                                    className={s <= Math.round(Number(boss.overallRating)) ? "fill-amber-400 text-amber-400" : "fill-none text-border"} />
                                ))}
                                <span className="ml-1 flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-none text-foreground">{Number(boss.overallRating).toFixed(1)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No ratings yet</span>
                            )}
                            <span className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                              {boss.reviewsCount ?? 0} {(boss.reviewsCount ?? 0) === 1 ? "review" : "reviews"}
                            </span>
                          </div>
                        </Link>
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
                    <div className="mt-6 rounded-xl border border-border bg-card p-5 text-center">
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
                <div className="rounded-xl border border-border bg-card p-6 text-center">
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
                <div className="grid grid-cols-2 auto-rows-[210px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
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
                <div className="mt-6 rounded-xl border border-border bg-card p-5 text-center">
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
              <div className="grid grid-cols-2 auto-rows-[210px] gap-3 min-[420px]:grid-cols-[repeat(auto-fill,200px)] min-[420px]:gap-4">
                {data.managers.map((mgr) => (
                  <Link
                    key={mgr.id}
                    to={data.slug && mgr.slug ? managerPath(data.industrySlug, data.slug, mgr.slug) : `/manager/${mgr.id}`}
                    className="group relative flex h-full w-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-[#2e0562]/30 transition-all min-[420px]:w-[200px] sm:p-5"
                  >
                    {/* Same amber pill as the manager, company and industry cards. */}
                    {Number(mgr.overallRating) >= TOP_RATED_THRESHOLD && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <Star size={9} className="fill-amber-500 text-amber-500" /> Top rated
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-shrink-0"><ManagerAvatar name={mgr.name} size="sm" /></div>
                      <p className="text-sm font-semibold text-foreground group-hover:text-[#6d28d9] transition-colors leading-tight truncate flex-1 min-w-0">
                        {mgr.name}
                      </p>
                    </div>
                    <CompanyRow company={data.name} title={mgr.title} logoUrl={data.logoUrl} />
                    <div className="mt-auto min-w-0 pt-3">
                      {Number(mgr.overallRating) > 0 ? (
                        <div className="flex max-w-full flex-nowrap items-center gap-0.5 whitespace-nowrap">
                          {[1,2,3,4,5].map((s) => (
                            <Star key={s} size={13} aria-hidden="true"
                              className={s <= Math.round(Number(mgr.overallRating)) ? "fill-amber-400 text-amber-400" : "fill-none text-border"} />
                          ))}
                          <span className="ml-1 flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-none text-foreground">{Number(mgr.overallRating).toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No ratings yet</span>
                      )}
                      <span className="mt-1.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                        {mgr.reviewsCount} {mgr.reviewsCount === 1 ? "review" : "reviews"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
    </>
  );
}