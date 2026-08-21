import type {
  InteractiveAmbientEffect,
  InteractiveObjectMotion,
  InteractiveSceneAmbient,
} from "./resumeInteractive";

export interface InteractiveAmbientParticle {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
  rotation: number;
  shape: "circle" | "square" | "diamond";
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export function ambientParticleCount(
  effect: InteractiveAmbientEffect,
  kind: "twinkle" | "particles" | "floatingShapes",
): number {
  const max =
    kind === "twinkle" ? 56 : kind === "particles" ? 40 : 18;
  const min = kind === "twinkle" ? 6 : kind === "particles" ? 4 : 3;
  if (!effect.enabled || effect.density <= 0) return 0;
  return Math.max(
    min,
    Math.round((effect.density / 100) * max),
  );
}

export function buildAmbientParticles(
  sceneId: string,
  kind: "twinkle" | "particles" | "floatingShapes",
  effect: InteractiveAmbientEffect,
): InteractiveAmbientParticle[] {
  const count = ambientParticleCount(effect, kind);
  const random = seeded(hashString(`${sceneId}:${kind}`));
  const speed = Math.max(0.25, effect.speed);

  return Array.from({ length: count }, (_, index) => {
    const shapeRoll = random();
    const size =
      kind === "twinkle"
        ? 1.2 + random() * 3.2
        : kind === "particles"
          ? 2 + random() * 5
          : 10 + random() * 28;

    return {
      id: `${kind}-${index}`,
      x: random() * 100,
      y: random() * 100,
      size,
      opacity:
        (0.2 + random() * 0.8) *
        Math.max(0.05, effect.intensity / 100),
      delay: -(random() * 12),
      duration:
        (kind === "twinkle"
          ? 2.4 + random() * 3.8
          : kind === "particles"
            ? 7 + random() * 9
            : 9 + random() * 11) / speed,
      driftX:
        (random() - 0.5) *
        (kind === "floatingShapes" ? 48 : 24) *
        (effect.intensity / 100),
      driftY:
        (random() - 0.5) *
        (kind === "floatingShapes" ? 40 : 70) *
        (effect.intensity / 100),
      rotation: random() * 180,
      shape:
        shapeRoll < 0.46
          ? "circle"
          : shapeRoll < 0.78
            ? "square"
            : "diamond",
    };
  });
}

export function objectMotionAnimation(
  motion: InteractiveObjectMotion | undefined,
): {
  animationName?: string;
  animationDuration?: string;
  animationDelay?: string;
  animationTimingFunction?: string;
  animationIterationCount?: string;
  animationDirection?: string;
  transformOrigin?: string;
  variables?: Record<string, string>;
} {
  if (!motion || motion.preset === "none") return {};

  const intensity = Math.max(0, Math.min(100, motion.intensity));
  const speed = Math.max(0.25, motion.speed);

  const durationByPreset: Record<
    Exclude<InteractiveObjectMotion["preset"], "none">,
    number
  > = {
    float: 5.8,
    bob: 3.4,
    pulse: 3.1,
    spin: 12,
    drift: 7.2,
  };

  return {
    animationName: `wp-interactive-${motion.preset}`,
    animationDuration: `${durationByPreset[motion.preset] / speed}s`,
    animationDelay: `${motion.delay ?? 0}s`,
    animationTimingFunction:
      motion.preset === "spin" ? "linear" : "ease-in-out",
    animationIterationCount: "infinite",
    animationDirection:
      motion.preset === "spin" ? "normal" : "alternate",
    transformOrigin: "center center",
    variables: {
      "--wp-motion-distance": `${4 + intensity * 0.16}px`,
      "--wp-motion-distance-x": `${3 + intensity * 0.18}px`,
      "--wp-motion-scale": `${1 + intensity * 0.0018}`,
      "--wp-motion-spin": `${40 + intensity * 3.2}deg`,
    },
  };
}

export function ambientIsActive(
  ambient: InteractiveSceneAmbient,
): boolean {
  return (
    ambient.twinkle.enabled ||
    ambient.particles.enabled ||
    ambient.floatingShapes.enabled ||
    ambient.gradientDrift.enabled ||
    ambient.parallax.enabled
  );
}

export const INTERACTIVE_MOTION_CSS = `
@keyframes wp-interactive-float {
  from { transform: translate3d(0, calc(var(--wp-motion-distance) * -0.45), 0); }
  to   { transform: translate3d(var(--wp-motion-distance-x), var(--wp-motion-distance), 0); }
}
@keyframes wp-interactive-bob {
  from { transform: translate3d(0, calc(var(--wp-motion-distance) * -1), 0); }
  to   { transform: translate3d(0, var(--wp-motion-distance), 0); }
}
@keyframes wp-interactive-pulse {
  from { transform: scale(1); }
  to   { transform: scale(var(--wp-motion-scale)); }
}
@keyframes wp-interactive-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(var(--wp-motion-spin)); }
}
@keyframes wp-interactive-drift {
  0%   { transform: translate3d(calc(var(--wp-motion-distance-x) * -1), 0, 0); }
  50%  { transform: translate3d(0, calc(var(--wp-motion-distance) * -0.55), 0); }
  100% { transform: translate3d(var(--wp-motion-distance-x), var(--wp-motion-distance), 0); }
}

@keyframes wp-interactive-twinkle {
  0%, 100% { opacity: .18; transform: scale(.65); }
  50%      { opacity: 1; transform: scale(1.22); }
}
@keyframes wp-interactive-particle {
  from { transform: translate3d(0, 18px, 0); }
  to   { transform: translate3d(var(--wp-drift-x), calc(var(--wp-drift-y) - 45px), 0); }
}
@keyframes wp-interactive-shape {
  from { transform: translate3d(0, 0, 0) rotate(var(--wp-start-rotation)); }
  to   { transform: translate3d(var(--wp-drift-x), var(--wp-drift-y), 0) rotate(calc(var(--wp-start-rotation) + 22deg)); }
}
@keyframes wp-interactive-gradient-drift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes wp-advanced-x {
  from { transform: translate3d(var(--wp-advanced-from), 0, 0); }
  to   { transform: translate3d(var(--wp-advanced-to), 0, 0); }
}
@keyframes wp-advanced-y {
  from { transform: translate3d(0, var(--wp-advanced-from), 0); }
  to   { transform: translate3d(0, var(--wp-advanced-to), 0); }
}
@keyframes wp-advanced-rotation {
  from { transform: rotate(var(--wp-advanced-from)); }
  to   { transform: rotate(var(--wp-advanced-to)); }
}
@keyframes wp-advanced-scale {
  from { transform: scale(var(--wp-advanced-from)); }
  to   { transform: scale(var(--wp-advanced-to)); }
}
@keyframes wp-advanced-opacity {
  from { opacity: var(--wp-advanced-from); }
  to   { opacity: var(--wp-advanced-to); }
}
@keyframes wp-advanced-blur {
  from { filter: blur(var(--wp-advanced-from)); }
  to   { filter: blur(var(--wp-advanced-to)); }
}

@media (prefers-reduced-motion: reduce) {
  [data-wp-interactive-motion],
  [data-wp-advanced-motion],
  [data-wp-ambient-effect],
  [data-wp-gradient-drift],
  [data-wp-parallax] {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    filter: none !important;
    opacity: 1 !important;
  }
}
`;
