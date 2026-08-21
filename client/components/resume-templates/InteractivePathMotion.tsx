import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  InteractiveMotionPath,
  InteractiveMotionPathPoint,
} from "./resumeInteractive";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sortedPoints(
  path: InteractiveMotionPath,
): InteractiveMotionPathPoint[] {
  return [...path.points].sort((a, b) => a.progress - b.progress);
}

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )
  );
}

function segmentAt(
  path: InteractiveMotionPath,
  progress: number,
): {
  points: InteractiveMotionPathPoint[];
  index: number;
  local: number;
} {
  const points = sortedPoints(path);
  const p = clamp(progress, 0, 100);

  if (points.length < 2) {
    return { points, index: 0, local: 0 };
  }

  if (p <= points[0].progress) {
    return { points, index: 0, local: 0 };
  }

  if (p >= points[points.length - 1].progress) {
    return { points, index: points.length - 2, local: 1 };
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (p < from.progress || p > to.progress) continue;

    const span = Math.max(0.0001, to.progress - from.progress);
    return {
      points,
      index,
      local: (p - from.progress) / span,
    };
  }

  return { points, index: points.length - 2, local: 1 };
}

export function motionPathPointAt(
  path: InteractiveMotionPath | undefined,
  progress: number,
): {
  x: number;
  y: number;
  angle: number;
} {
  if (!path?.enabled || path.points.length < 2) {
    return { x: 0, y: 0, angle: 0 };
  }

  const sample = (sampleProgress: number): { x: number; y: number } => {
    const { points, index, local } = segmentAt(path, sampleProgress);
    if (points.length < 2) return { x: 0, y: 0 };

    const p1 = points[index];
    const p2 = points[index + 1];

    if (path.curve === "linear") {
      return {
        x: p1.x + (p2.x - p1.x) * local,
        y: p1.y + (p2.y - p1.y) * local,
      };
    }

    const p0 = points[Math.max(0, index - 1)] ?? p1;
    const p3 = points[Math.min(points.length - 1, index + 2)] ?? p2;

    return {
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, local),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, local),
    };
  };

  const point = sample(progress);
  const before = sample(clamp(progress - 0.15, 0, 100));
  const after = sample(clamp(progress + 0.15, 0, 100));
  const angle =
    Math.atan2(after.y - before.y, after.x - before.x) *
    (180 / Math.PI);

  return {
    ...point,
    angle: Number.isFinite(angle) ? angle : 0,
  };
}

export function motionPathStyle(
  path: InteractiveMotionPath | undefined,
  progress: number,
): CSSProperties {
  const point = motionPathPointAt(path, progress);
  if (!path?.enabled) {
    return {
      width: "100%",
      height: "100%",
    };
  }

  const transforms = [
    `translate3d(${point.x}px, ${point.y}px, 0)`,
  ];

  if (path.autoRotate) {
    transforms.push(`rotate(${point.angle}deg)`);
  }

  return {
    width: "100%",
    height: "100%",
    transform: transforms.join(" "),
    transformOrigin: "center center",
    willChange: "transform",
  };
}

function sampledSvgPoints(
  path: InteractiveMotionPath,
): Array<{ x: number; y: number }> {
  if (path.curve === "linear") {
    return sortedPoints(path).map(point => ({
      x: point.x,
      y: point.y,
    }));
  }

  return Array.from({ length: 51 }, (_, index) => {
    const result = motionPathPointAt(path, index * 2);
    return { x: result.x, y: result.y };
  });
}

export function motionPathSvgD(
  path: InteractiveMotionPath,
  originX: number,
  originY: number,
): string {
  const points = sampledSvgPoints(path);
  if (!points.length) return "";

  return points
    .map((point, index) => {
      const x = originX + point.x;
      const y = originY + point.y;
      return `${index ? "L" : "M"} ${x} ${y}`;
    })
    .join(" ");
}

export default function InteractivePathMotion({
  path,
  progress,
  children,
}: {
  path: InteractiveMotionPath | undefined;
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

  if (!path?.enabled) return <>{children}</>;

  const effectiveProgress = reduceMotion ? 100 : progress;

  return (
    <div
      data-wp-path-motion
      data-wp-path-progress={
        Math.round(effectiveProgress * 10) / 10
      }
      style={motionPathStyle(path, effectiveProgress)}
    >
      {children}
    </div>
  );
}
