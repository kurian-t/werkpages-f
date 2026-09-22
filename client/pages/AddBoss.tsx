import API_BASE from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { StarRating } from "@/components/StarRating";
import { AlertCircle, Check, X, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { validateProfileUrl, generateUsername } from "@/lib/validators";
import { COUNTRIES } from "@/lib/countries";
import { LocationValue, EMPTY_LOCATION, declaredPayload, orUserGeo } from "@/lib/location";
import { fetchGeo } from "@/lib/geo";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { FormSubjectCard } from "@/components/RatingFormParts";
import {
  ManagerIdentityFields, WorkTimelineFields, RuleList,
  type ManagerField, type MonthYear, type Rule, type RuleState,
} from "@/components/ManagerFormFields";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { useCompanySelection } from "@/hooks/useCompanySelection";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import type { User } from "@/contexts/AuthContext";

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;


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

// ── Main page ─────────────────────────────────────────────────────────────────

type AddBossStep = "info" | "timeline" | "ratings";

export default function AddBoss() {
  const navigate = useNavigate();
  const { user, setUser, refreshUser } = useAuth();

  /*
    After a successful submission, re-read the account rather than assuming what it unlocked.

    This used to flip hasContributed locally, on the reasoning that a submitted rating always
    counts. That stopped being true when ratings could be withheld pending verification: a rating
    held by the server unlocked the whole site in the browser anyway, because the client had
    already decided the answer. Asking costs one request on a path somebody reaches once.
  */
  const markContributed = () => { void refreshUser(); };
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  /**
   * Where cancelling should land you.
   *
   * An explicit ?returnTo wins, because a caller that knows exactly where you came from (the
   * company profile passes its own slug) can say so. Most entry points don't - the header, the
   * directory, a manager profile and half a dozen others just link to /add - and defaulting all
   * of those to /directory dumped people somewhere they had never been.
   *
   * So the fallback is genuine history. React Router stamps the first entry of a session with
   * location.key "default", which is how we tell "you navigated here from somewhere in the app"
   * apart from "you opened this URL directly" - going back from a direct load would leave the
   * site entirely.
   */
  const explicitReturnTo = searchParams.get("returnTo");
  const canGoBack = location.key !== "default";
  const leaveForm = () => {
    if (explicitReturnTo) navigate(explicitReturnTo);
    else if (canGoBack) navigate(-1);
    else navigate("/directory");
  };
  const [authFlowStep, setAuthFlowStep] = useState<AuthFlowStep | null>(null);
  const [authFlowEmail, setAuthFlowEmail] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pendingEmailVerified, setPendingEmailVerified] = useState(false);

  const [step, setStep] = useState<AddBossStep>("info");
  // First-hand-experience attestation. Required before any review is persisted - including the
  // silent auto-save below, which would otherwise store a review the user never attested to.
  const [attested, setAttested] = useState(false);

  /*
    No `company` here, deliberately.

    It used to live in both this object and `useCompanySelection`, and only the selection reaches
    the server - the request's `company` is built from it, while the field on screen rendered this
    copy. Arriving from a company page filled one and left the other empty, so the form displayed
    "Discord", passed its own validation, and submitted nothing; the reader was told the company
    was missing while looking straight at it.

    Seeding both fixed that instance. Keeping two copies is what allowed it, so there is now one:
    `companySelection` owns the company, and everything here reads it from there.
  */
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    title: "",
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
      // Remembered so a later change of country can tell "still what we detected" from "somebody
      // picked somewhere else", which is what decides whether the detected state still applies.
      setDetectedCountry(geo.country ?? null);
      setFormData(prev => ({
        ...prev,
        country: prev.country || geo.country,
        state: prev.state || (geo.state ?? ""),
      }));
      // The visible, editable value. Shown in full so that submitting it unchanged is a
      // confirmation rather than an inference - which is what lets it be published at all.
      setWorkLocation(prev => orUserGeo(prev, geo));
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
  /*
    One slot, not one flag per field. Every populated field collapses to a line with a pencil, and
    exactly one may be open at a time - two half-edited fields on screen is how somebody loses the
    one they were not looking at.
  */
  const [openField, setOpenField] = useState<ManagerField | null>(null);
  // The location the person will actually submit. Prefilled from geo below, shown to them
  // in full, and therefore confirmed by submitting it unchanged.
  const [workLocation, setWorkLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);

  const [authorType] = useState<"anonymous">("anonymous");
  const [generatedName, setGeneratedName] = useState(() => generateUsername());

  const [errors, setErrors] = useState<string[]>([]);

  // Owns the company identity and the rule that typing invalidates it, so this form no longer
  // carries its own copy of either. formData keeps the text, because the form's validation,
  // drafts and session restore all read it from there.
  /*
    The company, owned here and nowhere else.

    Seeded from the query string so arriving from a company page - /add?company=Discord - fills it.
    Everything on this form reads the company from this selection: the field, the validation, the
    draft, and all three request bodies.
  */
  const companySelection = useCompanySelection(searchParams.get("company") ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const readyBannerRef = useRef<HTMLDivElement>(null);
  const ghostCaptureAttemptedRef = useRef(false);
  const autoSubmitStatusRef = useRef<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const autoSavedManagerIdRef = useRef<number | null>(null);
  /*
    The same id, in state, so it reaches the draft.

    The draft has to record that a manager was already written, or a reload would auto-save a
    second one. The ref cannot do that job on its own: it does not re-render, so the effect that
    writes the draft never sees it change.
  */
  const [autoSavedManagerId, setAutoSavedManagerId] = useState<number | null>(null);
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
  const companyValid   = companySelection.name.trim().length >= 2;
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
    setFormData({ firstName: "", lastName: "", title: "", country: "", state: "", linkedinUrl: "", status: "active" });
    companySelection.clear();
    setWorkLocation(EMPTY_LOCATION);
    setRatings(initializeRatings());
    setAttested(false);
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
          if (data.formData) {
            /*
              The company comes from the URL, not from a stale draft.

              Arriving from a company page - "Rate a manager" - carries ?company=, and that is the
              company being added, so it fills the field. Clicking "Add Manager" from the nav
              carries nothing, and must give a clean field: somebody who abandoned a draft about
              Facebook last week and now wants to add someone elsewhere should not find Facebook
              waiting for them.

              An auth round-trip is the exception. There the draft *is* the in-flight form, and
              dropping its company would lose the thing the person had already chosen.
            */
            const isAuthReturn = isVerified || !!data.signupEmail;
            const { company: draftCompany, ...restOfDraft } = data.formData as Record<string, unknown>;
            setFormData(prev => ({ ...prev, ...restOfDraft }));
            /*
              The URL wins; otherwise the draft's company comes back with the rest of it.

              This used to restore the company ONLY on an auth round-trip, to stop a week-old
              abandoned draft about Facebook greeting somebody who clicked "Add Manager" to add
              someone else. But the name, the title and the ratings from that same draft were
              restored regardless - so the company was the one answer that vanished, which reads as
              a bug rather than as a considered clean slate, and a plain refresh lost it.

              Arriving with ?company= still takes precedence: that is a deliberate statement about
              which company is being added, and it is already seeded into the selection.
            */
            const companyFromUrl = searchParams.get("company");
            if (!companyFromUrl && typeof draftCompany === "string" && draftCompany) {
              companySelection.set(draftCompany, typeof data.companyId === "number" ? data.companyId : undefined);
            }
            // Where the work happened, as they left it. Never re-derived from visitor geography on
            // a restore - that would quietly move an answer somebody had already given.
            if (data.workLocation) setWorkLocation(data.workLocation);
          }
          if (data.ratings)     setRatings(data.ratings);
          if (data.workedFrom)  setWorkedFrom(data.workedFrom);
          if (data.step)        setStep(data.step);
          if (data.workedUntil) setWorkedUntil(data.workedUntil);
          if (data.currentlyWorking != null) setCurrentlyWorking(data.currentlyWorking);
          if (data.generatedName) setGeneratedName(data.generatedName);
          if (data.draftToken) draftTokenRef.current = data.draftToken;
          /*
            A manager was already written for this draft, before the reload. Recording it here
            stops the auto-save running a second time - it returns early unless the status is idle
            - and lets Submit go to the manager that exists rather than creating another.
          */
          if (data.autoSavedManagerId != null) {
            autoSavedManagerIdRef.current = data.autoSavedManagerId;
            setAutoSavedManagerId(data.autoSavedManagerId);
            autoSubmitStatusRef.current = "success";
          }
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
            // OAuth redirect remount - user already logged in, go straight to ready state
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
    const hasData = formData.firstName || formData.lastName || companySelection.name || formData.title ||
      Object.values(ratings).some(r => r > 0) || workedFrom.month;
    if (!hasData) return;
    localStorage.setItem("rmm_pending_manager", JSON.stringify({
      returnTo: "/add",
      // Written back under formData.company, where it has always lived on disk, so a draft saved
      // by an older build still restores and one saved here still opens in an older tab.
      formData: { ...formData, company: companySelection.name },
      /*
        The company's identity and the location, both of which were simply not saved.

        A refresh put the name back and left these two empty - so the company had to be picked
        again, and the location silently reverted to whatever the visitor's geography suggested.
        Anything the form asks for belongs in the draft; a draft that keeps only some of the
        answers is worse than one that keeps none, because the gaps are not obvious.
      */
      companyId: companySelection.id ?? null,
      workLocation,
      ratings,
      workedFrom, workedUntil, currentlyWorking,
      authorType, generatedName,
      step,
      ...(autoSavedManagerId != null ? { autoSavedManagerId } : {}),
      ...(draftTokenRef.current ? { draftToken: draftTokenRef.current } : {}),
      ...(pendingVerificationEmail ? { signupEmail: pendingVerificationEmail, emailVerified: pendingEmailVerified } : {}),
      savedAt: Date.now(),
    }));
  }, [formData, companySelection.name, companySelection.id, workLocation, ratings, workedFrom, workedUntil, currentlyWorking, authorType, generatedName, step, pendingVerificationEmail, pendingEmailVerified, autoSavedManagerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early ghost capture (works for all users, including unauthenticated) ─────
  useEffect(() => {
    if (!step1Valid || ghostCaptureAttemptedRef.current) return;
    ghostCaptureAttemptedRef.current = true;
    // Sends the picked ID, or resolves one first by creating the company explicitly. Either way
    // the server receives an identity rather than a name to interpret.
    void (async () => {
      axios.post(`${API_BASE}/api/managers/ghost`, {
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        ...(await companySelection.payload()),
        title: formData.title.trim(),
        country: formData.country,
        state: formData.state.trim() || null,
        ...declaredPayload(workLocation),
      }).catch(() => {});
    })();
  }, [step1Valid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save when all ratings filled ────────────────────────────────────
  // Fires silently as soon as the user completes all 10 categories while logged in.
  // Captures drop-offs where the user fills everything but never clicks Submit.
  useEffect(() => {
    if (step !== "ratings") return;
    if (!user) return;
    if (!attested) return;
    if (autoSubmitStatusRef.current !== "idle") return;
    const allRated = Object.values(ratings).every(r => r >= 1);
    if (!allRated) return;
    /*
      And the answers behind this step, which this never checked.

      Being on the ratings step is not proof of having walked through the earlier ones - a restored
      draft sets `step` directly, and drops the company on any visit that is not an auth
      round-trip. So ticking the attestation fired a background POST carrying an empty company, the
      server refused it with "Missing required fields", and the reader saw a validation failure
      naming a question that was two steps behind them and no longer on screen.

      This is the write; it has to hold the same bar as the button.
    */
    if (!step1Valid) return;
    const timelineComplete = revFromValid && revOrderValid && (currentlyWorking || revUntilValid);
    if (!timelineComplete) return;

    autoSubmitStatusRef.current = "pending";
    (async () => {
      try {
        const res = await axios.post(`${API_BASE}/api/managers`, {
          name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
          ...(await companySelection.payload()),
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
            managerCompany: companySelection.name.trim(),
            managerTitle: formData.title.trim(),
            text: null,
            workedFrom: toYearMonth(workedFrom.month, workedFrom.year),
            workedUntil: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
          },
        });
        autoSavedManagerIdRef.current = res.data.id;
        setAutoSavedManagerId(res.data.id);
        autoSubmitStatusRef.current = "success";
        markContributed();
        queryClient.removeQueries({ queryKey: ["managers-directory"] });
        queryClient.removeQueries({ queryKey: ["managers-top"] });
        queryClient.removeQueries({ queryKey: ["stats"] });
        queryClient.removeQueries({ queryKey: ["company-listing"] });
        queryClient.invalidateQueries({ queryKey: ["has-contributed"] });
        /*
          The draft stays.

          It used to be deleted here, the moment this background write succeeded - while the person
          was still sitting on the form with more to do. A reload after that point met an empty
          form and no way back to anything they had written, which is the one thing the draft
          exists to prevent.

          Finishing is what clears it: submitting, or closing the form deliberately. A silent write
          is neither. The id recorded above is what keeps a reload from creating a second manager -
          it comes back with the draft, and the effect above will not run again once it is set.
        */
      } catch {
        autoSubmitStatusRef.current = "failed";
      }
    })();
  }, [ratings, step, user?.id, attested]); // eslint-disable-line react-hooks/exhaustive-deps


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

  /*
    Each step's rules, named so that submit can run them too.

    They were inline in handleNext, which meant they only ever ran on the way forward. A person who
    reached the last step by any other route - a restored draft carries `step` - was submitted
    without them ever being checked.
  */
  const infoErrors = () => {
    const errs: string[] = [];
    if (!firstNameValid) errs.push("First name is required");
    if (!lastNameValid)  errs.push("Last name is required");
    if (!titleValid)     errs.push("Title is required");
    if (companySelection.name.trim().length === 0) errs.push("Company is required");
    else if (!companyValid) errs.push("Company must be at least 2 characters");
    if (!countryValid)   errs.push("Country is required");
    if (formData.linkedinUrl && !linkedinValid) {
      errs.push(validateProfileUrl(formData.linkedinUrl).error!);
    }
    return errs;
  };

  const timelineErrors = () => {
    const errs: string[] = [];
    if (!revFromValid) errs.push("Your start date is required and must not be in the future");
    if (!currentlyWorking && !revUntilValid) errs.push(formData.status === "retired" ? "Your end date is required" : "Your end date is required (or check 'Current')");
    if (!revOrderValid) errs.push("Your end date cannot be before your start date");
    return errs;
  };

  const handleNext = () => {
    setFormTouched(true);
    setErrors([]);
    if (step === "info") {
      const errs = infoErrors();
      if (errs.length > 0) { setErrors(errs); return; }
      setStep("timeline");
    } else if (step === "timeline") {
      const errs = timelineErrors();
      if (errs.length > 0) { setErrors(errs); return; }
      setStep("ratings");
    }
  };

  const handleSubmit = async () => {
    setFormTouched(true);
    setErrors([]);

    /*
      Re-check the steps behind this one, and go back to the first that is wrong.

      Reaching the ratings step is not proof the earlier ones were answered. A restored draft sets
      `step` directly, and it deliberately drops the company on any visit that is not an auth
      round-trip - so the form reopened two steps past the company question with the company blank
      and nothing on screen saying so. Submitting posted a body the server refused with "Missing
      required fields", a sentence that names nothing and points nowhere.

      The guard belongs here rather than in the restore alone: any future path that sets the step
      gets it for free, and the reader is told which answer is missing and shown the question.
    */
    const earlier = infoErrors();
    if (earlier.length > 0) { setErrors(earlier); setStep("info"); return; }
    const timeline = timelineErrors();
    if (timeline.length > 0) { setErrors(timeline); setStep("timeline"); return; }

    if (unratedCount > 0) {
      setErrors([`Please rate all categories (${unratedCount} remaining)`]);
      return;
    }

    if (!attested) {
      setErrors(["Please confirm you personally worked with or for this manager"]);
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
          ...(await companySelection.payload()),
          title: formData.title.trim(),
          country: formData.country,
          state: formData.state.trim() || null,
          ...declaredPayload(workLocation),
          status: formData.status,
          draftToken: draftTokenRef.current,
          review: {
            author: generatedName,
            overallRating: Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length,
            ratings: toApiRatings(ratings),
            managerCompany: companySelection.name.trim(),
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

    // Auto-save already captured the review - skip the re-submit and navigate directly
    if (autoSubmitStatusRef.current === "success" && autoSavedManagerIdRef.current != null) {
      markContributed();
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
        ...(await companySelection.payload()),
        title: formData.title.trim(),
        image: formData.firstName.trim().charAt(0).toUpperCase(),
        bio: "New manager submitted for community review",
        status: formData.status,
        country: formData.country,
        state: formData.state.trim() || null,
        ...declaredPayload(workLocation),
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
          managerCompany: companySelection.name.trim(),
          managerTitle: formData.title.trim(),
          text: null,
          workedFrom: toYearMonth(workedFrom.month, workedFrom.year),
          workedUntil: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
        },
      });

      const managerId = managerResponse.data.id;
      markContributed();
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
      /*
        The server's own words if it gave any, and our sentence if it did not.

        axios.message sat between the two, and it is always set - so on any failure without a
        message body the reader got "Request failed with status code 500" and the friendly fallback
        below it could never be reached. That string is for a log, not for somebody who has just
        spent five minutes filling in a form.
      */
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
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
        markContributed();
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
    else leaveForm();
  };

  const handleClose = () => {
    localStorage.removeItem("rmm_pending_manager");
    leaveForm();
  };

  const isLastStep = step === "ratings";
  const nextDisabled =
    (step === "info"     && !step1Valid) ||
    (step === "timeline" && !step2Valid) ||
    (step === "ratings"  && (unratedCount > 0 || !attested || isSubmitting));

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
            className="h-1 bg-[#2e0562] transition-all duration-300"
            style={{ width: `${Math.round(stepIdx * 100 / 3)}%` }}
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

            {/* Draft banner */}
            {showDraftBanner && step === "info" && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[#2e0562]/30 bg-[#2e0562]/5 px-4 py-3 mb-6">
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

                {/*
                  The shared block. The same component renders the fields on the review form, so a
                  field added here appears there with no further edits - which is the whole point of
                  having one form instead of three.
                */}
                <ManagerIdentityFields
                  value={{
                    firstName: formData.firstName,
                    lastName:  formData.lastName,
                    title:     formData.title,
                    company:   companySelection.name,
                    status:    formData.status,
                    location:  workLocation,
                  }}
                  onChange={next => {
                    touch();
                    if (next.location !== undefined) setWorkLocation(next.location);
                    // Company is pulled out rather than merged: the selection owns it, and writing
                    // a second copy into formData is exactly what let the two disagree.
                    const { location, company, ...rest } = next;
                    if (company !== undefined) companySelection.bind.onChange(company);
                    if (Object.keys(rest).length > 0) {
                      setFormData(prev => ({ ...prev, ...rest }));
                    }
                    if (errors.length > 0) setErrors([]);
                  }}
                  lockName={false}
                  open={openField}
                  onOpen={setOpenField}
                  onClose={() => setOpenField(null)}
                  companyId={companySelection.id}
                  companyName={companySelection.name}
                  onCompanyIdChange={companySelection.bind.onCompanyIdChange}
                  onCompanySuggestionSelect={companySelection.bind.onSuggestionSelect}
                  idPrefix="addboss"
                  companyHint={companySelection.name.trim().length === 1 ? (
                    <p className="mt-1 text-xs text-amber-600">Company name must be at least 2 characters</p>
                  ) : undefined}
                />
              </div>
            )}

            {/* ── Step 2: Work Timeline ─────────────────────────────────────── */}
            {step === "timeline" && (
              <div className="space-y-8">
                {/* The same timeline control the review form uses, so the same mistake produces
                    the same message on either page. */}
                <WorkTimelineFields
                  heading="Work timeline"
                  subheading={`When did you work with ${formData.firstName || "this manager"}?`}
                  from={workedFrom}
                  until={workedUntil}
                  current={currentlyWorking}
                  onFromChange={v => { touch(); setWorkedFrom(v); }}
                  onUntilChange={v => { touch(); setWorkedUntil(v); }}
                  onCurrentChange={v => { touch(); setCurrentlyWorking(v); }}
                  allowCurrent={formData.status !== "retired"}
                />
                {showRevFrom  && <RuleList rules={revFromRules} />}
                {showRevUntil && <RuleList rules={revUntilRules} />}
              </div>
            )}

            {/* ── Step 3: Ratings ───────────────────────────────────────────── */}
            {step === "ratings" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-[22px] font-semibold text-foreground">Rate {formData.firstName || "this manager"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Rate them on each dimension. All 10 categories are required.</p>
                </div>

                {/*
                  The ratings progress bar used to sit here - a count and a filled track over the
                  ten category rows.

                  Removed: no other form on the site carries one, and the rows themselves already
                  show the state plainly - each unrated one says "Required" beside its stars, and
                  the submit button stays disabled until none do. A second, larger restatement of
                  that was clutter above the thing it was describing.
                */}

                {/* Author type */}
                <div className="rounded-xl border border-border p-5 space-y-3">
                  <p className="text-sm font-semibold text-foreground">🔒 Posting Anonymously</p>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Your review will appear as:</p>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-foreground">{generatedName}</p>
                      <button type="button"
                        onClick={(e) => { e.preventDefault(); setGeneratedName(generateUsername()); }}
                        className="text-xs text-[#2e0562] hover:underline">
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

                {/* First-hand-experience attestation - required before the review can be submitted */}
                <div className="rounded-xl border border-border p-5">
                  <label className="flex items-start gap-3 cursor-pointer text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="attestation"
                      checked={attested}
                      onChange={e => { touch(); setAttested(e.target.checked); }}
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
                  ? "bg-[#2e0562] text-white hover:bg-[#2e0562]/90 cursor-pointer"
                  : "bg-[#c0b4d0] text-white cursor-not-allowed"
              } ${showReadyBanner && isLastStep ? "ring-2 ring-[#2e0562] ring-offset-2 animate-pulse" : ""}`}
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
