import API_BASE from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import { ManagerIdentityPicker } from "@/components/ManagerIdentityPicker";
import {
  roleAwareSubmissionEnabled,
  rateWithRole,
  autosaveRoleClaim,
  RateWithRoleRefused,
  RoleAwareDisabledError,
  type IdentitySelection,
  publicationNote,
} from "@/lib/roleAwareSubmission";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { StarRating } from "@/components/StarRating";
import { AlertCircle, Check, X, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAnalytics } from "@/hooks/useAnalytics";
import { consumePromptFollow } from "@/lib/contributionPrompt";
import { markJustAddedManager } from "@/lib/rateCompanyNudge";
import axios from "axios";
import { validateProfileUrl, generateUsername } from "@/lib/validators";
import { COUNTRIES } from "@/lib/countries";
import { LocationValue, EMPTY_LOCATION, declaredPayload, orUserGeo } from "@/lib/location";
import { isStep1Valid, step1Errors, type Step1Fields } from "@/lib/addManagerValidation";
import { fetchGeo } from "@/lib/geo";
import { AuthFlowModal } from "@/components/AuthFlowModal";
import { FormSubjectCard, HideDatesField } from "@/components/RatingFormParts";
import {
  ManagerIdentityFields, WorkTimelineFields, RuleList,
  type ManagerField, type MonthYear, type Rule, type RuleState,
} from "@/components/ManagerFormFields";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { useCompanySelection } from "@/hooks/useCompanySelection";
import type { AuthFlowStep } from "@/components/AuthFlowModal";
import type { User } from "@/contexts/AuthContext";
import { RequiredMark } from "@/components/FormFields";
import {
  DEFAULT_DRAFT_TTL_MS, MANAGER_DRAFT_KEY, adoptAnonymousDraft, adoptLegacyDraft,
  anonymousDraftOffer, draftSlot, takeAuthHandoff, takeExpiryNotice, withoutUnprovenEmail,
} from "@/lib/draftScope";

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

/*
  "identify" sits between info and timeline and exists ONLY in the role-aware flow.

  It is where the contributor says which human they mean. Without it the form guessed: it took the
  typed name, found candidates by exact company, compared by edit distance and attached the rating
  to whichever manager was within one edit. One person ended up with eight profiles and twenty-one
  people with two each, their reviews split between them.

  One extra screen is the whole cost of removing that guess, and on the common path it is one tap:
  "Is this who you worked for?" -> the job -> carry on.
*/
type AddBossStep = "info" | "identify" | "timeline" | "ratings";

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
  const { track } = useAnalytics();

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

  /*
    OFF BY DEFAULT, and the server has its own flag that 404s these endpoints independently. Both
    must be on for the new journey to run, and neither alone can expose it.

    `useState` rather than a bare call so one render cannot disagree with the next about which
    journey the contributor is in. Flipping mid-form would strand them on a step the other flow
    does not have.
  */
  const [roleAware] = useState(() => roleAwareSubmissionEnabled());
  /*
    The form's own identity, minted once per session and kept. Every autosave and the submission
    that finishes it carry the same value, which is what makes a repeat idempotent rather than a
    duplicate: the server upserts on it instead of inserting again.
  */
  const proposalKeyRef = useRef<string>(crypto.randomUUID());
  /* Monotonic, so an autosave in flight when a newer one lands cannot win on arrival. */
  const revisionRef = useRef<number>(1);
  const [identity, setIdentity] = useState<IdentitySelection | null>(null);
  /* The server's flag is off: fall back to the legacy journey rather than showing a failure. */
  const [roleAwareUnavailable, setRoleAwareUnavailable] = useState(false);
  /*
    The identify step was skipped because the search conclusively found nobody.

    Kept so Back can skip it too. Reset whenever the typed identity changes, because the next
    search is a different question and may well have candidates in it.
  */
  const [skippedIdentify, setSkippedIdentify] = useState(false);
  const useRoleAware = roleAware && !roleAwareUnavailable;
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
      /*
        The detected country is kept ONLY to scope the location search - never to pre-fill the
        answer.

        This used to fill the form in, on the reasoning that showing a value made submitting it a
        confirmation rather than an inference. In practice people submit what is already there.
        IP geolocation puts somebody at their ISP's exchange, their VPN's exit, or an office they
        have never visited - so a pre-filled city is published as fact about a real manager on the
        strength of a guess about the person filling the form.

        Left empty and required instead: an answer somebody typed is worth more than one nobody
        disagreed with.
      */
      // ?? "" because /api/geo answers {"country": null} when the header is absent, and a null
      // here reaches formData.country, where anything calling .trim() on it throws.
      setFormData(prev => ({ ...prev, country: prev.country || (geo.country ?? "") }));
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
  // Opt-in, so an existing draft or an untouched form behaves exactly as it always has.
  const [datesHidden, setDatesHidden] = useState(false);
  const [formTouched, setFormTouched] = useState(false);
  /*
    THE DATE RULES BELONG TO THE DATE STEP, NOT TO THE WHOLE FORM.

    They were shown whenever `formTouched` was set, and that flips on the first keystroke of the
    manager's NAME - two steps earlier. So the work-timeline step opened already listing "Required"
    and "Not in the future" against fields the contributor had not been shown yet, which reads as
    the form telling somebody off for not having done something they had no chance to do. A refresh
    cleared the flag and the same screen came up clean, which is the inconsistency you saw.

    `datesTouched` is set by the date controls themselves: the rules appear when somebody starts
    answering, and the checkmarks then tell them they got it right.

    `datesAttempted` is separate and stricter. An empty field is only WRONG once they have tried to
    move on; before that it is simply unanswered, so "Required" waits as a hollow circle rather
    than shouting in red the moment they touch the first of two fields.
  */
  const [datesTouched, setDatesTouched] = useState(false);
  const [datesAttempted, setDatesAttempted] = useState(false);
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

  /*
    Arriving from a company page with that company already chosen.

    The name alone is not a choice. Step 1 validates the SELECTED company, so a name sitting in
    the box with no selection behind it left Next greyed out until the reader opened the field and
    edited it - having been sent there precisely so they would not have to.

    The id matters as much: without it the write resolves the company by name again, which is how
    a second row for a company that already exists gets minted. The logo is carried for the same
    reason the company is - it is already known, and the alternative is CompanyLogoImg guessing a
    domain from the name, which is the guess that put the wrong mark on Lime.
  */
  useEffect(() => {
    const name = searchParams.get("company");
    if (!name) return;
    const rawId = searchParams.get("companyId");
    const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : undefined;
    companySelection.set(name, id, searchParams.get("companyLogoUrl") ?? undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  /*
    PHASE 1. One attempt at THIS form, minted when the early capture first posts and held for the
    life of the form - through a reload and through the sign-in round trip, because it is saved in
    the draft below alongside draftToken.

    It is what lets the submission adopt the draft the capture left behind. The server used to find
    that draft by resemblance - same name, the captured company a prefix of the submitted one,
    under an hour old - which also described a stranger's half-typed namesake and handed their work
    to whoever submitted next.

    Three tokens, three different things, and they must not be conflated: captureToken is one
    attempt at adding a MANAGER, draftToken is one attempt at a RATING.
  */
  /*
    State rather than a ref, and that distinction is the whole of a bug this caught.

    A ref does not re-render, so the effect that writes the draft never ran again after the token
    was minted, and the token was posted to the server and then NOT saved. The round trip through
    sign-in is exactly when it is needed, and exactly when it would have been lost - so the next
    capture would have minted a second attempt and the submission could have adopted only one of
    the two drafts.
  */
  const [captureToken, setCaptureToken] = useState<string | null>(null);

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

  /* The rule itself lives in one testable place; see addManagerValidation for why. */
  const step1Fields: Step1Fields = {
    firstName: formData.firstName,
    lastName:  formData.lastName,
    title:     formData.title,
    companyName: companySelection.name,
    linkedinUrl: formData.linkedinUrl,
    // Required. A typed answer satisfies it, so the corpus being unable to offer the place - or
    // unreachable entirely - never blocks the form.
    location: workLocation,
  };
  /*
    THE COUNTRY IS NOT A FIELD ON THIS FORM ANY MORE.

    It was a <select>, replaced by LocationField, so formData.country is now set from ONE place:
    /api/geo. Gating on it meant that a visitor whose geography we cannot read - no Cloudflare
    header, a stripping proxy, a VPN - had Next permanently disabled on step 1 and a "Country is
    required" error pointing at a control that does not exist. There was no way out of the form.

    The country that matters is the one attached to the location somebody picked, and that travels
    with it. Nothing here needs to demand it separately.
  */
  const countryValid   = true;
  const linkedinValid  = !formData.linkedinUrl || validateProfileUrl(formData.linkedinUrl).valid;
  const unratedCount   = Object.values(ratings).filter(r => r < 1).length;

  const step1Valid = isStep1Valid(step1Fields);
  const step2Valid = isDateValid;

  // ── Rule builders ─────────────────────────────────────────────────────────
  const req = (val: number | null): RuleState =>
    val ? "met" : datesAttempted ? "violated" : "pending";
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

  const showRevFrom  = datesTouched || !!revFromVal;
  const showRevUntil = !currentlyWorking && (datesTouched || !!revUntilVal);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const DRAFT_TTL = DEFAULT_DRAFT_TTL_MS;   // 24 hours; see draftScope for why it was 12
  /*
    THE DRAFT BELONGS TO ONE PERSON, and until now this form did not ask which.

    It read "rmm_pending_manager", a key with no account in it, and poured whatever it found into
    whoever was looking. On any browser used by more than one person, the next visitor was shown
    the last one's answers - the ratings, the dates, the company, WHO the rating is about, the
    server-side draft and capture tokens, and the email address typed into the sign-up step - and
    the next thing this form does is publish them, under THEIR name.

    `useFormDraft` has scoped every draft by account since it was written, and its own comment says
    why: "a second account signing in was shown the first account's unfinished rating ... which is
    how one person's words would be published under another's name." This form does not use that
    hook, so it never got the fix. The decision now lives in draftScope and both use it.

    Scoped on `user?.id`, which AuthContext hydrates synchronously from storage on the first
    render, so it is already correct in the mount effect below rather than arriving a tick later.
  */
  /*
    A draft written before the key had an account in it is moved into the anonymous scope, once.

    Without this, shipping the scope would silently throw away every draft that was open in
    somebody's browser at the moment of the deploy: their answers would still be there, under a
    key nothing reads any more. A draft in progress is exactly what this whole mechanism exists to
    protect, so losing a batch of them on the way to protecting them would be its own small
    outage. `useFormDraft` has done the same thing, for the same reason, since it was written.
  */
  const legacyAdoptedRef = useRef(false);
  if (!legacyAdoptedRef.current) { legacyAdoptedRef.current = true; adoptLegacyDraft(MANAGER_DRAFT_KEY); }

  const managerDraft = draftSlot<any>(MANAGER_DRAFT_KEY, user?.id, { ttlMs: DRAFT_TTL });
  const [offeredDraft, setOfferedDraft] = useState<any | null>(null);
  const [draftExpired, setDraftExpired] = useState(false);

  const clearDraft = () => {
    managerDraft.clear();
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

  /*
    Applying a draft, separated from deciding whether it may be applied.

    The deciding is in the effect below and in draftScope; this is only the "put the answers back"
    half, which is unchanged. It is a function rather than inline because it now has two callers:
    the mount effect, and the contributor accepting an offered draft.
  */
  const applyDraft = (data: any, isVerified: boolean) => {
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
              companySelection.set(
                draftCompany,
                typeof data.companyId === "number" ? data.companyId : undefined,
                typeof data.companyLogoUrl === "string" ? data.companyLogoUrl : undefined,
              );
            }
            // Where the work happened, as they left it. Never re-derived from visitor geography on
            // a restore - that would quietly move an answer somebody had already given.
            if (data.workLocation) setWorkLocation(data.workLocation);
          }
          if (data.ratings)     setRatings(data.ratings);
          if (data.workedFrom)  setWorkedFrom(data.workedFrom);
          // The form's identity first: a restored selection without it would submit as a new form.
          if (data.proposalKey) proposalKeyRef.current = data.proposalKey;
          // Before the step, so the identify step is never shown with nothing selected on it.
          if (data.identity)    setIdentity(data.identity);
          /*
            A DRAFT NEVER RESTORES PAST THE STEP IT HAS NO ANSWER FOR.

            Drafts saved before the role-aware journey existed - and any saved on the "none of
            these" path, which carries no identity - hold a step from the three-step journey. The
            step was restored as it stood, so the form opened on the WORK TIMELINE with nobody
            selected: the contributor never saw the new question, filled the rest in, and was
            refused at submit with "choose the person you worked for" about a screen they had
            never been shown.

            It is also how this looked like "the flag did nothing". Anybody who had used the form
            before had a draft, so /add kept opening two steps in and the redesign appeared not to
            be there at all.

            Clamping rather than discarding: every answer they gave is kept, and the one question
            with no answer in the draft is the one they are put on.
          */
          const restoredStep: AddBossStep | undefined = data.step;
          const needsIdentity = useRoleAware && !data.identity
            && (restoredStep === "timeline" || restoredStep === "ratings");
          if (restoredStep)     setStep(needsIdentity ? "identify" : restoredStep);
          if (data.workedUntil) setWorkedUntil(data.workedUntil);
          if (data.currentlyWorking != null) setCurrentlyWorking(data.currentlyWorking);
          if (data.datesHidden != null) setDatesHidden(data.datesHidden);
          /*
            THE ATTESTATION, which was simply not saved - and it is the one that made the form
            unsubmittable.

            `nextDisabled` on the ratings step is `unratedCount > 0 || !attested || isSubmitting`.
            So a round trip restored the name, the company, the dates, the ratings and the
            selection, reset this to false, and left the only control on the page inert and grey
            with nothing on screen saying why. Reported from production: somebody filled the whole
            form, signed in, came back and pressing Submit did nothing at all.

            This is the fourth answer kept outside the draft and lost on the one load that
            matters - the capture token, the autosave writeId and the identity selection were the
            same shape, each with its own comment above. It is an answer the person gave, so it
            belongs in the draft exactly like the ratings beside it.

            Restoring it is not attesting on their behalf: the box was ticked by them, in this
            flow, and the draft is that flow in progress. Nothing auto-submits on the strength of
            it; the submit guard still re-checks it.
          */
          if (typeof data.attested === "boolean") setAttested(data.attested);
          if (data.generatedName) setGeneratedName(data.generatedName);
          if (data.draftToken) draftTokenRef.current = data.draftToken;
          if (data.captureToken) setCaptureToken(data.captureToken);
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
  };

  useEffect(() => {
    const isVerified = searchParams.get("verified") === "true";

    /*
      WHOSE DRAFT IS THIS?

      Their own scope is theirs by construction, because only a signed-in session writes there. So
      it is restored as it always was.

      An anonymous draft is OFFERED. Always, with no exceptions, and there were two: a draft whose
      `signupEmail` matched the signed-in address, and a load carrying `?verified=true`. Both were
      wrong for the same reason. An anonymous draft has no identity on it to check, and everything
      that looked like proof was written by whoever had the browser: localStorage by anybody who
      can reach it, a query parameter by anybody who can type. A draft that merely NAMES the next
      person's address is exactly what somebody leaving a rating on a shared machine would write.
    */
    let data = managerDraft.take();
    let viaAuthHandoff = false;
    if (data) {
      data = withoutUnprovenEmail(data, { accountEmail: user?.email });
    } else if (user?.id) {
      /*
        AN AUTH ROUND-TRIP IS NOT AN OFFER. It is this form's own in-flight work coming back.

        The paragraph above is right that nothing inside a draft can prove whose it is. But the
        case it rules out and the case below are not the same case. This contributor filled the
        form in seconds ago, in THIS TAB, and the form itself sent them to Auth0; the marker was
        written by the redirect as the page unloaded and dies with the tab. A stranger sitting
        down at a shared machine opens a new tab, carries no marker, and still gets the offer.

        Without this they came back signed in to an EMPTY form and had to click a banner to get
        their own answers back - which, per CLAUDE.md section 44, is indistinguishable from the
        work having been thrown away. Section 44's whole point is that it never is.

        takeAuthHandoff() consumes the marker, so a remount cannot adopt twice.
      */
      viaAuthHandoff = takeAuthHandoff();
      if (viaAuthHandoff) {
        const taken = adoptAnonymousDraft<any>(MANAGER_DRAFT_KEY, user.id, DRAFT_TTL);
        if (taken) data = withoutUnprovenEmail(taken, { accountEmail: user?.email });
      } else {
        const anon = anonymousDraftOffer<any>(MANAGER_DRAFT_KEY, user.id, DRAFT_TTL);
        if (anon) setOfferedDraft(anon);
      }
    }

    // `isVerified || viaAuthHandoff`: both ARE auth round-trips, and applyDraft keys the company
    // restore and the ready-to-submit banner off that, so a sign-in has to count as one too.
    if (data) applyDraft(data, isVerified || viaAuthHandoff);
    /*
      Said rather than left to be inferred. A form that opens empty is indistinguishable from one
      that threw the answers away, and "it expired" is the one thing that explains it. Read after
      the restore, because reading it is what clears it.
    */
    if (takeExpiryNotice(MANAGER_DRAFT_KEY, user?.id)) setDraftExpired(true);
    if (isVerified) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The contributor says an anonymous draft is theirs. Nothing is applied until they do. */
  const acceptOfferedDraft = () => {
    if (!user?.id) return;
    const taken = adoptAnonymousDraft<any>(MANAGER_DRAFT_KEY, user.id, DRAFT_TTL);
    setOfferedDraft(null);
    /*
      The address goes through the same guard as any other restore. Accepting an offer says "these
      answers are mine"; it is not a reason to show whoever clicked it an email address that may
      belong to somebody else.
    */
    if (taken) applyDraft(withoutUnprovenEmail(taken, { accountEmail: user?.email }), false);
  };

  /** They say it is not. It stays in the anonymous scope rather than being destroyed here. */
  const declineOfferedDraft = () => setOfferedDraft(null);

  /*
    ONE PAYLOAD, built in one place, because it is now written from two.

    The effect keeps the draft current as somebody types. `persistDraftNow` writes the same
    payload SYNCHRONOUSLY, immediately before the form sends them away to authenticate, which the
    effect cannot do: an effect runs after the render that follows a state change, so a handler
    that navigates in the same tick leaves with the newest keystroke unsaved. Social sign-in
    already leaves this page, and after Stage 4 every sign-in will.
  */
  const buildDraftPayload = () => ({
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
      /*
        THE COMPANY'S MARK, not just its name and id.

        The draft kept the name and the id and dropped the logo, so a restored form showed the
        employer as a grey initial - a company the form had already identified well enough to draw,
        reduced to "M". Re-deriving it from the name is not an option: this product deliberately
        never guesses a domain from a company name, because the guess is confidently wrong often
        enough to show a different company's logo.
      */
      companyLogoUrl: companySelection.logoUrl ?? null,
      workLocation,
      ratings,
      workedFrom, workedUntil, currentlyWorking, datesHidden,
      // Gates Submit, so a draft without it comes back unsubmittable. See applyDraft.
      attested,
      authorType, generatedName,
      /*
        THE FORM'S OWN IDENTITY, which is what makes a retry a retry.

        proposalKey lived in a useRef, so every page load minted a fresh one - and signing in IS a
        page load. The server then had no way to know the returning submission was the same form,
        which on path 3 meant it created a SECOND pending manager. Issue 34: the server-side fix
        resolves the manager from the claim this key identifies, and that only engages if the key
        survives the round trip.

        Third time this exact shape has bitten: the capture token (issue 32) and the autosave
        writeId were both stable identities held in a ref and lost on the one load that mattered.
      */
      proposalKey: proposalKeyRef.current,
      /*
        THE SELECTION, which was simply not saved.

        Everything else about the form survived the signup round trip - the name, the company, the
        ratings, the dates - and the one answer that did not was the most consequential one: WHO
        the rating is about. The form came back complete, refused to submit, and sent the person
        back to the identify step to choose the person again.

        It is restored as it was stored, not re-resolved. A selection that has gone stale while
        they were signing up is refused by the server with isStale, and that already sends them
        back to choose again - so a stale restore degrades to exactly the behaviour there was
        before, while a fresh one saves them redoing the choice.
      */
      identity,
      step,
      ...(autoSavedManagerId != null ? { autoSavedManagerId } : {}),
      ...(draftTokenRef.current ? { draftToken: draftTokenRef.current } : {}),
      ...(captureToken ? { captureToken } : {}),
      ...(pendingVerificationEmail ? { signupEmail: pendingVerificationEmail, emailVerified: pendingEmailVerified } : {}),
  });

  const draftHasAnswers = () => Boolean(
    formData.firstName || formData.lastName || companySelection.name || formData.title ||
    Object.values(ratings).some(r => r > 0) || workedFrom.month);

  /** Writes the draft right now, for a caller that is about to navigate. */
  const persistDraftNow = () => {
    if (!draftHasAnswers()) return;
    managerDraft.write(buildDraftPayload());
  };

  useEffect(() => {
    persistDraftNow();
  }, [formData, companySelection.name, companySelection.id, workLocation, ratings, workedFrom, workedUntil, currentlyWorking, datesHidden, attested, authorType, generatedName, identity, step, pendingVerificationEmail, pendingEmailVerified, autoSavedManagerId, captureToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early ghost capture (works for all users, including unauthenticated) ─────
  useEffect(() => {
    /*
      THE ROLE-AWARE JOURNEY CREATES NOTHING BY TYPING.

      This effect publishes a provisional manager the moment the first step validates, so merely
      entering a name put a profile in the directory. Removing fuzzy attachment while keeping this
      would have swapped one source of duplicate profiles for another: identification is read-only,
      and a manager is created only when the contributor explicitly says "none of these".

      The legacy journey keeps it exactly as it was. Nothing about the old path changes here.
    */
    if (useRoleAware) return;
    if (!step1Valid || ghostCaptureAttemptedRef.current) return;
    ghostCaptureAttemptedRef.current = true;
    // Sends the picked ID, or resolves one first by creating the company explicitly. Either way
    // the server receives an identity rather than a name to interpret.
    // Minted once per form session and kept: the same value goes to every capture this form
    // makes and to the submission that finishes it.
    const attempt = captureToken ?? crypto.randomUUID();
    if (!captureToken) setCaptureToken(attempt);
    void (async () => {
      axios.post(`${API_BASE}/api/managers/ghost`, {
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        ...(await companySelection.payload()),
        title: formData.title.trim(),
        country: workLocation.country || formData.country,
        state: formData.state.trim() || null,
        ...declaredPayload(workLocation),
        // However many times this fires for one form session, the server writes one manager for
        // it, and the submission below adopts exactly that one.
        captureToken: attempt,
      }).catch(() => {});
    })();
  }, [step1Valid, useRoleAware]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    ROLE-AWARE AUTOSAVE: the SELECTION, not the rating.

    The legacy autosave below posts the whole contribution to POST /api/managers, which runs the
    fuzzy attachment, so it is switched off in this journey. This replaces the part worth keeping:
    if somebody picks the right person and then reloads, signs in, or comes back tomorrow, the
    choice they already made is still there.

    DEBOUNCED, because it fires on every keystroke in the timeline step otherwise, and each save is
    a write. REVISION MONOTONIC and the server's answer wins: it may hold a newer number than ours
    if another tab got there first, and adopting it is what stops two tabs fighting.

    It STOPS once the claim is finalized. After submission the claim is a saved observation, and a
    tab left open must not rewrite the assertion behind a published rating. The server refuses it
    anyway; stopping here means we also stop asking.
  */
  const claimFinalizedRef = useRef(false);
  useEffect(() => {
    if (!useRoleAware) return;
    if (claimFinalizedRef.current) return;
    // Nothing to draft until they have chosen a person: a claim cannot exist before the manager.
    if (!identity || identity.kind === "proposeManager") return;

    const handle = setTimeout(() => {
      revisionRef.current += 1;
      void autosaveRoleClaim({
        proposalKey: proposalKeyRef.current,
        revision: revisionRef.current,
        managerId: identity.managerId,
        selectedRoleId: identity.kind === "existing" ? identity.roleId : null,
        /* The claim describes the employment that will be submitted, for the same reason. */
        title: (identity.kind === "existing"
          ? identity.employment.title ?? formData.title
          : formData.title).trim(),
        company: (identity.kind === "existing"
          ? identity.employment.company
          : companySelection.name)?.trim() || null,
        companyId: (identity.kind === "existing"
          ? identity.employment.companyId
          : companySelection.id) ?? null,
        startDate: toYearMonth(workedFrom.month, workedFrom.year),
        endDate: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
        stillThere: currentlyWorking,
      })
        .then(result => {
          if (result.finalized) claimFinalizedRef.current = true;
          // The server's number, not ours. See above.
          if (typeof result.revision === "number") {
            revisionRef.current = Math.max(revisionRef.current, result.revision);
          }
        })
        // Silent: autosave is a safety net, and a failed one must never interrupt somebody
        // mid-form. The submission is what reports failure, because that is the act.
        .catch(() => {});
    }, 800);
    return () => clearTimeout(handle);
  }, [useRoleAware, identity, formData.title, companySelection.name, companySelection.id,
      workedFrom, workedUntil, currentlyWorking]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save when all ratings filled ────────────────────────────────────
  // Fires silently as soon as the user completes all 10 categories while logged in.
  // Captures drop-offs where the user fills everything but never clicks Submit.
  useEffect(() => {
    /*
      NOT IN THE ROLE-AWARE JOURNEY, and a Playwright test is what found this.

      This autosave posts the whole contribution to POST /api/managers as soon as the tenth rating
      is filled - and that endpoint runs findFuzzyNameMatch and attaches the rating to whichever
      manager is within one edit of the typed name. So in the new journey, simply completing the
      ratings reached the fuzzy attachment silently, no matter what the contributor had explicitly
      selected two screens earlier. The identity protection would have been bypassed by the very
      feature meant to protect the contribution.

      The legacy journey keeps it unchanged. The role-aware equivalent is a revision-guarded
      role-claim autosave, which is not written yet, so the new journey currently has NO autosave
      rather than the wrong one. That is a deliberate gap and it is reported as such: a missing
      safety net costs somebody a retype, while this one cost correct attribution.
    */
    if (useRoleAware) return;
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
          country: workLocation.country || formData.country,
          linkedinUrl: formData.linkedinUrl.trim() || null,
          startDate: toYearMonth(workedFrom.month, workedFrom.year),
          endDate: formData.status === "retired" ? toYearMonth(workedUntil.month, workedUntil.year) : null,
          draftToken: draftTokenRef.current ?? undefined,
          captureToken: captureToken ?? undefined,
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
            datesHidden,
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
  /** Touching a date answers for the date rules, which nothing else on the form should trigger. */
  const touchDates = () => { touch(); if (!datesTouched) setDatesTouched(true); };

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
    // One rule, so the button and the message can never disagree about why.
    const errs: string[] = step1Errors(step1Fields);
    /*
      NOT a blocker, deliberately.

      It was one, and it cost a real submission: somebody filled the whole form and could not
      send it. Two things have to both work for a required location to be fair - the field has to
      start empty, and the picker has to be able to answer - and only the first was true. A picker
      that returns nothing turns "required" into a form nobody can submit, and a contribution
      refused is a contribution lost.

      What protects anonymity is that the field is no longer PRE-FILLED with a guess from an IP
      address. Refusing the submission adds nothing to that, so it is gone.
    */
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
      // Entering the identify step is a fresh question, so no previous skip applies: this answer
      // may have candidates where the last one had none.
      setSkippedIdentify(false);
      setStep(useRoleAware ? "identify" : "timeline");
    } else if (step === "identify") {
      if (!identity) {
        setErrors(["Choose the person you worked for, or add them as someone new."]);
        return;
      }
      setStep("timeline");
    } else if (step === "timeline") {
      const errs = timelineErrors();
      // Trying to move on is what turns an unanswered date into a missing one.
      if (errs.length > 0) { setDatesAttempted(true); setErrors(errs); return; }
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
          country: workLocation.country || formData.country,
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
            datesHidden,
          },
        }).catch(() => {});
      }
      /*
        The answers are written BEFORE the auth flow opens, not by the effect that normally keeps
        the draft current. Social sign-in inside that modal leaves this page, and the effect has
        not run yet for whatever changed in this same tick.
      */
      persistDraftNow();
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
      managerDraft.clear();
      sessionStorage.setItem("rmm_just_rated", "1");
      markJustAddedManager();
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

    /*
      THE ROLE-AWARE SUBMISSION, AND THERE IS NO ROUTE FROM HERE INTO THE OLD ONE.

      Everything below this block posts to /api/managers, which runs findFuzzyNameMatch and
      attaches the rating to whichever manager is within one edit of the typed name. That is the
      behaviour this phase removes, so a role-aware submission must never reach it - not on an
      error, not on a timeout, not as a "retry the old way".

      A failure therefore sets an error and RETURNS, leaving every answer and the selection exactly
      where they were. A submission somebody can retry is recoverable; a rating silently filed
      against the wrong human is not.
    */
    if (useRoleAware) {
      if (!identity) {
        setErrors(["Choose the person you worked for before submitting."]);
        setIsSubmitting(false);
        setStep("identify");
        return;
      }
      try {
        /*
          AN EXISTING EMPLOYMENT CARRIES ITS OWN EMPLOYER AND JOB TITLE.

          The payload took the company and title from the FIRST screen, which is where somebody
          typed the employer they were searching with - not necessarily the employer of the job
          they went on to pick. Choose a job at a different company and the server was asked for
          that role at the typed company, found nothing, and answered "The employment you selected
          is no longer available. Choose again." The employment was fine; we had described it
          wrongly.

          It also stops `payload()` creating a company row for a name that was only ever a search
          term.

          The two propose paths keep the typed values on purpose: there, what was typed IS the
          proposal.
        */
        const chosen = identity.kind === "existing" ? identity.employment : null;
        const companyPayload = chosen
          ? { company: chosen.company ?? "", companyId: chosen.companyId ?? null }
          : await companySelection.payload();
        const submittedTitle = (chosen?.title ?? formData.title).trim();
        const result = await rateWithRole(
          {
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            title: submittedTitle,
            ...companyPayload,
            // Null on both "propose" paths, and NEVER filled in with a guess: an absent role id
            // means "the employment is missing", which is what the contributor chose.
            managerId: identity.kind === "proposeManager" ? null : identity.managerId,
            selectedRoleId: identity.kind === "existing" ? identity.roleId : null,
            // Stable across autosaves and retries, which is what makes a repeat idempotent rather
            // than a second rating.
            proposalKey: proposalKeyRef.current,
            revision: revisionRef.current,
            startDate: toYearMonth(workedFrom.month, workedFrom.year),
            endDate: currentlyWorking ? null : toYearMonth(workedUntil.month, workedUntil.year),
            stillThere: currentlyWorking,
            status: formData.status,
            country: workLocation.country || formData.country,
            state: formData.state.trim() || null,
            author: generatedName,
            overallRating:
              Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length,
            ratings: toApiRatings(ratings),
          });

        markContributed();
        managerDraft.clear();
        sessionStorage.setItem("rmm_just_rated", "1");
        markJustAddedManager();
        toast.success(
          result.live
            ? `Your rating of ${formData.firstName} ${formData.lastName} is live.`
            : `Thanks. Your rating will appear once someone checks it.`,
          result.heldBecause ? { description: result.heldBecause } : undefined,
        );
        /*
          WHERE THEY LAND, and it is the profile in every case.

          This used to interpolate an empty string on the propose-manager path, because the client
          had no id for a manager it had just asked the server to create - so a completed
          contribution ended on /manager/ and a 404 page. The server now names the manager it
          wrote, and the profile shows "Profile under review. Awaiting admin approval before going
          public." exactly as the legacy journey does.

          The server's id is preferred over the selected one even when both exist: a replayed
          submission resolves to the manager the first attempt landed on, which is the one their
          rating is actually against.
        */
        const landOn = result.managerId
          ?? (identity.kind === "proposeManager" ? null : identity.managerId);
        if (landOn) navigate(`/manager/${landOn}`);
        else navigate("/");
        return;
      } catch (err) {
        if (err instanceof RateWithRoleRefused) {
          setErrors([err.message]);
          // A stale selection sends them back to choose again. Their answers are untouched.
          if (err.isStale) setStep("identify");
        } else if (err instanceof RoleAwareDisabledError) {
          setRoleAwareUnavailable(true);
          setErrors(["This form isn't available right now. Nothing you typed has been lost."]);
        } else {
          setErrors(["We couldn't save your rating. Nothing you typed has been lost."]);
        }
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const managerResponse = await axios.post(`${API_BASE}/api/managers`, {
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        ...(await companySelection.payload()),
        title: formData.title.trim(),
        image: formData.firstName.trim().charAt(0).toUpperCase(),
        bio: "New manager submitted for community review",
        status: formData.status,
        country: workLocation.country || formData.country,
        state: formData.state.trim() || null,
        ...declaredPayload(workLocation),
        linkedinUrl: formData.linkedinUrl.trim() || null,
        startDate: toYearMonth(workedFrom.month, workedFrom.year),
        endDate: formData.status === "retired" ? toYearMonth(workedUntil.month, workedUntil.year) : null,
        draftToken: draftTokenRef.current ?? undefined,
        captureToken: captureToken ?? undefined,
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
          datesHidden,
        },
      });

      const managerId = managerResponse.data.id;

      /*
        A MANAGER SOMEBODY ADDED ON PURPOSE, counted after the server returned its id.

        Distinct from the automatic ghost a search creates: the two arrive through different
        intents and different review paths, and one number covering both answers nothing. The
        early capture higher up this file is NOT this - that is a drop-off draft, fire-and-forget,
        and records a lead rather than a manager.
      */
      track("manager_created", { creation: "manual", source: "add_form", ...consumePromptFollow() });

      markContributed();
      queryClient.removeQueries({ queryKey: ["managers-directory"] });
      queryClient.removeQueries({ queryKey: ["managers-top"] });
      queryClient.removeQueries({ queryKey: ["stats"] });
      queryClient.removeQueries({ queryKey: ["company-listing"] });

      managerDraft.clear();
      sessionStorage.setItem("rmm_just_rated", "1");
      markJustAddedManager();
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
        persistDraftNow();        // same reason as the submit path: this can end in a redirect
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
        markJustAddedManager();
        navigate(`/manager/${autoSavedManagerIdRef.current}`);
      } else {
        setErrors([apiMessage]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step meta ─────────────────────────────────────────────────────────────
  const steps: AddBossStep[] = useRoleAware
    ? ["info", "identify", "timeline", "ratings"]
    : ["info", "timeline", "ratings"];
  const stepIdx = steps.indexOf(step) + 1;
  const stepTitles: Record<AddBossStep, string> = {
    info: "Manager information",
    // Their words, not ours. "Confirm the person" says what the screen is for without naming a
    // claim, a canonicalization or an employment resolution.
    identify: "Confirm the person",
    timeline: "Work timeline",
    ratings: "Rate your experience",
  };

  const handleBack = () => {
    setErrors([]);
    if (step === "ratings") setStep("timeline");
    /*
      BACK SKIPS WHAT FORWARD SKIPPED.

      When the search found nobody the identify step was never shown, and sending Back to it would
      run the same search, reach the same conclusion and push straight forward again - a Back
      button that does nothing, and no way to the name they typed. The question they can actually
      revise is on the information step, so that is where Back goes.
    */
    else if (step === "timeline") setStep(useRoleAware && !skippedIdentify ? "identify" : "info");
    else if (step === "identify") setStep("info");
    else leaveForm();
  };

  const handleClose = () => {
    managerDraft.clear();
    leaveForm();
  };

  const isLastStep = step === "ratings";
  const nextDisabled =
    (step === "info"     && !step1Valid) ||
    // Nothing is pre-selected, so there is nothing to continue with until they choose. The button
    // is disabled rather than hidden: an inert Continue is readable, a missing one is not.
    (step === "identify" && !identity) ||
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
            {/*
              steps.length, not 3. The role-aware journey has FOUR steps - the identify step sits
              between the information and the timeline - so a hardcoded 3 told the contributor
              "Step 2 of 3" while they were on the second of four, and would have said "Step 4 of
              3" on the last one. The legacy journey still has three and still reads as three.
            */}
            <p className="text-xs text-muted-foreground">
              Step {stepIdx} of {steps.length} · {managerName}
            </p>
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
          {/*
            THE PERSON-CHOOSING STEP IS WIDER THAN THE REST OF THE FORM.

            Every other step is one question at a time and reads best in a narrow column. This one
            is a comparison between people, and a comparison is only as good as how many of the
            things you can see at once. In a 672px column that is two cards; given the width the
            browse surfaces already use, it is four.

            Only while the choice is on screen: once somebody has picked a person, this is a form
            again and goes back to the column everything else uses.
          */}
          <div
            className={`mx-auto px-4 py-8 sm:px-6 ${
              /*
                The whole step, not just the half of it showing the comparison. Switching back the
                moment an identity was chosen resized the card being chosen, under the pointer that
                chose it - the outer padding changes with the container, so even a child pinned to
                the form column moved. The job screen pins its own width instead.
              */
              step === "identify" && !roleAwareUnavailable
                ? "max-w-6xl"
                : "max-w-2xl"
            }`}
          >

            {/* Draft banner */}
            {/*
              AN ANONYMOUS DRAFT, OFFERED RATHER THAN APPLIED.

              It deliberately says nothing about what is in it - no name, no company, no email -
              because the whole reason it is being offered is that this may not be the person who
              wrote it. Describing the contents would disclose them to exactly the visitor who
              should not see them.
            */}
            {/*
              A DRAFT EXPIRED, which is why this form is empty.

              It names no answer from it, and no address, and no company: whoever is reading this
              may not be whoever typed it. "There was one, and it is gone" is the whole message.
            */}
            {draftExpired && step === "info" && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3 mb-6">
                <p className="text-sm text-muted-foreground">
                  A saved draft expired, so this form has started fresh.
                </p>
                <button type="button" onClick={() => setDraftExpired(false)}
                  className="flex-shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors">
                  Dismiss
                </button>
              </div>
            )}

            {offeredDraft && step === "info" && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[#2e0562]/30 bg-[#2e0562]/5 px-4 py-3 mb-6">
                <p className="text-sm text-foreground">
                  <span className="font-medium">You have unfinished answers</span> from before you
                  signed in.
                </p>
                <div className="flex flex-shrink-0 gap-2">
                  <button type="button" onClick={acceptOfferedDraft}
                    className="rounded-md bg-[#2e0562] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#2e0562]/90 transition-colors">
                    Restore
                  </button>
                  <button type="button" onClick={declineOfferedDraft}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors">
                    Start fresh
                  </button>
                </div>
              </div>
            )}

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
                  /*
                    THE MANAGER'S STATUS IS NOT ASKED HERE IN THE ROLE-AWARE JOURNEY.

                    This screen exists to say WHO the manager is. Whether they still hold the job
                    is a fact about an employment, and the work-timeline step already asks it of
                    the employment the contributor actually picked. Asking it before the person is
                    even identified gets an answer about a manager nobody has chosen yet.

                    The legacy journey keeps it, because nothing else there collects it and that
                    journey is what production serves.
                  */
                  showStatus={!useRoleAware}
                  lockName={false}
                  open={openField}
                  onOpen={setOpenField}
                  onClose={() => setOpenField(null)}
                  companyId={companySelection.id}
                  companyName={companySelection.name}
                  companyLogoUrl={companySelection.logoUrl}
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
            {step === "identify" && roleAwareUnavailable && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">This form isn't available right now.</p>
                <p className="mt-1">
                  Nothing you've typed has been lost. Please try again in a few minutes.
                </p>
              </div>
            )}

            {step === "identify" && !roleAwareUnavailable && (
              <ManagerIdentityPicker
                firstName={formData.firstName.trim()}
                lastName={formData.lastName.trim()}
                /*
                  The selection owns the company, name and id both. formData deliberately holds no
                  second copy: a duplicate is what let the two disagree about which employer the
                  contributor meant.
                */
                company={companySelection.name?.trim() || null}
                companyId={companySelection.id ?? null}
                companyLogoUrl={companySelection.logoUrl ?? null}
                title={formData.title.trim() || null}
                value={identity}
                /*
                  The rating answers are NOT touched when the selection changes. They live in their
                  own state, so switching person or job keeps everything already typed - which is
                  the behaviour somebody expects after realising on the rating screen that they
                  picked the wrong Priya. The confirmation strip below then shows the new choice, so
                  the change is visible rather than silent.
                */
                onChange={setIdentity}
                /*
                  NOBODY TO CHOOSE BETWEEN, SO NOTHING IS ASKED.

                  A conclusively empty search means this screen has no question on it: the
                  contributor typed a name, nobody is listed under it, and the only available
                  answer is the one they already gave by typing it. Showing "we don't have them
                  yet - add them?" there is asking somebody to confirm a decision they have
                  already made, and on a form headed "Add a manager" it reads as a mistake.

                  So the selection is taken and the step is skipped. Nothing is created by this:
                  the proposed manager and employment are written when the rating is SUBMITTED,
                  which is the same for every path. The picker only calls this when the lookup
                  succeeded AND the scan was complete; a failure or a truncated scan still asks.
                */
                onNobodyFound={() => {
                  setIdentity({ kind: "proposeManager" });
                  setSkippedIdentify(true);
                  setStep("timeline");
                }}
                /*
                  THE SERVER SAYS THE FLOW IS OFF, AND WE DO NOT QUIETLY USE THE OLD ONE.

                  Falling back to the legacy journey here would be a silent downgrade into fuzzy
                  attachment: the contributor would carry on, the rating would be filed against
                  whichever manager was within one edit of the typed name, and nobody would learn
                  that the identity protection had not applied. A visible failure on a
                  misconfigured deployment is strictly better than an invisible wrong attribution.

                  This is only reachable when the two flags disagree, which is a deployment
                  mistake rather than a state a contributor can cause.
                */
                onUnavailable={() => setRoleAwareUnavailable(true)}
                /*
                  They saw the candidates and none was theirs. Straight on to the details, with
                  skippedIdentify left alone so Back returns to the list they just rejected.
                */
                onChooseNewManager={() => setStep("timeline")}
                /* Same destination the Back control uses from this step. */
                onEditEntry={() => setStep("info")}
              />
            )}

            {/*
              WHO THIS RATING IS ABOUT, on every screen after the choice.

              Shown because the contributor is about to write about a person and must be able to see
              which one at the moment they do it, not only on the screen where they chose. It also
              states plainly whether the rating publishes immediately, because "held for review"
              arriving afterwards reads as rejection.
            */}
            {/*
              NO CONFIRMATION STRIP ON THESE STEPS AT ALL.

              It restated a choice the contributor had just made, one screen earlier, and offered a
              second route back on a form whose header already has Back. On the new-manager path it
              was worse: there had been no list and no choice, so it echoed the name they typed two
              steps ago as though it were a decision to confirm.

              This is the rating flow. A confirmation nobody asked for is friction, and friction
              here costs submissions rather than mistakes - the choice is one Back away, visible,
              where they made it.
            */}
            {step === "timeline" && (
              <div className="space-y-8">
                {/*
                  WHAT WILL HAPPEN TO THIS RATING, SAID BEFORE IT IS WRITTEN.

                  This notice used to live on the confirmation strip above the questions. The
                  strip was removed because it restated a choice the contributor had just made,
                  but it was ALSO carrying this, which is a different thing entirely: a warning
                  that the rating will be held. Removing the strip orphaned it, and
                  `publicationNote` sat exported with no caller.

                  It belongs here rather than at submission. "Held for review" arriving after
                  somebody has written ten answers reads as rejection; arriving before they start
                  reads as the honest description of what happens next.
                */}
                {useRoleAware && identity && publicationNote(identity) && (
                  <p
                    data-testid="publication-note"
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
                  >
                    {publicationNote(identity)}
                  </p>
                )}
                {/* The same timeline control the review form uses, so the same mistake produces
                    the same message on either page. */}
                <WorkTimelineFields
                  heading="Work timeline"
                  subheading={`When did you work with ${formData.firstName || "this manager"}?`}
                  from={workedFrom}
                  until={workedUntil}
                  current={currentlyWorking}
                  onFromChange={v => { touchDates(); setWorkedFrom(v); }}
                  onUntilChange={v => { touchDates(); setWorkedUntil(v); }}
                  onCurrentChange={v => { touchDates(); setCurrentlyWorking(v); }}
                  allowCurrent={formData.status !== "retired"}
                />
                {showRevFrom  && <RuleList rules={revFromRules} />}
                {showRevUntil && <RuleList rules={revUntilRules} />}
                {/*
                  Offered where the dates are given, not buried on the ratings step: the moment
                  somebody types a period that could identify them is the moment to ask.
                */}
                <HideDatesField hidden={datesHidden} onChange={setDatesHidden} />
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
                        <label className="block text-sm font-semibold text-foreground">{category} <RequiredMark /></label>
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
              /*
                THE FORM'S ONE NAVIGATION CONTROL, addressable without guessing at its label.

                Its text changes with the step - "Next", "Submit Review", "Continue to Sign In" -
                so tests reached for it by matching /continue|next/i, which quietly also matched
                "Continue with a new Priya Raghunathan" on the identification step and resolved to
                two buttons. A test that cannot say which control it means is a test that will one
                day assert against the wrong one.
              */
              data-testid="form-next"
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
