import type { WebSectionId } from "./resumePresentation";
import type {
  InteractiveExperienceStartMethod,
  ResponsiveImportSeed,
} from "./resumeWebExperience";

export type InteractiveSceneBackgroundType =
  | "solid"
  | "gradient"
  | "image"
  | "transparent";

export interface InteractiveSceneBackground {
  type: InteractiveSceneBackgroundType;
  color?: string;
  secondaryColor?: string;
  imageUrl?: string;
  imageFit?: "cover" | "contain" | "stretch";
}

export type InteractiveObjectMotionPreset =
  | "none"
  | "float"
  | "bob"
  | "pulse"
  | "spin"
  | "drift";

export interface InteractiveObjectMotion {
  preset: InteractiveObjectMotionPreset;
  /** Multiplier relative to the preset's natural duration. */
  speed: number;
  /** 0–100 visual strength. */
  intensity: number;
  /** Optional deterministic start offset so repeated objects do not move in lockstep. */
  delay?: number;
}

export type InteractiveAnimationProperty =
  | "x"
  | "y"
  | "rotation"
  | "scale"
  | "opacity"
  | "blur";

export type InteractiveAnimationTrigger =
  | "load"
  | "enter"
  | "hover"
  | "click"
  | "loop";

export type InteractiveAnimationEasing =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out";

export interface InteractiveAnimationTrack {
  id: string;
  property: InteractiveAnimationProperty;
  trigger: InteractiveAnimationTrigger;
  from: number;
  to: number;
  duration: number;
  delay: number;
  easing: InteractiveAnimationEasing;
}

export type InteractiveScrollBehavior = "pinned" | "flow";

export interface InteractiveScrollKeyframe {
  id: string;
  /** Scene scroll progress, 0–100. */
  progress: number;
  value: number;
}

export interface InteractiveScrollTrack {
  id: string;
  property: InteractiveAnimationProperty;
  easing: InteractiveAnimationEasing;
  keyframes: InteractiveScrollKeyframe[];
}

export type InteractiveMotionPathCurve = "linear" | "smooth";

export interface InteractiveMotionPathPoint {
  id: string;
  /** Scene scroll progress, 0–100. */
  progress: number;
  /** Visual offset from the object's base canvas position. */
  x: number;
  y: number;
}

export interface InteractiveMotionPath {
  enabled: boolean;
  curve: InteractiveMotionPathCurve;
  autoRotate: boolean;
  points: InteractiveMotionPathPoint[];
}

export type InteractiveSceneTransitionType =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-up"
  | "zoom";

export interface InteractiveSceneTransition {
  type: InteractiveSceneTransitionType;
  /** Seconds for editor/published transition playback. */
  duration: number;
  easing: InteractiveAnimationEasing;
}

export interface InteractiveAmbientEffect {
  enabled: boolean;
  /** 0–100 amount/number of generated elements. */
  density: number;
  /** 0.25–3 multiplier. */
  speed: number;
  /** 0–100 visual strength/opacity/travel. */
  intensity: number;
}

export interface InteractiveSceneAmbient {
  twinkle: InteractiveAmbientEffect;
  particles: InteractiveAmbientEffect;
  floatingShapes: InteractiveAmbientEffect;
  gradientDrift: InteractiveAmbientEffect;
  /** Pointer-depth preview now; later publishing can map this to visitor input. */
  parallax: InteractiveAmbientEffect;
}

export interface InteractiveObjectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  hidden?: boolean;
}

export type InteractiveBreakpoint = "desktop" | "tablet" | "mobile";

export interface InteractiveResponsiveGeometryOverride {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  hidden?: boolean;
}

export interface InteractiveResponsiveObjectLayout {
  tablet?: InteractiveResponsiveGeometryOverride;
  mobile?: InteractiveResponsiveGeometryOverride;
}

export interface InteractiveResponsiveSceneOverride {
  width?: number;
  height?: number;
  scrollLength?: number;
}

export interface InteractiveResponsiveSceneLayout {
  tablet?: InteractiveResponsiveSceneOverride;
  mobile?: InteractiveResponsiveSceneOverride;
}

export type InteractiveObjectAppearanceVariant =
  | "card"
  | "plain"
  | "glass"
  | "terminal"
  | "accent";

export interface InteractiveObjectAppearance {
  variant: InteractiveObjectAppearanceVariant;
  textColor?: string;
  surfaceColor?: string;
  accentColor?: string;
  borderColor?: string;
  radius?: number;
  /** Optional text styling used by freeform text objects. */
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
}

export type InteractiveResumeContentSource =
  | "personal"
  | "work"
  | "project"
  | "education"
  | "skill"
  | "link";

export interface InteractiveResumeContentBinding {
  source: InteractiveResumeContentSource;
  entryId?: string;
  field?: string;
}

const INTERACTIVE_RESUME_SOURCES: InteractiveResumeContentSource[] = [
  "personal",
  "work",
  "project",
  "education",
  "skill",
  "link",
];

function normalizeResumeContentBinding(
  value: unknown,
): InteractiveResumeContentBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (
    typeof source.source !== "string" ||
    !INTERACTIVE_RESUME_SOURCES.includes(
      source.source as InteractiveResumeContentSource,
    )
  ) {
    return undefined;
  }

  const entryId =
    source.entryId == null ? undefined : stringValue(source.entryId).trim();
  const field =
    source.field == null ? undefined : stringValue(source.field).trim();

  return {
    source: source.source as InteractiveResumeContentSource,
    entryId: entryId || undefined,
    field: field || undefined,
  };
}

interface InteractiveObjectBase {
  id: string;
  name: string;
  geometry: InteractiveObjectGeometry;
  /** Editor-only manipulation guard; locked objects still publish/render. */
  locked?: boolean;
  /** Optional editor grouping id. Grouping never changes visitor content. */
  groupId?: string;
  /** Optional editor-facing label shared by every member of the same group. */
  groupName?: string;
  /** Simple Phase 22 loop preset. */
  motion?: InteractiveObjectMotion;
  /** Phase 23 advanced property tracks. */
  animationTracks?: InteractiveAnimationTrack[];
  /** Phase 24 values driven directly by scene scroll progress. */
  scrollTracks?: InteractiveScrollTrack[];
  /** Phase 25 route driven by the same scene scroll progress. */
  motionPath?: InteractiveMotionPath;
  /**
   * Optional synchronized motion applied to every member of an editor group.
   * Grouping alone preserves individual motion. Once any group-motion channel
   * is active, group motion becomes authoritative and individual motion is
   * cleared/ignored for the grouped objects.
   */
  groupMotion?: InteractiveObjectMotion;
  groupAnimationTracks?: InteractiveAnimationTrack[];
  groupScrollTracks?: InteractiveScrollTrack[];
  groupMotionPath?: InteractiveMotionPath;
  groupParallaxDepth?: number;
  /**
   * Pointer-depth multiplier. 0 = fixed, positive = foreground,
   * negative = deeper/background movement.
   */
  parallaxDepth?: number;
  /** Template/user-controlled visual surface without changing shared content. */
  appearance?: InteractiveObjectAppearance;
  /** Tablet/mobile layout overrides. Desktop remains the canonical base geometry. */
  responsive?: InteractiveResponsiveObjectLayout;
}

export interface InteractiveResumeContentObject
  extends InteractiveObjectBase {
  type: "resume-content";
  /**
   * Phase 19 establishes the binding slot. Phase 21 will expose the
   * resume-content picker and make these bindings editable in the UI.
   */
  binding?: InteractiveResumeContentBinding;
}

export interface InteractiveTextObject extends InteractiveObjectBase {
  type: "text";
  text: string;
}

export interface InteractiveImageObject extends InteractiveObjectBase {
  type: "image";
  src: string;
  alt?: string;
  fit?: "cover" | "contain" | "stretch";
}

export interface InteractiveShapeObject extends InteractiveObjectBase {
  type: "shape";
  shape: "rectangle" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type InteractiveSceneObject =
  | InteractiveResumeContentObject
  | InteractiveTextObject
  | InteractiveImageObject
  | InteractiveShapeObject;

export interface InteractiveScene {
  id: string;
  name: string;

  /**
   * Logical desktop scene canvas. Responsive Interactive compositions are a
   * later phase; the model is intentionally presentation-native and never
   * linked to PDF geometry.
   */
  width: number;
  height: number;

  /**
   * Virtual visitor scroll distance assigned to the scene. In Phase 19 this
   * is metadata only; Phase 24 will use it as the scroll animation driver.
   */
  scrollLength: number;
  /** Pinned keeps the scene stationary while its virtual scroll progresses. */
  scrollBehavior: InteractiveScrollBehavior;

  background: InteractiveSceneBackground;
  ambient: InteractiveSceneAmbient;
  /** Transition from this scene into the next scene. */
  transition: InteractiveSceneTransition;
  /** Tablet/mobile scene viewport overrides. */
  responsive?: InteractiveResponsiveSceneLayout;

  objectOrder: string[];
  objects: Record<string, InteractiveSceneObject>;
}

export interface InteractiveSceneCollection {
  sceneOrder: string[];
  scenes: Record<string, InteractiveScene>;
  activeSceneId: string;
}

const DEFAULT_SCENE_WIDTH = 1440;
const DEFAULT_SCENE_HEIGHT = 900;
const DEFAULT_SCROLL_LENGTH = 900;

export const INTERACTIVE_BREAKPOINT_VIEWPORTS: Record<
  InteractiveBreakpoint,
  { width: number; height: number }
> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 900 },
  mobile: { width: 430, height: 900 },
};

export function getInteractiveBreakpointForViewport(
  viewportWidth: number,
): InteractiveBreakpoint {
  if (viewportWidth < 700) return "mobile";
  if (viewportWidth < 1100) return "tablet";
  return "desktop";
}

const SECTION_LABELS: Record<WebSectionId, string> = {
  video: "Video Intro",
  about: "About",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  featured: "Featured",
  links: "Links",
};

function finiteNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function interactiveId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function normalizeBackground(
  value: unknown,
  fallbackColor = "#ffffff",
): InteractiveSceneBackground {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveSceneBackground>)
      : {};

  const type: InteractiveSceneBackgroundType =
    source.type === "gradient" ||
    source.type === "image" ||
    source.type === "transparent"
      ? source.type
      : "solid";

  return {
    type,
    color: stringValue(source.color, fallbackColor),
    secondaryColor: stringValue(source.secondaryColor, "#f4f1fa"),
    imageUrl: stringValue(source.imageUrl),
    imageFit:
      source.imageFit === "contain" || source.imageFit === "stretch"
        ? source.imageFit
        : "cover",
  };
}

const DEFAULT_AMBIENT_EFFECT: InteractiveAmbientEffect = {
  enabled: false,
  density: 35,
  speed: 1,
  intensity: 55,
};

function normalizeAmbientEffect(
  value: unknown,
  defaults?: Partial<InteractiveAmbientEffect>,
): InteractiveAmbientEffect {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveAmbientEffect>)
      : {};

  const base = {
    ...DEFAULT_AMBIENT_EFFECT,
    ...(defaults ?? {}),
  };

  return {
    enabled: source.enabled === true,
    density: finiteNumber(source.density, base.density, 0, 100),
    speed: finiteNumber(source.speed, base.speed, 0.25, 3),
    intensity: finiteNumber(
      source.intensity,
      base.intensity,
      0,
      100,
    ),
  };
}

function normalizeSceneAmbient(
  value: unknown,
): InteractiveSceneAmbient {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveSceneAmbient>)
      : {};

  return {
    twinkle: normalizeAmbientEffect(source.twinkle, {
      density: 38,
      speed: 1,
      intensity: 60,
    }),
    particles: normalizeAmbientEffect(source.particles, {
      density: 24,
      speed: 0.8,
      intensity: 42,
    }),
    floatingShapes: normalizeAmbientEffect(source.floatingShapes, {
      density: 18,
      speed: 0.65,
      intensity: 35,
    }),
    gradientDrift: normalizeAmbientEffect(source.gradientDrift, {
      density: 0,
      speed: 0.55,
      intensity: 45,
    }),
    parallax: normalizeAmbientEffect(source.parallax, {
      density: 0,
      speed: 1,
      intensity: 35,
    }),
  };
}

function normalizeObjectMotion(
  value: unknown,
): InteractiveObjectMotion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveObjectMotion>;
  const preset: InteractiveObjectMotionPreset =
    source.preset === "float" ||
    source.preset === "bob" ||
    source.preset === "pulse" ||
    source.preset === "spin" ||
    source.preset === "drift"
      ? source.preset
      : "none";

  if (preset === "none") return undefined;

  return {
    preset,
    speed: finiteNumber(source.speed, 1, 0.25, 3),
    intensity: finiteNumber(source.intensity, 50, 0, 100),
    delay: finiteNumber(source.delay, 0, -30, 30) || undefined,
  };
}

const INTERACTIVE_ANIMATION_PROPERTIES: InteractiveAnimationProperty[] = [
  "x",
  "y",
  "rotation",
  "scale",
  "opacity",
  "blur",
];

const INTERACTIVE_ANIMATION_TRIGGERS: InteractiveAnimationTrigger[] = [
  "load",
  "enter",
  "hover",
  "click",
  "loop",
];

const INTERACTIVE_ANIMATION_EASINGS: InteractiveAnimationEasing[] = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
];

function animationValueRange(
  property: InteractiveAnimationProperty,
): { min: number; max: number } {
  if (property === "x" || property === "y") {
    return { min: -3000, max: 3000 };
  }
  if (property === "rotation") return { min: -1440, max: 1440 };
  if (property === "scale") return { min: 0, max: 8 };
  if (property === "opacity") return { min: 0, max: 1 };
  return { min: 0, max: 120 };
}

function normalizeAnimationTrack(
  value: unknown,
  index: number,
): InteractiveAnimationTrack | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<InteractiveAnimationTrack>;

  const property = INTERACTIVE_ANIMATION_PROPERTIES.includes(
    source.property as InteractiveAnimationProperty,
  )
    ? (source.property as InteractiveAnimationProperty)
    : "opacity";

  const trigger = INTERACTIVE_ANIMATION_TRIGGERS.includes(
    source.trigger as InteractiveAnimationTrigger,
  )
    ? (source.trigger as InteractiveAnimationTrigger)
    : "enter";

  const easing = INTERACTIVE_ANIMATION_EASINGS.includes(
    source.easing as InteractiveAnimationEasing,
  )
    ? (source.easing as InteractiveAnimationEasing)
    : "ease-out";

  const range = animationValueRange(property);
  const defaults = animationTrackDefaults(property);

  return {
    id:
      stringValue(source.id).trim() ||
      `track-${index}-${property}-${trigger}`,
    property,
    trigger,
    from: finiteNumber(source.from, defaults.from, range.min, range.max),
    to: finiteNumber(source.to, defaults.to, range.min, range.max),
    duration: finiteNumber(source.duration, 0.7, 0.05, 30),
    delay: finiteNumber(source.delay, 0, 0, 30),
    easing,
  };
}

function normalizeAnimationTracks(
  value: unknown,
): InteractiveAnimationTrack[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const tracks = value
    .slice(0, 12)
    .map((track, index) => normalizeAnimationTrack(track, index))
    .filter((track): track is InteractiveAnimationTrack => !!track)
    .map((track, index) => {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        return track;
      }
      const id = `${track.id}-${index}`;
      seen.add(id);
      return { ...track, id };
    });

  return tracks.length ? tracks : undefined;
}

export function animationTrackDefaults(
  property: InteractiveAnimationProperty,
): Pick<InteractiveAnimationTrack, "from" | "to"> {
  if (property === "x") return { from: -60, to: 0 };
  if (property === "y") return { from: 40, to: 0 };
  if (property === "rotation") return { from: -8, to: 0 };
  if (property === "scale") return { from: 0.92, to: 1 };
  if (property === "blur") return { from: 8, to: 0 };
  return { from: 0, to: 1 };
}

export function createInteractiveAnimationTrack(
  property: InteractiveAnimationProperty = "opacity",
  trigger: InteractiveAnimationTrigger = "enter",
): InteractiveAnimationTrack {
  const defaults = animationTrackDefaults(property);
  return {
    id: interactiveId("track"),
    property,
    trigger,
    from: defaults.from,
    to: defaults.to,
    duration: trigger === "loop" ? 2.8 : 0.7,
    delay: 0,
    easing: trigger === "loop" ? "ease-in-out" : "ease-out",
  };
}

function normalizeScrollKeyframes(
  value: unknown,
  property: InteractiveAnimationProperty,
): InteractiveScrollKeyframe[] {
  const range = animationValueRange(property);
  const defaults = animationTrackDefaults(property);

  const raw = Array.isArray(value)
    ? value.slice(0, 12)
    : [];

  const normalized = raw
    .map((item, index): InteractiveScrollKeyframe | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<InteractiveScrollKeyframe>;
      return {
        id:
          stringValue(source.id).trim() ||
          `scroll-keyframe-${index}`,
        progress: finiteNumber(source.progress, index ? 100 : 0, 0, 100),
        value: finiteNumber(
          source.value,
          index ? defaults.to : defaults.from,
          range.min,
          range.max,
        ),
      };
    })
    .filter(
      (item): item is InteractiveScrollKeyframe => !!item,
    )
    .sort((a, b) => a.progress - b.progress);

  const byProgress = new Map<number, InteractiveScrollKeyframe>();
  normalized.forEach(item => {
    // Last saved keyframe at a progress point wins deterministically.
    byProgress.set(item.progress, item);
  });

  const unique = [...byProgress.values()].sort(
    (a, b) => a.progress - b.progress,
  );

  if (unique.length >= 2) return unique;

  return [
    {
      id: interactiveId("scroll-keyframe"),
      progress: 0,
      value: defaults.from,
    },
    {
      id: interactiveId("scroll-keyframe"),
      progress: 100,
      value: defaults.to,
    },
  ];
}

function normalizeScrollTrack(
  value: unknown,
  index: number,
): InteractiveScrollTrack | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<InteractiveScrollTrack>;

  const property = INTERACTIVE_ANIMATION_PROPERTIES.includes(
    source.property as InteractiveAnimationProperty,
  )
    ? (source.property as InteractiveAnimationProperty)
    : "y";

  const easing = INTERACTIVE_ANIMATION_EASINGS.includes(
    source.easing as InteractiveAnimationEasing,
  )
    ? (source.easing as InteractiveAnimationEasing)
    : "ease-in-out";

  return {
    id:
      stringValue(source.id).trim() ||
      `scroll-track-${index}-${property}`,
    property,
    easing,
    keyframes: normalizeScrollKeyframes(
      source.keyframes,
      property,
    ),
  };
}

function normalizeScrollTracks(
  value: unknown,
): InteractiveScrollTrack[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const tracks = value
    .slice(0, 8)
    .map((track, index) => normalizeScrollTrack(track, index))
    .filter((track): track is InteractiveScrollTrack => !!track)
    .map((track, index) => {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        return track;
      }

      const id = `${track.id}-${index}`;
      seen.add(id);
      return { ...track, id };
    });

  return tracks.length ? tracks : undefined;
}

export function createInteractiveScrollTrack(
  property: InteractiveAnimationProperty = "y",
): InteractiveScrollTrack {
  const defaults = animationTrackDefaults(property);

  return {
    id: interactiveId("scroll-track"),
    property,
    easing: "ease-in-out",
    keyframes: [
      {
        id: interactiveId("scroll-keyframe"),
        progress: 0,
        value: defaults.from,
      },
      {
        id: interactiveId("scroll-keyframe"),
        progress: 100,
        value: defaults.to,
      },
    ],
  };
}

function normalizeMotionPathPoints(
  value: unknown,
): InteractiveMotionPathPoint[] {
  const raw = Array.isArray(value) ? value.slice(0, 12) : [];

  const points = raw
    .map((item, index): InteractiveMotionPathPoint | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<InteractiveMotionPathPoint>;
      return {
        id:
          stringValue(source.id).trim() ||
          `path-point-${index}`,
        progress: finiteNumber(
          source.progress,
          index ? 100 : 0,
          0,
          100,
        ),
        x: finiteNumber(source.x, index ? 400 : 0, -6000, 6000),
        y: finiteNumber(source.y, 0, -6000, 6000),
      };
    })
    .filter(
      (point): point is InteractiveMotionPathPoint => !!point,
    )
    .sort((a, b) => a.progress - b.progress);

  const byProgress = new Map<number, InteractiveMotionPathPoint>();
  points.forEach(point => byProgress.set(point.progress, point));

  const unique = [...byProgress.values()].sort(
    (a, b) => a.progress - b.progress,
  );

  if (unique.length >= 2) return unique;

  return [
    {
      id: interactiveId("path-point"),
      progress: 0,
      x: 0,
      y: 0,
    },
    {
      id: interactiveId("path-point"),
      progress: 100,
      x: 400,
      y: 0,
    },
  ];
}

function normalizeMotionPath(
  value: unknown,
): InteractiveMotionPath | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveMotionPath>;

  const path: InteractiveMotionPath = {
    enabled: source.enabled !== false,
    curve: source.curve === "smooth" ? "smooth" : "linear",
    autoRotate: source.autoRotate === true,
    points: normalizeMotionPathPoints(source.points),
  };

  return path.enabled || path.points.length
    ? path
    : undefined;
}

export function createInteractiveMotionPath(): InteractiveMotionPath {
  return {
    enabled: true,
    curve: "smooth",
    autoRotate: false,
    points: [
      {
        id: interactiveId("path-point"),
        progress: 0,
        x: 0,
        y: 0,
      },
      {
        id: interactiveId("path-point"),
        progress: 100,
        x: 400,
        y: 0,
      },
    ],
  };
}

function normalizeSceneTransition(
  value: unknown,
): InteractiveSceneTransition {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveSceneTransition>)
      : {};

  const type: InteractiveSceneTransitionType =
    source.type === "fade" ||
    source.type === "slide-left" ||
    source.type === "slide-up" ||
    source.type === "zoom"
      ? source.type
      : "none";

  const easing = INTERACTIVE_ANIMATION_EASINGS.includes(
    source.easing as InteractiveAnimationEasing,
  )
    ? (source.easing as InteractiveAnimationEasing)
    : "ease-in-out";

  return {
    type,
    duration: finiteNumber(source.duration, 0.8, 0.2, 3),
    easing,
  };
}


export function createInteractiveScene(
  name = "Untitled scene",
  options?: Partial<
    Pick<
      InteractiveScene,
      "width" | "height" | "scrollLength" | "background" | "ambient" | "transition"
    >
  >,
): InteractiveScene {
  const id = interactiveId("scene");
  return {
    id,
    name: name.trim() || "Untitled scene",
    width: finiteNumber(
      options?.width,
      DEFAULT_SCENE_WIDTH,
      320,
      3840,
    ),
    height: finiteNumber(
      options?.height,
      DEFAULT_SCENE_HEIGHT,
      320,
      3000,
    ),
    scrollLength: finiteNumber(
      options?.scrollLength,
      DEFAULT_SCROLL_LENGTH,
      320,
      12000,
    ),
    scrollBehavior: "pinned",
    background: normalizeBackground(options?.background),
    ambient: normalizeSceneAmbient(options?.ambient),
    transition: normalizeSceneTransition(options?.transition),
    responsive: undefined,
    objectOrder: [],
    objects: {},
  };
}

function normalizeObjectAppearance(
  value: unknown,
): InteractiveObjectAppearance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveObjectAppearance>;

  const variant: InteractiveObjectAppearanceVariant =
    source.variant === "plain" ||
    source.variant === "glass" ||
    source.variant === "terminal" ||
    source.variant === "accent"
      ? source.variant
      : "card";

  const color = (candidate: unknown): string | undefined => {
    const value = stringValue(candidate).trim();
    return value || undefined;
  };

  const fontStyle =
    source.fontStyle === "italic" || source.fontStyle === "normal"
      ? source.fontStyle
      : undefined;
  const textAlign =
    source.textAlign === "center" || source.textAlign === "right" || source.textAlign === "left"
      ? source.textAlign
      : undefined;

  return {
    variant,
    textColor: color(source.textColor),
    surfaceColor: color(source.surfaceColor),
    accentColor: color(source.accentColor),
    borderColor: color(source.borderColor),
    radius:
      source.radius == null
        ? undefined
        : finiteNumber(source.radius, 12, 0, 80),
    fontFamily: color(source.fontFamily),
    fontSize:
      source.fontSize == null
        ? undefined
        : finiteNumber(source.fontSize, 24, 8, 160),
    fontWeight:
      source.fontWeight == null
        ? undefined
        : finiteNumber(source.fontWeight, 650, 100, 900),
    fontStyle,
    textAlign,
    lineHeight:
      source.lineHeight == null
        ? undefined
        : finiteNumber(source.lineHeight, 1.35, 0.8, 2.4),
    letterSpacing:
      source.letterSpacing == null
        ? undefined
        : finiteNumber(source.letterSpacing, 0, -2, 12),
  };
}

function normalizeResponsiveGeometryOverride(
  value: unknown,
): InteractiveResponsiveGeometryOverride | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const next: InteractiveResponsiveGeometryOverride = {};

  if (source.x != null) next.x = finiteNumber(source.x, 0, -10000, 10000);
  if (source.y != null) next.y = finiteNumber(source.y, 0, -10000, 10000);
  if (source.width != null) {
    next.width = finiteNumber(source.width, 320, 8, 6000);
  }
  if (source.height != null) {
    next.height = finiteNumber(source.height, 120, 8, 6000);
  }
  if (source.rotation != null) {
    next.rotation = finiteNumber(source.rotation, 0, -3600, 3600);
  }
  if (source.opacity != null) {
    next.opacity = finiteNumber(source.opacity, 1, 0, 1);
  }
  if (source.zIndex != null) {
    next.zIndex = finiteNumber(source.zIndex, 0, -1000, 1000);
  }
  if ("hidden" in source && typeof source.hidden === "boolean") {
    next.hidden = source.hidden;
  }

  return Object.keys(next).length ? next : undefined;
}

function normalizeResponsiveObjectLayout(
  value: unknown,
): InteractiveResponsiveObjectLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveResponsiveObjectLayout>;
  const tablet = normalizeResponsiveGeometryOverride(source.tablet);
  const mobile = normalizeResponsiveGeometryOverride(source.mobile);

  return tablet || mobile
    ? {
        tablet,
        mobile,
      }
    : undefined;
}

function normalizeResponsiveSceneOverride(
  value: unknown,
): InteractiveResponsiveSceneOverride | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const next: InteractiveResponsiveSceneOverride = {};

  if (source.width != null) {
    next.width = finiteNumber(source.width, 1024, 320, 3840);
  }
  if (source.height != null) {
    next.height = finiteNumber(source.height, 900, 320, 3000);
  }
  if (source.scrollLength != null) {
    next.scrollLength = finiteNumber(source.scrollLength, 900, 320, 12000);
  }

  return Object.keys(next).length ? next : undefined;
}

function normalizeResponsiveSceneLayout(
  value: unknown,
): InteractiveResponsiveSceneLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveResponsiveSceneLayout>;
  const tablet = normalizeResponsiveSceneOverride(source.tablet);
  const mobile = normalizeResponsiveSceneOverride(source.mobile);

  return tablet || mobile
    ? {
        tablet,
        mobile,
      }
    : undefined;
}

export function getInteractiveObjectGeometry(
  object: InteractiveSceneObject,
  breakpoint: InteractiveBreakpoint,
  scene?: InteractiveScene,
): InteractiveObjectGeometry {
  if (breakpoint === "desktop") return object.geometry;

  const override = object.responsive?.[breakpoint];
  const fallback =
    scene && scene.width > 0
      ? (() => {
          const layout = getInteractiveSceneLayout(
            scene,
            breakpoint,
          );
          const scale = layout.width / scene.width;
          return {
            ...object.geometry,
            x: object.geometry.x * scale,
            y: object.geometry.y * scale,
            width: object.geometry.width * scale,
            height: object.geometry.height * scale,
          };
        })()
      : object.geometry;

  if (!override) return fallback;

  return {
    ...fallback,
    ...override,
    hidden:
      override.hidden === undefined
        ? fallback.hidden
        : override.hidden || undefined,
  };
}

export function getInteractiveSceneLayout(
  scene: InteractiveScene,
  breakpoint: InteractiveBreakpoint,
): {
  width: number;
  height: number;
  scrollLength: number;
} {
  if (breakpoint === "desktop") {
    return {
      width: scene.width,
      height: scene.height,
      scrollLength: scene.scrollLength,
    };
  }

  const override = scene.responsive?.[breakpoint];
  const recommended = INTERACTIVE_BREAKPOINT_VIEWPORTS[breakpoint];

  return {
    width: override?.width ?? recommended.width,
    height: override?.height ?? scene.height,
    scrollLength: override?.scrollLength ?? scene.scrollLength,
  };
}

export function withInteractiveObjectGeometryForBreakpoint(
  object: InteractiveSceneObject,
  breakpoint: InteractiveBreakpoint,
  geometry: InteractiveObjectGeometry,
): InteractiveSceneObject {
  if (breakpoint === "desktop") {
    return {
      ...object,
      geometry,
    } as InteractiveSceneObject;
  }

  return {
    ...object,
    responsive: {
      ...(object.responsive ?? {}),
      [breakpoint]: {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        rotation: geometry.rotation,
        opacity: geometry.opacity,
        zIndex: geometry.zIndex,
        hidden: geometry.hidden === true,
      },
    },
  } as InteractiveSceneObject;
}

export function clearInteractiveObjectBreakpointOverride(
  object: InteractiveSceneObject,
  breakpoint: Exclude<InteractiveBreakpoint, "desktop">,
): InteractiveSceneObject {
  if (!object.responsive?.[breakpoint]) return object;
  const responsive = {
    ...(object.responsive ?? {}),
  };
  delete responsive[breakpoint];

  return {
    ...object,
    responsive:
      responsive.tablet || responsive.mobile
        ? responsive
        : undefined,
  } as InteractiveSceneObject;
}

function normalizeGeometry(
  value: unknown,
  zIndexFallback: number,
): InteractiveObjectGeometry {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveObjectGeometry>)
      : {};

  return {
    x: finiteNumber(source.x, 80, -10000, 10000),
    y: finiteNumber(source.y, 80, -10000, 10000),
    width: finiteNumber(source.width, 320, 8, 6000),
    height: finiteNumber(source.height, 120, 8, 6000),
    rotation: finiteNumber(source.rotation, 0, -3600, 3600),
    opacity: finiteNumber(source.opacity, 1, 0, 1),
    zIndex: finiteNumber(source.zIndex, zIndexFallback, -1000, 1000),
    hidden: source.hidden === true || undefined,
  };
}

function normalizeObject(
  value: unknown,
  fallbackId: string,
  index: number,
): InteractiveSceneObject | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = stringValue(source.id, fallbackId).trim() || fallbackId;
  const type = source.type;
  const groupId =
    typeof source.groupId === "string" && source.groupId.trim()
      ? source.groupId.trim()
      : undefined;
  const groupName =
    groupId && typeof source.groupName === "string" && source.groupName.trim()
      ? source.groupName.trim().slice(0, 80)
      : undefined;
  const groupMotion = normalizeObjectMotion(source.groupMotion);
  const groupAnimationTracks = normalizeAnimationTracks(source.groupAnimationTracks);
  const groupScrollTracks = normalizeScrollTracks(source.groupScrollTracks);
  const groupMotionPath = normalizeMotionPath(source.groupMotionPath);
  const groupParallaxDepth =
    source.groupParallaxDepth == null
      ? undefined
      : finiteNumber(source.groupParallaxDepth, 0, -2, 2);
  const groupMotionActive = !!(
    groupId &&
    (groupMotion ||
      groupAnimationTracks?.length ||
      groupScrollTracks?.length ||
      groupMotionPath ||
      Math.abs(groupParallaxDepth ?? 0) > 0.001)
  );

  const base = {
    id,
    name:
      stringValue(source.name).trim() ||
      (type === "image"
        ? "Image"
        : type === "shape"
          ? "Shape"
          : type === "resume-content"
            ? "Resume content"
            : "Text"),
    geometry: normalizeGeometry(source.geometry, index),
    locked: source.locked === true || undefined,
    groupId,
    groupName,
    // Migration/normalization for the earlier additive group-motion behavior:
    // once synchronized group motion exists, individual motion is no longer
    // retained as a second animation layer.
    motion: groupMotionActive ? undefined : normalizeObjectMotion(source.motion),
    animationTracks: groupMotionActive
      ? undefined
      : normalizeAnimationTracks(source.animationTracks),
    scrollTracks: groupMotionActive
      ? undefined
      : normalizeScrollTracks(source.scrollTracks),
    motionPath: groupMotionActive ? undefined : normalizeMotionPath(source.motionPath),
    groupMotion,
    groupAnimationTracks,
    groupScrollTracks,
    groupMotionPath,
    groupParallaxDepth,
    parallaxDepth: groupMotionActive
      ? undefined
      : source.parallaxDepth == null
        ? undefined
        : finiteNumber(source.parallaxDepth, 0, -2, 2),
    appearance: normalizeObjectAppearance(source.appearance),
    responsive: normalizeResponsiveObjectLayout(source.responsive),
  };

  if (type === "resume-content") {
    const binding = normalizeResumeContentBinding(source.binding);
    let geometry = base.geometry;

    // Phase 21 initially created every non-image resume-content object at
    // 420x140. That is too short for composite bindings such as Entire role:
    // at a scaled 1440x900 scene it clips company/dates/body below the title.
    // Repair only boxes still at/near that legacy default so user-resized
    // objects remain untouched.
    if (binding && geometry.height <= 150) {
      const field = binding.field ?? "entry";

      if (binding.source === "work" && field === "entry") {
        geometry = {
          ...geometry,
          width: Math.max(geometry.width, 500),
          height: 310,
        };
      } else if (
        binding.source === "project" &&
        field === "entry"
      ) {
        geometry = {
          ...geometry,
          width: Math.max(geometry.width, 500),
          height: 330,
        };
      } else if (
        binding.source === "education" &&
        field === "entry"
      ) {
        geometry = {
          ...geometry,
          width: Math.max(geometry.width, 460),
          height: 190,
        };
      } else if (
        field === "body" ||
        field === "description" ||
        field === "summary"
      ) {
        geometry = {
          ...geometry,
          width: Math.max(geometry.width, 460),
          height: 230,
        };
      }
    }

    return {
      ...base,
      type,
      geometry,
      binding,
    };
  }

  if (type === "image") {
    return {
      ...base,
      type,
      src: stringValue(source.src),
      alt: stringValue(source.alt),
      fit:
        source.fit === "contain" || source.fit === "stretch"
          ? source.fit
          : "cover",
    };
  }

  if (type === "shape") {
    return {
      ...base,
      type,
      shape:
        source.shape === "ellipse" || source.shape === "line"
          ? source.shape
          : "rectangle",
      fill: stringValue(source.fill, "#ede9fe"),
      stroke: stringValue(source.stroke, "#7c3aed"),
      strokeWidth: finiteNumber(source.strokeWidth, 1, 0, 40),
    };
  }

  if (type === "text") {
    return {
      ...base,
      type,
      text: stringValue(source.text),
    };
  }

  return null;
}

export function normalizeInteractiveScene(
  value: unknown,
  fallbackName = "Untitled scene",
): InteractiveScene {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveScene> & {
          objects?: Record<string, unknown>;
          objectOrder?: unknown[];
        })
      : {};

  const fallback = createInteractiveScene(fallbackName);
  const id = stringValue(source.id, fallback.id).trim() || fallback.id;
  const rawObjects =
    source.objects && typeof source.objects === "object"
      ? source.objects
      : {};

  const objects: Record<string, InteractiveSceneObject> = {};
  Object.entries(rawObjects).forEach(([key, raw], index) => {
    const normalized = normalizeObject(raw, key, index);
    if (normalized) objects[normalized.id] = normalized;
  });

  const savedOrder = Array.isArray(source.objectOrder)
    ? source.objectOrder
        .map(value => stringValue(value))
        .filter(Boolean)
    : [];

  const objectOrder = [
    ...savedOrder.filter(
      (objectId, index) =>
        !!objects[objectId] &&
        savedOrder.indexOf(objectId) === index,
    ),
    ...Object.keys(objects).filter(
      objectId => !savedOrder.includes(objectId),
    ),
  ];

  return {
    id,
    name: stringValue(source.name, fallbackName).trim() || fallbackName,
    width: finiteNumber(
      source.width,
      DEFAULT_SCENE_WIDTH,
      320,
      3840,
    ),
    height: finiteNumber(
      source.height,
      DEFAULT_SCENE_HEIGHT,
      320,
      3000,
    ),
    scrollLength: finiteNumber(
      source.scrollLength,
      DEFAULT_SCROLL_LENGTH,
      320,
      12000,
    ),
    scrollBehavior:
      source.scrollBehavior === "flow" ? "flow" : "pinned",
    background: normalizeBackground(source.background),
    ambient: normalizeSceneAmbient(source.ambient),
    transition: normalizeSceneTransition(source.transition),
    responsive: normalizeResponsiveSceneLayout(source.responsive),
    objectOrder,
    objects,
  };
}

function themeBackground(seed?: ResponsiveImportSeed): string {
  return seed?.theme === "dark" ? "#111318" : "#ffffff";
}

function responsiveSceneNames(
  seed?: ResponsiveImportSeed,
): string[] {
  const sections = seed?.sectionOrder ?? [];
  if (!sections.length) return ["Intro"];

  return sections.map(section => SECTION_LABELS[section] ?? "Scene");
}

function templateSceneNames(templateId?: string): string[] {
  if (
    templateId === "career-journey-starter" ||
    templateId === "career-journey"
  ) {
    return ["Journey begins", "Career Journey", "Projects chapter", "What's next?"];
  }
  if (templateId === "terminal") {
    return ["whoami", "experience.log", "projects/", "contact"];
  }
  if (templateId === "space-journey") {
    return ["Launch", "Career Orbit", "Project galaxy", "Transmission"];
  }
  return ["Intro", "Experience", "Projects", "Contact"];
}

export function createInitialInteractiveSceneCollection(
  startMethod: InteractiveExperienceStartMethod,
  options?: {
    responsiveSeed?: ResponsiveImportSeed;
    templateId?: string;
  },
): InteractiveSceneCollection {
  const names =
    startMethod === "responsive"
      ? responsiveSceneNames(options?.responsiveSeed)
      : startMethod === "template"
        ? templateSceneNames(options?.templateId)
        : ["Scene 1"];

  const backgroundColor = themeBackground(options?.responsiveSeed);
  const created = names.map(name =>
    createInteractiveScene(name, {
      background: {
        type: "solid",
        color: backgroundColor,
      },
    }),
  );

  const scenes = Object.fromEntries(
    created.map(scene => [scene.id, scene]),
  );

  return {
    sceneOrder: created.map(scene => scene.id),
    scenes,
    activeSceneId: created[0].id,
  };
}

export function normalizeInteractiveSceneCollection(
  value: unknown,
  fallback: {
    startMethod: InteractiveExperienceStartMethod;
    responsiveSeed?: ResponsiveImportSeed;
    templateId?: string;
  },
): InteractiveSceneCollection {
  const source =
    value && typeof value === "object"
      ? (value as Partial<InteractiveSceneCollection>)
      : {};

  const rawScenes =
    source.scenes && typeof source.scenes === "object"
      ? source.scenes
      : {};

  const scenes: Record<string, InteractiveScene> = {};
  Object.entries(rawScenes).forEach(([key, raw], index) => {
    const scene = normalizeInteractiveScene(
      raw,
      `Scene ${index + 1}`,
    );
    scenes[scene.id || key] = scene;
  });

  if (!Object.keys(scenes).length) {
    return createInitialInteractiveSceneCollection(
      fallback.startMethod,
      {
        responsiveSeed: fallback.responsiveSeed,
        templateId: fallback.templateId,
      },
    );
  }

  const savedOrder = Array.isArray(source.sceneOrder)
    ? source.sceneOrder.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  const sceneOrder = [
    ...savedOrder.filter(
      (sceneId, index) =>
        !!scenes[sceneId] &&
        savedOrder.indexOf(sceneId) === index,
    ),
    ...Object.keys(scenes).filter(
      sceneId => !savedOrder.includes(sceneId),
    ),
  ];

  const activeSceneId =
    typeof source.activeSceneId === "string" &&
    scenes[source.activeSceneId]
      ? source.activeSceneId
      : sceneOrder[0];

  return {
    sceneOrder,
    scenes,
    activeSceneId,
  };
}

export function getOrderedInteractiveScenes(
  collection: InteractiveSceneCollection,
): InteractiveScene[] {
  return collection.sceneOrder
    .map(id => collection.scenes[id])
    .filter((scene): scene is InteractiveScene => !!scene);
}

export function getActiveInteractiveScene(
  collection: InteractiveSceneCollection,
): InteractiveScene {
  return (
    collection.scenes[collection.activeSceneId] ??
    getOrderedInteractiveScenes(collection)[0]
  );
}

export function setActiveInteractiveScene(
  collection: InteractiveSceneCollection,
  sceneId: string,
): InteractiveSceneCollection {
  if (!collection.scenes[sceneId]) return collection;
  return {
    ...collection,
    activeSceneId: sceneId,
  };
}

export function addInteractiveScene(
  collection: InteractiveSceneCollection,
  name?: string,
): InteractiveSceneCollection {
  const scene = createInteractiveScene(
    name ?? `Scene ${collection.sceneOrder.length + 1}`,
  );

  return {
    ...collection,
    sceneOrder: [...collection.sceneOrder, scene.id],
    scenes: {
      ...collection.scenes,
      [scene.id]: scene,
    },
    activeSceneId: scene.id,
  };
}

export function updateInteractiveScene(
  collection: InteractiveSceneCollection,
  sceneId: string,
  patch: Partial<
    Pick<
      InteractiveScene,
      | "name"
      | "width"
      | "height"
      | "scrollLength"
      | "scrollBehavior"
      | "background"
      | "ambient"
      | "transition"
      | "responsive"
    >
  >,
): InteractiveSceneCollection {
  const current = collection.scenes[sceneId];
  if (!current) return collection;

  const next = normalizeInteractiveScene(
    {
      ...current,
      ...patch,
      background: patch.background
        ? {
            ...current.background,
            ...patch.background,
          }
        : current.background,
      ambient: patch.ambient
        ? {
            ...current.ambient,
            ...patch.ambient,
          }
        : current.ambient,
      transition: patch.transition
        ? {
            ...current.transition,
            ...patch.transition,
          }
        : current.transition,
      responsive: patch.responsive
        ? {
            ...(current.responsive ?? {}),
            ...patch.responsive,
          }
        : current.responsive,
    },
    current.name,
  );

  // A scene's identity is immutable.
  next.id = current.id;

  return {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: next,
    },
  };
}

export function moveInteractiveScene(
  collection: InteractiveSceneCollection,
  sceneId: string,
  direction: -1 | 1,
): InteractiveSceneCollection {
  const index = collection.sceneOrder.indexOf(sceneId);
  if (index < 0) return collection;
  const destination = Math.max(
    0,
    Math.min(collection.sceneOrder.length - 1, index + direction),
  );
  if (destination === index) return collection;

  const order = [...collection.sceneOrder];
  order.splice(index, 1);
  order.splice(destination, 0, sceneId);

  return {
    ...collection,
    sceneOrder: order,
  };
}

export function duplicateInteractiveScene(
  collection: InteractiveSceneCollection,
  sceneId: string,
): InteractiveSceneCollection {
  const current = collection.scenes[sceneId];
  if (!current) return collection;

  const id = interactiveId("scene");
  const objectIdMap = new Map<string, string>();
  current.objectOrder.forEach(objectId => {
    objectIdMap.set(objectId, interactiveId("object"));
  });

  const objects: Record<string, InteractiveSceneObject> = {};
  current.objectOrder.forEach(objectId => {
    const object = current.objects[objectId];
    if (!object) return;
    const nextId = objectIdMap.get(objectId)!;
    objects[nextId] = {
      ...object,
      id: nextId,
      geometry: { ...object.geometry },
      responsive: object.responsive
        ? {
            tablet: object.responsive.tablet
              ? { ...object.responsive.tablet }
              : undefined,
            mobile: object.responsive.mobile
              ? { ...object.responsive.mobile }
              : undefined,
          }
        : undefined,
      motion: object.motion ? { ...object.motion } : undefined,
      animationTracks: object.animationTracks?.map(track => ({ ...track })),
      scrollTracks: object.scrollTracks?.map(track => ({
        ...track,
        keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
      })),
      motionPath: object.motionPath
        ? {
            ...object.motionPath,
            points: object.motionPath.points.map(point => ({ ...point })),
          }
        : undefined,
      groupMotion: object.groupMotion ? { ...object.groupMotion } : undefined,
      groupAnimationTracks: object.groupAnimationTracks?.map(track => ({ ...track })),
      groupScrollTracks: object.groupScrollTracks?.map(track => ({
        ...track,
        keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
      })),
      groupMotionPath: object.groupMotionPath
        ? {
            ...object.groupMotionPath,
            points: object.groupMotionPath.points.map(point => ({ ...point })),
          }
        : undefined,
      appearance: object.appearance
        ? { ...object.appearance }
        : undefined,
    } as InteractiveSceneObject;
  });

  const duplicate: InteractiveScene = {
    ...current,
    id,
    name: `${current.name} copy`,
    background: { ...current.background },
    transition: { ...current.transition },
    responsive: current.responsive
      ? {
          tablet: current.responsive.tablet
            ? { ...current.responsive.tablet }
            : undefined,
          mobile: current.responsive.mobile
            ? { ...current.responsive.mobile }
            : undefined,
        }
      : undefined,
    ambient: {
      twinkle: { ...current.ambient.twinkle },
      particles: { ...current.ambient.particles },
      floatingShapes: { ...current.ambient.floatingShapes },
      gradientDrift: { ...current.ambient.gradientDrift },
      parallax: { ...current.ambient.parallax },
    },
    objectOrder: current.objectOrder
      .map(objectId => objectIdMap.get(objectId))
      .filter((value): value is string => !!value),
    objects,
  };

  const index = collection.sceneOrder.indexOf(sceneId);
  const order = [...collection.sceneOrder];
  order.splice(index + 1, 0, id);

  return {
    ...collection,
    sceneOrder: order,
    scenes: {
      ...collection.scenes,
      [id]: duplicate,
    },
    activeSceneId: id,
  };
}

export function removeInteractiveScene(
  collection: InteractiveSceneCollection,
  sceneId: string,
): InteractiveSceneCollection {
  if (!collection.scenes[sceneId]) return collection;

  // The Interactive editor always keeps one valid canvas available.
  if (collection.sceneOrder.length <= 1) return collection;

  const index = collection.sceneOrder.indexOf(sceneId);
  const sceneOrder = collection.sceneOrder.filter(id => id !== sceneId);
  const scenes = { ...collection.scenes };
  delete scenes[sceneId];

  const activeSceneId =
    collection.activeSceneId === sceneId
      ? sceneOrder[Math.min(index, sceneOrder.length - 1)]
      : collection.activeSceneId;

  return {
    sceneOrder,
    scenes,
    activeSceneId,
  };
}

export function createInteractiveObject(
  type: InteractiveSceneObject["type"],
  options?: {
    name?: string;
    geometry?: Partial<InteractiveObjectGeometry>;
  },
): InteractiveSceneObject {
  const id = interactiveId("object");
  const geometry = normalizeGeometry(options?.geometry, 0);

  if (type === "resume-content") {
    return {
      id,
      type,
      name: options?.name ?? "Resume content",
      geometry,
    };
  }

  if (type === "image") {
    return {
      id,
      type,
      name: options?.name ?? "Image",
      geometry,
      src: "",
      fit: "cover",
    };
  }

  if (type === "shape") {
    return {
      id,
      type,
      name: options?.name ?? "Shape",
      geometry,
      shape: "rectangle",
      fill: "#ede9fe",
      stroke: "#7c3aed",
      strokeWidth: 1,
    };
  }

  return {
    id,
    type: "text",
    name: options?.name ?? "Text",
    geometry,
    text: "Text",
  };
}

export function addInteractiveObject(
  collection: InteractiveSceneCollection,
  sceneId: string,
  object: InteractiveSceneObject,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene) return collection;

  const maxZ = scene.objectOrder.reduce((highest, id) => {
    const z = scene.objects[id]?.geometry.zIndex ?? 0;
    return Math.max(highest, z);
  }, -1);

  const nextObject = {
    ...object,
    geometry: {
      ...object.geometry,
      zIndex: Math.max(object.geometry.zIndex, maxZ + 1),
    },
  } as InteractiveSceneObject;

  return {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: {
        ...scene,
        objectOrder: [...scene.objectOrder, nextObject.id],
        objects: {
          ...scene.objects,
          [nextObject.id]: nextObject,
        },
      },
    },
  };
}

export function updateInteractiveObject(
  collection: InteractiveSceneCollection,
  sceneId: string,
  objectId: string,
  updater: (
    current: InteractiveSceneObject,
  ) => InteractiveSceneObject,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  const current = scene?.objects[objectId];
  if (!scene || !current) return collection;

  const next = updater(current);
  if (next.id !== objectId) return collection;

  return {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: {
        ...scene,
        objects: {
          ...scene.objects,
          [objectId]: next,
        },
      },
    },
  };
}

export function duplicateInteractiveObject(
  collection: InteractiveSceneCollection,
  sceneId: string,
  objectId: string,
): {
  collection: InteractiveSceneCollection;
  objectId: string | null;
} {
  const scene = collection.scenes[sceneId];
  const current = scene?.objects[objectId];
  if (!scene || !current) {
    return { collection, objectId: null };
  }

  const duplicateId = interactiveId("object");
  const maxZ = scene.objectOrder.reduce((highest, id) => {
    const z = scene.objects[id]?.geometry.zIndex ?? 0;
    return Math.max(highest, z);
  }, -1);

  const duplicate = {
    ...current,
    id: duplicateId,
    name: `${current.name} copy`,
    locked: false,
    groupId: undefined,
    groupName: undefined,
    motion: current.motion ? { ...current.motion } : undefined,
    animationTracks: current.animationTracks?.map(track => ({ ...track })),
    scrollTracks: current.scrollTracks?.map(track => ({
      ...track,
      keyframes: track.keyframes.map(keyframe => ({ ...keyframe })),
    })),
    motionPath: current.motionPath
      ? {
          ...current.motionPath,
          points: current.motionPath.points.map(point => ({ ...point })),
        }
      : undefined,
    groupMotion: undefined,
    groupAnimationTracks: undefined,
    groupScrollTracks: undefined,
    groupMotionPath: undefined,
    groupParallaxDepth: undefined,
    appearance: current.appearance
      ? { ...current.appearance }
      : undefined,
    responsive: current.responsive
      ? {
          tablet: current.responsive.tablet
            ? {
                ...current.responsive.tablet,
                x:
                  (current.responsive.tablet.x ??
                    current.geometry.x) + 24,
                y:
                  (current.responsive.tablet.y ??
                    current.geometry.y) + 24,
                zIndex: maxZ + 1,
                hidden: false,
              }
            : undefined,
          mobile: current.responsive.mobile
            ? {
                ...current.responsive.mobile,
                x:
                  (current.responsive.mobile.x ??
                    current.geometry.x) + 24,
                y:
                  (current.responsive.mobile.y ??
                    current.geometry.y) + 24,
                zIndex: maxZ + 1,
                hidden: false,
              }
            : undefined,
        }
      : undefined,
    geometry: {
      ...current.geometry,
      x: current.geometry.x + 24,
      y: current.geometry.y + 24,
      zIndex: maxZ + 1,
      hidden: false,
    },
  } as InteractiveSceneObject;

  const nextCollection: InteractiveSceneCollection = {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: {
        ...scene,
        objectOrder: [...scene.objectOrder, duplicateId],
        objects: {
          ...scene.objects,
          [duplicateId]: duplicate,
        },
      },
    },
  };

  return {
    collection: nextCollection,
    objectId: duplicateId,
  };
}

export function removeInteractiveObject(
  collection: InteractiveSceneCollection,
  sceneId: string,
  objectId: string,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene?.objects[objectId]) return collection;

  const objects = { ...scene.objects };
  delete objects[objectId];

  return {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: {
        ...scene,
        objectOrder: scene.objectOrder.filter(id => id !== objectId),
        objects,
      },
    },
  };
}

export function moveInteractiveObjectLayer(
  collection: InteractiveSceneCollection,
  sceneId: string,
  objectId: string,
  direction: -1 | 1,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene) return collection;

  const index = scene.objectOrder.indexOf(objectId);
  if (index < 0) return collection;
  const destination = Math.max(
    0,
    Math.min(scene.objectOrder.length - 1, index + direction),
  );
  if (destination === index) return collection;

  const objectOrder = [...scene.objectOrder];
  objectOrder.splice(index, 1);
  objectOrder.splice(destination, 0, objectId);

  const objects = { ...scene.objects };
  objectOrder.forEach((id, zIndex) => {
    const object = objects[id];
    if (!object) return;
    objects[id] = {
      ...object,
      geometry: {
        ...object.geometry,
        zIndex,
      },
      responsive: object.responsive
        ? {
            tablet: object.responsive.tablet
              ? {
                  ...object.responsive.tablet,
                  zIndex,
                }
              : undefined,
            mobile: object.responsive.mobile
              ? {
                  ...object.responsive.mobile,
                  zIndex,
                }
              : undefined,
          }
        : undefined,
    } as InteractiveSceneObject;
  });

  return {
    ...collection,
    scenes: {
      ...collection.scenes,
      [sceneId]: {
        ...scene,
        objectOrder,
        objects,
      },
    },
  };
}
