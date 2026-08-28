import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  Check,
  CloudUpload,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  FolderKanban,
  GraduationCap,
  Layers3,
  LayoutTemplate,
  Link2,
  ListChecks,
  Lock,
  MousePointer2,
  Pencil,
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
  X,
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
import InteractiveTemplateOverlay from "./InteractiveTemplateOverlay";
import InteractivePublishingOverlay from "./InteractivePublishingOverlay";
import InteractivePublishReadinessOverlay from "./InteractivePublishReadinessOverlay";
import InteractiveTimeline from "./InteractiveTimeline";
import InteractiveDeviceToolbar from "./InteractiveDeviceToolbar";
import InteractiveObjectContextToolbar from "./InteractiveObjectContextToolbar";
import {
  buildInteractiveTemplate,
  normalizeInteractiveTemplateId,
  type InteractiveTemplateId,
} from "./resumeInteractiveTemplates";
import {
  addInteractiveObject,
  addInteractiveScene,
  animationTrackDefaults,
  clearInteractiveObjectBreakpointOverride,
  createInteractiveAnimationTrack,
  createInteractiveObject,
  duplicateInteractiveObject,
  duplicateInteractiveScene,
  getActiveInteractiveScene,
  getInteractiveObjectGeometry,
  getInteractiveSceneLayout,
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
  type InteractiveBreakpoint,
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
  withInteractiveObjectGeometryForBreakpoint,
} from "./resumeInteractive";
import {
  buildAmbientParticles,
  INTERACTIVE_MOTION_CSS,
  objectMotionAnimation,
} from "./resumeInteractiveMotion";
import {
  clearInteractiveSceneBreakpointLayout,
  seedInteractiveSceneBreakpointLayout,
  updateInteractiveObjectBreakpointGeometry,
  updateInteractiveSceneBreakpointLayout,
} from "./resumeInteractiveResponsive";
import { analyzeInteractivePublish } from "./resumeInteractivePerformance";
import { getResumeProjects } from "./resumeProjects";
import {
  applyInteractiveBindingDraft,
  getInteractiveBindingOptions,
  interactiveBindingDisplayName,
  resolveInteractiveObjectBinding,
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

type AmbientInspectorMode =
  | "twinkle"
  | "particles"
  | "shapes"
  | "gradient"
  | "parallax";

const AMBIENT_MODE_META: Array<{
  id: AmbientInspectorMode;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "twinkle",
    label: "Twinkle",
    shortLabel: "Twinkle",
    description: "Soft procedural stars that blink behind the scene.",
  },
  {
    id: "particles",
    label: "Particles",
    shortLabel: "Particles",
    description: "Tiny dots drift gently through the background.",
  },
  {
    id: "shapes",
    label: "Floating shapes",
    shortLabel: "Shapes",
    description: "Circles, squares and diamonds float behind content.",
  },
  {
    id: "gradient",
    label: "Gradient drift",
    shortLabel: "Gradient",
    description: "Slowly shifts a gradient background for subtle motion.",
  },
  {
    id: "parallax",
    label: "Background parallax",
    shortLabel: "Parallax",
    description: "Adds gentle pointer depth to the scene background.",
  },
];

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
          <span className="rounded-full bg-[#2e0562]/8 px-2 py-1 text-[12px] font-bold uppercase tracking-wider text-[#2e0562]">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4 text-[15px] font-semibold text-foreground">
        {title}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>

      <div className="mt-auto flex items-center gap-1 pt-3 text-[13px] font-semibold text-[#2e0562]">
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
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-foreground">
            {label}
          </div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>

        <button
          type="button"
          aria-label={`${effect.enabled ? "Disable" : "Enable"} ${label}`}
          aria-pressed={effect.enabled}
          onClick={() =>
            onChange({
              ...effect,
              enabled: !effect.enabled,
            })
          }
          className={`relative mt-0.5 h-[18px] w-[32px] flex-none rounded-full transition-colors ${
            effect.enabled ? "bg-[#2e0562]" : "bg-muted"
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

      {effect.enabled ? (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          {showDensity && (
            <label className="grid grid-cols-[50px_1fr_30px] items-center gap-1.5">
              <span className="text-[12px] font-semibold text-muted-foreground">
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
              <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                {Math.round(effect.density)}
              </span>
            </label>
          )}

          <label className="grid grid-cols-[50px_1fr_30px] items-center gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">
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
            <span className="text-right text-[12px] tabular-nums text-muted-foreground">
              {effect.speed.toFixed(1)}×
            </span>
          </label>

          <label className="grid grid-cols-[50px_1fr_30px] items-center gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">
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
            <span className="text-right text-[12px] tabular-nums text-muted-foreground">
              {Math.round(effect.intensity)}
            </span>
          </label>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ ...effect, enabled: true })}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2e0562]/25 bg-[#2e0562]/[0.025] px-2 py-1.5 text-[12px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5"
        >
          <Sparkles size={9} />
          Turn on {label.toLowerCase()}
        </button>
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
      <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-foreground outline-none"
        />
        {suffix && (
          <span className="ml-1 text-[12px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function InspectorSection({
  title,
  description,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/25"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground">
              {title}
            </span>
            {badge && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <ChevronDown
          size={11}
          className={`flex-none text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border p-2.5">{children}</div>}
    </div>
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
      appearance?.fontFamily ??
      (variant === "terminal"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : undefined),
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
  sceneWidth,
}: {
  object: InteractiveSceneObject;
  data: ResumeData;
  sceneWidth: number;
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
    const resolved = resolveInteractiveObjectBinding(data, object);

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

  const logicalFontSize = object.appearance?.fontSize ?? 24;
  const logicalLetterSpacing = object.appearance?.letterSpacing ?? 0;

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-3"
      style={appearance.shell}
    >
      <div
        className="line-clamp-4 w-full"
        style={{
          color: appearance.textColor,
          fontFamily: object.appearance?.fontFamily,
          fontSize: `${(logicalFontSize / Math.max(1, sceneWidth)) * 100}cqw`,
          fontWeight: object.appearance?.fontWeight ?? 650,
          fontStyle: object.appearance?.fontStyle ?? "normal",
          textAlign: object.appearance?.textAlign ?? "left",
          lineHeight: object.appearance?.lineHeight ?? 1.35,
          letterSpacing: `${(logicalLetterSpacing / Math.max(1, sceneWidth)) * 100}cqw`,
        }}
      >
        {object.text || "Text"}
      </div>
    </div>
  );
}

function InteractiveInlineTextEditor({
  object,
  sceneWidth,
  onCommit,
  onCancel,
}: {
  object: Extract<InteractiveSceneObject, { type: "text" }>;
  sceneWidth: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const appearance = interactiveObjectAppearanceStyle(object.appearance);
  const [draft, setDraft] = useState(object.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logicalFontSize = object.appearance?.fontSize ?? 24;
  const logicalLetterSpacing = object.appearance?.letterSpacing ?? 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
  }, [object.id]);

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-3"
      style={appearance.shell}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        aria-label={`Edit ${object.name || "text"}`}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="h-full w-full resize-none border-0 bg-transparent p-0 outline-none"
        style={{
          color: appearance.textColor,
          fontFamily: object.appearance?.fontFamily,
          fontSize: `${(logicalFontSize / Math.max(1, sceneWidth)) * 100}cqw`,
          fontWeight: object.appearance?.fontWeight ?? 650,
          fontStyle: object.appearance?.fontStyle ?? "normal",
          textAlign: object.appearance?.textAlign ?? "left",
          lineHeight: object.appearance?.lineHeight ?? 1.35,
          letterSpacing: `${(logicalLetterSpacing / Math.max(1, sceneWidth)) * 100}cqw`,
          overflow: "auto",
          touchAction: "manipulation",
          userSelect: "text",
        }}
      />
    </div>
  );
}


type InteractiveBoundTextDraft = Record<string, string>;

type InteractiveBoundEditorField = {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
};

function resumeEditorText(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function resumeEditorRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .filter(item => !!item && typeof item === "object")
        .map(item => item as Record<string, unknown>)
    : [];
}

function interactiveBoundEditorFields(
  data: ResumeData,
  binding: InteractiveResumeContentBinding | undefined,
): InteractiveBoundEditorField[] {
  if (!binding) return [];
  const field = binding.field ?? "entry";

  if (binding.source === "personal") {
    const fullName = `${resumeEditorText(data.firstName)} ${resumeEditorText(data.lastName)}`.trim();
    const values: Record<string, string> = {
      fullName,
      firstName: resumeEditorText(data.firstName),
      lastName: resumeEditorText(data.lastName),
      email: resumeEditorText(data.email),
      phone: resumeEditorText(data.phone),
      location: resumeEditorText(data.location),
      website: resumeEditorText(data.website),
      summary: resumeEditorText(data.summary),
    };
    const labels: Record<string, string> = {
      fullName: "Name",
      firstName: "First name",
      lastName: "Last name",
      email: "Email",
      phone: "Phone",
      location: "Location",
      website: "Website",
      summary: "Bio / summary",
    };
    const key = values[field] == null ? "fullName" : field;
    return [{
      key,
      label: labels[key] ?? "Text",
      value: values[key] ?? "",
      multiline: key === "summary",
    }];
  }

  if (binding.source === "work") {
    const entries = resumeEditorRecords(data.workEntries);
    const entry = entries.find(
      item => resumeEditorText(item.id) === resumeEditorText(binding.entryId),
    );
    if (!entry) return [];
    const bodyKey = "body" in entry ? "body" : "description";
    if (field === "entry") {
      return [
        { key: "title", label: "Role title", value: resumeEditorText(entry.title) },
        { key: "company", label: "Company", value: resumeEditorText(entry.company) },
        { key: "startDate", label: "Start", value: resumeEditorText(entry.startDate) },
        { key: "endDate", label: "End", value: resumeEditorText(entry.endDate) },
        {
          key: bodyKey,
          label: "Description",
          value: resumeEditorText(entry[bodyKey]),
          multiline: true,
        },
      ];
    }
    if (field === "dates") {
      return [
        { key: "startDate", label: "Start", value: resumeEditorText(entry.startDate) },
        { key: "endDate", label: "End", value: resumeEditorText(entry.endDate) },
      ];
    }
    if (field === "logoUrl") return [];
    const key = field === "body" ? bodyKey : field;
    return [{
      key,
      label:
        field === "company" ? "Company" : field === "body" ? "Description" : "Role title",
      value: resumeEditorText(entry[key]),
      multiline: field === "body",
    }];
  }

  if (binding.source === "project") {
    const project = getResumeProjects(data).find(item => item.id === binding.entryId);
    if (!project) return [];
    if (field === "entry") {
      return [
        { key: "title", label: "Project title", value: project.title },
        { key: "techStack", label: "Tech stack", value: project.techStack },
        { key: "description", label: "Description", value: project.description, multiline: true },
        { key: "liveUrl", label: "Live URL", value: project.liveUrl },
        { key: "githubUrl", label: "GitHub URL", value: project.githubUrl },
      ];
    }
    if (field === "imageUrl") return [];
    return [{
      key: field,
      label:
        field === "description"
          ? "Description"
          : field === "techStack"
            ? "Tech stack"
            : field === "githubUrl"
              ? "GitHub URL"
              : field === "liveUrl"
                ? "Live URL"
                : "Project title",
      value: resumeEditorText(project[field as keyof typeof project]),
      multiline: field === "description",
    }];
  }

  if (binding.source === "education") {
    const entries = resumeEditorRecords(data.education);
    const entry = entries.find(
      item => resumeEditorText(item.id) === resumeEditorText(binding.entryId),
    );
    if (!entry) return [];
    if (field === "entry") {
      return [
        { key: "degree", label: "Degree", value: resumeEditorText(entry.degree) },
        { key: "field", label: "Field", value: resumeEditorText(entry.field) },
        { key: "school", label: "School", value: resumeEditorText(entry.school) },
        { key: "startYear", label: "Start year", value: resumeEditorText(entry.startYear) },
        { key: "endYear", label: "End year", value: resumeEditorText(entry.endYear) },
      ];
    }
    if (field === "years") {
      return [
        { key: "startYear", label: "Start year", value: resumeEditorText(entry.startYear) },
        { key: "endYear", label: "End year", value: resumeEditorText(entry.endYear) },
      ];
    }
    return [{
      key: field,
      label:
        field === "school" ? "School" : field === "degree" ? "Degree" : "Field",
      value: resumeEditorText(entry[field]),
    }];
  }

  if (binding.source === "skill") {
    const index = Number(binding.entryId);
    const skills = Array.isArray(data.skills) ? data.skills : [];
    if (!Number.isInteger(index) || index < 0 || index >= skills.length) return [];
    return [{ key: "value", label: "Skill", value: resumeEditorText(skills[index]) }];
  }

  if (binding.source === "link") {
    const index = Number(binding.entryId);
    const links = Array.isArray(data.extraLinks) ? data.extraLinks : [];
    if (!Number.isInteger(index) || index < 0 || index >= links.length) return [];
    const link = links[index] && typeof links[index] === "object"
      ? (links[index] as Record<string, unknown>)
      : {};
    if (field === "entry") {
      return [
        { key: "label", label: "Label", value: resumeEditorText(link.label) },
        { key: "url", label: "URL", value: resumeEditorText(link.url) },
      ];
    }
    return [{
      key: field === "url" ? "url" : "label",
      label: field === "url" ? "URL" : "Label",
      value: resumeEditorText(link[field === "url" ? "url" : "label"]),
    }];
  }

  return [];
}

function interactiveResumeContentData(
  data: ResumeData,
  object: Extract<InteractiveSceneObject, { type: "resume-content" }>,
): ResumeData {
  return object.sharedContentUnlinked && object.localContent
    ? applyInteractiveBindingDraft(data, object.binding, object.localContent)
    : data;
}

function captureInteractiveLocalContent(
  data: ResumeData,
  binding: InteractiveResumeContentBinding | undefined,
): InteractiveBoundTextDraft {
  const fields = interactiveBoundEditorFields(data, binding);
  const snapshot: InteractiveBoundTextDraft = Object.fromEntries(
    fields.map(field => [field.key, field.value]),
  );
  if (!binding) return snapshot;

  const field = binding.field ?? "entry";
  if (binding.source === "work" && field === "entry") {
    const entry = resumeEditorRecords(data.workEntries).find(
      item => resumeEditorText(item.id) === resumeEditorText(binding.entryId),
    );
    if (entry) snapshot.logoUrl = resumeEditorText(entry.logoUrl);
  }
  if (binding.source === "project" && field === "entry") {
    const project = getResumeProjects(data).find(item => item.id === binding.entryId);
    if (project) snapshot.imageUrl = project.imageUrl ?? "";
  }

  return snapshot;
}

function InteractiveInlineResumeContentEditor({
  object,
  data,
  onCommit,
  onCancel,
}: {
  object: Extract<InteractiveSceneObject, { type: "resume-content" }>;
  data: ResumeData;
  onCommit: (draft: InteractiveBoundTextDraft) => void;
  onCancel: () => void;
}) {
  const appearance = interactiveObjectAppearanceStyle(object.appearance);
  const effectiveData = interactiveResumeContentData(data, object);
  const fields = interactiveBoundEditorFields(effectiveData, object.binding);
  const [draft, setDraft] = useState<InteractiveBoundTextDraft>(() =>
    Object.fromEntries(fields.map(field => [field.key, field.value])),
  );
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const field = firstFieldRef.current;
      if (!field) return;
      field.focus();
      if ("setSelectionRange" in field) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [object.id]);

  if (!fields.length) {
    return <SceneObjectContent object={object} data={data} sceneWidth={1440} />;
  }

  const finish = () => {
    if (cancelledRef.current) return;
    onCommit(draft);
  };

  return (
    <div
      className="h-full w-full overflow-auto px-3 py-2"
      style={{ ...appearance.shell, color: appearance.textColor }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onBlurCapture={event => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) finish();
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          cancelledRef.current = true;
          onCancel();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish();
        }
      }}
    >
      <div className="space-y-1.5">
        {fields.map((field, index) => {
          const common = {
            value: draft[field.key] ?? "",
            onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setDraft(current => ({ ...current, [field.key]: event.target.value })),
            className:
              "w-full rounded border border-current/15 bg-white/10 px-1.5 py-1 text-[11px] font-medium outline-none focus:border-current/40",
            style: { color: appearance.textColor },
          };
          return (
            <label key={field.key} className="block">
              <span
                className="mb-0.5 block text-[8px] font-bold uppercase tracking-[0.08em]"
                style={{ color: appearance.accentColor, opacity: 0.75 }}
              >
                {field.label}
              </span>
              {field.multiline ? (
                <textarea
                  {...common}
                  ref={index === 0 ? node => { firstFieldRef.current = node; } : undefined}
                  rows={3}
                  className={`${common.className} resize-none`}
                />
              ) : (
                <input
                  {...common}
                  ref={index === 0 ? node => { firstFieldRef.current = node; } : undefined}
                  type="text"
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function EditorObject({
  object,
  scene,
  data,
  selected,
  showHandles,
  geometry,
  motionReplayKey,
  scrollProgress,
  parallaxPointer,
  editingText,
  editingResumeContent,
  onPointerDown,
  onResizePointerDown,
  onRotatePointerDown,
  onBeginTextEdit,
  onBeginResumeContentEdit,
  onCommitTextEdit,
  onCommitResumeContentEdit,
  onCancelTextEdit,
}: {
  object: InteractiveSceneObject;
  scene: InteractiveScene;
  data: ResumeData;
  selected: boolean;
  showHandles: boolean;
  geometry: InteractiveObjectGeometry;
  motionReplayKey: number;
  scrollProgress: number;
  parallaxPointer: InteractiveParallaxPointer;
  editingText: boolean;
  editingResumeContent: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    object: InteractiveSceneObject,
  ) => void;
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
  onBeginTextEdit: (object: InteractiveSceneObject) => void;
  onBeginResumeContentEdit: (object: InteractiveSceneObject) => void;
  onCommitTextEdit: (objectId: string, value: string) => void;
  onCommitResumeContentEdit: (objectId: string, draft: InteractiveBoundTextDraft) => void;
  onCancelTextEdit: () => void;
}) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastEditTapRef = useRef<{
    time: number;
    x: number;
    y: number;
    pointerType: string;
  } | null>(null);
  const suppressSecondTapMoveRef = useRef(false);
  const editingObject = editingText || editingResumeContent;
  const editableObject =
    !object.locked &&
    (object.type === "text" ||
      (object.type === "resume-content" &&
        interactiveBoundEditorFields(
          interactiveResumeContentData(data, object),
          object.binding,
        ).length > 0));

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
      onPointerDown={event => {
        if (editingObject) {
          event.stopPropagation();
          return;
        }

        // The second press of a double-click/double-tap must never start a
        // move gesture. Detect it before beginMove so editing and dragging are
        // mutually exclusive rather than both becoming active together.
        if (editableObject && (event.button === 0 || event.pointerType === "touch")) {
          const previous = lastEditTapRef.current;
          const now = Date.now();
          const maxDelay = event.pointerType === "touch" ? 350 : 450;
          if (
            previous &&
            previous.pointerType === event.pointerType &&
            now - previous.time <= maxDelay &&
            Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 24
          ) {
            suppressSecondTapMoveRef.current = true;
            pointerStartRef.current = { x: event.clientX, y: event.clientY };
            event.stopPropagation();
            event.preventDefault();
            return;
          }
        }

        suppressSecondTapMoveRef.current = false;
        if (event.button === 0 || event.pointerType === "touch") {
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
        }
        onPointerDown(event, object);
      }}
      onPointerUp={event => {
        if (editingObject || !editableObject) return;

        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        const stayedStill =
          !!start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 10;

        if (suppressSecondTapMoveRef.current) {
          suppressSecondTapMoveRef.current = false;
          lastEditTapRef.current = null;
          if (!stayedStill) return;
          event.stopPropagation();
          if (object.type === "text") onBeginTextEdit(object);
          else if (object.type === "resume-content") onBeginResumeContentEdit(object);
          return;
        }

        if (stayedStill) {
          lastEditTapRef.current = {
            time: Date.now(),
            x: event.clientX,
            y: event.clientY,
            pointerType: event.pointerType,
          };
        }
      }}
      onDoubleClick={event => {
        event.stopPropagation();
        if (!editableObject) return;
        event.preventDefault();
        if (object.type === "text") onBeginTextEdit(object);
        else if (object.type === "resume-content") onBeginResumeContentEdit(object);
      }}
      onClick={event => {
        event.stopPropagation();
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
        cursor: editingObject
          ? "text"
          : object.locked
            ? "default"
            : selected
              ? "move"
              : "grab",
        touchAction: editingObject ? "manipulation" : "none",
        userSelect: editingObject ? "text" : "none",
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

        const groupMotionActive = hasSynchronizedGroupMotion(object);
        const groupAnimation = groupMotionActive
          ? objectMotionAnimation(object.groupMotion)
          : objectMotionAnimation(undefined);
        const groupMotionStyle: CSSProperties & Record<string, string | number> = {
          width: "100%",
          height: "100%",
          animationName: groupAnimation.animationName,
          animationDuration: groupAnimation.animationDuration,
          animationDelay: groupAnimation.animationDelay,
          animationTimingFunction: groupAnimation.animationTimingFunction,
          animationIterationCount: groupAnimation.animationIterationCount,
          animationDirection: groupAnimation.animationDirection,
          transformOrigin: groupAnimation.transformOrigin,
          ...(groupAnimation.variables ?? {}),
        };

        const rawContent =
          editingText && object.type === "text" ? (
            <InteractiveInlineTextEditor
              object={object}
              sceneWidth={scene.width}
              onCommit={value => onCommitTextEdit(object.id, value)}
              onCancel={onCancelTextEdit}
            />
          ) : editingResumeContent && object.type === "resume-content" ? (
            <InteractiveInlineResumeContentEditor
              object={object}
              data={data}
              onCommit={draft => onCommitResumeContentEdit(object.id, draft)}
              onCancel={onCancelTextEdit}
            />
          ) : (
            <SceneObjectContent object={object} data={data} sceneWidth={scene.width} />
          );

        // Grouping alone is organizational: keep each member's existing motion.
        // Once synchronized group motion exists, it is the single source of motion
        // for every member and individual motion is intentionally suppressed.
        const individualMotion = (
          <InteractiveParallaxLayer
            depth={object.parallaxDepth}
            pointer={parallaxPointer}
            intensity={scene.ambient.parallax.intensity}
            enabled={scene.ambient.parallax.enabled}
          >
            <InteractivePathMotion path={object.motionPath} progress={scrollProgress}>
              <InteractiveScrollMotion tracks={object.scrollTracks} progress={scrollProgress}>
                <InteractiveAdvancedMotion tracks={object.animationTracks} replayKey={motionReplayKey}>
                  <div
                    data-wp-interactive-motion={object.motion?.preset || undefined}
                    className="h-full w-full overflow-hidden"
                    style={motionStyle}
                  >
                    {rawContent}
                  </div>
                </InteractiveAdvancedMotion>
              </InteractiveScrollMotion>
            </InteractivePathMotion>
          </InteractiveParallaxLayer>
        );

        if (!groupMotionActive) return individualMotion;

        return (
          <InteractiveParallaxLayer
            depth={object.groupParallaxDepth}
            pointer={parallaxPointer}
            intensity={scene.ambient.parallax.intensity}
            enabled={scene.ambient.parallax.enabled}
          >
            <InteractivePathMotion path={object.groupMotionPath} progress={scrollProgress}>
              <InteractiveScrollMotion tracks={object.groupScrollTracks} progress={scrollProgress}>
                <InteractiveAdvancedMotion tracks={object.groupAnimationTracks} replayKey={motionReplayKey}>
                  <div
                    data-wp-interactive-group-motion={object.groupMotion?.preset || undefined}
                    className="h-full w-full overflow-hidden"
                    style={groupMotionStyle}
                  >
                    {rawContent}
                  </div>
                </InteractiveAdvancedMotion>
              </InteractiveScrollMotion>
            </InteractivePathMotion>
          </InteractiveParallaxLayer>
        );
      })()}

      {selected && !editingObject && (
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
              className="absolute left-1/2 top-[-22px] flex h-[17px] -translate-x-1/2 items-center gap-1 rounded bg-amber-500 px-1.5 text-[12px] font-bold text-white"
              style={{ pointerEvents: "none" }}
            >
              <Lock size={8} />
              LOCKED
            </div>
          ) : showHandles ? (
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
          ) : null}
        </>
      )}
    </div>
  );
}

function TransitionSceneSnapshot({
  scene,
  data,
  progress,
  breakpoint,
}: {
  scene: InteractiveScene;
  data: ResumeData;
  progress: number;
  breakpoint: InteractiveBreakpoint;
}) {
  const sceneLayout = getInteractiveSceneLayout(scene, breakpoint);
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
        if (!object) return null;
        const geometry = getInteractiveObjectGeometry(
          object,
          breakpoint,
          scene,
        );
        if (geometry.hidden) return null;

        return (
          <div
            key={object.id}
            style={{
              position: "absolute",
              left: `${(geometry.x / sceneLayout.width) * 100}%`,
              top: `${(geometry.y / sceneLayout.height) * 100}%`,
              width: `${(geometry.width / sceneLayout.width) * 100}%`,
              height: `${(geometry.height / sceneLayout.height) * 100}%`,
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
                  <SceneObjectContent object={object} data={data} sceneWidth={scene.width} />
                </div>
              </InteractiveScrollMotion>
            </InteractivePathMotion>
          </div>
        );
      })}
    </div>
  );
}

function bindingGroupIcon(
  group: InteractiveBindingOption["group"],
) {
  if (group === "Experience") return <BriefcaseBusiness size={12} />;
  if (group === "Projects") return <FolderKanban size={12} />;
  if (group === "Education") return <GraduationCap size={12} />;
  if (group === "Skills") return <ListChecks size={12} />;
  if (group === "Links") return <Link2 size={12} />;
  return <UserRound size={14} />;
}

function BindingPicker({
  options,
  query,
  mode,
  onQueryChange,
  onChoose,
  onClose,
}: {
  options: InteractiveBindingOption[];
  query: string;
  mode: "add" | "change";
  onQueryChange: (value: string) => void;
  onChoose: (option: InteractiveBindingOption) => void;
  onClose: () => void;
}) {
  const [groupFilter, setGroupFilter] = useState<
    InteractiveBindingOption["group"] | "All"
  >("All");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const normalized = query.trim().toLowerCase();
  const filtered = options.filter(option => {
    const matchesGroup =
      groupFilter === "All" || option.group === groupFilter;
    const matchesQuery =
      !normalized ||
      [option.group, option.label, option.detail ?? ""].some(value =>
        value.toLowerCase().includes(normalized),
      );
    return matchesGroup && matchesQuery;
  });

  const groups = [
    "Personal",
    "Experience",
    "Projects",
    "Education",
    "Skills",
    "Links",
  ] as const;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-interactive-binding-picker
      className="fixed inset-0 z-[1600]"
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === "add"
          ? "Add shared resume content"
          : "Change shared resume content"
      }
    >
      <button
        type="button"
        aria-label="Close shared resume content"
        onClick={onClose}
        className="absolute inset-0 bg-black/10"
      />

      <div className="absolute inset-y-3 right-3 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:inset-y-4 sm:right-4">
        <div className="flex flex-none items-start justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
              Shared resume content
            </div>
            <div className="mt-1 text-[16px] font-semibold text-foreground">
              {mode === "add"
                ? "Add content to this scene"
                : "Change linked content"}
            </div>
            <p className="mt-1 max-w-[330px] text-[13px] leading-relaxed text-muted-foreground">
              Choose live resume data. When the shared resume changes, this
              object updates automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-none border-b border-border px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search size={12} className="flex-none text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder="Search name, role, project, skill…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            {(["All", ...groups] as const).map(group => {
              const active = groupFilter === group;
              const count =
                group === "All"
                  ? options.length
                  : options.filter(option => option.group === group).length;

              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => setGroupFilter(group)}
                  aria-pressed={active}
                  className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[#2e0562]/25 bg-[#2e0562] text-white"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {group !== "All" && bindingGroupIcon(group)}
                  {group}
                  <span className={active ? "text-white/70" : "text-muted-foreground/70"}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {groups.map(group => {
            const items = filtered.filter(option => option.group === group);
            if (!items.length) return null;

            return (
              <section key={group} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-center justify-between gap-2 px-1.5">
                  <div className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {bindingGroupIcon(group)}
                    {group}
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {items.length}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {items.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onChoose(option)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#2e0562]/5 ${
                        index ? "border-t border-border" : ""
                      }`}
                    >
                      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                        {bindingGroupIcon(group)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">
                          {option.label}
                        </span>
                        {option.detail && (
                          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            {option.detail}
                          </span>
                        )}
                      </span>

                      <Plus
                        size={11}
                        className="mt-1 flex-none text-muted-foreground"
                      />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

          {!filtered.length && (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
                <Search size={14} />
              </div>
              <div className="mt-2 text-[13px] font-semibold text-foreground">
                No matching resume content
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Try another search or choose a different content category.
              </div>
            </div>
          )}
        </div>

        <div className="flex-none border-t border-border bg-muted/15 px-4 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          Shared resume data stays linked. Layout, motion and styling remain
          specific to this Interactive presentation.
        </div>
      </div>
    </div>,
    document.body,
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

type MotionInspectorMode = "quick" | "animate" | "scroll" | "path" | "depth";

function hasObjectMotionState(object: InteractiveSceneObject | null | undefined): boolean {
  return !!(
    object?.motion ||
    object?.animationTracks?.length ||
    object?.scrollTracks?.length ||
    object?.motionPath ||
    Math.abs(object?.parallaxDepth ?? 0) > 0.001
  );
}

function hasSynchronizedGroupMotion(
  object: InteractiveSceneObject | null | undefined,
): boolean {
  return !!(
    object?.groupId &&
    (object.groupMotion ||
      object.groupAnimationTracks?.length ||
      object.groupScrollTracks?.length ||
      object.groupMotionPath ||
      Math.abs(object.groupParallaxDepth ?? 0) > 0.001)
  );
}

function AdvancedMotionEditor({
  tracks,
  onChange,
  onReplay,
  embedded = false,
}: {
  tracks: InteractiveAnimationTrack[] | undefined;
  onChange: (tracks: InteractiveAnimationTrack[] | undefined) => void;
  onReplay: () => void;
  embedded?: boolean;
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
    <div className={embedded ? "space-y-2" : "mt-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/[0.025] p-2"}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {!embedded && (
            <div className="text-[12px] font-bold uppercase tracking-wider text-[#2e0562]">
              Triggered animation
            </div>
          )}
          <div className={`${embedded ? "text-[12px] font-semibold text-foreground" : "mt-0.5 text-[12px] leading-relaxed text-muted-foreground"}`}>
            {embedded
              ? `${current.length} animation track${current.length === 1 ? "" : "s"}`
              : "Animate individual properties on load, enter, hover, click or loop."}
          </div>
        </div>

        <button
          type="button"
          onClick={onReplay}
          title="Replay Load and Enter animations"
          className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw size={8} />
          Replay
        </button>
      </div>

      {!embedded && (
        <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-[12px] leading-relaxed text-muted-foreground">
          Quick motion and triggered animation can stack. X/Y tracks are visual offsets only - they never change the saved canvas position.
        </div>
      )}

      <div className="mt-2 space-y-2">
        {current.map((track, index) => {
          const meta = animationPropertyMeta(track.property);

          return (
            <div
              key={track.id}
              className="rounded-lg border border-border bg-background p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-bold text-foreground">
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
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
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
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
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
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                  />
                </label>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label>
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                  />
                </label>
              </div>

              <label className="mt-1.5 block">
                <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                  Easing
                </span>
                <select
                  value={track.easing}
                  onChange={event =>
                    updateTrack(track.id, {
                      easing: event.target.value as InteractiveAnimationEasing,
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                >
                  <option value="linear">Linear</option>
                  <option value="ease">Ease</option>
                  <option value="ease-in">Ease in</option>
                  <option value="ease-out">Ease out</option>
                  <option value="ease-in-out">Ease in/out</option>
                </select>
              </label>

              <div className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
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
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2e0562]/25 bg-background px-2 py-1.5 text-[12px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5 disabled:opacity-35"
      >
        <Plus size={9} />
        {current.length >= 8 ? "8 track limit" : "Add animation track"}
      </button>
    </div>
  );
}

function InteractiveEditor({
  data,
  onDataChange,
  onDesignChange,
  interactive,
  workspaceMode = false,
  templateOpenRequest,
}: {
  data: ResumeData;
  onDataChange: (data: ResumeData) => void;
  onDesignChange: (design: ResumeDesign) => void;
  interactive: InteractiveExperienceState;
  workspaceMode?: boolean;
  templateOpenRequest?: number;
}) {
  const scenes = getOrderedInteractiveScenes(interactive);
  const activeScene = getActiveInteractiveScene(interactive);
  const fullName = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(
    null,
  );
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [editingTextObjectId, setEditingTextObjectId] = useState<string | null>(null);
  const [editingResumeContentObjectId, setEditingResumeContentObjectId] = useState<string | null>(null);
  const [liveGeometry, setLiveGeometry] =
    useState<LiveGeometry | null>(null);
  const [liveGroupGeometries, setLiveGroupGeometries] = useState<
    Record<string, InteractiveObjectGeometry>
  >({});
  const [guides, setGuides] = useState<SnapGuides>({});
  const [zoom, setZoom] = useState(1);
  const [activeBreakpoint, setActiveBreakpoint] =
    useState<InteractiveBreakpoint>("desktop");
  const [motionReplayKey, setMotionReplayKey] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollWheelPreview, setScrollWheelPreview] = useState(false);
  const [parallaxPointer, setParallaxPointer] =
    useState<InteractiveParallaxPointer>({ x: 0, y: 0 });
  const [liveMotionPath, setLiveMotionPath] =
    useState<InteractiveMotionPath | null>(null);
  const [transitionPlayKey, setTransitionPlayKey] = useState(0);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [publishingOpen, setPublishingOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [renamingScene, setRenamingScene] = useState(false);
  const [sceneNameDraft, setSceneNameDraft] = useState("");
  const [bindingPickerMode, setBindingPickerMode] = useState<
    "add" | "change" | null
  >(null);
  const [bindingSearch, setBindingSearch] = useState("");
  const [motionInspectorMode, setMotionInspectorMode] =
    useState<MotionInspectorMode>("quick");
  const [ambientInspectorMode, setAmbientInspectorMode] =
    useState<AmbientInspectorMode>("twinkle");
  const [groupMotionOverridePromptOpen, setGroupMotionOverridePromptOpen] =
    useState(false);
  const [collapsedLayerGroupIds, setCollapsedLayerGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [, setHistoryVersion] = useState(0);

  const bindingOptions = getInteractiveBindingOptions(data);
  const publishReport = analyzeInteractivePublish(data);

  const canvasRef = useRef<HTMLDivElement>(null);
  const centerScrollRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const previewRestoreRef = useRef<{ zoom: number; scrollTop: number } | null>(null);
  const lastTemplateOpenRequestRef = useRef(templateOpenRequest);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const pendingGroupMotionUpdaterRef = useRef<
    ((object: InteractiveSceneObject) => InteractiveSceneObject) | null
  >(null);
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
  const selectedObjects = (
    selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : []
  )
    .map(objectId => activeScene.objects[objectId])
    .filter((object): object is InteractiveSceneObject => !!object);
  const hasMultipleSelection = selectedObjects.length > 1;
  const allSelectedLocked =
    selectedObjects.length > 0 && selectedObjects.every(object => !!object.locked);
  const anySelectedLocked = selectedObjects.some(object => !!object.locked);
  const selectedGroupId =
    selectedObjects.length > 1 &&
    selectedObjects[0]?.groupId &&
    selectedObjects.every(object => object.groupId === selectedObjects[0].groupId)
      ? selectedObjects[0].groupId
      : undefined;
  const selectedGroupName = selectedGroupId
    ? selectedObjects.find(object => object.groupName?.trim())?.groupName?.trim() || "Group"
    : undefined;

  const objectSelectionIds = useCallback(
    (objectId: string): string[] => {
      const object = activeScene.objects[objectId];
      if (!object) return [];
      if (!object.groupId) return [objectId];
      return activeScene.objectOrder.filter(
        id => activeScene.objects[id]?.groupId === object.groupId,
      );
    },
    [activeScene.objectOrder, activeScene.objects],
  );

  const selectObject = useCallback(
    (objectId: string, additive = false) => {
      const selectionIds = objectSelectionIds(objectId);
      if (!selectionIds.length) return;

      if (!additive) {
        setSelectedObjectIds(selectionIds);
        setSelectedObjectId(objectId);
        return;
      }

      const allAlreadySelected = selectionIds.every(id =>
        selectedObjectIds.includes(id),
      );
      const next = allAlreadySelected
        ? selectedObjectIds.filter(id => !selectionIds.includes(id))
        : [
            ...selectedObjectIds,
            ...selectionIds.filter(id => !selectedObjectIds.includes(id)),
          ];

      setSelectedObjectIds(next);
      setSelectedObjectId(
        allAlreadySelected ? next[next.length - 1] ?? null : objectId,
      );
    },
    [objectSelectionIds, selectedObjectIds],
  );

  useEffect(() => {
    setSelectedObjectIds(current => {
      const valid = current.filter(id => !!activeScene.objects[id]);
      if (!selectedObjectId) return [];
      if (valid.includes(selectedObjectId)) return valid;
      return activeScene.objects[selectedObjectId] ? [selectedObjectId] : [];
    });
  }, [activeScene.id, activeScene.objects, selectedObjectId]);

  useEffect(() => {
    const object = selectedObjectId
      ? activeScene.objects[selectedObjectId] ?? null
      : null;
    const motion = selectedGroupId ? object?.groupMotion : object?.motion;
    const animationTracks = selectedGroupId
      ? object?.groupAnimationTracks
      : object?.animationTracks;
    const scrollTracks = selectedGroupId
      ? object?.groupScrollTracks
      : object?.scrollTracks;
    const motionPath = selectedGroupId
      ? object?.groupMotionPath
      : object?.motionPath;
    const parallaxDepth = selectedGroupId
      ? object?.groupParallaxDepth
      : object?.parallaxDepth;

    let initialMode: MotionInspectorMode = "quick";
    if (!motion && animationTracks?.length) initialMode = "animate";
    else if (!motion && scrollTracks?.length) initialMode = "scroll";
    else if (!motion && motionPath) initialMode = "path";
    else if (!motion && Math.abs(parallaxDepth ?? 0) > 0.001) initialMode = "depth";

    setMotionInspectorMode(initialMode);
  }, [activeScene.id, selectedGroupId, selectedObjectId]);

  useEffect(() => {
    pendingGroupMotionUpdaterRef.current = null;
    setGroupMotionOverridePromptOpen(false);
  }, [activeScene.id, selectedGroupId]);

  useEffect(() => {
    setRenamingScene(false);
    setSceneNameDraft("");
  }, [activeScene.id]);

  useEffect(() => {
    const firstEnabled: AmbientInspectorMode | undefined =
      activeScene.ambient.twinkle.enabled
        ? "twinkle"
        : activeScene.ambient.particles.enabled
          ? "particles"
          : activeScene.ambient.floatingShapes.enabled
            ? "shapes"
            : activeScene.ambient.gradientDrift.enabled
              ? "gradient"
              : activeScene.ambient.parallax.enabled
                ? "parallax"
                : undefined;

    setAmbientInspectorMode(firstEnabled ?? "twinkle");
  }, [activeScene.id]);

  useEffect(() => {
    if (!addMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || addMenuRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen]);

  const activeSceneLayout = getInteractiveSceneLayout(
    activeScene,
    activeBreakpoint,
  );
  const editorScene: InteractiveScene = {
    ...activeScene,
    width: activeSceneLayout.width,
    height: activeSceneLayout.height,
    scrollLength: activeSceneLayout.scrollLength,
    objects: Object.fromEntries(
      activeScene.objectOrder
        .map(objectId => {
          const object = activeScene.objects[objectId];
          if (!object) return null;
          return [
            objectId,
            {
              ...object,
              geometry: getInteractiveObjectGeometry(
                object,
                activeBreakpoint,
                activeScene,
              ),
            } as InteractiveSceneObject,
          ] as const;
        })
        .filter(
          (
            entry,
          ): entry is readonly [string, InteractiveSceneObject] =>
            !!entry,
        ),
    ),
  };
  const selectedGeometry = selectedObject
    ? getInteractiveObjectGeometry(
        selectedObject,
        activeBreakpoint,
        activeScene,
      )
    : null;
  const effectiveGeometryFor = (object: InteractiveSceneObject) =>
    liveGroupGeometries[object.id] ??
    (liveGeometry?.objectId === object.id
      ? liveGeometry.geometry
      : getInteractiveObjectGeometry(object, activeBreakpoint, activeScene));

  const selectedSelectionGeometry = selectedObjects.length
    ? selectedObjects.reduce<InteractiveObjectGeometry | null>((bounds, object) => {
        const geometry = effectiveGeometryFor(object);
        if (!bounds) return { ...geometry, rotation: 0 };
        const left = Math.min(bounds.x, geometry.x);
        const top = Math.min(bounds.y, geometry.y);
        const right = Math.max(bounds.x + bounds.width, geometry.x + geometry.width);
        const bottom = Math.max(bounds.y + bounds.height, geometry.y + geometry.height);
        return {
          ...bounds,
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
          rotation: 0,
        };
      }, null)
    : selectedGeometry;

  const selectedSetForLayers = new Set(
    selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [],
  );
  const canBringSelectedForward = activeScene.objectOrder.some(
    (objectId, index) =>
      selectedSetForLayers.has(objectId) &&
      index < activeScene.objectOrder.length - 1 &&
      !selectedSetForLayers.has(activeScene.objectOrder[index + 1]),
  );
  const canSendSelectedBackward = activeScene.objectOrder.some(
    (objectId, index) =>
      selectedSetForLayers.has(objectId) &&
      index > 0 &&
      !selectedSetForLayers.has(activeScene.objectOrder[index - 1]),
  );

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

  const focusReadinessIssue = (
    sceneId?: string,
    objectId?: string,
  ) => {
    if (!sceneId || !interactive.scenes[sceneId]) return;

    setTemplateGalleryOpen(false);
    setPublishingOpen(false);
    setReadinessOpen(false);
    setLiveGeometry(null);
    setGuides({});

    mutateScenes(
      collection => setActiveInteractiveScene(collection, sceneId),
      { recordHistory: false },
    );

    setSelectedObjectId(
      objectId && interactive.scenes[sceneId]?.objects[objectId]
        ? objectId
        : null,
    );
  };

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

  const beginInlineTextEdit = useCallback(
    (object: InteractiveSceneObject) => {
      if (object.type !== "text" || object.locked) return;
      setSelectedObjectId(object.id);
      setEditingTextObjectId(object.id);
      setAddMenuOpen(false);
      setBindingPickerMode(null);
    },
    [],
  );

  const beginInlineResumeContentEdit = useCallback(
    (object: InteractiveSceneObject) => {
      if (object.type !== "resume-content" || object.locked) return;
      if (!interactiveBoundEditorFields(
        interactiveResumeContentData(data, object),
        object.binding,
      ).length) return;
      setSelectedObjectId(object.id);
      setEditingResumeContentObjectId(object.id);
      setAddMenuOpen(false);
      setBindingPickerMode(null);
    },
    [data],
  );

  const commitInlineTextEdit = useCallback(
    (objectId: string, value: string) => {
      mutateScenes(collection =>
        updateInteractiveObject(
          collection,
          activeScene.id,
          objectId,
          current =>
            current.type === "text"
              ? {
                  ...current,
                  text: value,
                }
              : current,
        ),
      );
      setEditingTextObjectId(null);
    },
    [activeScene.id, mutateScenes],
  );

  const commitInlineResumeContentEdit = useCallback(
    (objectId: string, draft: InteractiveBoundTextDraft) => {
      const object = activeScene.objects[objectId];
      if (object?.type === "resume-content") {
        if (object.sharedContentUnlinked) {
          mutateScenes(collection =>
            updateInteractiveObject(
              collection,
              activeScene.id,
              objectId,
              current =>
                current.type === "resume-content"
                  ? {
                      ...current,
                      localContent: {
                        ...(current.localContent ?? {}),
                        ...draft,
                      },
                    }
                  : current,
            ),
          );
        } else {
          onDataChange(applyInteractiveBindingDraft(data, object.binding, draft));
        }
      }
      setEditingResumeContentObjectId(null);
    },
    [activeScene.id, activeScene.objects, data, mutateScenes, onDataChange],
  );

  const cancelInlineTextEdit = useCallback(() => {
    setEditingTextObjectId(null);
    setEditingResumeContentObjectId(null);
  }, []);

  const editSelectedSharedContentOnlyHere = useCallback(() => {
    if (!selectedObjectId) return;
    const object = activeScene.objects[selectedObjectId];
    if (!object || object.type !== "resume-content" || object.sharedContentUnlinked) return;

    const snapshot = captureInteractiveLocalContent(data, object.binding);

    mutateScenes(collection =>
      updateInteractiveObject(
        collection,
        activeScene.id,
        selectedObjectId,
        current =>
          current.type === "resume-content"
            ? {
                ...current,
                sharedContentUnlinked: true,
                localContent: snapshot,
              }
            : current,
      ),
    );
    setEditingResumeContentObjectId(null);
  }, [activeScene.id, activeScene.objects, data, mutateScenes, selectedObjectId]);

  const relinkSelectedUsingShared = useCallback(() => {
    if (!selectedObjectId) return;
    mutateScenes(collection =>
      updateInteractiveObject(
        collection,
        activeScene.id,
        selectedObjectId,
        current =>
          current.type === "resume-content"
            ? {
                ...current,
                sharedContentUnlinked: undefined,
                localContent: undefined,
              }
            : current,
      ),
    );
    setEditingResumeContentObjectId(null);
  }, [activeScene.id, mutateScenes, selectedObjectId]);

  const relinkSelectedUsingLocal = useCallback(() => {
    if (!selectedObjectId) return;
    const object = activeScene.objects[selectedObjectId];
    if (!object || object.type !== "resume-content") return;

    const nextData = object.localContent
      ? applyInteractiveBindingDraft(data, object.binding, object.localContent)
      : data;
    const nextCollection = updateInteractiveObject(
      currentCollection,
      activeScene.id,
      selectedObjectId,
      current =>
        current.type === "resume-content"
          ? {
              ...current,
              sharedContentUnlinked: undefined,
              localContent: undefined,
            }
          : current,
    );

    const history = historyRef.current;
    history.past.push(cloneCollection(currentCollection));
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.future = [];
    setHistoryVersion(value => value + 1);

    const nextDesign = updateInteractiveExperience(
      nextData.design,
      current => ({
        ...current,
        ...nextCollection,
      }),
    );
    onDataChange({ ...nextData, design: nextDesign });
    setEditingResumeContentObjectId(null);
  }, [activeScene.id, activeScene.objects, currentCollection, data, onDataChange, selectedObjectId]);

  const openSharedContentPicker = useCallback(() => {
    setAddMenuOpen(false);
    setBindingPickerMode("change");
    setBindingSearch("");
  }, []);

  const patchSelectedObjects = (
    updater: (object: InteractiveSceneObject) => InteractiveSceneObject,
  ) => {
    const ids = selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (!ids.length) return;

    mutateScenes(collection =>
      ids.reduce(
        (next, objectId) =>
          updateInteractiveObject(
            next,
            activeScene.id,
            objectId,
            updater,
          ),
        collection,
      ),
    );
  };

  const selectedGroupMotionObject: InteractiveSceneObject | null =
    selectedGroupId && selectedObjects.length > 1
      ? ({
          ...selectedObjects[0],
          motion: selectedObjects[0].groupMotion,
          animationTracks: selectedObjects[0].groupAnimationTracks,
          scrollTracks: selectedObjects[0].groupScrollTracks,
          motionPath: selectedObjects[0].groupMotionPath,
          parallaxDepth: selectedObjects[0].groupParallaxDepth,
        } as InteractiveSceneObject)
      : null;

  const selectedGroupMotionActive = hasObjectMotionState(
    selectedGroupMotionObject,
  );
  const selectedIndividualMotionCount = selectedObjects.filter(object =>
    hasObjectMotionState(object),
  ).length;

  const commitSelectedGroupMotion = (
    updater: (object: InteractiveSceneObject) => InteractiveSceneObject,
    clearIndividualMotion: boolean,
  ) => {
    if (!selectedGroupId || !selectedGroupMotionObject) return;
    const updated = updater(selectedGroupMotionObject);

    patchSelectedObjects(current => ({
      ...current,
      ...(clearIndividualMotion
        ? {
            motion: undefined,
            animationTracks: undefined,
            scrollTracks: undefined,
            motionPath: undefined,
            parallaxDepth: undefined,
          }
        : {}),
      groupMotion: updated.motion ? { ...updated.motion } : undefined,
      groupAnimationTracks: updated.animationTracks?.map(track => ({ ...track })),
      groupScrollTracks: updated.scrollTracks?.map(track => ({
        ...track,
        keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
      })),
      groupMotionPath: updated.motionPath
        ? {
            ...updated.motionPath,
            points: updated.motionPath.points.map(point => ({ ...point })),
          }
        : undefined,
      groupParallaxDepth: updated.parallaxDepth,
    } as InteractiveSceneObject));
  };

  const patchSelectedGroupMotion = (
    updater: (object: InteractiveSceneObject) => InteractiveSceneObject,
  ) => {
    if (!selectedGroupId || !selectedGroupMotionObject) return;

    const preview = updater(selectedGroupMotionObject);
    const willHaveGroupMotion = hasObjectMotionState(preview);
    const startsGroupMotion = !selectedGroupMotionActive && willHaveGroupMotion;

    if (startsGroupMotion && selectedIndividualMotionCount > 0) {
      pendingGroupMotionUpdaterRef.current = updater;
      setGroupMotionOverridePromptOpen(true);
      return;
    }

    // Once group motion exists, individual motion is no longer a second layer.
    // Clear it defensively on every group-motion edit, including legacy state
    // created by the earlier additive implementation.
    commitSelectedGroupMotion(
      updater,
      selectedGroupMotionActive || willHaveGroupMotion,
    );
  };

  const confirmSelectedGroupMotionOverride = () => {
    const updater = pendingGroupMotionUpdaterRef.current;
    pendingGroupMotionUpdaterRef.current = null;
    setGroupMotionOverridePromptOpen(false);
    if (!updater) return;
    commitSelectedGroupMotion(updater, true);
  };

  const cancelSelectedGroupMotionOverride = () => {
    pendingGroupMotionUpdaterRef.current = null;
    setGroupMotionOverridePromptOpen(false);
  };

  const toggleSelectedLock = () => {
    const ids = selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (!ids.length) return;
    const shouldLock = !ids.every(id => !!activeScene.objects[id]?.locked);
    patchSelectedObjects(current => ({
      ...current,
      locked: shouldLock || undefined,
    } as InteractiveSceneObject));
  };

  const toggleSelectedGroup = () => {
    if (selectedObjectIds.length < 2) return;

    if (selectedGroupId) {
      // Ungrouping removes group-only motion. Individual motion, when there was
      // no group override, was never touched by grouping in the first place.
      patchSelectedObjects(current => ({
        ...current,
        groupId: undefined,
        groupName: undefined,
        groupMotion: undefined,
        groupAnimationTracks: undefined,
        groupScrollTracks: undefined,
        groupMotionPath: undefined,
        groupParallaxDepth: undefined,
      } as InteractiveSceneObject));
      return;
    }

    const groupId =
      `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const existingGroupIds = new Set(
      activeScene.objectOrder
        .map(objectId => activeScene.objects[objectId]?.groupId)
        .filter((value): value is string => !!value),
    );
    const groupName = `Group ${existingGroupIds.size + 1}`;

    // Grouping is organizational only. Preserve every object's own animation
    // until the user explicitly applies motion to the group.
    patchSelectedObjects(current => ({
      ...current,
      groupId,
      groupName,
      groupMotion: undefined,
      groupAnimationTracks: undefined,
      groupScrollTracks: undefined,
      groupMotionPath: undefined,
      groupParallaxDepth: undefined,
    } as InteractiveSceneObject));
  };

  const renameSelectedGroup = (name: string) => {
    if (!selectedGroupId) return;
    const nextName = name.trim().slice(0, 80) || "Group";
    patchSelectedObjects(current => ({
      ...current,
      groupName: nextName,
    } as InteractiveSceneObject));
  };

  const arrangeSelectedObjects = (
    action: "front" | "forward" | "backward",
  ) => {
    const ids = selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (!ids.length) return;
    const selectedSet = new Set(ids);

    mutateScenes(collection => {
      let next = collection;
      const scene = next.scenes[activeScene.id];
      if (!scene) return next;
      const selectedInOrder = scene.objectOrder.filter(id => selectedSet.has(id));

      if (action === "front") {
        selectedInOrder.forEach(objectId => {
          let guard = scene.objectOrder.length + 1;
          while (guard-- > 0) {
            const currentScene = next.scenes[activeScene.id];
            const index = currentScene?.objectOrder.indexOf(objectId) ?? -1;
            if (!currentScene || index < 0 || index === currentScene.objectOrder.length - 1) break;
            next = moveInteractiveObjectLayer(next, activeScene.id, objectId, 1);
          }
        });
        return next;
      }

      const ordered =
        action === "forward"
          ? [...selectedInOrder].reverse()
          : selectedInOrder;
      ordered.forEach(objectId => {
        next = moveInteractiveObjectLayer(
          next,
          activeScene.id,
          objectId,
          action === "forward" ? 1 : -1,
        );
      });
      return next;
    });
  };

  const patchActiveSceneLayout = (
    patch: {
      width?: number;
      height?: number;
      scrollLength?: number;
    },
  ) => {
    mutateScenes(collection =>
      updateInteractiveSceneBreakpointLayout(
        collection,
        activeScene.id,
        activeBreakpoint,
        patch,
      ),
    );
  };

  const commitObjectGeometry = (
    objectId: string,
    geometry: InteractiveObjectGeometry,
  ) => {
    const current = activeScene.objects[objectId];
    if (!current) return;

    const currentGeometry = getInteractiveObjectGeometry(
      current,
      activeBreakpoint,
      activeScene,
    );
    if (sameGeometry(currentGeometry, geometry)) return;

    mutateScenes(collection =>
      updateInteractiveObjectBreakpointGeometry(
        collection,
        activeScene.id,
        objectId,
        activeBreakpoint,
        geometry,
      ),
    );
  };

  const commitObjectGeometries = (
    geometries: Record<string, InteractiveObjectGeometry>,
  ) => {
    const entries = Object.entries(geometries).filter(([objectId, geometry]) => {
      const object = activeScene.objects[objectId];
      if (!object) return false;
      return !sameGeometry(
        getInteractiveObjectGeometry(object, activeBreakpoint, activeScene),
        geometry,
      );
    });
    if (!entries.length) return;

    mutateScenes(collection =>
      entries.reduce(
        (next, [objectId, geometry]) =>
          updateInteractiveObjectBreakpointGeometry(
            next,
            activeScene.id,
            objectId,
            activeBreakpoint,
            geometry,
          ),
        collection,
      ),
    );
  };

  const patchSelectedGeometry = (
    updater: (
      geometry: InteractiveObjectGeometry,
    ) => InteractiveObjectGeometry,
  ) => {
    if (!selectedObjectId) return;
    const object = activeScene.objects[selectedObjectId];
    if (!object) return;

    const currentGeometry = getInteractiveObjectGeometry(
      object,
      activeBreakpoint,
      activeScene,
    );
    commitObjectGeometry(
      selectedObjectId,
      updater(currentGeometry),
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

    const placed =
      activeBreakpoint === "desktop"
        ? object
        : withInteractiveObjectGeometryForBreakpoint(
            object,
            activeBreakpoint,
            {
              ...object.geometry,
              x: Math.round((activeSceneLayout.width - width) / 2),
              y: Math.round((activeSceneLayout.height - height) / 2),
            },
          );

    mutateScenes(collection =>
      addInteractiveObject(
        collection,
        activeScene.id,
        placed,
      ),
    );

    setSelectedObjectId(placed.id);
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

    const placed =
      activeBreakpoint === "desktop"
        ? bound
        : withInteractiveObjectGeometryForBreakpoint(
            bound,
            activeBreakpoint,
            {
              ...bound.geometry,
              x: Math.round(
                (activeSceneLayout.width - suggested.width) / 2,
              ),
              y: Math.round(
                (activeSceneLayout.height - suggested.height) / 2,
              ),
            },
          );

    mutateScenes(collection =>
      addInteractiveObject(
        collection,
        activeScene.id,
        placed,
      ),
    );

    setSelectedObjectId(placed.id);
    setAddMenuOpen(false);
    setBindingPickerMode(null);
    setBindingSearch("");
  };

  const changeSelectedBinding = (
    bindingValue: InteractiveResumeContentBinding,
    label: string,
  ) => {
    const suggested = suggestedBoundContentSize(bindingValue);

    patchSelectedObject(current => {
      if (current.type !== "resume-content") return current;

      const geometry = getInteractiveObjectGeometry(
        current,
        activeBreakpoint,
        activeScene,
      );

      return withInteractiveObjectGeometryForBreakpoint(
        {
          ...current,
          name: label,
          binding: bindingValue,
          sharedContentUnlinked: undefined,
          localContent: undefined,
        },
        activeBreakpoint,
        {
          ...geometry,
          width: Math.max(geometry.width, suggested.width),
          height: Math.max(geometry.height, suggested.height),
        },
      );
    });
    setBindingPickerMode(null);
    setBindingSearch("");
  };

  const removeSelectedObject = useCallback(() => {
    const ids = selectedObjectIds.length
      ? selectedObjectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (!ids.length) return;

    mutateScenes(collection =>
      ids.reduce(
        (next, objectId) =>
          removeInteractiveObject(next, activeScene.id, objectId),
        collection,
      ),
    );
    setSelectedObjectId(null);
    setSelectedObjectIds([]);
  }, [
    activeScene.id,
    mutateScenes,
    selectedObjectId,
    selectedObjectIds,
  ]);

  const duplicateSelectedObject = useCallback(() => {
    const ids = selectedObjectIds.length
      ? activeScene.objectOrder.filter(id => selectedObjectIds.includes(id))
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    if (!ids.length) return;

    let next = currentCollection;
    const duplicatedIds: string[] = [];
    ids.forEach(objectId => {
      const result = duplicateInteractiveObject(
        next,
        activeScene.id,
        objectId,
      );
      next = result.collection;
      if (result.objectId) duplicatedIds.push(result.objectId);
    });
    if (!duplicatedIds.length) return;

    if (selectedGroupId && duplicatedIds.length > 1) {
      const duplicatedGroupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      next = duplicatedIds.reduce(
        (collection, objectId) =>
          updateInteractiveObject(
            collection,
            activeScene.id,
            objectId,
            current => ({
              ...current,
              groupId: duplicatedGroupId,
              groupName: `${selectedGroupName ?? "Group"} copy`,
            } as InteractiveSceneObject),
          ),
        next,
      );
    }

    applyCollection(next);
    setSelectedObjectIds(duplicatedIds);
    setSelectedObjectId(duplicatedIds[duplicatedIds.length - 1]);
  }, [
    activeScene.id,
    activeScene.objectOrder,
    applyCollection,
    currentCollection,
    selectedGroupId,
    selectedGroupName,
    selectedObjectId,
    selectedObjectIds,
  ]);

  const nudgeSelectedObject = useCallback(
    (dx: number, dy: number) => {
      const ids = selectedObjectIds.length
        ? selectedObjectIds
        : selectedObjectId
          ? [selectedObjectId]
          : [];
      if (!ids.length) return;

      mutateScenes(collection =>
        ids.reduce((next, objectId) => {
          const object = activeScene.objects[objectId];
          if (!object || object.locked) return next;
          const geometry = getInteractiveObjectGeometry(
            object,
            activeBreakpoint,
            activeScene,
          );
          return updateInteractiveObjectBreakpointGeometry(
            next,
            activeScene.id,
            objectId,
            activeBreakpoint,
            {
              ...geometry,
              x: geometry.x + dx,
              y: geometry.y + dy,
            },
          );
        }, collection),
      );
    },
    [
      activeBreakpoint,
      activeScene,
      mutateScenes,
      selectedObjectId,
      selectedObjectIds,
    ],
  );

  useEffect(() => {
    setScrollProgress(0);
    setScrollWheelPreview(false);
    setParallaxPointer({ x: 0, y: 0 });
    setLiveMotionPath(null);
    setEditingTextObjectId(null);
    setEditingResumeContentObjectId(null);
    setLiveGeometry(null);
    setLiveGroupGeometries({});
    setGuides({});
  }, [activeBreakpoint, activeScene.id]);

  useEffect(() => {
    if (
      selectedObjectId &&
      !activeScene.objects[selectedObjectId]
    ) {
      setSelectedObjectId(null);
    }
    if (
      editingTextObjectId &&
      !activeScene.objects[editingTextObjectId]
    ) {
      setEditingTextObjectId(null);
    }
    if (
      editingResumeContentObjectId &&
      !activeScene.objects[editingResumeContentObjectId]
    ) {
      setEditingResumeContentObjectId(null);
    }
    setLiveGeometry(null);
    setLiveGroupGeometries({});
    setGuides({});
  }, [
    activeScene.id,
    activeScene.objects,
    editingResumeContentObjectId,
    editingTextObjectId,
    selectedObjectId,
  ]);

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

    if (event.shiftKey) {
      event.preventDefault();
      selectObject(object.id, true);
      return;
    }

    const clickedSelection = objectSelectionIds(object.id);
    const movingIds = selectedObjectIds.includes(object.id)
      ? selectedObjectIds
      : clickedSelection;

    if (!selectedObjectIds.includes(object.id)) {
      selectObject(object.id, false);
    } else {
      setSelectedObjectId(object.id);
    }

    const movingObjects = movingIds
      .map(objectId => activeScene.objects[objectId])
      .filter((item): item is InteractiveSceneObject => !!item);
    if (!movingObjects.length || movingObjects.some(item => item.locked)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startGeometries = Object.fromEntries(
      movingObjects.map(item => [
        item.id,
        {
          ...getInteractiveObjectGeometry(
            item,
            activeBreakpoint,
            activeScene,
          ),
        },
      ]),
    ) as Record<string, InteractiveObjectGeometry>;
    const primaryStart = startGeometries[object.id];
    if (!primaryStart) return;

    let finalGeometries = startGeometries;
    let moved = false;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const dx =
        (pointer.clientX - startX) *
        (activeSceneLayout.width / rect.width);
      const dy =
        (pointer.clientY - startY) *
        (activeSceneLayout.height / rect.height);

      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;

      const primaryCandidate: InteractiveObjectGeometry = {
        ...primaryStart,
        x: primaryStart.x + dx,
        y: primaryStart.y + dy,
      };

      const snapped = snapMoveGeometry(
        editorScene,
        object.id,
        primaryCandidate,
        !pointer.altKey,
      );
      const actualDx = snapped.geometry.x - primaryStart.x;
      const actualDy = snapped.geometry.y - primaryStart.y;

      finalGeometries = Object.fromEntries(
        Object.entries(startGeometries).map(([objectId, geometry]) => [
          objectId,
          {
            ...geometry,
            x: geometry.x + actualDx,
            y: geometry.y + actualDy,
          },
        ]),
      ) as Record<string, InteractiveObjectGeometry>;

      setLiveGroupGeometries(finalGeometries);
      setGuides(snapped.guides);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setGuides({});
      setLiveGroupGeometries({});

      if (moved) {
        commitObjectGeometries(finalGeometries);
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
    const start = {
      ...getInteractiveObjectGeometry(
        object,
        activeBreakpoint,
        activeScene,
      ),
    };
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
        (activeSceneLayout.width / rect.width);
      const screenDy =
        (pointer.clientY - startY) *
        (activeSceneLayout.height / rect.height);

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
      liveGroupGeometries[object.id] ??
      (liveGeometry?.objectId === object.id
        ? liveGeometry.geometry
        : getInteractiveObjectGeometry(
            object,
            activeBreakpoint,
            activeScene,
          ));

    const centerX =
      rect.left +
      ((geometry.x + geometry.width / 2) / activeSceneLayout.width) *
        rect.width;
    const centerY =
      rect.top +
      ((geometry.y + geometry.height / 2) / activeSceneLayout.height) *
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

  const beginSelectionResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    horizontal: "left" | "right",
    vertical: "top" | "bottom",
  ) => {
    if (
      event.button !== 0 ||
      selectedObjects.length < 2 ||
      anySelectedLocked
    ) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startGeometries = Object.fromEntries(
      selectedObjects.map(object => [
        object.id,
        { ...getInteractiveObjectGeometry(object, activeBreakpoint, activeScene) },
      ]),
    ) as Record<string, InteractiveObjectGeometry>;
    const values = Object.values(startGeometries);
    if (!values.length) return;

    const left = Math.min(...values.map(geometry => geometry.x));
    const top = Math.min(...values.map(geometry => geometry.y));
    const right = Math.max(...values.map(geometry => geometry.x + geometry.width));
    const bottom = Math.max(...values.map(geometry => geometry.y + geometry.height));
    const startBounds = {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
    const startX = event.clientX;
    const startY = event.clientY;
    let finalGeometries = startGeometries;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const dx =
        (pointer.clientX - startX) *
        (activeSceneLayout.width / rect.width);
      const dy =
        (pointer.clientY - startY) *
        (activeSceneLayout.height / rect.height);

      let nextX = startBounds.x;
      let nextY = startBounds.y;
      let nextWidth = startBounds.width;
      let nextHeight = startBounds.height;

      if (horizontal === "right") {
        nextWidth = Math.max(24, startBounds.width + dx);
      } else {
        const candidate = Math.min(
          startBounds.x + startBounds.width - 24,
          startBounds.x + dx,
        );
        nextX = candidate;
        nextWidth = startBounds.x + startBounds.width - candidate;
      }

      if (vertical === "bottom") {
        nextHeight = Math.max(24, startBounds.height + dy);
      } else {
        const candidate = Math.min(
          startBounds.y + startBounds.height - 24,
          startBounds.y + dy,
        );
        nextY = candidate;
        nextHeight = startBounds.y + startBounds.height - candidate;
      }

      if (!pointer.altKey) {
        nextWidth = Math.max(24, snapToGrid(nextWidth));
        nextHeight = Math.max(24, snapToGrid(nextHeight));
      }

      const scaleX = nextWidth / startBounds.width;
      const scaleY = nextHeight / startBounds.height;

      finalGeometries = Object.fromEntries(
        Object.entries(startGeometries).map(([objectId, geometry]) => [
          objectId,
          {
            ...geometry,
            x: nextX + (geometry.x - startBounds.x) * scaleX,
            y: nextY + (geometry.y - startBounds.y) * scaleY,
            width: Math.max(8, geometry.width * scaleX),
            height: Math.max(8, geometry.height * scaleY),
          },
        ]),
      ) as Record<string, InteractiveObjectGeometry>;
      setLiveGroupGeometries(finalGeometries);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveGroupGeometries({});
      commitObjectGeometries(finalGeometries);
    };

    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
  };

  const beginSelectionRotate = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.button !== 0 ||
      selectedObjects.length < 2 ||
      anySelectedLocked
    ) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startGeometries = Object.fromEntries(
      selectedObjects.map(object => [
        object.id,
        { ...getInteractiveObjectGeometry(object, activeBreakpoint, activeScene) },
      ]),
    ) as Record<string, InteractiveObjectGeometry>;
    const values = Object.values(startGeometries);
    if (!values.length) return;

    const left = Math.min(...values.map(geometry => geometry.x));
    const top = Math.min(...values.map(geometry => geometry.y));
    const right = Math.max(...values.map(geometry => geometry.x + geometry.width));
    const bottom = Math.max(...values.map(geometry => geometry.y + geometry.height));
    const center = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    };
    const centerX =
      rect.left + (center.x / activeSceneLayout.width) * rect.width;
    const centerY =
      rect.top + (center.y / activeSceneLayout.height) * rect.height;
    const startPointerAngle =
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
      Math.PI;
    let finalGeometries = startGeometries;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const pointerAngle =
        (Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180) /
        Math.PI;
      const rawDelta = pointerAngle - startPointerAngle;
      const delta = pointer.altKey
        ? rawDelta
        : Math.round(rawDelta / 15) * 15;
      const radians = (delta * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      finalGeometries = Object.fromEntries(
        Object.entries(startGeometries).map(([objectId, geometry]) => {
          const objectCenter = {
            x: geometry.x + geometry.width / 2,
            y: geometry.y + geometry.height / 2,
          };
          const dx = objectCenter.x - center.x;
          const dy = objectCenter.y - center.y;
          const rotatedCenter = {
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos,
          };
          return [
            objectId,
            {
              ...geometry,
              x: rotatedCenter.x - geometry.width / 2,
              y: rotatedCenter.y - geometry.height / 2,
              rotation: normalizeRotation(geometry.rotation + delta),
            },
          ];
        }),
      ) as Record<string, InteractiveObjectGeometry>;
      setLiveGroupGeometries(finalGeometries);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveGroupGeometries({});
      commitObjectGeometries(finalGeometries);
    };

    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
  };

  const renderObject = (objectId: string) => {
    const object = activeScene.objects[objectId];
    if (!object) return null;

    // Use the same effective geometry source as the multi-selection bounds.
    // During grouped/multi-object gestures, liveGroupGeometries contains the
    // per-object preview geometry. Rendering from persisted geometry here made
    // only the shared selection box move while the actual objects appeared
    // frozen until pointer-up.
    const geometry = effectiveGeometryFor(object);
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
        scene={editorScene}
        data={data}
        selected={selectedSetForLayers.has(object.id)}
        showHandles={!hasMultipleSelection && selectedObjectId === object.id}
        geometry={geometry}
        motionReplayKey={motionReplayKey}
        scrollProgress={scrollProgress}
        parallaxPointer={parallaxPointer}
        editingText={editingTextObjectId === object.id}
        editingResumeContent={editingResumeContentObjectId === object.id}
        onPointerDown={beginMove}
        onResizePointerDown={beginResize}
        onRotatePointerDown={beginRotate}
        onBeginTextEdit={beginInlineTextEdit}
        onBeginResumeContentEdit={beginInlineResumeContentEdit}
        onCommitTextEdit={commitInlineTextEdit}
        onCommitResumeContentEdit={commitInlineResumeContentEdit}
        onCancelTextEdit={cancelInlineTextEdit}
      />
    );
  };

  const layerIds = [...activeScene.objectOrder].reverse();
  const layerPanelEntries: Array<
    | { kind: "object"; objectId: string }
    | {
        kind: "group";
        groupId: string;
        groupName: string;
        objectIds: string[];
      }
  > = [];
  const seenLayerGroupIds = new Set<string>();

  layerIds.forEach(objectId => {
    const object = activeScene.objects[objectId];
    if (!object) return;
    if (!object.groupId) {
      layerPanelEntries.push({ kind: "object", objectId });
      return;
    }
    if (seenLayerGroupIds.has(object.groupId)) return;

    seenLayerGroupIds.add(object.groupId);
    const objectIds = layerIds.filter(
      id => activeScene.objects[id]?.groupId === object.groupId,
    );
    const groupName =
      objectIds
        .map(id => activeScene.objects[id]?.groupName?.trim())
        .find(Boolean) || "Group";
    layerPanelEntries.push({
      kind: "group",
      groupId: object.groupId,
      groupName,
      objectIds,
    });
  });

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
    (activeSceneLayout.scrollLength * scrollProgress) / 100,
  );

  const fitMotionPreview = useCallback(() => {
    if (!workspaceMode) return;

    const scrollRoot = centerScrollRef.current;
    const stage = canvasStageRef.current;
    if (!scrollRoot || !stage) return;

    const stageStyle = window.getComputedStyle(stage);
    const horizontalPadding =
      Number.parseFloat(stageStyle.paddingLeft || "0") +
      Number.parseFloat(stageStyle.paddingRight || "0");
    const baseSceneWidth = Math.max(1, stage.clientWidth - horizontalPadding);
    const baseSceneHeight =
      baseSceneWidth *
      (activeSceneLayout.height / Math.max(1, activeSceneLayout.width));
    const availableHeight = Math.max(120, scrollRoot.clientHeight - 8);
    const fitZoom = Math.min(
      1,
      Math.max(0.2, availableHeight / Math.max(1, baseSceneHeight)),
    );

    setZoom(fitZoom);

    window.requestAnimationFrame(() => {
      const root = centerScrollRef.current;
      const currentStage = canvasStageRef.current;
      if (!root || !currentStage) return;

      const rootRect = root.getBoundingClientRect();
      const stageRect = currentStage.getBoundingClientRect();
      root.scrollTop = Math.max(
        0,
        root.scrollTop + stageRect.top - rootRect.top,
      );
    });
  }, [
    activeSceneLayout.height,
    activeSceneLayout.width,
    workspaceMode,
  ]);

  const exitMotionPreview = useCallback(() => {
    const restore = previewRestoreRef.current;
    previewRestoreRef.current = null;
    setScrollWheelPreview(false);

    if (!workspaceMode || !restore) return;

    setZoom(restore.zoom);
    window.requestAnimationFrame(() => {
      if (centerScrollRef.current) {
        centerScrollRef.current.scrollTop = restore.scrollTop;
      }
    });
  }, [workspaceMode]);

  const toggleMotionPreview = useCallback(() => {
    if (!workspaceMode) {
      setScrollWheelPreview(value => !value);
      return;
    }

    if (scrollWheelPreview) {
      exitMotionPreview();
      return;
    }

    previewRestoreRef.current = {
      zoom,
      scrollTop: centerScrollRef.current?.scrollTop ?? 0,
    };
    setScrollWheelPreview(true);
  }, [exitMotionPreview, scrollWheelPreview, workspaceMode, zoom]);

  useEffect(() => {
    if (!workspaceMode || !scrollWheelPreview) return;

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(fitMotionPreview);
    });

    const scrollRoot = centerScrollRef.current;
    const observer =
      typeof ResizeObserver !== "undefined" && scrollRoot
        ? new ResizeObserver(() => fitMotionPreview())
        : null;
    observer?.observe(scrollRoot);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      observer?.disconnect();
    };
  }, [
    activeBreakpoint,
    activeScene.id,
    fitMotionPreview,
    scrollWheelPreview,
    workspaceMode,
  ]);

  useEffect(() => {
    if (!workspaceMode || !scrollWheelPreview) return;

    const handlePreviewEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exitMotionPreview();
    };

    window.addEventListener("keydown", handlePreviewEscape);
    return () => window.removeEventListener("keydown", handlePreviewEscape);
  }, [exitMotionPreview, scrollWheelPreview, workspaceMode]);

  useEffect(() => {
    if (templateOpenRequest == null) return;
    if (lastTemplateOpenRequestRef.current === templateOpenRequest) return;
    lastTemplateOpenRequestRef.current = templateOpenRequest;
    setPublishingOpen(false);
    setReadinessOpen(false);
    setTemplateGalleryOpen(true);
  }, [templateOpenRequest]);

  const handleSidePanelWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (!workspaceMode || scrollWheelPreview || event.defaultPrevented) return;
    if (!event.deltaY || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    // Let an actual sidebar scroller consume the wheel while it still has room.
    // Once it reaches an edge (or the cursor is over a static part of the panel),
    // hand the wheel back to the primary editor scroll so the page never feels stuck.
    let node: HTMLElement | null = target;
    while (node && node !== event.currentTarget) {
      const style = window.getComputedStyle(node);
      const scrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrollable) {
        const max = node.scrollHeight - node.clientHeight;
        const canConsume = event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop < max - 1;
        if (canConsume) return;
      }
      node = node.parentElement;
    }

    const center = centerScrollRef.current;
    if (!center) return;
    const max = center.scrollHeight - center.clientHeight;
    if (max <= 0) return;

    const before = center.scrollTop;
    center.scrollTop = Math.max(0, Math.min(max, before + event.deltaY));
    if (center.scrollTop !== before) event.preventDefault();
  }, [scrollWheelPreview, workspaceMode]);

  return (
    <div
      className={
        workspaceMode
          ? "flex h-full min-h-0 flex-col bg-background"
          : "min-h-[720px] rounded-xl bg-background p-3 sm:p-4"
      }
    >
      <style>{INTERACTIVE_MOTION_CSS}</style>
      <div
        className={
          workspaceMode
            ? "flex h-full min-h-0 min-w-0 flex-col"
            : "mx-auto max-w-[1180px]"
        }
      >
        <div
          className={
            workspaceMode
              ? "flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5"
              : "flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
          }
        >
          <div>
            {!workspaceMode && (
              <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-[#2e0562]">
                Interactive Experience
              </div>
            )}
            <div className={workspaceMode ? "flex flex-wrap items-center gap-2" : "mt-1 flex flex-wrap items-center gap-2"}>
              <span className={workspaceMode ? "text-[14px] font-semibold text-foreground" : "text-[16px] font-semibold text-foreground"}>
                {fullName || "Your resume"}
              </span>
              <span className="rounded-full border border-[#2e0562]/20 bg-[#2e0562]/5 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#2e0562]">
                Freeform editor
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setTemplateGalleryOpen(false);
                setReadinessOpen(false);
                setPublishingOpen(true);
              }}
              aria-pressed={publishingOpen}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
                publishingOpen
                  ? "border-[#2e0562]/35 bg-[#2e0562] text-white"
                  : "border-[#2e0562]/25 bg-[#2e0562]/5 text-[#2e0562] hover:bg-[#2e0562]/10"
              }`}
            >
              <CloudUpload size={11} />
              Publish
            </button>

            <button
              type="button"
              onClick={() => {
                setTemplateGalleryOpen(false);
                setPublishingOpen(false);
                setReadinessOpen(true);
              }}
              aria-pressed={readinessOpen}
              title="Review publish readiness"
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
                readinessOpen
                  ? "border-[#2e0562]/35 bg-[#2e0562] text-white"
                  : publishReport.readiness === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/65"
                    : publishReport.readiness === "blocked"
                      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100/65"
                      : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/65"
              }`}
            >
              <ListChecks size={11} />
              {publishReport.readiness === "ready"
                ? "Ready"
                : publishReport.readiness === "blocked"
                  ? "Blocked"
                  : "Review"}
              <span className={`rounded px-1 py-0.5 text-[12px] font-bold ${
                readinessOpen ? "bg-white/15 text-white" : "bg-background/75"
              }`}>
                {publishReport.score}
              </span>
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

        <InteractiveTemplateOverlay
          open={templateGalleryOpen}
          activeTemplateId={normalizeInteractiveTemplateId(
            interactive.templateId,
          )}
          mode="editor"
          onApply={applyTemplate}
          onClose={() => setTemplateGalleryOpen(false)}
        />

        <InteractivePublishingOverlay
          open={publishingOpen}
          data={data}
          onDesignChange={onDesignChange}
          onClose={() => setPublishingOpen(false)}
          onReviewReadiness={() => {
            setPublishingOpen(false);
            setReadinessOpen(true);
          }}
        />

        <InteractivePublishReadinessOverlay
          open={readinessOpen}
          data={data}
          onClose={() => setReadinessOpen(false)}
          onGoToIssue={focusReadinessIssue}
        />

        <div
          className={
            workspaceMode
              ? "grid min-h-0 flex-1 gap-3 overflow-hidden p-3 xl:grid-cols-[220px_minmax(0,1fr)_280px] 2xl:grid-cols-[240px_minmax(0,1fr)_300px]"
              : "mt-3 grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)_230px]"
          }
        >
          {/* Scenes + layers */}
          <aside
            onWheel={handleSidePanelWheel}
            className={
              workspaceMode
                ? "min-h-0 overflow-hidden rounded-xl border border-border bg-card"
                : "overflow-hidden rounded-xl border border-border bg-card"
            }
          >
            <div className="flex h-full min-h-0 flex-col">
              <section className="flex-none border-b border-border">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Scenes
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
                        {scenes.length}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
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
                    aria-label="Add scene"
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-[#2e0562]/20 text-[#2e0562] transition-colors hover:bg-[#2e0562]/5"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="max-h-[210px] overflow-y-auto px-1.5 pb-1.5">
                  <div className="space-y-0.5">
                    {scenes.map((scene, index) => {
                      const active = scene.id === activeScene.id;
                      return (
                        <button
                          key={scene.id}
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
                          aria-current={active ? "true" : undefined}
                          className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                            active
                              ? "bg-[#2e0562]/7 text-foreground"
                              : "text-foreground hover:bg-muted/45"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[12px] font-bold ${
                              active
                                ? "bg-[#2e0562] text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold">
                              {scene.name}
                            </span>
                            <span className="block text-[12px] text-muted-foreground">
                              {scene.objectOrder.length} layer{scene.objectOrder.length === 1 ? "" : "s"}
                            </span>
                          </span>
                          {active && (
                            <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#2e0562]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-1 border-t border-border/70 bg-muted/15 px-2 py-1.5">
                  {renamingScene ? (
                    <form
                      className="mr-auto flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={event => {
                        event.preventDefault();
                        const nextName = sceneNameDraft.trim();
                        if (nextName) patchScene({ name: nextName });
                        setRenamingScene(false);
                        setSceneNameDraft("");
                      }}
                    >
                      <input
                        autoFocus
                        value={sceneNameDraft}
                        onChange={event => setSceneNameDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setRenamingScene(false);
                            setSceneNameDraft("");
                          }
                        }}
                        className="min-w-0 flex-1 rounded-md border border-[#2e0562]/25 bg-background px-2 py-1 text-[12px] font-semibold text-foreground outline-none"
                        aria-label="Scene name"
                      />
                      <button
                        type="submit"
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[#2e0562] hover:bg-background"
                        title="Save scene name"
                        aria-label="Save scene name"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingScene(false);
                          setSceneNameDraft("");
                        }}
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Cancel rename"
                        aria-label="Cancel rename"
                      >
                        <X size={12} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="mr-auto min-w-0 truncate px-1 text-[12px] font-semibold text-muted-foreground">
                        {activeScene.name}
                      </span>
                      <button
                        type="button"
                        title="Rename scene"
                        aria-label="Rename scene"
                        onClick={() => {
                          setSceneNameDraft(activeScene.name);
                          setRenamingScene(true);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <Pencil size={11} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={activeSceneIndex === 0}
                    title="Move scene up"
                    aria-label="Move scene up"
                    onClick={() =>
                      mutateScenes(collection =>
                        moveInteractiveScene(
                          collection,
                          activeScene.id,
                          -1,
                        ),
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    disabled={activeSceneIndex === scenes.length - 1}
                    title="Move scene down"
                    aria-label="Move scene down"
                    onClick={() =>
                      mutateScenes(collection =>
                        moveInteractiveScene(
                          collection,
                          activeScene.id,
                          1,
                        ),
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    type="button"
                    title="Duplicate scene"
                    aria-label="Duplicate scene"
                    onClick={() =>
                      mutateScenes(collection =>
                        duplicateInteractiveScene(
                          collection,
                          activeScene.id,
                        ),
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    type="button"
                    disabled={scenes.length <= 1}
                    title="Delete scene"
                    aria-label="Delete scene"
                    onClick={() => {
                      setSelectedObjectId(null);
                      mutateScenes(collection =>
                        removeInteractiveScene(
                          collection,
                          activeScene.id,
                        ),
                      );
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-25"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </section>

              <section className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-none items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Layers
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
                        {layerIds.length}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      Front layer first
                    </div>
                  </div>
                  <Layers3 size={13} className="flex-none text-muted-foreground" />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
                  {layerIds.length ? (
                    <div className="space-y-0.5">
                      {layerPanelEntries.map(entry => {
                        if (entry.kind === "object") {
                          const object = activeScene.objects[entry.objectId];
                          if (!object) return null;
                          const selected = selectedSetForLayers.has(object.id);
                          const layerGeometry = getInteractiveObjectGeometry(
                            object,
                            activeBreakpoint,
                            activeScene,
                          );

                          return (
                            <button
                              key={object.id}
                              type="button"
                              onClick={event => selectObject(object.id, event.shiftKey)}
                              aria-pressed={selected}
                              className={`group flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left transition-colors ${
                                selected
                                  ? "bg-[#2e0562]/7"
                                  : "hover:bg-muted/45"
                              } ${layerGeometry.hidden ? "opacity-55" : ""}`}
                            >
                              <span
                                className={`flex h-6 w-6 flex-none items-center justify-center rounded-md ${
                                  selected
                                    ? "bg-[#2e0562]/10 text-[#2e0562]"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {object.type === "text" ? (
                                  <Type size={11} />
                                ) : object.type === "image" ? (
                                  <ImageIcon size={11} />
                                ) : object.type === "shape" ? (
                                  <Square size={11} />
                                ) : (
                                  <UserRound size={11} />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
                                {object.type === "resume-content"
                                  ? interactiveBindingDisplayName(
                                      data,
                                      object.binding,
                                    )
                                  : object.name}
                              </span>
                              <span className="flex flex-none items-center gap-0.5 text-muted-foreground">
                                {object.locked && <Lock size={11} />}
                                {layerGeometry.hidden && <EyeOff size={11} />}
                              </span>
                            </button>
                          );
                        }

                        const groupObjects = entry.objectIds
                          .map(objectId => activeScene.objects[objectId])
                          .filter(
                            (object): object is InteractiveSceneObject => !!object,
                          );
                        if (!groupObjects.length) return null;

                        const groupSelected = entry.objectIds.every(objectId =>
                          selectedSetForLayers.has(objectId),
                        );
                        const groupLocked = groupObjects.every(object => !!object.locked);
                        const groupHidden = groupObjects.every(object =>
                          getInteractiveObjectGeometry(
                            object,
                            activeBreakpoint,
                            activeScene,
                          ).hidden,
                        );
                        const collapsed = collapsedLayerGroupIds.has(entry.groupId);

                        return (
                          <div
                            key={entry.groupId}
                            className={`rounded-lg ${
                              groupSelected ? "bg-[#2e0562]/[0.045]" : ""
                            }`}
                          >
                            <div
                              className={`flex items-center gap-1 rounded-lg transition-colors ${
                                groupSelected
                                  ? "bg-[#2e0562]/7"
                                  : "hover:bg-muted/45"
                              } ${groupHidden ? "opacity-55" : ""}`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedLayerGroupIds(current => {
                                    const next = new Set(current);
                                    if (next.has(entry.groupId)) next.delete(entry.groupId);
                                    else next.add(entry.groupId);
                                    return next;
                                  })
                                }
                                className="ml-1 flex h-7 w-6 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground"
                                aria-label={collapsed ? `Expand ${entry.groupName}` : `Collapse ${entry.groupName}`}
                                aria-expanded={!collapsed}
                              >
                                <ChevronDown
                                  size={12}
                                  className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={event =>
                                  selectObject(entry.objectIds[0], event.shiftKey)
                                }
                                aria-pressed={groupSelected}
                                className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-2 text-left"
                              >
                                <span
                                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-md ${
                                    groupSelected
                                      ? "bg-[#2e0562]/10 text-[#2e0562]"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Layers3 size={12} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12px] font-bold text-foreground">
                                    {entry.groupName}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    {entry.objectIds.length} objects
                                  </span>
                                </span>
                                <span className="flex flex-none items-center gap-0.5 text-muted-foreground">
                                  {groupLocked && <Lock size={11} />}
                                  {groupHidden && <EyeOff size={11} />}
                                </span>
                              </button>
                            </div>

                            {!collapsed && (
                              <div className="ml-5 border-l border-border/70 pl-1.5">
                                {entry.objectIds.map(objectId => {
                                  const object = activeScene.objects[objectId];
                                  if (!object) return null;
                                  const selected = selectedSetForLayers.has(object.id);
                                  const layerGeometry = getInteractiveObjectGeometry(
                                    object,
                                    activeBreakpoint,
                                    activeScene,
                                  );

                                  return (
                                    <button
                                      key={object.id}
                                      type="button"
                                      onClick={event =>
                                        selectObject(object.id, event.shiftKey)
                                      }
                                      aria-pressed={selected}
                                      className={`group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                                        selected
                                          ? "text-[#2e0562]"
                                          : "hover:bg-muted/35"
                                      } ${layerGeometry.hidden ? "opacity-55" : ""}`}
                                    >
                                      <span
                                        className={`flex h-5 w-5 flex-none items-center justify-center rounded-md ${
                                          selected
                                            ? "bg-[#2e0562]/10 text-[#2e0562]"
                                            : "bg-muted/80 text-muted-foreground"
                                        }`}
                                      >
                                        {object.type === "text" ? (
                                          <Type size={10} />
                                        ) : object.type === "image" ? (
                                          <ImageIcon size={10} />
                                        ) : object.type === "shape" ? (
                                          <Square size={10} />
                                        ) : (
                                          <UserRound size={10} />
                                        )}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                                        {object.type === "resume-content"
                                          ? interactiveBindingDisplayName(
                                              data,
                                              object.binding,
                                            )
                                          : object.name}
                                      </span>
                                      <span className="flex flex-none items-center gap-0.5 text-muted-foreground">
                                        {object.locked && <Lock size={10} />}
                                        {layerGeometry.hidden && <EyeOff size={10} />}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mx-0.5 rounded-lg border border-dashed border-border px-2 py-5 text-center">
                      <Layers3 size={15} className="mx-auto text-muted-foreground/60" />
                      <div className="mt-2 text-[12px] font-semibold text-muted-foreground">
                        No layers yet
                      </div>
                      <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                        Use Add above the canvas to place your first object.
                      </div>
                    </div>
                  )}
                </div>

                {selectedObject && selectedGeometry && !hasMultipleSelection && (
                  <div className="flex flex-none items-center gap-1 border-t border-border/70 bg-muted/15 px-2 py-1.5">
                    <span className="mr-auto min-w-0 truncate px-1 text-[12px] font-semibold text-muted-foreground">
                      {selectedObject.type === "resume-content"
                        ? interactiveBindingDisplayName(
                            data,
                            selectedObject.binding,
                          )
                        : selectedObject.name}
                    </span>
                    <button
                      type="button"
                      title={selectedGeometry.hidden ? "Show layer" : "Hide layer"}
                      aria-label={selectedGeometry.hidden ? "Show layer" : "Hide layer"}
                      onClick={() =>
                        patchSelectedGeometry(geometry => ({
                          ...geometry,
                          hidden: !geometry.hidden || undefined,
                        }))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      {selectedGeometry.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button
                      type="button"
                      title={selectedObject.locked ? "Unlock layer" : "Lock layer"}
                      aria-label={selectedObject.locked ? "Unlock layer" : "Lock layer"}
                      onClick={() =>
                        patchSelectedObject(current => ({
                          ...current,
                          locked: !current.locked || undefined,
                        } as InteractiveSceneObject))
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      {selectedObject.locked ? <Lock size={11} /> : <Unlock size={11} />}
                    </button>
                    <button
                      type="button"
                      disabled={
                        activeScene.objectOrder.indexOf(selectedObject.id) ===
                        activeScene.objectOrder.length - 1
                      }
                      title="Bring forward"
                      aria-label="Bring forward"
                      onClick={() =>
                        mutateScenes(collection =>
                          moveInteractiveObjectLayer(
                            collection,
                            activeScene.id,
                            selectedObject.id,
                            1,
                          ),
                        )
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={activeScene.objectOrder.indexOf(selectedObject.id) === 0}
                      title="Send backward"
                      aria-label="Send backward"
                      onClick={() =>
                        mutateScenes(collection =>
                          moveInteractiveObjectLayer(
                            collection,
                            activeScene.id,
                            selectedObject.id,
                            -1,
                          ),
                        )
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      title="Duplicate layer"
                      aria-label="Duplicate layer"
                      onClick={duplicateSelectedObject}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      <Copy size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete layer"
                      aria-label="Delete layer"
                      onClick={removeSelectedObject}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
                {hasMultipleSelection && (
                  <div className="flex flex-none items-center justify-between gap-2 border-t border-border/70 bg-muted/15 px-3 py-2">
                    <span className="text-[12px] font-semibold text-foreground">
                      {selectedObjects.length} objects selected
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Shift-click to adjust
                    </span>
                  </div>
                )}
              </section>
            </div>
          </aside>

          {/* Canvas */}
          <main
            className={
              workspaceMode
                ? "flex min-h-0 min-w-0 flex-col overflow-hidden pr-1"
                : "min-w-0"
            }
          >
            <div
              ref={centerScrollRef}
              className={
                workspaceMode
                  ? `min-h-0 flex-1 ${
                      scrollWheelPreview ? "overflow-hidden" : "overflow-auto"
                    }`
                  : ""
              }
              style={
                workspaceMode
                  ? {
                      overscrollBehavior: scrollWheelPreview ? "none" : "auto",
                      scrollbarGutter: scrollWheelPreview ? undefined : "stable",
                    }
                  : undefined
              }
            >
            <div
              className="relative mb-2 flex flex-wrap items-center justify-between gap-2"
              style={{
                // Keep scene controls above the canvas, but below the sticky
                // Resume Builder / app headers when the editor scrolls.
                zIndex: 20,
                isolation: "isolate",
              }}
            >
              <div>
                <div className="text-[13px] font-semibold text-foreground">
                  {activeScene.name}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {activeSceneLayout.width} × {activeSceneLayout.height}px ·{" "}
                  {activeSceneLayout.scrollLength}px visitor scroll
                </div>
              </div>

              <div className="flex items-center gap-1">
                <div
                  ref={addMenuRef}
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2e0562] px-3 text-[13px] font-semibold text-white"
                  >
                    <Plus size={13} />
                    Add
                  </button>

                  {addMenuOpen && (
                    <div
                      className="absolute right-0 top-10 z-[500] overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
                      style={{
                        width: 320,
                        minWidth: 320,
                        maxWidth: "min(320px, calc(100vw - 24px))",
                        zIndex: 1200,
                        isolation: "isolate",
                      }}
                    >
                      <div className="border-b border-border px-3 py-2.5">
                        <div className="text-[13px] font-semibold text-foreground">
                          Add to {activeScene.name}
                        </div>
                        <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                          Add shared resume data or a freeform design object.
                        </div>
                      </div>

                      <div className="p-1.5">
                        <div className="px-2 pb-1 pt-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Shared resume
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddMenuOpen(false);
                            setBindingPickerMode("add");
                            setBindingSearch("");
                          }}
                          className="flex w-full items-start gap-2.5 rounded-xl bg-[#2e0562]/5 px-2.5 py-2.5 text-left transition-colors hover:bg-[#2e0562]/10"
                        >
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562] text-white">
                            <UserRound size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-foreground">
                              Resume content
                            </span>
                            <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                              Name, experience, projects, education, skills or links
                            </span>
                          </span>
                          <ArrowRight size={10} className="mt-1 text-[#2e0562]" />
                        </button>

                        <div className="mt-1.5 px-2 pb-1 pt-1 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Build
                        </div>

                        {[
                          [
                            "text",
                            "Text",
                            "Freeform heading or copy",
                            <Type size={13} key="text" />,
                          ],
                          [
                            "image",
                            "Image",
                            "Photo, logo or graphic",
                            <ImageIcon size={13} key="image" />,
                          ],
                          [
                            "shape",
                            "Shape",
                            "Decorative design element",
                            <Square size={13} key="shape" />,
                          ],
                        ].map(([type, label, detail, icon]) => (
                          <button
                            key={String(type)}
                            type="button"
                            onClick={() =>
                              addObject(
                                type as Exclude<
                                  InteractiveSceneObject["type"],
                                  "resume-content"
                                >,
                              )
                            }
                            className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
                          >
                            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-muted/50 text-[#2e0562]">
                              {icon as ReactNode}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold text-foreground">
                                {label as string}
                              </span>
                              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                {detail as string}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {bindingPickerMode && (
                    <BindingPicker
                      options={bindingOptions}
                      query={bindingSearch}
                      mode={bindingPickerMode}
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
                  className="h-8 min-w-[42px] rounded-lg border border-border px-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
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

            <InteractiveDeviceToolbar
              breakpoint={activeBreakpoint}
              scene={activeScene}
              layout={activeSceneLayout}
              onBreakpointChange={breakpoint => {
                setActiveBreakpoint(breakpoint);
                setGuides({});
              }}
              onSceneSizeChange={patch =>
                patchActiveSceneLayout(patch)
              }
              onAutoLayout={() => {
                if (activeBreakpoint === "desktop") return;
                mutateScenes(collection =>
                  seedInteractiveSceneBreakpointLayout(
                    collection,
                    activeScene.id,
                    activeBreakpoint,
                  ),
                );
              }}
              onResetDevice={() => {
                if (activeBreakpoint === "desktop") return;
                mutateScenes(collection =>
                  clearInteractiveSceneBreakpointLayout(
                    collection,
                    activeScene.id,
                    activeBreakpoint,
                  ),
                );
              }}
            />

            <div
              ref={canvasStageRef}
              className="relative rounded-xl border border-border bg-muted/30 p-2"
              style={{
                zIndex: 0,
                isolation: "isolate",
              }}
            >
              <div
                className={`${
                  workspaceMode
                    ? scrollWheelPreview
                      ? "overflow-hidden"
                      : "overflow-visible"
                    : zoom <= 1
                      ? "overflow-hidden"
                      : "overflow-auto"
                } rounded-lg`}
                style={{
                  maxHeight: workspaceMode ? "none" : 620,
                  overscrollBehavior: scrollWheelPreview ? "none" : "auto",
                  scrollbarGutter:
                    !workspaceMode && zoom > 1 ? "stable" : undefined,
                }}
                onWheelCapture={event => {
                  if (!scrollWheelPreview) return;
                  event.preventDefault();
                  event.stopPropagation();

                  const delta =
                    (event.deltaY /
                      Math.max(320, activeSceneLayout.scrollLength)) *
                    100;

                  setScrollProgress(current =>
                    Math.max(0, Math.min(100, current + delta)),
                  );
                }}
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
                    style={{
                      aspectRatio: `${activeSceneLayout.width} / ${activeSceneLayout.height}`,
                      zIndex: 0,
                      isolation: "isolate",
                      background: "transparent",
                      containerType: "inline-size",
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
                          left: `${(guides.x / activeSceneLayout.width) * 100}%`,
                        }}
                      />
                    )}

                    {guides.y !== undefined && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 right-0 z-[400] border-t border-dashed border-[#7c3aed]"
                        style={{
                          top: `${(guides.y / activeSceneLayout.height) * 100}%`,
                        }}
                      />
                    )}

                    {activeScene.objectOrder.map(renderObject)}

                    {hasMultipleSelection && selectedSelectionGeometry && (
                      <div
                        aria-label={selectedGroupId ? "Grouped object bounds" : "Multi-selection bounds"}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${(selectedSelectionGeometry.x / activeSceneLayout.width) * 100}%`,
                          top: `${(selectedSelectionGeometry.y / activeSceneLayout.height) * 100}%`,
                          width: `${(selectedSelectionGeometry.width / activeSceneLayout.width) * 100}%`,
                          height: `${(selectedSelectionGeometry.height / activeSceneLayout.height) * 100}%`,
                          border: anySelectedLocked
                            ? "1.5px dashed #d97706"
                            : `1.5px ${selectedGroupId ? "solid" : "dashed"} ${SELECTION}`,
                          boxSizing: "border-box",
                          zIndex: 630,
                        }}
                      >
                        {!anySelectedLocked &&
                          ([
                            ["left", "top"],
                            ["right", "top"],
                            ["left", "bottom"],
                            ["right", "bottom"],
                          ] as const).map(([horizontal, vertical]) => (
                            <div
                              key={`${horizontal}-${vertical}`}
                              role="button"
                              aria-label={`Resize selection ${horizontal} ${vertical}`}
                              onPointerDown={event =>
                                beginSelectionResize(event, horizontal, vertical)
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
                              }}
                            />
                          ))}

                        {!anySelectedLocked && (
                          <div
                            role="button"
                            aria-label="Rotate selection"
                            title="Drag to rotate selection"
                            onPointerDown={beginSelectionRotate}
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
                              pointerEvents: "auto",
                            }}
                          />
                        )}
                      </div>
                    )}

                    {selectedObject &&
                      selectedSelectionGeometry &&
                      selectedObjects.some(
                        object => !effectiveGeometryFor(object).hidden,
                      ) && (
                        <InteractiveObjectContextToolbar
                          object={selectedObject}
                          geometry={selectedSelectionGeometry}
                          sceneWidth={activeSceneLayout.width}
                          sceneHeight={activeSceneLayout.height}
                          onUpdateObject={patchSelectedObject}
                          onOpacityChange={opacity =>
                            patchSelectedGeometry(geometry => ({
                              ...geometry,
                              opacity,
                            }))
                          }
                          selectionCount={Math.max(1, selectedObjects.length)}
                          isGrouped={!!selectedGroupId}
                          groupName={selectedGroupName}
                          allLocked={allSelectedLocked}
                          canBringForward={canBringSelectedForward}
                          canSendBackward={canSendSelectedBackward}
                          onArrange={arrangeSelectedObjects}
                          onToggleLock={toggleSelectedLock}
                          onToggleGroup={
                            selectedObjects.length > 1
                              ? toggleSelectedGroup
                              : undefined
                          }
                          onGroupNameChange={
                            selectedGroupId ? renameSelectedGroup : undefined
                          }
                          sharedContentStatus={
                            !hasMultipleSelection && selectedObject.type === "resume-content"
                              ? selectedObject.sharedContentUnlinked
                                ? "local"
                                : "shared"
                              : undefined
                          }
                          onEditOnlyHere={
                            !hasMultipleSelection &&
                            selectedObject.type === "resume-content" &&
                            interactiveBoundEditorFields(
                              interactiveResumeContentData(data, selectedObject),
                              selectedObject.binding,
                            ).length > 0
                              ? editSelectedSharedContentOnlyHere
                              : undefined
                          }
                          onRelinkUseShared={
                            !hasMultipleSelection && selectedObject.type === "resume-content"
                              ? relinkSelectedUsingShared
                              : undefined
                          }
                          onRelinkPushLocal={
                            !hasMultipleSelection && selectedObject.type === "resume-content"
                              ? relinkSelectedUsingLocal
                              : undefined
                          }
                          onChangeSharedContent={
                            !hasMultipleSelection && selectedObject.type === "resume-content"
                              ? openSharedContentPicker
                              : undefined
                          }
                        />
                      )}

                    {selectedObject &&
                      !hasMultipleSelection &&
                      selectedMotionPath &&
                      !selectedGeometry?.hidden && (
                        <InteractiveMotionPathOverlay
                          scene={editorScene}
                          geometry={effectiveGeometryFor(selectedObject)}
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
                              breakpoint={activeBreakpoint}
                            />
                          }
                          nextScene={
                            <TransitionSceneSnapshot
                              scene={nextScene}
                              data={data}
                              progress={0}
                              breakpoint={activeBreakpoint}
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
                          <div className="mt-3 text-[14px] font-semibold text-[#2e0562]">
                            Build anywhere on the scene
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span>
                Drag snaps to scene/object guides · hold Alt to bypass snapping
              </span>
              <span>
                Shift-click selects multiple · Arrows nudge 1px · Shift+Arrow 10px · ⌘/Ctrl+D duplicate
              </span>
            </div>

            </div>

            <div className={workspaceMode ? "relative z-30 mt-2 flex-none pb-1" : "mt-2"}>
              <InteractiveTimeline
                sceneName={activeScene.name}
                selectedObjectLabel={selectedObject
                  ? selectedObject.type === "resume-content"
                    ? interactiveBindingDisplayName(data, selectedObject.binding)
                    : selectedObject.name
                  : null}
                scrollBehavior={activeScene.scrollBehavior}
                scrollLength={activeSceneLayout.scrollLength}
                progress={scrollProgress}
                virtualScrollPx={virtualScrollPx}
                wheelPreview={scrollWheelPreview}
                scrollMarkers={selectedScrollMarkers}
                pathMarkers={selectedPathMarkers}
                onProgressChange={value =>
                  setScrollProgress(Math.max(0, Math.min(100, value)))
                }
                onToggleWheelPreview={toggleMotionPreview}
                onReset={() => setScrollProgress(0)}
              />
            </div>

          </main>

          {/* Inspector */}
          <aside className={workspaceMode ? "min-h-0 space-y-2.5 overflow-y-auto pl-1" : "space-y-2.5"}>
            {workspaceMode && (
              <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Properties
                  </div>
                  <div className="mt-0.5 max-w-[210px] truncate text-[12px] text-muted-foreground">
                    {hasMultipleSelection
                      ? `${selectedObjects.length} objects selected`
                      : selectedObject
                        ? selectedObject.type === "resume-content"
                          ? interactiveBindingDisplayName(data, selectedObject.binding)
                          : selectedObject.name
                        : activeScene.name}
                  </div>
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-1 text-[12px] font-semibold text-muted-foreground">
                  {hasMultipleSelection ? "Selection" : selectedObject ? "Object" : "Scene"}
                </span>
              </div>
            )}
            {selectedObject && !hasMultipleSelection ? (
              <div className="rounded-xl border border-[#2e0562]/20 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-wider text-[#2e0562]">
                      Object
                    </div>
                    <div className="mt-0.5 max-w-[145px] truncate text-[13px] font-semibold text-foreground">
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
                    aria-label="Clear selection"
                    title="Clear selection"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>

                {selectedObject.type !== "resume-content" && (
                  <label className="mt-2.5 block">
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none"
                    />
                  </label>
                )}

                <InspectorSection
                  title="Motion"
                  description="Quick, triggered, scroll, path and depth"
                  badge={
                    selectedObject.motion ||
                    selectedObject.animationTracks?.length ||
                    selectedObject.scrollTracks?.length ||
                    selectedObject.motionPath ||
                    Math.abs(selectedObject.parallaxDepth ?? 0) > 0.001
                      ? "Active"
                      : undefined
                  }
                  defaultOpen={true}
                >
                  {(() => {
                    const motionModes: Array<{
                      id: MotionInspectorMode;
                      label: string;
                      active: boolean;
                    }> = [
                      {
                        id: "quick",
                        label: "Quick",
                        active: !!selectedObject.motion,
                      },
                      {
                        id: "animate",
                        label: "Animate",
                        active: !!selectedObject.animationTracks?.length,
                      },
                      {
                        id: "scroll",
                        label: "Scroll",
                        active: !!selectedObject.scrollTracks?.length,
                      },
                      {
                        id: "path",
                        label: "Path",
                        active: !!selectedObject.motionPath,
                      },
                      {
                        id: "depth",
                        label: "Depth",
                        active:
                          Math.abs(selectedObject.parallaxDepth ?? 0) > 0.001,
                      },
                    ];
                    const activeMotionCount = motionModes.filter(
                      mode => mode.active,
                    ).length;
                    const quickPresets: Array<{
                      value: InteractiveObjectMotionPreset | "none";
                      label: string;
                    }> = [
                      { value: "none", label: "None" },
                      { value: "float", label: "Float" },
                      { value: "bob", label: "Bob" },
                      { value: "pulse", label: "Pulse" },
                      { value: "spin", label: "Spin" },
                      { value: "drift", label: "Drift" },
                    ];

                    return (
                      <div className="space-y-2.5">
                        <div className="rounded-xl border border-border bg-muted/15 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                                Motion tools
                              </div>
                              <div className="mt-0.5 text-[12px] text-muted-foreground">
                                {activeMotionCount
                                  ? `${activeMotionCount} active mode${activeMotionCount === 1 ? "" : "s"}`
                                  : "No motion applied"}
                              </div>
                            </div>

                            {activeMotionCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  patchSelectedObject(current => ({
                                    ...current,
                                    motion: undefined,
                                    animationTracks: undefined,
                                    scrollTracks: undefined,
                                    motionPath: undefined,
                                    parallaxDepth: undefined,
                                  } as InteractiveSceneObject))
                                }
                                className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                              >
                                Clear all
                              </button>
                            )}
                          </div>

                          <div
                            role="tablist"
                            aria-label="Motion editing mode"
                            className="mt-2 grid grid-cols-3 gap-1"
                          >
                            {motionModes.map(mode => (
                              <button
                                key={mode.id}
                                type="button"
                                role="tab"
                                aria-selected={motionInspectorMode === mode.id}
                                onClick={() => setMotionInspectorMode(mode.id)}
                                className={`relative rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold transition-colors ${
                                  motionInspectorMode === mode.id
                                    ? "border-[#2e0562]/30 bg-[#2e0562] text-white"
                                    : "border-border bg-background text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                }`}
                              >
                                <span>{mode.label}</span>
                                {mode.active && (
                                  <span
                                    aria-label={`${mode.label} motion active`}
                                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                                      motionInspectorMode === mode.id
                                        ? "bg-white"
                                        : "bg-[#2e0562]"
                                    }`}
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {motionInspectorMode === "quick" && (
                          <div className="rounded-xl border border-border bg-background p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[12px] font-semibold text-foreground">
                                  Quick loop
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                                  Pick a continuous preset, then tune its feel.
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
                                  className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {quickPresets.map(preset => {
                                const active =
                                  (selectedObject.motion?.preset ?? "none") ===
                                  preset.value;
                                return (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      patchSelectedObject(current => ({
                                        ...current,
                                        motion:
                                          preset.value === "none"
                                            ? undefined
                                            : {
                                                preset: preset.value,
                                                speed: current.motion?.speed ?? 1,
                                                intensity:
                                                  current.motion?.intensity ?? 50,
                                                delay: current.motion?.delay,
                                              },
                                      } as InteractiveSceneObject))
                                    }
                                    className={`rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold ${
                                      active
                                        ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                                        : "border-border text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedObject.motion && (
                              <div className="mt-2.5 space-y-2">
                                <label className="grid grid-cols-[44px_1fr_32px] items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-muted-foreground">
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
                                              speed: Number(event.target.value),
                                            }
                                          : current.motion,
                                      } as InteractiveSceneObject))
                                    }
                                    className="min-w-0"
                                  />
                                  <span className="text-right text-[12px] text-muted-foreground">
                                    {selectedObject.motion.speed.toFixed(1)}×
                                  </span>
                                </label>

                                <label className="grid grid-cols-[44px_1fr_32px] items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-muted-foreground">
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
                                              intensity: Number(event.target.value),
                                            }
                                          : current.motion,
                                      } as InteractiveSceneObject))
                                    }
                                    className="min-w-0"
                                  />
                                  <span className="text-right text-[12px] text-muted-foreground">
                                    {Math.round(selectedObject.motion.intensity)}
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        )}

                        {motionInspectorMode === "animate" && (
                          <AdvancedMotionEditor
                            embedded
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
                        )}

                        {motionInspectorMode === "scroll" && (
                          <InteractiveScrollMotionEditor
                            embedded
                            tracks={selectedObject.scrollTracks}
                            progress={scrollProgress}
                            onChange={scrollTracks =>
                              patchSelectedObject(current => ({
                                ...current,
                                scrollTracks,
                              } as InteractiveSceneObject))
                            }
                          />
                        )}

                        {motionInspectorMode === "path" && (
                          <InteractiveMotionPathEditor
                            embedded
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
                        )}

                        {motionInspectorMode === "depth" && (
                          <div className="rounded-xl border border-border bg-background p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[12px] font-semibold text-foreground">
                                  Parallax depth
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                                  Move at a different rate when scene Background Parallax is enabled.
                                </div>
                              </div>
                              {Math.abs(selectedObject.parallaxDepth ?? 0) > 0.001 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchSelectedObject(current => ({
                                      ...current,
                                      parallaxDepth: undefined,
                                    } as InteractiveSceneObject))
                                  }
                                  className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                                >
                                  Reset
                                </button>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {[
                                ["Back", -0.8],
                                ["Fixed", 0],
                                ["Front", 1],
                              ].map(([label, value]) => {
                                const numericValue = Number(value);
                                const active = Math.abs(
                                  (selectedObject.parallaxDepth ?? 0) - numericValue,
                                ) < 0.01;
                                return (
                                  <button
                                    key={String(label)}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      patchSelectedObject(current => ({
                                        ...current,
                                        parallaxDepth:
                                          numericValue || undefined,
                                      } as InteractiveSceneObject))
                                    }
                                    className={`rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold ${
                                      active
                                        ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                                        : "border-border text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                    }`}
                                  >
                                    {label as string}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-2.5 grid grid-cols-[1fr_38px] items-center gap-2">
                              <input
                                type="range"
                                min={-2}
                                max={2}
                                step={0.1}
                                value={selectedObject.parallaxDepth ?? 0}
                                onChange={event =>
                                  patchSelectedObject(current => ({
                                    ...current,
                                    parallaxDepth:
                                      Number(event.target.value) || undefined,
                                  } as InteractiveSceneObject))
                                }
                                className="min-w-0"
                              />
                              <span className="text-right text-[12px] font-semibold text-muted-foreground">
                                {(selectedObject.parallaxDepth ?? 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </InspectorSection>

                <InspectorSection
                  title="Position & size"
                  description={`${Math.round(selectedGeometry?.x ?? 0)}, ${Math.round(selectedGeometry?.y ?? 0)} · ${Math.round(selectedGeometry?.width ?? 24)} × ${Math.round(selectedGeometry?.height ?? 24)} · ${Math.round(selectedGeometry?.rotation ?? 0)}°`}
                  badge={
                    activeBreakpoint === "desktop"
                      ? "Desktop"
                      : selectedObject.responsive?.[activeBreakpoint]
                        ? `${activeBreakpoint[0].toUpperCase() + activeBreakpoint.slice(1)} custom`
                        : `Inherits desktop`
                  }
                  defaultOpen={false}
                >
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="X"
                    value={selectedGeometry?.x ?? 0}
                    min={-10000}
                    max={10000}
                    suffix="px"
                    onChange={x =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        x,
                      }))
                    }
                  />
                  <NumberField
                    label="Y"
                    value={selectedGeometry?.y ?? 0}
                    min={-10000}
                    max={10000}
                    suffix="px"
                    onChange={y =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        y,
                      }))
                    }
                  />
                  <NumberField
                    label="Width"
                    value={selectedGeometry?.width ?? 24}
                    min={24}
                    max={6000}
                    suffix="px"
                    onChange={width =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        width,
                      }))
                    }
                  />
                  <NumberField
                    label="Height"
                    value={selectedGeometry?.height ?? 24}
                    min={24}
                    max={6000}
                    suffix="px"
                    onChange={height =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        height,
                      }))
                    }
                  />
                  <NumberField
                    label="Rotation"
                    value={selectedGeometry?.rotation ?? 0}
                    min={-180}
                    max={180}
                    suffix="°"
                    onChange={rotation =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        rotation: normalizeRotation(rotation),
                      }))
                    }
                  />
                </div>

                {activeBreakpoint !== "desktop" && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-[#2e0562]/10 bg-[#2e0562]/[0.025] px-2 py-1.5">
                    <div className="text-[12px] text-muted-foreground">
                      {selectedObject.responsive?.[activeBreakpoint]
                        ? `${activeBreakpoint[0].toUpperCase() + activeBreakpoint.slice(1)} override active`
                        : `Inherits Desktop · changing any field creates an override`}
                    </div>
                    {selectedObject.responsive?.[activeBreakpoint] && (
                      <button
                        type="button"
                        onClick={() =>
                          patchSelectedObject(current =>
                            clearInteractiveObjectBreakpointOverride(
                              current,
                              activeBreakpoint,
                            ),
                          )
                        }
                        className="text-[12px] font-semibold text-[#2e0562]"
                      >
                        Reset object
                      </button>
                    )}
                  </div>
                )}

                </InspectorSection>

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      patchSelectedGeometry(geometry => ({
                        ...geometry,
                        hidden: !geometry.hidden || undefined,
                      }))
                    }
                    className={`flex w-full items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold ${
                      selectedGeometry?.hidden
                        ? "border-zinc-300 bg-zinc-100 text-zinc-600"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {selectedGeometry?.hidden ? (
                      <EyeOff size={9} />
                    ) : (
                      <Eye size={9} />
                    )}
                    {selectedGeometry?.hidden
                      ? activeBreakpoint === "desktop"
                        ? "Hidden"
                        : `Hidden on ${activeBreakpoint}`
                      : activeBreakpoint === "desktop"
                        ? "Visible"
                        : `Visible on ${activeBreakpoint}`}
                  </button>
                </div>

                {(selectedObject.type === "text" ||
                  selectedObject.type === "resume-content") && (
                  <InspectorSection
                    title="Surface"
                    description="Card surface and accents"
                    defaultOpen={false}
                  >
                    <div className="flex justify-end">
                      {selectedObject.appearance && (
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedObject(current => {
                              const appearance = current.appearance;
                              return {
                                ...current,
                                appearance: appearance
                                  ? {
                                      variant: "card",
                                      textColor: appearance.textColor,
                                      fontFamily: appearance.fontFamily,
                                      fontSize: appearance.fontSize,
                                      fontWeight: appearance.fontWeight,
                                      fontStyle: appearance.fontStyle,
                                      textAlign: appearance.textAlign,
                                      lineHeight: appearance.lineHeight,
                                      letterSpacing: appearance.letterSpacing,
                                    }
                                  : undefined,
                              } as InteractiveSceneObject;
                            })
                          }
                          className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Reset surface
                        </button>
                      )}
                    </div>

                    <label className="mt-2 block">
                      <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">
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
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
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
                        ["Surface", "surfaceColor", "#ffffff"],
                        ["Accent", "accentColor", "#7c3aed"],
                        ["Border", "borderColor", "#ddd6fe"],
                      ].map(([label, field, fallback]) => (
                        <label key={field}>
                          <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">
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
                  </InspectorSection>
                )}

                {selectedObject.type === "image" && (
                <InspectorSection
                  title="Image"
                  description="Object-specific content"
                >
                {selectedObject.type === "image" && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none"
                      />
                    </label>
                  </>
                )}


                </InspectorSection>

                )}


                <div className="mt-2.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={duplicateSelectedObject}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Copy size={9} />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedObject}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-[12px] font-semibold text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={9} />
                    Delete
                  </button>
                </div>
              </div>
            ) : null}

            {hasMultipleSelection && (
              <div className="rounded-xl border border-[#2e0562]/20 bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-wider text-[#2e0562]">
                      Selection
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-foreground">
                      {selectedObjects.length} objects selected
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Use the canvas toolbar to group, arrange or lock this selection. Shift-click objects or Layers to add or remove items.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedObjectId(null)}
                    aria-label="Clear selection"
                    title="Clear selection"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>
                {selectedGroupId && (
                  <div className="mt-3 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/5 px-2.5 py-2 text-[12px] font-semibold text-[#2e0562]">
                    {selectedGroupName ?? "Group"} · {selectedObjects.length} objects · drag any member to move the group together.
                  </div>
                )}

                {selectedGroupId && selectedGroupMotionObject && (
                  <div className="mt-3">
                <InspectorSection
                  title="Motion"
                  description={`${selectedGroupName ?? "Group"} · animate ${selectedObjects.length} objects together`}
                  badge={`${selectedObjects.length} objects`}
                  defaultOpen={true}
                >
                  {groupMotionOverridePromptOpen && (
                    <div className="mb-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5">
                      <div className="text-[12px] font-semibold text-amber-900">
                        Animate these {selectedObjects.length} objects together?
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                        {selectedIndividualMotionCount === 1
                          ? "1 object has individual motion."
                          : `${selectedIndividualMotionCount} objects have individual motion.`}{" "}
                        Applying group motion will clear those individual animations and make the group move as one.
                      </p>
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={cancelSelectedGroupMotionOverride}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmSelectedGroupMotionOverride}
                          className="rounded-lg bg-[#2e0562] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#24044f]"
                        >
                          Animate group
                        </button>
                      </div>
                    </div>
                  )}

                  {!selectedGroupMotionActive && selectedIndividualMotionCount > 0 && !groupMotionOverridePromptOpen && (
                    <div className="mb-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/5 px-2.5 py-2 text-[12px] leading-relaxed text-[#2e0562]">
                      Grouping has preserved the existing individual motion. Choose any motion below when you want all {selectedObjects.length} objects to animate together instead.
                    </div>
                  )}

                  {selectedGroupMotionActive && (
                    <div className="mb-2.5 rounded-lg border border-[#2e0562]/15 bg-[#2e0562]/5 px-2.5 py-2 text-[12px] font-semibold text-[#2e0562]">
                      Group motion is active. These {selectedObjects.length} objects now animate together; individual motion has been cleared.
                    </div>
                  )}

                  {(() => {
                    const motionModes: Array<{
                      id: MotionInspectorMode;
                      label: string;
                      active: boolean;
                    }> = [
                      {
                        id: "quick",
                        label: "Quick",
                        active: !!selectedGroupMotionObject!.motion,
                      },
                      {
                        id: "animate",
                        label: "Animate",
                        active: !!selectedGroupMotionObject!.animationTracks?.length,
                      },
                      {
                        id: "scroll",
                        label: "Scroll",
                        active: !!selectedGroupMotionObject!.scrollTracks?.length,
                      },
                      {
                        id: "path",
                        label: "Path",
                        active: !!selectedGroupMotionObject!.motionPath,
                      },
                      {
                        id: "depth",
                        label: "Depth",
                        active:
                          Math.abs(selectedGroupMotionObject!.parallaxDepth ?? 0) > 0.001,
                      },
                    ];
                    const activeMotionCount = motionModes.filter(
                      mode => mode.active,
                    ).length;
                    const quickPresets: Array<{
                      value: InteractiveObjectMotionPreset | "none";
                      label: string;
                    }> = [
                      { value: "none", label: "None" },
                      { value: "float", label: "Float" },
                      { value: "bob", label: "Bob" },
                      { value: "pulse", label: "Pulse" },
                      { value: "spin", label: "Spin" },
                      { value: "drift", label: "Drift" },
                    ];

                    return (
                      <div className="space-y-2.5">
                        <div className="rounded-xl border border-border bg-muted/15 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                                Motion tools
                              </div>
                              <div className="mt-0.5 text-[12px] text-muted-foreground">
                                {activeMotionCount
                                  ? `${activeMotionCount} active mode${activeMotionCount === 1 ? "" : "s"}`
                                  : "No motion applied"}
                              </div>
                            </div>

                            {activeMotionCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  patchSelectedGroupMotion(current => ({
                                    ...current,
                                    motion: undefined,
                                    animationTracks: undefined,
                                    scrollTracks: undefined,
                                    motionPath: undefined,
                                    parallaxDepth: undefined,
                                  } as InteractiveSceneObject))
                                }
                                className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                              >
                                Clear all
                              </button>
                            )}
                          </div>

                          <div
                            role="tablist"
                            aria-label="Motion editing mode"
                            className="mt-2 grid grid-cols-3 gap-1"
                          >
                            {motionModes.map(mode => (
                              <button
                                key={mode.id}
                                type="button"
                                role="tab"
                                aria-selected={motionInspectorMode === mode.id}
                                onClick={() => setMotionInspectorMode(mode.id)}
                                className={`relative rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold transition-colors ${
                                  motionInspectorMode === mode.id
                                    ? "border-[#2e0562]/30 bg-[#2e0562] text-white"
                                    : "border-border bg-background text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                }`}
                              >
                                <span>{mode.label}</span>
                                {mode.active && (
                                  <span
                                    aria-label={`${mode.label} motion active`}
                                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                                      motionInspectorMode === mode.id
                                        ? "bg-white"
                                        : "bg-[#2e0562]"
                                    }`}
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {motionInspectorMode === "quick" && (
                          <div className="rounded-xl border border-border bg-background p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[12px] font-semibold text-foreground">
                                  Quick loop
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                                  Pick a continuous preset, then tune its feel.
                                </div>
                              </div>
                              {selectedGroupMotionObject!.motion && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchSelectedGroupMotion(current => ({
                                      ...current,
                                      motion: undefined,
                                    } as InteractiveSceneObject))
                                  }
                                  className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {quickPresets.map(preset => {
                                const active =
                                  (selectedGroupMotionObject!.motion?.preset ?? "none") ===
                                  preset.value;
                                return (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      patchSelectedGroupMotion(current => ({
                                        ...current,
                                        motion:
                                          preset.value === "none"
                                            ? undefined
                                            : {
                                                preset: preset.value,
                                                speed: current.motion?.speed ?? 1,
                                                intensity:
                                                  current.motion?.intensity ?? 50,
                                                delay: current.motion?.delay,
                                              },
                                      } as InteractiveSceneObject))
                                    }
                                    className={`rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold ${
                                      active
                                        ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                                        : "border-border text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedGroupMotionObject!.motion && (
                              <div className="mt-2.5 space-y-2">
                                <label className="grid grid-cols-[44px_1fr_32px] items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-muted-foreground">
                                    Speed
                                  </span>
                                  <input
                                    type="range"
                                    min={0.25}
                                    max={3}
                                    step={0.25}
                                    value={selectedGroupMotionObject!.motion.speed}
                                    onChange={event =>
                                      patchSelectedGroupMotion(current => ({
                                        ...current,
                                        motion: current.motion
                                          ? {
                                              ...current.motion,
                                              speed: Number(event.target.value),
                                            }
                                          : current.motion,
                                      } as InteractiveSceneObject))
                                    }
                                    className="min-w-0"
                                  />
                                  <span className="text-right text-[12px] text-muted-foreground">
                                    {selectedGroupMotionObject!.motion.speed.toFixed(1)}×
                                  </span>
                                </label>

                                <label className="grid grid-cols-[44px_1fr_32px] items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-muted-foreground">
                                    Strength
                                  </span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={selectedGroupMotionObject!.motion.intensity}
                                    onChange={event =>
                                      patchSelectedGroupMotion(current => ({
                                        ...current,
                                        motion: current.motion
                                          ? {
                                              ...current.motion,
                                              intensity: Number(event.target.value),
                                            }
                                          : current.motion,
                                      } as InteractiveSceneObject))
                                    }
                                    className="min-w-0"
                                  />
                                  <span className="text-right text-[12px] text-muted-foreground">
                                    {Math.round(selectedGroupMotionObject!.motion.intensity)}
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        )}

                        {motionInspectorMode === "animate" && (
                          <AdvancedMotionEditor
                            embedded
                            tracks={selectedGroupMotionObject!.animationTracks}
                            onChange={animationTracks =>
                              patchSelectedGroupMotion(current => ({
                                ...current,
                                animationTracks,
                              } as InteractiveSceneObject))
                            }
                            onReplay={() =>
                              setMotionReplayKey(value => value + 1)
                            }
                          />
                        )}

                        {motionInspectorMode === "scroll" && (
                          <InteractiveScrollMotionEditor
                            embedded
                            tracks={selectedGroupMotionObject!.scrollTracks}
                            progress={scrollProgress}
                            onChange={scrollTracks =>
                              patchSelectedGroupMotion(current => ({
                                ...current,
                                scrollTracks,
                              } as InteractiveSceneObject))
                            }
                          />
                        )}

                        {motionInspectorMode === "path" && (
                          <InteractiveMotionPathEditor
                            embedded
                            path={selectedGroupMotionObject!.motionPath}
                            progress={scrollProgress}
                            onChange={motionPath => {
                              patchSelectedGroupMotion(current => ({
                                ...current,
                                motionPath,
                              } as InteractiveSceneObject));
                            }}
                          />
                        )}

                        {motionInspectorMode === "depth" && (
                          <div className="rounded-xl border border-border bg-background p-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[12px] font-semibold text-foreground">
                                  Parallax depth
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                                  Move at a different rate when scene Background Parallax is enabled.
                                </div>
                              </div>
                              {Math.abs(selectedGroupMotionObject!.parallaxDepth ?? 0) > 0.001 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchSelectedGroupMotion(current => ({
                                      ...current,
                                      parallaxDepth: undefined,
                                    } as InteractiveSceneObject))
                                  }
                                  className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                                >
                                  Reset
                                </button>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {[
                                ["Back", -0.8],
                                ["Fixed", 0],
                                ["Front", 1],
                              ].map(([label, value]) => {
                                const numericValue = Number(value);
                                const active = Math.abs(
                                  (selectedGroupMotionObject!.parallaxDepth ?? 0) - numericValue,
                                ) < 0.01;
                                return (
                                  <button
                                    key={String(label)}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      patchSelectedGroupMotion(current => ({
                                        ...current,
                                        parallaxDepth:
                                          numericValue || undefined,
                                      } as InteractiveSceneObject))
                                    }
                                    className={`rounded-lg border px-1.5 py-1.5 text-[12px] font-semibold ${
                                      active
                                        ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                                        : "border-border text-muted-foreground hover:border-[#2e0562]/20 hover:text-[#2e0562]"
                                    }`}
                                  >
                                    {label as string}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-2.5 grid grid-cols-[1fr_38px] items-center gap-2">
                              <input
                                type="range"
                                min={-2}
                                max={2}
                                step={0.1}
                                value={selectedGroupMotionObject!.parallaxDepth ?? 0}
                                onChange={event =>
                                  patchSelectedGroupMotion(current => ({
                                    ...current,
                                    parallaxDepth:
                                      Number(event.target.value) || undefined,
                                  } as InteractiveSceneObject))
                                }
                                className="min-w-0"
                              />
                              <span className="text-right text-[12px] font-semibold text-muted-foreground">
                                {(selectedGroupMotionObject!.parallaxDepth ?? 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </InspectorSection>

                  </div>
                )}
                {!selectedGroupId && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-[12px] text-muted-foreground">
                    Group these objects to animate them together. Grouping itself preserves each object's existing motion.
                  </div>
                )}
              </div>
            )}

            {!selectedObject && (
              <>
            <InspectorSection
              title="Scene settings"
              description="Scrolling and transition"
              defaultOpen
            >
              <div>
                <NumberField
                  label="Visitor scroll"
                  value={activeSceneLayout.scrollLength}
                  min={320}
                  max={12000}
                  step={50}
                  suffix="px"
                  onChange={scrollLength =>
                    patchActiveSceneLayout({ scrollLength })
                  }
                />
              </div>

              <label className="mt-2 block">
                <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
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
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none"
                >
                  <option value="pinned">
                    Pinned storytelling
                  </option>
                  <option value="flow">
                    Normal page flow
                  </option>
                </select>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Pinned keeps the scene stationary while its virtual
                  {` `}
                  {activeSceneLayout.scrollLength}px scroll timeline progresses.
                  Use Scene size above the canvas to edit width and height.
                </p>
              </label>

              <div className="mt-2.5 border-t border-border pt-2.5">
                <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                  Transition to next scene
                </div>

                {nextScene ? (
                  <>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {activeScene.name} → {nextScene.name}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <label>
                        <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">
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
                          className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
                        >
                          <option value="none">None</option>
                          <option value="fade">Fade</option>
                          <option value="slide-left">Slide left</option>
                          <option value="slide-up">Slide up</option>
                          <option value="zoom">Zoom</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">
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
                          className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
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
                      <span className="mb-0.5 block text-[12px] font-semibold text-muted-foreground">
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
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none"
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
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[#2e0562]/20 bg-background py-1.5 text-[12px] font-semibold text-[#2e0562] disabled:opacity-30"
                    >
                      <RefreshCcw size={8} />
                      Preview transition
                    </button>
                  </>
                ) : (
                  <div className="mt-1.5 rounded-md border border-dashed border-border px-2 py-2 text-[12px] leading-relaxed text-muted-foreground">
                    This is the last scene, so it has no outgoing transition.
                  </div>
                )}
              </div>
            </InspectorSection>

            <InspectorSection
              title="Background"
              description={activeScene.background.type === "transparent" ? "Transparent" : activeScene.background.type}
              defaultOpen={false}
            >

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
                className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none"
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
                  <span className="text-[12px] text-muted-foreground">
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
                  <span className="text-[12px] text-muted-foreground">
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
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none"
                />
              )}
            </InspectorSection>

            {(() => {
              const ambient = activeScene.ambient;
              const activeAmbientCount = [
                ambient.twinkle,
                ambient.particles,
                ambient.floatingShapes,
                ambient.gradientDrift,
                ambient.parallax,
              ].filter(effect => effect.enabled).length;

              const ambientEffect =
                ambientInspectorMode === "twinkle"
                  ? ambient.twinkle
                  : ambientInspectorMode === "particles"
                    ? ambient.particles
                    : ambientInspectorMode === "shapes"
                      ? ambient.floatingShapes
                      : ambientInspectorMode === "gradient"
                        ? ambient.gradientDrift
                        : ambient.parallax;

              const ambientMeta =
                AMBIENT_MODE_META.find(item => item.id === ambientInspectorMode) ??
                AMBIENT_MODE_META[0];

              const updateAmbientEffect = (next: InteractiveAmbientEffect) => {
                if (ambientInspectorMode === "twinkle") {
                  patchScene({ ambient: { ...ambient, twinkle: next } });
                } else if (ambientInspectorMode === "particles") {
                  patchScene({ ambient: { ...ambient, particles: next } });
                } else if (ambientInspectorMode === "shapes") {
                  patchScene({ ambient: { ...ambient, floatingShapes: next } });
                } else if (ambientInspectorMode === "gradient") {
                  patchScene({ ambient: { ...ambient, gradientDrift: next } });
                } else {
                  patchScene({ ambient: { ...ambient, parallax: next } });
                }
              };

              return (
                <InspectorSection
                  title="Ambient effects"
                  description="Scene-level motion behind your content"
                  badge={activeAmbientCount ? `${activeAmbientCount} active` : "Off"}
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    {AMBIENT_MODE_META.map(item => {
                      const effect =
                        item.id === "twinkle"
                          ? ambient.twinkle
                          : item.id === "particles"
                            ? ambient.particles
                            : item.id === "shapes"
                              ? ambient.floatingShapes
                              : item.id === "gradient"
                                ? ambient.gradientDrift
                                : ambient.parallax;
                      const selected = ambientInspectorMode === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setAmbientInspectorMode(item.id)}
                          className={`flex min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                            selected
                              ? "border-[#2e0562]/30 bg-[#2e0562]/7 text-[#2e0562]"
                              : "border-border bg-background text-muted-foreground hover:bg-muted/25 hover:text-foreground"
                          }`}
                        >
                          <span className="truncate text-[12px] font-semibold">
                            {item.shortLabel}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 flex-none rounded-full ${
                              effect.enabled ? "bg-[#2e0562]" : "bg-muted-foreground/20"
                            }`}
                            aria-label={effect.enabled ? "Active" : "Off"}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2.5">
                    <AmbientEffectEditor
                      label={ambientMeta.label}
                      description={ambientMeta.description}
                      effect={ambientEffect}
                      showDensity={
                        ambientInspectorMode !== "gradient" &&
                        ambientInspectorMode !== "parallax"
                      }
                      onChange={updateAmbientEffect}
                    />
                  </div>

                  {ambientInspectorMode === "gradient" &&
                    activeScene.background.type !== "gradient" && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">
                        <span>Gradient drift needs a gradient scene background.</span>
                        <button
                          type="button"
                          onClick={() =>
                            patchScene({
                              background: {
                                ...activeScene.background,
                                type: "gradient",
                                secondaryColor:
                                  activeScene.background.secondaryColor ?? "#f4f1fa",
                              },
                            })
                          }
                          className="flex-none rounded-md border border-amber-200 bg-white px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100/50"
                        >
                          Use gradient
                        </button>
                      </div>
                    )}

                  {activeAmbientCount > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                      <span className="text-[12px] text-muted-foreground">
                        {activeAmbientCount} scene effect{activeAmbientCount === 1 ? "" : "s"} enabled
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          patchScene({
                            ambient: {
                              twinkle: { ...ambient.twinkle, enabled: false },
                              particles: { ...ambient.particles, enabled: false },
                              floatingShapes: {
                                ...ambient.floatingShapes,
                                enabled: false,
                              },
                              gradientDrift: {
                                ...ambient.gradientDrift,
                                enabled: false,
                              },
                              parallax: { ...ambient.parallax, enabled: false },
                            },
                          })
                        }
                        className="text-[12px] font-semibold text-muted-foreground hover:text-red-500"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </InspectorSection>
              );
            })()}
              </>
            )}

          </aside>
        </div>
      </div>
    </div>
  );
}

export default function ResumeInteractivePreview({
  data,
  onDataChange,
  onDesignChange,
  workspaceMode = false,
  templateOpenRequest,
}: {
  data: ResumeData;
  onDataChange: (data: ResumeData) => void;
  onDesignChange: (design: ResumeDesign) => void;
  workspaceMode?: boolean;
  templateOpenRequest?: number;
}) {
  const state = getResumeWebExperienceState(data.design);
  const interactive = state.interactive;
  const [initialTemplateGalleryOpen, setInitialTemplateGalleryOpen] =
    useState(false);
  const lastInitialTemplateOpenRequestRef = useRef(templateOpenRequest);

  useEffect(() => {
    if (interactive || templateOpenRequest == null) return;
    if (lastInitialTemplateOpenRequestRef.current === templateOpenRequest) return;
    lastInitialTemplateOpenRequestRef.current = templateOpenRequest;
    setInitialTemplateGalleryOpen(true);
  }, [interactive, templateOpenRequest]);

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
      <div className={workspaceMode ? "h-full min-h-0 overflow-y-auto bg-background p-5 sm:p-7" : "min-h-[680px] rounded-xl bg-background p-5 sm:p-7"}>
        <div className="mx-auto max-w-[820px] pt-5 sm:pt-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2e0562]/10 text-[#2e0562]">
            <Sparkles size={20} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Create your Interactive Experience
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
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

          <InteractiveTemplateOverlay
            open={initialTemplateGalleryOpen}
            mode="initial"
            onApply={templateId => {
              setInitialTemplateGalleryOpen(false);
              initializeFromTemplate(templateId);
            }}
            onClose={() => setInitialTemplateGalleryOpen(false)}
          />

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-[13px] text-muted-foreground">
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
      onDataChange={onDataChange}
      onDesignChange={onDesignChange}
      interactive={interactive}
      workspaceMode={workspaceMode}
      templateOpenRequest={templateOpenRequest}
    />
  );
}
