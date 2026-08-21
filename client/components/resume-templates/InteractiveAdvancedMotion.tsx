import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  InteractiveAnimationProperty,
  InteractiveAnimationTrack,
} from "./resumeInteractive";

function valueWithUnit(
  property: InteractiveAnimationProperty,
  value: number,
): string {
  if (property === "x" || property === "y" || property === "blur") {
    return `${value}px`;
  }
  if (property === "rotation") return `${value}deg`;
  return String(value);
}

function transitionProperty(
  property: InteractiveAnimationProperty,
): "transform" | "opacity" | "filter" {
  if (property === "opacity") return "opacity";
  if (property === "blur") return "filter";
  return "transform";
}

function activeStyle(
  track: InteractiveAnimationTrack,
  active: boolean,
): CSSProperties {
  const value = active ? track.to : track.from;

  if (track.property === "x") {
    return { transform: `translate3d(${value}px, 0, 0)` };
  }
  if (track.property === "y") {
    return { transform: `translate3d(0, ${value}px, 0)` };
  }
  if (track.property === "rotation") {
    return { transform: `rotate(${value}deg)` };
  }
  if (track.property === "scale") {
    return { transform: `scale(${value})` };
  }
  if (track.property === "blur") {
    return { filter: `blur(${value}px)` };
  }
  return { opacity: value };
}

function loopStyle(
  track: InteractiveAnimationTrack,
): CSSProperties & Record<string, string | number> {
  return {
    animationName: `wp-advanced-${track.property}`,
    animationDuration: `${track.duration}s`,
    animationDelay: `${track.delay}s`,
    animationTimingFunction: track.easing,
    animationIterationCount: "infinite",
    animationDirection: "alternate",
    animationFillMode: "both",
    transformOrigin: "center center",
    ["--wp-advanced-from" as string]: valueWithUnit(
      track.property,
      track.from,
    ),
    ["--wp-advanced-to" as string]: valueWithUnit(
      track.property,
      track.to,
    ),
  };
}

function AdvancedTrackLayer({
  track,
  children,
}: {
  track: InteractiveAnimationTrack;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);

    if (track.trigger === "load") {
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setActive(true));
      });
      return () => {
        cancelAnimationFrame(first);
        if (second) cancelAnimationFrame(second);
      };
    }

    if (track.trigger !== "enter") return;

    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setActive(true));
      return () => cancelAnimationFrame(frame);
    }

    let done = false;
    const observer = new IntersectionObserver(
      entries => {
        if (done) return;
        if (entries.some(entry => entry.isIntersecting)) {
          done = true;
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [track.id, track.trigger]);

  const isLoop = track.trigger === "loop";
  const style: CSSProperties & Record<string, string | number> = isLoop
    ? loopStyle(track)
    : {
        width: "100%",
        height: "100%",
        ...activeStyle(track, active),
        transitionProperty: transitionProperty(track.property),
        transitionDuration: `${track.duration}s`,
        transitionDelay: active ? `${track.delay}s` : "0s",
        transitionTimingFunction: track.easing,
        transformOrigin: "center center",
      };

  if (isLoop) {
    style.width = "100%";
    style.height = "100%";
  }

  return (
    <div
      ref={ref}
      data-wp-advanced-motion={track.property}
      data-wp-advanced-trigger={track.trigger}
      onPointerEnter={
        track.trigger === "hover" ? () => setActive(true) : undefined
      }
      onPointerLeave={
        track.trigger === "hover" ? () => setActive(false) : undefined
      }
      onClick={
        track.trigger === "click"
          ? () => setActive(value => !value)
          : undefined
      }
      style={style}
    >
      {children}
    </div>
  );
}

export default function InteractiveAdvancedMotion({
  tracks,
  replayKey,
  children,
}: {
  tracks: InteractiveAnimationTrack[] | undefined;
  replayKey: number;
  children: ReactNode;
}) {
  const activeTracks = (tracks ?? []).slice(0, 12);

  if (!activeTracks.length) return <>{children}</>;

  return activeTracks.reduceRight<ReactNode>(
    (content, track) => (
      <AdvancedTrackLayer
        key={`${track.id}:${replayKey}`}
        track={track}
      >
        {content}
      </AdvancedTrackLayer>
    ),
    children,
  );
}
