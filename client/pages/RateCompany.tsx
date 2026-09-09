import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Layout } from "@/components/Layout";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { RatingInput, FormField } from "@/components/RatingInput";
import { MonthYear, recentYears } from "@/components/MonthYear";
import { useAuth } from "@/hooks/useAuth";
import API_BASE from "@/lib/api";
import { companyPath } from "@/lib/urls";
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
 * One page rather than the interview form's two steps. Ten rows and a date is not enough to need
 * splitting, and every extra screen is somewhere to abandon.
 */

export default function RateCompany() {
  const { industrySlug, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [draft, setDraft] = useState<CompanyRatingDraft>(emptyCompanyRatingDraft());
  const [errors, setErrors] = useState<CompanyRatingErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(false);

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
  const backToCompany = () =>
    navigate(companySlug ? companyPath(industrySlug ?? company?.industrySlug, companySlug) : "/companies");

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
      await axios.post(
        `${API_BASE}/api/companies/${companySlug}/rating`,
        toCompanyRatingPayload(draft),
        { withCredentials: true },
      );
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

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <button
          onClick={backToCompany}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Back to {companyName}
        </button>

        <div className="mb-6 flex items-center gap-3">
          <CompanyLogoImg company={companyName} logoUrl={company?.logoUrl} sizeClass="h-12 w-12" eager />
          <div>
            <h1 className="text-xl font-bold text-foreground">How was working at {companyName}?</h1>
            {/* Says out loud what this is not, because the platform's other rating is about a person. */}
            <p className="text-sm text-muted-foreground">Not your manager. The company itself.</p>
          </div>
        </div>

        {submitError && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="flex gap-3">
              <AlertCircle className="flex-shrink-0 text-destructive" size={20} aria-hidden="true" />
              <p role="alert" className="text-sm text-destructive">{submitError}</p>
            </div>
          </div>
        )}

        <div className="space-y-6 rounded-xl border border-border bg-card p-5">
          {COMPANY_CATEGORIES.map((category) => (
            <FormField
              key={category}
              label={COMPANY_CATEGORY_LABELS[category]}
              hint={COMPANY_CATEGORY_HINTS[category]}
              required
              error={errors[category]}
            >
              <RatingInput
                value={draft.ratings[category] ?? null}
                onChange={(value) => setRating(category, value)}
                ariaLabelPrefix={COMPANY_CATEGORY_LABELS[category]}
                size={24}
              />
            </FormField>
          ))}

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
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={backToCompany} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-[#2e0562] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90 disabled:opacity-50"
          >
            {submitting ? "Saving..." : mine ? "Update rating" : "Submit rating"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
