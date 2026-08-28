import { useEffect, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, Lock, Pencil, Star, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import API_BASE from "@/lib/api";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
import {
  CATEGORY_LABELS,
  COMPARISON_SERIES,
  COMPARISON_TRACK_COLOR,
  INTERVIEW_CATEGORIES,
  ROUND_TYPE_LABELS,
  biggestOutcomeGap,
  confidenceLabel,
  describeCount,
  difficultyLabel,
  offerRate,
  outcomeBucket,
  outcomeGap,
  strongestAndWeakest,
  type ComparisonSeriesKey,
  type InterviewCategory,
} from "@/lib/interviews";

interface InterviewPanelProps {
  companySlug: string;
  companyName: string;
  onAddInterview: () => void;
  onEditInterview: (reviewId: string) => void;
}

/**
 * The interview half of a company profile.
 *
 * <p>Deliberately built from the Working tab's vocabulary rather than designed in isolation:
 * summary figures, then Strongest and Weakest areas, then a confidence sentence, then a deeper
 * section. Switching tabs should feel like the same page showing a different kind of experience,
 * not like arriving in a second product - so no dashboard of tiles, and no new visual grammar to
 * learn.
 *
 * <p>The headline numbers stay public; only the per-category breakdown sits behind the
 * contribution gate, because a locked page is worthless to a candidate arriving from search.
 */
export function InterviewPanel({ companySlug, companyName, onAddInterview, onEditInterview }: InterviewPanelProps) {
  const [role, setRole] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // Series visibility, not a data filter. Default shows all three, because comparing them is the
  // point; hiding one is for when you want to read a single population closely.
  const [hiddenSeries, setHiddenSeries] = useState<Set<ComparisonSeriesKey>>(new Set());

  const { data, isLoading, isError, isFetching } = useCompanyInterviews(companySlug, role, country);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6" data-testid="interview-panel-loading">
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="h-40 rounded-2xl bg-muted" />
          <div className="h-40 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center">
        <p className="text-sm font-semibold text-foreground">Couldn't load interview reviews</p>
        <p className="mt-1 text-xs text-muted-foreground">Please try again in a moment.</p>
      </div>
    );
  }

  if (data.reviewCount === 0) {
    return <EmptyState companyName={companyName} onAddInterview={onAddInterview} />;
  }

  const mine = data.myInterview ?? null;

  const rate = offerRate(data);
  const gap = outcomeGap(data);
  const offers = outcomeBucket(data, "offer");
  const rejections = outcomeBucket(data, "no_offer");
  const difficulty = difficultyLabel(data.avgDifficulty);
  const { strongest, weakest } = strongestAndWeakest(data.categoryAverages);
  const confidence = confidenceLabel(data.reviewCount);
  const typicalRounds = data.typicalRounds ?? [];
  // Defaulted, not assumed. During a deploy the frontend can be newer than the API for a few
  // minutes, and a missing array here took the whole panel down with a TypeError.
  const countries = data.countries ?? [];
  const roleCategories = data.roleCategories ?? [];
  const comparison = data.categoryComparison;
  const topGap = biggestOutcomeGap(comparison);

  return (
    <div className="space-y-10" data-testid="interview-panel">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Interview experience</SectionLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              What candidates experienced interviewing at {companyName}
            </p>
          </div>
          {/*
            The call to action sits with the summary rather than at the foot of the page: by the
            time someone has read the numbers they either recognise their own experience or they
            do not, and that is the moment to ask.
          */}
          {mine ? (
            <YourExperienceMenu
              companyName={companyName}
              reviewId={mine.id}
              onEdit={() => onEditInterview(mine.id)}
            />
          ) : (
            <button
              type="button"
              onClick={onAddInterview}
              className="flex-shrink-0 rounded-xl bg-[#2e0562] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
            >
              Share your experience
            </button>
          )}
        </div>

        {/*
          One summary row, not four cards. Four bordered tiles beside the Working tab's two large
          panels is what made the two halves look like different applications; a single row with
          quiet dividers reads as the same product.

          Blurred behind the same gate as the breakdown: the interview figures are the payoff for
          contributing an interview experience, exactly as the manager figures are the payoff for
          rating a manager. Only the count in the tab stays public, so the page still says what is
          behind it.
        */}
        <div className={`relative ${data.gated ? "select-none" : ""}`}>
        <div className={`mt-5 grid grid-cols-2 gap-y-6 border-y border-border py-6 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border ${
          data.gated ? "pointer-events-none blur-sm" : ""
        }`}>
          <Metric
            value={data.avgRating != null ? data.avgRating.toFixed(1) : "-"}
            suffix={data.avgRating != null ? "/ 5" : undefined}
            stars={data.avgRating}
            detail={`${data.reviewCount} ${data.reviewCount === 1 ? "experience" : "experiences"}`}
          />
          <Metric value={difficulty ?? "-"} label="Difficulty" />
          <Metric
            value={data.medianRounds != null ? `${data.medianRounds} rounds` : "-"}
            label="Typical"
          />
          <Metric value={rate != null ? `${rate}%` : "-"} label="Offer rate" />
        </div>

        {/* The shape of the process, which a bare count cannot convey. */}
        {typicalRounds.length > 0 && (
          <p className={`mt-4 text-sm text-muted-foreground ${data.gated ? "pointer-events-none blur-sm" : ""}`}>
            <span className="font-medium text-foreground">Usually:</span>{" "}
            {typicalRounds.map((r) => ROUND_TYPE_LABELS[r.type] ?? r.type).join(" → ")}
          </p>
        )}

        {data.gated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <Lock size={20} className="mb-1.5 text-muted-foreground opacity-70" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Interview insights are locked</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Share an interview experience to unlock them
            </p>
            <button
              type="button"
              onClick={onAddInterview}
              className="mt-3 rounded-xl bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
            >
              Share your experience
            </button>
          </div>
        )}
        </div>
      </section>

      {/* ── Strongest / Weakest - the Working tab's own layout ─────────────── */}
      {data.gated ? null : data.belowThreshold ? (
        <div className="rounded-2xl border border-border bg-background p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Not enough reports to break down yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {`${describeCount(data.reviewCount)} so far. Averaging that few would be misleading.`}
          </p>
        </div>
      ) : (
        <section>
          <div className="grid gap-6 sm:grid-cols-2">
            <AreaCard
              title="Strongest Areas"
              icon={<TrendingUp size={16} className="text-green-600" aria-hidden="true" />}
              entries={strongest}
            />
            <AreaCard
              title="Weakest Areas"
              icon={<TrendingDown size={16} className="text-amber-500" aria-hidden="true" />}
              entries={weakest}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Based on {describeCount(data.reviewCount)}.
            {confidence === "low" && " Low confidence, results may change as more candidates contribute."}
            {confidence === "moderate" && " Moderate confidence."}
          </p>
        </section>
      )}

      {/*
        Everything above describes every interview on record and never moves. This section is the
        exploratory half: its own toned container, its own filter, and a chart that shows all three
        outcomes at once rather than making anyone compare across clicks.
      */}
      <section className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Explore the interview data</SectionLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              How candidates rated each part of the process
              {role ? ` for ${role} roles` : ""}
              {country ? ` in ${country}` : ""}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
          {countries.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Country
              <select
                value={country ?? ""}
                onChange={(e) => setCountry(e.target.value || null)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
              >
                <option value="">All countries</option>
                {countries.map(({ country: name, count }) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </label>
          )}

          {roleCategories.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Role
              <select
                value={role ?? ""}
                onChange={(e) => setRole(e.target.value || null)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
              >
                <option value="">All roles</option>
                {roleCategories.map(({ role: name, count }) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </label>
          )}
          </div>
        </div>

        {comparison == null ? (
          <p className="mt-5 text-sm text-muted-foreground">
            {data.gated
              ? "Share an interview experience to compare how each part of the process was rated."
              : "Not enough interviews yet to compare outcomes."}
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Compare</span>
              {COMPARISON_SERIES.map((series) => {
                const shown = !hiddenSeries.has(series.key);
                return (
                  <button
                    key={series.key}
                    type="button"
                    aria-pressed={shown}
                    onClick={() =>
                      setHiddenSeries((prev) => {
                        const next = new Set(prev);
                        // Never let the last series be switched off - an empty chart is not a view.
                        if (!next.has(series.key) && next.size === COMPARISON_SERIES.length - 1) return prev;
                        next.has(series.key) ? next.delete(series.key) : next.add(series.key);
                        return next;
                      })
                    }
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      shown
                        ? "border-border bg-background text-foreground"
                        : "border-transparent bg-transparent text-muted-foreground/60"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: shown ? series.color : "transparent",
                               boxShadow: shown ? undefined : `inset 0 0 0 1px ${series.color}` }}
                    />
                    {series.label}
                    <span className="text-muted-foreground/70">({comparison[series.key].count})</span>
                  </button>
                );
              })}
            </div>

            <div className={`mt-5 space-y-5 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
              {INTERVIEW_CATEGORIES.map((category) => (
                <div key={category}>
                  <p className="mb-2 text-sm font-medium text-foreground">{CATEGORY_LABELS[category]}</p>
                  <div className="space-y-1.5">
                    {COMPARISON_SERIES.filter((series) => !hiddenSeries.has(series.key)).map((series) => (
                      <GroupedBar
                        key={series.key}
                        label={series.label}
                        color={series.color}
                        value={comparison[series.key][category]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {topGap && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Biggest outcome gap: {CATEGORY_LABELS[topGap.category]}.</span>{" "}
                  <span className="text-muted-foreground">
                    Candidates who received an offer rated it{" "}
                    {Math.abs(topGap.gap).toFixed(1)} points {topGap.gap > 0 ? "higher" : "lower"}.
                  </span>
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* A second call to action at the foot, for the reader who came to a view after the data. */}
      {!mine && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onAddInterview}
            className="rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
          >
            Share your experience
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The control that replaces the call to action once you have contributed here.
 *
 * <p>"Your experience" rather than "Edit": the page acknowledging that this contribution is yours
 * matters more than naming the action, and edit and delete are the secondary moves. Mirrors how a
 * manager review is already handled.
 */
function YourExperienceMenu({
  companyName,
  reviewId,
  onEdit,
}: {
  companyName: string;
  reviewId: string;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const remove = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE}/api/interviews/${reviewId}`, { withCredentials: true });
      // The company's aggregates change the moment this goes, so nothing cached survives it.
      queryClient.invalidateQueries({ queryKey: ["company-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["has-interview-contributed"] });
      toast.success("Your interview experience has been removed.");
      setConfirming(false);
      setOpen(false);
    } catch {
      toast.error("We couldn't remove that. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Check size={15} className="text-green-600" aria-hidden="true" />
        Your experience
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Pencil size={14} aria-hidden="true" /> Edit your experience
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-muted"
          >
            <Trash2 size={14} aria-hidden="true" /> Delete your experience
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">
              Delete your interview experience?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your ratings and interview details will be removed from {companyName}'s interview
              statistics.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Metric({
  value,
  suffix,
  label,
  detail,
  stars,
}: {
  value: string;
  suffix?: string;
  label?: string;
  detail?: string;
  stars?: number | null;
}) {
  return (
    <div className="px-0 sm:px-5 sm:first:pl-0">
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </p>
      {stars != null && (
        <div className="mt-1 flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={12}
              className={i <= Math.round(stars) ? "fill-amber-400 text-amber-400" : "fill-none text-border"}
            />
          ))}
        </div>
      )}
      {label && <p className="mt-1 text-sm font-medium text-foreground">{label}</p>}
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function AreaCard({
  title,
  icon,
  entries,
}: {
  title: string;
  icon: React.ReactNode;
  entries: Array<[InterviewCategory, number]>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[key]}</span>
            </div>
            <Bar value={value} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Same bar as the Working tab's RatingBar, so the two tabs read as one product. */
function Bar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-[#6d5091]"
          style={{ width: `${Math.min(100, (value / 5) * 100)}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs font-medium text-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

/**
 * One series within a category. Fixed-width label and number so the three bars line up and the
 * differences read at a glance, which is the entire reason for showing them together.
 */
function GroupedBar({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 flex-shrink-0 text-xs text-muted-foreground">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: COMPARISON_TRACK_COLOR }}
      >
        {value != null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, (value / 5) * 100)}%`, backgroundColor: color }}
          />
        )}
      </div>
      <span className="w-8 flex-shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
        {value != null ? value.toFixed(1) : "-"}
      </span>
    </div>
  );
}

function OutcomeBar({
  label,
  value,
  count,
}: {
  label: string;
  value: number | null;
  count: number;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{describeCount(count)}</span>
      </div>
      {value != null ? (
        <Bar value={value} />
      ) : (
        <p className="text-xs text-muted-foreground">Not reported</p>
      )}
    </div>
  );
}

function FilterChip({
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
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        selected
          ? "bg-[#2e0562] text-white"
          : "border border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  companyName,
  onAddInterview,
}: {
  companyName: string;
  onAddInterview: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-10 text-center" data-testid="interview-panel-empty">
      <Briefcase size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" aria-hidden="true" />
      <p className="text-base font-semibold text-foreground">
        Nobody has described interviewing at {companyName} yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        If you've been through the process, you'd be the first to say what it was like.
      </p>
      <button
        type="button"
        onClick={onAddInterview}
        className="mt-4 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
      >
        Share your experience
      </button>
    </div>
  );
}
