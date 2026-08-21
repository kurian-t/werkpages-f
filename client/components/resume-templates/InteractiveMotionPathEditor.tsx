import {
  Plus,
  Trash2,
} from "lucide-react";
import type {
  InteractiveMotionPath,
  InteractiveMotionPathCurve,
} from "./resumeInteractive";
import { createInteractiveMotionPath } from "./resumeInteractive";
import { motionPathPointAt } from "./InteractivePathMotion";

export default function InteractiveMotionPathEditor({
  path,
  progress,
  onChange,
  embedded = false,
}: {
  path: InteractiveMotionPath | undefined;
  progress: number;
  onChange: (path: InteractiveMotionPath | undefined) => void;
  embedded?: boolean;
}) {
  if (!path) {
    return (
      <div className={`${embedded ? "rounded-xl" : "mt-2.5 rounded-lg"} border border-border bg-background p-2.5`}>
        {!embedded && (
          <div className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
            Motion path
          </div>
        )}
        <div className={`${embedded ? "text-[7.5px] font-semibold text-foreground" : "mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground"}`}>
          {embedded ? "No path yet" : "Follow a visible route through this scene as scroll progresses."}
        </div>
        {embedded && (
          <div className="mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground">
            Add a route controlled by the scene scroll timeline.
          </div>
        )}
        <button
          type="button"
          onClick={() => onChange(createInteractiveMotionPath())}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#2e0562]/25 py-1.5 text-[6.8px] font-semibold text-[#2e0562]"
        >
          <Plus size={8} />
          Add motion path
        </button>
      </div>
    );
  }

  const addPoint = () => {
    if (path.points.length >= 12) return;
    const p = Math.round(progress);
    if (
      path.points.some(
        point => Math.abs(point.progress - p) < 0.01,
      )
    ) {
      return;
    }

    const current = motionPathPointAt(path, p);
    onChange({
      ...path,
      points: [
        ...path.points,
        {
          id: `path-point-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          progress: p,
          x: current.x,
          y: current.y,
        },
      ].sort((a, b) => a.progress - b.progress),
    });
  };

  return (
    <div className={embedded ? "space-y-2" : "mt-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/[0.025] p-2"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {!embedded && (
            <div className="text-[7px] font-bold uppercase tracking-wider text-[#2e0562]">
              Motion path
            </div>
          )}
          <div className={`${embedded ? "text-[7px] font-semibold text-foreground" : "mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground"}`}>
            {embedded
              ? `${path.points.length} path point${path.points.length === 1 ? "" : "s"} · ${Math.round(progress)}%`
              : "Path offsets compose with Scroll, Triggered and Quick Motion."}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[6.8px] font-semibold text-muted-foreground hover:text-red-500"
        >
          Remove
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <label>
          <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
            Curve
          </span>
          <select
            value={path.curve}
            onChange={event =>
              onChange({
                ...path,
                curve: event.target
                  .value as InteractiveMotionPathCurve,
              })
            }
            className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
          >
            <option value="smooth">Smooth</option>
            <option value="linear">Straight lines</option>
          </select>
        </label>

        <label className="flex items-end">
          <button
            type="button"
            aria-pressed={path.autoRotate}
            onClick={() =>
              onChange({
                ...path,
                autoRotate: !path.autoRotate,
              })
            }
            className={`w-full rounded-md border px-1.5 py-1 text-[7px] font-semibold ${
              path.autoRotate
                ? "border-[#2e0562]/30 bg-[#2e0562] text-white"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            Auto-rotate
          </button>
        </label>
      </div>

      {!embedded && (
        <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-[6.5px] leading-relaxed text-muted-foreground">
          Purple path handles are draggable directly on the canvas. X/Y are offsets from the object&apos;s saved base position.
        </div>
      )}

      <div className="mt-2 space-y-1">
        {path.points.map(point => (
          <div
            key={point.id}
            className="grid grid-cols-[38px_1fr_1fr_22px] items-end gap-1"
          >
            <label>
              <span className="mb-0.5 block text-[6px] font-semibold text-muted-foreground">
                %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(point.progress)}
                onChange={event => {
                  const next = Math.max(
                    0,
                    Math.min(100, Number(event.target.value) || 0),
                  );
                  onChange({
                    ...path,
                    points: path.points
                      .map(item =>
                        item.id === point.id
                          ? { ...item, progress: next }
                          : item,
                      )
                      .sort((a, b) => a.progress - b.progress),
                  });
                }}
                className="w-full rounded-md border border-border bg-background px-1 py-1 text-[7px] text-foreground outline-none"
              />
            </label>

            <label>
              <span className="mb-0.5 block text-[6px] font-semibold text-muted-foreground">
                X
              </span>
              <input
                type="number"
                step={10}
                value={Math.round(point.x)}
                onChange={event => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  onChange({
                    ...path,
                    points: path.points.map(item =>
                      item.id === point.id
                        ? { ...item, x: value }
                        : item,
                    ),
                  });
                }}
                className="w-full rounded-md border border-border bg-background px-1 py-1 text-[7px] text-foreground outline-none"
              />
            </label>

            <label>
              <span className="mb-0.5 block text-[6px] font-semibold text-muted-foreground">
                Y
              </span>
              <input
                type="number"
                step={10}
                value={Math.round(point.y)}
                onChange={event => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  onChange({
                    ...path,
                    points: path.points.map(item =>
                      item.id === point.id
                        ? { ...item, y: value }
                        : item,
                    ),
                  });
                }}
                className="w-full rounded-md border border-border bg-background px-1 py-1 text-[7px] text-foreground outline-none"
              />
            </label>

            <button
              type="button"
              disabled={path.points.length <= 2}
              onClick={() =>
                onChange({
                  ...path,
                  points: path.points.filter(
                    item => item.id !== point.id,
                  ),
                })
              }
              className="mb-[1px] flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-25"
              title="Delete path point"
            >
              <Trash2 size={7} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPoint}
        disabled={
          path.points.length >= 12 ||
          path.points.some(
            point =>
              Math.abs(point.progress - Math.round(progress)) <
              0.01,
          )
        }
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#2e0562]/25 py-1.5 text-[6.8px] font-semibold text-[#2e0562] disabled:opacity-30"
      >
        <Plus size={8} />
        Path point at {Math.round(progress)}%
      </button>
    </div>
  );
}
