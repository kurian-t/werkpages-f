import {
  Plus,
  Trash2,
} from "lucide-react";
import type {
  InteractiveAnimationEasing,
  InteractiveAnimationProperty,
  InteractiveScrollTrack,
} from "./resumeInteractive";
import {
  animationTrackDefaults,
  createInteractiveScrollTrack,
} from "./resumeInteractive";
import { scrollTrackValueAt } from "./InteractiveScrollMotion";

function propertyMeta(
  property: InteractiveAnimationProperty,
): {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
} {
  if (property === "x") {
    return { label: "Move X", min: -3000, max: 3000, step: 10, unit: "px" };
  }
  if (property === "y") {
    return { label: "Move Y", min: -3000, max: 3000, step: 10, unit: "px" };
  }
  if (property === "rotation") {
    return { label: "Rotation", min: -720, max: 720, step: 5, unit: "°" };
  }
  if (property === "scale") {
    return { label: "Scale", min: 0, max: 5, step: 0.05, unit: "×" };
  }
  if (property === "blur") {
    return { label: "Blur", min: 0, max: 80, step: 1, unit: "px" };
  }
  return { label: "Opacity", min: 0, max: 1, step: 0.05, unit: "" };
}

function nextAvailableProperty(
  tracks: InteractiveScrollTrack[],
): InteractiveAnimationProperty {
  const used = new Set(tracks.map(track => track.property));
  return (
    (["y", "x", "opacity", "scale", "rotation", "blur"] as const).find(
      property => !used.has(property),
    ) ?? "y"
  );
}

function sortTrack(track: InteractiveScrollTrack): InteractiveScrollTrack {
  return {
    ...track,
    keyframes: [...track.keyframes].sort(
      (a, b) => a.progress - b.progress,
    ),
  };
}

export default function InteractiveScrollMotionEditor({
  tracks,
  progress,
  onChange,
  embedded = false,
}: {
  tracks: InteractiveScrollTrack[] | undefined;
  progress: number;
  onChange: (tracks: InteractiveScrollTrack[] | undefined) => void;
  embedded?: boolean;
}) {
  const current = tracks ?? [];

  const updateTrack = (
    trackId: string,
    updater: (
      current: InteractiveScrollTrack,
    ) => InteractiveScrollTrack,
  ) => {
    const next = current.map(track =>
      track.id === trackId ? sortTrack(updater(track)) : track,
    );
    onChange(next.length ? next : undefined);
  };

  const addTrack = () => {
    if (current.length >= 8) return;
    const property = nextAvailableProperty(current);
    onChange([...current, createInteractiveScrollTrack(property)]);
  };

  const addKeyframe = (track: InteractiveScrollTrack) => {
    const roundedProgress = Math.round(progress);
    const existing = track.keyframes.find(
      keyframe => Math.abs(keyframe.progress - roundedProgress) < 0.01,
    );

    if (existing) return;

    const value = scrollTrackValueAt(track, roundedProgress);
    updateTrack(track.id, item => ({
      ...item,
      keyframes: [
        ...item.keyframes,
        {
          id: `scroll-keyframe-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          progress: roundedProgress,
          value,
        },
      ],
    }));
  };

  return (
    <div className={embedded ? "space-y-2" : "mt-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/[0.025] p-2"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {!embedded && (
            <div className="text-[7px] font-bold uppercase tracking-wider text-[#2e0562]">
              Scroll motion
            </div>
          )}
          <div className={`${embedded ? "text-[7px] font-semibold text-foreground" : "mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground"}`}>
            {embedded
              ? `Timeline position · ${Math.round(progress)}%`
              : "Values follow the scene's 0–100% visitor scroll."}
          </div>
        </div>

        <button
          type="button"
          onClick={addTrack}
          disabled={current.length >= 8}
          className="flex h-6 items-center gap-1 rounded-md border border-[#2e0562]/20 bg-background px-1.5 text-[6.8px] font-semibold text-[#2e0562] disabled:opacity-30"
        >
          <Plus size={8} />
          Track
        </button>
      </div>

      {!embedded && (
        <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-[6.5px] leading-relaxed text-muted-foreground">
          Drag the timeline below the scene, then add a keyframe at the current percentage. Scroll motion never changes the object&apos;s saved X/Y.
        </div>
      )}

      <div className="mt-2 space-y-2">
        {current.map((track, trackIndex) => {
          const meta = propertyMeta(track.property);

          return (
            <div
              key={track.id}
              className="rounded-lg border border-border bg-background p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[7px] font-bold text-foreground">
                  Scroll track {trackIndex + 1}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = current.filter(
                      item => item.id !== track.id,
                    );
                    onChange(next.length ? next : undefined);
                  }}
                  title="Remove scroll track"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={8} />
                </button>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label>
                  <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                    Property
                  </span>
                  <select
                    value={track.property}
                    onChange={event => {
                      const property = event.target
                        .value as InteractiveAnimationProperty;
                      const defaults = animationTrackDefaults(property);

                      updateTrack(track.id, item => ({
                        ...item,
                        property,
                        keyframes: [
                          {
                            ...item.keyframes[0],
                            progress: 0,
                            value: defaults.from,
                          },
                          {
                            ...(item.keyframes[item.keyframes.length - 1] ??
                              item.keyframes[0]),
                            progress: 100,
                            value: defaults.to,
                          },
                        ],
                      }));
                    }}
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
                  >
                    <option value="x">Move X</option>
                    <option value="y">Move Y</option>
                    <option value="rotation">Rotation</option>
                    <option value="scale">Scale</option>
                    <option value="opacity">Opacity</option>
                    <option value="blur">Blur</option>
                  </select>
                </label>

                <label>
                  <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                    Easing
                  </span>
                  <select
                    value={track.easing}
                    onChange={event =>
                      updateTrack(track.id, item => ({
                        ...item,
                        easing: event.target
                          .value as InteractiveAnimationEasing,
                      }))
                    }
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
                  >
                    <option value="linear">Linear</option>
                    <option value="ease">Ease</option>
                    <option value="ease-in">Ease in</option>
                    <option value="ease-out">Ease out</option>
                    <option value="ease-in-out">Ease in/out</option>
                  </select>
                </label>
              </div>

              <div className="mt-2 space-y-1">
                {track.keyframes.map((keyframe, index) => (
                  <div
                    key={keyframe.id}
                    className="grid grid-cols-[42px_1fr_22px] items-end gap-1"
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
                        value={Math.round(keyframe.progress)}
                        onChange={event => {
                          const nextProgress = Math.max(
                            0,
                            Math.min(100, Number(event.target.value) || 0),
                          );
                          updateTrack(track.id, item => ({
                            ...item,
                            keyframes: item.keyframes.map(frame =>
                              frame.id === keyframe.id
                                ? { ...frame, progress: nextProgress }
                                : frame,
                            ),
                          }));
                        }}
                        className="w-full rounded-md border border-border bg-background px-1 py-1 text-[7px] text-foreground outline-none"
                      />
                    </label>

                    <label>
                      <span className="mb-0.5 block text-[6px] font-semibold text-muted-foreground">
                        {meta.label} {meta.unit}
                      </span>
                      <input
                        type="number"
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={keyframe.value}
                        onChange={event => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;

                          updateTrack(track.id, item => ({
                            ...item,
                            keyframes: item.keyframes.map(frame =>
                              frame.id === keyframe.id
                                ? { ...frame, value }
                                : frame,
                            ),
                          }));
                        }}
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7px] text-foreground outline-none"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={track.keyframes.length <= 2}
                      onClick={() =>
                        updateTrack(track.id, item => ({
                          ...item,
                          keyframes: item.keyframes.filter(
                            frame => frame.id !== keyframe.id,
                          ),
                        }))
                      }
                      title={
                        track.keyframes.length <= 2
                          ? "A scroll track needs at least two keyframes"
                          : "Delete keyframe"
                      }
                      className="mb-[1px] flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-25"
                    >
                      <Trash2 size={7} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addKeyframe(track)}
                disabled={
                  track.keyframes.length >= 12 ||
                  track.keyframes.some(
                    keyframe =>
                      Math.abs(keyframe.progress - Math.round(progress)) <
                      0.01,
                  )
                }
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#2e0562]/25 py-1.5 text-[6.8px] font-semibold text-[#2e0562] disabled:opacity-30"
              >
                <Plus size={8} />
                Keyframe at {Math.round(progress)}%
              </button>
            </div>
          );
        })}

        {!current.length && (
          <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[6.8px] leading-relaxed text-muted-foreground">
            Add a scroll track to move, rotate, scale, fade or blur this
            object as the visitor moves through the scene.
          </div>
        )}
      </div>
    </div>
  );
}
