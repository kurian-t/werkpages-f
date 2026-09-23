import { SITE_HIDDEN_FROM_SEARCH } from "@/components/PageMeta";
import API_BASE from "@/lib/api";
import { validateManagerName } from "@/lib/managerName";
import { searchForManager } from "@/lib/managerSearch";
import { TopRatedPill } from "@/components/TopRatedPill";
import { CompanyTile } from "@/components/CompanyTile";
import { Stars } from "@/components/Stars";
import { COMPANY_CATEGORIES, COMPANY_CATEGORY_LABELS } from "@/lib/companyRatings";
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { gateKey } from "@/lib/gateKey";
import { CompanyTabHeader } from "@/components/CompanyTabHeader";
import { YourContributionMenu } from "@/components/YourContributionMenu";
import { CompanyRatingList } from "@/components/CompanyRatingList";
import { Star, Building2, Users, MessageSquare, ChevronLeft, PlusCircle, Pencil } from "lucide-react";
import { IndustryIcon } from "@/components/IndustryIcon";
import { companyPath, managerPath } from "@/lib/urls";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { LockedOverlay, LockedPanelCard } from "@/components/LockedNotice";
import { useAuth } from "@/hooks/useAuth";
import LockedManagerCard from "@/components/LockedManagerCard";
import ManagerCard from "@/components/ManagerCard";
import { TILE_GRID } from "@/components/ManagerTile";
import PendingSubmissions, { useMyPendingSubmissions } from "@/components/PendingSubmissions";
import { fetchGeo } from "@/lib/geo";
import { InterviewPanel } from "@/components/InterviewPanel";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
import { isCompanyIndexable } from "@/lib/indexability";
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
  /** What the employer is like to work for. Absent until somebody has rated it. */
  companyRating?: {
    ratingCount: number;
    overallRating?: number;
    categories?: Record<string, number>;
  };
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
const GHOST_SLOTS = [
  { initials: "JW", name: "James Wilson",   role: "Senior Product Manager",   color: "bg-violet-500", rating: "4.3", reviews: 12 },
  { initials: "SC", name: "Sarah Chen",     role: "Director of Engineering",  color: "bg-sky-500",    rating: "3.8", reviews: 7  },
  { initials: "MT", name: "Michael Torres", role: "VP of Operations",         color: "bg-emerald-600",rating: "4.7", reviews: 21 },
];
const SIDEBAR_INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";

/**
 * What the employer is like to work for.
 *
 * Deliberately its own panel beside the manager one rather than merged with it. A company can be
 * a good employer with uneven managers, and showing the two separately is the only way that
 * divergence is readable - averaged into one score it disappears.
 */
function CompanyRatingPanel({
  rating,
  companyName,
  companySlug,
  isLocked,
  onRate,
  onSeeManagers,
}: {
  rating?: CompanyData["companyRating"];
  companyName: string;
  companySlug?: string;
  isLocked: boolean;
  onRate: () => void;
  onSeeManagers: () => void;
}) {
  /*
    Order matters, and it matches the interview panel exactly.

    "Nobody has rated this yet" is an invitation, and it only makes sense to somebody who could
    act on it knowingly - a contributor. Showing it to a visitor who has not contributed both
    tells them the dataset is empty and skips the ask, so the gate is checked first and they get
    the same locked teaser every other company shows.

    Nothing rather than zeroes for the unlocked case: a page printing 0.0 says the workplace is
    terrible; a page saying nobody has rated it yet says what is actually true.
  */
  const noRatings = !rating || rating.ratingCount === 0;
  if (noRatings && !isLocked) {
    return (
      <div className="rounded-xl border border-border bg-background/50 py-12 text-center">
        <Building2 size={36} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-foreground">
          Nobody has rated {companyName} as a workplace yet.
        </p>
        <button
          onClick={onRate}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
        >
          Be the first
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          Looking for a specific manager?{" "}
          <button onClick={onSeeManagers} className="underline hover:text-foreground">Managers</button>
        </p>
      </div>
    );
  }

  /*
    A company with nothing yet still has to look like it has something behind the lock. Blurring a
    row of dashes tells a visitor there is no data and gives them no reason to contribute, so the
    locked-and-empty case shows plausible bars behind the blur - the same device the manager
    profile uses with its ghost cards, and the interview panel with its placeholder figures.

    These are never shown unblurred: this branch is only reachable when isLocked is true.
  */
  const placeholders = [4.1, 3.8, 4.3, 3.6, 4.0, 3.9, 4.2, 3.7, 4.4, 3.5];
  const entries = noRatings
    ? COMPANY_CATEGORIES.map((c, i) => ({
        key: String(c), label: COMPANY_CATEGORY_LABELS[c], value: placeholders[i % placeholders.length],
      }))
    : COMPANY_CATEGORIES
        .map((c) => ({ key: c, label: COMPANY_CATEGORY_LABELS[c], value: rating!.categories?.[c] }))
        .filter((e) => e.value != null)
        .map((e) => ({ key: String(e.key), label: e.label, value: e.value as number }));
  const overall = rating?.overallRating ?? 0;

  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Whether this reader already rated the workplace. Same lookup the rate form uses, so the two
  // never disagree about whether there is something to edit.
  const { data: myRating } = useQuery({
    queryKey: ["my-company-rating", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/rating`, {
        withCredentials: true,
      });
      return res.data?.review ?? null;
    },
    enabled: !!companySlug && !!user,
    retry: false,
  });

  return (
    <div className="space-y-8">
      <CompanyTabHeader
        eyebrow="Workplace experience"
        subtitle={`What employees experienced working at ${companyName}`}
        score={rating?.overallRating ?? null}
        // Workplace ratings only - the managers and interview tabs count their own.
        countLabel="review"
        countValue={rating?.ratingCount ?? 0}
        locked={isLocked}
        scoreLabel="workplace rating"
        /*
          What the lock is and what opens it.

          The redesign moved this tab onto CompanyTabHeader and did not carry the overlay across,
          so a locked reader got a blurred dash and no words at all - the figure was still properly
          withheld, but nothing said why or what to do about it. The Interviewing tab kept its
          overlay through the same change, which left two sibling tabs explaining the same gate and
          the third staying silent.
        */
        /*
          A pill, not a button: this header's action slot holds "Rate this workplace" and is
          deliberately rendered above the overlay so it stays clickable. A second identical
          button centred on top of it would be the same ask twice.
        */
        lockedOverlay={
          <LockedOverlay
            title="Workplace ratings are locked"
            hint="Rate a workplace to unlock them"
            cta={{ label: "⭐ Rate this workplace", onClick: onRate }}
          />
        }
        /*
          The same three highest and three lowest the manager tab shows. The HighLowCards that used
          to sit below carried exactly these six, so the page was stating them twice.
        */
        highlights={
          !isLocked && !noRatings
            ? (() => {
                /*
                  One sorted list, split - never two independent top-3 and bottom-3 slices. With
                  six or fewer categories those slices overlap, and a company with three of them
                  listed all three as its strongest AND its weakest, which is nonsense on its face.
                */
                const sorted = [...entries].sort((a, b) => b.value - a.value);
                const cut = Math.max(3, sorted.length - 3);
                return [
                  ...sorted.slice(0, 3)
                    .map((e) => ({ direction: "up" as const, label: e.label, value: e.value })),
                  ...sorted.slice(cut)
                    .map((e) => ({ direction: "down" as const, label: e.label, value: e.value })),
                ];
              })()
            : []
        }
        highlightsFootnote={
          `Based on ${rating?.ratingCount ?? 0} ${(rating?.ratingCount ?? 0) === 1 ? "rating" : "ratings"}.` +
          ((rating?.ratingCount ?? 0) < 10 ? " Small sample size - treat as indicative only." : "")
        }
        action={
          myRating ? (
            <YourContributionMenu
              label="Your rating"
              editLabel="Edit your rating"
              deleteLabel="Delete your rating"
              confirmTitle="Delete your workplace rating?"
              confirmBody={`Your ratings will be removed from ${companyName}'s workplace statistics.`}
              onEdit={onRate}
              onDelete={async () => {
                try {
                  await axios.delete(`${API_BASE}/api/companies/${companySlug}/rating`, { withCredentials: true });
                  // The company's aggregates change the moment this goes, so nothing cached survives it.
                  queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
                  queryClient.invalidateQueries({ queryKey: ["company-ratings", companySlug] });
                  queryClient.invalidateQueries({ queryKey: ["my-company-rating", companySlug] });
                  toast.success("Your workplace rating has been removed.");
                } catch {
                  toast.error("We couldn't remove that. Please try again.");
                  throw new Error("delete failed");
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={onRate}
              className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2e0562]/90"
            >
              Rate this workplace
            </button>
          )
        }
      />

      {/*
        The Strongest / Weakest cards used to sit here. The header above now names the same six
        categories, so rendering both put every one of those figures on the page twice. Every
        category still appears in the breakdown below.
      */}

      {/*
        The Rating breakdown listed every category with a bar. The header above already names
        the three strongest and three weakest, and on a workplace rating where the categories
        are all required and move together, the full list restated what those six already
        said. The individual ratings below still carry each person's own scores.
      */}

      {/*
        What the average is made of - rendered in every state, exactly as the interviews tab
        renders its own accounts.

        It used to be mounted only for an unlocked reader, so the entire section - sort control,
        heading and all - vanished for everybody else and the tab looked like it simply had no
        opinions, while its sibling one click away said its accounts were locked and offered the
        way in. The rows themselves are withheld by the server now, not by this condition.
      */}
      {companySlug && (
        <CompanyRatingList companySlug={companySlug} companyName={companyName} onRate={onRate} />
      )}
    </div>
  );
}


type CompanyTab = "company" | "managers" | "hiring";

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
      setSearchLoading(false);
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    try {
      const outcome = await searchForManager({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        title: title.trim(),
        // The company is the page itself - never typed, so never ambiguous.
        companyPayload: async () => ({ company: data?.name ?? "", companyId: data?.id ?? null }),
        companyName: data?.name ?? "",
        isLoggedIn: !!user,
      });
      setSearchResults(outcome.results);
      setSearchHasContributed(outcome.hasContributed);
      // A search can have created a manager at this company, so the profile's own counts are stale.
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };
  /**
   * One gate per dataset, each opened by contributing to that dataset.
   *
   * Rating a manager says nothing about a workplace, so it does not buy the workplace numbers -
   * and the reverse holds too. Interview data already worked this way; these are the same rule
   * applied to the other two.
   */
  const isLocked = !user?.hasContributed;              // manager data
  const companyLocked = !user?.hasRatedCompany;        // workplace data
  // A company profile answers two different questions for two different readers: what it is
  // like to work here, and what it is like to try to get hired here. They share a company but
  // nothing else - different reviewers, different ratings, different contribution gate.
  // The tab lives in the URL, not in component state. Without that, a refresh drops you back on
  // the first tab, the link you share never opens where you were, and returning from the add
  // form lands on the wrong half of the page.
  const requestedTab = searchParams.get("tab");

  // Detect whether the URL param is a slug (lowercase, no spaces) or a legacy name.
  // Name-based navigation from the search form still works through the by-name fallback.
  const isSlugParam = !!companySlug && /^[a-z0-9-]+$/.test(companySlug);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-profile-slug", companySlug, gateKey(user)],
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

  /*
    Your own pending submissions at THIS company, shown exactly as the directory shows them.

    A pending manager is invisible to everybody else and must stay that way - this is not a hole
    in the approval filter, it is the submitter seeing their own row. Without it, adding a manager
    from a company page ended with the page looking completely unchanged, so the obvious next move
    was to add them again.

    Scoped on the company id rather than the name. The two are not interchangeable: a manager
    filed as "Revvity Inc." belongs on the Revvity page, and no amount of string matching is a
    safe way to decide that.
  */
  const pendingHere = useMyPendingSubmissions(data?.id);

  /**
   * Three tabs, three questions.
   *
   * "company" is what the employer is like to work for; "managers" is what its managers are like.
   * Those were one tab until company ratings existed, and that tab said "what it's like to work
   * at X" while showing averages computed from manager reviews - a different question wearing the
   * wrong label.
   */
  // "Rated" means somebody reviewed them, not merely that they exist - a directory of unrated
  // managers and one where every manager has reviews are very different places.
  const ratedManagerCount = (data?.managers ?? []).filter((m: any) => (m.reviewsCount ?? 0) > 0).length;
  /**
   * Managers first, always.
   *
   * This used to open on the workplace tab whenever a company happened to have one rating, which
   * buried the thing people came for behind a panel with a single opinion on it. Managers is what
   * the site is for and the tab with the most on it, so it is where a company page opens.
   */
  /*
    Managers first, always. It is what the site is for, it is the tab with the most on it, and
    opening on the workplace tab because a company happened to have one rating buried the thing
    people came for.
  */
  const defaultTab: CompanyTab = "managers";
  /**
   * All three tabs, always. Each dataset has its own gate on its own contents, so hiding a tab
   * would be a second, cruder gate on top of that - and one that teaches a first-time visitor
   * nothing. A tab you cannot open yet still says the dataset exists and what opens it.
   *
   * This used to hide Interviewing until a manager had been rated, which quietly made a manager
   * rating the price of admission to two datasets it says nothing about.
   */
  const visibleTabs: CompanyTab[] = ["managers", "company", "hiring"];
  const showTabChrome = visibleTabs.length > 1;
  const activeTab: CompanyTab =
    requestedTab === "hiring" ? "hiring"
    : requestedTab === "managers" ? "managers"
    : requestedTab === "company" ? "company"
    : defaultTab;
  const setActiveTab = (next: CompanyTab | ((current: CompanyTab) => CompanyTab)) => {
    const value = typeof next === "function" ? next(activeTab) : next;
    const params = new URLSearchParams(searchParams);
    // The default stays out of the URL so the canonical link is unchanged.
    if (value !== defaultTab) params.set("tab", value);
    else params.delete("tab");
    // replace, not push: flipping a tab is not a navigation someone wants to press Back through.
    setSearchParams(params, { replace: true });
  };
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
  // Split one sorted list rather than taking two independent slices: with six or fewer
  // categories, slice(0,3) and slice(-3) overlap and a category is named both best and worst.
  const strongest = catEntries.slice(0, 3);
  const weakest   = catEntries.slice(Math.max(3, catEntries.length - 3)).reverse();
  // Whether to show unlocked tiles in the results column
  const resultsUnlocked = searchResults !== null ? searchHasContributed : !isLocked;
  const canonicalUrl = `https://werkpages.com${companyPath(data.industrySlug, data.slug ?? companySlug)}`;
  // Thin pages (no reviews yet) are near-duplicate empty templates - keep them out of the index
  // until they have real content, so Google doesn't flag them as duplicates. "follow" preserves
  // link equity to the managers/pages that ARE worth indexing.
  // A company page earns its place once somebody on it does - see client/lib/indexability.ts.
  // Previously this required a review, which hid every company whose managers had not been rated
  // yet, including the ones a reader searching that employer by name was looking for.
  const isThin = !isCompanyIndexable(data as any);
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
      {/* One or the other - see BossProfile. A noindex page must not also claim to be canonical. */}
      {isThin || SITE_HIDDEN_FROM_SEARCH
        ? <meta name="robots" content="noindex,follow" />
        : <link rel="canonical" href={canonicalUrl} />}
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

              {/*
                The scores used to sit here: both averages, their star rows, a rate button and
                two counts. Every one of them is now stated by the tab it belongs to, and two
                copies of a number on one screen is worse than either placement - the reader
                has to work out whether they disagree. The header names the company and its
                industry; the tabs answer the questions.
              */}
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
        {showTabChrome && (
        <div
          role="tablist"
          aria-label="Company sections"
          onKeyDown={(e) => {
            // Arrow keys move between tabs, as a keyboard or screen-reader user expects from a
            // tablist; Tab alone should jump past the whole control into the panel.
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            // Cycle the tabs in order. Two-way flipping was fine with two tabs and silently
            // skips one now that there are three.
            setActiveTab((current) => {
              const i = visibleTabs.indexOf(current);
              const step = e.key === "ArrowRight" ? 1 : -1;
              return visibleTabs[(i + step + visibleTabs.length) % visibleTabs.length];
            });
          }}
          className="flex items-stretch gap-8 border-b border-border"
        >
          {/*
            An underline bar, not folder tabs.

            The folder treatment gave each tab an outline, a recessed fill, a circled emoji and a
            count beneath the label - five pieces of chrome to say which of three words is selected.
            It also restated counts the panel header now carries, so every number on this page
            appeared twice. A rule under the active label says the same thing with nothing left to
            read, and matches how the rest of the site marks a current item.
          */}
          {(([
            { id: "managers", title: "Managers" },
            { id: "company",  title: "Company" },
            { id: "hiring",   title: "Interviewing" },
          ] as const).filter((tab) => visibleTabs.includes(tab.id))).map((tab) => {
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
                className={`relative -mb-px cursor-pointer whitespace-nowrap border-b-2 pb-3 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d5091] ${
                  active
                    ? "border-[#2e0562] font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.title}
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
        {/*
          No panel behind the tabs.

          The white card existed to be the surface a folder tab attached to. With an underline bar
          there is nothing to attach, and the card was covering the page's own background - so the
          tiles inside it were white on white and stopped reading as tiles at all. Content sits on
          the page ground now and the cards within it are the white surfaces, which is how the
          manager side of the site has always looked.

          Standing alone without tabs it is still a card, because then it is a card rather than a
          page section.
        */}
        <div
          className={
            showTabChrome
              ? "pt-6"
              : "rounded-2xl border border-border bg-card p-5 sm:p-7"
          }
        >
        {activeTab === "company" ? (
          <div role="tabpanel" id="panel-company" aria-labelledby="tab-company">
            <CompanyRatingPanel
              rating={data.companyRating}
              companyName={decoded}
              companySlug={data.slug ?? companySlug}
              isLocked={companyLocked}
              /* Back to this tab, not just this company. Cancelling used to land on Managers,
                 because that is the page default and nothing said where the reader had been. */
              onRate={() =>
                navigate(
                  `/companies/${data.slug ?? companySlug}/rate?returnTo=` +
                  encodeURIComponent(`/companies/${data.slug ?? companySlug}?tab=company`),
                )
              }
              onSeeManagers={() => setActiveTab("managers")}
            />
          </div>
        ) : activeTab === "hiring" ? (
          <div role="tabpanel" id="panel-hiring" aria-labelledby="tab-hiring">
            <InterviewPanel
              companySlug={data.slug ?? companySlug ?? ""}
              companyName={decoded}
              onAddInterview={() =>
                navigate(
                  `/companies/${data.slug ?? companySlug}/add-interview?returnTo=` +
                  encodeURIComponent(`/companies/${data.slug ?? companySlug}?tab=hiring`),
                )
              }
              onEditInterview={(reviewId) =>
                navigate(
                  `/companies/${data.slug ?? companySlug}/add-interview?edit=${reviewId}&returnTo=` +
                  encodeURIComponent(`/companies/${data.slug ?? companySlug}?tab=hiring`),
                )
              }
            />
          </div>
        ) : (
        // Only a tabpanel while a tablist exists. Standing alone it is just the page, and
        // aria-labelledby would point at a tab id that is not in the document - a dangling
        // reference leaves a screen reader announcing the region with no name at all.
        <div {...(showTabChrome
          ? { role: "tabpanel", id: "panel-working", "aria-labelledby": "tab-working" }
          : {})}>
        {/*
          The same header the other two tabs open with. It replaces a heading that only appeared
          when the tab bar was hidden, which meant this panel introduced itself differently
          depending on how you arrived at it.
        */}
        <CompanyTabHeader
          /* Eyebrow + subtitle, the same pair the workplace tab uses ("Workplace experience" /
             "What employees experienced working at X"). Without it the manager count sat at the
             top of the panel with nothing saying what it counted, and the three tabs introduced
             themselves in three different ways. */
          eyebrow="Manager opinions"
          subtitle={`What people experienced reporting to managers at ${data.name}`}
          score={data.avgRating ?? null}
          // Manager reviews only - the workplace and interview tabs count their own.
          countLabel="review"
          countValue={data.totalReviews ?? 0}
          locked={isLocked}
          /*
            Names the gate and offers the way out.

            The redesign moved this tab onto CompanyTabHeader without carrying its overlay
            across, so a locked reader got a blurred dash with nothing saying why. It then spent
            a while stating the lock as bare centred text with nothing to click - the one thing
            the manager profile never does. The header's own action is suppressed while locked,
            so this is the only "Rate a manager" on the row.
          */
          lockedOverlay={
            <LockedOverlay
              title="Company insights are locked"
              hint="Rate a manager to unlock them"
              cta={{
                label: "⭐ Rate a manager",
                onClick: () => navigate(`/add?company=${encodeURIComponent(data.name)}&returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`),
              }}
            />
          }
          /*
            Just how many managers there are. The review count is deliberately not repeated here -
            the caveat opposite already carries it, and the same number twice on one row reads as
            two figures that happen to agree.
          */
          metrics={[
            { icon: "managers",
              value: String(data.managerCount ?? 0),
              label: (data.managerCount ?? 0) === 1 ? "manager" : "managers" },
          ]}
          /*
            The three highest and three lowest scoring categories - the same set the boxes below
            draw. Shown whenever there is anything to rank rather than only past a threshold, so a
            company with two categories still says what they are.
          */
          highlightsFootnote={
            `Based on ${data.totalReviews} ${data.totalReviews === 1 ? "review" : "reviews"} across ` +
            `${data.managerCount} ${data.managerCount === 1 ? "manager" : "managers"}.` +
            (data.totalReviews < 10 ? " Small sample size - treat as indicative only." : "")
          }
          highlights={
            !isLocked
              ? [
                  // The key is already the display name here - the boxes below render it raw too.
                  ...strongest.map(([label, value]) => ({ direction: "up" as const, label, value })),
                  ...weakest.map(([label, value]) => ({ direction: "down" as const, label, value })),
                ]
              : []
          }
          action={
            <button
              type="button"
              onClick={() => navigate(`/add?company=${encodeURIComponent(data.name)}&returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
              className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2e0562]/90"
            >
              Rate a manager
            </button>
          }
        />
        {/*
          The Strongest / Weakest boxes used to sit here, with their own purple bars and their
          own "Based on N reviews" line. The header above now states the same six categories
          and the same sample sentence, and printing both put every one of those figures on
          the page twice. The full list of every category survives in Rating breakdown below.
        */}
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
            <PendingSubmissions
              submissions={pendingHere}
              dividerBelow={data.managers.length > 0 || searchResults !== null}
            />
            {searchResults !== null ? (
              searchError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                  <p className="text-sm font-semibold text-destructive">{searchError}</p>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className={TILE_GRID}>
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
                    <LockedPanelCard
                      className="mt-6"
                      title="Rate a manager to unlock ratings"
                      hint="It's anonymous and takes 2 minutes."
                      cta={{
                        label: "⭐ Rate a manager",
                        onClick: () => navigate(`/add?company=${encodeURIComponent(data.name)}&returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`),
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-border bg-background/50 py-16 text-center px-6">
                  <p className="text-lg font-semibold text-foreground">No results found</p>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                    Try a different spelling or add them yourself.
                  </p>
                  <button
                    onClick={() => navigate(`/add?company=${encodeURIComponent(data.name)}&returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`)}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    + Add Manager
                  </button>
                </div>
              )
            ) : isLocked ? (
              <>
                <div className={TILE_GRID}>
                  {data.managers.slice(0, 3).map((mgr) => (
                    /*
                      A ghost is live, so who they are is readable like any other live manager.
                      Its rating is not: a ghost is seeded with a synthetic placeholder review, and
                      showing that number to somebody who has not contributed would present made-up
                      data as real. Identity is public; the fake rating stays behind the gate.
                    */
                    <LockedManagerCard
                      key={mgr.id}
                      boss={{ ...mgr, company: mgr.company || data.name, companyLogoUrl: mgr.companyLogoUrl ?? data.logoUrl } as any}
                      isLoggedIn={!!user}
                      blurRating={mgr.approvalStatus === 'ghost'}
                    />
                  ))}
                  {/*
                    Everything past the third tile is gated the same way the first three are:
                    ratings withheld, identity readable.

                    These used to pass blurCompany, which greyed out the whole company row - so
                    three tiles showed a name and nothing else, sitting beside six that named the
                    employer, on a page whose heading is that employer. Hiding "Red Hat" from
                    somebody reading the Red Hat page withholds nothing; it only makes the tiles
                    look broken. Ratings are what the contribution gate is for.
                  */}
                  {data.managers.slice(3).map((mgr) => (
                    <LockedManagerCard
                      key={mgr.id}
                      boss={{ ...mgr, company: mgr.company || data.name, companyLogoUrl: mgr.companyLogoUrl ?? data.logoUrl } as any}
                      isLoggedIn={!!user}
                      blurRating
                    />
                  ))}
                  {/*
                    The "there could be more here" slots, rendered by the same component as every
                    real tile rather than by a lookalike of it. CompanyProfile used to carry its
                    own GhostManagerCard - a copy of this card's markup, annotated with three
                    comments claiming it matched - and it did not: the teasers were taller than
                    the managers beside them.
                  */}
                  {Array.from({ length: Math.max(0, 9 - data.managers.length) }, (_, i) => (
                    <LockedManagerCard
                      key={`ghost-${i}`}
                      boss={{ id: -1 - i, name: "", company: data.name, companyLogoUrl: data.logoUrl }}
                      isLoggedIn={!!user}
                      blurRating
                      teaser={GHOST_SLOTS[i % GHOST_SLOTS.length]}
                    />
                  ))}
                </div>
                <LockedPanelCard
                  className="mt-6"
                  title="Rate a manager to unlock ratings"
                  hint="It's anonymous and takes 2 minutes."
                  cta={{
                    label: "⭐ Rate a manager",
                    onClick: () => navigate(`/add?company=${encodeURIComponent(data.name)}&returnTo=/companies/${data.slug ?? encodeURIComponent(decoded)}`),
                  }}
                />
              </>
            ) : data.managers.length === 0 && pendingHere.length === 0 ? (
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
              <div className={TILE_GRID}>
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
                      <Stars rating={Number(data.groupStats.avgRating)} size={14} showValue={false} />
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