import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  InteractiveAnimationEasing,
  InteractiveSceneTransition,
} from "./resumeInteractive";

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
  return t * t * (3 - 2 * t);
}

export function sceneTransitionStyles(
  transition: InteractiveSceneTransition,
  progress: number,
): {
  current: CSSProperties;
  next: CSSProperties;
} {
  const p = ease(progress, transition.easing);

  if (transition.type === "fade") {
    return {
      current: { opacity: 1 - p },
      next: { opacity: p },
    };
  }

  if (transition.type === "slide-left") {
    return {
      current: {
        transform: `translate3d(${-p * 100}%, 0, 0)`,
      },
      next: {
        transform: `translate3d(${(1 - p) * 100}%, 0, 0)`,
      },
    };
  }

  if (transition.type === "slide-up") {
    return {
      current: {
        transform: `translate3d(0, ${-p * 100}%, 0)`,
      },
      next: {
        transform: `translate3d(0, ${(1 - p) * 100}%, 0)`,
      },
    };
  }

  if (transition.type === "zoom") {
    return {
      current: {
        opacity: 1 - p,
        transform: `scale(${1 + p * 0.12})`,
      },
      next: {
        opacity: p,
        transform: `scale(${0.9 + p * 0.1})`,
      },
    };
  }

  return {
    current: {},
    next: { opacity: p >= 1 ? 1 : 0 },
  };
}

export default function InteractiveSceneTransitionOverlay({
  transition,
  playKey,
  currentScene,
  nextScene,
  onComplete,
}: {
  transition: InteractiveSceneTransition;
  playKey: number;
  currentScene: ReactNode;
  nextScene: ReactNode;
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!playKey || transition.type === "none") return;

    let frame = 0;
    const started = performance.now();
    const durationMs = transition.duration * 1000;
    setProgress(0);
    setVisible(true);

    const tick = (now: number) => {
      const next = Math.max(
        0,
        Math.min(1, (now - started) / durationMs),
      );
      setProgress(next);

      if (next < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }

      window.setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 140);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    onComplete,
    playKey,
    transition.duration,
    transition.type,
  ]);

  if (!visible) return null;

  const styles = sceneTransitionStyles(transition, progress);

  return (
    <div
      data-wp-scene-transition-preview
      className="pointer-events-none absolute inset-0 z-[700] overflow-hidden rounded-lg bg-background"
    >
      <div
        className="absolute inset-0"
        style={{
          ...styles.current,
          transformOrigin: "center center",
          willChange: "transform, opacity",
        }}
      >
        {currentScene}
      </div>
      <div
        className="absolute inset-0"
        style={{
          ...styles.next,
          transformOrigin: "center center",
          willChange: "transform, opacity",
        }}
      >
        {nextScene}
      </div>

      <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-2 py-1 text-[7px] font-semibold text-white">
        {transition.type} · {Math.round(progress * 100)}%
      </div>
    </div>
  );
}
