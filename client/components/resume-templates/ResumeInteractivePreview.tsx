import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers3,
  LayoutTemplate,
  Lock,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCcw,
  Search,
  Sparkles,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  Unlock,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ResumeData, ResumeDesign } from "./types";
import InteractiveAdvancedMotion from "./InteractiveAdvancedMotion";
import InteractiveScrollMotion from "./InteractiveScrollMotion";
import InteractiveScrollMotionEditor from "./InteractiveScrollMotionEditor";
import InteractivePathMotion from "./InteractivePathMotion";
import InteractiveMotionPathEditor from "./InteractiveMotionPathEditor";
import InteractiveMotionPathOverlay from "./InteractiveMotionPathOverlay";
import InteractiveParallaxLayer, {
  type InteractiveParallaxPointer,
} from "./InteractiveParallaxLayer";
import InteractiveSceneTransitionOverlay from "./InteractiveSceneTransition";
import InteractiveTemplateGallery from "./InteractiveTemplateGallery";
import {
  buildInteractiveTemplate,
  normalizeInteractiveTemplateId,
  type InteractiveTemplateId,
} from "./resumeInteractiveTemplates";
import { getResumeProjects } from "./resumeProjects";
import {
  addInteractiveObject,
  addInteractiveScene,
  animationTrackDefaults,
  createInteractiveAnimationTrack,
  createInteractiveObject,
  duplicateInteractiveObject,
  duplicateInteractiveScene,
  getActiveInteractiveScene,
  getOrderedInteractiveScenes,
  moveInteractiveObjectLayer,
  moveInteractiveScene,
  removeInteractiveObject,
  removeInteractiveScene,
  setActiveInteractiveScene,
  updateInteractiveObject,
  updateInteractiveScene,
  type InteractiveAmbientEffect,
  type InteractiveAnimationEasing,
  type InteractiveAnimationProperty,
  type InteractiveAnimationTrack,
  type InteractiveAnimationTrigger,
  type InteractiveMotionPath,
  type InteractiveObjectAppearance,
  type InteractiveObjectGeometry,
  type InteractiveObjectMotionPreset,
  type InteractiveResumeContentBinding,
  type InteractiveScene,
  type InteractiveSceneBackground,
  type InteractiveSceneTransitionType,
  type InteractiveScrollBehavior,
  type InteractiveSceneCollection,
  type InteractiveSceneObject,
} from "./resumeInteractive";
import {
  buildAmbientParticles,
  INTERACTIVE_MOTION_CSS,
  objectMotionAnimation,
} from "./resumeInteractiveMotion";
import {
  getInteractiveBindingOptions,
  interactiveBindingDisplayName,
  resolveInteractiveBinding,
  type InteractiveBindingOption,
} from "./resumeInteractiveBindings";
import {
  getResumeWebExperienceState,
  initializeInteractiveExperience,
  updateInteractiveExperience,
  type InteractiveExperienceStartMethod,
  type InteractiveExperienceState,
} from "./resumeWebExperience";

const SELECTION = "#7c3aed";
const GRID = 8;
const SNAP_THRESHOLD = 9;
const MAX_HISTORY = 60;

type SnapGuides = {
  x?: number;
  y?: number;
};

type LiveGeometry = {
  objectId: string;
  geometry: InteractiveObjectGeometry;
};

function ChoiceCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[146px] flex-col rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-[#2e0562]/35 hover:bg-[#2e0562]/[0.025]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2e0562]/8 text-[#2e0562]">
          {icon}
        </div>
        {badge && (
          <span className="rounded-full bg-[#2e0562]/8 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-[#2e0562]">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4 text-[12px] font-semibold text-foreground">
        {title}
      </div>
      <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
        {description}
      </p>

      <div className="mt-auto flex items-center gap-1 pt-3 text-[9px] font-semibold text-[#2e0562]">
        Choose
        <ArrowRight
          size={11}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </button>
  );
}

function startLabel(method: InteractiveExperienceStartMethod): string {
  if (method === "responsive") return "Imported from Responsive Site";
  if (method === "template") return "Started from an interactive template";
  return "Started from a blank experience";
}

function safeColor(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback;
}

function sceneBackgroundStyle(
  background: InteractiveSceneBackground,
): CSSProperties {
  if (background.type === "transparent") {
    return { backgroundColor: "transparent" };
  }

  if (background.type === "gradient") {
    return {
      backgroundImage: `linear-gradient(135deg, ${
        background.color || "#ffffff"
      }, ${background.secondaryColor || "#f4f1fa"})`,
    };
  }

  if (background.type === "image" && background.imageUrl) {
    return {
      backgroundColor: background.color || "#ffffff",
      backgroundImage: `url("${background.imageUrl.replace(/"/g, "%22")}")`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize:
        background.imageFit === "contain"
          ? "contain"
          : background.imageFit === "stretch"
            ? "100% 100%"
            : "cover",
    };
  }

  return {
    backgroundColor: background.color || "#ffffff",
  };
}


function backgroundInk(
  background: InteractiveSceneBackground,
): string {
  const value = background.color ?? "#ffffff";
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#ffffff";

  const r = Number.parseInt(match[1].slice(0, 2), 16);
  const g = Number.parseInt(match[1].slice(2, 4), 16);
  const b = Number.parseInt(match[1].slice(4, 6), 16);
  const luminance =
    (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance > 0.62 ? "#2e0562" : "#ffffff";
}

function SceneEnvironment({
  scene,
}: {
  scene: InteractiveScene;
}) {
  const twinkles = buildAmbientParticles(
    scene.id,
    "twinkle",
    scene.ambient.twinkle,
  );
  const particles = buildAmbientParticles(
    scene.id,
    "particles",
    scene.ambient.particles,
  );
  const shapes = buildAmbientParticles(
    scene.id,
    "floatingShapes",
    scene.ambient.floatingShapes,
  );
  const ink = backgroundInk(scene.background);
  const gradient = scene.ambient.gradientDrift;
  const parallax = scene.ambient.parallax;

  const backgroundStyle: CSSProperties & Record<string, string | number> = {
    ...sceneBackgroundStyle(scene.background),
    position: "absolute",
    inset: parallax.enabled ? "-2.5%" : 0,
    zIndex: -5,
    pointerEvents: "none",
    transform: parallax.enabled
      ? "translate3d(var(--wp-parallax-x, 0px), var(--wp-parallax-y, 0px), 0) scale(1.05)"
      : undefined,
    transition: parallax.enabled
      ? "transform 120ms ease-out"
      : undefined,
  };

  if (
    gradient.enabled &&
    scene.background.type === "gradient"
  ) {
    backgroundStyle.backgroundSize = "220% 220%";
    backgroundStyle.animationName = "wp-interactive-gradient-drift";
    backgroundStyle.animationDuration = `${Math.max(
      4,
      18 / gradient.speed,
    )}s`;
    backgroundStyle.animationTimingFunction = "ease-in-out";
    backgroundStyle.animationIterationCount = "infinite";
  }

  return (
    <>
      <div
        data-wp-scene-background
        data-wp-gradient-drift={
          gradient.enabled ? "true" : undefined
        }
        data-wp-parallax={parallax.enabled ? "true" : undefined}
        style={backgroundStyle}
      />

      {twinkles.map(particle => (
        <span
          key={particle.id}
          data-wp-ambient-effect="twinkle"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            zIndex: -2,
            borderRadius: "50%",
            background: ink,
            boxShadow: `0 0 ${particle.size * 2.5}px ${ink}`,
            opacity: particle.opacity,
            pointerEvents: "none",
            animationName: "wp-interactive-twinkle",
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          }}
        />
      ))}

      {particles.map(particle => (
        <span
          key={particle.id}
          data-wp-ambient-effect="particles"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            zIndex: -2,
            borderRadius: "50%",
            background: ink,
            opacity: particle.opacity * 0.72,
            pointerEvents: "none",
            animationName: "wp-interactive-particle",
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            ["--wp-drift-x" as string]: `${particle.driftX}px`,
            ["--wp-drift-y" as string]: `${particle.driftY}px`,
          }}
        />
      ))}

      {shapes.map(particle => (
        <span
          key={particle.id}
          data-wp-ambient-effect="floating-shapes"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            zIndex: -2,
            borderRadius:
              particle.shape === "circle" ? "50%" : "3px",
            border: `1px solid ${ink}`,
            background:
              particle.shape === "circle"
                ? `${ink}18`
                : "transparent",
            opacity: particle.opacity * 0.6,
            pointerEvents: "none",
            animationName: "wp-interactive-shape",
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            ["--wp-drift-x" as string]: `${particle.driftX}px`,
            ["--wp-drift-y" as string]: `${particle.driftY}px`,
            ["--wp-start-rotation" as string]: `${particle.rotation}deg`,
            transform:
              particle.shape === "diamond"
                ? "rotate(45deg)"
                : undefined,
          }}
        />
      ))}
    </>
  );
}

function AmbientEffectEditor({
  label,
  description,
  effect,
  showDensity = true,
  onChange,
}: {
  label: string;
  description: string;
  effect: InteractiveAmbientEffect;
  showDensity?: boolean;
  onChange: (next: InteractiveAmbientEffect) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-2 ${
        effect.enabled
          ? "border-[#2e0562]/25 bg-[#2e0562]/5"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...effect,
              enabled: !effect.enabled,
            })
          }
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-[8.5px] font-semibold text-foreground">
            {label}
          </div>
          <div className="mt-0.5 text-[6.8px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        </button>

        <button
          type="button"
          aria-pressed={effect.enabled}
          onClick={() =>
            onChange({
              ...effect,
              enabled: !effect.enabled,
            })
          }
          className={`relative mt-0.5 h-[18px] w-[32px] flex-none rounded-full transition-colors ${
            effect.enabled
              ? "bg-[#2e0562]"
              : "bg-muted"
          }`}
        >
          <span
            className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform"
            style={{
              left: 2,
              transform: effect.enabled
                ? "translateX(14px)"
                : "translateX(0)",
            }}
          />
        </button>
      </div>

      {effect.enabled && (
        <div className="mt-2 space-y-1.5 border-t border-[#2e0562]/10 pt-2">
          {showDensity && (
            <label className="grid grid-cols-[48px_1fr_28px] items-center gap-1.5">
              <span className="text-[6.8px] font-semibold text-muted-foreground">
                Amount
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={effect.density}
                onChange={event =>
                  onChange({
                    ...effect,
                    density: Number(event.target.value),
                  })
                }
                className="min-w-0"
              />
              <span className="text-right text-[6.5px] text-muted-foreground">
                {Math.round(effect.density)}
              </span>
            </label>
          )}

          <label className="grid grid-cols-[48px_1fr_28px] items-center gap-1.5">
            <span className="text-[6.8px] font-semibold text-muted-foreground">
              Speed
            </span>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={effect.speed}
              onChange={event =>
                onChange({
                  ...effect,
                  speed: Number(event.target.value),
                })
              }
              className="min-w-0"
            />
            <span className="text-right text-[6.5px] text-muted-foreground">
              {effect.speed.toFixed(1)}×
            </span>
          </label>

          <label className="grid grid-cols-[48px_1fr_28px] items-center gap-1.5">
            <span className="text-[6.8px] font-semibold text-muted-foreground">
              Strength
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={effect.intensity}
              onChange={event =>
                onChange({
                  ...effect,
                  intensity: Number(event.target.value),
                })
              }
              className="min-w-0"
            />
            <span className="text-right text-[6.5px] text-muted-foreground">
              {Math.round(effect.intensity)}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function cloneCollection(
  collection: InteractiveSceneCollection,
): InteractiveSceneCollection {
  return JSON.parse(JSON.stringify(collection)) as InteractiveSceneCollection;
}

function collectionFromInteractive(
  interactive: InteractiveExperienceState,
): InteractiveSceneCollection {
  return {
    sceneOrder: interactive.sceneOrder,
    scenes: interactive.scenes,
    activeSceneId: interactive.activeSceneId,
  };
}

function sameGeometry(
  a: InteractiveObjectGeometry,
  b: InteractiveObjectGeometry,
): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.opacity === b.opacity &&
    a.zIndex === b.zIndex &&
    !!a.hidden === !!b.hidden
  );
}

function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next <= -180) next += 360;
  return Math.round(next * 10) / 10;
}

function snapRotation(value: number): number {
  const normalized = normalizeRotation(value);
  for (const target of [0, 45, 90, 135, 180, -45, -90, -135]) {
    if (Math.abs(normalized - target) <= 5) return target;
  }
  return normalized;
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}
function suggestedBoundContentSize(
  binding: InteractiveResumeContentBinding,
): { width: number; height: number } {
  const field = binding.field ?? "entry";

  if (field === "logoUrl" || field === "imageUrl") {
    return { width: 240, height: 190 };
  }

  if (binding.source === "work" && field === "entry") {
    return { width: 500, height: 310 };
  }

  if (binding.source === "project" && field === "entry") {
    return { width: 500, height: 330 };
  }

  if (binding.source === "education" && field === "entry") {
    return { width: 460, height: 190 };
  }

  if (
    field === "body" ||
    field === "description" ||
    field === "summary"
  ) {
    return { width: 460, height: 230 };
  }

  if (binding.source === "link") {
    return { width: 420, height: 120 };
  }

  return { width: 420, height: 130 };
}


function axisSnap(
  position: number,
  size: number,
  sceneSize: number,
  otherTargets: number[],
): {
  position: number;
  guide?: number;
} {
  const anchors = [
    { value: position, offset: 0 },
    { value: position + size / 2, offset: size / 2 },
    { value: position + size, offset: size },
  ];

  const targets = [0, sceneSize / 2, sceneSize, ...otherTargets];
  let best:
    | {
        distance: number;
        position: number;
        guide: number;
      }
    | undefined;

  anchors.forEach(anchor => {
    targets.forEach(target => {
      const distance = Math.abs(anchor.value - target);
      if (
        distance <= SNAP_THRESHOLD &&
        (!best || distance < best.distance)
      ) {
        best = {
          distance,
          position: target - anchor.offset,
          guide: target,
        };
      }
    });
  });

  return best
    ? {
        position: best.position,
        guide: best.guide,
      }
    : {
        position: snapToGrid(position),
      };
}

function snapMoveGeometry(
  scene: InteractiveScene,
  objectId: string,
  geometry: InteractiveObjectGeometry,
  enabled: boolean,
): {
  geometry: InteractiveObjectGeometry;
  guides: SnapGuides;
} {
  if (!enabled) {
    return {
      geometry,
      guides: {},
    };
  }

  const xTargets: number[] = [];
  const yTargets: number[] = [];

  scene.objectOrder.forEach(id => {
    if (id === objectId) return;
    const other = scene.objects[id];
    if (!other || other.geometry.hidden) return;
    const g = other.geometry;
    xTargets.push(g.x, g.x + g.width / 2, g.x + g.width);
    yTargets.push(g.y, g.y + g.height / 2, g.y + g.height);
  });

  const x = axisSnap(
    geometry.x,
    geometry.width,
    scene.width,
    xTargets,
  );
  const y = axisSnap(
    geometry.y,
    geometry.height,
    scene.height,
    yTargets,
  );

  return {
    geometry: {
      ...geometry,
      x: x.position,
      y: y.position,
    },
    guides: {
      x: x.guide,
      y: y.guide,
    },
  };
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[8.5px] font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center rounded-lg border border-border bg-background px-2">
        <input
          type="number"
          value={
            step < 1
              ? Math.round(value * 100) / 100
              : Math.round(value)
          }
          min={min}
          max={max}
          step={step}
          onChange={event => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[10px] text-foreground outline-none"
        />
        {suffix && (
          <span className="ml-1 text-[8px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function interactiveObjectAppearanceStyle(
  appearance: InteractiveObjectAppearance | undefined,
): {
  shell: CSSProperties;
  textColor: string;
  mutedColor: string;
  accentColor: string;
} {
  const variant = appearance?.variant ?? "card";
  const textColor = appearance?.textColor ?? "#2e0562";
  const accentColor = appearance?.accentColor ?? textColor;
  const surfaceColor =
    appearance?.surfaceColor ??
    (
      variant === "plain"
        ? "transparent"
        : variant === "glass"
          ? "rgba(255,255,255,.12)"
          : variant === "terminal"
            ? "rgba(4,15,8,.94)"
            : "#ffffff"
    );
  const borderColor =
    appearance?.borderColor ??
    (
      variant === "plain"
        ? "transparent"
        : variant === "glass"
          ? "rgba(255,255,255,.26)"
          : variant === "terminal"
            ? "#1e6a36"
            : "rgba(46,5,98,.10)"
    );
  const radius =
    appearance?.radius ??
    (variant === "terminal" ? 8 : variant === "plain" ? 0 : 14);

  const shell: CSSProperties = {
    background: surfaceColor,
    color: textColor,
    border:
      variant === "plain"
        ? "none"
        : `1px solid ${borderColor}`,
    borderRadius: radius,
    boxSizing: "border-box",
    boxShadow:
      variant === "glass"
        ? "0 18px 45px rgba(0,0,0,.16), inset 0 1px rgba(255,255,255,.14)"
        : variant === "accent"
          ? `0 10px 28px ${accentColor}18`
          : "none",
    backdropFilter:
      variant === "glass" ? "blur(10px)" : undefined,
    fontFamily:
      variant === "terminal"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : undefined,
  };

  return {
    shell,
    textColor,
    mutedColor: `${textColor}A6`,
    accentColor,
  };
}

function SceneObjectContent({
  object,
  data,
}: {
  object: InteractiveSceneObject;
  data: ResumeData;
}) {
  const appearance = interactiveObjectAppearanceStyle(object.appearance);

  if (object.type === "shape") {
    return (
      <div
        className="h-full w-full"
        style={{
          borderRadius: object.shape === "ellipse" ? "999px" : 3,
          background:
            object.shape === "line"
              ? "transparent"
              : object.fill || "#ede9fe",
          border:
            object.shape === "line"
              ? "none"
              : `${object.strokeWidth ?? 1}px solid ${
                  object.stroke || "#7c3aed"
                }`,
          borderTop:
            object.shape === "line"
              ? `${Math.max(1, object.strokeWidth ?? 1)}px solid ${
                  object.stroke || "#7c3aed"
                }`
              : undefined,
          boxSizing: "border-box",
        }}
      />
    );
  }

  if (object.type === "image") {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#7c3aed]/5">
        {object.src ? (
          <img
            src={object.src}
            alt={object.alt || ""}
            draggable={false}
            className="block h-full w-full select-none"
            style={{
              objectFit:
                object.fit === "contain"
                  ? "contain"
                  : object.fit === "stretch"
                    ? "fill"
                    : "cover",
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[8px] font-semibold text-[#2e0562]">
            <ImageIcon size={14} />
            Image
          </div>
        )}
      </div>
    );
  }

  if (object.type === "resume-content") {
    const resolved = resolveInteractiveBinding(data, object.binding);

    if (!resolved) {
      return (
        <div
          className="flex h-full w-full items-center gap-2 overflow-hidden px-3"
          style={appearance.shell}
        >
          <UserRound size={14} className="flex-none" />
          <div className="min-w-0">
            <div className="truncate text-[8px] font-bold">
              Resume content
            </div>
            <div
              className="truncate text-[6.5px] font-medium"
              style={{ color: appearance.mutedColor }}
            >
              Choose shared content
            </div>
          </div>
        </div>
      );
    }

    if (!resolved.found) {
      return (
        <div className="flex h-full w-full items-center gap-2 overflow-hidden rounded border border-amber-200 bg-amber-50 px-3 text-amber-800">
          <UserRound size={14} className="flex-none" />
          <div className="min-w-0">
            <div className="truncate text-[8px] font-bold">
              {resolved.primary}
            </div>
            <div className="truncate text-[6.5px] font-medium text-amber-700/70">
              {resolved.secondary}
            </div>
          </div>
        </div>
      );
    }

    const imageOnly =
      !!resolved.imageUrl &&
      !resolved.body &&
      !resolved.secondary &&
      (
        object.binding?.field === "logoUrl" ||
        object.binding?.field === "imageUrl"
      );

    if (imageOnly) {
      return (
        <div
          className="flex h-full w-full items-center justify-center overflow-hidden p-2"
          style={appearance.shell}
        >
          <img
            src={resolved.imageUrl}
            alt={resolved.primary || resolved.label}
            draggable={false}
            className="block h-full w-full select-none object-contain"
          />
        </div>
      );
    }

    return (
      <div
        className="flex h-full w-full overflow-hidden"
        style={appearance.shell}
      >
        {resolved.imageUrl && (
          <div
            className="flex w-[22%] min-w-[34px] flex-none items-center justify-center border-r p-2"
            style={{ borderColor: `${appearance.accentColor}2B` }}
          >
            <img
              src={resolved.imageUrl}
              alt=""
              draggable={false}
              className="max-h-full max-w-full select-none object-contain"
            />
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-hidden px-3 py-2">
          <div
            className="truncate text-[6px] font-bold uppercase tracking-wider"
            style={{ color: appearance.accentColor, opacity: 0.68 }}
          >
            {resolved.label}
          </div>
          <div className="mt-0.5 truncate text-[8.5px] font-bold">
            {resolved.primary || "Empty shared field"}
          </div>
          {resolved.secondary && (
            <div
              className="mt-0.5 truncate text-[6.8px] font-medium"
              style={{ color: appearance.mutedColor }}
            >
              {resolved.secondary}
            </div>
          )}
          {resolved.body && (
            <div
              className="mt-1.5 whitespace-pre-line text-[6.7px] font-medium leading-relaxed"
              style={{
                color: appearance.mutedColor,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 8,
                overflow: "hidden",
              }}
            >
              {resolved.body}
            </div>
          )}
          {resolved.href && (
            <div
              className="mt-1 truncate text-[6px] font-semibold"
              style={{ color: appearance.accentColor, opacity: 0.72 }}
            >
              {resolved.href}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-3"
      style={appearance.shell}
    >
      <div
        className="line-clamp-4 text-[8px] font-semibold leading-relaxed"
        style={{ color: appearance.textColor }}
      >
        {object.text || "Text"}
      </div>
    </div>
  );
}

function EditorObject({
  object,
  scene,
  data,
  selected,
  geometry,
  motionReplayKey,
  scrollProgress,
  parallaxPointer,
  onPointerDown,
  onSelect,
  onResizePointerDown,
  onRotatePointerDown,
}: {
  object: InteractiveSceneObject;
  scene: InteractiveScene;
  data: ResumeData;
  selected: boolean;
  geometry: InteractiveObjectGeometry;
  motionReplayKey: number;
  scrollProgress: number;
  parallaxPointer: InteractiveParallaxPointer;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
  ) => void;
  onSelect: (objectId: string) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
    horizontal: "left" | "right",
    vertical: "top" | "bottom",
  ) => void;
  onRotatePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
  ) => void;
}) {
  if (geometry.hidden) return null;

  const handles = [
    ["left", "top"],
    ["right", "top"],
    ["left", "bottom"],
    ["right", "bottom"],
  ] as const;

  return (
    <div
      data-interactive-object={object.id}
      onPointerDown={event => onPointerDown(event, object)}
      onClick={event => {
        event.stopPropagation();
        onSelect(object.id);
      }}
      style={{
        position: "absolute",
        left: `${(geometry.x / scene.width) * 100}%`,
        top: `${(geometry.y / scene.height) * 100}%`,
        width: `${(geometry.width / scene.width) * 100}%`,
        height: `${(geometry.height / scene.height) * 100}%`,
        opacity: geometry.opacity,
        rotate: geometry.rotation
          ? `${geometry.rotation}deg`
          : undefined,
        transformOrigin: "center center",
        zIndex: geometry.zIndex,
        cursor: object.locked
          ? "default"
          : selected
            ? "move"
            : "grab",
        touchAction: "none",
        userSelect: "none",
        overflow: "visible",
        boxSizing: "border-box",
      }}
    >
      {(() => {
        const motion = objectMotionAnimation(object.motion);
        const motionStyle: CSSProperties & Record<string, string | number> = {
          width: "100%",
          height: "100%",
          animationName: motion.animationName,
          animationDuration: motion.animationDuration,
          animationDelay: motion.animationDelay,
          animationTimingFunction: motion.animationTimingFunction,
          animationIterationCount: motion.animationIterationCount,
          animationDirection: motion.animationDirection,
          transformOrigin: motion.transformOrigin,
          ...(motion.variables ?? {}),
        };

        return (
          <InteractiveParallaxLayer
            depth={object.parallaxDepth}
            pointer={parallaxPointer}
            intensity={scene.ambient.parallax.intensity}
            enabled={scene.ambient.parallax.enabled}
          >
            <InteractivePathMotion
              path={object.motionPath}
              progress={scrollProgress}
            >
              <InteractiveScrollMotion
                tracks={object.scrollTracks}
                progress={scrollProgress}
              >
                <InteractiveAdvancedMotion
                  tracks={object.animationTracks}
                  replayKey={motionReplayKey}
                >
                  <div
                    data-wp-interactive-motion={
                      object.motion?.preset || undefined
                    }
                    className="h-full w-full overflow-hidden"
                    style={motionStyle}
                  >
                    <SceneObjectContent object={object} data={data} />
                  </div>
                </InteractiveAdvancedMotion>
              </InteractiveScrollMotion>
            </InteractivePathMotion>
          </InteractiveParallaxLayer>
        );
      })()}

      {selected && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[2px] rounded-[4px]"
            style={{
              border: object.locked
                ? "1.5px dashed #d97706"
                : `1.5px solid ${SELECTION}`,
              boxSizing: "border-box",
            }}
          />

          {object.locked ? (
            <div
              className="absolute left-1/2 top-[-22px] flex h-[17px] -translate-x-1/2 items-center gap-1 rounded bg-amber-500 px-1.5 text-[6px] font-bold text-white"
              style={{ pointerEvents: "none" }}
            >
              <Lock size={8} />
              LOCKED
            </div>
          ) : (
            <>
              {handles.map(([horizontal, vertical]) => (
                <div
                  key={`${horizontal}-${vertical}`}
                  role="button"
                  aria-label={`Resize ${horizontal} ${vertical}`}
                  onPointerDown={event =>
                    onResizePointerDown(
                      event,
                      object,
                      horizontal,
                      vertical,
                    )
                  }
                  style={{
                    position: "absolute",
                    width: 10,
                    height: 10,
                    border: `1.5px solid ${SELECTION}`,
                    borderRadius: 2,
                    background: "#fff",
                    boxSizing: "border-box",
                    pointerEvents: "auto",
                    left: horizontal === "left" ? -6 : undefined,
                    right: horizontal === "right" ? -6 : undefined,
                    top: vertical === "top" ? -6 : undefined,
                    bottom: vertical === "bottom" ? -6 : undefined,
                    cursor:
                      (horizontal === "left" && vertical === "top") ||
                      (horizontal === "right" && vertical === "bottom")
                        ? "nwse-resize"
                        : "nesw-resize",
                    zIndex: 20,
                  }}
                />
              ))}

              <div
                role="button"
                aria-label="Rotate object"
                title="Drag to rotate"
                onPointerDown={event =>
                  onRotatePointerDown(event, object)
                }
                style={{
                  position: "absolute",
                  top: -22,
                  left: "50%",
                  width: 14,
                  height: 14,
                  transform: "translateX(-50%)",
                  borderRadius: "50%",
                  background: SELECTION,
                  border: "2px solid white",
                  boxShadow: "0 1px 4px rgba(0,0,0,.24)",
                  boxSizing: "border-box",
                  cursor: "crosshair",
                  zIndex: 22,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function TransitionSceneSnapshot({
  scene,
  data,
  progress,
}: {
  scene: InteractiveScene;
  data: ResumeData;
  progress: number;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        isolation: "isolate",
        background: "transparent",
      }}
    >
      <SceneEnvironment scene={scene} />

      {scene.objectOrder.map(objectId => {
        const object = scene.objects[objectId];
        if (!object || object.geometry.hidden) return null;
        const geometry = object.geometry;

        return (
          <div
            key={object.id}
            style={{
              position: "absolute",
              left: `${(geometry.x / scene.width) * 100}%`,
              top: `${(geometry.y / scene.height) * 100}%`,
              width: `${(geometry.width / scene.width) * 100}%`,
              height: `${(geometry.height / scene.height) * 100}%`,
              opacity: geometry.opacity,
              rotate: geometry.rotation
                ? `${geometry.rotation}deg`
                : undefined,
              transformOrigin: "center center",
              zIndex: geometry.zIndex,
              overflow: "visible",
            }}
          >
            <InteractivePathMotion
              path={object.motionPath}
              progress={progress}
            >
              <InteractiveScrollMotion
                tracks={object.scrollTracks}
                progress={progress}
              >
                <div className="h-full w-full overflow-hidden">
                  <SceneObjectContent object={object} data={data} />
                </div>
              </InteractiveScrollMotion>
            </InteractivePathMotion>
          </div>
        );
      })}
    </div>
  );
}

function BindingPicker({
  options,
  query,
  onQueryChange,
  onChoose,
  onClose,
}: {
  options: InteractiveBindingOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onChoose: (option: InteractiveBindingOption) => void;
  onClose: () => void;
}) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter(option =>
        [
          option.group,
          option.label,
          option.detail ?? "",
        ].some(value =>
          value.toLowerCase().includes(normalized),
        ),
      )
    : options;

  const groups = [
    "Personal",
    "Experience",
    "Projects",
    "Education",
    "Skills",
    "Links",
  ] as const;

  return (
    <div
      data-interactive-binding-picker
      className="absolute right-0 top-9 z-[1300] overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      style={{
        width: 330,
        minWidth: 330,
        maxWidth: "min(330px, calc(100vw - 32px))",
      }}
    >
      <div className="border-b border-border p-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#2e0562]">
              Resume content
            </div>
            <div className="mt-0.5 text-[7.5px] text-muted-foreground">
              Bind to shared resume data
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-1 text-[8px] font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-2">
          <Search size={10} className="flex-none text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search name, role, project, skill…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[9px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto p-1.5">
        {groups.map(group => {
          const items = filtered.filter(option => option.group === group);
          if (!items.length) return null;

          return (
            <div key={group} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>

              <div className="space-y-0.5">
                {items.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onChoose(option)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#2e0562]/5"
                  >
                    <span className="mt-[2px] flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#2e0562]/8 text-[#2e0562]">
                      <UserRound size={9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[8.5px] font-semibold text-foreground">
                        {option.label}
                      </span>
                      {option.detail && (
                        <span className="mt-0.5 block truncate text-[7px] text-muted-foreground">
                          {option.detail}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {!filtered.length && (
          <div className="px-3 py-8 text-center text-[8px] text-muted-foreground">
            No shared resume content matches “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}

function animationPropertyMeta(
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

function AdvancedMotionEditor({
  tracks,
  onChange,
  onReplay,
}: {
  tracks: InteractiveAnimationTrack[] | undefined;
  onChange: (tracks: InteractiveAnimationTrack[] | undefined) => void;
  onReplay: () => void;
}) {
  const current = tracks ?? [];

  const updateTrack = (
    trackId: string,
    patch: Partial<InteractiveAnimationTrack>,
    replay = false,
  ) => {
    const next = current.map(track =>
      track.id === trackId ? { ...track, ...patch } : track,
    );
    onChange(next.length ? next : undefined);
    if (replay) onReplay();
  };

  const changeProperty = (
    track: InteractiveAnimationTrack,
    property: InteractiveAnimationProperty,
  ) => {
    const defaults = animationTrackDefaults(property);
    updateTrack(
      track.id,
      {
        property,
        from: defaults.from,
        to: defaults.to,
      },
      true,
    );
  };

  const changeTrigger = (
    track: InteractiveAnimationTrack,
    trigger: InteractiveAnimationTrigger,
  ) => {
    updateTrack(
      track.id,
      {
        trigger,
        duration:
          trigger === "loop" && track.duration < 1
            ? 2.8
            : track.duration,
      },
      true,
    );
  };

  return (
    <div className="mt-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/[0.025] p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[7px] font-bold uppercase tracking-wider text-[#2e0562]">
            Advanced motion
          </div>
          <div className="mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground">
            Animate individual properties with triggers.
          </div>
        </div>

        <button
          type="button"
          onClick={onReplay}
          title="Replay Load and Enter animations"
          className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[6.8px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw size={8} />
          Replay
        </button>
      </div>

      <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-[6.5px] leading-relaxed text-muted-foreground">
        Easy Motion and Advanced Motion can stack. X/Y tracks are visual
        offsets only — they never change the object&apos;s saved canvas position.
      </div>

      <div className="mt-2 space-y-2">
        {current.map((track, index) => {
          const meta = animationPropertyMeta(track.property);

          return (
            <div
              key={track.id}
              className="rounded-lg border border-border bg-background p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[7px] font-bold text-foreground">
                  Track {index + 1}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...current];
                      const [moved] = next.splice(index, 1);
                      next.splice(index - 1, 0, moved);
                      onChange(next);
                      onReplay();
                    }}
                    title="Move track up"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowUp size={8} />
                  </button>
                  <button
                    type="button"
                    disabled={index === current.length - 1}
                    onClick={() => {
                      const next = [...current];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + 1, 0, moved);
                      onChange(next);
                      onReplay();
                    }}
                    title="Move track down"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowDown size={8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = current.filter(item => item.id !== track.id);
                      onChange(next.length ? next : undefined);
                    }}
                    title="Remove animation track"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={8} />
                  </button>
                </div>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label>
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    Property
                  </span>
                  <select
                    value={track.property}
                    onChange={event =>
                      changeProperty(
                        track,
                        event.target.value as InteractiveAnimationProperty,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
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
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    Trigger
                  </span>
                  <select
                    value={track.trigger}
                    onChange={event =>
                      changeTrigger(
                        track,
                        event.target.value as InteractiveAnimationTrigger,
                      )
                    }
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                  >
                    <option value="load">On load</option>
                    <option value="enter">On enter</option>
                    <option value="hover">On hover</option>
                    <option value="click">On click</option>
                    <option value="loop">Loop</option>
                  </select>
                </label>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label>
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    From {meta.unit && `(${meta.unit})`}
                  </span>
                  <input
                    type="number"
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    value={track.from}
                    onChange={event => {
                      const from = Number(event.target.value);
                      if (Number.isFinite(from)) {
                        updateTrack(track.id, { from });
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    To {meta.unit && `(${meta.unit})`}
                  </span>
                  <input
                    type="number"
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    value={track.to}
                    onChange={event => {
                      const to = Number(event.target.value);
                      if (Number.isFinite(to)) {
                        updateTrack(track.id, { to });
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                  />
                </label>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label>
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    Duration (s)
                  </span>
                  <input
                    type="number"
                    min={0.05}
                    max={30}
                    step={0.05}
                    value={track.duration}
                    onChange={event => {
                      const duration = Number(event.target.value);
                      if (Number.isFinite(duration)) {
                        updateTrack(track.id, { duration });
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                    Delay (s)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.05}
                    value={track.delay}
                    onChange={event => {
                      const delay = Number(event.target.value);
                      if (Number.isFinite(delay)) {
                        updateTrack(track.id, { delay });
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                  />
                </label>
              </div>

              <label className="mt-1.5 block">
                <span className="mb-1 block text-[6.5px] font-semibold text-muted-foreground">
                  Easing
                </span>
                <select
                  value={track.easing}
                  onChange={event =>
                    updateTrack(track.id, {
                      easing: event.target.value as InteractiveAnimationEasing,
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[7.5px] text-foreground outline-none"
                >
                  <option value="linear">Linear</option>
                  <option value="ease">Ease</option>
                  <option value="ease-in">Ease in</option>
                  <option value="ease-out">Ease out</option>
                  <option value="ease-in-out">Ease in/out</option>
                </select>
              </label>

              <div className="mt-1.5 text-[6px] leading-relaxed text-muted-foreground">
                {track.trigger === "hover"
                  ? "Moves to To while hovered, then returns to From."
                  : track.trigger === "click"
                    ? "Each click toggles between From and To."
                    : track.trigger === "loop"
                      ? "Runs continuously back and forth."
                      : track.trigger === "load"
                        ? "Runs once when this experience is loaded."
                        : "Runs once when the object enters the viewport."}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={current.length >= 8}
        onClick={() => {
          const next = [
            ...current,
            createInteractiveAnimationTrack("opacity", "enter"),
          ];
          onChange(next);
          onReplay();
        }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2e0562]/25 bg-background px-2 py-1.5 text-[7.5px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5 disabled:opacity-35"
      >
        <Plus size={9} />
        {current.length >= 8 ? "8 track limit" : "Add advanced track"}
      </button>
    </div>
  );
}

function InteractiveEditor({
  data,
  onDesignChange,
  interactive,
}: {
  data: ResumeData;
  onDesignChange: (design: ResumeDesign) => void;
  interactive: InteractiveExperienceState;
}) {
  const scenes = getOrderedInteractiveScenes(interactive);
  const activeScene = getActiveInteractiveScene(interactive);
  const projectCount = getResumeProjects(data).length;
  const fullName = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(
    null,
  );
  const [liveGeometry, setLiveGeometry] =
    useState<LiveGeometry | null>(null);
  const [guides, setGuides] = useState<SnapGuides>({});
  const [zoom, setZoom] = useState(1);
  const [motionReplayKey, setMotionReplayKey] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollWheelPreview, setScrollWheelPreview] = useState(false);
  const [parallaxPointer, setParallaxPointer] =
    useState<InteractiveParallaxPointer>({ x: 0, y: 0 });
  const [liveMotionPath, setLiveMotionPath] =
    useState<InteractiveMotionPath | null>(null);
  const [transitionPlayKey, setTransitionPlayKey] = useState(0);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [bindingPickerMode, setBindingPickerMode] = useState<
    "add" | "change" | null
  >(null);
  const [bindingSearch, setBindingSearch] = useState("");
  const [, setHistoryVersion] = useState(0);

  const bindingOptions = getInteractiveBindingOptions(data);

  const canvasRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{
    past: InteractiveSceneCollection[];
    future: InteractiveSceneCollection[];
  }>({
    past: [],
    future: [],
  });

  const currentCollection = collectionFromInteractive(interactive);
  const selectedObject = selectedObjectId
    ? activeScene.objects[selectedObjectId] ?? null
    : null;

  const applyCollection = useCallback(
    (
      next: InteractiveSceneCollection,
      options?: {
        recordHistory?: boolean;
      },
    ) => {
      const recordHistory = options?.recordHistory !== false;

      if (recordHistory) {
        const history = historyRef.current;
        history.past.push(cloneCollection(currentCollection));
        if (history.past.length > MAX_HISTORY) history.past.shift();
        history.future = [];
        setHistoryVersion(value => value + 1);
      }

      onDesignChange(
        updateInteractiveExperience(
          data.design,
          current => ({
            ...current,
            ...next,
          }),
        ),
      );
    },
    [currentCollection, data.design, onDesignChange],
  );

  const mutateScenes = useCallback(
    (
      updater: (
        collection: InteractiveSceneCollection,
      ) => InteractiveSceneCollection,
      options?: {
        recordHistory?: boolean;
      },
    ) => {
      applyCollection(
        updater(currentCollection),
        options,
      );
    },
    [applyCollection, currentCollection],
  );

  const applyTemplate = (
    templateId: InteractiveTemplateId,
  ) => {
    const next = buildInteractiveTemplate(data, templateId);
    const history = historyRef.current;
    history.past.push(cloneCollection(currentCollection));
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.future = [];
    setHistoryVersion(value => value + 1);

    setSelectedObjectId(null);
    setLiveGeometry(null);
    setGuides({});
    setScrollProgress(0);
    setLiveMotionPath(null);
    setTemplateGalleryOpen(false);

    onDesignChange(
      updateInteractiveExperience(
        data.design,
        current => ({
          ...current,
          ...next,
          startMethod: "template",
          templateId,
        }),
      ),
    );
  };

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;

    history.future.push(cloneCollection(currentCollection));
    setHistoryVersion(value => value + 1);
    setSelectedObjectId(null);
    setLiveGeometry(null);
    setGuides({});
    applyCollection(previous, { recordHistory: false });
  }, [applyCollection, currentCollection]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;

    history.past.push(cloneCollection(currentCollection));
    setHistoryVersion(value => value + 1);
    setSelectedObjectId(null);
    setLiveGeometry(null);
    setGuides({});
    applyCollection(next, { recordHistory: false });
  }, [applyCollection, currentCollection]);

  const patchScene = (
    patch: Parameters<typeof updateInteractiveScene>[2],
  ) => {
    mutateScenes(collection =>
      updateInteractiveScene(
        collection,
        activeScene.id,
        patch,
      ),
    );
  };

  const patchSelectedObject = (
    updater: (
      object: InteractiveSceneObject,
    ) => InteractiveSceneObject,
  ) => {
    if (!selectedObjectId) return;
    mutateScenes(collection =>
      updateInteractiveObject(
        collection,
        activeScene.id,
        selectedObjectId,
        updater,
      ),
    );
  };

  const commitObjectGeometry = (
    objectId: string,
    geometry: InteractiveObjectGeometry,
  ) => {
    const current = activeScene.objects[objectId];
    if (!current || sameGeometry(current.geometry, geometry)) return;

    mutateScenes(collection =>
      updateInteractiveObject(
        collection,
        activeScene.id,
        objectId,
        object => ({
          ...object,
          geometry,
        } as InteractiveSceneObject),
      ),
    );
  };

  const addObject = (
    type: Exclude<
      InteractiveSceneObject["type"],
      "resume-content"
    >,
  ) => {
    const width = type === "shape" ? 260 : type === "image" ? 320 : 320;
    const height = type === "shape" ? 170 : type === "image" ? 220 : 90;

    const object = createInteractiveObject(type, {
      geometry: {
        x: Math.round((activeScene.width - width) / 2),
        y: Math.round((activeScene.height - height) / 2),
        width,
        height,
      },
    });

    mutateScenes(collection =>
      addInteractiveObject(
        collection,
        activeScene.id,
        object,
      ),
    );

    setSelectedObjectId(object.id);
    setAddMenuOpen(false);
    setBindingPickerMode(null);
  };

  const addBoundResumeContent = (
    option: InteractiveBindingOption,
  ) => {
    const suggested = suggestedBoundContentSize(option.binding);

    const object = createInteractiveObject(
      "resume-content",
      {
        name: option.label,
        geometry: {
          x: Math.round(
            (activeScene.width - suggested.width) / 2,
          ),
          y: Math.round(
            (activeScene.height - suggested.height) / 2,
          ),
          width: suggested.width,
          height: suggested.height,
        },
      },
    );

    const bound = object.type === "resume-content"
      ? {
          ...object,
          binding: option.binding,
        }
      : object;

    mutateScenes(collection =>
      addInteractiveObject(
        collection,
        activeScene.id,
        bound,
      ),
    );

    setSelectedObjectId(bound.id);
    setAddMenuOpen(false);
    setBindingPickerMode(null);
    setBindingSearch("");
  };

  const changeSelectedBinding = (
    bindingValue: InteractiveResumeContentBinding,
    label: string,
  ) => {
    const suggested = suggestedBoundContentSize(bindingValue);

    patchSelectedObject(current =>
      current.type === "resume-content"
        ? {
            ...current,
            name: label,
            binding: bindingValue,
            geometry: {
              ...current.geometry,
              width: Math.max(
                current.geometry.width,
                suggested.width,
              ),
              height: Math.max(
                current.geometry.height,
                suggested.height,
              ),
            },
          }
        : current,
    );
    setBindingPickerMode(null);
    setBindingSearch("");
  };

  const removeSelectedObject = useCallback(() => {
    if (!selectedObjectId) return;
    mutateScenes(collection =>
      removeInteractiveObject(
        collection,
        activeScene.id,
        selectedObjectId,
      ),
    );
    setSelectedObjectId(null);
  }, [
    activeScene.id,
    mutateScenes,
    selectedObjectId,
  ]);

  const duplicateSelectedObject = useCallback(() => {
    if (!selectedObjectId) return;

    const result = duplicateInteractiveObject(
      currentCollection,
      activeScene.id,
      selectedObjectId,
    );
    if (!result.objectId) return;

    applyCollection(result.collection);
    setSelectedObjectId(result.objectId);
  }, [
    activeScene.id,
    applyCollection,
    currentCollection,
    selectedObjectId,
  ]);

  const nudgeSelectedObject = useCallback(
    (dx: number, dy: number) => {
      if (!selectedObjectId) return;
      const object = activeScene.objects[selectedObjectId];
      if (!object || object.locked) return;

      mutateScenes(collection =>
        updateInteractiveObject(
          collection,
          activeScene.id,
          selectedObjectId,
          current => ({
            ...current,
            geometry: {
              ...current.geometry,
              x: current.geometry.x + dx,
              y: current.geometry.y + dy,
            },
          } as InteractiveSceneObject),
        ),
      );
    },
    [
      activeScene.id,
      activeScene.objects,
      mutateScenes,
      selectedObjectId,
    ],
  );

  useEffect(() => {
    setScrollProgress(0);
    setScrollWheelPreview(false);
    setParallaxPointer({ x: 0, y: 0 });
    setLiveMotionPath(null);
  }, [activeScene.id]);

  useEffect(() => {
    if (
      selectedObjectId &&
      !activeScene.objects[selectedObjectId]
    ) {
      setSelectedObjectId(null);
    }
    setLiveGeometry(null);
    setGuides({});
  }, [activeScene.id, activeScene.objects, selectedObjectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }

      const command = event.metaKey || event.ctrlKey;

      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (
        command &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
        return;
      }

      if (
        command &&
        event.key.toLowerCase() === "d" &&
        selectedObjectId
      ) {
        event.preventDefault();
        duplicateSelectedObject();
        return;
      }

      if (
        (event.key === "Delete" ||
          event.key === "Backspace") &&
        selectedObjectId
      ) {
        event.preventDefault();
        removeSelectedObject();
        return;
      }

      const amount = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelectedObject(-amount, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelectedObject(amount, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelectedObject(0, -amount);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelectedObject(0, amount);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    duplicateSelectedObject,
    nudgeSelectedObject,
    redo,
    removeSelectedObject,
    selectedObjectId,
    undo,
  ]);

  const beginMove = (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedObjectId(object.id);

    if (object.locked) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startGeometry = { ...object.geometry };
    let finalGeometry = startGeometry;
    let moved = false;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const dx =
        (pointer.clientX - startX) *
        (activeScene.width / rect.width);
      const dy =
        (pointer.clientY - startY) *
        (activeScene.height / rect.height);

      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;

      const candidate: InteractiveObjectGeometry = {
        ...startGeometry,
        x: startGeometry.x + dx,
        y: startGeometry.y + dy,
      };

      const snapped = snapMoveGeometry(
        activeScene,
        object.id,
        candidate,
        !pointer.altKey,
      );

      finalGeometry = snapped.geometry;
      setLiveGeometry({
        objectId: object.id,
        geometry: finalGeometry,
      });
      setGuides(snapped.guides);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setGuides({});
      setLiveGeometry(null);

      if (moved) {
        commitObjectGeometry(object.id, finalGeometry);
      }
    };

    document.addEventListener("pointermove", move, {
      passive: false,
    });
    document.addEventListener("pointerup", up);
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
    horizontal: "left" | "right",
    vertical: "top" | "bottom",
  ) => {
    if (object.locked || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedObjectId(object.id);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...object.geometry };
    const radians = (start.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const sx = horizontal === "right" ? 1 : -1;
    const sy = vertical === "bottom" ? 1 : -1;
    const startCenter = {
      x: start.x + start.width / 2,
      y: start.y + start.height / 2,
    };

    const opposite = {
      x:
        startCenter.x -
        cos * sx * start.width / 2 -
        -sin * sy * start.height / 2,
      y:
        startCenter.y -
        sin * sx * start.width / 2 -
        cos * sy * start.height / 2,
    };

    let finalGeometry = start;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();

      const screenDx =
        (pointer.clientX - startX) *
        (activeScene.width / rect.width);
      const screenDy =
        (pointer.clientY - startY) *
        (activeScene.height / rect.height);

      const localDx = screenDx * cos + screenDy * sin;
      const localDy = -screenDx * sin + screenDy * cos;

      let width = Math.max(
        24,
        start.width + sx * localDx,
      );
      let height = Math.max(
        24,
        start.height + sy * localDy,
      );

      if (!pointer.altKey) {
        width = Math.max(24, snapToGrid(width));
        height = Math.max(24, snapToGrid(height));
      }

      const center = {
        x:
          opposite.x +
          cos * sx * width / 2 +
          -sin * sy * height / 2,
        y:
          opposite.y +
          sin * sx * width / 2 +
          cos * sy * height / 2,
      };

      finalGeometry = {
        ...start,
        width,
        height,
        x: center.x - width / 2,
        y: center.y - height / 2,
      };

      setLiveGeometry({
        objectId: object.id,
        geometry: finalGeometry,
      });
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveGeometry(null);
      commitObjectGeometry(object.id, finalGeometry);
    };

    document.addEventListener("pointermove", move, {
      passive: false,
    });
    document.addEventListener("pointerup", up);
  };

  const beginRotate = (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
  ) => {
    if (object.locked || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedObjectId(object.id);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const geometry =
      liveGeometry?.objectId === object.id
        ? liveGeometry.geometry
        : object.geometry;

    const centerX =
      rect.left +
      ((geometry.x + geometry.width / 2) / activeScene.width) *
        rect.width;
    const centerY =
      rect.top +
      ((geometry.y + geometry.height / 2) / activeScene.height) *
        rect.height;

    const startPointerAngle =
      (Math.atan2(
        event.clientY - centerY,
        event.clientX - centerX,
      ) *
        180) /
      Math.PI;

    const startRotation = geometry.rotation;
    let finalGeometry = geometry;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const angle =
        (Math.atan2(
          pointer.clientY - centerY,
          pointer.clientX - centerX,
        ) *
          180) /
        Math.PI;

      const delta = angle - startPointerAngle;
      const rotation = pointer.altKey
        ? normalizeRotation(startRotation + delta)
        : snapRotation(startRotation + delta);

      finalGeometry = {
        ...geometry,
        rotation,
      };

      setLiveGeometry({
        objectId: object.id,
        geometry: finalGeometry,
      });
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveGeometry(null);
      commitObjectGeometry(object.id, finalGeometry);
    };

    document.addEventListener("pointermove", move, {
      passive: false,
    });
    document.addEventListener("pointerup", up);
  };

  const renderObject = (objectId: string) => {
    const object = activeScene.objects[objectId];
    if (!object) return null;

    const geometry =
      liveGeometry?.objectId === object.id
        ? liveGeometry.geometry
        : object.geometry;
    const displayObject =
      selectedObjectId === object.id && liveMotionPath
        ? ({
            ...object,
            motionPath: liveMotionPath,
          } as InteractiveSceneObject)
        : object;

    return (
      <EditorObject
        key={object.id}
        object={displayObject}
        scene={activeScene}
        data={data}
        selected={selectedObjectId === object.id}
        geometry={geometry}
        motionReplayKey={motionReplayKey}
        scrollProgress={scrollProgress}
        parallaxPointer={parallaxPointer}
        onPointerDown={beginMove}
        onSelect={setSelectedObjectId}
        onResizePointerDown={beginResize}
        onRotatePointerDown={beginRotate}
      />
    );
  };

  const layerIds = [...activeScene.objectOrder].reverse();
  const selectedMotionPath =
    liveMotionPath ??
    (selectedObject?.motionPath
      ? selectedObject.motionPath
      : null);
  const activeSceneIndex = interactive.sceneOrder.indexOf(activeScene.id);
  const nextSceneId =
    activeSceneIndex >= 0
      ? interactive.sceneOrder[activeSceneIndex + 1]
      : undefined;
  const nextScene = nextSceneId
    ? interactive.scenes[nextSceneId]
    : undefined;

  const selectedScrollMarkers = Array.from(
    new Set(
      (selectedObject?.scrollTracks ?? []).flatMap(track =>
        track.keyframes.map(keyframe =>
          Math.round(keyframe.progress * 10) / 10,
        ),
      ),
    ),
  ).sort((a, b) => a - b);
  const selectedPathMarkers = Array.from(
    new Set<number>(
      (selectedMotionPath?.points ?? []).map(point =>
        Math.round(point.progress * 10) / 10,
      ),
    ),
  ).sort((a, b) => a - b);
  const virtualScrollPx = Math.round(
    (activeScene.scrollLength * scrollProgress) / 100,
  );

  return (
    <div className="min-h-[720px] rounded-xl bg-background p-3 sm:p-4">
      <style>{INTERACTIVE_MOTION_CSS}</style>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#2e0562]">
              Interactive Experience
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                {fullName || "Your resume"}
              </span>
              <span className="rounded-full border border-[#2e0562]/20 bg-[#2e0562]/5 px-2 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-[#2e0562]">
                Freeform editor
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setTemplateGalleryOpen(open => !open)
              }
              aria-pressed={templateGalleryOpen}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[7.5px] font-semibold ${
                templateGalleryOpen
                  ? "border-[#2e0562]/30 bg-[#2e0562]/5 text-[#2e0562]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutTemplate size={11} />
              Templates
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={!historyRef.current.past.length}
              title="Undo"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!historyRef.current.future.length}
              title="Redo"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Redo2 size={13} />
            </button>
          </div>
        </div>

        {templateGalleryOpen && (
          <div className="mt-3">
            <InteractiveTemplateGallery
              activeTemplateId={normalizeInteractiveTemplateId(
                interactive.templateId,
              )}
              onApply={applyTemplate}
              onClose={() => setTemplateGalleryOpen(false)}
            />
          </div>
        )}

        <div className="mt-3 grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_230px]">
          {/* Scenes + layers */}
          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Scenes
                  </div>
                  <div className="mt-0.5 text-[7.5px] text-muted-foreground">
                    Visitor order
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    mutateScenes(collection =>
                      addInteractiveScene(collection),
                    )
                  }
                  title="Add scene"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2e0562]/20 text-[#2e0562] hover:bg-[#2e0562]/5"
                >
                  <Plus size={13} />
                </button>
              </div>

              <div className="space-y-1.5">
                {scenes.map((scene, index) => {
                  const active = scene.id === activeScene.id;
                  return (
                    <div
                      key={scene.id}
                      className={`rounded-lg border p-1.5 ${
                        active
                          ? "border-[#2e0562]/35 bg-[#2e0562]/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedObjectId(null);
                          mutateScenes(
                            collection =>
                              setActiveInteractiveScene(
                                collection,
                                scene.id,
                              ),
                            { recordHistory: false },
                          );
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-[7.5px] font-bold ${
                              active
                                ? "bg-[#2e0562] text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-foreground">
                            {scene.name}
                          </span>
                        </div>
                        <div className="ml-7 mt-1 text-[7px] text-muted-foreground">
                          {scene.objectOrder.length} objects
                        </div>
                      </button>

                      {active && (
                        <div className="mt-1.5 flex items-center gap-1 border-t border-[#2e0562]/10 pt-1.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            title="Move scene up"
                            onClick={() =>
                              mutateScenes(collection =>
                                moveInteractiveScene(
                                  collection,
                                  scene.id,
                                  -1,
                                ),
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25"
                          >
                            <ArrowUp size={10} />
                          </button>
                          <button
                            type="button"
                            disabled={index === scenes.length - 1}
                            title="Move scene down"
                            onClick={() =>
                              mutateScenes(collection =>
                                moveInteractiveScene(
                                  collection,
                                  scene.id,
                                  1,
                                ),
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25"
                          >
                            <ArrowDown size={10} />
                          </button>
                          <button
                            type="button"
                            title="Duplicate scene"
                            onClick={() =>
                              mutateScenes(collection =>
                                duplicateInteractiveScene(
                                  collection,
                                  scene.id,
                                ),
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <Copy size={10} />
                          </button>
                          <button
                            type="button"
                            disabled={scenes.length <= 1}
                            title="Delete scene"
                            onClick={() => {
                              setSelectedObjectId(null);
                              mutateScenes(collection =>
                                removeInteractiveScene(
                                  collection,
                                  scene.id,
                                ),
                              );
                            }}
                            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-25"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Layers
                  </div>
                  <div className="mt-0.5 text-[7px] text-muted-foreground">
                    Front to back
                  </div>
                </div>
                <Layers3 size={13} className="text-muted-foreground" />
              </div>

              {layerIds.length ? (
                <div className="space-y-1">
                  {layerIds.map(objectId => {
                    const object = activeScene.objects[objectId];
                    if (!object) return null;
                    const selected = object.id === selectedObjectId;
                    const actualIndex =
                      activeScene.objectOrder.indexOf(object.id);

                    return (
                      <div
                        key={object.id}
                        className={`rounded-lg border p-1.5 ${
                          selected
                            ? "border-[#2e0562]/35 bg-[#2e0562]/5"
                            : "border-border bg-background"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedObjectId(object.id)
                          }
                          className="flex w-full items-center gap-1.5 text-left"
                        >
                          <span className="flex h-5 w-5 flex-none items-center justify-center rounded bg-muted text-muted-foreground">
                            {object.type === "text" ? (
                              <Type size={9} />
                            ) : object.type === "image" ? (
                              <ImageIcon size={9} />
                            ) : object.type === "shape" ? (
                              <Square size={9} />
                            ) : (
                              <UserRound size={9} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[8.5px] font-semibold text-foreground">
                            {object.type === "resume-content"
                              ? interactiveBindingDisplayName(
                                  data,
                                  object.binding,
                                )
                              : object.name}
                          </span>
                        </button>

                        {selected && (
                          <div className="mt-1.5 flex items-center gap-0.5 border-t border-[#2e0562]/10 pt-1">
                            <button
                              type="button"
                              title={
                                object.geometry.hidden
                                  ? "Show"
                                  : "Hide"
                              }
                              onClick={() =>
                                patchSelectedObject(current => ({
                                  ...current,
                                  geometry: {
                                    ...current.geometry,
                                    hidden:
                                      !current.geometry.hidden ||
                                      undefined,
                                  },
                                } as InteractiveSceneObject))
                              }
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                            >
                              {object.geometry.hidden ? (
                                <EyeOff size={9} />
                              ) : (
                                <Eye size={9} />
                              )}
                            </button>
                            <button
                              type="button"
                              title={object.locked ? "Unlock" : "Lock"}
                              onClick={() =>
                                patchSelectedObject(current => ({
                                  ...current,
                                  locked:
                                    !current.locked || undefined,
                                } as InteractiveSceneObject))
                              }
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                            >
                              {object.locked ? (
                                <Lock size={9} />
                              ) : (
                                <Unlock size={9} />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={
                                actualIndex ===
                                activeScene.objectOrder.length - 1
                              }
                              title="Bring forward"
                              onClick={() =>
                                mutateScenes(collection =>
                                  moveInteractiveObjectLayer(
                                    collection,
                                    activeScene.id,
                                    object.id,
                                    1,
                                  ),
                                )
                              }
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25"
                            >
                              <ArrowUp size={9} />
                            </button>
                            <button
                              type="button"
                              disabled={actualIndex === 0}
                              title="Send backward"
                              onClick={() =>
                                mutateScenes(collection =>
                                  moveInteractiveObjectLayer(
                                    collection,
                                    activeScene.id,
                                    object.id,
                                    -1,
                                  ),
                                )
                              }
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25"
                            >
                              <ArrowDown size={9} />
                            </button>
                            <button
                              type="button"
                              title="Duplicate"
                              onClick={duplicateSelectedObject}
                              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                            >
                              <Copy size={8} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={removeSelectedObject}
                              className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        )}

                        {!selected &&
                          (object.locked ||
                            object.geometry.hidden) && (
                            <div className="ml-[26px] mt-0.5 flex gap-1 text-[6px] font-semibold text-muted-foreground">
                              {object.locked && <span>Locked</span>}
                              {object.geometry.hidden && (
                                <span>Hidden</span>
                              )}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[7.5px] text-muted-foreground">
                  Add an object to create the first layer.
                </div>
              )}
            </div>
          </aside>

          {/* Canvas */}
          <main className="min-w-0">
            <div
              className="relative mb-2 flex flex-wrap items-center justify-between gap-2"
              style={{
                zIndex: 1000,
                isolation: "isolate",
              }}
            >
              <div>
                <div className="text-[10px] font-semibold text-foreground">
                  {activeScene.name}
                </div>
                <div className="text-[7.5px] text-muted-foreground">
                  {activeScene.width} × {activeScene.height}px ·{" "}
                  {activeScene.scrollLength}px visitor scroll
                </div>
              </div>

              <div className="flex items-center gap-1">
                <div
                  className="relative"
                  style={{
                    zIndex: 1100,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAddMenuOpen(open => !open);
                      setBindingPickerMode(null);
                      setBindingSearch("");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2e0562] px-2.5 text-[9px] font-semibold text-white"
                  >
                    <Plus size={11} />
                    Add
                  </button>

                  {addMenuOpen && (
                    <div
                      className="absolute right-0 top-9 z-[500] rounded-xl border border-border bg-background p-1.5 shadow-lg"
                      style={{
                        width: 190,
                        minWidth: 190,
                        maxWidth: "none",
                        zIndex: 1200,
                        isolation: "isolate",
                      }}
                    >
                      {[
                        [
                          "resume-content",
                          "Resume content",
                          <UserRound size={11} key="resume" />,
                        ],
                        [
                          "text",
                          "Text",
                          <Type size={11} key="text" />,
                        ],
                        [
                          "image",
                          "Image",
                          <ImageIcon size={11} key="image" />,
                        ],
                        [
                          "shape",
                          "Shape",
                          <Square size={11} key="shape" />,
                        ],
                      ].map(([type, label, icon]) => (
                        <button
                          key={String(type)}
                          type="button"
                          onClick={() => {
                            if (type === "resume-content") {
                              setAddMenuOpen(false);
                              setBindingPickerMode("add");
                              setBindingSearch("");
                              return;
                            }

                            addObject(
                              type as Exclude<
                                InteractiveSceneObject["type"],
                                "resume-content"
                              >,
                            );
                          }}
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[9px] font-semibold text-foreground hover:bg-muted/50"
                          style={{
                            minWidth: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span className="flex-none text-[#2e0562]">
                            {icon as ReactNode}
                          </span>
                          <span
                            className="min-w-0 flex-1"
                            style={{
                              whiteSpace: "nowrap",
                              wordBreak: "keep-all",
                              overflowWrap: "normal",
                            }}
                          >
                            {label as string}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {bindingPickerMode && (
                    <BindingPicker
                      options={bindingOptions}
                      query={bindingSearch}
                      onQueryChange={setBindingSearch}
                      onChoose={option => {
                        if (
                          bindingPickerMode === "change" &&
                          selectedObject?.type === "resume-content" &&
                          selectedObjectId
                        ) {
                          changeSelectedBinding(
                            option.binding,
                            option.label,
                          );
                          return;
                        }

                        addBoundResumeContent(option);
                      }}
                      onClose={() => {
                        setBindingPickerMode(null);
                        setBindingSearch("");
                      }}
                    />
                  )}
                </div>

                <span className="mx-0.5 h-5 w-px bg-border" />

                <button
                  type="button"
                  onClick={() =>
                    setZoom(value => Math.max(0.5, value - 0.1))
                  }
                  title="Zoom out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  <ZoomOut size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  title="Reset zoom"
                  className="h-8 min-w-[42px] rounded-lg border border-border px-1.5 text-[8px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoom(value => Math.min(1.75, value + 0.1))
                  }
                  title="Zoom in"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  <ZoomIn size={12} />
                </button>
              </div>
            </div>

            <div
              className="relative rounded-xl border border-border bg-muted/30 p-2"
              style={{
                zIndex: 0,
                isolation: "isolate",
              }}
            >
              <div
                className="overflow-auto rounded-lg"
                style={{ maxHeight: 620 }}
                onPointerDown={event => {
                  if (
                    event.target === event.currentTarget
                  ) {
                    setSelectedObjectId(null);
                    setAddMenuOpen(false);
                    setBindingPickerMode(null);
                  }
                }}
              >
                <div
                  style={{
                    width: `${zoom * 100}%`,
                    margin: zoom < 1 ? "0 auto" : undefined,
                    minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
                  }}
                >
                  <div
                    ref={canvasRef}
                    className="relative w-full overflow-visible rounded-lg border border-[#2e0562]/15 shadow-sm"
                    onPointerDown={event => {
                      if (event.target === event.currentTarget) {
                        setSelectedObjectId(null);
                        setAddMenuOpen(false);
                      }
                    }}
                    onPointerMove={event => {
                      if (!activeScene.ambient.parallax.enabled) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      if (!rect.width || !rect.height) return;

                      const px =
                        ((event.clientX - rect.left) / rect.width - 0.5) * 2;
                      const py =
                        ((event.clientY - rect.top) / rect.height - 0.5) * 2;
                      const strength =
                        3 +
                        activeScene.ambient.parallax.intensity * 0.1;

                      setParallaxPointer({ x: px, y: py });

                      event.currentTarget.style.setProperty(
                        "--wp-parallax-x",
                        `${-px * strength}px`,
                      );
                      event.currentTarget.style.setProperty(
                        "--wp-parallax-y",
                        `${-py * strength}px`,
                      );
                    }}
                    onPointerLeave={event => {
                      setParallaxPointer({ x: 0, y: 0 });
                      event.currentTarget.style.setProperty(
                        "--wp-parallax-x",
                        "0px",
                      );
                      event.currentTarget.style.setProperty(
                        "--wp-parallax-y",
                        "0px",
                      );
                    }}
                    onWheel={event => {
                      if (!scrollWheelPreview) return;
                      event.preventDefault();

                      const delta =
                        (event.deltaY /
                          Math.max(320, activeScene.scrollLength)) *
                        100;

                      setScrollProgress(current =>
                        Math.max(
                          0,
                          Math.min(100, current + delta),
                        ),
                      );
                    }}
                    style={{
                      aspectRatio: `${activeScene.width} / ${activeScene.height}`,
                      zIndex: 0,
                      isolation: "isolate",
                      background: "transparent",
                    }}
                  >
                    <SceneEnvironment scene={activeScene} />

                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-[0.16]"
                      style={{
                        zIndex: -1,
                        backgroundImage:
                          "radial-gradient(circle at 1px 1px, rgba(46,5,98,.20) 1px, transparent 0)",
                        backgroundSize: "18px 18px",
                      }}
                    />

                    {guides.x !== undefined && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 top-0 z-[400] border-l border-dashed border-[#7c3aed]"
                        style={{
                          left: `${(guides.x / activeScene.width) * 100}%`,
                        }}
                      />
                    )}

                    {guides.y !== undefined && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 right-0 z-[400] border-t border-dashed border-[#7c3aed]"
                        style={{
                          top: `${(guides.y / activeScene.height) * 100}%`,
                        }}
                      />
                    )}

                    {activeScene.objectOrder.map(renderObject)}

                    {selectedObject &&
                      selectedMotionPath &&
                      !selectedObject.geometry.hidden && (
                        <InteractiveMotionPathOverlay
                          scene={activeScene}
                          geometry={
                            liveGeometry?.objectId === selectedObject.id
                              ? liveGeometry.geometry
                              : selectedObject.geometry
                          }
                          path={selectedMotionPath}
                          progress={scrollProgress}
                          locked={!!selectedObject.locked}
                          onPreview={setLiveMotionPath}
                          onCommit={motionPath => {
                            setLiveMotionPath(null);
                            patchSelectedObject(current => ({
                              ...current,
                              motionPath,
                            } as InteractiveSceneObject));
                          }}
                        />
                      )}

                    {nextScene &&
                      activeScene.transition.type !== "none" && (
                        <InteractiveSceneTransitionOverlay
                          transition={activeScene.transition}
                          playKey={transitionPlayKey}
                          currentScene={
                            <TransitionSceneSnapshot
                              scene={activeScene}
                              data={data}
                              progress={100}
                            />
                          }
                          nextScene={
                            <TransitionSceneSnapshot
                              scene={nextScene}
                              data={data}
                              progress={0}
                            />
                          }
                        />
                      )}

                    {activeScene.objectOrder.length === 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                        <div className="max-w-[330px] text-center">
                          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#2e0562]/15 bg-white/90 text-[#2e0562] shadow-sm">
                            <MousePointer2 size={18} />
                          </div>
                          <div className="mt-3 text-[11px] font-semibold text-[#2e0562]">
                            Build anywhere on the scene
                          </div>
                          <p className="mt-1 text-[8px] leading-relaxed text-slate-500">
                            Use Add for resume content, text, images or
                            shapes. Then drag, resize and rotate them directly.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-[#2e0562]/15 bg-[#2e0562]/[0.025] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-wider text-[#2e0562]">
                    Scroll timeline
                  </div>
                  <div className="mt-0.5 text-[6.8px] text-muted-foreground">
                    {activeScene.scrollBehavior === "pinned"
                      ? "Pinned scene"
                      : "Flow scene"}{" "}
                    · {activeScene.scrollLength}px virtual scroll
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={scrollWheelPreview}
                    onClick={() =>
                      setScrollWheelPreview(value => !value)
                    }
                    className={`rounded-md border px-2 py-1 text-[6.8px] font-semibold ${
                      scrollWheelPreview
                        ? "border-[#2e0562]/30 bg-[#2e0562] text-white"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                    title="When enabled, use the mouse wheel over the scene to scrub its virtual scroll timeline."
                  >
                    Wheel preview
                  </button>

                  <button
                    type="button"
                    onClick={() => setScrollProgress(0)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-[6.8px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-2.5">
                <div className="relative">
                  {selectedScrollMarkers.map(marker => (
                    <span
                      key={`scroll-${marker}`}
                      aria-hidden="true"
                      title={`${marker}% scroll keyframe`}
                      className="pointer-events-none absolute top-[-1px] z-30 h-[8px] w-[2px] -translate-x-1/2 rounded bg-[#7c3aed]"
                      style={{
                        left: `${marker}%`,
                      }}
                    />
                  ))}

                  {selectedPathMarkers.map(marker => (
                    <span
                      key={`path-${marker}`}
                      aria-hidden="true"
                      title={`${marker}% path point`}
                      className="pointer-events-none absolute bottom-[-1px] z-30 h-[7px] w-[7px] -translate-x-1/2 rounded-full border border-white bg-[#0f766e]"
                      style={{
                        left: `${marker}%`,
                      }}
                    />
                  ))}

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={scrollProgress}
                    onChange={event =>
                      setScrollProgress(
                        Math.max(
                          0,
                          Math.min(100, Number(event.target.value)),
                        ),
                      )
                    }
                    className="relative z-20 w-full"
                    aria-label="Interactive scene scroll progress"
                  />
                </div>

                <div className="mt-1 flex items-center justify-between text-[6.5px] text-muted-foreground">
                  <span>0%</span>
                  <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-[#2e0562]">
                    {Math.round(scrollProgress * 10) / 10}% ·{" "}
                    {virtualScrollPx}px
                  </span>
                  <span>100%</span>
                </div>
              </div>

              <p className="mt-1.5 text-[6.5px] leading-relaxed text-muted-foreground">
                Purple ticks are Scroll Motion keyframes; teal dots are
                Motion Path points on the selected object. Drag this scrubber
                anytime — preview progress is never persisted as the visitor&apos;s
                starting position.
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[7px] text-muted-foreground">
              <span>
                Drag snaps to scene/object guides · hold Alt to bypass snapping
              </span>
              <span>
                Arrows nudge 1px · Shift+Arrow 10px · ⌘/Ctrl+D duplicate
              </span>
            </div>
          </main>

          {/* Inspector */}
          <aside className="space-y-2.5">
            {selectedObject ? (
              <div className="rounded-xl border border-[#2e0562]/20 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-[#2e0562]">
                      Selected object
                    </div>
                    <div className="mt-0.5 max-w-[145px] truncate text-[10px] font-semibold text-foreground">
                      {selectedObject.type === "resume-content"
                        ? interactiveBindingDisplayName(
                            data,
                            selectedObject.binding,
                          )
                        : selectedObject.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedObjectId(null)}
                    className="text-[8px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Done
                  </button>
                </div>

                {selectedObject.type !== "resume-content" && (
                  <label className="mt-2.5 block">
                    <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                      Layer name
                    </span>
                    <input
                      value={selectedObject.name}
                      onChange={event =>
                        patchSelectedObject(current => ({
                          ...current,
                          name: event.target.value,
                        } as InteractiveSceneObject))
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                    />
                  </label>
                )}

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberField
                    label="X"
                    value={selectedObject.geometry.x}
                    min={-10000}
                    max={10000}
                    suffix="px"
                    onChange={x =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          x,
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                  <NumberField
                    label="Y"
                    value={selectedObject.geometry.y}
                    min={-10000}
                    max={10000}
                    suffix="px"
                    onChange={y =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          y,
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                  <NumberField
                    label="Width"
                    value={selectedObject.geometry.width}
                    min={24}
                    max={6000}
                    suffix="px"
                    onChange={width =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          width,
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                  <NumberField
                    label="Height"
                    value={selectedObject.geometry.height}
                    min={24}
                    max={6000}
                    suffix="px"
                    onChange={height =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          height,
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                  <NumberField
                    label="Rotation"
                    value={selectedObject.geometry.rotation}
                    min={-180}
                    max={180}
                    suffix="°"
                    onChange={rotation =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          rotation: normalizeRotation(rotation),
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                  <NumberField
                    label="Opacity"
                    value={Math.round(
                      selectedObject.geometry.opacity * 100,
                    )}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={opacity =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          opacity: Math.max(
                            0,
                            Math.min(1, opacity / 100),
                          ),
                        },
                      } as InteractiveSceneObject))
                    }
                  />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      patchSelectedObject(current => ({
                        ...current,
                        locked: !current.locked || undefined,
                      } as InteractiveSceneObject))
                    }
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[8px] font-semibold ${
                      selectedObject.locked
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {selectedObject.locked ? (
                      <Lock size={9} />
                    ) : (
                      <Unlock size={9} />
                    )}
                    {selectedObject.locked ? "Locked" : "Lock"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchSelectedObject(current => ({
                        ...current,
                        geometry: {
                          ...current.geometry,
                          hidden:
                            !current.geometry.hidden || undefined,
                        },
                      } as InteractiveSceneObject))
                    }
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[8px] font-semibold ${
                      selectedObject.geometry.hidden
                        ? "border-zinc-300 bg-zinc-100 text-zinc-600"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {selectedObject.geometry.hidden ? (
                      <EyeOff size={9} />
                    ) : (
                      <Eye size={9} />
                    )}
                    {selectedObject.geometry.hidden
                      ? "Hidden"
                      : "Visible"}
                  </button>
                </div>

                {(selectedObject.type === "text" ||
                  selectedObject.type === "resume-content") && (
                  <div className="mt-2.5 rounded-lg border border-border bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                          Appearance
                        </div>
                        <div className="mt-0.5 text-[6.5px] text-muted-foreground">
                          Template styling stays separate from shared content.
                        </div>
                      </div>
                      {selectedObject.appearance && (
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedObject(current => ({
                              ...current,
                              appearance: undefined,
                            } as InteractiveSceneObject))
                          }
                          className="text-[6.8px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <label className="mt-2 block">
                      <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                        Surface
                      </span>
                      <select
                        value={selectedObject.appearance?.variant ?? "card"}
                        onChange={event =>
                          patchSelectedObject(current => ({
                            ...current,
                            appearance: {
                              ...(current.appearance ?? {
                                variant: "card",
                              }),
                              variant: event.target
                                .value as InteractiveObjectAppearance["variant"],
                            },
                          } as InteractiveSceneObject))
                        }
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
                      >
                        <option value="card">Card</option>
                        <option value="plain">Plain</option>
                        <option value="glass">Glass</option>
                        <option value="terminal">Terminal</option>
                        <option value="accent">Accent card</option>
                      </select>
                    </label>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {[
                        ["Text", "textColor", "#2e0562"],
                        ["Surface", "surfaceColor", "#ffffff"],
                        ["Accent", "accentColor", "#7c3aed"],
                        ["Border", "borderColor", "#ddd6fe"],
                      ].map(([label, field, fallback]) => (
                        <label key={field}>
                          <span className="mb-0.5 block text-[6.2px] font-semibold text-muted-foreground">
                            {label}
                          </span>
                          <input
                            type="color"
                            value={safeColor(
                              selectedObject.appearance?.[
                                field as keyof InteractiveObjectAppearance
                              ] as string | undefined,
                              fallback,
                            )}
                            onChange={event =>
                              patchSelectedObject(current => ({
                                ...current,
                                appearance: {
                                  ...(current.appearance ?? {
                                    variant: "card",
                                  }),
                                  [field]: event.target.value,
                                },
                              } as InteractiveSceneObject))
                            }
                            className="h-7 w-full rounded border border-border bg-background p-0.5"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2.5 rounded-lg border border-border bg-background p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                        Easy motion
                      </div>
                      <div className="mt-0.5 text-[6.5px] text-muted-foreground">
                        One-click loop preset
                      </div>
                    </div>
                    {selectedObject.motion && (
                      <button
                        type="button"
                        onClick={() =>
                          patchSelectedObject(current => ({
                            ...current,
                            motion: undefined,
                          } as InteractiveSceneObject))
                        }
                        className="text-[7px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <select
                    value={selectedObject.motion?.preset ?? "none"}
                    onChange={event => {
                      const preset = event.target
                        .value as InteractiveObjectMotionPreset;

                      patchSelectedObject(current => ({
                        ...current,
                        motion:
                          preset === "none"
                            ? undefined
                            : {
                                preset,
                                speed: current.motion?.speed ?? 1,
                                intensity:
                                  current.motion?.intensity ?? 50,
                                delay: current.motion?.delay,
                              },
                      } as InteractiveSceneObject));
                    }}
                    className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                  >
                    <option value="none">None</option>
                    <option value="float">Float</option>
                    <option value="bob">Bob</option>
                    <option value="pulse">Pulse</option>
                    <option value="spin">Spin</option>
                    <option value="drift">Gentle drift</option>
                  </select>

                  {selectedObject.motion && (
                    <div className="mt-2 space-y-1.5">
                      <label className="grid grid-cols-[48px_1fr_30px] items-center gap-1.5">
                        <span className="text-[6.8px] font-semibold text-muted-foreground">
                          Speed
                        </span>
                        <input
                          type="range"
                          min={0.25}
                          max={3}
                          step={0.25}
                          value={selectedObject.motion.speed}
                          onChange={event =>
                            patchSelectedObject(current => ({
                              ...current,
                              motion: current.motion
                                ? {
                                    ...current.motion,
                                    speed: Number(
                                      event.target.value,
                                    ),
                                  }
                                : current.motion,
                            } as InteractiveSceneObject))
                          }
                          className="min-w-0"
                        />
                        <span className="text-right text-[6.5px] text-muted-foreground">
                          {selectedObject.motion.speed.toFixed(1)}×
                        </span>
                      </label>

                      <label className="grid grid-cols-[48px_1fr_30px] items-center gap-1.5">
                        <span className="text-[6.8px] font-semibold text-muted-foreground">
                          Strength
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={selectedObject.motion.intensity}
                          onChange={event =>
                            patchSelectedObject(current => ({
                              ...current,
                              motion: current.motion
                                ? {
                                    ...current.motion,
                                    intensity: Number(
                                      event.target.value,
                                    ),
                                  }
                                : current.motion,
                            } as InteractiveSceneObject))
                          }
                          className="min-w-0"
                        />
                        <span className="text-right text-[6.5px] text-muted-foreground">
                          {Math.round(
                            selectedObject.motion.intensity,
                          )}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <AdvancedMotionEditor
                  tracks={selectedObject.animationTracks}
                  onChange={animationTracks =>
                    patchSelectedObject(current => ({
                      ...current,
                      animationTracks,
                    } as InteractiveSceneObject))
                  }
                  onReplay={() =>
                    setMotionReplayKey(value => value + 1)
                  }
                />

                <InteractiveScrollMotionEditor
                  tracks={selectedObject.scrollTracks}
                  progress={scrollProgress}
                  onChange={scrollTracks =>
                    patchSelectedObject(current => ({
                      ...current,
                      scrollTracks,
                    } as InteractiveSceneObject))
                  }
                />

                <InteractiveMotionPathEditor
                  path={selectedObject.motionPath}
                  progress={scrollProgress}
                  onChange={motionPath => {
                    setLiveMotionPath(null);
                    patchSelectedObject(current => ({
                      ...current,
                      motionPath,
                    } as InteractiveSceneObject));
                  }}
                />

                <div className="mt-2.5 rounded-lg border border-border bg-background p-2">
                  <div className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                    Parallax depth
                  </div>
                  <div className="mt-0.5 text-[6.5px] leading-relaxed text-muted-foreground">
                    Different depths move at different rates when scene
                    Background Parallax is enabled.
                  </div>

                  <div className="mt-2 grid grid-cols-[1fr_36px] items-center gap-2">
                    <input
                      type="range"
                      min={-2}
                      max={2}
                      step={0.1}
                      value={selectedObject.parallaxDepth ?? 0}
                      onChange={event =>
                        patchSelectedObject(current => ({
                          ...current,
                          parallaxDepth: Number(event.target.value) || undefined,
                        } as InteractiveSceneObject))
                      }
                      className="min-w-0"
                    />
                    <span className="text-right text-[7px] font-semibold text-muted-foreground">
                      {(selectedObject.parallaxDepth ?? 0).toFixed(1)}
                    </span>
                  </div>

                  <div className="mt-1.5 grid grid-cols-3 gap-1">
                    {[
                      ["Back", -0.8],
                      ["Fixed", 0],
                      ["Front", 1],
                    ].map(([label, value]) => (
                      <button
                        key={String(label)}
                        type="button"
                        onClick={() =>
                          patchSelectedObject(current => ({
                            ...current,
                            parallaxDepth:
                              Number(value) || undefined,
                          } as InteractiveSceneObject))
                        }
                        className="rounded-md border border-border px-1 py-1 text-[6.5px] font-semibold text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedObject.type === "text" && (
                  <label className="mt-2.5 block">
                    <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                      Text
                    </span>
                    <textarea
                      rows={4}
                      value={selectedObject.text}
                      onChange={event =>
                        patchSelectedObject(current =>
                          current.type === "text"
                            ? {
                                ...current,
                                text: event.target.value,
                              }
                            : current,
                        )
                      }
                      className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                    />
                  </label>
                )}

                {selectedObject.type === "image" && (
                  <>
                    <label className="mt-2.5 block">
                      <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                        Image URL
                      </span>
                      <input
                        value={selectedObject.src}
                        placeholder="https://…"
                        onChange={event =>
                          patchSelectedObject(current =>
                            current.type === "image"
                              ? {
                                  ...current,
                                  src: event.target.value,
                                }
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                        Fit
                      </span>
                      <select
                        value={selectedObject.fit ?? "cover"}
                        onChange={event =>
                          patchSelectedObject(current =>
                            current.type === "image"
                              ? {
                                  ...current,
                                  fit: event.target.value as
                                    | "cover"
                                    | "contain"
                                    | "stretch",
                                }
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="stretch">Stretch</option>
                      </select>
                    </label>
                  </>
                )}

                {selectedObject.type === "shape" && (
                  <>
                    <label className="mt-2.5 block">
                      <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                        Shape
                      </span>
                      <select
                        value={selectedObject.shape}
                        onChange={event =>
                          patchSelectedObject(current =>
                            current.type === "shape"
                              ? {
                                  ...current,
                                  shape: event.target.value as
                                    | "rectangle"
                                    | "ellipse"
                                    | "line",
                                }
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                      >
                        <option value="rectangle">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="line">Line</option>
                      </select>
                    </label>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label>
                        <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                          Fill
                        </span>
                        <input
                          type="color"
                          value={safeColor(
                            selectedObject.fill,
                            "#ede9fe",
                          )}
                          onChange={event =>
                            patchSelectedObject(current =>
                              current.type === "shape"
                                ? {
                                    ...current,
                                    fill: event.target.value,
                                  }
                                : current,
                            )
                          }
                          className="h-8 w-full rounded border border-border bg-background p-1"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                          Stroke
                        </span>
                        <input
                          type="color"
                          value={safeColor(
                            selectedObject.stroke,
                            "#7c3aed",
                          )}
                          onChange={event =>
                            patchSelectedObject(current =>
                              current.type === "shape"
                                ? {
                                    ...current,
                                    stroke: event.target.value,
                                  }
                                : current,
                            )
                          }
                          className="h-8 w-full rounded border border-border bg-background p-1"
                        />
                      </label>
                    </div>
                  </>
                )}

                {selectedObject.type === "resume-content" && (() => {
                  const resolved = resolveInteractiveBinding(
                    data,
                    selectedObject.binding,
                  );

                  return (
                    <div className="mt-2.5 space-y-2">
                      <div className="rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/5 p-2">
                        <div className="text-[7px] font-bold uppercase tracking-wider text-[#2e0562]">
                          Shared binding
                        </div>

                        {resolved ? (
                          <>
                            <div className="mt-1 truncate text-[9px] font-semibold text-foreground">
                              {resolved.primary || resolved.label}
                            </div>
                            <div className="mt-0.5 truncate text-[7px] text-muted-foreground">
                              {resolved.found
                                ? `${resolved.label} · updates automatically`
                                : resolved.secondary}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-[7.5px] text-muted-foreground">
                            No resume content selected yet.
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          setBindingPickerMode("change");
                          setBindingSearch("");
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2e0562]/20 bg-background px-2 py-1.5 text-[8px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5"
                      >
                        <UserRound size={9} />
                        {selectedObject.binding
                          ? "Change shared content"
                          : "Choose shared content"}
                      </button>

                      <p className="text-[7px] leading-relaxed text-muted-foreground">
                        This object stores only a reference to the resume
                        record. Editing that record in Work, Projects,
                        Education, Skills, Bio or Links updates this scene
                        automatically.
                      </p>
                    </div>
                  );
                })()}

                <div className="mt-2.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={duplicateSelectedObject}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[8px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Copy size={9} />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedObject}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-[8px] font-semibold text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={9} />
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                  <MousePointer2 size={14} />
                </div>
                <div className="mt-2 text-[9px] font-semibold text-foreground">
                  Select an object
                </div>
                <p className="mt-1 text-[7.5px] leading-relaxed text-muted-foreground">
                  Click anything on the scene or in Layers to edit its
                  geometry, content, visibility and lock state.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Scene
              </div>

              <label className="mt-2 block">
                <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                  Name
                </span>
                <input
                  value={activeScene.name}
                  onChange={event =>
                    patchScene({ name: event.target.value })
                  }
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
                />
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField
                  label="Width"
                  value={activeScene.width}
                  min={320}
                  max={3840}
                  suffix="px"
                  onChange={width => patchScene({ width })}
                />
                <NumberField
                  label="Height"
                  value={activeScene.height}
                  min={320}
                  max={3000}
                  suffix="px"
                  onChange={height => patchScene({ height })}
                />
              </div>

              <div className="mt-2">
                <NumberField
                  label="Visitor scroll"
                  value={activeScene.scrollLength}
                  min={320}
                  max={12000}
                  step={50}
                  suffix="px"
                  onChange={scrollLength =>
                    patchScene({ scrollLength })
                  }
                />
              </div>

              <label className="mt-2 block">
                <span className="mb-1 block text-[8px] font-semibold text-muted-foreground">
                  Scroll behavior
                </span>
                <select
                  value={activeScene.scrollBehavior}
                  onChange={event =>
                    patchScene({
                      scrollBehavior: event.target
                        .value as InteractiveScrollBehavior,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[8.5px] text-foreground outline-none"
                >
                  <option value="pinned">
                    Pinned storytelling
                  </option>
                  <option value="flow">
                    Normal page flow
                  </option>
                </select>
                <p className="mt-1 text-[6.8px] leading-relaxed text-muted-foreground">
                  Pinned keeps the scene stationary while its virtual
                  {` `}
                  {activeScene.scrollLength}px scroll timeline progresses.
                </p>
              </label>

              <div className="mt-2.5 border-t border-border pt-2.5">
                <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                  Transition to next scene
                </div>

                {nextScene ? (
                  <>
                    <div className="mt-1 text-[6.8px] text-muted-foreground">
                      {activeScene.name} → {nextScene.name}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <label>
                        <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                          Effect
                        </span>
                        <select
                          value={activeScene.transition.type}
                          onChange={event =>
                            patchScene({
                              transition: {
                                ...activeScene.transition,
                                type: event.target
                                  .value as InteractiveSceneTransitionType,
                              },
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
                        >
                          <option value="none">None</option>
                          <option value="fade">Fade</option>
                          <option value="slide-left">Slide left</option>
                          <option value="slide-up">Slide up</option>
                          <option value="zoom">Zoom</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                          Duration
                        </span>
                        <select
                          value={activeScene.transition.duration}
                          onChange={event =>
                            patchScene({
                              transition: {
                                ...activeScene.transition,
                                duration: Number(event.target.value),
                              },
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[7.5px] text-foreground outline-none"
                        >
                          <option value={0.4}>0.4s</option>
                          <option value={0.6}>0.6s</option>
                          <option value={0.8}>0.8s</option>
                          <option value={1.2}>1.2s</option>
                          <option value={1.6}>1.6s</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-1.5 block">
                      <span className="mb-0.5 block text-[6.5px] font-semibold text-muted-foreground">
                        Easing
                      </span>
                      <select
                        value={activeScene.transition.easing}
                        onChange={event =>
                          patchScene({
                            transition: {
                              ...activeScene.transition,
                              easing: event.target
                                .value as InteractiveAnimationEasing,
                            },
                          })
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

                    <button
                      type="button"
                      disabled={activeScene.transition.type === "none"}
                      onClick={() =>
                        setTransitionPlayKey(value => value + 1)
                      }
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[#2e0562]/20 bg-background py-1.5 text-[6.8px] font-semibold text-[#2e0562] disabled:opacity-30"
                    >
                      <RefreshCcw size={8} />
                      Preview transition
                    </button>
                  </>
                ) : (
                  <div className="mt-1.5 rounded-md border border-dashed border-border px-2 py-2 text-[6.5px] leading-relaxed text-muted-foreground">
                    This is the last scene, so it has no outgoing transition.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Background
              </div>

              <select
                value={activeScene.background.type}
                onChange={event =>
                  patchScene({
                    background: {
                      ...activeScene.background,
                      type: event.target
                        .value as InteractiveSceneBackground["type"],
                    },
                  })
                }
                className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] text-foreground outline-none"
              >
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
                <option value="image">Image</option>
                <option value="transparent">Transparent</option>
              </select>

              {activeScene.background.type !== "transparent" && (
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={safeColor(
                      activeScene.background.color,
                      "#ffffff",
                    )}
                    onChange={event =>
                      patchScene({
                        background: {
                          ...activeScene.background,
                          color: event.target.value,
                        },
                      })
                    }
                    className="h-7 w-8 rounded border border-border bg-background p-0.5"
                  />
                  <span className="text-[8px] text-muted-foreground">
                    Base color
                  </span>
                </label>
              )}

              {activeScene.background.type === "gradient" && (
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={safeColor(
                      activeScene.background.secondaryColor,
                      "#f4f1fa",
                    )}
                    onChange={event =>
                      patchScene({
                        background: {
                          ...activeScene.background,
                          secondaryColor: event.target.value,
                        },
                      })
                    }
                    className="h-7 w-8 rounded border border-border bg-background p-0.5"
                  />
                  <span className="text-[8px] text-muted-foreground">
                    Second color
                  </span>
                </label>
              )}

              {activeScene.background.type === "image" && (
                <input
                  value={activeScene.background.imageUrl ?? ""}
                  placeholder="Background image URL"
                  onChange={event =>
                    patchScene({
                      background: {
                        ...activeScene.background,
                        imageUrl: event.target.value,
                      },
                    })
                  }
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[8px] text-foreground outline-none"
                />
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ambient motion
                  </div>
                  <div className="mt-0.5 text-[7px] leading-relaxed text-muted-foreground">
                    Easy scene-level effects. No timeline required.
                  </div>
                </div>
                <Sparkles size={13} className="mt-0.5 text-[#2e0562]" />
              </div>

              <div className="mt-2.5 space-y-1.5">
                <AmbientEffectEditor
                  label="Twinkle"
                  description="Small procedural stars that softly blink."
                  effect={activeScene.ambient.twinkle}
                  onChange={twinkle =>
                    patchScene({
                      ambient: {
                        ...activeScene.ambient,
                        twinkle,
                      },
                    })
                  }
                />

                <AmbientEffectEditor
                  label="Floating particles"
                  description="Tiny dots drift gently through the scene."
                  effect={activeScene.ambient.particles}
                  onChange={particles =>
                    patchScene({
                      ambient: {
                        ...activeScene.ambient,
                        particles,
                      },
                    })
                  }
                />

                <AmbientEffectEditor
                  label="Floating shapes"
                  description="Soft circles, squares and diamonds move in the background."
                  effect={activeScene.ambient.floatingShapes}
                  onChange={floatingShapes =>
                    patchScene({
                      ambient: {
                        ...activeScene.ambient,
                        floatingShapes,
                      },
                    })
                  }
                />

                <AmbientEffectEditor
                  label="Gradient drift"
                  description={
                    activeScene.background.type === "gradient"
                      ? "Slowly moves the scene gradient."
                      : "Switch the background to Gradient to see this effect."
                  }
                  effect={activeScene.ambient.gradientDrift}
                  showDensity={false}
                  onChange={gradientDrift =>
                    patchScene({
                      ambient: {
                        ...activeScene.ambient,
                        gradientDrift,
                      },
                    })
                  }
                />

                <AmbientEffectEditor
                  label="Background parallax"
                  description="Background responds subtly to pointer depth."
                  effect={activeScene.ambient.parallax}
                  showDensity={false}
                  onChange={parallax =>
                    patchScene({
                      ambient: {
                        ...activeScene.ambient,
                        parallax,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Shared resume
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[
                  [data.workEntries?.length ?? 0, "roles"],
                  [projectCount, "projects"],
                  [data.education?.length ?? 0, "education"],
                  [data.skills?.length ?? 0, "skills"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-muted/30 p-2"
                  >
                    <div className="text-[11px] font-semibold text-foreground">
                      {value}
                    </div>
                    <div className="text-[6.5px] text-muted-foreground">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function ResumeInteractivePreview({
  data,
  onDesignChange,
}: {
  data: ResumeData;
  onDesignChange: (design: ResumeDesign) => void;
}) {
  const state = getResumeWebExperienceState(data.design);
  const interactive = state.interactive;
  const [initialTemplateGalleryOpen, setInitialTemplateGalleryOpen] =
    useState(false);

  const initializeFromTemplate = (
    templateId: InteractiveTemplateId,
  ) => {
    const sceneCollection = buildInteractiveTemplate(data, templateId);
    onDesignChange(
      initializeInteractiveExperience(
        data.design,
        "template",
        {
          templateId,
          sceneCollection,
        },
      ),
    );
  };

  if (!interactive) {
    return (
      <div className="min-h-[680px] rounded-xl bg-background p-5 sm:p-7">
        <div className="mx-auto max-w-[820px] pt-5 sm:pt-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2e0562]/10 text-[#2e0562]">
            <Sparkles size={20} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Create your Interactive Experience
          </h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            This is a second Web presentation of the same resume content.
            Your Responsive Site stays exactly where you left it, and you can
            switch between the two at any time.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <ChoiceCard
              icon={<LayoutTemplate size={17} />}
              title="Start from current site"
              badge="Recommended"
              description="Seed the interactive version from your current Responsive structure. The original Responsive Site is not changed."
              onClick={() =>
                onDesignChange(
                  initializeInteractiveExperience(
                    data.design,
                    "responsive",
                  ),
                )
              }
            />

            <ChoiceCard
              icon={<Sparkles size={17} />}
              title="Use an interactive template"
              description="Create a separate Interactive presentation with a starter experience. Templates never replace your shared resume facts."
              onClick={() =>
                setInitialTemplateGalleryOpen(open => !open)
              }
            />

            <ChoiceCard
              icon={<SquareDashed size={17} />}
              title="Start blank"
              description="Create an empty Interactive presentation and compose the Web experience from scratch."
              onClick={() =>
                onDesignChange(
                  initializeInteractiveExperience(
                    data.design,
                    "blank",
                  ),
                )
              }
            />
          </div>

          {initialTemplateGalleryOpen && (
            <div className="mt-4">
              <InteractiveTemplateGallery
                mode="initial"
                onApply={initializeFromTemplate}
                onClose={() =>
                  setInitialTemplateGalleryOpen(false)
                }
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-[9px] text-muted-foreground">
            {[
              "Responsive layout preserved",
              "Resume content remains shared",
              "Switch modes anytime",
            ].map(item => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check size={11} className="text-[#2e0562]" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <InteractiveEditor
      data={data}
      onDesignChange={onDesignChange}
      interactive={interactive}
    />
  );
}
