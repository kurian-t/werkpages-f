import { useEffect, useRef, useState } from "react";
import { Briefcase, Lock, Star, TrendingUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import API_BASE from "@/lib/api";
import { PROCESS_LENGTH_LABELS, type ProcessLength } from "@/lib/interviews";
import { useCompanyInterviews } from "@/hooks/useCompanyInterviews";
import { YourContributionMenu } from "@/components/YourContributionMenu";
import { CompanyTabHeader } from "@/components/CompanyTabHeader";
import { InterviewExperienceList } from "@/components/InterviewExperienceList";
import {
  CATEGORY_LABELS,
  INTERVIEW_CATEGORIES,
  ROUND_TYPE_LABELS,
  confidenceLabel,
  describeCount,
  difficultyLabel,
  offerRate,
  outcomeBucket,
  outcomeGap,
  strongestAndWeakest,
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
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // Series visibility, not a data filter. Default shows all three, because comparing them is the
  // point; hiding one is for when you want to read a single population closely.

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

  // Order matters. "Nobody has described interviewing here yet" is an invitation, and it only
  // makes sense to someone who could act on it knowingly - a contributor. Showing it to a visitor
  // who has not contributed both tells them there is nothing here and skips the ask, so the gate
  // is checked first and they get the same locked teaser every other company shows.
  if (data.reviewCount === 0 && !data.gated) {
    return <EmptyState companyName={companyName} onAddInterview={onAddInterview} />;
  }

  const mine = data.myInterview ?? null;

  // A company with nothing yet still has to look like it has something behind the lock: blurring
  // a row of dashes tells a visitor there is no data and gives them no reason to contribute.
  // Same device the manager profile uses with its ghost cards.
  const empty = data.reviewCount === 0;
  const placeholder = { rating: "4.2", difficulty: "Average", rounds: "3 rounds", offerRate: "62%" };

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

  return (
    <div className="space-y-10" data-testid="interview-panel">
      <section>
        {/*
          The same header the other two tabs open with. The four bordered tiles that used to sit
          under this row are now the header's own metrics, so all three tabs state their score,
          their sample and their few numbers in one shape.
        */}
        <CompanyTabHeader
          eyebrow="Interview experience"
          subtitle={`What candidates experienced interviewing at ${companyName}`}
          score={data.avgRating ?? null}
          countLabel="experience"
          countValue={data.reviewCount ?? 0}
          locked={data.gated}
          scoreLabel="avg interview rating"
          metrics={[
            { value: difficulty ?? "-", label: "Difficulty" },
            {
              /*
                How long the process usually took. It used to be the median round *count* under a
                label reading only "Typical", so the noun lived in the value and the label said
                nothing - "typical what?". Length is also the thing a candidate is actually
                planning around; the number of stages is on the line below, in order.
              */
              value: data.medianProcessLength
                ? PROCESS_LENGTH_LABELS[data.medianProcessLength as ProcessLength] ?? "-"
                : "-",
              label: "Typical process",
            },
            { value: rate != null ? `${rate}%` : "-", label: "Offer rate" },
          ]}
          /*
            The same strongest / weakest treatment the other two tabs carry. The AreaCards that used
            to sit below held exactly these, so all three tabs now say it once, in one shape.
          */
          highlights={
            data.gated
              ? []
              : [
                  ...strongest.map(([key, value]) => ({
                    direction: "up" as const, label: CATEGORY_LABELS[key] ?? String(key), value,
                  })),
                  ...weakest.map(([key, value]) => ({
                    direction: "down" as const, label: CATEGORY_LABELS[key] ?? String(key), value,
                  })),
                ]
          }
          highlightsFootnote={
            `Based on ${describeCount(data.reviewCount)}` +
            (data.belowThreshold ? " · Limited data — interpret cautiously" : "")
          }
          lockedOverlay={
            <>
              <Lock size={20} className="mb-1.5 text-muted-foreground opacity-70" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Interview insights are locked</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share an interview experience to unlock them
              </p>
            </>
          }
          action={
            mine ? (
              <YourContributionMenu
                label="Your experience"
                editLabel="Edit your experience"
                deleteLabel="Delete your experience"
                confirmTitle="Delete your interview experience?"
                confirmBody={`Your ratings and interview details will be removed from ${companyName}'s interview statistics.`}
                onEdit={() => onEditInterview(mine.id)}
                onDelete={async () => {
                  try {
                    await axios.delete(`${API_BASE}/api/interviews/${mine.id}`, { withCredentials: true });
                    // The company's aggregates change the moment this goes, so nothing cached survives it.
                    queryClient.invalidateQueries({ queryKey: ["company-interviews"] });
                    queryClient.invalidateQueries({ queryKey: ["has-interview-contributed"] });
                    toast.success("Your interview experience has been removed.");
                  } catch {
                    toast.error("We couldn't remove that. Please try again.");
                    throw new Error("delete failed");
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={onAddInterview}
                className="rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2e0562]/90"
              >
                Share your experience
              </button>
            )
          }
        />

        {/* The shape of the process, which a bare count cannot convey. */}
        {typicalRounds.length > 0 && (
          <p className={`mt-4 text-sm text-muted-foreground ${data.gated ? "pointer-events-none blur-sm" : ""}`}>
            <span className="font-medium text-foreground">Usually:</span>{" "}
            {typicalRounds.map((r) => ROUND_TYPE_LABELS[r.type] ?? r.type).join(" → ")}
          </p>
        )}
      </section>

      {/*
        The Strongest / Weakest cards used to sit here. The header above now names the same
        categories and carries the same "based on N" sentence, so the tab stated each of them
        twice. The below-threshold notice stays - it says why there is nothing to rank.
      */}
      {/*
        A thin sample is shown and flagged, not withheld.

        This used to replace the breakdown with "Not enough reports to break down yet", which is a
        worse answer than the figures plus a caveat - and it is not what the rest of the product
        does. The manager profile and the workplace tab both print their numbers and say how much
        is behind them. Two reports are genuinely two people's experience; a reader told so can
        weigh it.
      */}
      {!data.gated && data.belowThreshold && (
        <p className="text-xs text-muted-foreground">
          {`Based on ${describeCount(data.reviewCount)} · Limited data — interpret cautiously`}
        </p>
      )}

      {/*
        The outcome-comparison chart used to sit here: its own toned container, a country and role
        filter, and grouped bars showing every outcome at once.

        Removed for now. It was a second, much larger presentation of figures the header above
        already gives - five categories tall, in a visual language nothing else on the page used -
        so the tab read as two competing charts. The per-category ratings live in the header with
        the rest of the summary, which is where the other tabs put theirs.

        The data behind it is untouched: categoryComparison is still computed and returned, so
        bringing this back is a rendering decision rather than a rebuild.
      */}

      {/*
        The second "Share your experience" that used to sit here is gone.

        The header already carries it, and on a locked tab - which is where most people meet this
        page - there is nothing between the two but the lock notice, so the same sentence appeared
        twice within one screen. The workplace tab asks once; this one now matches it.
      */}

      {/*
        The experiences behind the averages, the way the workplace tab lists the ratings behind
        its own. Renders nothing when there are none or the reader has not earned them - the
        panel above already explains the gate, and repeating it here would say it twice.
      */}
      <InterviewExperienceList companySlug={companySlug} companyName={companyName} />
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
