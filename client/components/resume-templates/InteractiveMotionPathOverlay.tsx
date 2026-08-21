import type {
  PointerEvent as ReactPointerEvent,
} from "react";
import type {
  InteractiveMotionPath,
  InteractiveObjectGeometry,
  InteractiveScene,
} from "./resumeInteractive";
import {
  motionPathPointAt,
  motionPathSvgD,
} from "./InteractivePathMotion";

export default function InteractiveMotionPathOverlay({
  scene,
  geometry,
  path,
  progress,
  locked,
  onPreview,
  onCommit,
}: {
  scene: InteractiveScene;
  geometry: InteractiveObjectGeometry;
  path: InteractiveMotionPath;
  progress: number;
  locked: boolean;
  onPreview: (path: InteractiveMotionPath) => void;
  onCommit: (path: InteractiveMotionPath) => void;
}) {
  if (!path.enabled) return null;

  const originX = geometry.x + geometry.width / 2;
  const originY = geometry.y + geometry.height / 2;
  const current = motionPathPointAt(path, progress);

  const beginPointDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    pointId: string,
  ) => {
    if (locked || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const point = path.points.find(item => item.id === pointId);
    if (!point) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startPoint = { ...point };
    let finalX = point.x;
    let finalY = point.y;

    const move = (pointer: PointerEvent) => {
      pointer.preventDefault();
      const dx =
        (pointer.clientX - startX) *
        (scene.width / rect.width);
      const dy =
        (pointer.clientY - startY) *
        (scene.height / rect.height);

      finalX = startPoint.x + dx;
      finalY = startPoint.y + dy;

      onPreview({
        ...path,
        points: path.points.map(item =>
          item.id === pointId
            ? {
                ...item,
                x: finalX,
                y: finalY,
              }
            : item,
        ),
      });
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);

      onCommit({
        ...path,
        points: path.points.map(item =>
          item.id === pointId
            ? {
                ...item,
                x: finalX,
                y: finalY,
              }
            : item,
        ),
      });
    };

    document.addEventListener("pointermove", move, {
      passive: false,
    });
    document.addEventListener("pointerup", up);
  };

  return (
    <svg
      data-wp-motion-path-overlay
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[360] h-full w-full overflow-visible"
      aria-label="Motion path"
    >
      <path
        d={motionPathSvgD(path, originX, originY)}
        fill="none"
        stroke="#7c3aed"
        strokeWidth={3}
        strokeDasharray="10 8"
        vectorEffect="non-scaling-stroke"
        opacity={0.82}
      />

      {path.points.map((point, index) => (
        <g key={point.id}>
          <circle
            cx={originX + point.x}
            cy={originY + point.y}
            r={10}
            fill="#ffffff"
            stroke="#7c3aed"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            className={locked ? "" : "pointer-events-auto cursor-move"}
            onPointerDown={event =>
              beginPointDrag(event, point.id)
            }
          />
          <text
            x={originX + point.x + 14}
            y={originY + point.y - 12}
            fill="#6d28d9"
            fontSize={20}
            fontWeight={700}
            style={{ pointerEvents: "none" }}
          >
            {index + 1} · {Math.round(point.progress)}%
          </text>
        </g>
      ))}

      <circle
        cx={originX + current.x}
        cy={originY + current.y}
        r={7}
        fill="#7c3aed"
        stroke="#ffffff"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
