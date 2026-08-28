import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { X, Star } from "lucide-react";
import API_BASE from "@/lib/api";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  INTERVIEW_CATEGORIES,
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
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
  type InterviewType,
  type ProcessLength,
} from "@/lib/interviews";

interface InterviewReviewFormProps {
  companySlug: string;
  companyName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

/**
 * Structured-only interview review form.
 *
 * There is no free-text field, deliberately. An interview review naming an interviewer is a
 * defamation surface with no employment relationship behind it, and structured answers keep every
 * response comparable. Six ratings, one required outcome, and a handful of facts about the
 * process — short enough that someone who was just rejected will still finish it.
 */
export function InterviewReviewForm({
  companySlug,
  companyName,
  onClose,
  onSubmitted,
}: InterviewReviewFormProps) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [draft, setDraft] = useState<InterviewDraft>({
    overallRating: null,
    outcome: null,
    interviewYear: currentYear,
  });
  const [errors, setErrors] = useState<InterviewDraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof InterviewDraft>(key: K, value: InterviewDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const found = validateInterviewDraft(draft, currentYear);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(
        `${API_BASE}/api/companies/${companySlug}/interviews`,
        toInterviewPayload(draft),
        { withCredentials: true },
      );
      // Both the panel and the gate change on success, so neither can be left stale.
      queryClient.invalidateQueries({ queryKey: ["company-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["has-interview-contributed"] });
      onSubmitted();
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Your interview at {companyName}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              No free text — just the facts, so every answer is comparable.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-5">
          {/* ── Outcome — first, and required ─────────────────────────────── */}
          <Field
            label="How did it end?"
            required
            error={errors.outcome}
            hint="Ratings read very differently depending on the result, so we always show the split."
          >
            <div className="flex flex-wrap gap-2">
              {INTERVIEW_OUTCOMES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update("outcome", value as InterviewOutcome)}
                  aria-pressed={draft.outcome === value}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                    draft.outcome === value
                      ? "bg-[#2e0562] text-white"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {OUTCOME_LABELS[value]}
                </button>
              ))}
            </div>
          </Field>

          {/* ── Overall ───────────────────────────────────────────────────── */}
          <Field label="Overall, how was the experience?" required error={errors.overallRating}>
            <Stars
              value={draft.overallRating}
              onChange={(value) => update("overallRating", value)}
              ariaLabelPrefix="Overall"
            />
          </Field>

          {/* ── Categories ────────────────────────────────────────────────── */}
          <div className="space-y-4 rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Optional detail
            </p>
            {INTERVIEW_CATEGORIES.map((category) => (
              <Field key={category} label={CATEGORY_LABELS[category]} error={errors[category]} compact>
                <Stars
                  value={draft[category] ?? null}
                  onChange={(value) => update(category, value)}
                  ariaLabelPrefix={CATEGORY_LABELS[category]}
                  size={22}
                />
              </Field>
            ))}
          </div>

          {/* ── Difficulty — explicitly not a quality score ────────────────── */}
          <Field
            label="How difficult was it?"
            error={errors.difficulty}
            hint="Difficulty isn't a complaint — a hard interview can be a good one, so this never affects ratings."
          >
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => update("difficulty", draft.difficulty === level ? null : level)}
                  aria-pressed={draft.difficulty === level}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                    draft.difficulty === level
                      ? "bg-[#2e0562] text-white"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DIFFICULTY_LABELS[level]}
                </button>
              ))}
            </div>
          </Field>

          {/* ── Process facts ─────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Year" required error={errors.interviewYear}>
              <select
                value={draft.interviewYear ?? ""}
                onChange={(e) => update("interviewYear", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {interviewYearOptions(currentYear).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Role" error={errors.roleCategory}>
              <input
                type="text"
                value={draft.roleCategory ?? ""}
                onChange={(e) => update("roleCategory", e.target.value)}
                maxLength={100}
                placeholder="e.g. Engineering"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </Field>

            <Field label="Format">
              <select
                value={draft.interviewType ?? ""}
                onChange={(e) =>
                  update("interviewType", (e.target.value || null) as InterviewType | null)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Not sure</option>
                {INTERVIEW_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {INTERVIEW_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="How long did it take?">
              <select
                value={draft.processLength ?? ""}
                onChange={(e) =>
                  update("processLength", (e.target.value || null) as ProcessLength | null)
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Not sure</option>
                {PROCESS_LENGTHS.map((length) => (
                  <option key={length} value={length}>
                    {PROCESS_LENGTH_LABELS[length]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Rounds" error={errors.rounds}>
              <input
                type="number"
                min={1}
                max={10}
                value={draft.rounds ?? ""}
                onChange={(e) =>
                  update("rounds", e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </Field>
          </div>

          {submitError && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#2e0562] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Share experience"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  hint,
  required,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "space-y-2"}>
      <label className="block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className={compact ? "mt-1" : ""}>{children}</div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
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
            className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary rounded"
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
