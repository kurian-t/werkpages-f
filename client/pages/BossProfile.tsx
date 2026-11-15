import API_BASE from "@/lib/api";
import { LockedOverlay, LockedPanelCard } from "@/components/LockedNotice";
import { Stars } from "@/components/Stars";
import { MIN_OPINIONS_FOR_CONFIDENCE } from "@/components/RatingColumns";
import { OpinionCard, OpinionAuthor, LockedOpinions, ExampleRatingBadge, EXAMPLE_AVERAGE_EXPLANATION, EXAMPLE_TRAJECTORY_EXPLANATION } from "@/components/OpinionCard";
import { RatingHighlights } from "@/components/RatingHighlights";
import { TopRatedPill } from "@/components/TopRatedPill";
import { companyLogoDomain, toNameCase, toJobTitleCase } from "@/lib/utils";
import { RatingBreakdown } from "@/components/RatingBreakdown";
import { gateKey } from "@/lib/gateKey";
import {
  DEFAULT_DRAFT_TTL_MS, REVIEW_DRAFT_KEY, adoptAnonymousDraft, adoptLegacyDraft,
  anonymousDraftOffer, draftSlot, takeExpiryNotice, withoutUnprovenEmail,
} from "@/lib/draftScope";
import { Helmet } from "react-helmet-async";
import { isManagerIndexable } from "@/lib/indexability";
import { NoIndex, SITE_HIDDEN_FROM_SEARCH } from "@/components/PageMeta";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Edit2, X, Trash2, Flag, Check, ChevronDown, ArrowLeft } from "lucide-react";
import { IndustryIcon } from "@/components/IndustryIcon";
import { managerPath, companyPath } from "@/lib/urls";
import { ManagerAvatar, CompanyLogoImg, getInitials, getAvatarColor } from "@/components/ManagerCard";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics } from "@/hooks/useAnalytics";
import { consumePromptFollow } from "@/lib/contributionPrompt";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { CompanyField } from "@/components/CompanyField";
import { LocationField } from "@/components/LocationField";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { useCompanySelection } from "@/hooks/useCompanySelection";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import type { User } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { ContributionNextStep } from "@/components/ContributionNextStep";
import { consumeJustAddedManager, isNudgeSuppressed, suppressNudge } from "@/lib/rateCompanyNudge";
import { formatDistanceToNow } from 'date-fns';
import { StarRating } from "@/components/StarRating";
import { generateUsername } from "@/lib/validators";
import { CareerTimeline } from "@/components/CareerTimeline";
import { COUNTRIES, getCountryFlag } from "@/lib/countries";
import { AttestationCard, HideDatesField } from "@/components/RatingFormParts";
import {
  ManagerIdentityFields, WorkTimelineFields, type ManagerField,
} from "@/components/ManagerFormFields";
import { LocationValue, EMPTY_LOCATION, formatLocation, declaredPayload, orUserGeo, hasDeclaredLocation, visibleManagerLocation } from "@/lib/location";
import { fetchGeo } from "@/lib/geo";
import { formatReviewPeriod } from "@/lib/reviewPeriod";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { useDraftSync } from "@/hooks/useDraftSync";
import { MonthYear } from "@/components/MonthYear";
import { RoleAutocomplete } from "@/components/RoleAutocomplete";
import { DeleteRatingControl } from "@/components/DeleteRatingControl";
import { RequiredMark } from "@/components/FormFields";

const RATING_CATEGORIES = [
  "Communication Style",
  "Perceived Approachability",
  "Perceived Clarity of Expectations",
  "Feedback Style",
  "Perceived Supportiveness",
  "Decision Making Style",
  "Organization and Planning Style",
  "Delegation Style",
  "Perceived Professional Demeanor",
  "Overall Working Experience",
];

// Function to initialize the ratings state
const initializeRatings = () =>
  RATING_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {} as Record<string, number>);

// Safely coerces any value (including BigDecimal objects) to a plain number
const toNumber = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === "object" ? parseFloat(v.toString()) : Number(v);
  return isNaN(n) ? 0 : n;
};

// Converts API rating keys (snake_case or display-name) to display-name keys used by the modal
const fromApiRatings = (apiRatings: Record<string, any>): Record<string, number> => ({
  "Communication Style": toNumber(apiRatings["Communication Style"] ?? apiRatings["communication_style"]),
  "Perceived Approachability": toNumber(apiRatings["Perceived Approachability"] ?? apiRatings["perceived_approachability"]),
  "Perceived Clarity of Expectations": toNumber(apiRatings["Perceived Clarity of Expectations"] ?? apiRatings["perceived_clarity_of_expectations"]),
  "Feedback Style": toNumber(apiRatings["Feedback Style"] ?? apiRatings["feedback_style"]),
  "Perceived Supportiveness": toNumber(apiRatings["Perceived Supportiveness"] ?? apiRatings["perceived_supportiveness"]),
  "Decision Making Style": toNumber(apiRatings["Decision Making Style"] ?? apiRatings["decision_making_style"]),
  "Organization and Planning Style": toNumber(apiRatings["Organization and Planning Style"] ?? apiRatings["organization_and_planning_style"]),
  "Delegation Style": toNumber(apiRatings["Delegation Style"] ?? apiRatings["delegation_style"]),
  "Perceived Professional Demeanor": toNumber(apiRatings["Perceived Professional Demeanor"] ?? apiRatings["perceived_professional_demeanor"]),
  "Overall Working Experience": toNumber(apiRatings["Overall Working Experience"] ?? apiRatings["overall_working_experience"]),
});

const MONTHS = [
  { value: "01", label: "Jan" }, { value: "02", label: "Feb" },
  { value: "03", label: "Mar" }, { value: "04", label: "Apr" },
  { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Aug" },
  { value: "09", label: "Sep" }, { value: "10", label: "Oct" },
  { value: "11", label: "Nov" }, { value: "12", label: "Dec" },
];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1; // 1-12
const YEARS = Array.from({ length: 47 }, (_, i) => String(currentYear - i));
// Always show all months - validation catches future dates
const availableMonths = (_selectedYear: string) => MONTHS;

const toYearMonth = (month: string, year: string) =>
  month && year ? `${year}-${month}` : null;

const toYMVal = (m: string, y: string) => (m && y ? parseInt(y) * 100 + parseInt(m) : null);
const nowVal = currentYear * 100 + currentMonth;

// ── Shared date/rule components (defined outside to prevent remounts) ─────────

interface DateSelectsProps {
  label: string;
  value: { month: string; year: string };
  onChange: (v: { month: string; year: string }) => void;
  disabled?: boolean;
}
function DateSelects({ label, value, onChange, disabled }: DateSelectsProps) {
  return (
    <div className="flex gap-2 items-center">
      <select
        disabled={disabled}
        value={value.month}
        onChange={e => onChange({ ...value, month: e.target.value })}
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`${label} month`}
      >
        <option value="">Month</option>
        {availableMonths(value.year).map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <select
        disabled={disabled}
        value={value.year}
        onChange={e => {
          const y = e.target.value;
          const clearedMonth =
            (!y || y === String(currentYear)) && parseInt(value.month) > currentMonth
              ? ""
              : value.month;
          onChange({ month: clearedMonth, year: y });
        }}
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`${label} year`}
      >
        <option value="">Year</option>
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

type RuleState = "met" | "pending" | "violated";
interface Rule { label: string; state: RuleState }

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {rules.map(rule => (
        <li
          key={rule.label}
          className={`flex items-center gap-2 text-xs ${
            rule.state === "met"      ? "text-accent" :
            rule.state === "violated" ? "text-destructive" :
                                        "text-muted-foreground"
          }`}
        >
          {rule.state === "met"      ? <Check size={12} className="shrink-0" /> :
           rule.state === "violated" ? <X     size={12} className="shrink-0" /> :
                                       <span className="w-3 h-3 shrink-0 rounded-full border border-current inline-block" />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

/** What a withheld score looks like: a plausible number, always blurred, never the real one. */
const WITHHELD_SCORES = [4.2, 3.8, 4.5, 3.6, 4.0, 4.4, 3.9, 4.1, 3.7, 4.3];

export default function BossProfile() {
  const { id, industrySlug: industryParam, companySlug, managerSlug } = useParams<{
    id?: string;
    industrySlug?: string;
    companySlug?: string;
    managerSlug?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, setUser, refreshUser } = useAuth();
  const { track } = useAnalytics();
  const isBanned = user?.isBanned === true;

  const queryClient = useQueryClient();

  // Fetch manager - cached so returning to this page shows data instantly.
  // Supports both legacy numeric-ID route (/manager/:id) and slug route (/companies/:c/managers/:m).
  // Keyed on the gate too: the profile arrives with its analytics stripped for a reader who has
  // not contributed, so the same URL has two different correct responses.
  const managerQueryKey = id
    ? ["manager", id, gateKey(user)]
    : ["manager-slug", companySlug, managerSlug, gateKey(user)];

  const { data: manager, isLoading: isManagerLoading, isError: isManagerError } = useQuery({
    queryKey: managerQueryKey,
    queryFn: async () => {
      if (id) {
        const res = await axios.get(`${API_BASE}/api/managers/${id}`);
        return res.data;
      }
      const res = await axios.get(
        `${API_BASE}/api/managers/by-slug/${managerSlug}?expectedCompanySlug=${companySlug}`,
      );
      return res.data;
    },
    enabled: !!(id || (companySlug && managerSlug)),
    retry: false,
  });

  // Redirect legacy /manager/:id URLs to the canonical slug URL once data loads
  useEffect(() => {
    if (id && manager?.slug && manager?.companySlug) {
      navigate(managerPath(manager.industrySlug, manager.companySlug, manager.slug), { replace: true });
    }
  }, [id, manager?.slug, manager?.companySlug, manager?.industrySlug, navigate]);

  // Canonicalise the industry segment. It is descriptive rather than identifying, so a page
  // reached via the old flat /companies/:c/managers/:m route - or via a segment that went stale
  // when the company was reclassified - still resolves, then corrects the URL in place.
  useEffect(() => {
    if (id || !manager?.slug || !manager?.companySlug) return;
    const canonical = managerPath(manager.industrySlug, manager.companySlug, manager.slug);
    if (window.location.pathname !== canonical) {
      queryClient.setQueryData(["manager-slug", manager.companySlug, manager.slug], manager);
      navigate(canonical, { replace: true });
    }
  }, [id, industryParam, manager?.slug, manager?.companySlug, manager?.industrySlug, navigate, queryClient]);

  // If company changed and backend returned a canonical path, silently correct the URL.
  // Pre-populate the cache for the new key so the re-render doesn't trigger a second fetch.
  useEffect(() => {
    if (!id && manager?.canonicalPath) {
      queryClient.setQueryData(["manager-slug", manager.companySlug, managerSlug], manager);
      navigate(manager.canonicalPath, { replace: true });
    }
  }, [manager?.canonicalPath, manager?.companySlug, managerSlug, navigate, queryClient, id]);

  // Fetch reviews - cached so revisiting shows reviews instantly
  const { data: reviewsData } = useQuery({
    queryKey: ["manager-reviews", manager?.id],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${manager!.id}/reviews`);
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!manager?.id,
  });

  const contextReviews: any[] = reviewsData ?? [];

  // Fetch pre-aggregated career segments - all reviews grouped server-side, never paginated
  const { data: careerSegments = [] } = useQuery({
    queryKey: ["manager-career-segments", manager?.id],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${manager!.id}/career-segments`);
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!manager?.id,
  });

  // Build the career segment list shown in the timeline:
  // - Real reviewed segments are used as-is.
  // - When no reviews exist, fall back to ghost nodes from career history (or the
  //   manager's own company/title as a single ghost).
  // - When reviews exist, only add a ghost for the CURRENTLY ACTIVE career_history
  //   entry (endDate == null) if that company isn't already covered by a review.
  //   Past career_history entries are intentionally excluded so that stale companies
  //   (e.g. from replaced reviews) don't linger as ghost nodes.
  const effectiveCareerSegments = useMemo(() => {
    if (!manager) return [];

    const history: any[] = manager.careerHistory ?? [];

    const managerCompanyKey = (manager.company ?? "").toLowerCase().trim();

    /*
      The logo of the company the role was AT - the one the admin picked, which the segment
      now carries from career_history.company_id.

      This used to keep a logo ONLY when the segment's company name matched the manager's
      CURRENT company, and throw it away otherwise. So every past company arrived with no
      logo, the tile fell through to guessing a domain from the name, and a past employer
      rendered some unrelated brand's mark - unchanged however many times the right company
      was picked in the editor, because the pick was never read back.

      The manager record is now only a fallback, for a current company whose row has no logo.
    */
    /*
      The employer's identity travels with the segment, not just a stored URL.

      A career tile with only a name and a logoUrl cannot resolve a logo when none is stored, so it
      fell to a letter while the header above it showed the real mark. Guessing the domain from the
      name is not the alternative; it is what put a stranger's logo on a manager and was removed.
    */
    const identityFor = (s: any) => {
      const sameCompany = s.company?.toLowerCase().trim() === managerCompanyKey;
      return {
        companyDomain: s.companyDomain
          ?? (sameCompany ? ((manager as any).companyDomain ?? null) : null),
        companyBrandfetchIconUrl: s.companyBrandfetchIconUrl
          ?? (sameCompany ? ((manager as any).companyBrandfetchIconUrl ?? null) : null),
      };
    };

    const withSegmentLogo = (s: any) => ({
      ...s,
      careerHistoryId: idForSegment(s),
      ...identityFor(s),
      logoUrl: s.logoUrl
        ?? (s.company?.toLowerCase().trim() === managerCompanyKey
              ? (manager.companyLogoUrl ?? undefined)
              : undefined),
    });

    const toGhost = (ch: any) => {
      const company = ch.company ?? manager.company ?? "";
      const isCurrentCompany = company.toLowerCase().trim() === managerCompanyKey;
      return {
        company,
        role:             ch.title     ?? manager.title   ?? "",
        startDate:        ch.startDate ? String(ch.startDate).slice(0, 7) : null,
        endDate:          ch.endDate   ? String(ch.endDate).slice(0, 7)   : null,
        isCurrent:        ch.endDate == null,
        averageRating:    0,
        reviewCount:      0,
        categoryAverages: {},
        logoUrl:          ch.companyLogoUrl ?? (isCurrentCompany ? (manager.companyLogoUrl ?? undefined) : undefined),
        companyDomain:            ch.companyDomain ?? (isCurrentCompany ? ((manager as any).companyDomain ?? null) : null),
        companyBrandfetchIconUrl: ch.companyBrandfetchIconUrl ?? (isCurrentCompany ? ((manager as any).companyBrandfetchIconUrl ?? null) : null),
        careerHistoryId:  ch.id ?? null,
      };
    };

    /*
      Reattaches each reviewed segment to the career-history row it came from.

      Only ghost rows carry careerHistoryId - the segments endpoint returns company, role, dates
      and ratings, and no id - so the admin edit and delete controls, which are gated on that id,
      vanished from every company the manager had actually been reviewed at. On a real profile that
      is nearly all of them, which made an admin-only feature look deleted.

      Matched on company, and on the start date when more than one entry shares a company: somebody
      who returned to a former employer has two rows there, and editing the wrong one silently
      rewrites the wrong stretch of their history. Where that cannot be resolved the id is left off
      and the controls stay hidden, which is the safe way to be unsure.
    */
    const idForSegment = (seg: any): number | null => {
      const key = (seg.company ?? "").toLowerCase().trim();
      const candidates = history.filter(
        (ch: any) => (ch.company ?? "").toLowerCase().trim() === key && ch.id != null,
      );
      if (candidates.length === 1) return candidates[0].id;
      const sameStart = candidates.filter(
        (ch: any) =>
          ch.startDate && seg.startDate &&
          String(ch.startDate).slice(0, 7) === String(seg.startDate).slice(0, 7),
      );
      return sameStart.length === 1 ? sameStart[0].id : null;
    };

    if (careerSegments.length === 0) {
      // No reviews at all - show ghost nodes from career history so the timeline isn't empty
      if (history.length > 0) return [...history].reverse().map(toGhost);
      return [toGhost({ company: manager.company, title: manager.title, startDate: null, endDate: null })];
    }

    // Reviews exist - include ghosts for any career_history entry (active or past) whose
    // company isn't already covered by a reviewed segment.
    const reviewedCompanies = new Set(
      careerSegments.map((s: any) => s.company.toLowerCase().trim())
    );
    const ghostEntries = history.filter(
      (ch: any) => !reviewedCompanies.has((ch.company ?? "").toLowerCase().trim())
    );
    if (ghostEntries.length > 0) {
      const ghosts = ghostEntries.map(toGhost);
      const enriched = careerSegments.map(withSegmentLogo);
      const all = [...enriched, ...ghosts];
      all.sort((a: any, b: any) => {
        // Sort by startDate ascending; null startDates go last
        if (!a.startDate && !b.startDate) {
          if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
          return 0;
        }
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
        // Same startDate: current (no endDate) role sorts last
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
        return 0;
      });
      return all;
    }

    return careerSegments.map(withSegmentLogo);
  }, [careerSegments, manager]);

  /*
    ONE logo per company, shared by the header and the career trajectory.

    These were resolved from two different tables. The header read managers.company_logo_url - a
    snapshot stored on the manager row - while a career tile reads companies.logo_url for the
    company its career_history row points at. Nothing keeps those two columns equal, and each is
    filled by a different path at a different time, so the same employer could carry two different
    marks on one page: one above the fold, another on the tile for the very same job.

    The trajectory is the authority, because companies.logo_url is the shared, curated identity -
    it is what the company page and every company tile already show. The manager's stored snapshot
    is only a fallback for a company whose own row has no logo yet.

    Taken from the NEWEST segment that is about the manager's current company, which is what makes
    "the latest tile matches the header" true by construction rather than by coincidence. Past
    tiles are untouched and keep the logo of the company THEY were at - restoring a past employer's
    own mark was an earlier fix here and must not be undone.

    The whole identity travels, not just the URL: CompanyLogoImg resolves from logoUrl, domain and
    brandfetchIconUrl together, so handing the header a matching URL but a different domain could
    still produce a different image.
  */
  const headerCompanyIdentity = useMemo(() => {
    const key = (manager?.company ?? "").toLowerCase().trim();
    const fallback = {
      logoUrl: manager?.companyLogoUrl ?? undefined,
      domain: (manager as any)?.companyDomain ?? null,
      brandfetchIconUrl: (manager as any)?.companyBrandfetchIconUrl ?? null,
    };
    for (let i = effectiveCareerSegments.length - 1; i >= 0; i--) {
      const seg: any = effectiveCareerSegments[i];
      if ((seg.company ?? "").toLowerCase().trim() !== key) continue;
      return {
        logoUrl: seg.logoUrl ?? fallback.logoUrl,
        domain: seg.companyDomain ?? fallback.domain,
        brandfetchIconUrl: seg.companyBrandfetchIconUrl ?? fallback.brandfetchIconUrl,
      };
    }
    return fallback;
  }, [effectiveCareerSegments, manager]);

  // Contribution gate: hasContributed is loaded as part of the /api/auth/me session
  // response and stored in user state - no separate network request needed.
  const isLocked = !user?.hasContributed;

  // Fetch internal DB user UUID - cached so it's instant on revisit
  const { data: dbUserId } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/auth/me`);
      return res.data.id as string;
    },
    enabled: !!user,
  });

  // Fetch the calling user's own pending edit - only visible to them, not public
  const { data: pendingEditsData } = useQuery({
    queryKey: ["manager-pending-edits", manager?.id],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${manager!.id}/pending-edits`);
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!manager?.id && !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const pendingEdits: any[] = pendingEditsData ?? [];

  // Fetch all of the current user's reviews for this manager
  const { data: cachedUserReviews = [], isFetched: userReviewsFetched } = useQuery({
    queryKey: ["user-reviews", manager?.id, dbUserId],
    queryFn: async () => {
      if (!dbUserId || !manager) return [];
      const res = await axios.get(
        `${API_BASE}/api/managers/${manager.id}/reviews?userId=${dbUserId}`
      );
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!dbUserId && !!manager?.id,
  });

  /*
    Is one of the caller's own ratings of this manager being withheld?

    Read from data the page already has. Their held rating IS returned to them by the reviews
    endpoint - deliberately, since withholding it from its author would leave them no way to know
    it exists - and it now carries its disposition, so no extra request is needed to notice.
  */
  const myHeldReview = cachedUserReviews.find((r: any) => r?.disposition === "held");

  /*
    THE READER'S OWN RATINGS, WHICH ARE NEVER WITHHELD FROM THEM.

    The gate exists so that somebody who has contributed nothing cannot read other people's
    scores. It was never meant to blur a person's own words back at them, and it did: a rating
    held behind a pending manager is not live, hasContributed only counts live ratings, so the
    contributor who had just added a manager was locked out of the single rating on the page -
    their own, written sixty seconds earlier.

    Matched by id rather than by author handle, which is anonymised and not unique.
  */
  const myReviewIds = useMemo(
    () => new Set((cachedUserReviews ?? []).map((r: any) => r?.id).filter(Boolean)),
    [cachedUserReviews],
  );

  /*
    Only then ask what stage the challenge is at, because that is the one thing the review payload
    cannot say. Gated on a held rating existing, so the request fires for the handful of people who
    have one rather than on every profile view by every signed-in visitor.
  */
  const { data: myProofChallenge } = useQuery({
    queryKey: ["proof-challenge", manager?.id],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${manager!.id}/proof-challenge`, {
        withCredentials: true,
      });
      return res.data?.challenge ?? null;
    },
    enabled: !!manager?.id && !!user && !!myHeldReview,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const userHasReviewedState = cachedUserReviews.length > 0;
  const atReviewLimit = cachedUserReviews.length >= 5;

  // First-hand-experience attestation for the rate-a-manager flow. Persisted with the review draft
  // so it survives the sign-in round trip that auto-submits on return.
  const [reviewAttested, setReviewAttested] = useState(false);
  const skipResetRef = useRef(false);
  const reviewSubmitAreaRef = useRef<HTMLDivElement>(null);
  const reviewDraftTokenRef = useRef<string | null>(null);
  const [fromVerified, setFromVerified] = useState(false);
  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const DRAFT_TTL = DEFAULT_DRAFT_TTL_MS; // 24 hours; see draftScope for why it was 12

  /*
    THE DRAFT BELONGS TO ONE PERSON, and until now this form did not ask which.

    "rmm_pending_review" had no account in it, so on a shared browser the next visitor was shown
    the last one's ten ratings, their dates, their employer and the email they typed into the
    sign-up step. Worse than shown: a complete draft plus any signed-in user auto-submitted, so
    one person's words were published under another's name with neither of them doing anything
    wrong. See draftScope, where the ownership decision now lives for every form.

    A draft written before the key had an account in it is moved into the anonymous scope once, so
    shipping this does not throw away whatever was open in somebody's browser at the deploy.
  */
  const legacyAdoptedRef = useRef(false);
  if (!legacyAdoptedRef.current) { legacyAdoptedRef.current = true; adoptLegacyDraft(REVIEW_DRAFT_KEY); }

  const reviewDraft = draftSlot<any>(REVIEW_DRAFT_KEY, user?.id, { ttlMs: DRAFT_TTL });
  const [offeredReviewDraft, setOfferedReviewDraft] = useState<any | null>(null);
  const [reviewDraftExpired, setReviewDraftExpired] = useState(false);

  const clearReviewDraft = () => {
    reviewDraft.clear();
    setModalRatings(initializeRatings());
    setReviewAttested(false);
    setReviewWorkedFrom({ month: "", year: "" });
    setReviewWorkedUntil({ month: "", year: "" });
    setReviewCurrentlyWorking(false);
    setReviewManagerTitle(manager?.title ?? "");
    setReviewManagerCompany(manager?.company ?? "");
    setPendingVerificationEmail("");
    setPendingEmailVerified(false);
    setShowDraftBanner(false);
    setReviewStep(null);
  };

  const [sortBy, setSortBy] = useState("recent");
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());

  /*
    Rows for a locked reader when there is not a single review to show.

    Ordinary rows through the ordinary card, so a placeholder cannot come out a different shape
    from the real thing.

    No written text on them, because these forms do not collect any - a rating is scores, tenure
    and an author. Invented prose was both fabricated opinion and an instant tell: real cards
    showed a compact three-line card and the placeholders carried a paragraph nothing else had.
  */
  /*
    The readable half is this manager's own role and company - the same line a real card shows -
    so a placeholder does not announce itself with "at a previous employer" where every real
    card names the employer. Everything invented about it is blurred.
  */
  const LOCKED_REVIEW_PLACEHOLDERS: any[] = [
    { id: -1, author: "quiet-harbour", verified: true, overallRating: 4.2, ratings: {},
      managerTitle: manager?.title ?? "Manager", managerCompany: manager?.company ?? "",
      workedFrom: "2022-03", workedUntil: "2024-08", createdAt: "2024-09-01T00:00:00Z" },
    { id: -2, author: "amber-field", verified: true, overallRating: 3.6, ratings: {},
      managerTitle: manager?.title ?? "Manager", managerCompany: manager?.company ?? "",
      workedFrom: "2023-01", workedUntil: null, createdAt: "2024-06-01T00:00:00Z" },
    { id: -3, author: "north-signal", verified: false, overallRating: 4.5, ratings: {},
      managerTitle: manager?.title ?? "Manager", managerCompany: manager?.company ?? "",
      workedFrom: "2019-06", workedUntil: "2022-11", createdAt: "2023-12-01T00:00:00Z" },
    { id: -4, author: "pale-thicket", verified: true, overallRating: 3.9, ratings: {},
      managerTitle: manager?.title ?? "Manager", managerCompany: manager?.company ?? "",
      workedFrom: "2021-02", workedUntil: "2023-07", createdAt: "2023-08-01T00:00:00Z" },
    { id: -5, author: "low-tideline", verified: false, overallRating: 4.1, ratings: {},
      managerTitle: manager?.title ?? "Manager", managerCompany: manager?.company ?? "",
      workedFrom: "2020-09", workedUntil: null, createdAt: "2023-04-01T00:00:00Z" },
  ];

  /*
    The same three steps, in the same order, as the add-manager form: who this is about, when you
    worked with them, then the ratings. It used to open on the star ratings and ask about the
    manager and the period afterwards, so the identical contribution had two different shapes
    depending on which page you started from.
  */
  const [reviewStep, setReviewStep] = useState<null | "details" | "dates" | "ratings">(null);
  const [editManagerStep, setEditManagerStep] = useState<null | "info">(null);
  /* The same three steps, in the same order, as every other contribution form. */
  const [editReviewStep, setEditReviewStep] = useState<null | "details" | "dates" | "ratings">(null);
  const [editingEditRoleInline, setEditingEditRoleInline] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [pendingDeleteReviewId, setPendingDeleteReviewId] = useState<string | null>(null);
  const [showReviewDropdown, setShowReviewDropdown] = useState(false);
  /*
    Which field of the shared block is open, one slot per flow. The old form had a single
    "Edit details" toggle covering title and company together and no location field at all; every
    field is its own pencil now, and both flows render the same component.
  */
  const [reviewOpenField, setReviewOpenField] = useState<ManagerField | null>(null);
  const [editOpenField,   setEditOpenField]   = useState<ManagerField | null>(null);
  /** Where the opinion happened. Carried per contribution, never copied from the manager on edit. */
  const [reviewLocation, setReviewLocation] = useState<LocationValue>(EMPTY_LOCATION);
  /*
    Required, and enforced here because the location is separate state that no draft validator sees.
    The field has always carried a required asterisk; until now nothing checked it, and the gap was
    invisible because the field arrived prefilled from the reader's IP.
  */
  const [reviewLocationError, setReviewLocationError] = useState<string | null>(null);
  const [editLocation,   setEditLocation]   = useState<LocationValue>(EMPTY_LOCATION);
  const reviewDropdownRef = useRef<HTMLDivElement>(null);
  const [authorType] = useState<"anonymous">("anonymous");
  const [generatedName, setGeneratedName] = useState(() => generateUsername());
  const [modalRatings, setModalRatings] = useState<Record<string, number>>(initializeRatings());
  const [editFormData, setEditFormData] = useState({ company: "", title: "", status: "active", country: "", linkedinUrl: "" });
  const [editCompanyLogoUrl, setEditCompanyLogoUrl] = useState<string | undefined>(undefined);
  const [editReviewData, setEditReviewData] = useState<Record<string, number>>({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [nextStepOpen, setNextStepOpen] = useState(false);
  /*
    Arriving straight from the add-manager form.

    Adding a manager is a contribution like any other, and it used to end in a navigation and
    nothing else. The form cannot host the offer itself: it navigates here on success, so a dialog
    opened there unmounts before it can be read. markJustAddedManager leaves a one-shot session
    flag and this consumes it once.

    Suppression is shared with the after-rating offer, so somebody who has already declined for
    this company is not asked again just because they arrived by a different route.
  */
  useEffect(() => {
    if (!manager) return;
    if (!consumeJustAddedManager()) return;
    if (manager.companySlug && !isNudgeSuppressed(manager.companySlug)) setNextStepOpen(true);
  }, [manager]);

  const [pendingAutoSubmit, setPendingAutoSubmit] = useState<User | null>(null);
  const [conflictAfterAuth, setConflictAfterAuth] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isReplacingReview, setIsReplacingReview] = useState(false);
  const [reviewSubmitError, setReviewSubmitError] = useState<string | null>(null);
  const [reviewTitleError, setReviewTitleError] = useState<string | null>(null);
  const [reviewDateError, setReviewDateError] = useState<string | null>(null);
  const [editReviewSubmitError, setEditReviewSubmitError] = useState<string | null>(null);
  const [editReviewTitleError, setEditReviewTitleError] = useState<string | null>(null);
  const [editReviewDateError, setEditReviewDateError] = useState<string | null>(null);
  const [authFlowStep, setAuthFlowStep] = useState<AuthFlowStep | null>(null);
  const [authFlowEmail, setAuthFlowEmail] = useState("");
  const pendingAction = useRef<"edit" | "report" | "edit-submit" | "report-submit" | null>(null);

  /**
   * Where a report interrupted by sign-in waits.
   *
   * sessionStorage rather than localStorage: a report is one sitting's business and should not
   * reappear in a new tab a week later. The sign-in round trip stays within the session.
   */
  const PENDING_REPORT_KEY = `rmm_pending_report_${managerSlug ?? "unknown"}`;
  const [timelineUnlocked, setTimelineUnlocked] = useState(false);
  const [timelineFadeIn, setTimelineFadeIn] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pendingEmailVerified, setPendingEmailVerified] = useState(false);
  const [crossUserWarningDismissed, setCrossUserWarningDismissed] = useState(false);
  const [editCrossUserWarningDismissed, setEditCrossUserWarningDismissed] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [hasReported, setHasReported] = useState(false);

  // Sync hasReported from server response (source of truth)
  useEffect(() => {
    if (manager?.hasReported !== undefined) setHasReported(manager.hasReported);
  }, [manager?.hasReported]);

  // Trigger the fade-in animation one frame after the timeline mounts
  useEffect(() => {
    if (timelineUnlocked) {
      const raf = requestAnimationFrame(() => setTimelineFadeIn(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [timelineUnlocked]);

  // After an OAuth redirect (full page reload), restore scroll and trigger the unlock fade
  useEffect(() => {
    if (!user) return;
    const saved = sessionStorage.getItem("rmm_career_unlock_scroll");
    if (!saved) return;
    sessionStorage.removeItem("rmm_career_unlock_scroll");
    const y = parseInt(saved, 10);
    setTimelineUnlocked(true);
    // Wait for the DOM to settle after the full-page reload before scrolling
    const t = setTimeout(() => window.scrollTo({ top: y, behavior: "instant" }), 100);
    return () => clearTimeout(t);
  }, [user]);

  // After an OAuth redirect triggered by a "Rate a manager" lock gate, go to /add
  useEffect(() => {
    if (!user) return;
    if (!sessionStorage.getItem("rmm_pending_rate")) return;
    sessionStorage.removeItem("rmm_pending_rate");
    navigate("/add");
  }, [user]);

  /*
    A REPORT INTERRUPTED BY SIGN-IN, SENT ON RETURN.

    Signing in is a full-page redirect to Auth0 now, which destroys this component and the ref
    that used to hold the pending action - so the report is restored here instead, the same way
    the rate gate above is.

    REMOVED FROM STORAGE BEFORE SENDING, not after. The send is the thing that can fail or be
    retried, and a key still present on a retry would file the report twice. The two tests that
    guard this are "a report written before signing in is still sent afterwards" and "signing in
    from an interrupted action does not send it twice" - the second exists because both the
    restored action and the still-mounted form firing would file one person's report twice under
    their name.
  */
  useEffect(() => {
    if (!user) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(PENDING_REPORT_KEY); } catch { return; }
    if (!saved) return;
    try { sessionStorage.removeItem(PENDING_REPORT_KEY); } catch { /* best effort */ }

    let pending: { reason?: string; comment?: string | null; managerId?: number | null } | null = null;
    try { pending = JSON.parse(saved); } catch { return; }   // malformed: discard, do not send
    if (!pending?.reason) return;

    axios.post(`${API_BASE}/api/managers/${pending.managerId ?? manager?.id}/report`,
               { reason: pending.reason, comment: pending.comment ?? null })
      .then(() => {
        setHasReported(true);
        toast.success("Report submitted", {
          description: "Thank you. Our team will review this profile.",
        });
      })
      .catch(() => {
        // Deliberately quiet. The person did not press anything on this page load, so an error
        // toast about a report they may not remember writing would be more confusing than silence.
      });
  }, [user]);
  const [reviewWorkedFrom, setReviewWorkedFrom] = useState({ month: "", year: "" });
  const [reviewWorkedUntil, setReviewWorkedUntil] = useState({ month: "", year: "" });
  const [reviewCurrentlyWorking, setReviewCurrentlyWorking] = useState(false);
  // Opt-in. The edit copy is seeded from what was stored, so reopening a rating shows the
  // choice its author actually made rather than silently offering to republish their dates.
  const [reviewDatesHidden, setReviewDatesHidden] = useState(false);
  const [editWorkedFrom, setEditWorkedFrom] = useState({ month: "", year: "" });
  const [editWorkedUntil, setEditWorkedUntil] = useState({ month: "", year: "" });
  const [editCurrentlyWorking, setEditCurrentlyWorking] = useState(false);
  const [editDatesHidden, setEditDatesHidden] = useState(false);
  /*
    The manager's status, as this reviewer knew it. Seeded from the profile and sent with the
    review; the manager's own status is then derived from the most current opinion, exactly as
    their company and title already are.
  */
  const [reviewManagerStatus, setReviewManagerStatus] = useState<"active" | "retired">("active");
  /* The same question on the edit form, so an edit can correct it like any other answer. */
  const [editManagerStatus, setEditManagerStatus] = useState<"active" | "retired">("active");
  const [reviewManagerCompany, setReviewManagerCompany] = useState("");
  const [reviewManagerTitle, setReviewManagerTitle] = useState("");
  const [editManagerCompany, setEditManagerCompany] = useState("");

  // The two forms that can change a manager's company. Each owns its identity, its clearing rule
  // and its payload through the shared selection, so an edit that corrects a company name can no
  // longer mint the very duplicate the correction was meant to fix.
  const editCompany = useCompanySelection();
  const adminEditCompany = useCompanySelection();
  // The career-entry editor needs its own selection state: it edits a different row from the
  // manager panel above, and sharing one would carry a half-typed company between them.
  const adminCareerEditCompany = useCompanySelection();
  // The logo the picker handed back, so it can ride with the save instead of being discarded.
  const [adminCareerEditLogoUrl, setAdminCareerEditLogoUrl] = useState<string | undefined>(undefined);
  const [editManagerTitle, setEditManagerTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState({ month: "", year: "" });
  const [editEndDate, setEditEndDate] = useState({ month: "", year: "" });
  const [editEndCurrent, setEditEndCurrent] = useState(true);
  const [selectedCareerRoleIdx, setSelectedCareerRoleIdx] = useState(0);
  const [editModalTouched, setEditModalTouched] = useState(false);
  const [editAuthorType, setEditAuthorType] = useState<"username" | "real_name" | "anonymous">("username");
  const [editGeneratedName, setEditGeneratedName] = useState(() => generateUsername());

  /*
    The edit form, kept across a refresh.

    Only the create form had a draft, so reloading mid-edit dropped the reader back on the manager
    profile with everything they had changed gone - and no sign it had ever existed. The editor is
    only open because somebody deliberately opened it; that is reason enough to keep what is in it.

    Keyed by manager, and it carries which review is being edited: without that the form could
    reopen against the wrong one of the five a person may have written.
  */
  const editDraftKey = `rmm_editing_review_${id || managerSlug || "unknown"}`;
  useFormDraft(
    editDraftKey,
    {
      editingReviewId, editReviewStep, editReviewData, editLocation,
      editWorkedFrom, editWorkedUntil, editCurrentlyWorking,
      editManagerCompany, editManagerTitle, editManagerStatus,
      editAuthorType, editGeneratedName,
    },
    saved => {
      // Nothing to reopen unless an edit was genuinely in progress.
      if (!saved.editingReviewId || !saved.editReviewStep) return;
      setEditingReviewId(saved.editingReviewId);
      setEditReviewStep(saved.editReviewStep);
      if (saved.editReviewData)       setEditReviewData(saved.editReviewData);
      if (saved.editLocation)         setEditLocation(saved.editLocation);
      if (saved.editWorkedFrom)       setEditWorkedFrom(saved.editWorkedFrom);
      if (saved.editWorkedUntil)      setEditWorkedUntil(saved.editWorkedUntil);
      if (saved.editCurrentlyWorking != null) setEditCurrentlyWorking(saved.editCurrentlyWorking);
      if (saved.editManagerCompany)   setEditManagerCompany(saved.editManagerCompany);
      if (saved.editManagerTitle)     setEditManagerTitle(saved.editManagerTitle);
      if (saved.editManagerStatus)    setEditManagerStatus(saved.editManagerStatus);
      if (saved.editAuthorType)       setEditAuthorType(saved.editAuthorType);
      if (saved.editGeneratedName)    setEditGeneratedName(saved.editGeneratedName);
    },
  );

  // Admin direct-edit state
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminEditForm, setAdminEditForm] = useState({ name: "", title: "", company: "", linkedinUrl: "" });
  const [adminEditLogoUrl, setAdminEditLogoUrl] = useState<string | undefined>(undefined);
  /*
    Where the manager works, on the admin edit form.

    Settable only on the ADD form until now - nothing, admin or user, could correct a manager
    filed against the wrong country, and country is what the directory filters on. Uses the same
    LocationField every contribution form uses rather than a second set of inputs.
  */
  const [adminEditLocation, setAdminEditLocation] = useState<LocationValue>(EMPTY_LOCATION);
  /*
    The MANAGER's location on the edit form - deliberately not editLocation, which is the
    REVIEWER's location for their own opinion and must never be copied from the manager.
  */
  const [editManagerLocation, setEditManagerLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [editManagerLocationOpen, setEditManagerLocationOpen] = useState(false);
  const [adminEditLocationOpen, setAdminEditLocationOpen] = useState(false);
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [adminDeleteConfirm, setAdminDeleteConfirm] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);

  // Admin career history edit state
  const [adminCareerEditEntry, setAdminCareerEditEntry] = useState<{
    entryId: number; company: string; role: string; startDate: string; endDate: string;
  } | null>(null);
  const [adminCareerEditSaving, setAdminCareerEditSaving] = useState(false);
  /*
    The stage an admin is removing, not just its id.

    A trajectory stage often has no career_history row, so an id is not enough to identify one.
    The company names it, and the review count decides what the dialog has to ask.
  */
  const [adminCareerDeleteStage, setAdminCareerDeleteStage] =
    useState<{ entryId: number | null; company: string; role: string; reviewCount: number } | null>(null);
  const [adminStageReassignTo, setAdminStageReassignTo] = useState<string>("");
  const [adminCareerDeleting, setAdminCareerDeleting] = useState(false);

  // Helper: parse "YYYY-MM" to a numeric key for comparison
  const ymToNum = (s: string | null | undefined) => {
    if (!s) return null;
    const [y, m] = s.split("-").map(Number);
    return y * 100 + m;
  };

  // Hard block: same user already has a review whose work period overlaps with the new one
  const isManagerRoleOverlap = (() => {
    if (!reviewStep) return false;
    const fromFilled = reviewWorkedFrom.month !== "" && reviewWorkedFrom.year !== "";
    if (!fromFilled) return false;
    const untilFilled = reviewWorkedUntil.month !== "" && reviewWorkedUntil.year !== "";
    const newFrom = parseInt(reviewWorkedFrom.year) * 100 + parseInt(reviewWorkedFrom.month);
    const newUntil = reviewCurrentlyWorking ? 999999 : (untilFilled ? parseInt(reviewWorkedUntil.year) * 100 + parseInt(reviewWorkedUntil.month) : null);
    if (newUntil === null) return false;
    return cachedUserReviews.some((r: any) => {
      const existFrom = ymToNum(r.workedFrom);
      if (!existFrom) return false;
      const existUntil = r.workedUntil ? ymToNum(r.workedUntil) : 999999;
      return newFrom <= existUntil! && existFrom <= newUntil;
    });
  })();

  // Soft warn: a different user's review places this manager at a different company during the same period
  const crossUserCompanyConflict = (() => {
    if (!reviewStep) return false;
    const fromFilled = reviewWorkedFrom.month !== "" && reviewWorkedFrom.year !== "";
    if (!fromFilled) return false;
    const untilFilled = reviewWorkedUntil.month !== "" && reviewWorkedUntil.year !== "";
    const newFrom = parseInt(reviewWorkedFrom.year) * 100 + parseInt(reviewWorkedFrom.month);
    const newUntil = reviewCurrentlyWorking ? 999999 : (untilFilled ? parseInt(reviewWorkedUntil.year) * 100 + parseInt(reviewWorkedUntil.month) : null);
    if (newUntil === null) return false;
    const displayCompany = (reviewManagerCompany || manager?.company || "").trim().toLowerCase();
    return careerSegments.some((seg: any) => {
      if (seg.reviewCount === 0) return false;
      if (seg.company.trim().toLowerCase() === displayCompany) return false;
      const segFrom = ymToNum(seg.startDate);
      if (!segFrom) return false;
      const segUntil = seg.isCurrent ? 999999 : (ymToNum(seg.endDate) ?? 999999);
      return newFrom <= segUntil && segFrom <= newUntil;
    });
  })();

  // Hard block: same user already has a review whose work period overlaps with the edited one
  const isEditManagerRoleOverlap = (() => {
    if (!editReviewStep) return false;
    const fromFilled = editWorkedFrom.month !== "" && editWorkedFrom.year !== "";
    if (!fromFilled) return false;
    const untilFilled = editWorkedUntil.month !== "" && editWorkedUntil.year !== "";
    const newFrom = parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month);
    const newUntil = editCurrentlyWorking ? 999999 : (untilFilled ? parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month) : null);
    if (newUntil === null) return false;
    return cachedUserReviews.some((r: any) => {
      if (String(r.id) === String(editingReviewId)) return false;
      const existFrom = ymToNum(r.workedFrom);
      if (!existFrom) return false;
      const existUntil = r.workedUntil ? ymToNum(r.workedUntil) : 999999;
      return newFrom <= existUntil! && existFrom <= newUntil;
    });
  })();

  // Soft warn: a different user's review places this manager at a different company during the same period (edit)
  const editCrossUserCompanyConflict = (() => {
    if (!editReviewStep) return false;
    const fromFilled = editWorkedFrom.month !== "" && editWorkedFrom.year !== "";
    if (!fromFilled) return false;
    const untilFilled = editWorkedUntil.month !== "" && editWorkedUntil.year !== "";
    const newFrom = parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month);
    const newUntil = editCurrentlyWorking ? 999999 : (untilFilled ? parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month) : null);
    if (newUntil === null) return false;
    // Don't warn if the dates haven't changed from the original review
    const originalReview = cachedUserReviews.find((r: any) => String(r.id) === String(editingReviewId));
    if (originalReview) {
      const origFrom = originalReview.workedFrom
        ? parseInt(originalReview.workedFrom.slice(0, 4)) * 100 + parseInt(originalReview.workedFrom.slice(5, 7))
        : null;
      const origUntil = !originalReview.workedUntil
        ? 999999
        : parseInt(originalReview.workedUntil.slice(0, 4)) * 100 + parseInt(originalReview.workedUntil.slice(5, 7));
      if (origFrom === newFrom && origUntil === newUntil) return false;
    }
    const displayCompany = (editManagerCompany || manager?.company || "").trim().toLowerCase();
    return careerSegments.some((seg: any) => {
      if (seg.reviewCount === 0) return false;
      if (seg.company.trim().toLowerCase() === displayCompany) return false;
      const segFrom = ymToNum(seg.startDate);
      if (!segFrom) return false;
      const segUntil = seg.isCurrent ? 999999 : (ymToNum(seg.endDate) ?? 999999);
      return newFrom <= segUntil && segFrom <= newUntil;
    });
  })();

  // Real-time duplicate role detection: same title+company is a duplicate (client-side, immediate)
  const isDuplicateTitle = reviewStep !== null &&
    cachedUserReviews.some((r: any) =>
      r.managerTitle?.trim().toLowerCase() === reviewManagerTitle.trim().toLowerCase() &&
      r.managerCompany?.trim().toLowerCase() === reviewManagerCompany.trim().toLowerCase()
    );
  const isEditDuplicateTitle = editReviewStep !== null &&
    cachedUserReviews.some((r: any) =>
      String(r.id) !== String(editingReviewId) &&
      r.managerTitle?.trim().toLowerCase() === editManagerTitle.trim().toLowerCase() &&
      r.managerCompany?.trim().toLowerCase() === editManagerCompany.trim().toLowerCase()
    );

  // Pre-computed validity values used by the stepped form footers
  const reviewAllRated = Object.values(modalRatings).filter(r => r >= 1).length === RATING_CATEGORIES.length;

  const reviewIsDateValid = (() => {
    const fromFilled = reviewWorkedFrom.month !== "" && reviewWorkedFrom.year !== "";
    const untilFilled = reviewWorkedUntil.month !== "" && reviewWorkedUntil.year !== "";
    if (!fromFilled) return false;
    if (!reviewCurrentlyWorking && !untilFilled) return false;
    if (fromFilled && untilFilled) {
      const fromVal = parseInt(reviewWorkedFrom.year) * 100 + parseInt(reviewWorkedFrom.month);
      const untilVal = parseInt(reviewWorkedUntil.year) * 100 + parseInt(reviewWorkedUntil.month);
      if (fromVal > untilVal) return false;
    }
    if (isManagerRoleOverlap) return false;
    // Soft cross-user conflict must be acknowledged before proceeding
    if (crossUserCompanyConflict && !crossUserWarningDismissed) return false;
    return true;
  })();

  const editReviewAllRated = Object.values(editReviewData).filter(r => r >= 1).length === RATING_CATEGORIES.length;

  const editReviewIsDateValid = (() => {
    const fromFilled  = editWorkedFrom.month !== "" && editWorkedFrom.year !== "";
    const untilFilled = editWorkedUntil.month !== "" && editWorkedUntil.year !== "";
    if (!fromFilled) return false;
    if (!editCurrentlyWorking && !untilFilled) return false;
    if (fromFilled && untilFilled) {
      const fromVal = parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month);
      const untilVal = parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month);
      if (fromVal > untilVal) return false;
    }
    if (isEditManagerRoleOverlap) return false;
    if (editCrossUserCompanyConflict && !editCrossUserWarningDismissed) return false;
    return true;
  })();

  // Show updatedAt if the review was edited, otherwise show createdAt
  const getFormattedDate = (review: any) => {
    const created = new Date(review.createdAt);
    const updated = review.updatedAt ? new Date(review.updatedAt) : null;
    if (isNaN(created.getTime())) return 'Invalid date';
    if (updated && !isNaN(updated.getTime()) && (updated.getTime() - created.getTime()) > 5000) {
      return `edited ${formatDistanceToNow(updated)} ago`;
    }
    return formatDistanceToNow(created) + ' ago';
  };


  // editReviewData is populated directly when the Edit button is clicked (see "Your Reviews" section)

  // Initialize edit form data when manager loads
  useEffect(() => {
    if (manager) {
      setEditFormData({
        company: manager.company,
        title: manager.title,
        status: manager.status === "retired" ? "retired" : "active",
        country: manager.country || "",
        linkedinUrl: manager.linkedinUrl || "",
      });
      // The control holds the whole answer, so it is seeded with the whole answer - subject to
      // what this profile is allowed to reveal at all. See visibleManagerLocation.
      setEditManagerLocation(visibleManagerLocation(manager as any));
      setEditManagerLocationOpen(false);
      // Seed the selection with the company as it stands, so an edit that changes only the title
      // still submits the company this manager already belongs to.
      editCompany.set(manager.company, manager.companyId ?? undefined);
      // Parse start/end dates from the most recent career history entry
      const ch = manager.careerHistory?.[0];
      if (ch?.startDate) {
        const [y, m] = ch.startDate.split("-");
        setEditStartDate({ year: y ?? "", month: m ?? "" });
      } else {
        setEditStartDate({ month: "", year: "" });
      }
      if (ch?.endDate) {
        const [y, m] = ch.endDate.split("-");
        setEditEndDate({ year: y ?? "", month: m ?? "" });
        setEditEndCurrent(false);
      } else {
        setEditEndDate({ month: "", year: "" });
        setEditEndCurrent(true);
      }
      setEditModalTouched(false);
    }
  }, [manager?.id, manager?.company, manager?.title]);

  // Reset ratings when review form opens (skip if we just restored from localStorage)
  useEffect(() => {
    if (reviewStep !== null) {
      if (skipResetRef.current) { skipResetRef.current = false; return; }
      setModalRatings(initializeRatings());
      setReviewAttested(false);
      setReviewSubmitError(null);
      /*
        The location field opens populated from detected geography, shown in full and editable.
        Submitting it unchanged is therefore a confirmation rather than an inference - which is what
        makes it publishable at all. The private observed copy stays in geo_observations either way.
      */
      /*
        NOT prefilled from the reader's IP address. The reviewer states where they worked.

        Removed alongside the same prefill on the workplace rating. An IP says where the browser is
        tonight, not where the work happened, and people accept whatever a form has already filled
        in - so a datacentre's city was submitted as a declared location, indistinguishable from a
        real answer. The observed location is still recorded separately in geo_observations, which
        is the half that was always meant to carry an inference.
      */
      setReviewTitleError(null);
      setReviewDateError(null);
      setReviewOpenField(null);
      // Default to most recent career history entry
      setSelectedCareerRoleIdx(0);
      const ch0 = manager?.careerHistory?.[0];
      setReviewManagerTitle(ch0?.title ?? manager?.title ?? "");
      setReviewManagerCompany(ch0?.company ?? manager?.company ?? "");
      setReviewManagerStatus(manager?.status === "retired" ? "retired" : "active");
      if (ch0?.startDate) {
        const [y, m] = ch0.startDate.split("-");
        setReviewWorkedFrom({ year: y ?? "", month: m ?? "" });
      } else {
        setReviewWorkedFrom({ month: "", year: "" });
      }
      if (ch0?.endDate) {
        const [y, m] = ch0.endDate.split("-");
        setReviewWorkedUntil({ year: y ?? "", month: m ?? "" });
        setReviewCurrentlyWorking(false);
      } else {
        setReviewWorkedUntil({ month: "", year: "" });
        /*
          Never pre-checked. This used to read `!ch0`, so a manager with no recorded roles opened
          the form already claiming the reader still works with them - an answer nobody gave, on
          the one field that decides whether the rating describes the present or the past.

          A role WITH a start and no end still leaves this off: that is the manager's tenure, not
          a statement about the reader's.
        */
        setReviewCurrentlyWorking(false);
      }
    }
  }, [reviewStep !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear edit review errors when edit review form opens
  useEffect(() => {
    if (editReviewStep !== null) {
      setEditReviewSubmitError(null);
      setEditReviewTitleError(null);
      setEditReviewDateError(null);
    }
  }, [editReviewStep !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear date errors when date fields change
  useEffect(() => {
    setReviewDateError(null);
    setCrossUserWarningDismissed(false);
  }, [reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking]);
  useEffect(() => {
    setEditReviewDateError(null);
    setEditCrossUserWarningDismissed(false);
  }, [editWorkedFrom, editWorkedUntil, editCurrentlyWorking]);

  // Post-auth auto-submit: wait until cachedUserReviews has loaded, then validate
  // using the reactive computed values and either show errors or submit.
  // This avoids all async race conditions - the button stays disabled (!!pendingAutoSubmit)
  // until we're ready, and validation uses the already-correct reactive state.
  useEffect(() => {
    if (!pendingAutoSubmit || !userReviewsFetched) return;
    const submitUser = pendingAutoSubmit;
    setPendingAutoSubmit(null);
    if (!reviewStep) return; // form was closed before data loaded
    if (atReviewLimit) {
      setReviewSubmitError("You've reached the limit of 5 reviews for this manager.");
      setReviewStep("ratings");
      return;
    }
    if (isDuplicateTitle) {
      setConflictAfterAuth(true);
      setReviewStep("ratings");
      return;
    }
    if (isManagerRoleOverlap) {
      setConflictAfterAuth(true);
      setReviewStep("ratings");
      return;
    }
    // All checks passed - submit. user is set in auth context, no overrideUser needed.
    handleSubmitReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSubmit, userReviewsFetched]);

  // Restore pending review data; open sign-in modal if returning after email verification
  /*
    Applying a review draft, separated from deciding whether it may be applied.

    `mayAutoSubmit` is the part that matters. The branch at the end of this function used to fire
    the submission for ANY signed-in user as soon as a complete draft was restored, and nothing
    established that the draft was theirs - so a rating left on a shared browser was published
    under whoever signed in next. It is now passed in, and it is false for a draft that had to be
    offered.
  */
  const applyReviewDraft = (
    data: any,
    { isVerified, mayAutoSubmit }: { isVerified: boolean; mayAutoSubmit: boolean },
  ) => {
    if (data.modalRatings)         setModalRatings(data.modalRatings);
    if (data.reviewAttested != null) setReviewAttested(data.reviewAttested);
    if (data.generatedName)        setGeneratedName(data.generatedName);
    if (data.reviewWorkedFrom)     setReviewWorkedFrom(data.reviewWorkedFrom);
    if (data.reviewWorkedUntil)    setReviewWorkedUntil(data.reviewWorkedUntil);
    if (data.reviewCurrentlyWorking != null) setReviewCurrentlyWorking(data.reviewCurrentlyWorking);
    if (data.reviewManagerCompany != null)   setReviewManagerCompany(data.reviewManagerCompany);
    if (data.reviewManagerTitle != null)     setReviewManagerTitle(data.reviewManagerTitle);
    if (data.reviewManagerStatus != null)    setReviewManagerStatus(data.reviewManagerStatus);
    if (data.reviewLocation)       setReviewLocation(data.reviewLocation);
    if (data.draftToken)           reviewDraftTokenRef.current = data.draftToken;
    if (data.signupEmail) {
      setAuthFlowEmail(data.signupEmail);
      setPendingVerificationEmail(data.signupEmail);
      setPendingEmailVerified(isVerified || !!data.emailVerified);
    }
    skipResetRef.current = true;
    if (isVerified) {
      setReviewStep("details");
      setFromVerified(true);
      setAuthFlowStep("signin");
    } else if (data.signupEmail) {
      setReviewStep("details");
      if (data.emailVerified) setFromVerified(true);
      setAuthFlowStep(data.emailVerified ? "signin" : "verify_email");
    } else if (user) {
      /*
        Returning from social OAuth: the person left a complete review behind to go and
        sign in, so reopen it on its last step and let the validation effect decide
        whether it can be submitted or has hit a conflict.

        Gated on the ratings being complete rather than on the draft carrying a step.
        Drafts written before the step was recorded - and the OAuth round trip itself -
        have no `reviewStep`, and requiring one here silently stopped the whole
        conflict-after-auth flow from reopening.
      */
      const allRated = data.modalRatings
        && Object.keys(data.modalRatings).length > 0
        && Object.values(data.modalRatings as Record<string, number>).every(r => r >= 1);
      if (allRated) {
        setReviewStep("ratings");
        /*
          ONLY for a draft this account is known to own. An offered draft that somebody has
          just accepted is restored and reopened, and they press submit themselves: accepting
          an offer says "these answers are mine", which is not the same as "publish them now".
        */
        if (mayAutoSubmit) setPendingAutoSubmit(user);
      } else if (data.reviewStep) {
        setReviewStep(data.reviewStep);
      }
    } else if (data.reviewStep) {
      /*
        A reload, most often. The form was open when this was saved, so it opens again, on
        the step it was left on.

        It used to restore the answers silently and leave the form shut, which put somebody
        who refreshed mid-review back on the manager profile with no sign their work still
        existed - indistinguishable from having lost it.
      */
      setReviewStep(data.reviewStep);
    }
  };

  useEffect(() => {
    const isVerified = searchParams.get("verified") === "true";
    const thisManager = id || managerSlug;

    /*
      WHOSE DRAFT IS THIS?

      Read rather than taken, because a draft for a DIFFERENT manager must be left exactly where
      it is - consuming it here would throw away a review in progress about somebody else.

      Their own scope is theirs by construction, because only a signed-in session writes there.

      An anonymous draft is OFFERED. Always, with no exceptions, and there were two: a draft whose
      `signupEmail` matched the signed-in address, and a load carrying `?verified=true`. Both were
      values written by whoever had the browser rather than facts about who wrote the draft. An
      anonymous draft carries no identity, so there is nothing on it to verify.
    */
    const own = reviewDraft.read();
    let data = own && own.managerId === thisManager ? own : null;
    let trusted = false;
    if (data) {
      reviewDraft.clear();
      trusted = true;
      data = withoutUnprovenEmail(data, { accountEmail: user?.email });
    } else if (!own && user?.id) {
      const anon = anonymousDraftOffer<any>(REVIEW_DRAFT_KEY, user.id, DRAFT_TTL);
      if (anon && anon.managerId === thisManager) setOfferedReviewDraft(anon);
    }

    if (data) applyReviewDraft(data, { isVerified, mayAutoSubmit: trusted });
    // Said rather than inferred; reading it is what clears it. Names nothing from the draft.
    if (takeExpiryNotice(REVIEW_DRAFT_KEY, user?.id)) setReviewDraftExpired(true);
    if (isVerified) setSearchParams({}, { replace: true });
  }, [id, managerSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The contributor says an anonymous draft is theirs. Nothing is applied until they do. */
  const acceptOfferedReviewDraft = () => {
    if (!user?.id) return;
    const taken = adoptAnonymousDraft<any>(REVIEW_DRAFT_KEY, user.id, DRAFT_TTL);
    setOfferedReviewDraft(null);
    // Same guard as any other restore: accepting answers is not a reason to show an address that
    // may belong to somebody else.
    if (taken) {
      applyReviewDraft(withoutUnprovenEmail(taken, { accountEmail: user?.email }),
                       { isVerified: false, mayAutoSubmit: false });
    }
  };

  /** They say it is not. It stays in the anonymous scope rather than being destroyed here. */
  const declineOfferedReviewDraft = () => setOfferedReviewDraft(null);

  /*
    ONE PAYLOAD, built in one place, because it is now written from two.

    The effect keeps the draft current while the form is open. `persistReviewDraftNow` writes the
    same payload SYNCHRONOUSLY, immediately before the form sends somebody away to authenticate,
    which the effect cannot do: it runs after the render that follows a state change, so a handler
    that navigates in the same tick leaves with the newest answer unsaved. Social sign-in already
    leaves this page, and after Stage 4 every sign-in will.
  */
  const buildReviewDraftPayload = () => ({
      returnTo: id ? `/manager/${id}` : `/companies/${companySlug}/managers/${managerSlug}`,
      managerId: id || managerSlug,
      // Where they were, so a reload reopens the form rather than dropping them on the profile.
      reviewStep,
      // Where the work happened. Not saved before, so a refresh silently reverted it to whatever
      // the visitor's geography suggested.
      reviewLocation,
      modalRatings, authorType, generatedName, reviewAttested,
      reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking,
      reviewManagerCompany, reviewManagerTitle, reviewManagerStatus,
      ...(pendingVerificationEmail ? { signupEmail: pendingVerificationEmail, emailVerified: pendingEmailVerified } : {}),
      ...(reviewDraftTokenRef.current ? { draftToken: reviewDraftTokenRef.current } : {}),
  });

  /** Writes the review draft right now, for a caller that is about to navigate. */
  const persistReviewDraftNow = () => {
    if (!reviewStep) return;
    reviewDraft.write(buildReviewDraftPayload());
  };

  // Continuously persist review data while review form is open so any navigation away preserves it
  useEffect(() => {
    if (!reviewStep) return;
    if (isSubmittingReview) return; // don't re-persist while submitting - submit clears the draft
    /*
      Saved whenever the form is open, not only once every star is filled.

      That old condition made sense while the ratings were the FIRST step - nothing existed to keep
      until they were answered. They are the last step now, so it meant somebody on the manager or
      the timeline step had nothing saved at all, and a refresh threw away everything they had done.
      The form is only open because somebody deliberately opened it; that is reason enough to keep
      what is in it.
    */
    reviewDraft.write(buildReviewDraftPayload());
  }, [reviewStep, reviewLocation, isSubmittingReview, modalRatings, reviewAttested, reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking, reviewManagerCompany, reviewManagerTitle, authorType, id, pendingVerificationEmail, pendingEmailVerified]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    The same answers, sent to the server while the form is still open.

    NOT the drop-off endpoint. That one writes a real, public review and runs once, at submit.
    This writes an internal draft and runs every few seconds, because half the categories answered
    is not a rating and a profile showing one would be stating an opinion nobody finished forming.

    Shares the token the submit path already mints, so finishing the form resolves this draft
    rather than leaving a second record of the same opinion.
  */
  useDraftSync({
    url: `${API_BASE}/api/managers/${manager?.id ?? id}/reviews/autosave`,
    token: reviewDraftTokenRef.current ?? (reviewDraftTokenRef.current = crypto.randomUUID()),
    enabled: !user && !!(manager?.id ?? id),
    body: () => {
      const answered = Object.values(modalRatings).filter((r) => r >= 1).length;
      if (answered === 0) return null;
      return {
        ratings: modalRatings,
        author: generatedName,
        managerCompany: reviewManagerCompany,
        managerTitle: reviewManagerTitle,
        workedFrom: reviewWorkedFrom,
        workedUntil: reviewCurrentlyWorking ? null : reviewWorkedUntil,
      };
    },
    deps: [modalRatings, reviewManagerCompany, reviewManagerTitle,
           reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking],
  });

  // Close review dropdown when clicking outside
  useEffect(() => {
    if (!showReviewDropdown) return;
    const handler = (e: MouseEvent) => {
      if (reviewDropdownRef.current && !reviewDropdownRef.current.contains(e.target as Node)) {
        setShowReviewDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showReviewDropdown]);

  // Calculate category averages for display (driven by contextReviews)
  const calculateCategoryAverages = () => {
    const averages: Record<string, number> = {};

    if (contextReviews.length > 0) {
      RATING_CATEGORIES.forEach((category) => {
        const ratingsForCategory = contextReviews.map((review) => review.ratings[category] || 0);
        const total = ratingsForCategory.reduce((acc, rating) => acc + rating, 0);
        averages[category] = total / ratingsForCategory.length || 0;
      });

      const totalRating = contextReviews.reduce((acc, review) => acc + review.overallRating, 0);
      const averageOverallRating = Math.round((totalRating / contextReviews.length) * 10) / 10 || 0;
      return { ...averages, overallRating: averageOverallRating };
    } else {
      RATING_CATEGORIES.forEach((category) => {
        averages[category] = 0;
      });
      averages.overallRating = 0;
    }

    return averages;
  };

  const managerCategoryAverages = manager ? calculateCategoryAverages() : {};

  /*
    Sort reviews, with one rule ahead of whatever was chosen.

    A review waiting on a moderator goes first. It is the one its author came back to look at, and
    it is the only one on the page whose state they cannot otherwise see.

    "Most recent" sorted on `b.id - a.id`, and review ids are UUIDs. Subtracting two strings gives
    NaN, a comparator returning NaN is treated as 0, and the default sort therefore did nothing at
    all - the list simply kept whatever order it arrived in. It sorts on the timestamp now.
  */
  const sortedReviews = [...contextReviews].sort((a, b) => {
    const pending = Number(a.published === false) - Number(b.published === false);
    if (pending !== 0) return -pending;
    switch (sortBy) {
      case "helpful":
        return b.helpfulCount - a.helpfulCount;
      case "highest":
        return b.overallRating - a.overallRating;
      case "lowest":
        return a.overallRating - b.overallRating;
      case "recent":
      default:
        return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    }
  });

  /*
    What the reviews section draws: the real ones where there are any, placeholders only when a
    locked reader would otherwise be shown nothing at all.
  */
  /*
    At least five cards while locked, however few real reviews there are.

    A stack of one or two says the same discouraging thing "1 opinion hidden" said - managers do
    not each collect dozens, and a short stack advertises that. Five reads as a body of opinion
    worth unlocking. Real reviews lead; placeholders make up the difference behind them.
  */
  const MIN_LOCKED_CARDS = 5;
  /*
    WHO THE INVENTED STACK IS FOR: a signed-out visitor, and nobody else.

    It is an advertisement for contributing - five cards that read as a body of opinion worth
    unlocking - and it is only honest as that. Shown to somebody signed in it is something else
    entirely: a person who has just added a manager and rated them was shown their own held
    rating plus four invented strangers on a profile that cannot have any, as though other people
    had already worked for somebody nobody had heard of a minute earlier.

    Signed in means no placeholders, whether or not they have contributed. The gate on real
    scores is unchanged - that is what contributing buys - but nothing is invented for them.
  */
  const showInventedCards = !user;
  /*
    NOTHING IS WITHHELD WHEN EVERY RATING ON THE PAGE IS THE READER'S OWN.

    The aggregate, the strongest/weakest block and the breakdown are all computed from the
    reviews below, so on a manager somebody has just added - where the only rating is the one
    they wrote - every one of those numbers IS their own, blurred back at them. The page showed
    their card in full and the identical score smudged out directly above it.

    It is the same rule as the card: the gate withholds OTHER PEOPLE'S scores. When there are
    none, there is nothing to withhold.
  */
  const myDataOnly = sortedReviews.length > 0
    && sortedReviews.every((r: any) => myReviewIds.has(r.id));
  const gateLocked = isLocked && !myDataOnly;
  /*
    EVERY RATING ON THIS PROFILE IS A PLATFORM EXAMPLE, so the score, the trajectory and the one
    card on the page are all demonstrations rather than anybody's opinion.

    This is what the three example pills key on. It is computed from the review rows rather than
    from the manager's cached figures BECAUSE those figures are already correct and already zero:
    `recalculate` counts only `origin = 'contributor'`, so an example-only manager carries
    reviews_count 0 and a NULL overall_rating. The number the page prints in that case comes from
    the example ROW, which is exactly why it needs labelling and why `manager.overallRating` could
    never tell us.

    `.every` on a non-empty list, not `.some`: a manager holding one example AND one real rating is
    not an example profile, and the example row there is labelled by its own card. In practice that
    pair no longer arises for new ratings, because a genuine rating now deletes the example as it
    lands - but it still exists in older data, and the pills must not appear on those profiles.
  */
  const exampleOnly =
    contextReviews.length > 0 && contextReviews.every((r: any) => r.isExample === true);
  const reviewRows: any[] = !gateLocked || !showInventedCards
    ? sortedReviews
    : [...sortedReviews,
       ...LOCKED_REVIEW_PLACEHOLDERS.slice(0, Math.max(0, MIN_LOCKED_CARDS - sortedReviews.length))];
  const handleSubmitReport = async (overrideUser?: User) => {
    if (!reportReason) return;

    if (!user && !overrideUser) {
      /*
        PERSISTED, not just held in a ref, because signing in is now a PAGE LOAD.

        `pendingAction` is a useRef, and a ref does not survive a navigation. That was fine while
        the auth modal signed somebody in without leaving the page; Universal Login replaced that
        with a redirect to Auth0, so a guest who wrote a report, pressed Submit and signed in came
        back to an empty form with their report silently gone.

        Exactly the shape of ISSUE 32, where a draft token lived only in a ref and the round trip
        discarded it. Two tests in boss-profile-admin-and-resume.spec.ts caught this one - "a
        report written before signing in is still sent afterwards" and "does not send it twice" -
        which is why they are worth retargeting rather than retiring.

        Keyed per manager, so a report half-written about one profile cannot resurface on another.
      */
      try {
        sessionStorage.setItem(PENDING_REPORT_KEY, JSON.stringify({
          reason: reportReason,
          comment: reportComment || null,
          managerId: manager?.id ?? null,
          savedAt: Date.now(),
        }));
      } catch {
        // Private browsing can refuse sessionStorage. The in-page path still works, so a refusal
        // degrades to the old behaviour rather than breaking the submit.
      }
      pendingAction.current = "report-submit";
      setAuthFlowStep("signup");
      return;
    }

    setIsSubmittingReport(true);
    try {
      await axios.post(
        `${API_BASE}/api/managers/${manager?.id}/report`,
        { reason: reportReason, comment: reportComment || null }
      );
      toast.success("Report submitted", {
        description: "Thank you. Our team will review this profile.",
      });
      setHasReported(true);
      setIsReportModalOpen(false);
      setReportReason("");
      setReportComment("");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info("You have already flagged this profile.");
        setHasReported(true);
      } else {
        toast.error("Failed to submit report. Please try again.");
      }
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleCancelEdit = () => {
    if (!manager) { setEditManagerStep(null); return; }
    setEditFormData({
      company: manager.company,
      title: manager.title,
      status: manager.status === "retired" ? "retired" : "active",
      country: manager.country || "",
      linkedinUrl: manager.linkedinUrl || "",
    });
    setEditManagerLocation(visibleManagerLocation(manager as any));
    setEditManagerLocationOpen(false);
    const ch = manager.careerHistory?.[0];
    if (ch?.startDate) {
      const [y, m] = ch.startDate.split("-");
      setEditStartDate({ year: y ?? "", month: m ?? "" });
    } else {
      setEditStartDate({ month: "", year: "" });
    }
    if (ch?.endDate) {
      const [y, m] = ch.endDate.split("-");
      setEditEndDate({ year: y ?? "", month: m ?? "" });
      setEditEndCurrent(false);
    } else {
      setEditEndDate({ month: "", year: "" });
      setEditEndCurrent(true);
    }
    setEditModalTouched(false);
    setEditManagerStep(null);
  };

  const handleSubmitReview = async (overrideUser?: User) => {
    const effectiveUser = overrideUser ?? user;

    if (!manager) {
      toast.error("Unable to submit review", {
        description: "Manager information is missing. Please refresh the page.",
      });
      return;
    }

    if (isSubmittingReview) return;

    if (Object.values(modalRatings).some((r) => r < 1)) {
      toast.error("Please rate all categories before submitting.");
      return;
    }

    if (!reviewAttested) {
      toast.error("Please confirm you personally worked with or for this manager.");
      return;
    }

    if (!effectiveUser) {
      if (!reviewDraftTokenRef.current) reviewDraftTokenRef.current = crypto.randomUUID();
      const dropOffToken = reviewDraftTokenRef.current;
      const dropOffOverallRating = parseFloat(
        (Object.values(modalRatings).reduce((a, b) => a + b, 0) / Object.values(modalRatings).length).toFixed(1)
      );
      axios.post(`${API_BASE}/api/managers/${manager.id}/reviews/drop-off`, {
        author: generatedName,
        overallRating: dropOffOverallRating,
        ratings: modalRatings,
        managerCompany: reviewManagerCompany,
        managerTitle: reviewManagerTitle,
        managerStatus: reviewManagerStatus,
        workedFrom: toYearMonth(reviewWorkedFrom.month, reviewWorkedFrom.year),
        workedUntil: reviewCurrentlyWorking ? null : toYearMonth(reviewWorkedUntil.month, reviewWorkedUntil.year),
        datesHidden: reviewDatesHidden,
        draftToken: dropOffToken,
      }).catch(() => {});
      /*
        The answers are written BEFORE the auth flow opens, not by the effect that normally keeps
        the draft current. Social sign-in inside that modal leaves this page, and the effect has
        not run yet for whatever changed in this same tick.
      */
      persistReviewDraftNow();
      if (pendingVerificationEmail) {
        setAuthFlowEmail(pendingVerificationEmail);
        setAuthFlowStep(pendingEmailVerified ? "signin" : "verify_email");
      } else {
        setAuthFlowStep("signup");
      }
      return;
    }

    setIsSubmittingReview(true);
    const authorName = generatedName;
    // Declared out here so the code after the try can read what the server did with the write.
    let created: { data?: { disposition?: string } } | undefined;

    const overallRating = parseFloat(
      (
        Object.values(modalRatings).reduce((a, b) => a + b, 0) /
        Object.values(modalRatings).length
      ).toFixed(1)
    );

    // 1. POST the new review
    try {
      created = await axios.post(
        `${API_BASE}/api/managers/${manager.id}/reviews`,
        {
          author: authorName,
          authorType,
          verified: true,
          helpfulCount: 0,
          overallRating,
          ratings: modalRatings,
          managerCompany: reviewManagerCompany,
          managerTitle: reviewManagerTitle,
          workedFrom: toYearMonth(reviewWorkedFrom.month, reviewWorkedFrom.year),
          workedUntil: reviewCurrentlyWorking ? null : toYearMonth(reviewWorkedUntil.month, reviewWorkedUntil.year),
          datesHidden: reviewDatesHidden,
          // Where THIS opinion happened. A contribution carries its own, so the manager moving
          // branch later never rewrites where the opinion was formed.
          ...declaredPayload(reviewLocation),
          ...(reviewDraftTokenRef.current ? { draftToken: reviewDraftTokenRef.current } : {}),
        }
      );
    } catch (error: any) {
      const msg: string = error?.response?.data?.message ?? error?.response?.data?.error ?? "";
      if (error.response?.status === 409) {
        if (msg === "role_limit_reached") {
          setReviewSubmitError("You've reached the limit of 5 reviews for this manager.");
        } else if (msg === "already_reviewed_this_role") {
          setReviewTitleError("You've already submitted a review for this role. Change the title to review a different role.");
          /*
            Back to the step that shows it, and can fix it.

            The title lives on the ratings step; submit happens on the identity step. Setting the
            error alone left somebody looking at a Submit button that had silently greyed out -
            submitDisabled includes reviewTitleError - with the explanation and the field to change
            both on a screen they could not see. A dead button and no reason is the worst possible
            answer to "I spent two minutes on this".
          */
          setReviewStep("details");
        } else if (msg.startsWith("review_cooldown:")) {
          const cooldownDate = msg.split(":")[1];
          const formatted = cooldownDate ? new Date(cooldownDate + "T00:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "30 days after your deletion";
          setReviewSubmitError(`You recently deleted a review for this manager. You can submit a new review after ${formatted}.`);
        } else {
          setConflictAfterAuth(true);
        }
      } else if (error.response?.status === 400 && msg) {
        const lower = msg.toLowerCase();
        if (lower.includes("date") || lower.includes("'from'") || lower.includes("'to'")) {
          setReviewDateError(msg);
          // Same reason as above: the dates step is where this renders and where it is fixed.
          setReviewStep("dates");
        } else if (lower.includes("title")) {
          setReviewTitleError(msg);
          setReviewStep("details");
        } else {
          setReviewSubmitError(msg);
        }
      } else {
        setReviewSubmitError(msg || "Failed to submit review. Please try again.");
      }
      setIsSubmittingReview(false);
      return;
    }

    /*
      Did the server hold this rating? It said so in the response.

      The two lines below used to be unconditional: the toast said "is live!" and the gate was
      opened locally. For a held rating both are false, and the person would find out by seeing
      everything still locked with no explanation.

      Read from the write's own answer rather than a follow-up request. A second call asking what
      the write had just done is a race the write does not have, and its failure mode is silently
      telling somebody the wrong thing.
    */
    const heldForProof = created.data?.disposition === "held";

    // 2. Refresh manager and reviews in cache
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager.id] });
    queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] });
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    // Ask, do not assume: the server knows whether this rating counts, and it is the only
    // thing that does once ratings can be held.
    void refreshUser();
    queryClient.removeQueries({ queryKey: ["managers-top"] });
    queryClient.removeQueries({ queryKey: ["stats"] });

    // 3. Refresh the user's own reviews in cache so button/state updates
    if (dbUserId) {
      await queryClient.invalidateQueries({ queryKey: ["user-reviews", manager.id, dbUserId] });
    }

    reviewDraftTokenRef.current = null;
    reviewDraft.clear();
    /*
      SAID AFTER THE SAVE, and only after it.

      The failure branch above returns before reaching this line, so this cannot fire for a
      rating that was not written. `disposition` is what the server actually did: a held rating is
      saved but not publicly live, and counting it as published would overstate what readers can
      see.
    */
    track("review_submitted", {
      kind: "new",
      disposition: created?.data?.disposition === "held" ? "held" : "published",
      ...consumePromptFollow(),
    });

    if (heldForProof) {
      // Straight to the proof screen, and the copy leads with the rating being safe. "One more
      // step" reads very differently when somebody fears the last two minutes are gone.
      toast(`Your rating of ${manager.name} is saved`, {
        description: "One quick step before it goes live.",
      });
      navigate(
        `/managers/${manager.id}/confirm?name=${encodeURIComponent(manager.name)}` +
        `&company=${encodeURIComponent(manager.company ?? "")}`,
      );
      return;
    }

    toast.success(`Your review of ${manager.name} is live!`, {
      description: "Others can now see your experience. Thank you for helping the community.",
    });

    /*
      Then, separately, ask about the employer.

      Offered here on the manager's own profile because that is where people want to be once they
      have rated someone, and suppressed for anyone who has already answered so it never nags.

      Never part of the review itself: nothing may make the manager contribution harder.
    */
    if (manager.companySlug && !isNudgeSuppressed(manager.companySlug)) {
      setNextStepOpen(true);
    }

    setIsSubmittingReview(false);
    setReviewStep(null);
    setModalRatings(initializeRatings());
  };

  // Finds the user's existing review that conflicts with the current draft -
  // first by exact title+company match, then by date overlap as a fallback.
  const findConflictingReview = () => {
    const byRole = cachedUserReviews.find((r: any) =>
      r.managerTitle?.trim().toLowerCase() === reviewManagerTitle.trim().toLowerCase() &&
      r.managerCompany?.trim().toLowerCase() === reviewManagerCompany.trim().toLowerCase()
    );
    if (byRole) return byRole;
    // Fallback: find by date overlap (different company / title)
    const newFrom = toYMVal(reviewWorkedFrom.month, reviewWorkedFrom.year);
    const newUntil = reviewCurrentlyWorking ? 999999 : toYMVal(reviewWorkedUntil.month, reviewWorkedUntil.year) ?? 999999;
    return cachedUserReviews.find((r: any) => {
      const existFrom = r.workedFrom ? parseInt(r.workedFrom.slice(0, 4)) * 100 + parseInt(r.workedFrom.slice(5, 7)) : null;
      if (!existFrom) return false;
      const existUntil = r.workedUntil ? parseInt(r.workedUntil.slice(0, 4)) * 100 + parseInt(r.workedUntil.slice(5, 7)) : 999999;
      return newFrom !== null && newFrom <= existUntil && existFrom <= newUntil;
    }) ?? null;
  };

  const handleReplaceReview = async () => {
    const conflictingReview = findConflictingReview();
    if (!conflictingReview) return;
    setIsReplacingReview(true);
    setIsSubmittingReview(true); // prevent draft from being re-persisted
    try {
      const overallRating = parseFloat(
        (Object.values(modalRatings).reduce((a: number, b: any) => a + b, 0) / Object.values(modalRatings).length).toFixed(1)
      );
      await axios.post(
        `${API_BASE}/api/managers/${manager?.id}/reviews/${conflictingReview.id}/replace`,
        {
          overallRating,
          ratings: modalRatings,
          managerCompany: reviewManagerCompany || manager?.company,
          managerTitle: reviewManagerTitle || manager?.title,
          workedFrom: toYearMonth(reviewWorkedFrom.month, reviewWorkedFrom.year),
          workedUntil: reviewCurrentlyWorking ? null : toYearMonth(reviewWorkedUntil.month, reviewWorkedUntil.year),
          datesHidden: reviewDatesHidden,
          authorType,
          author: generatedName,
        }
      );
      reviewDraft.clear();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: managerQueryKey }),
        queryClient.refetchQueries({ queryKey: ["manager-reviews", manager?.id] }),
        queryClient.refetchQueries({ queryKey: ["manager-career-segments", manager?.id] }),
        queryClient.refetchQueries({ queryKey: ["user-reviews", manager?.id, dbUserId] }),
      ]);
      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["stats"] });
      setConflictAfterAuth(false);
      setReviewStep(null);
      setModalRatings(initializeRatings());
      toast.success("Review replaced successfully!");
    } catch (error: any) {
      const msg: string = error?.response?.data?.message ?? error?.response?.data?.error ?? "";
      setReviewSubmitError(msg || "Failed to replace your existing review. Please try again.");
    }
    setIsReplacingReview(false);
    setIsSubmittingReview(false);
  };

  const handleEditManager = async () => {
    if (!editFormData.company.trim() || !editFormData.title.trim()) {
      toast.error("Please fill in all fields", {
        description: "Both company and title are required.",
      });
      return;
    }

    if (!user) {
      pendingAction.current = "edit-submit";
      setAuthFlowStep("signup");
      return;
    }

    const isEditRetired = !editEndCurrent;
    const newStartDate = toYearMonth(editStartDate.month, editStartDate.year);
    const newEndDate   = isEditRetired ? toYearMonth(editEndDate.month, editEndDate.year) : null;

    // Pending managers: overwrite directly (not live, no edit request needed)
    if (manager?.approvalStatus === "pending_approval") {
      try {
        await axios.put(`${API_BASE}/api/managers/${manager.id}`, {
          ...(await editCompany.payload()),
          companyLogoUrl: editCompanyLogoUrl ?? null,
          title: toJobTitleCase(editFormData.title),
          status: editFormData.status,
          country: editManagerLocation.country || editFormData.country || null,
          linkedinUrl: editFormData.linkedinUrl.trim() || null,
          startDate: newStartDate,
          endDate: newEndDate,
        });
        queryClient.invalidateQueries({ queryKey: managerQueryKey });
        queryClient.invalidateQueries({ queryKey: ["my-submitted-managers"] });
        queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] });
        queryClient.invalidateQueries({ queryKey: ["company-listing"] });
        toast.success("Manager updated!", {
          description: "Your changes have been saved.",
        });
        setEditManagerStep(null);
      } catch {
        toast.error("Failed to update manager. Please try again.");
      }
      return;
    }

    try {
      const ch = manager?.careerHistory?.[0];
      const origStartDate = ch?.startDate ?? null;
      const origEndDate   = ch?.endDate ?? null;

      const statusChanged   = editFormData.status !== manager?.status;
      const companyChanged  = editFormData.company.trim() !== manager?.company;
      const titleChanged    = editFormData.title.trim() !== manager?.title;
      /*
        The whole location, not just the country.

        This compared country alone, so moving a manager from Toronto to Kitchener - same country,
        different city - counted as no change at all and the form returned "no changes to save".
      */
      const countryChanged  = (editManagerLocation.country || null) !== (manager?.country || null);
      const locationChanged = countryChanged
        || (editManagerLocation.state || null) !== ((manager as any)?.state || null)
        || (editManagerLocation.city  || null) !== ((manager as any)?.city  || null)
        || (editManagerLocation.companyLocationId ?? null) !== ((manager as any)?.companyLocationId ?? null);
      const linkedinChanged = (editFormData.linkedinUrl.trim() || null) !== (manager?.linkedinUrl || null);
      const startChanged    = newStartDate !== origStartDate;
      const endChanged      = newEndDate !== origEndDate;
      const anyChanged = statusChanged || companyChanged || titleChanged || locationChanged || linkedinChanged || startChanged || endChanged;

      if (!anyChanged) {
        setEditManagerStep(null);
        return;
      }

      // All changes go through edit-request flow for admin approval
      const payload: Record<string, string | number | null> = {};
      // The picked company's identity rides with the request. Approval uses it directly, so an
      // admin approving weeks later cannot land on a different company that shares the name.
      if (companyChanged)  Object.assign(payload, await editCompany.payload());
      if (companyChanged && editCompanyLogoUrl) payload.companyLogoUrl = editCompanyLogoUrl;
      if (titleChanged)    payload.title       = toJobTitleCase(editFormData.title);
      if (statusChanged)   payload.status      = editFormData.status;
      if (countryChanged)  payload.country     = editManagerLocation.country || null;
      /*
        The rest of the answer travels with it - a city nobody can send is a city nobody can fix.
        Sent as "" rather than omitted when cleared, because the backend leaves a null column
        alone and an edit that removes a city has to be able to say so.
      */
      if (locationChanged) {
        payload.state = editManagerLocation.state || "";
        payload.city  = editManagerLocation.city  || "";
        if (editManagerLocation.precision) payload.precision = editManagerLocation.precision;
        // Negative means "no longer at a specific building" - the field is otherwise additive.
        payload.companyLocationId = editManagerLocation.companyLocationId ?? -1;
      }
      if (linkedinChanged) payload.linkedinUrl = editFormData.linkedinUrl.trim();
      if (startChanged)    payload.startDate   = newStartDate;
      if (endChanged)      payload.endDate     = newEndDate;

      await axios.post(`${API_BASE}/api/managers/${manager?.id}/edit-requests`, payload);
      queryClient.invalidateQueries({ queryKey: ["manager-pending-edits", manager?.id] });

      toast.success("Change request submitted!", {
        description: "Your changes have been submitted for admin approval.",
      });
      setEditManagerStep(null);
    } catch {
      toast.error("Failed to save changes. Please try again.");
    }
  };

  const handleEditReview = async () => {
    if (Object.values(editReviewData).some((r) => r === 0)) {
      toast.error("Please rate all categories", {
        description: "All rating categories are required.",
      });
      return;
    }

    if (editingReviewId === null) return;

    if (!user) {
      navigate("/signin");
      return;
    }

    // Declared out here so the toast below can read what the server actually did with the edit.
    let updated: { data?: { disposition?: string } } | undefined;

    const overallRating = parseFloat(
      (
        Object.values(editReviewData).reduce((a, b) => a + b, 0) /
        Object.values(editReviewData).length
      ).toFixed(1)
    );

    // 1. PUT the updated review
    try {
      const editAuthorName =
        editAuthorType === "real_name" ? `${user.firstName} ${user.lastName}` :
        editAuthorType === "anonymous"  ? editGeneratedName :
        user.username;
      updated = await axios.put(
        `${API_BASE}/api/managers/${manager?.id}/reviews/${editingReviewId}`,
        {
          authorType: editAuthorType,
          author: editAuthorName,
          overallRating,
          ratings: editReviewData,
          managerCompany: editManagerCompany,
          managerTitle: editManagerTitle,
          managerStatus: editManagerStatus,
          workedFrom: toYearMonth(editWorkedFrom.month, editWorkedFrom.year),
          workedUntil: editCurrentlyWorking ? null : toYearMonth(editWorkedUntil.month, editWorkedUntil.year),
          datesHidden: editDatesHidden,
          /*
            The location is sent only when the form actually holds one, and the server treats an
            absent declaredPrecision as "leave it alone". So an edit to the stars cannot move an
            opinion, while a deliberate correction to the workplace can.
          */
          ...declaredPayload(editLocation),
        },
      );
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? err?.response?.data?.error ?? "";
      if (err?.response?.status === 409) {
        if (msg === "already_reviewed_this_role") {
          setEditReviewTitleError("You already have a review for this role. Change the title to update a different role.");
          /*
            Back to the step that shows it. Same trap as the create path: the title lives on the
            ratings step, the save is on the identity step, and setting the error alone left the
            author on a screen with no message and a Save that had quietly stopped working.
          */
          setEditReviewStep("details");
        } else {
          setEditReviewSubmitError("Failed to update review. Please try again.");
        }
      } else if (err?.response?.status === 400 && msg) {
        const lower = msg.toLowerCase();
        if (lower.includes("date") || lower.includes("'from'") || lower.includes("'to'")) {
          setEditReviewDateError(msg);
          setEditReviewStep("dates");
        } else if (lower.includes("title")) {
          setEditReviewTitleError(msg);
          setEditReviewStep("details");
        } else {
          setEditReviewSubmitError(msg);
        }
      } else {
        setEditReviewSubmitError(msg || "Failed to update review. Please try again.");
      }
      return;
    }

    // 2. Refresh manager and reviews in cache - await to ensure trajectory is up-to-date before closing
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["manager", id] }),
      queryClient.refetchQueries({ queryKey: ["manager-reviews", manager.id] }),
      queryClient.refetchQueries({ queryKey: ["manager-career-segments", manager.id] }),
      dbUserId ? queryClient.refetchQueries({ queryKey: ["user-reviews", manager.id, dbUserId] }) : Promise.resolve(),
    ]);
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    queryClient.removeQueries({ queryKey: ["managers-top"] });

    /*
      Say which one happened.

      "Has been updated" is true of a held rating too, and that is the problem: it reads as
      published when the rating is still withheld. Somebody would edit, be told it worked, and
      never learn their rating is not on the site.
    */
    const stillHeld = updated?.data?.disposition === "held";

    if (stillHeld) {
      toast.success(`Your changes to ${manager?.name} are saved.`, {
        description: "This rating is still being verified before it publishes.",
      });
    } else {
      toast.success(`Your review of ${manager?.name} has been updated.`);

    /*
      An edit is a submission too, and it was invisible: this path had no tracking, so every
      rating in the numbers was a first-time one and revisions did not exist. Same event name so
      the existing charts keep working; `kind` is what tells them apart.

      No disposition: an edit to a rating that is already live does not change whether it is live.
    */
    track("review_submitted", { kind: "edit" });
    }

    // Finished, so the draft is finished with. Only here and on a deliberate exit: a failed save
    // keeps it, because that is exactly when the answers are most worth not losing.
    clearFormDraft(editDraftKey);
    setEditReviewStep(null);
  };

  /*
    A moderator removing somebody else's rating.

    Deliberately separate from handleUnlinkReview above, which is a PERSON unlinking their OWN
    rating: that one severs ownership permanently while leaving the rating published, with no
    cooldown and no restore. A moderation removal is a different decision, and the backend keeps
    the two apart for the same reason.

    The reason is not a formality - only "junk" debits the author's confidence, so it has to be
    chosen deliberately rather than defaulted.
  */
  const [adminDeleteBusy, setAdminDeleteBusy] = useState(false);

  const handleAdminDeleteReview = async (reviewId: string, reason: string) => {
    setAdminDeleteBusy(true);
    try {
      await axios.delete(`${API_BASE}/api/admin/reviews/${reviewId}`, { data: { reason } });
    } catch {
      toast.error("Could not delete that rating. Please try again.");
      setAdminDeleteBusy(false);
      return;
    }
    // The manager's average and the company figures are recomputed server-side before this
    // resolves, so everything showing a number has to be re-read rather than patched locally.
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager?.id] });
    queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager?.id] });
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    queryClient.removeQueries({ queryKey: ["managers-top"] });
    queryClient.removeQueries({ queryKey: ["stats"] });
    toast.success("Rating deleted", {
      description: reason === "junk"
        ? "Removed, and the author's confidence was lowered."
        : "Removed. The author's confidence was not affected.",
    });
    setAdminDeleteBusy(false);
  };

  const handleUnlinkReview = async (reviewId?: string) => {
    const targetId = reviewId ?? editingReviewId;
    if (targetId === null) return;

    if (!user) {
      navigate("/signin");
      return;
    }

    // 1. UNLINK the rating. POST .../unlink, not DELETE: the rating stays published and keeps
    //    counting toward the manager's average; only this account's ownership is severed, and
    //    permanently. The old DELETE path withdrew-and-restored-anonymous after three days, which
    //    is a different lifecycle - see ManagerService.unlinkReview vs deleteReview.
    try {
      await axios.post(
        `${API_BASE}/api/managers/${manager?.id}/reviews/${targetId}/unlink`
      );
    } catch {
      toast.error("Failed to unlink rating. Please try again.");
      return;
    }

    // 2. Refresh manager and reviews in cache
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager.id] });
    queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] });
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    queryClient.removeQueries({ queryKey: ["managers-top"] });
    queryClient.removeQueries({ queryKey: ["stats"] });

    toast.success("Rating unlinked", {
      description: "It stays published anonymously; it is no longer linked to your account.",
    });

    setPendingDeleteReviewId(null);
    setShowReviewDropdown(false);
    clearFormDraft(editDraftKey);
    setEditReviewStep(null);
    setEditingReviewId(null);
    if (dbUserId) {
      queryClient.invalidateQueries({ queryKey: ["user-reviews", manager?.id, dbUserId] });
    }
    setEditReviewData({});
  };

  if (isManagerLoading) {
    return (
      <Layout>
        <section className="py-16 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </section>
      </Layout>
    );
  }

  if (isManagerError || !manager) {
    return (
      <Layout>
        {/*
          A soft 404 otherwise: the SPA is served statically, so this URL answers 200 with a
          "not found" page and Google files it under Soft 404. It cannot set a status code from
          here, but it can decline to be indexed, which is what actually keeps these out of the
          index and off the crawl budget.
        */}
        <NoIndex title="Manager Not Found | Werkpages" />
        <section className="py-16 text-center">
          <h1 className="text-3xl font-bold text-foreground">Manager Not Found</h1>
          <p className="mt-2 text-muted-foreground">The manager you're looking for doesn't exist.</p>
          <button onClick={() => navigate(-1)} className="mt-6 inline-block rounded-lg bg-[#2e0562] px-6 py-3 text-white hover:bg-[#2e0562]/90">
            Go Back
          </button>
        </section>
      </Layout>
    );
  }

  const canonicalCompanySlug = manager?.companySlug ?? companySlug ?? "";
  const canonicalManagerSlug = manager?.slug ?? managerSlug ?? "";
  const canonicalUrl = `https://werkpages.com/companies/${canonicalCompanySlug}/managers/${canonicalManagerSlug}`;
  const pageTitle = manager
    ? `${manager.name} – ${manager.title} at ${manager.company} | Werkpages`
    : "Manager Profile | Werkpages";

  const managerReviewCount = manager
    ? (contextReviews.length || Number((manager as any)?.reviewsCount ?? (manager as any)?.reviews ?? 0))
    : 0;

  const pageDescription = manager
    ? `Read anonymous employee reviews of ${manager.name}, ${manager.title} at ${manager.company}. Share your experience or browse workplace leadership ratings.`
    : "";
  /*
    Indexable, or not - see client/lib/indexability.ts for why this is no longer "has a review".

    Briefly: a review-less profile still names a real person, their role and their employer, and
    auto-created profiles are rate-limited to one per account and filtered for public figures, so
    they are not mass-generated filler. Hiding them closed off the search that leads to the first
    review being written. A profile with no employer or no role genuinely has nothing to show, and
    that is what is excluded now.
  */
  const managerIsThin = !!manager && !isManagerIndexable(manager as any);

  return (
    <>
    {/*
      Manager -> company, and manager -> another manager at the same company.

      Rating the workplace is primary: it is the dataset with far less in it, and somebody who has
      just rated a manager has exactly the experience it asks about. Rating another manager is
      offered second rather than hidden, because people who stayed somewhere for years usually had
      more than one. Both carry the company, so neither asks for it again.

      This replaced a second toast that asked the same question with the SAME button label as this
      dialog's primary action. Both on one page is what "strict mode violation: resolved to 2
      elements" was reporting. One prompt, and it still remembers the answer through suppressNudge.
    */}
    {manager && (
      <ContributionNextStep
        direction="manager_to_company"
        open={nextStepOpen}
        onClose={() => {
          setNextStepOpen(false);
          if (manager.companySlug) suppressNudge(manager.companySlug);
        }}
        confirmation="Your rating was submitted anonymously"
        question="Want to share a little more?"
        blurb={`You also worked at ${manager.company}. Rate your overall workplace experience.`}
        primaryLabel={`Rate ${manager.company}`}
        onPrimary={() => {
          setNextStepOpen(false);
          if (manager.companySlug) suppressNudge(manager.companySlug);
          navigate(
            `/companies/${manager.companySlug}/rate?returnTo=` +
            encodeURIComponent(window.location.pathname + window.location.search),
          );
        }}
        secondaryLabel={`Rate another ${manager.company} manager`}
        onSecondary={() => {
          setNextStepOpen(false);
          if (manager.companySlug) suppressNudge(manager.companySlug);
          navigate(`/companies/${manager.companySlug}`);
        }}
      />
    )}
    {manager && (
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        {/*
          One or the other, never both.

          This emitted noindex AND a canonical on a thin page, which says "do not index this" and
          "this is the preferred URL for this content" at the same time. Google reconciles that
          however it likes, and "Duplicate, Google chose different canonical than user" is what it
          looks like when it disagrees.
        */}
        {managerIsThin || SITE_HIDDEN_FROM_SEARCH
          ? <meta name="robots" content="noindex,follow" />
          : <link rel="canonical" href={canonicalUrl} />}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="profile" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Person",
              "name": manager.name,
              "jobTitle": manager.title,
              "worksFor": { "@type": "Organization", "name": manager.company },
              /*
                NO aggregateRating, and it is not an oversight.

                Google supports review snippets on a fixed list of types - Book, Course, Event,
                HowTo, LocalBusiness, Movie, Product, Recipe, SoftwareApplication - and Person is
                not one of them. A rating hung on a Person is rejected outright and the page is
                reported in Search Console as "Invalid object type for field <parent_node>",
                which is Google saying the PARENT of the rating is a type that cannot carry it.
                Six manager profiles were flagged that way.

                Nothing is lost by removing it: invalid markup never produced a star in the first
                place, so this trades a permanent error for the same zero rich results.

                The tempting fix is to relabel the page as a Product or a LocalBusiness so the
                stars become legal. That would be describing a human being as a product to game a
                snippet, it misrepresents what the page is, and it is the kind of thing that earns
                a manual action rather than a rating.
              */
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://werkpages.com" },
                { "@type": "ListItem", "position": 2, "name": manager.company, "item": `https://werkpages.com/companies/${canonicalCompanySlug}` },
                { "@type": "ListItem", "position": 3, "name": manager.name, "item": canonicalUrl },
              ],
            },
          ],
        })}</script>
      </Helmet>
    )}
    <Layout>
      {/* Hero Section */}
      <section className="border-b border-border bg-card py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <ManagerAvatar name={manager.name} size="lg" />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{manager.name}</h1>
                {user?.role === "admin" && !adminEditing && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="admin-edit-button"
                      onClick={() => {
                        setAdminEditForm({ name: manager.name, title: manager.title, company: manager.company, linkedinUrl: manager.linkedinUrl ?? "" });
                        // Seed the selection with the company as it stands. Without this the form
                        // would submit an empty name for an admin who edited only the title.
                        adminEditCompany.set(manager.company, manager.companyId ?? undefined);
                        /*
                          Seed the location with what the manager already has, so the field shows
                          the current value rather than opening blank and inviting an admin to
                          retype something that was already right.
                        */
                        setAdminEditLocation({
                          ...EMPTY_LOCATION,
                          country: (manager as any).country ?? undefined,
                          state:   (manager as any).state   ?? undefined,
                          city:    (manager as any).city    ?? undefined,
                        });
                        setAdminEditLocationOpen(false);
                        setAdminEditing(true);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 size={13} aria-hidden="true" />
                      Edit
                    </button>
                    {adminDeleteConfirm ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Delete?</span>
                        <button
                          type="button"
                          disabled={adminDeleting}
                          onClick={async () => {
                            setAdminDeleting(true);
                            try {
                              await axios.delete(`${API_BASE}/api/admin/managers/${manager?.id}`);
                              toast.success("Manager deleted");
                              queryClient.removeQueries({ queryKey: ["managers-directory"] });
                              queryClient.removeQueries({ queryKey: ["managers-top"] });
                              queryClient.removeQueries({ queryKey: ["company-listing"] });
                              queryClient.removeQueries({ queryKey: ["company-profile-slug"] });
                              queryClient.removeQueries({ queryKey: ["stats"] });
                              navigate("/directory");
                            } catch {
                              toast.error("Failed to delete manager");
                              setAdminDeleting(false);
                              setAdminDeleteConfirm(false);
                            }
                          }}
                          className="font-semibold text-destructive hover:underline disabled:opacity-50"
                        >
                          {adminDeleting ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdminDeleteConfirm(false)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid="admin-delete-manager"
                        onClick={() => setAdminDeleteConfirm(true)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Logo beside a text column of company / title / industry, so the logo spans all
                  three lines. Laid out here rather than via <CompanyRow> because the company name
                  and the industry link to different pages: one <Link> around the whole row would
                  make the industry navigate to the company, and nesting anchors is invalid HTML.
                  The logo is sized to the column - h-14 against three lines of text. */}
              <div className="mt-2 flex min-w-0 items-center gap-3">
                <Link
                  to={manager.companySlug ? companyPath(manager.industrySlug, manager.companySlug) : `/companies/${encodeURIComponent(manager.company)}`}
                  className="flex-shrink-0 hover:opacity-80 transition-opacity"
                  aria-label={`View ${manager.company}`}
                >
                  <CompanyLogoImg company={manager.company} logoUrl={headerCompanyIdentity.logoUrl} domain={headerCompanyIdentity.domain} brandfetchIconUrl={headerCompanyIdentity.brandfetchIconUrl} from={manager} sizeClass="h-14 w-14" />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    to={manager.companySlug ? companyPath(manager.industrySlug, manager.companySlug) : `/companies/${encodeURIComponent(manager.company)}`}
                    className="group/company inline-flex items-center gap-1"
                  >
                    <span className="text-sm font-semibold leading-tight text-foreground group-hover/company:text-primary transition-colors break-words">
                      {manager.company}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-0 group-hover/company:opacity-60 transition-opacity flex-shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </Link>

                  <p className="text-xs text-muted-foreground break-words">{manager.title}</p>

                  {manager.industry && manager.industrySlug && (
                    <Link
                      to={`/industries/${manager.industrySlug}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-primary transition-colors"
                    >
                      {/* Per-industry glyph, matching the flag on the country line and the dot
                          on the status pill below. Inherits the link's colour on hover. */}
                      <IndustryIcon industrySlug={manager.industrySlug} size={12} className="flex-shrink-0" />
                      <span className="break-words">{manager.industry}</span>
                    </Link>
                  )}
                </div>
              </div>

              {/*
                Where the manager works - the fullest answer we hold.

                This showed the COUNTRY alone. A manager pinned to a real address, or simply to a
                city, was described as "US" - throwing away detail somebody had deliberately
                entered, and making two managers on opposite sides of a country look identical.

                Built through the shared formatLocation so it reads the same here as on every
                form: an exact place shows its label, otherwise city, state and country in that
                order, skipping whatever is missing.
              */}
              {/*
                A GHOST profile shows its COUNTRY and nothing finer.

                A ghost is created automatically from somebody's search, so its location is not a
                fact anybody asserted about the manager - it is derived from the searcher. City,
                province and street would therefore describe the PERSON WHO SEARCHED, published on
                a page about somebody else, and "a manager in this city at this company" narrows
                to a handful of real people. Country is coarse enough to be harmless and still
                useful for the directory.

                Profiles somebody actually submitted are unaffected: a location that was typed and
                confirmed is a claim about the manager, and is shown in full.
              */}
              {(() => {
                /*
                  No ghost check here either. The API withholds the street for a location nobody
                  confirmed, so there is nothing to hide - and an address somebody DID confirm on
                  a search-created profile must be shown, which a ghost check would have blocked.
                */
                const street  = (manager as any).locationStreet;
                const shown   = formatLocation(visibleManagerLocation(manager as any));
                if (!shown && !street) return null;
                return (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {manager.country && <>{getCountryFlag(manager.country)} </>}
                    {shown}
                    {street && (
                      /* A street with no city is not an address. */
                      <span className="block text-xs text-muted-foreground/80">
                        {[street,
                          (manager as any).locationCity,
                          (manager as any).locationState]
                          .filter(Boolean).join(", ")}
                      </span>
                    )}
                  </p>
                );
              })()}

              {/* Employment status pill */}
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    manager.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${manager.status === "active" ? "bg-primary" : "bg-muted-foreground"}`} />
                  {manager.status === "active" ? "Currently Active" : "Retired"}
                </span>
              </div>

            </div>

            <div className="flex flex-col gap-3 flex-shrink-0 w-[200px] overflow-visible">
              {/*
                Above the score it is a statement about: you read "Top rated", then the number
                that earned it. Rendering nothing when it does not qualify means the column simply
                starts at the rating instead of leaving a gap.
              */}
              <TopRatedPill
                rating={managerCategoryAverages.overallRating || manager.overallRating}
                reviewCount={managerReviewCount}
                variant="inline"
              />

              {/* Compact rating strip */}
              <div className={`flex items-center gap-3 ${gateLocked ? "select-none" : ""}`}>
                <span className={`text-2xl font-bold text-[#6d5091] tabular-nums leading-none whitespace-nowrap ${gateLocked ? "blur-sm" : ""}`}>
                  {managerCategoryAverages.overallRating
                    ? Number(managerCategoryAverages.overallRating).toFixed(1)
                    : manager.overallRating
                      ? Number(manager.overallRating).toFixed(1)
                      : "-"}
                </span>
                <div>
                  {/*
                    The shared Stars, half-filled. This loop used Math.floor, so 4.9 drew four
                    stars and understated the score exactly as rounding elsewhere overstated it.
                    Locked keeps its washed-out placeholder row - a shape, not a score.
                  */}
                  {gateLocked ? (
                    <div className="flex items-center gap-0.5" role="img" aria-label="rating hidden until you contribute">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={13} aria-hidden="true" className="fill-amber-300/40 text-amber-300/40" />
                      ))}
                    </div>
                  ) : (
                    <Stars
                      rating={Number(managerCategoryAverages.overallRating || manager.overallRating || 0)}
                      size={13}
                      showValue={false}
                    />
                  )}
                  <p className={`mt-0.5 text-xs text-muted-foreground ${gateLocked ? "blur-sm" : ""}`}>
                    {(contextReviews.length || manager.reviews || 0) > 0
                      ? `${(contextReviews.length || manager.reviews || 0).toLocaleString()} ${(contextReviews.length || manager.reviews || 0) === 1 ? 'review' : 'reviews'}${(contextReviews.length || manager.opinions || 0) < MIN_OPINIONS_FOR_CONFIDENCE ? ' (limited data, interpret cautiously)' : ''}`
                      : 'No reviews yet'}
                  </p>
                </div>
              </div>

              {/*
                THE SCORE IS AN EXAMPLE, said next to the score.

                Behind the gate the number is blurred and means nothing to the reader, so the label
                would be explaining a smudge; it is omitted there for the same reason the rating
                card's is. Same pill, same wording pattern, different noun.
              */}
              {exampleOnly && !gateLocked && (
                <ExampleRatingBadge
                  className="self-start"
                  label="Example score"
                  explanation={EXAMPLE_AVERAGE_EXPLANATION}
                />
              )}

              {/* Primary CTA - Write / Edit review */}
              <div ref={reviewDropdownRef} className="relative">
                  <div className={`flex rounded-lg overflow-hidden ${isBanned || atReviewLimit ? "opacity-50" : ""}`}>
                    {/* Primary action */}
                    <button
                      onClick={() => {
                        if (isBanned || atReviewLimit) return;
                        if (!userHasReviewedState) {
                          track("rate_button_clicked");
                          setReviewManagerCompany(manager.company);
                          setReviewManagerTitle(manager.title);
                          setReviewStep("details");
                        } else {
                          setShowReviewDropdown(v => !v);
                          setPendingDeleteReviewId(null);
                        }
                      }}
                      disabled={isBanned || atReviewLimit}
                      title={
                        isBanned ? "Your account has been suspended" :
                        atReviewLimit ? "You've reached the maximum of 5 reviews for this manager" : ""
                      }
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-all text-left ${
                        isBanned || atReviewLimit
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                      } ${userHasReviewedState && !atReviewLimit ? "rounded-l-lg" : "rounded-lg"}`}
                    >
                      {atReviewLimit ? "Review Limit Reached" : userHasReviewedState ? "Edit Your Review" : "Write a Review"}
                    </button>
                    {/* Chevron - shown whenever user has reviews (to select which one to edit) */}
                    {userHasReviewedState && !isBanned && (
                      <button
                        onClick={() => { setShowReviewDropdown(v => !v); setPendingDeleteReviewId(null); }}
                        aria-label="Show review options"
                        className="border-l border-[#2e0562]/40 bg-[#2e0562] px-2 py-2 text-white hover:bg-[#2e0562]/90 transition-all rounded-r-lg"
                      >
                        <ChevronDown size={16} className={`transition-transform ${showReviewDropdown ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>

                  {/* Dropdown panel */}
                  {showReviewDropdown && (
                    <div className="absolute left-0 top-full mt-1.5 z-20 w-72 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                      {pendingDeleteReviewId ? (
                        /* Inline delete confirmation */
                        <div className="px-4 py-4">
                          <p className="text-sm font-semibold text-foreground">Unlink this rating?</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Your feedback stays published anonymously and keeps counting toward this
                            manager's statistics. You will no longer be able to edit it, and you
                            <span className="font-medium text-foreground"> will not be able to rate this manager again</span>.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleUnlinkReview(pendingDeleteReviewId)}
                              className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                            >
                              Yes, unlink
                            </button>
                            <button
                              onClick={() => setPendingDeleteReviewId(null)}
                              className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Your Reviews - select to edit
                          </p>
                          {cachedUserReviews.map((review: any) => (
                            <div
                              key={review.id}
                              className="flex items-center border-t border-border/50 first:border-t-0 hover:bg-muted/60 transition-colors group"
                            >
                              <button
                                onClick={() => {
                                  setShowReviewDropdown(false);
                                  setEditingReviewId(review.id);
                                  setEditWorkedFrom(review.workedFrom
                                    ? { month: review.workedFrom.slice(5, 7), year: review.workedFrom.slice(0, 4) }
                                    : { month: "", year: "" });
                                  setEditWorkedUntil(review.workedUntil
                                    ? { month: review.workedUntil.slice(5, 7), year: review.workedUntil.slice(0, 4) }
                                    : { month: "", year: "" });
                                  setEditCurrentlyWorking(!!review.workedFrom && !review.workedUntil);
                                  setEditDatesHidden(!!review.datesHidden);
                                  setEditManagerCompany(review.managerCompany || manager.company);
                                  setEditManagerTitle(review.managerTitle || manager.title);
                                  setEditManagerStatus(
                                    (review.managerStatus ?? manager.status) === "retired" ? "retired" : "active");
                                  /*
                                    Opens with what the review already says, not with where the
                                    manager works now. Editing an old opinion must not quietly
                                    re-file it at the branch they transferred to since.
                                  */
                                  const stored: LocationValue = review.declaredPrecision ? {
                                    country: review.declaredCountry ?? "",
                                    state:   review.declaredState ?? "",
                                    city:    review.declaredCity ?? "",
                                    precision: review.declaredPrecision,
                                    companyLocationId: review.companyLocationId ?? null,
                                    corpusPlace: null,
                                    label: "",
                                  } : EMPTY_LOCATION;
                                  setEditLocation(stored);
                                  /*
                                    Reviews written before the location field existed have none
                                    stored, and an empty field on an edit form reads as "you
                                    cleared this". Falling back to the visitor's own country and
                                    state fills it with something true that they can see, change,
                                    and confirm by submitting - the same rule the other two paths
                                    follow. A stored location is never overwritten.
                                  */
                                  void fetchGeo().then(geo =>
                                    setEditLocation(prev => orUserGeo(prev, geo)));
                                  setEditReviewData(fromApiRatings(review.ratings));
                                  const existingAuthor = review.author ?? "";
                                  if (existingAuthor === user?.username) {
                                    setEditAuthorType("username");
                                  } else if (existingAuthor === `${user?.firstName} ${user?.lastName}`) {
                                    setEditAuthorType("real_name");
                                  } else {
                                    setEditAuthorType("anonymous");
                                    setEditGeneratedName(existingAuthor || generateUsername());
                                  }
                                  setEditingEditRoleInline(false);
                                  setEditReviewStep("details");
                                }}
                                className="flex-1 text-left px-4 py-2.5"
                              >
                                <p className="text-sm font-medium text-foreground truncate">
                                  {review.managerTitle} at {review.managerCompany}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatReviewPeriod(review, { emptyStart: "No date", hiddenLabel: "Dates hidden from everyone" })}
                                </p>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteReviewId(review.id); }}
                                className="px-3 py-2.5 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                title="Unlink rating"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {!pendingDeleteReviewId && (
                        <div className="border-t border-border">
                          {atReviewLimit ? (
                            <div className="px-4 py-3">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed select-none">
                                <span className="text-base leading-none">+</span> Add Another Role
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                You've reached the maximum of 5 reviews per manager.
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setShowReviewDropdown(false);
                                setReviewManagerCompany(manager.company);
                                setReviewManagerTitle(manager.title);
                                setReviewStep("details");
                              }}
                              className="w-full text-left px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors flex items-center gap-2"
                            >
                              <span className="text-base leading-none">+</span> Add Another Role
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* Secondary actions - edit manager profile + report */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setEditManagerStep("info");
                  }}
                  disabled={isBanned}
                  aria-label={isBanned ? "Your account has been suspended" : manager.approvalStatus === "pending_approval" ? "Edit your submission" : "Edit manager's position"}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Edit2 size={13} aria-hidden="true" className="flex-shrink-0" />
                  Edit Manager Details
                </button>
                {manager.approvalStatus !== "pending_approval" && (
                  <button
                    onClick={() => {
                      if (!hasReported && !isBanned) setIsReportModalOpen(true); // report stays as single full-screen
                    }}
                    disabled={isBanned || hasReported}
                    aria-label={isBanned ? "Your account has been suspended" : hasReported ? "Profile flagged - under review" : "Report this profile"}
                    className={`flex items-center gap-1 text-xs transition-colors ${
                      hasReported
                        ? "text-orange-500 cursor-default"
                        : "text-muted-foreground hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    <Flag size={13} aria-hidden="true" />
                    {hasReported ? "Flagged" : "Report"}
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground/60 whitespace-nowrap">One review per user per role · Structured, opinion-based ratings</p>
            </div>
          </div>
        </div>
      </section>

      {/* Admin direct-edit panel */}
      {user?.role === "admin" && adminEditing && (
        <section className="border-b border-amber-200 bg-amber-50/60 py-6">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-amber-800">Admin Edit - changes cascade to reviews and career history</p>
              <button type="button" onClick={() => setAdminEditing(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={adminEditForm.name}
                  onChange={e => setAdminEditForm(p => ({ ...p, name: e.target.value }))}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={adminEditForm.title}
                  onChange={e => setAdminEditForm(p => ({ ...p, title: e.target.value }))}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company</label>
                <CompanyAutocomplete
                  name="adminEditCompany"
                  initialDomain={(manager as any)?.companyDomain}
                  initialBrandfetchIconUrl={(manager as any)?.companyBrandfetchIconUrl}
                  value={adminEditForm.company}
                  onChange={val => { setAdminEditForm(p => ({ ...p, company: val })); setAdminEditLogoUrl(undefined); adminEditCompany.bind.onChange(val); }}
                  onSuggestionSelect={(_name, logoUrl) => setAdminEditLogoUrl(logoUrl)}
                  onCompanyIdChange={adminEditCompany.bind.onCompanyIdChange}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Location</label>
                <LocationField
                  value={adminEditLocation}
                  onChange={setAdminEditLocation}
                  companyId={adminEditCompany.id}
                  companyName={adminEditForm.company}
                  editing={adminEditLocationOpen}
                  onEditStart={() => setAdminEditLocationOpen(true)}
                  onEditDone={() => setAdminEditLocationOpen(false)}
                  id="admin-edit-location"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">LinkedIn URL</label>
                <input
                  type="text"
                  value={adminEditForm.linkedinUrl}
                  onChange={e => setAdminEditForm(p => ({ ...p, linkedinUrl: e.target.value }))}
                  placeholder="https://linkedin.com/in/…"
                  maxLength={500}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                disabled={adminEditSaving || !adminEditForm.name.trim() || !adminEditForm.title.trim() || !adminEditForm.company.trim()}
                onClick={async () => {
                  setAdminEditSaving(true);
                  try {
                    await axios.put(`${API_BASE}/api/admin/managers/${manager?.id}`, {
                      name:           toNameCase(adminEditForm.name)       || undefined,
                      title:          toJobTitleCase(adminEditForm.title) || undefined,
                      ...(await adminEditCompany.payload()),
                      linkedinUrl:    adminEditForm.linkedinUrl.trim() || undefined,
                      companyLogoUrl: adminEditLogoUrl,
                      country: adminEditLocation.country ?? undefined,
                      state:   adminEditLocation.state   ?? undefined,
                      city:    adminEditLocation.city    ?? undefined,
                      /*
                        The exact place, when one was picked. -1 clears it, so an admin can move a
                        manager off a specific building rather than being stuck with whatever was
                        chosen first.
                      */
                      companyLocationId: adminEditLocation.companyLocationId ?? -1,
                    }, { withCredentials: true });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: managerQueryKey }),
                      queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager?.id] }),
                      queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager?.id] }),
                      queryClient.invalidateQueries({ queryKey: ["user-reviews", manager?.id] }),
                      queryClient.invalidateQueries({ queryKey: ["company-profile-slug"] }),
                      queryClient.invalidateQueries({ queryKey: ["company-listing"] }),
                    ]);
                    setAdminEditing(false);
                    toast.success("Manager updated");
                  } catch {
                    toast.error("Failed to save changes");
                  } finally {
                    setAdminEditSaving(false);
                  }
                }}
                className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adminEditSaving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={() => setAdminEditing(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </section>
      )}

      {/* Admin career history edit modal */}
      {adminCareerEditEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Edit Career Entry</p>
              <button type="button" onClick={() => setAdminCareerEditEntry(null)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company</label>
                {/*
                  The same company control every other form uses, not a bare text box.

                  This one asked for a company as free text, so there were no suggestions and no
                  logos - and typing a name that does not match an existing company exactly creates
                  a second one, which is how a manager ends up on the wrong logo with no way to
                  correct it from the panel that caused it.

                  CLAUDE.md section 46: a control that asks the same question is written once and
                  reused.
                */}
                <CompanyAutocomplete
                  name="adminCareerEditCompany"
                  initialDomain={(manager as any)?.companyDomain}
                  initialBrandfetchIconUrl={(manager as any)?.companyBrandfetchIconUrl}
                  value={adminCareerEditEntry.company}
                  onChange={val => {
                    setAdminCareerEditEntry(p => p ? { ...p, company: val } : p);
                    adminCareerEditCompany.bind.onChange(val);
                  }}
                  onSuggestionSelect={(_name, logoUrl) => setAdminCareerEditLogoUrl(logoUrl)}
                  onCompanyIdChange={adminCareerEditCompany.bind.onCompanyIdChange}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Role / Title</label>
                {/*
                  The shared role control, same as every other form. A bare text box here is how
                  "Sr. Mgr" and "Snr Manager" get invented as separate roles; suggesting spellings
                  other people already used is what stops that. Free text still goes through.
                */}
                <RoleAutocomplete
                  name="adminCareerEditRole"
                  id="admin-career-edit-role"
                  value={adminCareerEditEntry.role}
                  onChange={val => setAdminCareerEditEntry(p => p ? { ...p, role: val } : p)}
                  placeholder="e.g., Engineering Manager"
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Started</label>
                  {/*
                    The shared month/year control, not two free-text year boxes. Every other date
                    question on the site is asked this way, and a typed year cannot be validated -
                    "20224" was as acceptable as "2024" here.
                  */}
                  <MonthYear
                    label="Start"
                    value={adminCareerEditEntry.startDate}
                    years={YEARS}
                    onChange={val => setAdminCareerEditEntry(p => p ? { ...p, startDate: val } : p)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Ended <span className="text-muted-foreground/70">(blank if current)</span></label>
                  <MonthYear
                    label="End"
                    value={adminCareerEditEntry.endDate}
                    years={YEARS}
                    onChange={val => setAdminCareerEditEntry(p => p ? { ...p, endDate: val } : p)}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                disabled={adminCareerEditSaving || !adminCareerEditEntry.company.trim() || !adminCareerEditEntry.role.trim() || !adminCareerEditEntry.startDate.trim()}
                onClick={async () => {
                  setAdminCareerEditSaving(true);
                  try {
                    /*
                      Create when there is no row yet, update when there is.

                      A trajectory card can come from a career_history row, from reviews grouped
                      into a segment, or from the manager record - and only the first had an id.
                      Without a row there was nowhere to put the dates, so the panel fell back to
                      the reviewer's own worked_until and the role read "Present" regardless.
                    */
                    /*
                      The company the admin PICKED rides with the request - its id and its logo,
                      not just the name.

                      Sending the name alone made the server re-resolve it, and re-resolving by
                      name is how a second company gets created and the manager ends up on the
                      wrong logo. Reusing the picker but discarding what it produced is not reuse.
                    */
                    const picked = await adminCareerEditCompany.payload();
                    const body = {
                      company:        picked.company || adminCareerEditEntry.company.trim(),
                      companyId:      picked.companyId,
                      companyLogoUrl: adminCareerEditLogoUrl ?? null,
                      title:          adminCareerEditEntry.role.trim(),
                      startDate:      adminCareerEditEntry.startDate.trim(),
                      endDate:        adminCareerEditEntry.endDate.trim() || null,
                    };
                    if (adminCareerEditEntry.entryId == null) {
                      await axios.post(
                        `${API_BASE}/api/admin/managers/${manager.id}/career-history`,
                        body, { withCredentials: true });
                    } else {
                      await axios.put(
                        `${API_BASE}/api/admin/managers/${manager.id}/career-history/${adminCareerEditEntry.entryId}`,
                        body, { withCredentials: true });
                    }
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: managerQueryKey }),
                      queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] }),
                    ]);
                    setAdminCareerEditEntry(null);
                    toast.success(adminCareerEditEntry.entryId == null ? "Role recorded" : "Career entry updated");
                  } catch {
                    toast.error("Failed to update entry");
                  } finally {
                    setAdminCareerEditSaving(false);
                  }
                }}
                className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adminCareerEditSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setAdminCareerEditEntry(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin career history delete confirmation */}
      {/*
        Removing a career stage, which is not the same thing as deleting a career_history row.

        Three cases, and the dialog asks only what it has to:
          - no reviews behind the stage: it just goes;
          - reviews behind it: move them to another role, or delete them along with it.

        The second option is the one that matters. A stage can be wrong while the opinions under it
        are real, and deleting somebody's genuine review to tidy up a chart is not a repair.
      */}
      {adminCareerDeleteStage != null && (() => {
        const stage = adminCareerDeleteStage;
        const hasReviews = stage.reviewCount > 0;
        // Every other stage on this profile is a candidate to receive the reviews.
        const otherRoles = (effectiveCareerSegments as any[])
          .filter((s) => s.company.trim().toLowerCase() !== stage.company.trim().toLowerCase());

        /*
          "entryOnly" is the original behaviour, kept deliberately.

          It removes the recorded role and leaves the ratings alone, so they regroup under whatever
          else names them. That is the right act when the career_history row itself is wrong - a
          mistyped employer or a wrong date - and the opinions under it are fine. Folding it into
          the stage delete would have meant an admin could no longer correct a bad row without
          first deciding the fate of other people's reviews.

          It is offered only where a row exists, because it is the only one of the three that acts
          on a row.
        */
        const resolveStage = async (action: "delete" | "reassign" | "entryOnly") => {
          setAdminCareerDeleting(true);
          try {
            const target = otherRoles.find((r) => r.company === adminStageReassignTo);
            if (action === "entryOnly") {
              await axios.delete(
                `${API_BASE}/api/admin/managers/${manager.id}/career-history/${stage.entryId}`,
                { withCredentials: true },
              );
            } else {
            await axios.post(
              `${API_BASE}/api/admin/managers/${manager.id}/career-stage`,
              action === "reassign"
                ? { action, company: stage.company, toCompany: target?.company, toTitle: target?.role }
                : { action, company: stage.company, confirmRealReviews: true },
              { withCredentials: true },
            );
            }
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: managerQueryKey }),
              queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] }),
            ]);
            setAdminCareerDeleteStage(null);
            toast.success(
              action === "reassign" ? "Reviews moved and role removed"
              : action === "entryOnly" ? "Recorded role removed"
              : "Role removed");
          } catch (err: any) {
            toast.error(err?.response?.data?.message ?? "Failed to remove the role");
          } finally {
            setAdminCareerDeleting(false);
          }
        };

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" data-testid="career-stage-dialog">
            <p className="text-sm font-semibold text-foreground mb-1">Remove this role?</p>
            <p className="text-xs text-muted-foreground mb-4">
              {stage.role} at {stage.company}
              {hasReviews
                ? ` · ${stage.reviewCount} ${stage.reviewCount === 1 ? "review" : "reviews"}`
                : " · no reviews"}
            </p>

            {hasReviews && (
              <div className="mb-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  This role has ratings attached. Move them to another role, or delete them with it.
                </p>
                {otherRoles.length > 0 && (
                  <div>
                    <label htmlFor="stage-reassign" className="block text-xs font-medium text-foreground mb-1">
                      Move the ratings to
                    </label>
                    <select
                      id="stage-reassign"
                      value={adminStageReassignTo}
                      onChange={(e) => setAdminStageReassignTo(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Choose a role…</option>
                      {otherRoles.map((r: any) => (
                        <option key={`${r.company}-${r.role}`} value={r.company}>
                          {r.role} at {r.company}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      The reviewers' own dates travel with them, so that role may widen to cover them.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {hasReviews && otherRoles.length > 0 && (
                <button
                  type="button"
                  disabled={adminCareerDeleting || !adminStageReassignTo}
                  onClick={() => resolveStage("reassign")}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {adminCareerDeleting ? "Working…" : "Move ratings"}
                </button>
              )}
              <button
                type="button"
                disabled={adminCareerDeleting}
                onClick={() => resolveStage("delete")}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {adminCareerDeleting
                  ? "Working…"
                  : hasReviews ? "Delete role and ratings" : "Delete role"}
              </button>
              {/*
                Only where a career_history row exists, because this is the one action that acts on
                one. See the note on resolveStage.
              */}
              {stage.entryId != null && (
                <button
                  type="button"
                  disabled={adminCareerDeleting}
                  onClick={() => resolveStage("entryOnly")}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {adminCareerDeleting ? "Working…" : "Remove role only, keep ratings"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAdminCareerDeleteStage(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* System notices - between hero and content */}
      {(manager.approvalStatus === "pending_approval" || pendingEdits.length > 0 || !!myHeldReview || (hasReported && manager.approvalStatus !== "pending_approval")) && (
        <section className="bg-background py-3">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-2">
            {manager.approvalStatus === "pending_approval" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">Profile under review. Awaiting admin approval before going public.</p>
              </div>
            )}
            {/* Only its author sees this. It is the difference between "saved" and "published",
                which the page otherwise gives them no way to tell apart. */}
            {myHeldReview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                {/*
                  Three states, and only one of them has anything for the reader to do.

                  This used to test `challenge?.status !== "admin_review"`, which is true when the
                  challenge is undefined - still loading, failed, or absent - so the link rendered
                  with nothing behind it. Optional chaining put "we don't know yet" into the
                  affirmative branch.

                  And only a high-profile hold has a self-serve path at all. A rating held because
                  its author has proof outstanding elsewhere is decided by a person; offering them
                  a verify link sends them to a page that can only tell them so.
                */}
                <p className="text-sm font-medium text-amber-800">
                  {myProofChallenge?.status === "admin_review"
                    ? "Your rating is saved and being verified. Someone on our team is reading what you sent."
                    : myProofChallenge?.reason === "high_profile"
                    ? "Your rating is saved but not published yet."
                    : "Your rating is saved and waiting on a review by our team."}
                </p>
                {myProofChallenge?.status === "open" && myProofChallenge?.reason === "high_profile" && (
                  <Link
                    to={`/managers/${manager.id}/confirm?name=${encodeURIComponent(manager.name)}&company=${encodeURIComponent(manager.company ?? "")}`}
                    className="mt-1 inline-block text-sm font-semibold text-amber-900 underline"
                  >
                    Help us verify it
                  </Link>
                )}
              </div>
            )}
            {pendingEdits.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800 mb-1">Edit pending review</p>
                {(pendingEdits[0].newTitle || pendingEdits[0].newCompany || pendingEdits[0].newStatus || pendingEdits[0].newCountry || pendingEdits[0].newLinkedinUrl) && (
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                    {pendingEdits[0].newTitle && <li>Title → {pendingEdits[0].newTitle}</li>}
                    {pendingEdits[0].newCompany && <li>Company → {pendingEdits[0].newCompany}</li>}
                    {pendingEdits[0].newStatus && <li>Status → {pendingEdits[0].newStatus === "active" ? "Currently Active" : "Retired"}</li>}
                    {pendingEdits[0].newCountry && <li>Country → {getCountryFlag(pendingEdits[0].newCountry)} {pendingEdits[0].newCountry}</li>}
                    {pendingEdits[0].newLinkedinUrl && <li>Profile URL → {pendingEdits[0].newLinkedinUrl}</li>}
                  </ul>
                )}
              </div>
            )}
            {hasReported && manager.approvalStatus !== "pending_approval" && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">You flagged this profile. Our team will review it.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/*
        Strongest and weakest, stated exactly as a company page states them.

        This was an "Overview": a generated sentence - "1 anonymous reviewer reported generally
        favourable scores…" - above two lists headed "Key Strengths" and "Lower-rated
        categories", with dot markers and its own type scale. It said the same thing as the
        company header's Strongest/Weakest block, in a different voice and a different layout,
        on two pages a reader moves between constantly. Same component now.
      */}
      <section className="border-b border-border py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <RatingHighlights
            locked={gateLocked}
            opinionCount={contextReviews.length || manager.reviews || 0}
            highlights={(() => {
            /*
              One sorted list, split - never two independent top-3 and bottom-3 slices. With six
              or fewer categories those slices overlap and a category shows as both a strength
              and a weakness at once.

              Locked draws plausible placeholders: the blur needs a shape, and a gated reader
              should see that there is a breakdown here rather than an empty band.
            */
            const scored = gateLocked
              ? RATING_CATEGORIES.map((cat, i) => ({ cat, score: [5, 4.6, 4.3, 3.6, 3.4, 3.1][i % 6] }))
              : RATING_CATEGORIES
                  .map(cat => ({ cat, score: Math.round((managerCategoryAverages[cat] || 0) * 10) / 10 }))
                  .filter(x => x.score > 0);
            if (scored.length === 0) return [];
            const sorted = [...scored].sort((a, b) => b.score - a.score);
            const cut = Math.max(3, sorted.length - 3);
            return [
              ...sorted.slice(0, 3).map(x => ({ direction: "up" as const, label: x.cat, value: x.score })),
              ...sorted.slice(cut).map(x => ({ direction: "down" as const, label: x.cat, value: x.score })),
            ];
          })()} />
        </div>
      </section>

      {/* Category Averages - bar chart */}
      <section className="border-b border-border py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight">How people rated them</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Average scores across {RATING_CATEGORIES.length} rating categories
            </p>
          </div>
          {gateLocked ? (
            <div className="relative">
              <div className="grid gap-3 sm:grid-cols-2 blur-sm select-none pointer-events-none">
                {RATING_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{category}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-[#6d5091]" style={{ width: `${Math.random() * 60 + 20}%` }} />
                    </div>
                    <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">-</span>
                  </div>
                ))}
              </div>
              <LockedOverlay
                title={`+${RATING_CATEGORIES.length} categories locked`}
                hint="Rate any manager to unlock the full breakdown"
                cta={{ label: "⭐ Rate a manager", onClick: () => navigate("/add") }}
              />
            </div>
          ) : contextReviews.length > 0 ? (
            <>
              {/*
                Summary above, detail here.

                Strongest and Weakest are stated in the section above this one, by the same
                RatingHighlights block the company page uses. This is the full list: all ten
                categories, in the order they are asked, with no way to narrow it.

                That answers the objection this comment used to raise. An earlier pass put three
                high and three low categories in big rectangles above a breakdown that then listed
                the very same figures again - every number twice, in two different visual
                languages, both presented as the main event. The answer then was to drop the cards
                and let an All / Highest / Lower filter rank the categories in place.

                It is the other way round now. Six of these ten do appear above as well, but as a
                compact two-column summary rather than a second full statement of the same data:
                one block says what stands out, this one shows everything. A filter here would be
                a third way to ask a question already answered a screen higher, and it would hide
                seven rows by default to do it - from the reader who scrolled down to this section
                precisely because they wanted all of them.
              */}
              <div>
                <RatingBreakdown
                  /* No heading here: the section above already says "How people rated them", and
                     printing "Rating breakdown / How people rated them across each category" a
                     line below it said the same thing twice in two voices. */
                  title={null}
                  /* filterable is left off: RatingBreakdown offers the All / Highest / Lower
                     pills, and its own default says why not to take them here - a surface that
                     already ranks the categories elsewhere on the page should not offer a second
                     way to do the same thing. Strongest / Weakest is that ranking. */
                  rows={RATING_CATEGORIES.map((c) => ({
                    key: c, label: c, value: managerCategoryAverages[c] || 0,
                  }))}
                />
                {/*
                  "Based on 2 opinions · Limited data, interpret cautiously" rather than "Based on
                  2 reviews. Low confidence." Same signal, said the way the rest of the site says
                  it: a reader is being told how much weight to give the number, not read a
                  statistic about it.
                */}
                <p className="mt-3 text-xs text-muted-foreground">
                  Based on {contextReviews.length} {contextReviews.length === 1 ? "opinion" : "opinions"}
                  {contextReviews.length < 5
                    ? " · Limited data, interpret cautiously"
                    : contextReviews.length < 20
                      ? " · Still a small sample"
                      : ""}
                </p>
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {RATING_CATEGORIES.map((category) => (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{category}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" />
                  <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">-</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Career Performance Timeline - gated for non-contributors and signed-out users */}
      {!gateLocked && user ? (
        <div
          style={{
            opacity: timelineUnlocked ? (timelineFadeIn ? 1 : 0) : 1,
            transition: timelineUnlocked ? "opacity 0.7s ease" : "none",
          }}
        >
          <CareerTimeline
            segments={effectiveCareerSegments}
            isExample={exampleOnly}
            onEditCareerEntry={user?.role === "admin" ? (entry) => {
              /*
                A card with no career_history row still needs its dates.

                This used to open the manager panel instead, which edits name/title/company and has
                no date fields at all - so the role's dates could not be written anywhere, and the
                trajectory went on falling back to the reviewer's own worked_until. That is why a
                manager who had plainly left still read "Present" however many times this was used.

                The same dated dialog opens either way. With no row it creates one; with a row it
                updates it.
              */
              setAdminCareerEditEntry({
                entryId:   entry.entryId,
                company:   entry.company,
                role:      entry.role,
                startDate: entry.startDate?.slice(0, 7) ?? "",
                endDate:   entry.endDate?.slice(0, 7) ?? "",
              });
            } : undefined}
            onDeleteCareerEntry={user?.role === "admin" ? (stage) => {
              setAdminStageReassignTo("");
              setAdminCareerDeleteStage(stage);
            } : undefined}
          />
        </div>
      ) : (
        <section className="py-10 border-b border-border">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            {/*
              THE PILL BELONGS ON THIS BRANCH TOO, and leaving it off is why it looked missing.

              CareerTimeline carries it, but CareerTimeline only renders for a signed-in
              contributor. A manager whose only rating is an example has, by definition, had nobody
              contribute to them - so almost every visitor to exactly the profiles that need this
              label is gate-locked and gets THIS block instead. The pill was present on the branch
              those readers never see.
            */}
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight mb-4">
              Career Performance Trajectory
              {exampleOnly && (
                <ExampleRatingBadge
                  className="ml-2 align-middle"
                  label="Example rating"
                  explanation={EXAMPLE_TRAJECTORY_EXPLANATION}
                />
              )}
            </h2>
            <div className="relative rounded-xl border border-border overflow-hidden">
              <div className="h-40 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 blur-sm" />
              <LockedOverlay
                title="See how this manager's ratings have changed over time"
                hint="Rate a manager to unlock the performance trajectory"
                cta={{ label: "⭐ Rate a manager", onClick: () => navigate("/add") }}
              />
            </div>
          </div>
        </section>
      )}

      {/* Reviews Section */}
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold text-foreground tracking-tight">
                Reviews
                {contextReviews.length > 0 && (
                  /*
                    Blurred with the ratings it counts.

                    A manager does not collect dozens of reviews, so the true number is usually
                    small - and printing "1" beside the heading is the single most discouraging
                    thing this section can say to somebody deciding whether to write one. It is
                    part of what contributing buys, not a label.
                  */
                  <span className={`ml-2 text-sm font-normal text-muted-foreground ${gateLocked ? "blur-sm select-none" : ""}`}>
                    {contextReviews.length}
                  </span>
                )}
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Personal opinions shared by reviewers · profiles and work histories are self-reported</p>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] flex-shrink-0"
            >
              <option value="recent">Most Recent</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
          </div>

          <div className="space-y-5">
            {/*
              One list, locked or not.

              The gate withholds the RATINGS, not the reviews: a locked reader gets the real
              cards - the role, the dates, who wrote it, the words, and the breakdown toggle that
              works - with every score blurred out. What it used to get instead was "1 review
              hidden" above a single blurred teaser, which is an accurate sentence and a terrible
              advertisement: it told them the thing behind the gate was one review, which is no
              reason at all to write one.

              Where there is not a single review to show, the same cards render from placeholder
              rows with everything blurred, so the section still reads as a list of opinions
              rather than an empty box.
            */}
            {reviewRows.length > 0 ? (
              reviewRows.map((review: any, rowIndex: number) => {
                /*
                  The lead card keeps its author and date when it is genuinely somebody's - the
                  proof that there are real people behind the blur. Without it the whole stack
                  could be invention and a reader has no reason to think otherwise. Its score is
                  withheld like every other: that is what contributing buys.
                */
                /*
                  A platform-generated example never takes the lead-card identity reveal: a demo
                  must not be dressed up as "the proof there are real people behind the blur". It
                  is labelled explicitly below instead.
                */
                const isExampleRow = review.isExample === true;
                const revealIdentity = rowIndex === 0 && sortedReviews.length > 0 && !isExampleRow;
                /*
                  Their own rating is theirs to read, gate or no gate. See myReviewIds above:
                  a held rating does not count towards hasContributed, so its author was being
                  shown their own scores smudged out.
                */
                const mine = myReviewIds.has(review.id);
                /*
                  TWO SHAPES SAY THE SAME THING, and only one of them was being read.

                  A row from the profile endpoint carries `published` - the aggregate projects
                  `disposition = 'live'` into it and does not send `disposition` itself. A row that
                  came back from submitting or editing a rating carries `disposition`. The badge
                  below read only `disposition`, so on the profile it never rendered at all and an
                  author's held rating sat in the list looking exactly like a published one.
                */
                const awaitingReview =
                  review.published === false || review.disposition === "held";
                const cardLocked = gateLocked && !mine;
                const isExpanded = expandedReviews.has(review.id);
                return (
                /*
                  A placeholder row is treated exactly like a real one behind the gate.

                  Blurring the whole card made the invented rows obvious at a glance - the fake
                  ones were the smudged ones - which defeats the point of showing them. The
                  handle and every score are withheld on both, so an invented contributor is
                  never legible either way.
                */
                <OpinionCard
                  key={review.id}
                  tone={awaitingReview ? "held" : "default"}
                >
                  {/*
                    EXAMPLE RATING LABEL, shown only in the unlocked view. Behind the gate the card
                    is blurred and unchanged, so the label would be unreadable and is omitted. Once
                    unlocked, the example must still read unmistakably as a platform demonstration
                    and never as an employee opinion - so it is rendered outside anything blurred.

                    A PILL, NOT A PANEL. What stood here was a full-width indigo box carrying a
                    heading and a paragraph, on a card that ExampleRatingBadge's own notes describe
                    being tinted and ringed to match. Between them they made the one rating nobody
                    wrote the loudest thing on the page. The disclosure is unchanged in substance
                    and still complete; it is one hover or one keyboard focus away instead of
                    occupying four lines above every example.
                  */}
                  {/*
                    THE EXAMPLE PILL MOVED into OpinionAuthor, beside the handle, where the
                    "Registered" pill sits on an ordinary card. It was floating at the top of the
                    card on its own line, which read as a banner over the whole thing and sat in a
                    different place from the only other pill a card can carry. One slot for "what
                    this card's author is", whichever of the two applies.
                  */}
                  {/*
                    A held rating reaches this list only for its author or an admin - the public
                    query filters it out - so it must not sit here looking published. Marked rather
                    than hidden: an admin needs to see the thing they are deciding about, and its
                    author needs to see that the rating they wrote exists.
                  */}
                  {awaitingReview && (
                    <p className="mb-3 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Not published yet, awaiting verification
                    </p>
                  )}

                  {/*
                    Moderation lives on the card itself, because the decision is about THIS
                    rating and an admin should not have to match an id against a separate list.
                  */}
                  {user?.role === "admin" && (
                    <div className="mb-3" data-testid="admin-review-moderation">
                      <DeleteRatingControl
                        busy={adminDeleteBusy}
                        onDelete={(reason) => handleAdminDeleteReview(review.id, reason)}
                      />
                    </div>
                  )}

                  {/* Role context - most important signal for readers */}
                  <div className="mb-3">
                    <p className="text-[13px] font-semibold text-foreground">
                      {review.managerTitle} at {review.managerCompany}
                    </p>
                    {/* Tenure is contributed detail, withheld like the scores on every card but the lead one. */}
                    {/*
                      Nothing at all when the author hid their dates - not the words "Dates hidden".

                      This line used to be skipped for free: the API nulled both dates for every
                      reader, so the condition was false and nothing rendered. Serving the author
                      their own dates (so their edit form can open with them) made the condition
                      true, and the formatter's hidden label surfaced on the card for the first
                      time. The guard now states the rule the card always meant, instead of relying
                      on the data being absent.

                      Matches CompanyRatingList, which had the same text removed for the same
                      reason. The picker in "Your Reviews - select to edit" DOES still name the
                      choice, deliberately: that list is the author's own, and confirming a privacy
                      setting back to the person who chose it is useful there.
                    */}
                    {!review.datesHidden && (review.workedFrom || review.workedUntil) && (
                      <p className={`text-xs text-muted-foreground mt-0.5 ${
                        cardLocked && !revealIdentity ? "blur-sm select-none" : ""
                      }`}>
                        {formatReviewPeriod(review)}
                      </p>
                    )}
                  </div>

                  {/* Rating + reviewer row */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    {/*
                      Who wrote it goes with the score, the same as on the workplace and
                      interview cards - the three lists state a lock identically or they read as
                      three different products. The review's words stay: they are the hook, and
                      the thing contributing buys is the numbers.
                    */}
                    {/*
                      The shared author block, same as the workplace and interview cards. Three
                      copies of avatar-handle-badge-date is how the interview one quietly lost
                      its avatar and nobody noticed until the two tabs were seen side by side.
                    */}
                    <OpinionAuthor
                      name={review.author}
                      when={getFormattedDate(review)}
                      /*
                        NEVER "Registered" ON AN EXAMPLE.

                        createSeedReview writes verified = true on the row, so passing the field
                        straight through put the most credibility-lending mark on the card onto
                        the one rating with no account behind it. It is a false statement about
                        provenance, and it sat directly beside the pill saying the opposite.

                        Suppressed here rather than by changing the row: the column is read by
                        other things, and a display decision belongs at the point of display.
                      */
                      verified={review.verified && !isExampleRow}
                      /* Behind the gate the card is blurred, so the label would be unreadable. */
                      isExample={isExampleRow && !cardLocked}
                      blurred={cardLocked && !revealIdentity}
                    />

                    {/* The one thing the gate actually withholds. */}
                    <div className={`flex-shrink-0 flex items-center gap-1.5 ${cardLocked ? "blur-sm select-none" : ""}`}>
                      <span className="text-lg font-bold text-foreground tabular-nums leading-none">{(review.overallRating ?? 0).toFixed(1)}</span>
                      {/* The shared Stars: half-filled where the score is, not rounded up. */}
                      <Stars rating={review.overallRating ?? 0} showValue={false} />
                    </div>
                  </div>

                  {review.text && (
                    <p className="mb-3 text-sm text-foreground leading-relaxed">{review.text}</p>
                  )}

                  {/* Collapsible category breakdown */}
                  <button
                    onClick={() => setExpandedReviews(prev => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(review.id) : next.add(review.id);
                      return next;
                    })}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    <ChevronDown size={13} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    {isExpanded ? "Hide breakdown" : "Show rating breakdown"}
                  </button>

                  {isExpanded && (
                    <div className="grid gap-1.5 sm:grid-cols-2 mt-3 pt-3 border-t border-border/60">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                          <span className="text-xs text-muted-foreground">{category}</span>
                          {/* Per-category scores are ratings too - blurred with the rest. */}
                          <div className={`flex items-center gap-1 flex-shrink-0 ml-2 ${cardLocked ? "blur-sm select-none" : ""}`}>
                            <span className="text-xs font-semibold text-foreground tabular-nums">
                              {/*
                                A stand-in where there is no real score to blur - a placeholder
                                row has none, and an opened breakdown full of dashes reads as a
                                broken control rather than a withheld one.
                              */}
                              {review.ratings?.[category as keyof typeof review.ratings]
                                ?? (cardLocked ? WITHHELD_SCORES[RATING_CATEGORIES.indexOf(category) % WITHHELD_SCORES.length] : "–")}
                            </span>
                            <Star size={10} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </OpinionCard>
                );
              })
            ) : (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <h3 className="text-[15px] font-semibold text-foreground">No reviews yet</h3>
                <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                  Be the first to share your experience. Your perspective helps others make more informed career decisions.
                </p>
              </div>
            )}

            {/* What is withheld and how to open it - after the cards it applies to. */}
            {gateLocked && (
              <LockedPanelCard
                title="Ratings are locked"
                hint="Rate any manager to see the scores behind these reviews."
                cta={{ label: "⭐ Rate a manager to unlock", onClick: () => navigate("/add") }}
              />
            )}
          </div>

          {sortedReviews.length > 0 && (
            <div className="mt-8 text-center">
              <button className="rounded-lg border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/60">
                Load More Reviews
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section - only shown to users who haven't reviewed yet */}
      {!userHasReviewedState && (
        <section className="border-t border-border bg-muted/30 py-10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-xl font-semibold text-foreground">Worked with {manager.name}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Share your experience. Your perspective helps others make more informed career decisions.
            </p>
            <button
              onClick={() => {
                setReviewManagerCompany(manager.company);
                setReviewManagerTitle(manager.title);
                setReviewStep("details");
              }}
              disabled={isBanned}
              title={isBanned ? "Your account has been suspended" : ""}
              className={`mt-6 rounded-lg px-8 py-3 font-medium transition-all ${
                isBanned
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
              }`}
            >
              Write a Review
            </button>
          </div>
        </section>
      )}

      {/*
        AN ANONYMOUS REVIEW DRAFT, OFFERED RATHER THAN APPLIED.

        Fixed to the bottom of the viewport rather than placed in the page, because somebody
        arriving back from signing in may be anywhere on a long profile and this is the only thing
        standing between them and their own work.

        It says nothing about what is in the draft - not the ratings, not the dates, not the email
        on it - because the reason it is an offer at all is that this may not be the person who
        wrote it. Describing the contents would disclose them to exactly that visitor.
      */}
      {/* A rating draft expired. Names nothing from it: the reader may not be its author. */}
      {reviewDraftExpired && !reviewStep && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              A saved rating expired and could not be restored.
            </p>
            <button type="button" onClick={() => setReviewDraftExpired(false)}
              className="flex-shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {offeredReviewDraft && !reviewStep && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">You have an unfinished rating</span> from before you
              signed in.
            </p>
            <div className="flex flex-shrink-0 gap-2">
              <button type="button" onClick={acceptOfferedReviewDraft}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                Restore
              </button>
              <button type="button" onClick={declineOfferedReviewDraft}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Write Review - Full-Screen Stepped Form */}
      {reviewStep && (() => {
        const steps = ["details", "dates", "ratings"] as const;
        const stepIdx = steps.indexOf(reviewStep) + 1;
        const stepTitles = { details: "Manager information", dates: "Work timeline", ratings: "Rate your experience" };
        const isLastStep = reviewStep === "ratings";
        const submitDisabled = !reviewAllRated || !reviewAttested || !reviewIsDateValid || isDuplicateTitle || isManagerRoleOverlap || isSubmittingReview || !!reviewTitleError || !!reviewDateError || !!reviewSubmitError || !!pendingAutoSubmit;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={() => {
                  if (reviewStep === "details") { reviewDraft.clear(); setReviewStep(null); setModalRatings(initializeRatings()); }
                  else if (reviewStep === "dates") setReviewStep("details");
                  else if (reviewStep === "ratings") { setReviewStep("dates"); setConflictAfterAuth(false); setShowCancelConfirm(false); }
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                {reviewStep !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
                {reviewStep === "details" ? "Cancel" : "Back"}
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{stepTitles[reviewStep]}</p>
                <p className="text-xs text-muted-foreground">Step {stepIdx} of 3 · {manager.name}</p>
              </div>
              <button
                onClick={() => { reviewDraft.clear(); setReviewStep(null); setModalRatings(initializeRatings()); setPendingAutoSubmit(null); setConflictAfterAuth(false); setShowCancelConfirm(false); setIsReplacingReview(false); }}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted/60">
              <div
                className="h-1 bg-[#2e0562] transition-all duration-300"
                style={{ width: `${Math.round(stepIdx * 100 / 3)}%` }}
              />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

                {/* Draft restored banner */}
                {showDraftBanner && reviewStep === "details" && (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-[#2e0562]/30 bg-[#2e0562]/5 px-4 py-3 mb-6">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Draft Restored.</span> Pick up where you left off.
                    </p>
                    <button type="button" onClick={clearReviewDraft}
                      className="flex-shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors">
                      Start fresh
                    </button>
                  </div>
                )}

                {/* Step 3: the ratings, plus how the review is signed */}
                {reviewStep === "ratings" && (
                  <div className="space-y-6">
                    {/*
                      The ratings, last - the same place the add-manager form asks for them, after
                      who the review is about and when it happened. Asking for ten stars before
                      either of those was the same contribution wearing a different shape depending
                      on which page somebody started from.
                    */}
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">
                        Rate {manager.name?.split(" ")[0] || "this manager"}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Rate them on each dimension. All 10 categories are required.
                      </p>
                    </div>

                    {/*
                      Who it is posted as, then the ground rules, then the ratings, then the
                      attestation - the add-manager form's last step, in its order. Two forms
                      asking the same thing should not put the same blocks in different places.
                    */}
                    <div className="rounded-xl border border-border p-5 space-y-3">
                      <p className="text-sm font-semibold text-foreground">🔒 Posting Anonymously</p>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Your review will appear as:</p>
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-foreground">{generatedName}</p>
                          <button type="button"
                            onClick={(e) => { e.preventDefault(); setGeneratedName(generateUsername()); }}
                            className="text-xs text-primary hover:underline">
                            Regenerate
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">This name is randomly generated and cannot be linked back to you.</p>
                    </div>

                    {/* About your review - the add-manager form's panel, markup for markup. */}
                    <div className="rounded-xl border border-border p-5 space-y-2">
                      <p className="text-sm font-semibold text-foreground">About your review</p>
                      <p className="text-xs text-muted-foreground">Your rating reflects your personal experience. All feedback is structured and opinion-based.</p>
                      <ul className="mt-2 space-y-1">
                        {[
                          "One review per role / time period",
                          "Duplicate or overlapping reviews are automatically blocked",
                          "No written reviews, only structured ratings",
                        ].map(item => (
                          <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/60 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>


                    <div className="space-y-6">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="border-b border-border pb-6 last:border-b-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <label className="block text-sm font-semibold text-foreground">{category} <RequiredMark /></label>
                            <StarRating
                              value={modalRatings[category] || 0}
                              onChange={(value) => setModalRatings((prev) => ({ ...prev, [category]: value }))}
                              required={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {showReadyBanner && reviewAllRated && reviewIsDateValid && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                        <Check size={16} className="flex-shrink-0" />
                        You're signed in. Your review is ready to submit.
                      </div>
                    )}
                    {/* The same attestation every rating form asks, in this one's own words. */}
                    <AttestationCard checked={reviewAttested} onChange={setReviewAttested}>
                      I confirm that I have personally worked with or for this manager, and these
                      ratings reflect my own experience and perceptions.
                    </AttestationCard>
                  </div>
                )}

                {/* Step 2: when you worked with them */}
                {reviewStep === "dates" && (
                  <div className="space-y-8">
                    {/* The same control the add form uses, so the same mistake reads the same way
                        on either page rather than in two hand-written wordings. */}
                    <WorkTimelineFields
                      heading="Work timeline"
                      subheading="Help us understand when this working relationship occurred."
                      from={reviewWorkedFrom}
                      until={reviewWorkedUntil}
                      current={reviewCurrentlyWorking}
                      onFromChange={setReviewWorkedFrom}
                      onUntilChange={setReviewWorkedUntil}
                      onCurrentChange={setReviewCurrentlyWorking}
                      disableCurrentReason={isManagerRoleOverlap ? "overlap" : null}
                      problem={
                        isManagerRoleOverlap ? (
                          <p className="text-xs text-red-600">You already have a review that overlaps this period. Each review must cover a distinct time range.</p>
                        ) : reviewDateError ? (
                          <p className="text-xs text-red-600">{reviewDateError}</p>
                        ) : undefined
                      }
                    />
                    {/*
                      Asked where the dates are given. On a small team the period identifies the
                      author to the manager, and only the author can judge whether that is safe.
                    */}
                    <HideDatesField hidden={reviewDatesHidden} onChange={setReviewDatesHidden} />

                {/* Cross-user company conflict soft warning */}
                    {crossUserCompanyConflict && !crossUserWarningDismissed && (
                      <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Possible company mismatch</p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">Other reviews place this manager at a different company during this period. You may still be right. Dual roles, contracting, and transitions happen. Do you want to continue?</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setCrossUserWarningDismissed(true)} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Yes, continue</button>
                          <button type="button" onClick={() => { setReviewWorkedFrom({ month: "", year: "" }); setReviewWorkedUntil({ month: "", year: "" }); setReviewCurrentlyWorking(false); }} className="rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">Go back</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: who the review is about - the add form's first step, pre-filled */}
                {reviewStep === "details" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Write a Review</h2>
                    </div>

                    {/* Role selector - lets reviewer pick which role they're reviewing */}
                    {manager.careerHistory && manager.careerHistory.length > 1 && (
                      <div>
                        {/* htmlFor/id: the label named nothing, so a screen reader announced a bare
                            combobox and clicking the label focused nothing. */}
                        <label
                          htmlFor="review-career-role"
                          className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
                        >
                          Which role are you reviewing?
                        </label>
                        <select
                          id="review-career-role"
                          value={selectedCareerRoleIdx}
                          onChange={(e) => {
                            const idx = Number(e.target.value);
                            setSelectedCareerRoleIdx(idx);
                            const ch = (manager.careerHistory as any[])[idx];
                            if (!ch) return;
                            setReviewManagerTitle(ch.title ?? "");
                            setReviewManagerCompany(ch.company ?? "");
                            setReviewOpenField(null);
                            if (ch.startDate) {
                              const [y, m] = ch.startDate.split("-");
                              setReviewWorkedFrom({ year: y ?? "", month: m ?? "" });
                            } else {
                              setReviewWorkedFrom({ month: "", year: "" });
                            }
                            if (ch.endDate) {
                              const [y, m] = ch.endDate.split("-");
                              setReviewWorkedUntil({ year: y ?? "", month: m ?? "" });
                              setReviewCurrentlyWorking(false);
                            } else {
                              setReviewWorkedUntil({ month: "", year: "" });
                              setReviewCurrentlyWorking(true);
                            }
                          }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                        >
                          {(manager.careerHistory as any[]).map((ch: any, idx: number) => {
                            const startYear = ch.startDate ? ch.startDate.slice(0, 4) : null;
                            const endYear = ch.endDate ? ch.endDate.slice(0, 4) : null;
                            const dateStr = startYear
                              ? endYear ? `${startYear}–${endYear}` : `Since ${startYear}`
                              : "";
                            return (
                              <option key={ch.id ?? idx} value={idx}>
                                {ch.title} at {ch.company}{dateStr ? ` · ${dateStr}` : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    {/*
                      The shared block, exactly as the add form renders it. The name is locked
                      here: a reviewer is rating a specific person who already exists, and changing
                      who that is from inside a review is a different review, not an edit.

                      Company and title are editable and they change THIS REVIEW ONLY -
                      reviews.manager_company and manager_title snapshot per review, so one
                      reviewer can never rewrite the profile everybody else sees.
                    */}
                    <ManagerIdentityFields
                      value={{
                        firstName: manager.name,
                        lastName:  "",
                        title:     reviewManagerTitle || manager.title,
                        company:   reviewManagerCompany || manager.company,
                        status:    reviewManagerStatus,
                        location:  reviewLocation,
                      }}
                      onChange={next => {
                        if (next.title !== undefined) { setReviewManagerTitle(next.title); setReviewTitleError(null); setConflictAfterAuth(false); }
                        if (next.company !== undefined) { setReviewManagerCompany(next.company); setReviewTitleError(null); setConflictAfterAuth(false); }
                        /*
                          Answering the question clears the complaint about not answering it.

                          Every other field on this step cleared its own error on change; the
                          location did not, so "Where did this manager work? Add a location."
                          stayed on screen after a location had been chosen - and the only way to
                          get rid of it was to press Next and have it re-evaluated.
                        */
                        if (next.location !== undefined) {
                          setReviewLocation(next.location);
                          setReviewLocationError(null);
                        }
                        if (next.status !== undefined) setReviewManagerStatus(next.status);
                      }}
                      locationError={reviewLocationError ?? undefined}
                      lockName
                      open={reviewOpenField}
                      onOpen={setReviewOpenField}
                      onClose={() => setReviewOpenField(null)}
                      companyId={manager.companyId ?? undefined}
                      companyName={reviewManagerCompany || manager.company}
                      companyLogoUrl={manager.companyLogoUrl ?? undefined}
                      idPrefix="review"
                      titleError={(isDuplicateTitle || reviewTitleError) ? (
                        <p className="mt-1.5 text-xs text-red-600">
                          {reviewTitleError || "You've already reviewed this role at this company."}
                        </p>
                      ) : undefined}
                    />

                    <div ref={reviewSubmitAreaRef} />
                  </div>
                )}

              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-4 sm:px-6 bg-background">
              <div className="mx-auto max-w-2xl space-y-3">
                {isLastStep && conflictAfterAuth ? (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-4 space-y-1">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">You've already reviewed this manager</p>
                      <p className="text-sm text-amber-800 dark:text-amber-300">To keep reviews fair, you can only submit one review per role at a company. You can update your existing review instead.</p>
                    </div>
                    {showCancelConfirm ? (
                      <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">Are you sure you want to discard this review?</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { reviewDraft.clear(); setReviewSubmitError(null); setReviewStep(null); setConflictAfterAuth(false); setShowCancelConfirm(false); }}
                            className="flex-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-all"
                          >
                            Yes, discard it
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/10 transition-all"
                          >
                            Keep it
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {reviewSubmitError && (
                          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                            <p className="text-sm text-red-700">{reviewSubmitError}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const conflicting = findConflictingReview();
                            if (!conflicting) return;
                            reviewDraft.clear();
                            setReviewSubmitError(null);
                            setReviewStep(null);
                            setConflictAfterAuth(false);
                            // Open the edit form for the conflicting review directly on this page
                            setEditingReviewId(conflicting.id);
                            setEditWorkedFrom(conflicting.workedFrom
                              ? { month: conflicting.workedFrom.slice(5, 7), year: conflicting.workedFrom.slice(0, 4) }
                              : { month: "", year: "" });
                            setEditWorkedUntil(conflicting.workedUntil
                              ? { month: conflicting.workedUntil.slice(5, 7), year: conflicting.workedUntil.slice(0, 4) }
                              : { month: "", year: "" });
                            setEditCurrentlyWorking(!!conflicting.workedFrom && !conflicting.workedUntil);
                            setEditManagerCompany(conflicting.managerCompany || manager?.company || "");
                            setEditManagerTitle(conflicting.managerTitle || manager?.title || "");
                            /*
                              Seeded here too, not only on the dropdown path. Reaching the edit
                              form through "Edit my existing review" after a duplicate-role clash
                              left the toggle at its default, so an author who had hidden their
                              dates was shown an unticked box and would have republished them by
                              saving.
                            */
                            setEditDatesHidden(!!conflicting.datesHidden);
                            setEditReviewData(fromApiRatings(conflicting.ratings));
                            const existingAuthor = conflicting.author ?? "";
                            if (existingAuthor === user?.username) {
                              setEditAuthorType("username");
                            } else if (user?.firstName && existingAuthor === `${user.firstName} ${user.lastName}`) {
                              setEditAuthorType("real_name");
                            } else {
                              setEditAuthorType("anonymous");
                              setEditGeneratedName(existingAuthor || generateUsername());
                            }
                            setEditingEditRoleInline(false);
                            setEditReviewStep("details");
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90"
                        >
                          Edit my existing review
                        </button>
                        <button
                          type="button"
                          onClick={handleReplaceReview}
                          disabled={isReplacingReview}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isReplacingReview ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Replacing…
                            </>
                          ) : "Replace my existing review with this one"}
                        </button>
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setShowCancelConfirm(true)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {isLastStep && reviewSubmitError && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                        <p className="text-sm text-red-700">{reviewSubmitError}</p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (reviewStep === "details") {
                          /*
                            The location is asked for on this step and is required. It is separate
                            state, so no draft validator sees it - the field carried a required
                            asterisk with nothing enforcing it, hidden by the IP prefill that used
                            to fill it in. Same rule as the workplace rating.
                          */
                          if (!hasDeclaredLocation(reviewLocation)) {
                            /*
                              The subject is the MANAGER, not the contributor. "Where did you
                              work?" asked about the reader on a form whose every other question
                              is about the person being rated, which reads as a question about
                              their own job history.
                            */
                            setReviewLocationError("Where did this manager work? Add a location.");
                            setReviewOpenField("location");
                            return;
                          }
                          setReviewLocationError(null);
                          setReviewStep("dates");
                        }
                        else if (reviewStep === "dates") setReviewStep("ratings");
                        else if (reviewStep === "ratings") handleSubmitReview();
                      }}
                      /*
                        GREYED OUT FOR A MISSING LOCATION, BUT STILL CLICKABLE.

                        A real `disabled` button fires no click, so it can never say why it will
                        not go. Left fully enabled it looked ready on a form that would refuse.

                        So this is the middle: `aria-disabled` plus the disabled styling, which
                        tells a reader and a screen reader that it is not ready, while the click
                        still reaches the handler - and the handler is what says "Where did you
                        work? Add a location" and opens the field.

                        The other blocks stay hard-disabled below: a duplicate title and an invalid
                        date already show their own message beside the field, so there is nothing
                        for a click to add.
                      */
                      aria-disabled={
                        reviewStep === "details" && !hasDeclaredLocation(reviewLocation)
                          ? true
                          : undefined
                      }
                      disabled={
                        /*
                          Each step is gated on what that step asked for, and nothing else.

                          The details step used to require every star to be filled, because the
                          stars were on it. They are on the last step now, and demanding them here
                          would refuse to advance over a question the reader has not been shown -
                          the thing that makes a long form get abandoned.
                        */
                        (reviewStep === "details" && (isDuplicateTitle || !!reviewTitleError)) ||
                        (reviewStep === "dates" && (!reviewIsDateValid || !!reviewDateError)) ||
                        (isLastStep && submitDisabled)
                      }
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-[#2e0562] ${isLastStep && showReadyBanner ? "ring-2 ring-[#2e0562] ring-offset-2" : ""}`}
                    >
                      {isLastStep && isSubmittingReview && (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {isLastStep ? (isSubmittingReview ? "Submitting…" : "Submit Review") : "Next"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Manager Details - Full-Screen Form */}
      {editManagerStep && (() => {
        const editStartVal = toYMVal(editStartDate.month, editStartDate.year);
        const editEndVal   = toYMVal(editEndDate.month,   editEndDate.year);
        const editDatesValid =
          (!editStartVal || editStartVal <= nowVal) &&
          (editEndCurrent || !editEndVal || (editEndVal <= nowVal && (!editStartVal || editEndVal >= editStartVal)));
        const canSave = editFormData.title.trim().length > 0 && editFormData.company.trim().length > 0 && editDatesValid;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                Cancel
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Edit Manager Details</p>
                <p className="text-xs text-muted-foreground">Step 1 of 1 · {manager.name}</p>
              </div>
              <button
                onClick={handleCancelEdit}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-[#2e0562]" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[22px] font-semibold text-foreground">Manager's current position</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {manager.approvalStatus === "pending_approval"
                        ? "Update your submission. Changes are applied directly since this profile hasn't been approved yet."
                        : `Update ${manager.name}'s current position. A record of previous positions will be automatically tracked.`}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Title *</label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => { setEditModalTouched(true); setEditFormData((prev) => ({ ...prev, title: e.target.value })); }}
                      placeholder="e.g., CEO, Engineering Manager"
                      maxLength={100}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Company *</label>
                    <CompanyAutocomplete
                      initialDomain={(manager as any)?.companyDomain}
                      initialBrandfetchIconUrl={(manager as any)?.companyBrandfetchIconUrl}
                      value={editFormData.company}
                      onChange={(val) => { setEditModalTouched(true); setEditFormData((prev) => ({ ...prev, company: val })); setEditCompanyLogoUrl(undefined); editCompany.bind.onChange(val); }}
                      onSuggestionSelect={(_name, logoUrl) => setEditCompanyLogoUrl(logoUrl)}
                      onCompanyIdChange={editCompany.bind.onCompanyIdChange}
                      placeholder="e.g., Microsoft, Apple"
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Location</label>
                    {/*
                      The same control every other form uses, not a country dropdown.

                      This asked only for a country, from a <select>, while the add form, the
                      review form and the interview form all ask the same question through
                      LocationField - so the answer somebody could give depended on which page
                      they happened to be on, and a manager edited here could never be given a
                      city, let alone an address.

                      It also defaulted to whatever the list happened to show, which is how a
                      Canadian company ended up recorded in the United Kingdom.
                    */}
                    <LocationField
                      value={editManagerLocation}
                      onChange={(next) => { setEditModalTouched(true); setEditManagerLocation(next); }}
                      companyId={editCompany.id}
                      companyName={editFormData.company}
                      editing={editManagerLocationOpen}
                      onEditStart={() => setEditManagerLocationOpen(true)}
                      onEditDone={() => setEditManagerLocationOpen(false)}
                      id="edit-manager-location"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-3">Manager Status *</label>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${editFormData.status === "active" ? "border-[#2e0562] bg-[#2e0562]/5" : "border-border hover:bg-accent/5"}`}>
                        <input type="radio" name="editStatus" value="active" checked={editFormData.status === "active"}
                          onChange={() => { setEditModalTouched(true); setEditFormData(prev => ({ ...prev, status: "active" })); setEditEndDate({ month: "", year: "" }); setEditEndCurrent(true); }}
                          className="w-4 h-4" />
                        <div>
                          <p className="font-medium text-foreground">Currently Active</p>
                          <p className="text-xs text-muted-foreground">Manager is actively leading</p>
                        </div>
                      </label>
                      <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${editFormData.status === "retired" ? "border-[#2e0562] bg-[#2e0562]/5" : "border-border hover:bg-accent/5"}`}>
                        <input type="radio" name="editStatus" value="retired" checked={editFormData.status === "retired"}
                          onChange={() => { setEditModalTouched(true); setEditFormData(prev => ({ ...prev, status: "retired" })); setEditEndCurrent(false); }}
                          className="w-4 h-4" />
                        <div>
                          <p className="font-medium text-foreground">Retired / No longer in this role</p>
                          <p className="text-xs text-muted-foreground">Manager has stepped down or left</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-3">
                      Role dates <span className="font-normal text-muted-foreground text-xs">(optional)</span>
                    </label>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1.5">When did they start in this role?</p>
                        <DateSelects
                          label="Start"
                          value={editStartDate}
                          onChange={v => { setEditModalTouched(true); setEditStartDate(v); }}
                        />
                      </div>
                      {editFormData.status === "retired" && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1.5">When did they leave?</p>
                          <DateSelects
                            label="End"
                            value={editEndDate}
                            onChange={v => { setEditModalTouched(true); setEditEndDate(v); }}
                          />
                        </div>
                      )}
                    </div>
                    {editStartVal && editStartVal > nowVal && (
                      <p className="mt-2 text-xs text-red-500">Start date cannot be in the future</p>
                    )}
                    {!editEndCurrent && editEndVal && editEndVal > nowVal && (
                      <p className="mt-2 text-xs text-red-500">End date cannot be in the future</p>
                    )}
                    {!editEndCurrent && editStartVal && editEndVal && editEndVal < editStartVal && (
                      <p className="mt-2 text-xs text-red-500">End date must be after start date</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-4 sm:px-6 bg-background">
              <div className="mx-auto max-w-2xl">
                <button
                  onClick={handleEditManager}
                  disabled={!canSave}
                  className="w-full rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Review - Full-Screen Stepped Form */}
      {editReviewStep && user && (() => {
        const steps = ["details", "dates", "ratings"] as const;
        const stepIdx = steps.indexOf(editReviewStep) + 1;
        const stepTitles = { details: "Manager information", dates: "Work timeline", ratings: "Update your ratings" };
        const isLastStep = editReviewStep === "ratings";
        const submitDisabled = !editReviewAllRated || !editReviewIsDateValid || isEditDuplicateTitle || isEditManagerRoleOverlap;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={() => {
                  if (editReviewStep === "details") { clearFormDraft(editDraftKey); setEditReviewStep(null); setEditingReviewId(null); }
                  else if (editReviewStep === "dates") setEditReviewStep("details");
                  else if (editReviewStep === "ratings") setEditReviewStep("dates");
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                {editReviewStep !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
                {editReviewStep === "details" ? "Cancel" : "Back"}
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{stepTitles[editReviewStep]}</p>
                <p className="text-xs text-muted-foreground">Step {stepIdx} of 3 · {manager.name}</p>
              </div>
              <button
                onClick={() => { clearFormDraft(editDraftKey); setEditReviewStep(null); setEditingReviewId(null); }}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted/60">
              <div className="h-1 bg-[#2e0562] transition-all duration-300" style={{ width: `${stepIdx * 25}%` }} />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

                {/* Step 1: Identity */}
                {/* Step 1: Ratings */}
                {editReviewStep === "details" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Update Your Review</h2>
                    </div>

                    {/*
                      The same block the write flow renders, and the same one the add form renders.
                      Editing opens with the original review's values already in it - including the
                      location it was filed under, which must not be re-derived from wherever the
                      manager works now.
                    */}
                    <ManagerIdentityFields
                      value={{
                        firstName: manager.name,
                        lastName:  "",
                        title:     editManagerTitle || manager.title,
                        company:   editManagerCompany || manager.company,
                        status:    editManagerStatus,
                        location:  editLocation,
                      }}
                      onChange={next => {
                        if (next.title !== undefined) { setEditManagerTitle(next.title); setEditReviewTitleError(null); }
                        if (next.company !== undefined) { setEditManagerCompany(next.company); setEditReviewTitleError(null); editCompany.bind.onChange(next.company); }
                        if (next.location !== undefined) setEditLocation(next.location);
                        if (next.status !== undefined) setEditManagerStatus(next.status);
                      }}
                      lockName
                      open={editOpenField}
                      onOpen={setEditOpenField}
                      onClose={() => setEditOpenField(null)}
                      companyId={manager.companyId ?? undefined}
                      companyName={editManagerCompany || manager.company}
                      companyLogoUrl={manager.companyLogoUrl ?? undefined}
                      onCompanyIdChange={editCompany.bind.onCompanyIdChange}
                      onCompanySuggestionSelect={editCompany.bind.onSuggestionSelect}
                      idPrefix="edit-review"
                      titleError={(isEditDuplicateTitle || editReviewTitleError) ? (
                        <p className="mt-1.5 text-xs text-red-600">
                          {editReviewTitleError || "You've already reviewed this role at this company."}
                        </p>
                      ) : undefined}
                    />

                  </div>
                )}

                {/* Step 2: Dates */}
                {editReviewStep === "dates" && (
                  <div className="space-y-8">
                    <WorkTimelineFields
                      heading="Work timeline"
                      subheading="Help us understand when this working relationship occurred."
                      from={editWorkedFrom}
                      until={editWorkedUntil}
                      current={editCurrentlyWorking}
                      onFromChange={setEditWorkedFrom}
                      onUntilChange={setEditWorkedUntil}
                      onCurrentChange={setEditCurrentlyWorking}
                      disableCurrentReason={isEditManagerRoleOverlap ? "overlap" : null}
                      problem={
                        isEditManagerRoleOverlap ? (
                          <p className="text-xs text-red-600">You already have a review that overlaps this period. Each review must cover a distinct time range.</p>
                        ) : editReviewDateError ? (
                          <p className="text-xs text-red-600">{editReviewDateError}</p>
                        ) : undefined
                      }
                    />
                    <HideDatesField hidden={editDatesHidden} onChange={setEditDatesHidden} />

                    {/* Cross-user company conflict soft warning */}
                    {editCrossUserCompanyConflict && !editCrossUserWarningDismissed && (
                      <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Possible company mismatch</p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">Other reviews place this manager at a different company during this period. You may still be right. Dual roles, contracting, and transitions happen. Do you want to continue?</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditCrossUserWarningDismissed(true)} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Yes, continue</button>
                          <button type="button" onClick={() => { setEditWorkedFrom({ month: "", year: "" }); setEditWorkedUntil({ month: "", year: "" }); setEditCurrentlyWorking(false); }} className="rounded-md border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">Go back</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Identity */}
                {editReviewStep === "ratings" && (
                  <div className="space-y-6">
                    {/* The ratings last, behind who and when - the order every form uses. */}
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Update your ratings</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Rate them on each dimension. All 10 categories are required.
                      </p>
                    </div>
                    {/*
                      The add-manager form's identity card, markup for markup - a heading plus a
                      differently-shaped panel made the same information read as a different
                      question depending on which form you were on.

                      No Regenerate here, and that is the only difference: an edit keeps the name
                      the review already carries, because changing it would make one person look
                      like two to anybody who had already read it.
                    */}
                    <div className="rounded-xl border border-border p-5 space-y-3">
                      <p className="text-sm font-semibold text-foreground">🔒 Posting Anonymously</p>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Your review will appear as:</p>
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-foreground">
                            {editAuthorType === "username" ? `@${user.username}` : editAuthorType === "real_name" ? `${user.firstName} ${user.lastName}` : editGeneratedName}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">This opinion keeps the name you originally posted it under.</p>
                    </div>

                    {/* About your review - the add-manager form's panel, markup for markup. */}
                    <div className="rounded-xl border border-border p-5 space-y-2">
                      <p className="text-sm font-semibold text-foreground">About your review</p>
                      <p className="text-xs text-muted-foreground">Your rating reflects your personal experience. All feedback is structured and opinion-based.</p>
                      <ul className="mt-2 space-y-1">
                        {[
                          "One review per role / time period",
                          "Duplicate or overlapping reviews are automatically blocked",
                          "No written reviews, only structured ratings",
                        ].map(item => (
                          <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/60 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-6">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="border-b border-border pb-6 last:border-b-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <label className="block text-sm font-semibold text-foreground">{category} <RequiredMark /></label>
                            <StarRating
                              value={editReviewData[category] || 0}
                              onChange={(value) => setEditReviewData((prev) => ({ ...prev, [category]: value }))}
                              required={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-4 sm:px-6 bg-background">
              <div className="mx-auto max-w-2xl space-y-3">
                {isLastStep && editReviewSubmitError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-sm text-red-700">{editReviewSubmitError}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (editReviewStep === "details") setEditReviewStep("dates");
                      else if (editReviewStep === "dates") setEditReviewStep("ratings");
                      else if (editReviewStep === "ratings") handleEditReview();
                    }}
                    disabled={
                      // Only what this step asked about - the ratings are two steps further on.
                      (editReviewStep === "details" && isEditDuplicateTitle) ||
                      (editReviewStep === "dates" && !editReviewIsDateValid) ||
                      (isLastStep && submitDisabled)
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLastStep ? "Save Changes" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Report Profile - Full-Screen Form */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <button
              onClick={() => { setIsReportModalOpen(false); setReportReason(""); setReportComment(""); }}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
            >
              Cancel
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Report Profile</p>
              <p className="text-xs text-muted-foreground">{manager.name}</p>
            </div>
            <button
              onClick={() => { setIsReportModalOpen(false); setReportReason(""); setReportComment(""); }}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted/60">
            <div className="h-1 bg-red-500 transition-all duration-300" style={{ width: reportReason ? "100%" : "0%" }} />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-6">
              <div>
                <h2 className="text-[22px] font-semibold text-foreground">What's the issue with this profile?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Help us keep the directory accurate. Select a reason for reporting.</p>
              </div>
              <div className="space-y-2">
                {[
                  { value: "incorrect_person", label: "This is not the correct person" },
                  { value: "never_worked_here", label: "This person never worked at this company" },
                  { value: "duplicate_profile", label: "Duplicate profile" },
                  { value: "incorrect_information", label: "Incorrect information" },
                  { value: "other", label: "Other" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${reportReason === option.value ? "border-red-500 bg-red-500/5" : "border-border hover:bg-accent/5"}`}
                  >
                    <input type="radio" name="reportReason" value={option.value}
                      checked={reportReason === option.value}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-4 h-4 accent-red-500" />
                    <span className="text-sm text-foreground">{option.label}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Additional comments <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  placeholder="Provide any additional details..."
                  maxLength={500}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-4 sm:px-6 bg-background">
            <div className="mx-auto max-w-2xl">
              <button
                onClick={() => handleSubmitReport()}
                disabled={!reportReason || isSubmittingReport}
                className="w-full rounded-lg bg-red-600 px-4 py-3 font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingReport ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>

    {authFlowStep && (
      <AuthFlowModal
        initialStep={authFlowStep}
        initialEmail={authFlowEmail}
        initialEmailMode={fromVerified}
        autoSubmit={!fromVerified}
        onAuthenticated={(authedUser) => {
          setAuthFlowStep(null);
          setPendingVerificationEmail("");
          setPendingEmailVerified(false);
          const action = pendingAction.current;
          pendingAction.current = null;
          /*
            Only the two in-page resumptions are handled here.

            "rate" and "career-unlock" were handled here too, and neither was reachable - nothing
            ever set them. Both of those gates sign in through a full-page OAuth redirect, which
            destroys this component and its ref along with it, so they are restored from
            sessionStorage by the effects near the top of the file instead.
          */
          if (action === "edit-submit") {
            handleEditManager();
          } else if (action === "report-submit") {
            handleSubmitReport(authedUser);
          } else if (fromVerified) {
            setFromVerified(false);
            setShowReadyBanner(true);
            setTimeout(() => setShowReadyBanner(false), 3000);
            setTimeout(() => reviewSubmitAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
          } else {
            setPendingAutoSubmit(authedUser);
          }
        }}
        onVerifyEmailReached={(email) => setPendingVerificationEmail(email)}
        onClose={() => { setAuthFlowStep(null); setFromVerified(false); }}
      />
    )}
    </>
  );
}