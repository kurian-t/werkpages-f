import { useState } from "react";
import { Lock, Briefcase, Clock, Layers, TrendingUp, Info } from "lucide-react";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
import {
  CATEGORY_LABELS,
  OUTCOME_FILTERS,
  OUTCOME_SHORT_LABELS,
  describeCount,
  difficultyLabel,
  isSmallSample,
  offerRate,
  outcomeBucket,
  outcomeGap,
  sortedCategories,
  type InterviewOutcome,
} from "@/lib/interviews";

interface InterviewPanelProps {
  companySlug: string;
  companyName: string;
  onAddInterview: () => void;
}

/**
 * The "Getting hired" panel on a company profile.
 *
 * Written for someone who has never worked at this company and is deciding whether to spend three
 * evenings interviewing there. The headline numbers stay public — a locked page is worthless to a
 * candidate arriving from search — and only the per-category breakdown sits behind the
 * contribution gate.
 */
export function InterviewPanel({ companySlug, companyName, onAddInterview }: InterviewPanelProps) {
  const [outcome, setOutcome] = useState<InterviewOutcome | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const { data, isLoading, isError } = useCompanyInterviews(companySlug, outcome, role);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" data-testid="interview-panel-loading">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-40 rounded-2xl bg-muted" />
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

  const rate = offerRate(data);
  const gap = outcomeGap(data);
  const offers = outcomeBucket(data, "offer");
  const rejections = outcomeBucket(data, "no_offer");
  const categories = sortedCategories(data.categoryAverages);
  const difficulty = difficultyLabel(data.avgDifficulty);

  return (
    <div className="space-y-6" data-testid="interview-panel">
      {/* ── Headline numbers — public ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<TrendingUp size={16} className="text-[#6d5091]" />}
          label="Interview experience"
          value={data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
          hint={describeCount(data.reviewCount)}
        />
        <StatTile
          icon={<Briefcase size={16} className="text-[#6d5091]" />}
          label="Offer rate"
          value={rate != null ? `${rate}%` : "—"}
          hint={rate != null ? `${offers.count} offer${offers.count === 1 ? "" : "s"}, ${rejections.count} rejected` : "No decided outcomes yet"}
        />
        <StatTile
          icon={<Layers size={16} className="text-[#6d5091]" />}
          label="Difficulty"
          value={difficulty ?? "—"}
          hint={data.avgDifficulty != null ? `${data.avgDifficulty.toFixed(1)} out of 5` : "Not reported"}
        />
        <StatTile
          icon={<Clock size={16} className="text-[#6d5091]" />}
          label="Typical rounds"
          value={data.medianRounds != null ? String(data.medianRounds) : "—"}
          hint="Median across reports"
        />
      </div>

      {/*
        The offer/no-offer split, stated plainly. This is the reason outcome is a required field:
        without it the single average above is mostly a measure of who was most annoyed.
      */}
      {gap != null && (
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Ratings depend a lot on how it ended
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                People who got an offer rated {companyName}{" "}
                <span className="font-semibold text-foreground">{offers.avgRating?.toFixed(1)}</span>.
                People who didn't rated it{" "}
                <span className="font-semibold text-foreground">{rejections.avgRating?.toFixed(1)}</span>
                {gap > 0 ? ` — ${gap.toFixed(1)} lower.` : gap < 0 ? ` — ${Math.abs(gap).toFixed(1)} higher.` : " — the same."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Show:</span>
        {OUTCOME_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setOutcome(filter.value)}
            aria-pressed={outcome === filter.value}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              outcome === filter.value
                ? "bg-[#2e0562] text-white"
                : "border border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}

        {data.roleCategories.length > 0 && (
          <>
            <span className="text-xs font-medium text-muted-foreground ml-2 mr-1">Role:</span>
            <button
              type="button"
              onClick={() => setRole(null)}
              aria-pressed={role === null}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                role === null
                  ? "bg-[#2e0562] text-white"
                  : "border border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              All roles
            </button>
            {data.roleCategories.map(({ role: name, count }) => (
              <button
                key={name}
                type="button"
                onClick={() => setRole(name)}
                aria-pressed={role === name}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  role === name
                    ? "bg-[#2e0562] text-white"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {name} ({count})
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Category breakdown — gated ────────────────────────────────────── */}
      {data.gated ? (
        <LockedBreakdown onAddInterview={onAddInterview} />
      ) : data.belowThreshold ? (
        <div className="rounded-2xl border border-border bg-background p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Not enough reports to break down yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.filteredCount === 0
              ? "No interviews match these filters."
              : `${describeCount(data.filteredCount)} here — averaging that few would be misleading.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">How the process rated</h3>
            <span className="text-xs text-muted-foreground">
              {outcome ? `${OUTCOME_SHORT_LABELS[outcome]} · ` : ""}
              {describeCount(data.filteredCount)}
            </span>
          </div>
          <div className="space-y-3">
            {categories.map(([key, value]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[key]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#6d5091]"
                      style={{ width: `${Math.min(100, (value / 5) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-6 text-right">
                    {value.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {isSmallSample(data.filteredCount) && (
            <p className="mt-3 text-xs text-muted-foreground">
              Small sample — treat as indicative only.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAddInterview}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
        >
          Add your interview experience
        </button>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function LockedBreakdown({ onAddInterview }: { onAddInterview: () => void }) {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-border bg-background p-5 blur-sm select-none pointer-events-none">
        <div className="h-3 w-40 rounded bg-muted mb-4" />
        <div className="space-y-3">
          {[4.6, 4.1, 3.4, 3.0, 2.6].map((v, i) => (
            <div key={i}>
              <div className="h-2.5 w-1/2 rounded bg-muted mb-1.5" />
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-[#6d5091]" style={{ width: `${(v / 5) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-foreground w-6 text-right">{v.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-background/60 rounded-2xl">
        <Lock size={20} className="mb-1.5 text-muted-foreground opacity-70" />
        <p className="text-sm font-semibold text-foreground">The breakdown is locked</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Share one interview experience to see how every company rates
        </p>
        <button
          type="button"
          onClick={onAddInterview}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
        >
          Add your interview experience
        </button>
      </div>
    </div>
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
      <Briefcase size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" />
      <p className="text-base font-semibold text-foreground">
        Nobody has described interviewing at {companyName} yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        If you've been through the process, you'd be the first to say what it was like.
      </p>
      <button
        type="button"
        onClick={onAddInterview}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors shadow-sm"
      >
        Add your interview experience
      </button>
    </div>
  );
}
