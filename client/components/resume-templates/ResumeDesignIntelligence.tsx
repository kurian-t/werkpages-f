import { useMemo } from "react";
import type { ResumeData, ResumeDesign } from "./types";
import {
  analyzeResumeDesign,
  applyResumeDesignFix,
  applySafeResumeDesignPolish,
  type DesignInsight,
} from "./resumeDesignIntelligence";

function InsightRow({
  insight,
  onFix,
}: {
  insight: DesignInsight;
  onFix: () => void;
}) {
  const warning = insight.severity === "warning";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        warning
          ? "border-amber-200 bg-amber-50/70"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            warning
              ? "bg-amber-100 text-amber-700"
              : "bg-[#2e0562]/10 text-[#2e0562]"
          }`}
          aria-hidden="true"
        >
          {warning ? "!" : "✦"}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-foreground">
            {insight.title}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {insight.detail}
          </p>

          {insight.fixId && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onFix}
                className="rounded-md border border-[#2e0562]/25 px-2 py-1 text-[10px] font-semibold text-[#2e0562] transition-colors hover:bg-[#2e0562]/5"
              >
                {insight.fixLabel ?? "Fix"}
              </button>
              {insight.safe && (
                <span className="text-[9px] font-medium text-emerald-600">
                  safe polish
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResumeDesignIntelligence({
  data,
  onChangeDesign,
  onRemeasure,
}: {
  data: ResumeData;
  onChangeDesign: (design: ResumeDesign) => void;
  onRemeasure?: () => void;
}) {
  const report = useMemo(
    () => analyzeResumeDesign(data),
    [data]
  );

  const applyFix = (fixId: NonNullable<DesignInsight["fixId"]>) => {
    onChangeDesign(applyResumeDesignFix(data.design, fixId));
    onRemeasure?.();
  };

  const polish = () => {
    onChangeDesign(applySafeResumeDesignPolish(data));
    onRemeasure?.();
  };

  return (
    <div className="border-b border-border bg-gradient-to-b from-[#2e0562]/[0.055] to-transparent px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#2e0562] text-[12px] text-white">
              ✦
            </div>
            <div>
              <p className="text-[11px] font-semibold text-foreground">
                Design intelligence
              </p>
              <p className="text-[9.5px] leading-relaxed text-muted-foreground">
                Live checks based on your actual design state.
              </p>
            </div>
          </div>
        </div>

        {report.safeFixCount > 0 && (
          <button
            type="button"
            onClick={polish}
            className="flex-shrink-0 rounded-lg bg-[#2e0562] px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#2e0562]/90"
          >
            Auto polish · {report.safeFixCount}
          </button>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-background/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] font-semibold text-foreground">
            {report.headline}
          </p>
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            {report.warningCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">
                {report.warningCount} issue{report.warningCount === 1 ? "" : "s"}
              </span>
            )}
            {report.suggestionCount > 0 && (
              <span className="rounded-full bg-[#2e0562]/8 px-1.5 py-0.5 font-semibold text-[#2e0562]">
                {report.suggestionCount} suggestion{report.suggestionCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        {report.insights.length === 0 && (
          <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
            Typography, contrast, shape geometry and repeated visual treatments look internally consistent.
          </p>
        )}
      </div>

      {report.insights.length > 0 && (
        <div className="mt-2.5 max-h-[300px] space-y-2 overflow-y-auto pr-0.5">
          {report.insights.map(insight => (
            <InsightRow
              key={insight.id}
              insight={insight}
              onFix={() => insight.fixId && applyFix(insight.fixId)}
            />
          ))}
        </div>
      )}

      <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
        Suggestions are deterministic design checks, not a quality score. Optional fixes never run unless you choose them.
      </p>
    </div>
  );
}
