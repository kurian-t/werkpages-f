import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { AlertCircle, ArrowLeft, Plus, Star, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { toast } from "sonner";
import API_BASE from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { RoleAutocomplete } from "@/components/RoleAutocomplete";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
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
  process: "About the interview",
  ratings: "Rate the experience",
};

/**
 * Add an interview experience - a routed page, matching how every other submission flow works.
 *
 * <p>Two steps rather than three: an interview is three conversations, not months of employment,
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
  const currentYear = new Date().getFullYear();

  const [step, setStep] = useState<Step>("process");
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
      return res.data as { name: string; slug?: string };
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
  const companyName = pickedCompany?.name ?? company?.name ?? "this company";

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
      rounds: [],
    });
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
      })
      .catch(() => {
        // Geo is a convenience. Failing to resolve it just means the field starts empty.
      });
    return () => { cancelled = true; };
  }, [editingId]);

  // Back to the interview tab specifically. Landing on "what it's like to work here" after
  // cancelling an interview review is a different half of the page from the one you left.
  const leaveForm = () => navigate(activeSlug ? `/companies/${activeSlug}?tab=hiring` : "/explore");

  const handleBack = () => {
    setErrors({});
    if (step === "ratings") setStep("process");
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
    setStep("ratings");
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

    setSubmitting(true);
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/api/interviews/${editingId}`, toInterviewPayload(draft), {
          withCredentials: true,
        });
      } else {
        await axios.post(
          `${API_BASE}/api/companies/${activeSlug}/interviews`,
          toInterviewPayload(draft),
          { withCredentials: true },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["company-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["has-interview-contributed"] });
      toast.success(editingId ? "Your interview experience has been updated." : "Thanks, your interview experience is live.");
      navigate(`/companies/${activeSlug}?tab=hiring`);
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

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-lg font-semibold text-foreground">Sign in to add an interview review</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Interview experiences are tied to an account so each person can post one per year.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/signin?returnTo=${companySlug ? `/companies/${companySlug}/add-interview` : "/add-interview"}`)}
            className="mt-4 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
          >
            Sign in
          </button>
        </div>
      </Layout>
    );
  }

  const stepIdx = STEPS.indexOf(step) + 1;
  const isLastStep = step === "ratings";
  const nextDisabled = !stepComplete || submitting;

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
              Step {stepIdx} of {STEPS.length} · {companyName}
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

            {step === "process" ? (
              <div className="space-y-8">
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    {pickedCompany || companySlug ? `Your interview at ${companyName}` : "Your interview"}
                  </h1>
                </div>

                {/*
                  Where the interview happened, editable even when the page was opened from a
                  company. Someone who came here to write about one company and remembered
                  another should not have to go and find it first.

                  Selection only - no create. Interview reviews never bring a company into
                  existence, so a name typed and not picked is not an answer, and the error says
                  so rather than silently submitting to nothing.
                */}
                <Field
                  label="Which company?"
                  required
                  error={errors.company}
                  hint="Pick from the list. You can only add an interview for a company already on Werkpages."
                >
                  <CompanyAutocomplete
                    value={companyText}
                    onChange={(v) => {
                      setCompanyText(v);
                      // Typing invalidates the pick, exactly as it does in the manager forms: the
                      // text and the company it refers to can never disagree.
                      setPickedCompany(null);
                    }}
                    onSuggestionPicked={(sug) => {
                      setCompanyText(sug.name);
                      setPickedCompany(sug.slug ? { name: sug.name, slug: sug.slug } : null);
                      setErrors((prev) => ({ ...prev, company: undefined }));
                    }}
                    onClear={() => { setCompanyText(""); setPickedCompany(null); }}
                    placeholder="Search companies"
                  />
                </Field>

                <Field
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
                </Field>

                <Field
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
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Year" required error={errors.interviewYear} htmlFor="interview-year">
                    <select
                      id="interview-year"
                      value={draft.interviewYear ?? ""}
                      onChange={(e) => update("interviewYear", Number(e.target.value))}
                      className={INPUT}
                    >
                      {interviewYearOptions(currentYear).map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Role" required error={errors.roleCategory} htmlFor="interview-role">
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
                  </Field>

                  <Field
                    label="Country"
                    required
                    htmlFor="interview-country"
                    hint={draft.city && draft.country === inferredCountry ? `Looks like ${draft.city}` : undefined}
                  >
                    <select
                      id="interview-country"
                      value={draft.country ?? ""}
                      onChange={(e) => update("country", e.target.value || null)}
                      className={INPUT}
                    >
                      <option value="">Select...</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.flag} {c.value}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="How long did it take?" required htmlFor="interview-length">
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
                  </Field>
                </div>

                {/*
                  An ordered list, not a count with one format. "Phone screen, then a panel, then a
                  VP conversation" is the shape someone wants to know before committing three
                  evenings - a count of 3 and the word "panel" throws away two thirds of that.
                */}
                <Field
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
                </Field>
              </div>
            ) : (
              <div className="space-y-8">
                <div>
                  <h1 className="text-xl font-bold text-foreground">How was the experience?</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rate each part of the process. All of them together are what make company
                    comparisons meaningful.
                  </p>
                </div>

                {/*
                  Overall sits inside the card with the rest, and last. Outside it read as a
                  separate question about something else; at the end it reads as the summary of
                  the parts just rated, which is what it is.
                */}
                <div className="space-y-6 rounded-xl border border-border bg-card p-5">
                  {INTERVIEW_CATEGORIES.map((category) => (
                    <Field key={category} label={CATEGORY_LABELS[category]} error={errors[category]}>
                      <Stars
                        value={draft[category] ?? null}
                        onChange={(value) => update(category, value)}
                        ariaLabelPrefix={CATEGORY_LABELS[category]}
                        size={24}
                      />
                    </Field>
                  ))}

                  <div className="border-t border-border pt-6">
                    <Field label="Overall" required error={errors.overallRating}>
                      <Stars
                        value={draft.overallRating}
                        onChange={(value) => update("overallRating", value)}
                        ariaLabelPrefix="Overall"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-2xl justify-end">
            <button
              type="button"
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={nextDisabled}
              className="rounded-xl bg-[#2e0562] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90 disabled:opacity-50"
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

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]";

function Field({
  label,
  children,
  error,
  hint,
  required,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Id of the control this labels. Without it the label is decoration, not a label. */
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

function Stars({
  value,
  onChange,
  ariaLabelPrefix,
  size = 28,
}: {
  value: number | null;
  onChange: (value: number) => void;
  ariaLabelPrefix: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered ?? value ?? 0);
        return (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(star)}
            aria-label={`${ariaLabelPrefix}: ${star} star${star === 1 ? "" : "s"}`}
            className="rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Star
              size={size}
              aria-hidden="true"
              className={`transition-colors ${filled ? "fill-amber-400 text-amber-400" : "text-border"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
