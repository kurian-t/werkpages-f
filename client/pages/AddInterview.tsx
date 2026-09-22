import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Check, AlertCircle, ArrowLeft, Plus, Star, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { toast } from "sonner";
import API_BASE from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { RoleAutocomplete } from "@/components/RoleAutocomplete";
import { CollapsibleField } from "@/components/FormFields";
import { LocationField } from "@/components/LocationField";
import { AttestationCard } from "@/components/RatingFormParts";
import { LocationValue, EMPTY_LOCATION, declaredPayload, orUserGeo } from "@/lib/location";
import { MONTHS, YEARS, type MonthYear as MonthYearValue } from "@/components/ManagerFormFields";

/** "2024-06" as the shared timeline control holds it, and back again. */
const monthYearOf = (value: string | null | undefined): MonthYearValue => {
  const [year, month] = (value ?? "").split("-");
  return { month: month ?? "", year: year ?? "" };
};
const yearMonthString = (v: MonthYearValue) => (v.month && v.year ? `${v.year}-${v.month}` : "");
import { CompanyField } from "@/components/CompanyField";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { AboutPanel, AnonymityCard, FormIntro, FormSubjectCard, RatingRow } from "@/components/RatingFormParts";
import { generateUsername } from "@/lib/validators";
import { RatingInput, FormField } from "@/components/RatingInput";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
import { COUNTRIES } from "@/lib/countries";
import { fetchGeo } from "@/lib/geo";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  INTERVIEW_CATEGORIES,
  INTERVIEW_OUTCOMES,
  MAX_ROUNDS,
  ROUND_TYPES,
  ROUND_TYPE_LABELS,
  isStepComplete,
  OUTCOME_LABELS,
  PROCESS_LENGTHS,
  PROCESS_LENGTH_LABELS,
  interviewErrorMessage,
  interviewYearOptions,
  toInterviewPayload,
  validateInterviewDraft,
  type InterviewDraft,
  type InterviewDraftErrors,
  type InterviewOutcome,
  type ProcessLength,
  type RoundType,
} from "@/lib/interviews";

type Step = "process" | "ratings";

const STEPS: Step[] = ["process", "ratings"];
const STEP_TITLES: Record<Step, string> = {
  process:  "About the interview",
  ratings:  "Rate the experience",
};

/**
 * Add an interview experience - a routed page, matching how every other submission flow works.
 *
 * <p>Three steps, the same shape as a manager review and a workplace rating: what happened, how it
 * felt, and who it appears as. An interview is three conversations rather than months of
 * employment,
 * and a long form after a rejection does not get finished. Facts first, ratings second, because
 * the outcome is what makes the ratings interpretable.
 *
 * <p>Still structured-only, with no free-text field. An interview review naming an interviewer is
 * a defamation surface with no employment relationship behind it.
 */
export default function AddInterview() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  // Editing reuses this whole page rather than a second form: one set of fields, one set of
  // validation rules, no chance of the two drifting apart.
  const editingId = searchParams.get("edit");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  /* Links a captured draft to the submission that follows, so finishing the form removes it. */
  const draftTokenRef = useRef<string | null>(null);
  /* Which collapsible field is open. One slot, so two are never half-edited at once. */
  const [openField, setOpenField] = useState<"role" | "length" | "location" | null>(null);
  /** First-hand experience, confirmed before anything is stored. */
  const [attested, setAttested] = useState(false);
  /*
    The timeline control holds month and year separately; the draft holds one "YYYY-MM" string.
    Keeping the parts here is what lets a half-entered date survive: composing the string on every
    change turns "March, year not yet chosen" into "", which comes straight back as an empty
    control, so the selection never sticks and the end date stays disabled.
  */
  const [fromParts, setFromParts]   = useState<MonthYearValue>({ month: "", year: "" });

  const currentYear = new Date().getFullYear();

  const [step, setStep] = useState<Step>("process");
  const [changingCompany, setChangingCompany] = useState(false);
  /** Where the interviewing happened, on the same ladder every other contribution uses. */
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  /*
    The handle this experience is signed with. Generated once on mount so it does not change under
    the reader mid-form, and replaced only when they ask for another.
  */
  const [generatedName, setGeneratedName] = useState(() => generateUsername());
  const [draft, setDraft] = useState<InterviewDraft>({
    overallRating: null,
    outcome: null,
    interviewYear: currentYear,
    rounds: [],
  });
  const [loadedExisting, setLoadedExisting] = useState(false);
  // What geo said, kept so we can tell an inferred country from one the person chose.
  const [inferredCountry, setInferredCountry] = useState<string | null>(null);
  const [errors, setErrors] = useState<InterviewDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["company-profile-slug", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/by-slug/${companySlug}`);
      return res.data as { name: string; slug?: string; logoUrl?: string };
    },
    enabled: !!companySlug,
    retry: false,
  });

  /**
   * The company this interview is about.
   *
   * Seeded from the URL when you arrive from a company page, but not owned by it: requiring
   * someone to find a company and open its page before they can say anything about interviewing
   * there loses the contribution from everyone who did not start on that page.
   *
   * A slug, not a name. Interview reviews never create a company (see InterviewService), so the
   * only valid answer here is a company that already exists - and picking one from the list is
   * what proves that. Typed text that was never selected leaves this null and submission stops.
   */
  const [pickedCompany, setPickedCompany] = useState<{ name: string; slug: string } | null>(null);
  const [companyText, setCompanyText] = useState("");

  useEffect(() => {
    if (company?.name && company?.slug) {
      setPickedCompany({ name: company.name, slug: company.slug });
      setCompanyText(company.name);
    }
  }, [company?.name, company?.slug]);

  const activeSlug = pickedCompany?.slug ?? companySlug ?? null;
  /**
   * The company the headings name.
   *
   * Whatever the company field currently says. It used to be only the *picked* company, which was
   * right when the field lived on the second step and the heading was the sole statement of the
   * subject - a half-typed name in the heading would have claimed a company nobody had chosen.
   *
   * With the field on the same screen that reasoning inverts: typing a new name cleared the pick
   * and the heading collapsed from "Your interview at Google" to "Your interview" while the field
   * plainly read what had been typed. The heading now follows the field, and falls back to nothing
   * only when the field is genuinely empty.
   */
  const companyName = pickedCompany?.name ?? (companyText.trim() || null);

  const { data: stats } = useCompanyInterviews(companySlug ?? "");
  const existing = editingId ? stats?.myInterview ?? null : null;

  useEffect(() => {
    // Once only: after this the draft is whatever the person has typed, and re-applying the
    // server copy would undo their edits on every refetch.
    if (!existing || loadedExisting) return;
    setDraft({
      overallRating: existing.overallRating,
      communication: existing.communication,
      respectForTime: existing.respectForTime,
      roleClarity: existing.roleClarity,
      processFairness: existing.processFairness,
      nextStepTransparency: existing.nextStepTransparency,
      difficulty: existing.difficulty,
      outcome: existing.outcome,
      processLength: existing.processLength,
      roleCategory: existing.roleCategory,
      country: existing.country,
      city: existing.city,
      interviewYear: existing.interviewYear,
      interviewedFrom: existing.interviewedFrom ?? null,
      interviewedUntil: existing.interviewedUntil ?? null,
      /*
        The rounds that were recorded, not an empty list.

        This was hardcoded to [] while every other field above came from `existing`, so opening an
        experience to fix a typo silently emptied the rounds - and saving stored that emptiness
        back. The server has always returned them; only the form discarded them. Rounds are the one
        field here where order carries the meaning, and the most tedious to re-enter, which makes
        them the worst possible thing to quietly drop.
      */
      rounds: Array.isArray(existing.rounds) ? existing.rounds : [],
    });
    // The timeline control reads the parts, so an existing experience has to fill those too -
    // otherwise reopening one shows an empty period over a draft that has one.
    /*
      Rows written before the range existed have only a year. Showing January of it is what the
      migration backfilled server-side, and an empty period over an experience that plainly has a
      date reads as data loss.
    */
    setFromParts(monthYearOf(existing.interviewedFrom
      ?? (existing.interviewYear ? `${existing.interviewYear}-01` : null)));
    /*
      Experiences written before the ladder existed carry a bare country and nothing else. Showing
      it beats showing an empty field: the alternative reads as though the stored answer had been
      cleared, on a form whose whole job is to open with what is already there.
    */
    setLocation(existing.declaredPrecision ? {
      country: existing.declaredCountry ?? "",
      state:   existing.declaredState ?? "",
      city:    existing.declaredCity ?? "",
      precision: existing.declaredPrecision,
      companyLocationId: existing.companyLocationId ?? null,
      corpusPlace: null,
      label: "",
    } : existing.country ? {
      country: existing.country,
      state: "",
      city: existing.city ?? "",
      precision: existing.city ? "city" : "country",
      companyLocationId: null,
      corpusPlace: null,
      label: "",
    } : EMPTY_LOCATION);
    setLoadedExisting(true);
  }, [existing, loadedExisting]);

  const update = <K extends keyof InterviewDraft>(key: K, value: InterviewDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // The city came from the same lookup as the country. Once someone corrects the country to
      // something else, an inferred city almost certainly belongs to the old one, and silently
      // filing a Toronto city against a US role would be worse than filing no city at all.
      if (key === "country" && value !== inferredCountry) next.city = null;
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitError(null);
  };

  // Prefilled rather than asked for, the same way a manager's location already is. Only for a new
  // review: on an edit the stored answer is the truth, not wherever the person happens to be now.
  useEffect(() => {
    if (editingId) return;
    let cancelled = false;
    fetchGeo()
      .then((geo) => {
        if (cancelled || !geo?.country) return;
        setInferredCountry(geo.country);
        setDraft((prev) =>
          // Never overwrite something already chosen.
          prev.country ? prev : { ...prev, country: geo.country, city: geo.city ?? null },
        );
        /*
          The location field opens populated, shown in full and editable, so submitting it unchanged
          is a confirmation rather than an inference - the same rule the manager and workplace forms
          follow. A stored location is never overwritten.
        */
        setLocation(prev => orUserGeo(prev, geo));
      })
      .catch(() => {
        // Geo is a convenience. Failing to resolve it just means the field starts empty.
      });
    return () => { cancelled = true; };
  }, [editingId]);

  // Back to the interview tab specifically. Landing on "what it's like to work here" after
  // cancelling an interview review is a different half of the page from the one you left.
  /*
    Back where you came from, when the caller said where that was. The interview tab is the
    fallback: a link typed by hand has no origin to return to.
  */
  const returnTo = searchParams.get("returnTo");
  const leaveForm = () =>
    navigate(
      returnTo && returnTo.startsWith("/")
        ? returnTo
        : activeSlug
          ? `/companies/${activeSlug}?tab=hiring`
          : "/explore",
    );

  const handleBack = () => {
    setErrors({});
    if (step !== "process") { setStep(STEPS[STEPS.indexOf(step) - 1]); return; }
    else leaveForm();
  };

  // Gated on every field being answered, not just the ones the API demands. It costs the
  // contributor more effort and buys comparability: a corpus where half the reviews skipped
  // difficulty and most of the categories cannot be sliced usefully.
  const stepComplete = isStepComplete(draft, step);

  const handleNext = () => {
    const found = validateInterviewDraft(draft, currentYear);
    const stepOneErrors: InterviewDraftErrors = {};
    if (found.outcome) stepOneErrors.outcome = found.outcome;
    if (found.interviewYear) stepOneErrors.interviewYear = found.interviewYear;
    if (found.rounds) stepOneErrors.rounds = found.rounds;
    if (found.roleCategory) stepOneErrors.roleCategory = found.roleCategory;
    if (found.difficulty) stepOneErrors.difficulty = found.difficulty;
    // Only when the form owns the company. Arriving from a company page, it is already settled.
    if (!companySlug && !pickedCompany) stepOneErrors.company = "Choose a company from the list.";

    if (Object.keys(stepOneErrors).length > 0) {
      setErrors(stepOneErrors);
      return;
    }
    setErrors({});
    setStep(STEPS[STEPS.indexOf(step) + 1]);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const found = validateInterviewDraft(draft, currentYear);
    if (!companySlug && !pickedCompany) found.company = "Choose a company from the list.";
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // A problem with a step-one field is not visible from here, so go back to it.
      if (found.outcome || found.interviewYear || found.company) setStep("process");
      return;
    }

    /*
      The account is asked for here, at the end, and nowhere earlier.

      This page used to render a sign-in wall in place of the form, so a logged-out person never saw
      a single field - out of step with every other contribution form, and impossible to capture
      from: a form that never rendered has no answers to keep. Now they fill it in, and only the
      write needs an account.
    */
    if (!user) {
      if (!draftTokenRef.current) draftTokenRef.current = crypto.randomUUID();
      // Fire-and-forget: capturing is a courtesy to somebody already leaving, and must never be
      // the reason the redirect does not happen.
      void axios.post(`${API_BASE}/api/companies/${activeSlug}/interviews/draft`, {
        ...toInterviewPayload(draft),
        author: generatedName,
        ...declaredPayload(location),
        draftToken: draftTokenRef.current,
      }).catch(() => {});
      const back = companySlug ? `/companies/${companySlug}/add-interview` : "/add-interview";
      navigate(`/signin?returnTo=${encodeURIComponent(back)}`);
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/api/interviews/${editingId}`, { ...toInterviewPayload(draft), author: generatedName, ...declaredPayload(location) }, {
          withCredentials: true,
        });
      } else {
        await axios.post(
          `${API_BASE}/api/companies/${activeSlug}/interviews`,
          {
            ...toInterviewPayload(draft),
            author: generatedName,
            ...declaredPayload(location),
            // Deletes the draft this came from, so an admin does not review work that was finished
            // a minute later.
            ...(draftTokenRef.current ? { draftToken: draftTokenRef.current } : {}),
          },
          { withCredentials: true },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["company-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["has-interview-contributed"] });
      toast.success(editingId ? "Your interview experience has been updated." : "Thanks, your interview experience is live.");
      leaveForm();
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const code = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setSubmitError(interviewErrorMessage(status, code));
    } finally {
      setSubmitting(false);
    }
  };

  const stepIdx = STEPS.indexOf(step) + 1;
  const isLastStep = step === "ratings";
  // The attestation gates the final step only: it is a claim about the whole account, and asking
  // for it before the account exists would be asking somebody to vouch for a blank form.
  const nextDisabled = !stepComplete || submitting || (isLastStep && !attested);

  return (
    <>
      <Layout>{/* page beneath overlay */}</Layout>

      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <button
            onClick={handleBack}
            className="flex min-w-[60px] items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {step !== "process" && <ArrowLeft size={16} aria-hidden="true" />}
            {step === "process" ? "Cancel" : "Back"}
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{STEP_TITLES[step]}</p>
            <p className="text-xs text-muted-foreground">
              Step {stepIdx} of {STEPS.length}{companyName ? ` · ${companyName}` : ""}
            </p>
          </div>
          <button
            onClick={leaveForm}
            aria-label="Close"
            className="flex min-w-[60px] justify-end p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted/60">
          <div
            className="h-1 bg-[#2e0562] transition-all duration-300"
            style={{ width: `${Math.round((stepIdx * 100) / STEPS.length)}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
            {submitError && (
              <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="flex-shrink-0 text-destructive" size={20} aria-hidden="true" />
                  <p role="alert" className="text-sm text-destructive">{submitError}</p>
                </div>
              </div>
            )}

            {step === "process" && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    {companyName ? `Your interview at ${companyName}` : "Your interview"}
                  </h1>
                </div>

                {/*
                  Which company, asked first.

                  It used to sit on the ratings step - so somebody answered every question about a
                  process and only then chose, or changed, the company those answers were about.
                  The subject of a form belongs before the questions about it.
                */}
                <CompanyField
                  /* The form's own wording. CompanyField defaults to "Company", which is right on
                     the manager forms and vague here, where the company is the subject. */
                  label="Which company?"
                  value={companyText}
                  onChange={(v) => { setCompanyText(v); setPickedCompany(null); }}
                  onSuggestionPicked={(sug) => {
                    setCompanyText(sug.name);
                    setPickedCompany(sug.slug ? { name: sug.name, slug: sug.slug } : null);
                    setErrors((prev) => ({ ...prev, company: undefined }));
                  }}
                  logoUrl={company?.logoUrl}
                  logoUrlFor={company?.name}
                  hint={errors.company ? (
                    <p className="mt-1 text-xs text-red-600">{errors.company}</p>
                  ) : undefined}
                />


                {/*
                  Only when the company is not already known.

                  Arriving from a company page, the URL says which company and the heading above
                  says it too - putting an open autocomplete under that asks the reader to answer a
                  question the page has already answered, and it was the first thing on the screen.
                  The manager form never asks which manager you are rating for the same reason.

                  Selection only - no create. Interview reviews never bring a company into
                  existence, so a name typed and not picked is not an answer, and the error says
                  so rather than silently submitting to nothing.
                */}
                {/*
                  The second company picker that used to sit here is gone.

                  CompanyField above already asks this, unconditionally. This one rendered whenever
                  there was no company in the URL, so the form showed two company pickers at once -
                  and when there *was* one in the URL it rendered neither, leaving somebody who had
                  opened the wrong company with no way to correct it without navigating away. The
                  selection-only rule it documented still holds: CompanyField reports a pick, and a
                  name typed without picking is refused on submit, so an interview still cannot
                  bring a company into existence.
                */}

                <FormField
                  label="How did it end?"
                  required
                  error={errors.outcome}
                  hint="Ratings read very differently depending on the result, so we always show the split."
                >
                  <div className="flex flex-wrap gap-2">
                    {INTERVIEW_OUTCOMES.map((value) => (
                      <Chip
                        key={value}
                        selected={draft.outcome === value}
                        onClick={() => update("outcome", value as InterviewOutcome)}
                      >
                        {OUTCOME_LABELS[value]}
                      </Chip>
                    ))}
                  </div>
                </FormField>

                <FormField
                  label="How difficult was it?"
                  required
                  error={errors.difficulty}
                  hint="Difficulty isn't a complaint - a hard interview can be a good one, so this never affects ratings."
                >
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <Chip
                        key={level}
                        selected={draft.difficulty === level}
                        onClick={() => update("difficulty", draft.difficulty === level ? null : level)}
                      >
                        {DIFFICULTY_LABELS[level]}
                      </Chip>
                    ))}
                  </div>
                </FormField>

                {/*
                  One month, not a range.

                  A hiring process is measured in weeks - "how long did it take?" below already
                  records that - so a start and an end were two questions where the answer is
                  almost always the same month, and an end date nobody needed is an end date
                  somebody has to fill in. Stored as interviewed_from; interviewed_until stays null.

                  The parts are held here rather than composed into a string on every change: a
                  half-entered date turns into "" and comes straight back as an empty control.
                */}
                <div>
                  <p className="mb-2 block text-sm font-semibold text-foreground">
                    When did you interview here? <span className="text-red-500">*</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="From month"
                      value={fromParts.month}
                      onChange={e => {
                        const next = { ...fromParts, month: e.target.value };
                        setFromParts(next);
                        update("interviewedFrom", yearMonthString(next));
                      }}
                      className={INPUT_SM}
                    >
                      <option value="">Month</option>
                      {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select
                      aria-label="From year"
                      value={fromParts.year}
                      onChange={e => {
                        const next = { ...fromParts, year: e.target.value };
                        setFromParts(next);
                        update("interviewedFrom", yearMonthString(next));
                      }}
                      className={INPUT_SM}
                    >
                      <option value="">Year</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {errors.interviewYear && (
                    <p className="mt-2 text-xs text-red-600" role="alert">{errors.interviewYear}</p>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {/*
                    The same shell the manager form's fields use: an answer collapses to a line with
                    a pencil, and Done puts it back. This form used to render a bare box instead, so
                    the same question behaved differently depending on which page you were on.
                  */}
                  <CollapsibleField
                    id="interview-role"
                    label="Role"
                    required
                    display={draft.roleCategory ?? ""}
                    editing={openField === "role"}
                    onEditStart={() => setOpenField("role")}
                    onEditDone={() => setOpenField(null)}
                    onRestore={previous => update("roleCategory", previous)}
                    error={errors.roleCategory
                      ? <p className="mt-1 text-xs text-red-600">{errors.roleCategory}</p>
                      : undefined}
                  >
                    {/*
                      Same typeahead as the manager title field, drawing on the same vocabulary -
                      a role someone interviewed for and a manager's title are the same kind of
                      thing, and letting them diverge would defeat the normalization.
                    */}
                    <RoleAutocomplete
                      id="interview-role"
                      value={draft.roleCategory ?? ""}
                      onChange={(val) => update("roleCategory", val)}
                      maxLength={100}
                      placeholder="e.g. Engineering Manager"
                      className={INPUT}
                    />
                  </CollapsibleField>

                  {/*
                    The same location control every other contribution form uses, not a bare
                    country list. interview_reviews has carried the full declared ladder since V68
                    - country, state, city, and an exact workplace - and this form was throwing all
                    but the country away, so an interview could never be filed against the branch
                    it happened at while a review of a manager at the same company could.
                  */}
                  <LocationField
                    value={location}
                    onChange={setLocation}
                    companyName={companyName ?? undefined}
                    editing={openField === "location"}
                    onEditStart={() => setOpenField("location")}
                    onEditDone={() => setOpenField(null)}
                    id="interview-location"
                  />

                  {/*
                    A select collapses to its answer exactly as a text field does. The shell shows
                    the label and restores the stored value, which are different things here:
                    "2-4 weeks" is what a reader sees, "2_4_weeks" is what Cancel has to put back.
                  */}
                  <CollapsibleField
                    id="interview-length"
                    label="How long did it take?"
                    required
                    display={draft.processLength ? PROCESS_LENGTH_LABELS[draft.processLength] : ""}
                    value={draft.processLength ?? ""}
                    editing={openField === "length"}
                    onEditStart={() => setOpenField("length")}
                    onEditDone={() => setOpenField(null)}
                    onRestore={previous =>
                      update("processLength", (previous || null) as ProcessLength | null)}
                  >
                    <select
                      id="interview-length"
                      value={draft.processLength ?? ""}
                      onChange={(e) => update("processLength", (e.target.value || null) as ProcessLength | null)}
                      className={INPUT}
                    >
                      <option value="">Select…</option>
                      {PROCESS_LENGTHS.map((length) => (
                        <option key={length} value={length}>{PROCESS_LENGTH_LABELS[length]}</option>
                      ))}
                    </select>
                  </CollapsibleField>
                </div>

                {/*
                  An ordered list, not a count with one format. "Phone screen, then a panel, then a
                  VP conversation" is the shape someone wants to know before committing three
                  evenings - a count of 3 and the word "panel" throws away two thirds of that.
                */}
                <FormField
                  label="What were the rounds?"
                  error={errors.rounds}
                  hint="Optional - add them in the order they happened, if you remember."
                >
                  <div className="space-y-2">
                    {draft.rounds.map((type, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="w-16 flex-shrink-0 text-xs font-medium text-muted-foreground">
                          Round {index + 1}
                        </span>
                        <select
                          value={type}
                          onChange={(e) => update("rounds", replaceAt(draft.rounds, index, e.target.value as RoundType))}
                          className={INPUT}
                        >
                          {ROUND_TYPES.map((option) => (
                            <option key={option} value={option}>{ROUND_TYPE_LABELS[option]}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => update("rounds", removeAt(draft.rounds, index))}
                          aria-label={`Remove round ${index + 1}`}
                          className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ))}

                    {draft.rounds.length < MAX_ROUNDS && (
                      <button
                        type="button"
                        onClick={() => update("rounds", [...draft.rounds, "phone" as RoundType])}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-[#6d5091] hover:text-foreground"
                      >
                        <Plus size={15} aria-hidden="true" />
                        {draft.rounds.length === 0 ? "Add the first round" : "Add another round"}
                      </button>
                    )}
                  </div>
                </FormField>
              </div>
            )}

            {step === "ratings" && (
              <div className="space-y-8">
                <FormIntro
                  title="Rate an Interview"
                  blurb="Takes just a minute. Your firsthand experience helps other job seekers make more informed decisions."
                />
                <AnonymityCard
                  what="experience"
                  name={generatedName}
                  onRegenerate={() => setGeneratedName(generateUsername())}
                />
                <AboutPanel
                  title="About your experience"
                  summary="Your ratings reflect your personal experience. All feedback is structured and opinion-based."
                  points={[
                    "One experience per company per year",
                    "Difficulty is recorded separately and never affects ratings",
                    "No written reviews, only structured ratings",
                  ]}
                />

                {/*
                  Overall sits inside the card with the rest, and last. Outside it read as a
                  separate question about something else; at the end it reads as the summary of
                  the parts just rated, which is what it is.
                */}
                <div className="space-y-3">
                  {INTERVIEW_CATEGORIES.map((category) => (
                    <RatingRow
                      key={category}
                      label={CATEGORY_LABELS[category]}
                      value={draft[category] ?? null}
                      onChange={(value) => update(category, value)}
                    />
                  ))}
                  <RatingRow
                    label="Overall"
                    value={draft.overallRating}
                    onChange={(value) => update("overallRating", value)}
                  />
                </div>
                {/*
                  The same attestation the manager and workplace forms ask, in this one's own
                  words. Every rating form publishes somebody's account of a real process; asking
                  on one and not the others meant the same claim was made under three different
                  standards.
                */}
                <AttestationCard checked={attested} onChange={setAttested}>
                  I confirm that I personally interviewed with this company, and these ratings
                  reflect my own experience and perceptions.
                </AttestationCard>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 sm:px-6">
          {/* Full width, as the manager review and the workplace rating both are. A small button
              in the corner of a full-screen form reads as an afterthought next to the one thing
              the screen is asking you to do. */}
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={nextDisabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLastStep ? (submitting ? "Saving…" : "Share experience") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/* The month/year pair, sized like the same pair on the other forms. */
const INPUT_SM =
  "rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";


function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
        selected
          ? "bg-[#2e0562] text-white"
          : "border border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

