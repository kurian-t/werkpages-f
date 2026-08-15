import API_BASE from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { StarRating } from "@/components/StarRating";
import { AlertCircle, Check, X, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { validateProfileUrl, generateUsername } from "@/lib/validators";
import { COUNTRIES } from "@/lib/countries";
import { fetchGeo } from "@/lib/geo";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import type { User } from "@/contexts/AuthContext";

const MONTHS = [
  { value: "01", label: "Jan" }, { value: "02", label: "Feb" },
  { value: "03", label: "Mar" }, { value: "04", label: "Apr" },
  { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Aug" },
  { value: "09", label: "Sep" }, { value: "10", label: "Oct" },
  { value: "11", label: "Nov" }, { value: "12", label: "Dec" },
];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = Array.from({ length: 47 }, (_, i) => String(currentYear - i));

const availableMonths = (_selectedYear: string) => MONTHS;

const toYMVal = (m: string, y: string) => (m && y ? parseInt(y) * 100 + parseInt(m) : null);
const nowVal = currentYear * 100 + currentMonth;

const toYearMonth = (month: string, year: string) =>
  month && year ? `${year}-${month}` : null;

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

// ── Shared components ─────────────────────────────────────────────────────────

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
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`${label} month`}
        autoComplete="off"
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
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`${label} year`}
        autoComplete="off"
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

// ── Main page ─────────────────────────────────────────────────────────────────

type AddBossStep = "info" | "timeline" | "ratings";

export default function AddBoss() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/directory";
  const [authFlowStep, setAuthFlowStep] = useState<AuthFlowStep | null>(null);
  const [authFlowEmail, setAuthFlowEmail] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pendingEmailVerified, setPendingEmailVerified] = useState(false);

  const [step, setStep] = useState<AddBossStep>("info");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    title: "",
    company: searchParams.get("company") ?? "",
    country: "",
    state: "",
    linkedinUrl: "",
    status: "active" as "active" | "retired",
  });

  // Pre-fill country + state/province from the visitor's inferred location. City is
  // captured silently server-side (Cloudflare headers) and not shown here.
  useEffect(() => {
    let cancelled = false;
    fetchGeo().then(geo => {
      if (cancelled) return;
      setFormData(prev => ({
        ...prev,
        country: prev.country || geo.country,
        state: prev.state || (geo.state ?? ""),
      }));
    });
    return () => { cancelled = true; };
  }, []);

  const initializeRatings = () =>
    RATING_CATEGORIES.reduce(
      (acc, cat) => ({ ...acc, [cat]: 0 }),
      {} as Record<string, number>
    );

  const [ratings, setRatings] = useState<Record<string, number>>(initializeRatings());
  const [workedFrom, setWorkedFrom] = useState({ month: "", year: "" });
  const [workedUntil, setWorkedUntil] = useState({ month: "", year: "" });
  const [currentlyWorking, setCurrentlyWorking] = useState(false);
  const [formTouched, setFormTouched] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);

  const [authorType] = useState<"anonymous">("anonymous");
  const [generatedName, setGeneratedName] = useState(() => generateUsername());

  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const readyBannerRef = useRef<HTMLDivElement>(null);
  const ghostCaptureAttemptedRef = useRef(false);
  const autoSubmitStatusRef = useRef<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const autoSavedManagerIdRef = useRef<number | null>(null);
  const [fromVerified, setFromVerified] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showReadyBanner, setShowReadyBanner] = useState(false);
  const dropOffCaptureAttemptedRef = useRef(false);
  const draftTokenRef = useRef<string | null>(null);

  // ── Derived numeric date values ───────────────────────────────────────────
  const revFromVal  = toYMVal(workedFrom.month, workedFrom.year);
  const revUntilVal = toYMVal(workedUntil.month, workedUntil.year);

  // ── Validity booleans ─────────────────────────────────────────────────────
  const revFromValid  = !!revFromVal && revFromVal <= nowVal;
  const revUntilValid = currentlyWorking ? true : (!!revUntilVal && revUntilVal <= nowVal);
  const revOrderValid = !revFromVal || !revUntilVal || revUntilVal >= revFromVal;

  const isDateValid = revFromValid && revUntilValid && revOrderValid;

  const firstNameValid = formData.firstName.trim().length > 0;
  const lastNameValid  = formData.lastName.trim().length > 0;
  const titleValid     = formData.title.trim().length > 0;
  const companyValid   = formData.company.trim().length >= 2;
  const countryValid   = formData.country.trim().length > 0;
  const linkedinValid  = !formData.linkedinUrl || validateProfileUrl(formData.linkedinUrl).valid;
  const unratedCount   = Object.values(ratings).filter(r => r < 1).length;

  const step1Valid = firstNameValid && lastNameValid && titleValid && companyValid && countryValid && linkedinValid;
  const step2Valid = isDateValid;

  // ── Rule builders ─────────────────────────────────────────────────────────
  const req = (val: number | null): RuleState =>
    val ? "met" : formTouched ? "violated" : "pending";
  const field = (val: number | null, ok: boolean): RuleState =>
    !val ? "pending" : ok ? "met" : "violated";
  const cross = (a: number | null, b: number | null, ok: boolean): RuleState =>
    !a || !b ? "pending" : ok ? "met" : "violated";

  const revFromRules: Rule[] = [
    { label: "Required", state: req(revFromVal) },
    { label: "Not in the future", state: field(revFromVal, revFromVal! <= nowVal) },
  ];
  const revUntilRules: Rule[] = [
    { label: "Required", state: req(revUntilVal) },
    { label: "Not in the future", state: field(revUntilVal, revUntilVal! <= nowVal) },
    { label: "On or after your start date", state: cross(revUntilVal, revFromVal, revUntilVal! >= revFromVal!) },
  ];

  const showRevFrom  = formTouched || !!revFromVal;
  const showRevUntil = !currentlyWorking && (formTouched || !!revUntilVal);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const DRAFT_TTL = 12 * 60 * 60 * 1000;

  const clearDraft = () => {
    localStorage.removeItem("rmm_pending_manager");
    setFormData({ firstName: "", lastName: "", title: "", company: "", country: "", state: "", linkedinUrl: "", status: "active" });
    setRatings(initializeRatings());
    setWorkedFrom({ month: "", year: "" });
    setWorkedUntil({ month: "", year: "" });
    setCurrentlyWorking(false);
    setGeneratedName(generateUsername());
    setPendingVerificationEmail("");
    setPendingEmailVerified(false);
    setShowDraftBanner(false);
    setStep("info");
  };

  useEffect(() => {
    const isVerified = searchParams.get("verified") === "true";
    try {
      const raw = localStorage.getItem("rmm_pending_manager");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.savedAt && Date.now() - data.savedAt > DRAFT_TTL) {
          localStorage.removeItem("rmm_pending_manager");
        } else {
          localStorage.removeItem("rmm_pending_manager");
          if (data.formData)    setFormData(prev => ({ ...prev, ...data.formData }));
          if (data.ratings)     setRatings(data.ratings);
          if (data.workedFrom)  setWorkedFrom(data.workedFrom);
          if (data.step)        setStep(data.step);
          if (data.workedUntil) setWorkedUntil(data.workedUntil);
          if (data.currentlyWorking != null) setCurrentlyWorking(data.currentlyWorking);
          if (data.generatedName) setGeneratedName(data.generatedName);
          if (data.draftToken) draftTokenRef.current = data.draftToken;
          if (data.signupEmail) {
            setAuthFlowEmail(data.signupEmail);
            setPendingVerificationEmail(data.signupEmail);
            setPendingEmailVerified(isVerified || !!data.emailVerified);
          }
          if (isVerified) {
            setFromVerified(true);
            setAuthFlowStep("signin");
          } else if (data.signupEmail) {
            if (data.emailVerified) setFromVerified(true);
            setAuthFlowStep(data.emailVerified ? "signin" : "verify_email");
          } else if (user) {
            // OAuth redirect remount — user already logged in, go straight to ready state
            const allRated = data.ratings && Object.keys(data.ratings).length > 0 && Object.values(data.ratings as Record<string, number>).every(r => r >= 1);
            if (allRated) setShowReadyBanner(true);
          } else {
            setShowDraftBanner(true);
          }
        }
      }
    } catch {
      localStorage.removeItem("rmm_pending_manager");
    }
    if (isVerified) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasData = formData.firstName || formData.lastName || formData.company || formData.title ||
      Object.values(ratings).some(r => r > 0) || workedFrom.month;
    if (!hasData) return;
    localStorage.setItem("rmm_pending_manager", JSON.stringify({
      returnTo: "/add",
      formData, ratings,
      workedFrom, workedUntil, currentlyWorking,
      authorType, generatedName,
      step,
      ...(draftTokenRef.current ? { draftToken: draftTokenRef.current } : {}),
      ...(pendingVerificationEmail ? { signupEmail: pendingVerificationEmail, emailVerified: pendingEmailVerified } : {}),
      savedAt: Date.now(),
    }));
  }, [formData, ratings, workedFrom, workedUntil, currentlyWorking, authorType, generatedName, step, pendingVerificationEmail, pendingEmailVerified]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early ghost capture (works for all users, including unauthenticated) ─────
  useEffect(() => {
    if (!step1Valid || ghostCaptureAttemptedRef.current) return;
    ghostCaptureAttemptedRef.current = true;
    axios.post(`${API_BASE}/api/managers/ghost`, {
      name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
      company: formData.company.trim(),
      title: formData.title.trim(),
      country: formData.country,
      state: formData.state.trim() || null,
    }).catch(() => {});
  }, [step1Valid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save when all ratings filled ────────────────────────────────────
  // Fires silently as soon as the user completes all 10 categories while logged in.
  // Captures drop-offs where the user fills everything but never clicks Submit.
  useEffect(() => {
    if (step !== "ratings") return;
    if (!user) return;
    if (autoSubmitStatusRef.current !== "idle") return;
    const allRated = Object.values(ratings).every(r => r >= 1);
    if (!allRated) return;

    autoSubmitStatusRef.current = "pending";
    (async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/managers`, {
          name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
          company: formData.company.trim(),
          title: formData.title.trim(),
          image: formData.firstName.trim().charAt(0).toUpperCase(),
          bio: "New manager submitted for community review",
          status: formData.status,
          country: formData.country,
          linkedinUrl: formData.linkedinUrl.trim() || null,
          startDate: toYearMonth(workedFrom.month, workedFrom.year),
          endDate: formData.status === "retired" ? toYearMonth(workedUntil.month, workedUntil.year) : null,
          draftToken: draftTokenRef.current ?? undefined,
          review: {
            authorType,
            author: generatedName,
            overallRating: Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length,
            ratings: toApiRatings(ratings),
            managerCompany: formData.company.trim(),
            managerTitle: formData.title.trim(),
            text: null,
            workedFrom: toYearMonth(workedFrom.month, workedFrom.year),
            workedUntil: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
          },
        });
        autoSavedManagerIdRef.current = res.data.id;
        autoSubmitStatusRef.current = "success";
        queryClient.removeQueries({ queryKey: ["managers-directory"] });
        queryClient.removeQueries({ queryKey: ["managers-top"] });
        queryClient.removeQueries({ queryKey: ["stats"] });
        queryClient.removeQueries({ queryKey: ["company-listing"] });
        queryClient.invalidateQueries({ queryKey: ["has-contributed"] });
        localStorage.removeItem("rmm_pending_manager");
      } catch {
        autoSubmitStatusRef.current = "failed";
      }
    })();
  }, [ratings, step, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Handlers ──────────────────────────────────────────────────────────────
  const touch = () => { if (!formTouched) setFormTouched(true); };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    touch();
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors.length > 0) setErrors([]);
  };

  const handleStatusChange = (newStatus: "active" | "retired") => {
    touch();
    setFormData(prev => ({ ...prev, status: newStatus }));
    if (newStatus === "retired") { setCurrentlyWorking(false); setWorkedUntil({ month: "", year: "" }); }
    if (errors.length > 0) setErrors([]);
  };

  const handleRatingChange = (category: string, value: number) => {
    touch();
    setRatings(prev => ({ ...prev, [category]: value }));
    if (errors.length > 0) setErrors([]);
  };

  const toApiRatings = (uiRatings: Record<string, number>) => ({
    communication_style: uiRatings["Communication Style"],
    perceived_approachability: uiRatings["Perceived Approachability"],
    perceived_clarity_of_expectations: uiRatings["Perceived Clarity of Expectations"],
    feedback_style: uiRatings["Feedback Style"],
    perceived_supportiveness: uiRatings["Perceived Supportiveness"],
    decision_making_style: uiRatings["Decision Making Style"],
    organization_and_planning_style: uiRatings["Organization and Planning Style"],
    delegation_style: uiRatings["Delegation Style"],
    perceived_professional_demeanor: uiRatings["Perceived Professional Demeanor"],
    overall_working_experience: uiRatings["Overall Working Experience"],
  });

  const handleNext = () => {
    setFormTouched(true);
    setErrors([]);
    if (step === "info") {
      const errs: string[] = [];
      if (!firstNameValid) errs.push("First name is required");
      if (!lastNameValid)  errs.push("Last name is required");
      if (!titleValid)     errs.push("Title is required");
      if (formData.company.trim().length === 0) errs.push("Company is required");
      else if (!companyValid) errs.push("Company must be at least 2 characters");
      if (!countryValid)   errs.push("Country is required");
      if (formData.linkedinUrl && !linkedinValid) {
        errs.push(validateProfileUrl(formData.linkedinUrl).error!);
      }
      if (errs.length > 0) { setErrors(errs); return; }
      setStep("timeline");
    } else if (step === "timeline") {
      const errs: string[] = [];
      if (!revFromValid) errs.push("Your start date is required and must not be in the future");
      if (!currentlyWorking && !revUntilValid) errs.push(formData.status === "retired" ? "Your end date is required" : "Your end date is required (or check 'Current')");
      if (!revOrderValid) errs.push("Your end date cannot be before your start date");
      if (errs.length > 0) { setErrors(errs); return; }
      setStep("ratings");
    }
  };

  const handleSubmit = async () => {
    setFormTouched(true);
    setErrors([]);

    if (unratedCount > 0) {
      setErrors([`Please rate all categories (${unratedCount} remaining)`]);
      return;
    }

    if (!user) {
      // Capture drop-off: fire-and-forget to server before showing auth modal.
      // unratedCount === 0 is guaranteed by the guard above.
      if (step1Valid && !dropOffCaptureAttemptedRef.current) {
        dropOffCaptureAttemptedRef.current = true;
        if (!draftTokenRef.current) draftTokenRef.current = crypto.randomUUID();
        axios.post(`${API_BASE}/api/managers/drop-off`, {
          name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
          company: formData.company.trim(),
          title: formData.title.trim(),
          country: formData.country,
          state: formData.state.trim() || null,
          status: formData.status,
          draftToken: draftTokenRef.current,
          review: {
            author: generatedName,
            overallRating: Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length,
            ratings: toApiRatings(ratings),
            managerCompany: formData.company.trim(),
            managerTitle: formData.title.trim(),
            workedFrom: toYearMonth(workedFrom.month, workedFrom.year),
            workedUntil: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
          },
        }).catch(() => {});
      }
      if (pendingVerificationEmail) {
        setAuthFlowEmail(pendingVerificationEmail);
        setAuthFlowStep(pendingEmailVerified ? "signin" : "verify_email");
      } else {
        setAuthFlowStep("signup");
      }
      return;
    }

    // Auto-save already captured the review — skip the re-submit and navigate directly
    if (autoSubmitStatusRef.current === "success" && autoSavedManagerIdRef.current != null) {
      localStorage.removeItem("rmm_pending_manager");
      sessionStorage.setItem("rmm_just_rated", "1");
      toast.success(`${formData.firstName} ${formData.lastName} submitted for review!`, {
        description: "An admin will review it shortly.",
      });
      navigate(`/manager/${autoSavedManagerIdRef.current}`);
      return;
    }

    await doSubmit(user);
  };

  const doSubmit = async (effectiveUser: User) => {
    setErrors([]);
    setIsSubmitting(true);

    try {
      const managerResponse = await axios.post(`${API_BASE}/api/managers`, {
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        company: formData.company.trim(),
        title: formData.title.trim(),
        image: formData.firstName.trim().charAt(0).toUpperCase(),
        bio: "New manager submitted for community review",
        status: formData.status,
        country: formData.country,
        state: formData.state.trim() || null,
        linkedinUrl: formData.linkedinUrl.trim() || null,
        startDate: toYearMonth(workedFrom.month, workedFrom.year),
        endDate: formData.status === "retired" ? toYearMonth(workedUntil.month, workedUntil.year) : null,
        draftToken: draftTokenRef.current ?? undefined,
        review: {
          authorType,
          author: generatedName,
          overallRating:
            Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length,
          ratings: toApiRatings(ratings),
          managerCompany: formData.company.trim(),
          managerTitle: formData.title.trim(),
          text: null,
          workedFrom: toYearMonth(workedFrom.month, workedFrom.year),
          workedUntil: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
        },
      });

      const managerId = managerResponse.data.id;
      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["stats"] });
      queryClient.removeQueries({ queryKey: ["company-listing"] });

      localStorage.removeItem("rmm_pending_manager");
      sessionStorage.setItem("rmm_just_rated", "1");
      toast.success(`${formData.firstName} ${formData.lastName} submitted for review!`, {
        description: "An admin will review it shortly.",
      });
      navigate(`/manager/${managerId}`);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to submit manager and review";
      if (error?.response?.status === 401) {
        setErrors([]);
        setAuthFlowStep("signin");
      } else if (
        (error?.response?.data?.error === "already_reviewed_this_role" ||
          error?.response?.data?.error === "role_limit_reached") &&
        autoSubmitStatusRef.current === "success" &&
        autoSavedManagerIdRef.current != null
      ) {
        // Auto-save already saved this review; navigate instead of showing a confusing error
        sessionStorage.setItem("rmm_just_rated", "1");
        navigate(`/manager/${autoSavedManagerIdRef.current}`);
      } else {
        setErrors([apiMessage]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step meta ─────────────────────────────────────────────────────────────
  const steps: AddBossStep[] = ["info", "timeline", "ratings"];
  const stepIdx = steps.indexOf(step) + 1;
  const stepTitles: Record<AddBossStep, string> = {
    info: "Manager information",
    timeline: "Work timeline",
    ratings: "Rate your experience",
  };

  const handleBack = () => {
    setErrors([]);
    if (step === "ratings") setStep("timeline");
    else if (step === "timeline") setStep("info");
    else navigate(returnTo);
  };

  const handleClose = () => {
    localStorage.removeItem("rmm_pending_manager");
    navigate(returnTo);
  };

  const isLastStep = step === "ratings";
  const nextDisabled =
    (step === "info"     && !step1Valid) ||
    (step === "timeline" && !step2Valid) ||
    (step === "ratings"  && (unratedCount > 0 || isSubmitting));

  const managerName = `${formData.firstName} ${formData.lastName}`.trim() || "New Manager";

  return (
    <>
      <Layout>{/* page beneath overlay */}</Layout>

      {/* Stepped overlay */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-w-[60px]"
          >
            {step !== "info" && <ArrowLeft size={16} aria-hidden="true" />}
            {step === "info" ? "Cancel" : "Back"}
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{stepTitles[step]}</p>
            <p className="text-xs text-muted-foreground">Step {stepIdx} of 3 · {managerName}</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 min-w-[60px] flex justify-end"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted/60">
          <div
            className="h-1 bg-primary transition-all duration-300"
            style={{ width: `${Math.round(stepIdx * 100 / 3)}%` }}
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

            {/* Draft banner */}
            {showDraftBanner && step === "info" && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-6">
                <p className="text-sm text-foreground">
                  <span className="font-medium">Draft Restored.</span> Pick up where you left off.
                </p>
                <button type="button" onClick={clearDraft}
                  className="flex-shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors">
                  Start fresh
                </button>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 mb-6">
                <div className="flex gap-3">
                  <AlertCircle className="flex-shrink-0 text-destructive" size={20} />
                  <div className="text-sm text-destructive">
                    <p className="font-semibold mb-2">Please fix the following:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      {errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Manager Information ───────────────────────────────── */}
            {step === "info" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-[22px] font-semibold text-foreground">Who is this manager?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Enter their name, title, and company. An admin will review the submission before it goes live.</p>
                </div>



                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">First Name *</label>
                    <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange}
                      placeholder="e.g., Satya" maxLength={50}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Last Name *</label>
                    <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange}
                      placeholder="e.g., Nadella" maxLength={50}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Title *</label>
                    <input type="text" name="title" value={formData.title} onChange={handleInputChange}
                      placeholder="e.g., Engineering Manager" maxLength={100}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Company *</label>
                    <CompanyAutocomplete
                      value={formData.company}
                      onChange={val => { touch(); setFormData(prev => ({ ...prev, company: val })); if (errors.length > 0) setErrors([]); }}
                      placeholder="e.g., Microsoft"
                      name="company"
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {formData.company.trim().length === 1 && (
                      <p className="mt-1 text-xs text-amber-600">Company name must be at least 2 characters</p>
                    )}
                  </div>
                </div>

                {/* Country + State — read-only chip when pre-filled, editable on request */}
                <div className="space-y-4">
                  {formData.country && !editingLocation ? (
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                          <p className="text-sm font-medium text-foreground">
                            {COUNTRIES.find(c => c.value === formData.country)?.flag ?? ""} {formData.country}
                            {formData.state ? `, ${formData.state}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingLocation(true)}
                          className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        >
                          Edit location
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Country *</label>
                        <select
                          name="country"
                          value={formData.country}
                          onChange={e => { touch(); setFormData(prev => ({ ...prev, country: e.target.value })); if (errors.length > 0) setErrors([]); }}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Select a country</option>
                          {COUNTRIES.map(c => (
                            <option key={c.value} value={c.value}>{c.flag} {c.value}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">State / Province</label>
                        <input
                          type="text"
                          name="state"
                          value={formData.state}
                          onChange={e => { touch(); setFormData(prev => ({ ...prev, state: e.target.value })); }}
                          placeholder="e.g. Ontario"
                          maxLength={100}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      {formData.country && editingLocation && (
                        <button
                          type="button"
                          onClick={() => setEditingLocation(false)}
                          className="text-xs text-primary hover:underline"
                        >
                          Done editing
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-3">Manager Status *</label>
                  <div className="space-y-2">
                    <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${formData.status === "active" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/5"}`}>
                      <input type="radio" name="status" value="active" checked={formData.status === "active"} onChange={() => handleStatusChange("active")} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-foreground">Currently Active</p>
                        <p className="text-xs text-muted-foreground">Manager is actively leading</p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${formData.status === "retired" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/5"}`}>
                      <input type="radio" name="status" value="retired" checked={formData.status === "retired"} onChange={() => handleStatusChange("retired")} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-foreground">Retired / No longer in this role</p>
                        <p className="text-xs text-muted-foreground">Manager has stepped down or left</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Work Timeline ─────────────────────────────────────── */}
            {step === "timeline" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-[22px] font-semibold text-foreground">Work timeline</h2>
                  <p className="mt-1 text-sm text-muted-foreground">When did you work with {formData.firstName || "this manager"}?</p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">From *</p>
                    <DateSelects label="From" value={workedFrom} onChange={v => { touch(); setWorkedFrom(v); }} />
                    {showRevFrom && <RuleList rules={revFromRules} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">To{!currentlyWorking ? " *" : ""}</p>
                    <div className="flex gap-3 items-start flex-wrap">
                      {!currentlyWorking && (
                        <div>
                          <DateSelects label="To" value={workedUntil} onChange={v => { touch(); setWorkedUntil(v); }} />
                          {showRevUntil && <RuleList rules={revUntilRules} />}
                        </div>
                      )}
                      {formData.status !== "retired" && (
                        <label className="flex items-center gap-2 text-sm mt-1 cursor-pointer text-foreground">
                          <input
                            type="checkbox"
                            checked={currentlyWorking}
                            onChange={e => {
                              touch();
                              setCurrentlyWorking(e.target.checked);
                              if (e.target.checked) setWorkedUntil({ month: "", year: "" });
                            }}
                            className="w-4 h-4"
                          />
                          Current
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Ratings ───────────────────────────────────────────── */}
            {step === "ratings" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-[22px] font-semibold text-foreground">Rate {formData.firstName || "this manager"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Rate them on each dimension. All 10 categories are required.</p>
                </div>

                {/* Rating progress */}
                <div className="rounded-lg bg-primary/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Progress</p>
                    <p className="text-sm font-semibold text-primary">
                      {Object.values(ratings).filter(r => r > 0).length} / {RATING_CATEGORIES.length}
                    </p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(Object.values(ratings).filter(r => r > 0).length / RATING_CATEGORIES.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Author type */}
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


                {/* About your review */}
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

                {/* Ratings */}
                <div className="space-y-6">
                  {RATING_CATEGORIES.map((category) => (
                    <div key={category} className="border-b border-border pb-6 last:border-b-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <label className="block text-sm font-semibold text-foreground">{category} *</label>
                        <StarRating
                          value={ratings[category] || 0}
                          onChange={(value) => handleRatingChange(category, value)}
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
        <div className="border-t border-border bg-background px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-3">
            {showReadyBanner && isLastStep && (
              <div ref={readyBannerRef} className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                <Check size={16} className="flex-shrink-0" />
                You're signed in. Your review is ready to submit.
              </div>
            )}
            <button
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={nextDisabled}
              className={`w-full rounded-lg px-6 py-3 font-semibold text-sm transition-all ${
                !nextDisabled
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              } ${showReadyBanner && isLastStep ? "ring-2 ring-primary ring-offset-2 animate-pulse" : ""}`}
            >
              {isLastStep
                ? isSubmitting ? "Submitting..." : user ? "Submit Review" : "Continue to Sign In"
                : "Next"}
            </button>
          </div>
        </div>


      </div>

      {authFlowStep && (
        <AuthFlowModal
          initialStep={authFlowStep}
          initialEmail={authFlowEmail}
          autoSubmit={!fromVerified}
          onAuthenticated={() => {
            setAuthFlowStep(null);
            setPendingVerificationEmail("");
            setPendingEmailVerified(false);
            setFromVerified(false);
            setStep("ratings");
            if (unratedCount === 0) setShowReadyBanner(true);
          }}
          onVerifyEmailReached={(email) => setPendingVerificationEmail(email)}
          onClose={() => { setAuthFlowStep(null); setFromVerified(false); }}
        />
      )}
    </>
  );
}
