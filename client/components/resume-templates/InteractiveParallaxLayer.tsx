import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface InteractiveParallaxPointer {
  x: number;
  y: number;
}

export default function InteractiveParallaxLayer({
  depth,
  pointer,
  intensity,
  enabled,
  children,
}: {
  depth: number | undefined;
  pointer: InteractiveParallaxPointer;
  intensity: number;
  enabled: boolean;
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

  const safeDepth = Math.max(-2, Math.min(2, depth ?? 0));

  if (!enabled || !safeDepth || reduceMotion) return <>{children}</>;

  const strength = 4 + Math.max(0, Math.min(100, intensity)) * 0.13;
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    transform: `translate3d(${
      pointer.x * safeDepth * strength
    }px, ${
      pointer.y * safeDepth * strength
    }px, 0)`,
    transformOrigin: "center center",
    transition: "transform 90ms ease-out",
    willChange: "transform",
  };

  return (
    <div
      data-wp-parallax-depth={safeDepth}
      style={style}
    >
      {children}
    </div>
  );
}
