import { MousePointer2, RotateCcw } from "lucide-react";

interface Props {
  sceneName: string;
  selectedObjectLabel?: string | null;
  scrollBehavior: string;
  scrollLength: number;
  progress: number;
  virtualScrollPx: number;
  wheelPreview: boolean;
  scrollMarkers: number[];
  pathMarkers: number[];
  onProgressChange: (progress: number) => void;
  onToggleWheelPreview: () => void;
  onReset: () => void;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatProgress(value: number) {
  return Math.round(value * 10) / 10;
}

function MarkerLane({
  label,
  markers,
  kind,
  onSeek,
}: {
  label: string;
  markers: number[];
  kind: "scroll" | "path";
  onSeek: (progress: number) => void;
}) {
  if (markers.length === 0) return null;

  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {markers.map(marker => (
          <button
            key={`${kind}-${marker}`}
            type="button"
            title={`Seek to ${formatProgress(marker)}% ${kind === "scroll" ? "scroll keyframe" : "path point"}`}
            aria-label={`Seek to ${formatProgress(marker)}% ${kind === "scroll" ? "scroll keyframe" : "path point"}`}
            onClick={() => onSeek(marker)}
            className={`absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 ${
              kind === "scroll"
                ? "h-4 w-1.5 rounded-full bg-[#7c3aed]"
                : "h-4 w-4 rounded-full border-2 border-white bg-[#0f766e] shadow-sm"
            }`}
            style={{ left: `${marker}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function InteractiveTimeline({
  sceneName,
  selectedObjectLabel,
  scrollBehavior,
  scrollLength,
  progress,
  virtualScrollPx,
  wheelPreview,
  scrollMarkers,
  pathMarkers,
  onProgressChange,
  onToggleWheelPreview,
  onReset,
}: Props) {
  const roundedProgress = formatProgress(progress);
  const hasSelectedMarkers = scrollMarkers.length > 0 || pathMarkers.length > 0;

  return (
    <section className="overflow-hidden rounded-xl border border-[#2e0562]/15 bg-card shadow-[0_-8px_24px_rgba(46,5,98,0.05)]">
      <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex-none">
            <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2e0562]">
              Timeline
            </div>
            <div className="mt-0.5 max-w-[420px] truncate text-[12px] text-muted-foreground">
              {sceneName}
              {selectedObjectLabel ? ` · ${selectedObjectLabel}` : " · Scene preview"}
            </div>
          </div>

          <span className="rounded-full border border-border bg-muted/25 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {scrollBehavior === "pinned" ? "Pinned" : "Flow"} · {scrollLength}px
          </span>
          {wheelPreview && (
            <span className="rounded-full bg-[#2e0562]/8 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#2e0562]">
              Preview mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={wheelPreview}
            onClick={onToggleWheelPreview}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${
              wheelPreview
                ? "border-[#2e0562]/30 bg-[#2e0562] text-white"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            title="Use the mouse wheel over the scene to scrub this timeline."
          >
            <MousePointer2 size={14} />
            {wheelPreview ? "Exit preview" : "Wheel scrub"}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={progress === 0}
            aria-label="Reset timeline to 0%"
            title="Reset timeline to 0%"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>

      <div className="px-4 pb-3.5 pt-3">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
          <div className="text-[12px] font-semibold text-muted-foreground">Progress</div>
          <div>
            <div className="relative h-7">
              {[0, 25, 50, 75, 100].map(tick => (
                <span
                  key={tick}
                  aria-hidden="true"
                  className="absolute top-0 h-2.5 w-px bg-border"
                  style={{ left: `${tick}%` }}
                />
              ))}
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={progress}
                onChange={event => onProgressChange(clampProgress(Number(event.target.value)))}
                className="absolute inset-x-0 bottom-0 z-20 h-4 w-full cursor-ew-resize accent-[#7c3aed]"
                aria-label="Interactive scene timeline progress"
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground/80">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {hasSelectedMarkers && (
          <div className="mt-2.5 space-y-2">
            <MarkerLane label="Scroll" markers={scrollMarkers} kind="scroll" onSeek={onProgressChange} />
            <MarkerLane label="Path" markers={pathMarkers} kind="path" onSeek={onProgressChange} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
            {hasSelectedMarkers
              ? "Click a marker to seek · drag the playhead to scrub"
              : "Drag the playhead to preview scene scroll"}
          </div>
          <div className="flex flex-none items-center gap-1.5 rounded-lg bg-[#2e0562]/[0.06] px-3 py-1.5 font-mono text-[12px] font-semibold text-[#2e0562]">
            <span>{roundedProgress}%</span>
            <span className="text-[#2e0562]/35">·</span>
            <span>{virtualScrollPx}px</span>
          </div>
        </div>
      </div>
    </section>
  );
}
