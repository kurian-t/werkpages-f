import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  CircleAlert,
  Gauge,
  Image as ImageIcon,
  Layers3,
  MousePointer2,
  Route,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { ResumeData } from "./types";
import {
  analyzeInteractivePublish,
  formatBytes,
  type InteractivePublishIssue,
} from "./resumeInteractivePerformance";
import { getOrderedInteractiveScenes } from "./resumeInteractive";
import { getResumeWebExperienceState } from "./resumeWebExperience";

function statusCopy(readiness: "ready" | "review" | "blocked") {
  if (readiness === "blocked") {
    return {
      label: "Blocked",
      title: "Resolve the blocking issue before publishing",
      detail:
        "At least one hard guardrail is currently failing. Prepare publish will run export optimization and final validation again.",
      badge: "border-red-200 bg-red-50 text-red-700",
      icon: "bg-red-50 text-red-600",
    };
  }

  if (readiness === "review") {
    return {
      label: "Review",
      title: "Publishable, with a few things worth reviewing",
      detail:
        "Warnings are advisory. The visitor runtime already adapts motion and ambience on lower-powered devices.",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      icon: "bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Ready",
    title: "This Interactive Experience looks ready",
    detail:
      "No current editor-side publish warnings were found. Final standalone HTML size is still checked during Prepare publish.",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "bg-emerald-50 text-emerald-700",
  };
}

function issueStyle(issue: InteractivePublishIssue) {
  if (issue.severity === "error") {
    return {
      shell: "border-red-200 bg-red-50/55",
      icon: "bg-red-100 text-red-600",
      title: "text-red-700",
      label: "Blocking",
    };
  }

  if (issue.severity === "warning") {
    return {
      shell: "border-amber-200 bg-amber-50/55",
      icon: "bg-amber-100 text-amber-700",
      title: "text-amber-800",
      label: "Review",
    };
  }

  return {
    shell: "border-sky-200 bg-sky-50/55",
    icon: "bg-sky-100 text-sky-700",
    title: "text-sky-800",
    label: "Note",
  };
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="text-[7.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-foreground">
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 text-[7px] leading-relaxed text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  );
}

export default function InteractivePublishReadinessOverlay({
  open,
  data,
  onClose,
  onGoToIssue,
}: {
  open: boolean;
  data: ResumeData;
  onClose: () => void;
  onGoToIssue?: (sceneId?: string, objectId?: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const report = analyzeInteractivePublish(data);
  const status = statusCopy(report.readiness);

  const sceneNames = useMemo(() => {
    const interactive = getResumeWebExperienceState(data.design).interactive;
    if (!interactive) return new Map<string, string>();
    return new Map(
      getOrderedInteractiveScenes(interactive).map(scene => [scene.id, scene.name]),
    );
  }, [data.design]);

  const orderedIssues = useMemo(
    () =>
      [...report.issues].sort((a, b) => {
        const weight = { error: 0, warning: 1, info: 2 } as const;
        return weight[a.severity] - weight[b.severity];
      }),
    [report.issues],
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(
      () => closeButtonRef.current?.focus(),
      0,
    );

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const metrics = report.metrics;
  const statusIcon =
    report.readiness === "ready" ? (
      <CheckCircle2 size={17} />
    ) : report.readiness === "blocked" ? (
      <CircleAlert size={17} />
    ) : (
      <TriangleAlert size={17} />
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="interactive-readiness-title"
        className="flex max-h-[calc(100vh-24px)] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-40px)]"
      >
        <header className="flex flex-none items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#2e0562]/8 text-[#2e0562]">
              <Gauge size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
                Publish readiness
              </div>
              <h2
                id="interactive-readiness-title"
                className="mt-0.5 text-sm font-semibold text-foreground"
              >
                Performance & publish guardrails
              </h2>
              <p className="mt-1 max-w-3xl text-[9.5px] leading-relaxed text-muted-foreground">
                A focused check of scene complexity, motion, ambience and asset weight before the Interactive Experience is prepared for publishing.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close publish readiness"
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5">
          <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl ${status.icon}`}>
                {statusIcon}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.12em] ${status.badge}`}>
                    {status.label}
                  </span>
                  <span className="text-[8px] text-muted-foreground">
                    {report.errorCount} blocking · {report.warningCount} warning{report.warningCount === 1 ? "" : "s"} · {report.infoCount} note{report.infoCount === 1 ? "" : "s"}
                  </span>
                </div>
                <h3 className="mt-2 text-[12px] font-semibold text-foreground">
                  {status.title}
                </h3>
                <p className="mt-1 max-w-2xl text-[8.5px] leading-relaxed text-muted-foreground">
                  {status.detail}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center sm:justify-end">
              <div
                className="grid h-[82px] w-[82px] place-items-center rounded-full p-[6px]"
                style={{
                  background: `conic-gradient(#2e0562 ${Math.max(0, Math.min(100, report.score)) * 3.6}deg, hsl(var(--muted)) 0deg)`,
                }}
                aria-label={`Readiness score ${report.score} out of 100`}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-background text-center">
                  <div>
                    <div className="text-lg font-bold leading-none text-foreground">
                      {report.score}
                    </div>
                    <div className="mt-1 text-[6.5px] font-bold uppercase tracking-wider text-muted-foreground">
                      Score
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <section className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2">
                <Layers3 size={12} className="text-[#2e0562]" />
                <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Structure
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricCard label="Scenes" value={String(metrics.sceneCount)} />
                <MetricCard label="Objects" value={String(metrics.totalObjects)} />
                <MetricCard label="Max / scene" value={String(metrics.maxObjectsPerScene)} />
                <MetricCard label="Ambient nodes" value={String(metrics.ambientNodeCount)} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-[#2e0562]" />
                <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Motion
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricCard label="Animated" value={String(metrics.animatedObjects)} />
                <MetricCard label="Tracks" value={String(metrics.animationTrackCount)} />
                <MetricCard label="Loops" value={String(metrics.loopTrackCount)} />
                <MetricCard label="Scroll" value={String(metrics.scrollTrackCount)} />
                <MetricCard label="Paths" value={String(metrics.motionPathCount)} />
                <MetricCard label="Parallax" value={String(metrics.parallaxObjectCount)} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2">
                <ImageIcon size={12} className="text-[#2e0562]" />
                <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Assets
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricCard label="Embedded" value={String(metrics.embeddedImageCount)} />
                <MetricCard label="Embedded size" value={formatBytes(metrics.embeddedImageBytes)} />
                <MetricCard label="Largest image" value={formatBytes(metrics.largestEmbeddedImageBytes)} />
                <MetricCard label="Remote" value={String(metrics.remoteImageCount)} />
                <div className="col-span-2">
                  <MetricCard
                    label="Standalone HTML"
                    value={metrics.standaloneHtmlBytes == null ? "Checked on prepare" : formatBytes(metrics.standaloneHtmlBytes)}
                    detail="Final HTML is measured after export-only image compaction."
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  Checks
                </div>
                <div className="mt-0.5 text-[8px] text-muted-foreground">
                  Blocking issues first, then warnings and informational notes.
                </div>
              </div>
              <span className="rounded-full border border-border bg-muted/20 px-2 py-1 text-[7.5px] font-semibold text-muted-foreground">
                {report.issues.length} finding{report.issues.length === 1 ? "" : "s"}
              </span>
            </div>

            {orderedIssues.length ? (
              <div className="mt-3 space-y-2">
                {orderedIssues.map(issue => {
                  const style = issueStyle(issue);
                  const sceneName = issue.sceneId ? sceneNames.get(issue.sceneId) : undefined;
                  return (
                    <div key={issue.id} className={`rounded-xl border px-3 py-2.5 ${style.shell}`}>
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-lg ${style.icon}`}>
                          {issue.severity === "error" ? (
                            <CircleAlert size={12} />
                          ) : issue.severity === "warning" ? (
                            <TriangleAlert size={12} />
                          ) : (
                            <Sparkles size={12} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`text-[9px] font-semibold ${style.title}`}>
                              {issue.title}
                            </div>
                            <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[6.5px] font-bold uppercase tracking-wider text-muted-foreground">
                              {style.label}
                            </span>
                            {sceneName && (
                              <span className="text-[7px] text-muted-foreground">
                                {sceneName}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[8px] leading-relaxed text-muted-foreground">
                            {issue.detail}
                          </p>
                          {issue.sceneId && onGoToIssue && (
                            <button
                              type="button"
                              onClick={() => {
                                onGoToIssue(issue.sceneId, issue.objectId);
                                onClose();
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 text-[7.5px] font-semibold text-[#2e0562] hover:underline"
                            >
                              <MousePointer2 size={9} />
                              Go to {sceneName || "scene"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/55 px-3 py-3">
                <CheckCircle2 size={14} className="mt-0.5 flex-none text-emerald-700" />
                <div>
                  <div className="text-[9px] font-semibold text-emerald-800">
                    No current editor-side publish warnings
                  </div>
                  <p className="mt-1 text-[8px] leading-relaxed text-emerald-700/85">
                    Prepare publish will still generate the final HTML, compact eligible presentation-owned images and run the hard limits one more time.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#2e0562]/10 bg-[#2e0562]/[0.025] px-3 py-2.5">
            <Route size={12} className="mt-0.5 flex-none text-[#2e0562]" />
            <p className="text-[7.5px] leading-relaxed text-muted-foreground">
              This report is a publishing guardrail, not a quality ranking. Warnings do not block normal publishing; errors can. Visitor runtime performance tiers and reduced-motion behavior remain automatic.
            </p>
          </section>
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-2.5 text-[8px] leading-relaxed text-muted-foreground sm:px-5">
          <span>Final HTML size is known only after Prepare publish.</span>
          <span className="font-semibold text-foreground/70">Esc closes this window.</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
