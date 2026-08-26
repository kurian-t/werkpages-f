import API_BASE from "@/lib/api";
import { companyLogoDomain, toNameCase, toJobTitleCase } from "@/lib/utils";
import { Helmet } from "react-helmet-async";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Star, Edit2, X, Trash2, Flag, Check, ChevronDown, ArrowLeft } from "lucide-react";
import { ManagerAvatar, CompanyRow, getInitials, getAvatarColor } from "@/components/ManagerCard";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics } from "@/hooks/useAnalytics";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import type { User } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { formatDistanceToNow } from 'date-fns';
import { StarRating } from "@/components/StarRating";
import { generateUsername } from "@/lib/validators";
import { CareerTimeline } from "@/components/CareerTimeline";
import { COUNTRIES, getCountryFlag } from "@/lib/countries";
  
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
// Always show all months — validation catches future dates
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

export default function BossProfile() {
  const { id, companySlug, managerSlug } = useParams<{
    id?: string;
    companySlug?: string;
    managerSlug?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, setUser } = useAuth();
  const { track } = useAnalytics();
  const isBanned = user?.isBanned === true;

  const queryClient = useQueryClient();

  // Fetch manager — cached so returning to this page shows data instantly.
  // Supports both legacy numeric-ID route (/manager/:id) and slug route (/companies/:c/managers/:m).
  const managerQueryKey = id
    ? ["manager", id]
    : ["manager-slug", companySlug, managerSlug];

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
      navigate(`/companies/${manager.companySlug}/managers/${manager.slug}`, { replace: true });
    }
  }, [id, manager?.slug, manager?.companySlug, navigate]);

  // If company changed and backend returned a canonical path, silently correct the URL.
  // Pre-populate the cache for the new key so the re-render doesn't trigger a second fetch.
  useEffect(() => {
    if (!id && manager?.canonicalPath) {
      queryClient.setQueryData(["manager-slug", manager.companySlug, managerSlug], manager);
      navigate(manager.canonicalPath, { replace: true });
    }
  }, [manager?.canonicalPath, manager?.companySlug, managerSlug, navigate, queryClient, id]);

  // Fetch reviews — cached so revisiting shows reviews instantly
  const { data: reviewsData } = useQuery({
    queryKey: ["manager-reviews", manager?.id],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/managers/${manager!.id}/reviews`);
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: !!manager?.id,
  });

  const contextReviews: any[] = reviewsData ?? [];

  // Fetch pre-aggregated career segments — all reviews grouped server-side, never paginated
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
        logoUrl:          isCurrentCompany ? (manager.companyLogoUrl ?? undefined) : undefined,
        careerHistoryId:  ch.id ?? null,
      };
    };

    if (careerSegments.length === 0) {
      // No reviews at all — show ghost nodes from career history so the timeline isn't empty
      if (history.length > 0) return [...history].reverse().map(toGhost);
      return [toGhost({ company: manager.company, title: manager.title, startDate: null, endDate: null })];
    }

    // Reviews exist — include ghosts for any career_history entry (active or past) whose
    // company isn't already covered by a reviewed segment.
    const reviewedCompanies = new Set(
      careerSegments.map((s: any) => s.company.toLowerCase().trim())
    );
    const ghostEntries = history.filter(
      (ch: any) => !reviewedCompanies.has((ch.company ?? "").toLowerCase().trim())
    );
    if (ghostEntries.length > 0) {
      const ghosts = ghostEntries.map(toGhost);
      const enriched = careerSegments.map((s: any) => ({
        ...s,
        logoUrl: s.company?.toLowerCase().trim() === managerCompanyKey
          ? (manager.companyLogoUrl ?? undefined)
          : s.logoUrl,
      }));
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

    return careerSegments.map((s: any) => ({
      ...s,
      logoUrl: s.company?.toLowerCase().trim() === managerCompanyKey
        ? (manager.companyLogoUrl ?? undefined)
        : s.logoUrl,
    }));
  }, [careerSegments, manager]);

  // Contribution gate: hasContributed is loaded as part of the /api/auth/me session
  // response and stored in user state — no separate network request needed.
  const isLocked = !user?.hasContributed;

  // Fetch internal DB user UUID — cached so it's instant on revisit
  const { data: dbUserId } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/auth/me`);
      return res.data.id as string;
    },
    enabled: !!user,
  });

  // Fetch the calling user's own pending edit — only visible to them, not public
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

  const DRAFT_TTL = 12 * 60 * 60 * 1000; // 12 hours

  const clearReviewDraft = () => {
    localStorage.removeItem("rmm_pending_review");
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
  const [reviewStep, setReviewStep] = useState<null | "identity" | "dates" | "ratings">(null);
  const [editManagerStep, setEditManagerStep] = useState<null | "info">(null);
  const [editReviewStep, setEditReviewStep] = useState<null | "ratings" | "dates" | "identity">(null);
  const [editingEditRoleInline, setEditingEditRoleInline] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [pendingDeleteReviewId, setPendingDeleteReviewId] = useState<string | null>(null);
  const [showReviewDropdown, setShowReviewDropdown] = useState(false);
  const [editingRoleInline, setEditingRoleInline] = useState(false);
  const reviewDropdownRef = useRef<HTMLDivElement>(null);
  const [authorType] = useState<"anonymous">("anonymous");
  const [generatedName, setGeneratedName] = useState(() => generateUsername());
  const [modalRatings, setModalRatings] = useState<Record<string, number>>(initializeRatings());
  const [editFormData, setEditFormData] = useState({ company: "", title: "", status: "active", country: "", linkedinUrl: "" });
  const [editCompanyLogoUrl, setEditCompanyLogoUrl] = useState<string | undefined>(undefined);
  const [editReviewData, setEditReviewData] = useState<Record<string, number>>({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
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
  const pendingAction = useRef<"edit" | "report" | "edit-submit" | "report-submit" | "career-unlock" | "rate" | null>(null);
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
  const [reviewWorkedFrom, setReviewWorkedFrom] = useState({ month: "", year: "" });
  const [reviewWorkedUntil, setReviewWorkedUntil] = useState({ month: "", year: "" });
  const [reviewCurrentlyWorking, setReviewCurrentlyWorking] = useState(false);
  const [editWorkedFrom, setEditWorkedFrom] = useState({ month: "", year: "" });
  const [editWorkedUntil, setEditWorkedUntil] = useState({ month: "", year: "" });
  const [editCurrentlyWorking, setEditCurrentlyWorking] = useState(false);
  const [reviewManagerCompany, setReviewManagerCompany] = useState("");
  const [reviewManagerTitle, setReviewManagerTitle] = useState("");
  const [editManagerCompany, setEditManagerCompany] = useState("");
  const [editManagerTitle, setEditManagerTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState({ month: "", year: "" });
  const [editEndDate, setEditEndDate] = useState({ month: "", year: "" });
  const [editEndCurrent, setEditEndCurrent] = useState(true);
  const [selectedCareerRoleIdx, setSelectedCareerRoleIdx] = useState(0);
  const [editModalTouched, setEditModalTouched] = useState(false);
  const [editAuthorType, setEditAuthorType] = useState<"username" | "real_name" | "anonymous">("username");
  const [editGeneratedName, setEditGeneratedName] = useState(() => generateUsername());

  // Admin direct-edit state
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminEditForm, setAdminEditForm] = useState({ name: "", title: "", company: "", linkedinUrl: "" });
  const [adminEditLogoUrl, setAdminEditLogoUrl] = useState<string | undefined>(undefined);
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [adminDeleteConfirm, setAdminDeleteConfirm] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);

  // Admin career history edit state
  const [adminCareerEditEntry, setAdminCareerEditEntry] = useState<{
    entryId: number; company: string; role: string; startDate: string; endDate: string;
  } | null>(null);
  const [adminCareerEditSaving, setAdminCareerEditSaving] = useState(false);
  const [adminCareerDeleteId, setAdminCareerDeleteId] = useState<number | null>(null);
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
      setReviewTitleError(null);
      setReviewDateError(null);
      setEditingRoleInline(false);
      // Default to most recent career history entry
      setSelectedCareerRoleIdx(0);
      const ch0 = manager?.careerHistory?.[0];
      setReviewManagerTitle(ch0?.title ?? manager?.title ?? "");
      setReviewManagerCompany(ch0?.company ?? manager?.company ?? "");
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
        setReviewCurrentlyWorking(!ch0);
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
  // This avoids all async race conditions — the button stays disabled (!!pendingAutoSubmit)
  // until we're ready, and validation uses the already-correct reactive state.
  useEffect(() => {
    if (!pendingAutoSubmit || !userReviewsFetched) return;
    const submitUser = pendingAutoSubmit;
    setPendingAutoSubmit(null);
    if (!reviewStep) return; // form was closed before data loaded
    if (atReviewLimit) {
      setReviewSubmitError("You've reached the limit of 5 reviews for this manager.");
      setReviewStep("identity");
      return;
    }
    if (isDuplicateTitle) {
      setConflictAfterAuth(true);
      setReviewStep("identity");
      return;
    }
    if (isManagerRoleOverlap) {
      setConflictAfterAuth(true);
      setReviewStep("identity");
      return;
    }
    // All checks passed — submit. user is set in auth context, no overrideUser needed.
    handleSubmitReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSubmit, userReviewsFetched]);

  // Restore pending review data; open sign-in modal if returning after email verification
  useEffect(() => {
    const isVerified = searchParams.get("verified") === "true";
    try {
      const raw = localStorage.getItem("rmm_pending_review");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.managerId === (id || managerSlug)) {
          // Expire after 12 hours
          if (data.savedAt && Date.now() - data.savedAt > DRAFT_TTL) {
            localStorage.removeItem("rmm_pending_review");
          } else {
            localStorage.removeItem("rmm_pending_review");
            if (data.modalRatings)         setModalRatings(data.modalRatings);
            if (data.reviewAttested != null) setReviewAttested(data.reviewAttested);
            if (data.generatedName)        setGeneratedName(data.generatedName);
            if (data.reviewWorkedFrom)     setReviewWorkedFrom(data.reviewWorkedFrom);
            if (data.reviewWorkedUntil)    setReviewWorkedUntil(data.reviewWorkedUntil);
            if (data.reviewCurrentlyWorking != null) setReviewCurrentlyWorking(data.reviewCurrentlyWorking);
            if (data.reviewManagerCompany != null)   setReviewManagerCompany(data.reviewManagerCompany);
            if (data.reviewManagerTitle != null)     setReviewManagerTitle(data.reviewManagerTitle);
            if (data.draftToken)           reviewDraftTokenRef.current = data.draftToken;
            if (data.signupEmail) {
              setAuthFlowEmail(data.signupEmail);
              setPendingVerificationEmail(data.signupEmail);
              setPendingEmailVerified(isVerified || !!data.emailVerified);
            }
            skipResetRef.current = true;
            if (isVerified) {
              setReviewStep("ratings");
              setFromVerified(true);
              setAuthFlowStep("signin");
            } else if (data.signupEmail) {
              setReviewStep("ratings");
              if (data.emailVerified) setFromVerified(true);
              setAuthFlowStep(data.emailVerified ? "signin" : "verify_email");
            } else if (user) {
              // Returning from social OAuth — user is already authenticated, reopen form and validate
              setReviewStep("identity");
              setPendingAutoSubmit(user);
            }
            // Otherwise: data is silently restored so the form is pre-filled when the user manually opens it
          }
        }
      }
    } catch {
      localStorage.removeItem("rmm_pending_review");
    }
    if (isVerified) setSearchParams({}, { replace: true });
  }, [id, managerSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Continuously persist review data while review form is open so any navigation away preserves it
  useEffect(() => {
    if (!reviewStep) return;
    if (isSubmittingReview) return; // don't re-persist while submitting — submit clears the draft
    const hasData = Object.values(modalRatings).every(r => r > 0);
    if (!hasData) return;
    localStorage.setItem("rmm_pending_review", JSON.stringify({
      returnTo: id ? `/manager/${id}` : `/companies/${companySlug}/managers/${managerSlug}`,
      managerId: id || managerSlug,
      modalRatings, authorType, generatedName, reviewAttested,
      reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking,
      reviewManagerCompany, reviewManagerTitle,
      ...(pendingVerificationEmail ? { signupEmail: pendingVerificationEmail, emailVerified: pendingEmailVerified } : {}),
      ...(reviewDraftTokenRef.current ? { draftToken: reviewDraftTokenRef.current } : {}),
      savedAt: Date.now(),
    }));
  }, [reviewStep, isSubmittingReview, modalRatings, reviewAttested, reviewWorkedFrom, reviewWorkedUntil, reviewCurrentlyWorking, reviewManagerCompany, reviewManagerTitle, authorType, id, pendingVerificationEmail, pendingEmailVerified]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Sort reviews based on the selected option
  const sortedReviews = [...contextReviews].sort((a, b) => {
    switch (sortBy) {
      case "helpful":
        return b.helpfulCount - a.helpfulCount;
      case "highest":
        return b.overallRating - a.overallRating;
      case "lowest":
        return a.overallRating - b.overallRating;
      case "recent":
      default:
        return b.id - a.id;
    }
  });

  const handleSubmitReport = async (overrideUser?: User) => {
    if (!reportReason) return;

    if (!user && !overrideUser) {
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
        workedFrom: toYearMonth(reviewWorkedFrom.month, reviewWorkedFrom.year),
        workedUntil: reviewCurrentlyWorking ? null : toYearMonth(reviewWorkedUntil.month, reviewWorkedUntil.year),
        draftToken: dropOffToken,
      }).catch(() => {});
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

    const overallRating = parseFloat(
      (
        Object.values(modalRatings).reduce((a, b) => a + b, 0) /
        Object.values(modalRatings).length
      ).toFixed(1)
    );

    // 1. POST the new review
    try {
      await axios.post(
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
        } else if (lower.includes("title")) {
          setReviewTitleError(msg);
        } else {
          setReviewSubmitError(msg);
        }
      } else {
        setReviewSubmitError(msg || "Failed to submit review. Please try again.");
      }
      setIsSubmittingReview(false);
      return;
    }

    // 2. Refresh manager and reviews in cache
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager.id] });
    queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] });
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    if (user && !user.hasContributed) setUser({ ...user, hasContributed: true });
    queryClient.removeQueries({ queryKey: ["managers-top"] });
    queryClient.removeQueries({ queryKey: ["stats"] });

    // 3. Refresh the user's own reviews in cache so button/state updates
    if (dbUserId) {
      await queryClient.invalidateQueries({ queryKey: ["user-reviews", manager.id, dbUserId] });
    }

    reviewDraftTokenRef.current = null;
    localStorage.removeItem("rmm_pending_review");
    track("review_submitted");
    toast.success(`Your review of ${manager.name} is live!`, {
      description: "Others can now see your experience. Thank you for helping the community.",
    });

    setIsSubmittingReview(false);
    setReviewStep(null);
    setModalRatings(initializeRatings());
  };

  // Finds the user's existing review that conflicts with the current draft —
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
          authorType,
          author: generatedName,
        }
      );
      localStorage.removeItem("rmm_pending_review");
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
          company: editFormData.company,
          companyLogoUrl: editCompanyLogoUrl ?? null,
          title: toJobTitleCase(editFormData.title),
          status: editFormData.status,
          country: editFormData.country || null,
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
      const countryChanged  = (editFormData.country || null) !== (manager?.country || null);
      const linkedinChanged = (editFormData.linkedinUrl.trim() || null) !== (manager?.linkedinUrl || null);
      const startChanged    = newStartDate !== origStartDate;
      const endChanged      = newEndDate !== origEndDate;
      const anyChanged = statusChanged || companyChanged || titleChanged || countryChanged || linkedinChanged || startChanged || endChanged;

      if (!anyChanged) {
        setEditManagerStep(null);
        return;
      }

      // All changes go through edit-request flow for admin approval
      const payload: Record<string, string | null> = {};
      if (companyChanged)  payload.company     = editFormData.company;
      if (companyChanged && editCompanyLogoUrl) payload.companyLogoUrl = editCompanyLogoUrl;
      if (titleChanged)    payload.title       = toJobTitleCase(editFormData.title);
      if (statusChanged)   payload.status      = editFormData.status;
      if (countryChanged)  payload.country     = editFormData.country || null;
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
      await axios.put(
        `${API_BASE}/api/managers/${manager?.id}/reviews/${editingReviewId}`,
        {
          authorType: editAuthorType,
          author: editAuthorName,
          overallRating,
          ratings: editReviewData,
          managerCompany: editManagerCompany,
          managerTitle: editManagerTitle,
          workedFrom: toYearMonth(editWorkedFrom.month, editWorkedFrom.year),
          workedUntil: editCurrentlyWorking ? null : toYearMonth(editWorkedUntil.month, editWorkedUntil.year),
        },
      );
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? err?.response?.data?.error ?? "";
      if (err?.response?.status === 409) {
        if (msg === "already_reviewed_this_role") {
          setEditReviewTitleError("You already have a review for this role. Change the title to update a different role.");
        } else {
          setEditReviewSubmitError("Failed to update review. Please try again.");
        }
      } else if (err?.response?.status === 400 && msg) {
        const lower = msg.toLowerCase();
        if (lower.includes("date") || lower.includes("'from'") || lower.includes("'to'")) {
          setEditReviewDateError(msg);
        } else if (lower.includes("title")) {
          setEditReviewTitleError(msg);
        } else {
          setEditReviewSubmitError(msg);
        }
      } else {
        setEditReviewSubmitError(msg || "Failed to update review. Please try again.");
      }
      return;
    }

    // 2. Refresh manager and reviews in cache — await to ensure trajectory is up-to-date before closing
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["manager", id] }),
      queryClient.refetchQueries({ queryKey: ["manager-reviews", manager.id] }),
      queryClient.refetchQueries({ queryKey: ["manager-career-segments", manager.id] }),
      dbUserId ? queryClient.refetchQueries({ queryKey: ["user-reviews", manager.id, dbUserId] }) : Promise.resolve(),
    ]);
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    queryClient.removeQueries({ queryKey: ["managers-top"] });

    toast.success(`Your review of ${manager?.name} has been updated.`);

    setEditReviewStep(null);
  };

  const handleDeleteReview = async (reviewId?: string) => {
    const targetId = reviewId ?? editingReviewId;
    if (targetId === null) return;

    if (!user) {
      navigate("/signin");
      return;
    }

    // 1. DELETE the review
    try {
      await axios.delete(
        `${API_BASE}/api/managers/${manager?.id}/reviews/${targetId}`
      );
    } catch {
      toast.error("Failed to delete review. Please try again.");
      return;
    }

    // 2. Refresh manager and reviews in cache
    queryClient.invalidateQueries({ queryKey: managerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["manager-reviews", manager.id] });
    queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] });
    queryClient.removeQueries({ queryKey: ["managers-directory"] });
    queryClient.removeQueries({ queryKey: ["managers-top"] });
    queryClient.removeQueries({ queryKey: ["stats"] });

    toast.success("Review deleted", {
      description: "Your review has been removed.",
    });

    setPendingDeleteReviewId(null);
    setShowReviewDropdown(false);
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
  const pageDescription = manager
    ? `Read anonymous employee reviews of ${manager.name}, ${manager.title} at ${manager.company}. Share your experience or browse workplace leadership ratings.`
    : "";
  // Keep review-less (thin, near-duplicate) manager pages out of Google's index until they have
  // real content; "follow" so link equity still flows. Matches the sitemap's reviews_count > 0 rule.
  const managerReviewCount = contextReviews.length || Number((manager as any)?.reviewsCount ?? (manager as any)?.reviews ?? 0);
  const managerIsThin = !!manager && managerReviewCount === 0;

  return (
    <>
    {manager && (
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        {managerIsThin && <meta name="robots" content="noindex,follow" />}
        <link rel="canonical" href={canonicalUrl} />
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
              ...(manager.overallRating ? {
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": String(manager.overallRating),
                  "bestRating": "5",
                  "worstRating": "0",
                  "ratingCount": String(manager.reviewsCount || contextReviews.length || 1),
                },
              } : {}),
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
              <div className="mt-4 flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{manager.name}</h1>
                {user?.role === "admin" && !adminEditing && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="admin-edit-button"
                      onClick={() => {
                        setAdminEditForm({ name: manager.name, title: manager.title, company: manager.company, linkedinUrl: manager.linkedinUrl ?? "" });
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
              <div className="mt-2">
                <Link
                  to={manager.companySlug ? `/companies/${manager.companySlug}` : `/companies/${encodeURIComponent(manager.company)}`}
                  className="group/company inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                >
                  <CompanyRow company={manager.company} title={manager.title} logoUrl={manager.companyLogoUrl} logoSize="lg" wrapTitle companyClassName="text-foreground group-hover/company:text-primary transition-colors" />
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 text-muted-foreground opacity-0 group-hover/company:opacity-60 transition-opacity flex-shrink-0 self-start mt-1"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </Link>
              </div>

              {/* Country */}
              {manager.country && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {getCountryFlag(manager.country)} {manager.country}
                </p>
              )}

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
              {/* Compact rating strip */}
              <div className={`flex items-center gap-3 ${isLocked ? "select-none" : ""}`}>
                <span className={`text-2xl font-bold text-[#6d5091] tabular-nums leading-none whitespace-nowrap ${isLocked ? "blur-sm" : ""}`}>
                  {managerCategoryAverages.overallRating
                    ? Number(managerCategoryAverages.overallRating).toFixed(1)
                    : manager.overallRating
                      ? Number(manager.overallRating).toFixed(1)
                      : "—"}
                </span>
                <div>
                  <div
                    className="flex items-center gap-0.5"
                    role="img"
                    aria-label={`${Number(managerCategoryAverages.overallRating || manager.overallRating || 0).toFixed(1)} out of 5 stars`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={13}
                        aria-hidden="true"
                        className={
                          isLocked
                            ? "fill-amber-300/40 text-amber-300/40"
                            : i < Math.floor(managerCategoryAverages.overallRating || manager.overallRating || 0)
                              ? "fill-amber-400 text-amber-400"
                              : "text-border"
                        }
                      />
                    ))}
                  </div>
                  <p className={`mt-0.5 text-xs text-muted-foreground ${isLocked ? "blur-sm" : ""}`}>
                    {(contextReviews.length || manager.reviews || 0) > 0
                      ? `${(contextReviews.length || manager.reviews || 0).toLocaleString()} ${(contextReviews.length || manager.reviews || 0) === 1 ? 'review' : 'reviews'}${(contextReviews.length || manager.reviews || 0) < 3 ? ' (limited data, interpret cautiously)' : ''}`
                      : 'No reviews yet'}
                  </p>
                </div>
              </div>

              {/* Primary CTA — Write / Edit review */}
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
                          setReviewStep("ratings");
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
                    {/* Chevron — shown whenever user has reviews (to select which one to edit) */}
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
                          <p className="text-sm font-semibold text-foreground">Delete this review?</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            You won't be able to submit another review for this manager for <span className="font-medium text-foreground">30 days</span>.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleDeleteReview(pendingDeleteReviewId)}
                              className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                            >
                              Yes, delete
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
                            Your Reviews — select to edit
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
                                  setEditManagerCompany(review.managerCompany || manager.company);
                                  setEditManagerTitle(review.managerTitle || manager.title);
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
                                  setEditReviewStep("ratings");
                                }}
                                className="flex-1 text-left px-4 py-2.5"
                              >
                                <p className="text-sm font-medium text-foreground truncate">
                                  {review.managerTitle} at {review.managerCompany}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {review.workedFrom
                                    ? new Date(review.workedFrom + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                    : "No date"}
                                  {" – "}
                                  {review.workedUntil
                                    ? new Date(review.workedUntil + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                    : review.workedFrom ? "Present" : ""}
                                </p>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteReviewId(review.id); }}
                                className="px-3 py-2.5 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                title="Delete review"
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
                                setReviewStep("ratings");
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

              {/* Secondary actions — edit manager profile + report */}
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
                    aria-label={isBanned ? "Your account has been suspended" : hasReported ? "Profile flagged — under review" : "Report this profile"}
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
              <p className="text-sm font-semibold text-amber-800">Admin Edit — changes cascade to reviews and career history</p>
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
                  value={adminEditForm.company}
                  onChange={val => { setAdminEditForm(p => ({ ...p, company: val })); setAdminEditLogoUrl(undefined); }}
                  onSuggestionSelect={(_name, logoUrl) => setAdminEditLogoUrl(logoUrl)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
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
                      company:        adminEditForm.company.trim()    || undefined,
                      linkedinUrl:    adminEditForm.linkedinUrl.trim() || undefined,
                      companyLogoUrl: adminEditLogoUrl,
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
                <input
                  type="text"
                  value={adminCareerEditEntry.company}
                  onChange={e => setAdminCareerEditEntry(p => p ? { ...p, company: e.target.value } : p)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Role / Title</label>
                <input
                  type="text"
                  value={adminCareerEditEntry.role}
                  onChange={e => setAdminCareerEditEntry(p => p ? { ...p, role: e.target.value } : p)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Start year</label>
                  <input
                    type="number"
                    value={adminCareerEditEntry.startDate}
                    onChange={e => setAdminCareerEditEntry(p => p ? { ...p, startDate: e.target.value } : p)}
                    min={1900}
                    max={new Date().getFullYear()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">End year (blank = present)</label>
                  <input
                    type="number"
                    value={adminCareerEditEntry.endDate}
                    onChange={e => setAdminCareerEditEntry(p => p ? { ...p, endDate: e.target.value } : p)}
                    min={1900}
                    max={new Date().getFullYear()}
                    placeholder="Present"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
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
                    await axios.put(
                      `${API_BASE}/api/admin/managers/${manager.id}/career-history/${adminCareerEditEntry.entryId}`,
                      {
                        company:   adminCareerEditEntry.company.trim(),
                        title:     adminCareerEditEntry.role.trim(),
                        startDate: adminCareerEditEntry.startDate.trim(),
                        endDate:   adminCareerEditEntry.endDate.trim() || null,
                      },
                      { withCredentials: true }
                    );
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: managerQueryKey }),
                      queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] }),
                    ]);
                    setAdminCareerEditEntry(null);
                    toast.success("Career entry updated");
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
      {adminCareerDeleteId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-6 shadow-xl">
            <p className="text-sm font-semibold text-foreground mb-2">Delete career entry?</p>
            <p className="text-xs text-muted-foreground mb-5">This cannot be undone.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={adminCareerDeleting}
                onClick={async () => {
                  setAdminCareerDeleting(true);
                  try {
                    await axios.delete(
                      `${API_BASE}/api/admin/managers/${manager.id}/career-history/${adminCareerDeleteId}`,
                      { withCredentials: true }
                    );
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: managerQueryKey }),
                      queryClient.invalidateQueries({ queryKey: ["manager-career-segments", manager.id] }),
                    ]);
                    setAdminCareerDeleteId(null);
                    toast.success("Career entry deleted");
                  } catch {
                    toast.error("Failed to delete entry");
                  } finally {
                    setAdminCareerDeleting(false);
                  }
                }}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {adminCareerDeleting ? "Deleting…" : "Delete"}
              </button>
              <button type="button" onClick={() => setAdminCareerDeleteId(null)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* System notices — between hero and content */}
      {(manager.approvalStatus === "pending_approval" || pendingEdits.length > 0 || (hasReported && manager.approvalStatus !== "pending_approval")) && (
        <section className="bg-background py-3">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-2">
            {manager.approvalStatus === "pending_approval" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">Profile under review. Awaiting admin approval before going public.</p>
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

      {/* Manager Summary */}
      {isLocked ? (
        <section className="border-b border-border py-8">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mb-5">
              <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Overview</h2>
            </div>
            <div className="relative">
              <div className="blur-sm select-none pointer-events-none">
                <p className="text-sm text-foreground leading-relaxed mb-6">
                  Reviewers reported positive scores overall, with most categories reflecting a satisfying experience.
                </p>
                <div className="grid sm:grid-cols-2 gap-8">
                  {["Key Strengths", "Lower-rated categories"].map(label => (
                    <div key={label}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${label === "Key Strengths" ? "bg-emerald-500" : "bg-orange-400"}`} />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                      </div>
                      <div>
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                            <div className="h-3 rounded bg-muted" style={{ width: `${55 + i * 12}%` }} />
                            <span className="text-sm font-semibold tabular-nums ml-4 flex-shrink-0">4.{i}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-background/60 rounded-lg px-4">
                <p className="text-sm font-semibold text-foreground">Overview is locked</p>
                <p className="mt-1 text-xs text-muted-foreground">Rate any manager to see the full summary.</p>
                <button
                  onClick={() => navigate("/add")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                >
                  ⭐ Rate a manager
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : contextReviews.length === 0 ? (
        <section className="border-b border-border py-8">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mb-5">
              <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Overview</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Summarised from reviewer opinions. All ratings and observations reflect personal experiences, not verified facts.
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              No reviews have been submitted yet. Once reviewers share their experiences, an overview summary will appear here.
            </p>
            <div className="grid sm:grid-cols-2 gap-8">
              {["Key Strengths", "Lower-rated categories"].map(label => (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${label === "Key Strengths" ? "bg-emerald-200" : "bg-orange-200"}`} />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">{label}</p>
                  </div>
                  <div>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div className="h-3 rounded bg-muted" style={{ width: `${55 + i * 12}%` }} />
                        <span className="text-sm font-semibold text-muted-foreground/40 tabular-nums ml-4 flex-shrink-0">—</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {!isLocked && contextReviews.length > 0 && (() => {
        const overall = managerCategoryAverages.overallRating || 0;
        const n = contextReviews.length;
        const scored = RATING_CATEGORIES
          .map(cat => ({ cat, score: Math.round((managerCategoryAverages[cat] || 0) * 10) / 10 }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score);

        const strengths  = scored.filter(x => x.score >= 3.8).slice(0, 3);
        const challenges = [...scored].reverse().filter(x => x.score < 3.2).slice(0, 3);

        let headline = "";
        const reviewLabel = n === 1 ? "1 anonymous reviewer" : `${n} anonymous reviewers`;
        const reportedLabel = n === 1 ? `${reviewLabel} reported` : `${reviewLabel} reported`;
        if      (overall >= 4.5) headline = `${reportedLabel} very high scores across nearly all categories.`;
        else if (overall >= 4.0) headline = `${reportedLabel} positive scores overall, with most categories reflecting a satisfying working experience.`;
        else if (overall >= 3.5) headline = `${reportedLabel} generally favourable scores, with most categories reflecting a positive but mixed experience.`;
        else if (overall >= 3.0) headline = `${reportedLabel} mixed scores. Some categories were rated well, while others were noted as needing improvement.`;
        else if (overall >= 2.0) headline = `${reportedLabel} below-average scores, with several categories noted as areas of concern.`;
        else                     headline = `${reportedLabel} lower scores across several categories.`;

        return (
          <section className="border-b border-border py-8">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="mb-5">
                <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Overview</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {n < 3
                    ? "Based on a small number of opinions. Treat as indicative only until more reviews are submitted."
                    : "Summarised from reviewer opinions. All ratings and observations reflect personal experiences, not verified facts."}
                </p>
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-6">{headline}</p>

              {(strengths.length > 0 || challenges.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-8">
                  {strengths.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Key Strengths</p>
                      </div>
                      <div>
                        {strengths.map(({ cat, score }) => (
                          <div key={cat} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                            <span className="text-sm text-foreground">{cat}</span>
                            <span className="text-sm font-semibold text-emerald-600 tabular-nums ml-4 flex-shrink-0">{score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {challenges.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="h-2 w-2 rounded-full bg-orange-400 flex-shrink-0" />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Lower-rated categories</p>
                      </div>
                      <div>
                        {challenges.map(({ cat, score }) => (
                          <div key={cat} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                            <span className="text-sm text-foreground">{cat}</span>
                            <span className="text-sm font-semibold text-orange-500 tabular-nums ml-4 flex-shrink-0">{score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* Category Averages — bar chart */}
      <section className="border-b border-border py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Performance Breakdown</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">Average scores across all rating categories</p>
          </div>
          {isLocked ? (
            <div className="relative">
              <div className="grid gap-3 sm:grid-cols-2 blur-sm select-none pointer-events-none">
                {RATING_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{category}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-[#6d5091]" style={{ width: `${Math.random() * 60 + 20}%` }} />
                    </div>
                    <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">—</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-background/60 rounded-lg">
                <p className="text-sm font-semibold text-foreground">+{RATING_CATEGORIES.length} categories locked</p>
                <p className="mt-1 text-xs text-muted-foreground">Rate any manager to unlock the full breakdown</p>
                <button
                  onClick={() => navigate("/add")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                >
                  ⭐ Rate a manager
                </button>
              </div>
            </div>
          ) : contextReviews.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {RATING_CATEGORIES.map((category) => {
                const avg = managerCategoryAverages[category] || 0;
                const pct = (avg / 5) * 100;
                return (
                  <div key={category} className="flex items-center gap-3">
                    <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{category}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-[#6d5091] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
                      {avg > 0 ? avg.toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {RATING_CATEGORIES.map((category) => (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-44 flex-shrink-0 text-xs text-muted-foreground leading-tight">{category}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" />
                  <span className="w-7 flex-shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">—</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Career Performance Timeline — gated for non-contributors and signed-out users */}
      {!isLocked && user ? (
        <div
          style={{
            opacity: timelineUnlocked ? (timelineFadeIn ? 1 : 0) : 1,
            transition: timelineUnlocked ? "opacity 0.7s ease" : "none",
          }}
        >
          <CareerTimeline
            segments={effectiveCareerSegments}
            onEditCareerEntry={user?.role === "admin" ? (entry) => {
              setAdminCareerEditEntry({
                entryId:   entry.entryId,
                company:   entry.company,
                role:      entry.role,
                startDate: entry.startDate?.slice(0, 4) ?? "",
                endDate:   entry.endDate?.slice(0, 4) ?? "",
              });
            } : undefined}
            onDeleteCareerEntry={user?.role === "admin" ? (entryId) => {
              setAdminCareerDeleteId(entryId);
            } : undefined}
          />
        </div>
      ) : (
        <section className="py-10 border-b border-border">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight mb-4">Career Performance Trajectory</h2>
            <div className="relative rounded-xl border border-border overflow-hidden">
              <div className="h-40 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 blur-sm" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <p className="font-semibold text-foreground">See how this manager's ratings have changed over time</p>
                <p className="mt-1 text-sm text-muted-foreground">Rate a manager to unlock the performance trajectory</p>
                <button
                  onClick={() => navigate("/add")}
                  className="mt-4 rounded-lg bg-[#2e0562] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2e0562]/90"
                >
                  ⭐ Rate a manager
                </button>
              </div>
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
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{contextReviews.length}</span>
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
            {isLocked ? (
              <div className="relative">
                {/* Show 1 blurred review as teaser */}
                {sortedReviews.length > 0 && (
                  <div className="blur-sm select-none pointer-events-none rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3">
                      <p className="text-[13px] font-semibold text-foreground">
                        {sortedReviews[0].managerTitle} at {sortedReviews[0].managerCompany}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={12} className={i < Math.floor(sortedReviews[0].overallRating || 0) ? "fill-amber-400 text-amber-400" : "text-border"} />
                      ))}
                    </div>
                    <p className="text-sm text-foreground line-clamp-3">{sortedReviews[0].text || "No written review."}</p>
                  </div>
                )}
                <div className={`${sortedReviews.length > 0 ? "mt-3" : ""} rounded-xl border border-border bg-card p-8 text-center`}>
                  <p className="text-sm font-semibold text-foreground">
                    {sortedReviews.length > 0
                      ? `${sortedReviews.length} review${sortedReviews.length === 1 ? "" : "s"} hidden`
                      : "Reviews are locked"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Rate any manager to read what others think.</p>
                  <button
                    onClick={() => navigate("/add")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
                  >
                    ⭐ Rate a manager to unlock
                  </button>
                </div>
              </div>
            ) : sortedReviews.length > 0 ? (
              sortedReviews.map((review) => {
                const isExpanded = expandedReviews.has(review.id);
                return (
                <div
                  key={review.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  {/* Role context — most important signal for readers */}
                  <div className="mb-3">
                    <p className="text-[13px] font-semibold text-foreground">
                      {review.managerTitle} at {review.managerCompany}
                    </p>
                    {(review.workedFrom || review.workedUntil) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {review.workedFrom ? new Date(review.workedFrom + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}
                        {" – "}
                        {review.workedUntil
                          ? new Date(review.workedUntil + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                          : "Present"}
                      </p>
                    )}
                  </div>

                  {/* Rating + reviewer row */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: getAvatarColor(review.author) }}
                      >
                        {getInitials(review.author)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{review.author}</span>
                          {review.verified && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground cursor-help whitespace-nowrap flex-shrink-0"
                              title="Submitted by a registered account holder. Identity is not independently verified."
                            >
                              ✓ Registered
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{getFormattedDate(review)}</p>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      <span className="text-lg font-bold text-foreground tabular-nums leading-none">{review.overallRating.toFixed(1)}</span>
                      <div className="flex gap-0.5" role="img" aria-label={`${review.overallRating} out of 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12} aria-hidden="true"
                            className={i < Math.round(review.overallRating) ? "fill-amber-400 text-amber-400" : "text-border"} />
                        ))}
                      </div>
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
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <span className="text-xs font-semibold text-foreground tabular-nums">
                              {review.ratings[category as keyof typeof review.ratings]}
                            </span>
                            <Star size={10} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

      {/* CTA Section — only shown to users who haven't reviewed yet */}
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
                setReviewStep("ratings");
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

      {/* Write Review — Full-Screen Stepped Form */}
      {reviewStep && (() => {
        const steps = ["ratings", "dates", "identity"] as const;
        const stepIdx = steps.indexOf(reviewStep) + 1;
        const stepTitles = { ratings: "Rate your experience", dates: "Work timeline", identity: "Review attribution" };
        const isLastStep = reviewStep === "identity";
        const submitDisabled = !reviewAllRated || !reviewAttested || !reviewIsDateValid || isDuplicateTitle || isManagerRoleOverlap || isSubmittingReview || !!reviewTitleError || !!reviewDateError || !!reviewSubmitError || !!pendingAutoSubmit;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={() => {
                  if (reviewStep === "ratings") { localStorage.removeItem("rmm_pending_review"); setReviewStep(null); setModalRatings(initializeRatings()); }
                  else if (reviewStep === "dates") setReviewStep("ratings");
                  else if (reviewStep === "identity") { setReviewStep("dates"); setConflictAfterAuth(false); setShowCancelConfirm(false); }
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                {reviewStep !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
                {reviewStep === "ratings" ? "Cancel" : "Back"}
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{stepTitles[reviewStep]}</p>
                <p className="text-xs text-muted-foreground">Step {stepIdx} of 3 · {manager.name}</p>
              </div>
              <button
                onClick={() => { localStorage.removeItem("rmm_pending_review"); setReviewStep(null); setModalRatings(initializeRatings()); setPendingAutoSubmit(null); setConflictAfterAuth(false); setShowCancelConfirm(false); setIsReplacingReview(false); }}
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
                {showDraftBanner && reviewStep === "ratings" && (
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

                {/* Step 4: Identity */}
                {reviewStep === "identity" && (
                  <div className="space-y-6">
                    {showReadyBanner && reviewAllRated && reviewIsDateValid && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                        <Check size={16} className="flex-shrink-0" />
                        You're signed in. Your review is ready to submit.
                      </div>
                    )}
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

                    {/* First-hand-experience attestation — required before the review can be submitted */}
                    <div className="rounded-xl border border-border p-5">
                      <label className="flex items-start gap-3 cursor-pointer text-sm text-foreground">
                        <input
                          type="checkbox"
                          name="attestation"
                          checked={reviewAttested}
                          onChange={e => setReviewAttested(e.target.checked)}
                          className="mt-0.5 w-4 h-4 flex-shrink-0"
                        />
                        <span>
                          I confirm that I have personally worked with or for this manager, and these
                          ratings reflect my own experience and perceptions.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Step 2: Dates */}
                {reviewStep === "dates" && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Work timeline</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Help us understand when this working relationship occurred.</p>
                    </div>

                    {/* Work period */}
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">When did you work with this manager? <span className="text-red-500">*</span></p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">From <span className="text-red-500">*</span></p>
                          <div className="flex gap-2">
                            <select aria-label="From month" value={reviewWorkedFrom.month} onChange={(e) => { const v = e.target.value; setReviewWorkedFrom(p => ({ ...p, month: v })); if (!v && !reviewWorkedFrom.year) { setReviewWorkedUntil({ month: "", year: "" }); setReviewCurrentlyWorking(false); } }} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]">
                              <option value="">Month</option>
                              {availableMonths(reviewWorkedFrom.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <select aria-label="From year" value={reviewWorkedFrom.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(reviewWorkedFrom.month) > currentMonth ? "" : reviewWorkedFrom.month; setReviewWorkedFrom({ month: clearedMonth, year: v }); if (!v && !clearedMonth) { setReviewWorkedUntil({ month: "", year: "" }); setReviewCurrentlyWorking(false); } }} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]">
                              <option value="">Year</option>
                              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">To</p>
                          <div className="flex gap-2 items-center">
                            {!reviewCurrentlyWorking && (
                              <>
                                <select aria-label="Until month" value={reviewWorkedUntil.month} onChange={(e) => setReviewWorkedUntil(p => ({ ...p, month: e.target.value }))} disabled={!reviewWorkedFrom.month && !reviewWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Month</option>
                                  {availableMonths(reviewWorkedUntil.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select aria-label="Until year" value={reviewWorkedUntil.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(reviewWorkedUntil.month) > currentMonth ? "" : reviewWorkedUntil.month; setReviewWorkedUntil({ month: clearedMonth, year: v }); }} disabled={!reviewWorkedFrom.month && !reviewWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Year</option>
                                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                              </>
                            )}
                            {(() => {
                              const noFrom = !reviewWorkedFrom.month && !reviewWorkedFrom.year;
                              const disableCurrent = noFrom || isManagerRoleOverlap;
                              return (
                                <label className={`flex items-center gap-2 text-sm text-foreground cursor-pointer ${disableCurrent ? "opacity-40 cursor-not-allowed" : ""}`}>
                                  <input type="checkbox" checked={reviewCurrentlyWorking} onChange={(e) => { if (!disableCurrent) setReviewCurrentlyWorking(e.target.checked); }} disabled={disableCurrent} className="w-4 h-4" />
                                  Current
                                </label>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const fromFilled = reviewWorkedFrom.month !== "" && reviewWorkedFrom.year !== "";
                        const untilFilled = reviewWorkedUntil.month !== "" && reviewWorkedUntil.year !== "";
                        const fromVal  = fromFilled  ? parseInt(reviewWorkedFrom.year) * 100 + parseInt(reviewWorkedFrom.month) : null;
                        const untilVal = untilFilled ? parseInt(reviewWorkedUntil.year) * 100 + parseInt(reviewWorkedUntil.month) : null;
                        if (isManagerRoleOverlap) return <p className="mt-3 text-xs text-red-600">You already have a review that overlaps this period. Each review must cover a distinct time range.</p>;
                        if (fromFilled && untilFilled && fromVal! > untilVal!) return <p className="mt-3 text-xs text-red-600">Your 'From' date cannot be later than your 'To' date.</p>;
                        if (fromFilled && !reviewCurrentlyWorking && !untilFilled) return <p className="mt-3 text-xs text-amber-700">Add a 'To' date or check 'Current' to mark this as ongoing.</p>;
                        if (reviewDateError) return <p className="mt-3 text-xs text-red-600">{reviewDateError}</p>;
                        return null;
                      })()}
                    </div>

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

                {/* Step 1: Ratings */}
                {reviewStep === "ratings" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Rate a Manager</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Takes just a minute. Your firsthand experience helps other job seekers make more informed decisions.</p>
                    </div>

                    {/* Role selector — lets reviewer pick which role they're reviewing */}
                    {manager.careerHistory && manager.careerHistory.length > 1 && (
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Which role are you reviewing?
                        </label>
                        <select
                          value={selectedCareerRoleIdx}
                          onChange={(e) => {
                            const idx = Number(e.target.value);
                            setSelectedCareerRoleIdx(idx);
                            const ch = (manager.careerHistory as any[])[idx];
                            if (!ch) return;
                            setReviewManagerTitle(ch.title ?? "");
                            setReviewManagerCompany(ch.company ?? "");
                            setEditingRoleInline(false);
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

                    {/* Manager role context — read-only with inline edit toggle */}
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                      {!editingRoleInline ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[17px] font-semibold text-foreground leading-snug">{manager.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{reviewManagerTitle || manager.title}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {(() => {
                                const displayCompany = reviewManagerCompany || manager.company;
                                const logoSrc = manager.companyLogoUrl
                                  ?? `https://img.logo.dev/${companyLogoDomain(displayCompany)}?token=pk_MXSjJV-uTC6-L5D_FbXZUA`;
                                return (
                                  <div key={displayCompany} className="h-5 w-5 rounded flex-shrink-0 overflow-hidden bg-white border border-border flex items-center justify-center">
                                    <img
                                      src={logoSrc}
                                      alt={displayCompany}
                                      className="h-full w-full object-contain"
                                      onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                                    />
                                  </div>
                                );
                              })()}
                              <p className="text-sm font-medium text-foreground">{reviewManagerCompany || manager.company}</p>
                            </div>
                            {(isDuplicateTitle || reviewTitleError) && (
                              <p className="mt-1.5 text-xs text-red-600">
                                {reviewTitleError || "You've already reviewed this role at this company."}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingRoleInline(true)}
                            className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                          >
                            <Edit2 size={12} aria-hidden="true" />
                            Edit details
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their title <span className="text-red-500">*</span></label>
                              <input
                                type="text"
                                value={reviewManagerTitle}
                                onChange={(e) => { setReviewManagerTitle(e.target.value); setReviewTitleError(null); setConflictAfterAuth(false); }}
                                placeholder="e.g. Engineering Manager"
                                maxLength={100}
                                autoFocus
                                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] ${reviewTitleError || isDuplicateTitle ? "border-red-500" : "border-border"}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their company <span className="text-red-500">*</span></label>
                              <CompanyAutocomplete
                                value={reviewManagerCompany}
                                onChange={val => { setReviewManagerCompany(val); setReviewTitleError(null); setConflictAfterAuth(false); }}
                                placeholder="e.g. Acme Corp"
                                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] ${reviewTitleError || isDuplicateTitle ? "border-red-500" : "border-border"}`}
                              />
                            </div>
                          </div>
                          {isDuplicateTitle && !reviewTitleError && (
                            <p className="text-xs text-red-600">You've already reviewed this role at this company. Change the title or company to add a different role.</p>
                          )}
                          {reviewTitleError && <p className="text-xs text-red-600">{reviewTitleError}</p>}
                          <button
                            type="button"
                            onClick={() => setEditingRoleInline(false)}
                            className="text-xs text-primary hover:underline"
                          >
                            Done editing
                          </button>
                        </div>
                      )}
                    </div>

                    {/* About your review */}
                    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">About your review</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Your rating reflects your personal experience. All feedback is structured and opinion-based.
                      </p>
                      <ul className="space-y-1">
                        {[
                          "One review per role / time period",
                          "Duplicate or overlapping reviews are automatically blocked",
                          "No written reviews, only structured ratings",
                        ].map(item => (
                          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="border-b border-border pb-4 last:border-b-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <label className="block text-sm font-semibold text-foreground">{category}</label>
                            <StarRating
                              value={modalRatings[category] || 0}
                              onChange={(value) => setModalRatings((prev) => ({ ...prev, [category]: value }))}
                              required={true}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
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
                            onClick={() => { localStorage.removeItem("rmm_pending_review"); setReviewSubmitError(null); setReviewStep(null); setConflictAfterAuth(false); setShowCancelConfirm(false); }}
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
                            localStorage.removeItem("rmm_pending_review");
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
                            setEditReviewStep("ratings");
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
                        if (reviewStep === "ratings") setReviewStep("dates");
                        else if (reviewStep === "dates") setReviewStep("identity");
                        else if (reviewStep === "identity") handleSubmitReview();
                      }}
                      disabled={
                        (reviewStep === "ratings" && (!reviewAllRated || isDuplicateTitle)) ||
                        (reviewStep === "dates" && (!reviewIsDateValid || !!reviewDateError)) ||
                        (isLastStep && submitDisabled)
                      }
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:opacity-50 disabled:cursor-not-allowed ${isLastStep && showReadyBanner ? "ring-2 ring-[#2e0562] ring-offset-2" : ""}`}
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

      {/* Edit Manager Details — Full-Screen Form */}
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
                      value={editFormData.company}
                      onChange={(val) => { setEditModalTouched(true); setEditFormData((prev) => ({ ...prev, company: val })); setEditCompanyLogoUrl(undefined); }}
                      onSuggestionSelect={(_name, logoUrl) => setEditCompanyLogoUrl(logoUrl)}
                      placeholder="e.g., Microsoft, Apple"
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Country</label>
                    <select
                      value={editFormData.country}
                      onChange={(e) => { setEditModalTouched(true); setEditFormData((prev) => ({ ...prev, country: e.target.value })); }}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map(c => (
                        <option key={c.value} value={c.value}>{c.flag} {c.value}</option>
                      ))}
                    </select>
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

      {/* Edit Review — Full-Screen Stepped Form */}
      {editReviewStep && user && (() => {
        const steps = ["ratings", "dates", "identity"] as const;
        const stepIdx = steps.indexOf(editReviewStep) + 1;
        const stepTitles = { ratings: "Update ratings", dates: "Work timeline", identity: "Review attribution" };
        const isLastStep = editReviewStep === "identity";
        const submitDisabled = !editReviewAllRated || !editReviewIsDateValid || isEditDuplicateTitle || isEditManagerRoleOverlap;
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={() => {
                  if (editReviewStep === "ratings") { setEditReviewStep(null); setEditingReviewId(null); }
                  else if (editReviewStep === "dates") setEditReviewStep("ratings");
                  else if (editReviewStep === "identity") setEditReviewStep("dates");
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
              >
                {editReviewStep !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
                {editReviewStep === "ratings" ? "Cancel" : "Back"}
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{stepTitles[editReviewStep]}</p>
                <p className="text-xs text-muted-foreground">Step {stepIdx} of 3 · {manager.name}</p>
              </div>
              <button
                onClick={() => { setEditReviewStep(null); setEditingReviewId(null); }}
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
                {editReviewStep === "ratings" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Update your ratings</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Takes just a minute. Your firsthand experience helps other job seekers make more informed decisions.</p>
                    </div>

                    {/* Manager role context — read-only with inline edit toggle */}
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                      {!editingEditRoleInline ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[17px] font-semibold text-foreground leading-snug">{manager.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{editManagerTitle || manager.title}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {(() => {
                                const displayCompany = editManagerCompany || manager.company;
                                const logoSrc = manager.companyLogoUrl
                                  ?? `https://img.logo.dev/${companyLogoDomain(displayCompany)}?token=pk_MXSjJV-uTC6-L5D_FbXZUA`;
                                return (
                                  <div key={displayCompany} className="h-5 w-5 rounded flex-shrink-0 overflow-hidden bg-white border border-border flex items-center justify-center">
                                    <img src={logoSrc} alt={displayCompany} className="h-full w-full object-contain" onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }} />
                                  </div>
                                );
                              })()}
                              <p className="text-sm font-medium text-foreground">{editManagerCompany || manager.company}</p>
                            </div>
                            {(isEditDuplicateTitle || editReviewTitleError) && (
                              <p className="mt-1.5 text-xs text-red-600">{editReviewTitleError || "You've already reviewed this role at this company."}</p>
                            )}
                          </div>
                          <button type="button" onClick={() => setEditingEditRoleInline(true)}
                            className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                            <Edit2 size={12} aria-hidden="true" />
                            Edit details
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their title <span className="text-red-500">*</span></label>
                              <input type="text" value={editManagerTitle}
                                onChange={(e) => { setEditManagerTitle(e.target.value); setEditReviewTitleError(null); }}
                                placeholder="e.g. Engineering Manager" maxLength={100} autoFocus
                                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] ${editReviewTitleError || isEditDuplicateTitle ? "border-red-500" : "border-border"}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-muted-foreground mb-1">Their company <span className="text-red-500">*</span></label>
                              <CompanyAutocomplete
                                value={editManagerCompany}
                                onChange={val => setEditManagerCompany(val)}
                                placeholder="e.g. Acme Corp"
                                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] ${isEditDuplicateTitle ? "border-red-500" : "border-border"}`}
                              />
                            </div>
                          </div>
                          {isEditDuplicateTitle && !editReviewTitleError && (
                            <p className="text-xs text-red-600">You already have a review for this role at this company. Change the title or company to review a different role.</p>
                          )}
                          {editReviewTitleError && <p className="text-xs text-red-600">{editReviewTitleError}</p>}
                          <button type="button" onClick={() => setEditingEditRoleInline(false)} className="text-xs text-primary hover:underline">Done editing</button>
                        </div>
                      )}
                    </div>

                    {/* About your review */}
                    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">About your review</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Your rating reflects your personal experience. All feedback is structured and opinion-based.
                      </p>
                      <ul className="space-y-1">
                        {[
                          "One review per role / time period",
                          "Duplicate or overlapping reviews are automatically blocked",
                          "No written reviews, only structured ratings",
                        ].map(item => (
                          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      {RATING_CATEGORIES.map((category) => (
                        <div key={category} className="border-b border-border pb-4 last:border-b-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <label className="block text-sm font-semibold text-foreground">{category}</label>
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

                {/* Step 2: Dates */}
                {editReviewStep === "dates" && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Work timeline</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Help us understand when this working relationship occurred.</p>
                    </div>

                    {/* Work period */}
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">When did you work with this manager? <span className="text-red-500">*</span></p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">From <span className="text-red-500">*</span></p>
                          <div className="flex gap-2">
                            <select aria-label="From month" value={editWorkedFrom.month} onChange={(e) => { const v = e.target.value; setEditWorkedFrom(p => ({ ...p, month: v })); if (!v && !editWorkedFrom.year) { setEditWorkedUntil({ month: "", year: "" }); setEditCurrentlyWorking(false); } }} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]">
                              <option value="">Month</option>
                              {availableMonths(editWorkedFrom.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <select aria-label="From year" value={editWorkedFrom.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(editWorkedFrom.month) > currentMonth ? "" : editWorkedFrom.month; setEditWorkedFrom({ month: clearedMonth, year: v }); if (!v && !clearedMonth) { setEditWorkedUntil({ month: "", year: "" }); setEditCurrentlyWorking(false); } }} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]">
                              <option value="">Year</option>
                              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">To</p>
                          <div className="flex gap-2 items-center">
                            {!editCurrentlyWorking && (
                              <>
                                <select aria-label="Until month" value={editWorkedUntil.month} onChange={(e) => setEditWorkedUntil(p => ({ ...p, month: e.target.value }))} disabled={!editWorkedFrom.month && !editWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Month</option>
                                  {availableMonths(editWorkedUntil.year).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <select aria-label="Until year" value={editWorkedUntil.year} onChange={(e) => { const v = e.target.value; const clearedMonth = v === String(currentYear) && parseInt(editWorkedUntil.month) > currentMonth ? "" : editWorkedUntil.month; setEditWorkedUntil({ month: clearedMonth, year: v }); }} disabled={!editWorkedFrom.month && !editWorkedFrom.year} className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:opacity-40 disabled:cursor-not-allowed">
                                  <option value="">Year</option>
                                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                              </>
                            )}
                            {(() => {
                              const noFrom = !editWorkedFrom.month && !editWorkedFrom.year;
                              const disableCurrent = noFrom || isEditManagerRoleOverlap;
                              return (
                                <label className={`flex items-center gap-2 text-sm text-foreground cursor-pointer ${disableCurrent ? "opacity-40 cursor-not-allowed" : ""}`}>
                                  <input type="checkbox" checked={editCurrentlyWorking} onChange={(e) => { if (!disableCurrent) setEditCurrentlyWorking(e.target.checked); }} disabled={disableCurrent} className="w-4 h-4" />
                                  Current
                                </label>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const fromFilled  = editWorkedFrom.month !== "" && editWorkedFrom.year !== "";
                        const untilFilled = editWorkedUntil.month !== "" && editWorkedUntil.year !== "";
                        const fromVal  = fromFilled  ? parseInt(editWorkedFrom.year) * 100 + parseInt(editWorkedFrom.month) : null;
                        const untilVal = untilFilled ? parseInt(editWorkedUntil.year) * 100 + parseInt(editWorkedUntil.month) : null;
                        if (isEditManagerRoleOverlap) return <p className="mt-3 text-xs text-red-600">You already have a review that overlaps this period. Each review must cover a distinct time range.</p>;
                        if (fromFilled && untilFilled && fromVal! > untilVal!) return <p className="mt-3 text-xs text-red-600">Your 'From' date cannot be later than your 'To' date.</p>;
                        if (fromFilled && !editCurrentlyWorking && !untilFilled) return <p className="mt-3 text-xs text-amber-700">Add a 'To' date or check 'Current' to mark this as ongoing.</p>;
                        if (editReviewDateError) return <p className="mt-3 text-xs text-red-600">{editReviewDateError}</p>;
                        return null;
                      })()}
                    </div>

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
                {editReviewStep === "identity" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[22px] font-semibold text-foreground">Who wrote this review?</h2>
                      <p className="mt-1 text-sm text-muted-foreground">This review will be posted under the same name you originally used.</p>
                    </div>
                    <div className="rounded-lg border border-[#2e0562] p-3 bg-[#2e0562]/5">
                      <p className="font-medium text-foreground">
                        {editAuthorType === "username" ? `@${user.username}` : editAuthorType === "real_name" ? `${user.firstName} ${user.lastName}` : editGeneratedName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {editAuthorType === "username" ? "Your username" : editAuthorType === "real_name" ? "Your real name" : "Anonymous"}
                      </p>
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
                      if (editReviewStep === "ratings") setEditReviewStep("dates");
                      else if (editReviewStep === "dates") setEditReviewStep("identity");
                      else if (editReviewStep === "identity") handleEditReview();
                    }}
                    disabled={
                      (editReviewStep === "ratings" && (!editReviewAllRated || isEditDuplicateTitle)) ||
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

      {/* Report Profile — Full-Screen Form */}
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
          if (action === "rate") {
            navigate("/add");
          } else if (action === "career-unlock") {
            const y = parseInt(sessionStorage.getItem("rmm_career_unlock_scroll") ?? "0", 10);
            sessionStorage.removeItem("rmm_career_unlock_scroll");
            setTimelineUnlocked(true);
            requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
          } else if (action === "edit-submit") {
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