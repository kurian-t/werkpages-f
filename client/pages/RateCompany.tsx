import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Check, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyField } from "@/components/CompanyField";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { RatingInput, FormField } from "@/components/RatingInput";
import { AboutPanel, AnonymityCard, FormIntro, FormSubjectCard, RatingRow } from "@/components/RatingFormParts";
import { MonthYear, recentYears } from "@/components/MonthYear";
import { useAuth } from "@/hooks/useAuth";
import API_BASE from "@/lib/api";
import { companyPath } from "@/lib/urls";
import { generateUsername } from "@/lib/validators";
import {
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_HINTS,
  COMPANY_CATEGORY_LABELS,
  emptyCompanyRatingDraft,
  toCompanyRatingPayload,
  validateCompanyRating,
  type CompanyRatingDraft,
  type CompanyRatingErrors,
} from "@/lib/companyRatings";

/**
 * Rating a company as a workplace.
 *
 * Separate from the manager rating on purpose: they answer different questions, and a company
 * page shows both side by side precisely so they can disagree. Nothing here asks about a manager.
 *
 * Split into steps, the way a manager review is. Ten rating rows and a period on one page is a
 * wall; asked in two passes, people finish it. The name the rating is signed with sits at the top
 * of the first step rather than on a screen of its own - it is the thing somebody wants settled
 * before they start answering, not after the work is done.
 */

/** Ratings first, then when, then who it appears as - the manager review's own order. */
type Step = "ratings" | "dates";
const STEPS: Step[] = ["ratings", "dates"];

export default function RateCompany() {
  const { industrySlug, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  const [draft, setDraft] = useState<CompanyRatingDraft>(emptyCompanyRatingDraft());
  const [errors, setErrors] = useState<CompanyRatingErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [step, setStep] = useState<Step>("ratings");
  const [changingCompany, setChangingCompany] = useState(false);
  const [companyText, setCompanyText] = useState("");
  /*
    The handle this rating is signed with. Generated once on mount so it does not change under the
    reader while they fill the form in, and replaced only when they ask for another.
  */
  const [generatedName, setGeneratedName] = useState(() => generateUsername());

  const { data: company } = useQuery({
    queryKey: ["company-profile-slug", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/by-slug/${companySlug}`);
      return res.data as { name: string; slug?: string; logoUrl?: string; industrySlug?: string };
    },
    enabled: !!companySlug,
    retry: false,
  });

  // An existing rating pre-fills the form: revisiting means changing your answer, not starting
  // again, and one rating per person per company means this replaces rather than adds.
  const { data: mine } = useQuery({
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

  useEffect(() => {
    if (!mine || loadedExisting) return;
    // Editing keeps the name the rating already carries. A fresh one would make the same person
    // look like a different reviewer to anybody who had read it.
    if (mine.author) setGeneratedName(mine.author);
    setDraft({
      overallRating: mine.overallRating ?? null,
      ratings: mine.ratings ?? {},
      workedFrom: (mine.workedFrom ?? "").slice(0, 7),
      workedUntil: mine.workedUntil ? mine.workedUntil.slice(0, 7) : null,
      stillHere: !mine.workedUntil,
    });
    setLoadedExisting(true);
  }, [mine, loadedExisting]);

  const companyName = company?.name ?? "this company";
  /*
    Seeded once the company loads. The field is showing the company being rated, so it opens as
    that company rather than empty - and anything typed afterwards is the reader's, not overwritten
    by a later refetch.
  */
  const [companySeeded, setCompanySeeded] = useState(false);
  useEffect(() => {
    if (companySeeded || !company?.name) return;
    setCompanyText(company.name);
    setCompanySeeded(true);
  }, [company?.name, companySeeded]);

  /*
    Back where you came from, when the caller said where that was.

    Finishing a rating dropped everybody on the company page regardless of where they started -
    somebody who rated from the directory or from a manager's profile lost their place and had to
    navigate back. The company page is still the fallback, because a link typed by hand has no
    origin to return to.
  */
  const returnTo = searchParams.get("returnTo");
  const backToCompany = () =>
    navigate(
      returnTo && returnTo.startsWith("/")
        ? returnTo
        : companySlug
          ? companyPath(industrySlug ?? company?.industrySlug, companySlug)
          : "/companies",
    );

  const setRating = (category: (typeof COMPANY_CATEGORIES)[number], value: number) => {
    setDraft((prev) => ({ ...prev, ratings: { ...prev.ratings, [category]: value } }));
    setErrors((prev) => ({ ...prev, [category]: undefined }));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const found = validateCompanyRating(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (!user) {
      navigate(`/signin?returnTo=/companies/${companySlug}/rate`);
      return;
    }

    setSubmitting(true);
    try {
      /*
        The name travels with the rating.

        For a company already in the directory the slug resolves and this is ignored. For one the
        reader typed that we do not hold, it is what the server creates the company from - held for
        review rather than published. Sending it always means the form does not have to know which
        case it is in.
      */
      const namedCompany = companyText.trim() || companyName;
      await axios.post(
        `${API_BASE}/api/companies/${companySlug}/rating`,
        {
          ...toCompanyRatingPayload(draft),
          author: generatedName,
          ...(namedCompany && namedCompany !== "this company" ? { companyName: namedCompany } : {}),
        },
        { withCredentials: true },
      );
      /*
        Pull the session before going back, not after.

        Rating a workplace is what opens the workplace gate, and the gate lives on the account -
        so until the session is re-read the reader lands back on a page that still believes they
        have not contributed. Invalidating the profile alone did not help: the server shapes that
        response around the gate, so refetching it while the session still says "locked" just
        fetches the locked copy again. This is the write that unlocked it; it has to say so.
      */
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
      queryClient.invalidateQueries({ queryKey: ["my-company-rating", companySlug] });
      toast.success(`Thanks, your rating of ${companyName} is live.`);
      backToCompany();
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setSubmitError(
        status === 401 ? "Please sign in to rate a company."
        : status === 404 ? "We couldn't find that company."
        : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const years = recentYears();

  const stepIdx = STEPS.indexOf(step) + 1;
  const stepTitles: Record<Step, string> = {
    ratings:  "Rate your experience",
    dates:    "Work timeline",
  };

  /*
    The manager review's full-screen stepped form, not a page with a card on it. Same header bar
    with Back on the left and Close on the right, same centred step title, same progress rule, same
    full-width button at the foot. Two forms asking the same kind of thing on one site should not be
    two different shapes.
  */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <button
          onClick={() => {
            if (step === "ratings") backToCompany();
            else setStep(STEPS[STEPS.indexOf(step) - 1]);
          }}
          className="flex min-w-[60px] items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {step !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
          {step === "ratings" ? "Cancel" : "Back"}
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{stepTitles[step]}</p>
          <p className="text-xs text-muted-foreground">Step {stepIdx} of {STEPS.length} · {companyName}</p>
        </div>
        <button
          onClick={backToCompany}
          aria-label="Close"
          className="flex min-w-[60px] justify-end p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="h-1 bg-muted/60">
        <div
          className="h-1 bg-[#2e0562] transition-all duration-300"
          style={{ width: `${Math.round((stepIdx * 100) / STEPS.length)}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {step === "ratings" && (
          <div className="mb-6 space-y-6">
            <FormIntro
              title="Rate a Workplace"
              blurb="Takes just a minute. Your firsthand experience helps other job seekers make more informed decisions."
            />
            {/*
              What is being rated, named before anything is asked about it - the manager form's own
              card, with the company in place of the manager. Editable, because somebody who opened
              this from the wrong company should not have to go and find the right one first.
            */}
            {/*
                The shared company field.

                Hand-rolled here until now, and its summary showed `company?.name` - the company
                the URL loaded - rather than what had been typed. So changing to a company we do
                not hold appeared to revert: the typed name lived in local state the card never
                read. The shared component renders the value it is given, so what you typed is what
                you see.
            */}
            <CompanyField
              value={companyText}
              onChange={setCompanyText}
              logoUrl={company?.logoUrl}
                  logoUrlFor={company?.name}
              onSuggestionPicked={(sug) => {
                /*
                  A company already in the directory has its own rate page, and ratings belong to
                  the company whose page this is - so picking one navigates there. One we do not
                  hold stays as typed and is created with the rating, held for review.
                */
                if (sug.slug) navigate(`/companies/${sug.slug}/rate`);
                else setCompanyText(sug.name);
              }}
            />

            <AnonymityCard
              what="rating"
              name={generatedName}
              onRegenerate={() => setGeneratedName(generateUsername())}
            />
            <AboutPanel
              title="About your rating"
              summary="Your rating reflects your personal experience. All feedback is structured and opinion-based."
              points={[
                "One rating per person per company",
                "Rating again replaces what you wrote before",
                "No written reviews, only structured ratings",
              ]}
            />
          </div>
        )}

        {submitError && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="flex gap-3">
              <AlertCircle className="flex-shrink-0 text-destructive" size={20} aria-hidden="true" />
              <p role="alert" className="text-sm text-destructive">{submitError}</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {step === "ratings" && (
          <>
          <div className="space-y-3">
            {COMPANY_CATEGORIES.map((category) => (
              <RatingRow
                key={category}
                label={COMPANY_CATEGORY_LABELS[category]}
                hint={COMPANY_CATEGORY_HINTS[category]}
                value={draft.ratings[category] ?? null}
                onChange={(value) => setRating(category, value)}
              />
            ))}
          </div>

          {/*
            Asked, never derived. Somebody's summary judgement is not the mean of the ten above:
            "the pay was poor and it was chaotic, but I loved working there" is a real position,
            and an average erases exactly that.
          */}
          <div className="border-t border-border pt-6">
            <FormField
              label="Overall, how was working here?"
              hint="Your overall take, not an average of the ratings above."
              required
              error={errors.overallRating}
            >
              <RatingInput
                value={draft.overallRating}
                onChange={(value) => {
                  setDraft((prev) => ({ ...prev, overallRating: value }));
                  setErrors((prev) => ({ ...prev, overallRating: undefined }));
                }}
                ariaLabelPrefix="Overall"
              />
            </FormField>
          </div>
          </>
          )}

          {step === "dates" && (
          <>
          {/*
            When, because a company in 2019 says little about it now. Month precision: nobody
            remembers the day, and asking for one invites invention.
          */}
          <div className="border-t border-border pt-6">
            <FormField label="When did you work here?" required error={errors.workedFrom ?? errors.workedUntil}>
              <div className="flex flex-wrap items-center gap-2">
                <MonthYear
                  value={draft.workedFrom}
                  onChange={(v) => setDraft((prev) => ({ ...prev, workedFrom: v }))}
                  years={years}
                  label="Start"
                />
                <span className="text-sm text-muted-foreground">to</span>
                {draft.stillHere ? (
                  <span className="text-sm font-medium text-foreground">now</span>
                ) : (
                  <MonthYear
                    value={draft.workedUntil ?? ""}
                    onChange={(v) => setDraft((prev) => ({ ...prev, workedUntil: v }))}
                    years={years}
                    label="End"
                  />
                )}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.stillHere}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      stillHere: e.target.checked,
                      workedUntil: e.target.checked ? null : prev.workedUntil,
                    }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                I still work here
              </label>
            </FormField>
          </div>
          </>
          )}

          {/*
            Who it appears as. Word for word the manager review's identity step: the same lock, the
            same "will appear as", the same Regenerate, because it is the same promise being made.
          */}
        </div>

        {/*
          Back / Next, exactly as the manager review does it: the left control cancels on the first
          step and steps back everywhere else, so it never strands somebody on a screen they cannot
          leave. Validation runs per step - being sent back to the top to find one missing row is
          the thing that makes long forms get abandoned.
        */}
        {/* Full-width primary action at the foot, as the manager review has. The Back control
            lives in the header bar rather than beside it - one way out, in one place. */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              if (step === "dates") { void handleSubmit(); return; }
              // Only what this step asked about. A missing end date must not block the ratings
              // step, and an unrated category must not block the dates one.
              const found = validateCompanyRating(draft);
              const forStep = step === "ratings"
                ? Object.fromEntries(Object.entries(found).filter(([k]) => k !== "workedFrom" && k !== "workedUntil"))
                : Object.fromEntries(Object.entries(found).filter(([k]) => k === "workedFrom" || k === "workedUntil"));
              if (Object.keys(forStep).length > 0) { setErrors((prev) => ({ ...prev, ...forStep })); return; }
              setStep(STEPS[STEPS.indexOf(step) + 1]);
            }}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step !== "dates"
              ? "Next"
              : submitting
                ? "Submitting…"
                : mine ? "Update rating" : "Submit rating"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
