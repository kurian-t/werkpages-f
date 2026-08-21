import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  InteractiveAnimationEasing,
  InteractiveAnimationProperty,
  InteractiveScrollTrack,
} from "./resumeInteractive";

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function ease(
  value: number,
  easing: InteractiveAnimationEasing,
): number {
  const t = Math.max(0, Math.min(1, value));

  if (easing === "linear") return t;
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
  if (easing === "ease-in-out") {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Smoothstep is a predictable approximation for CSS `ease`.
  return t * t * (3 - 2 * t);
}

export function scrollTrackValueAt(
  track: InteractiveScrollTrack,
  progress: number,
): number {
  const p = clampProgress(progress);
  const keyframes = [...track.keyframes].sort(
    (a, b) => a.progress - b.progress,
  );

  if (!keyframes.length) return 0;
  if (p <= keyframes[0].progress) return keyframes[0].value;
  if (p >= keyframes[keyframes.length - 1].progress) {
    return keyframes[keyframes.length - 1].value;
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];

    if (p < from.progress || p > to.progress) continue;

    const span = Math.max(0.0001, to.progress - from.progress);
    const local = (p - from.progress) / span;
    const eased = ease(local, track.easing);
    return from.value + (to.value - from.value) * eased;
  }

  return keyframes[keyframes.length - 1].value;
}

export function scrollMotionStyle(
  tracks: InteractiveScrollTrack[] | undefined,
  progress: number,
): CSSProperties {
  const values = new Map<
    InteractiveAnimationProperty,
    number
  >();

  (tracks ?? []).slice(0, 8).forEach(track => {
    values.set(track.property, scrollTrackValueAt(track, progress));
  });

  const x = values.get("x") ?? 0;
  const y = values.get("y") ?? 0;
  const rotation = values.get("rotation") ?? 0;
  const scale = values.get("scale") ?? 1;
  const opacity = values.get("opacity");
  const blur = values.get("blur") ?? 0;

  const transformParts: string[] = [];
  if (x || y) {
    transformParts.push(`translate3d(${x}px, ${y}px, 0)`);
  }
  if (rotation) transformParts.push(`rotate(${rotation}deg)`);
  if (scale !== 1) transformParts.push(`scale(${scale})`);

  return {
    width: "100%",
    height: "100%",
    transform: transformParts.length
      ? transformParts.join(" ")
      : undefined,
    transformOrigin: "center center",
    opacity,
    filter: blur ? `blur(${blur}px)` : undefined,
    willChange: tracks?.length
      ? "transform, opacity, filter"
      : undefined,
  };
}

export default function InteractiveScrollMotion({
  tracks,
  progress,
  children,
}: {
  tracks: InteractiveScrollTrack[] | undefined;
  progress: number;
  children: ReactNode;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const sync = () => setReduceMotion(query.matches);
    sync();

    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  if (!tracks?.length) return <>{children}</>;

  // Reduced-motion visitors receive the final readable composition instead of
  // content being stranded off-screen or transparent at scroll progress 0.
  const effectiveProgress = reduceMotion ? 100 : progress;

  return (
    <div
      data-wp-scroll-motion
      data-wp-scroll-progress={
        Math.round(effectiveProgress * 10) / 10
      }
      style={scrollMotionStyle(tracks, effectiveProgress)}
    >
      {children}
    </div>
  );
}
