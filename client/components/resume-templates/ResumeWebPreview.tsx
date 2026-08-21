import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { ResumeData, ResumeDesign } from "./types";
import { companyLogoDomain } from "@/lib/utils";
import {
  getResumeWebSettings,
  normalizeImageUrl,
  normalizeWebUrl,
  projectResumeToWeb,
  resolveVideoEmbed,
  withResumeWebSettings,
  type ResumeWebDetailsMode,
  type ResumeWebTheme,
} from "./resumeWeb";
import {
  applyWebAnimationPreset,
  backgroundDurationSeconds,
  clearWebInstanceAnimation,
  effectiveWebMotionSpec,
  getWebAnimationStudio,
  motionDurationMs,
  updateWebAnimationTarget,
  updateWebInstanceAnimation,
  withWebAnimationStudio,
  type WebAnimationPreset,
  type WebAnimationTarget,
  type WebBackgroundEffect,
  type WebBackgroundSpeed,
  type WebHoverEffect,
  type WebMotionEffect,
  type WebMotionSpec,
  type WebMotionSpeed,
} from "./resumeWebAnimation";
import {
  applyWebEditorTextStylePatch,
  clearWebInstancePlacement,
  clearWebPlacementOverride,
  getEffectiveWebTextStyle,
  getEffectiveWebBoxStyle,
  getEffectiveWebCompanyLogoSize,
  getWebBoxStyle,
  getWebElementPlacement,
  getWebInstancePlacement,
  getWebRotationSyncTarget,
  getWebSectionOrder,
  getWebSectionPlacement,
  isCompanyLogoCrossFormatLinked,
  isWebCompanyLogoGroupLinked,
  isWebRotationCrossFormatLinked,
  isWebTextLinked,
  setCompanyLogoCrossFormatLinked,
  setWebCompanyLogoGroupLinked,
  setWebRotationCrossFormatLinked,
  setWebSectionOrder,
  setWebTextLinked,
  syncCompanyLogoSizeFromWebNow,
  updateWebBoxStyle,
  updateWebCompanyLogoSize,
  updateWebElementPlacement,
  updateWebInstanceBoxStyle,
  updateWebInstancePlacement,
  updateWebRotationWithPdfSync,
  updateWebSectionPlacement,
  webBoxStyleToCss,
  webPlacementToStyle,
  webTextStyleToCss,
  type ResumeRotationSyncTarget,
  type ResumeTextStylePatch,
  type ResumeVisualRole,
  type WebBreakpoint,
  type WebElementTarget,
  type WebLayoutPlacement,
  type WebSectionId,
} from "./resumePresentation";
import {
  getResumeProjects,
  withResumeProjects,
  type ResumeProjectEntry,
} from "./resumeProjects";

type EditorTarget = WebAnimationTarget | "background";

type EditorSelection = {
  target: EditorTarget;
  sectionId?: WebSectionId;
  instanceId?: string;
  role?: ResumeVisualRole;
  label: string;
};

type EditorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  rotation?: number;
};

type DropGuide = {
  top: number;
  left: number;
  width: number;
  sectionIndex: number;
  horizontalIntent: "left" | "full" | "right";
  pairWith?: WebSectionId;
  zoneTop?: number;
  zoneLeft?: number;
  zoneWidth?: number;
  zoneHeight?: number;
};

type InspectorTab = "layout" | "style" | "animate" | "more";

const BREAKPOINT_WIDTH: Record<WebBreakpoint, number> = {
  desktop: 980,
  tablet: 720,
  mobile: 390,
};

function normalizeWebRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next <= -180) next += 360;
  return Math.round(next * 10) / 10;
}

function snapWebRotation(value: number): number {
  const normalized = normalizeWebRotation(value);
  const SNAP = 5;
  for (const target of [0, 45, 90, 135, 180, -45, -90, -135]) {
    if (Math.abs(normalized - target) <= SNAP) return target;
  }
  return normalized;
}

const TARGET_ROLE: Partial<Record<EditorTarget, ResumeVisualRole>> = {
  name: "name",
  summary: "summary",
  contact: "contact",
  sectionHeading: "sectionHeading",
  sectionBody: "entryBody",
  experience: "entryTitle",
  projects: "entryTitle",
  education: "entryTitle",
  skills: "skill",
  links: "link",
};

const TARGET_LABEL: Record<EditorTarget, string> = {
  background: "Background",
  hero: "Hero",
  name: "Name",
  summary: "Summary",
  contact: "Contact",
  photo: "Photo",
  section: "Section",
  sectionHeading: "Section heading",
  sectionBody: "Section content",
  experience: "Experience",
  projects: "Project",
  education: "Education",
  skills: "Skill",
  links: "Link",
  video: "Video",
};

const MOTION_EFFECTS: Array<{ value: WebMotionEffect; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "fade-up", label: "Fade up" },
  { value: "slide-left", label: "Slide from right" },
  { value: "slide-right", label: "Slide from left" },
  { value: "blur-in", label: "Blur in" },
  { value: "tracking-in", label: "Tracking in" },
  { value: "pop", label: "Pop" },
  { value: "flip-in", label: "Flip in" },
];

const FONT_FAMILIES = [
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times-Roman", label: "Times" },
  { value: "Courier", label: "Courier" },
];

function fontTraits(fontFamily: string | undefined) {
  const value = fontFamily ?? "Helvetica";
  const family =
    value.startsWith("Times") ? "Times" :
    value.startsWith("Courier") ? "Courier" :
    "Helvetica";
  const bold = value.includes("Bold");
  const italic =
    value.includes("Italic") ||
    value.includes("Oblique");

  return { family, bold, italic };
}

function fontVariant(
  current: string | undefined,
  patch: Partial<{ family: string; bold: boolean; italic: boolean }>,
): string {
  const traits = fontTraits(current);
  const family = patch.family ?? traits.family;
  const bold = patch.bold ?? traits.bold;
  const italic = patch.italic ?? traits.italic;

  if (family === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }

  if (family === "Courier") {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }

  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function keyframesFor(effect: WebMotionEffect): Keyframe[] {
  switch (effect) {
    case "fade":
      return [{ opacity: 0 }, { opacity: 1 }];
    case "fade-up":
      return [
        { opacity: 0, transform: "translateY(18px)" },
        { opacity: 1, transform: "none" },
      ];
    case "slide-left":
      return [
        { opacity: 0, transform: "translateX(34px)" },
        { opacity: 1, transform: "none" },
      ];
    case "slide-right":
      return [
        { opacity: 0, transform: "translateX(-34px)" },
        { opacity: 1, transform: "none" },
      ];
    case "blur-in":
      return [
        { opacity: 0, filter: "blur(11px)", transform: "translateY(6px)" },
        { opacity: 1, filter: "blur(0)", transform: "none" },
      ];
    case "tracking-in":
      return [
        { opacity: 0, letterSpacing: "0.16em", filter: "blur(2px)" },
        { opacity: 1, letterSpacing: "normal", filter: "blur(0)" },
      ];
    case "pop":
      return [
        { opacity: 0, transform: "scale(.84)" },
        { opacity: 1, transform: "scale(1.025)", offset: 0.72 },
        { opacity: 1, transform: "scale(1)" },
      ];
    case "flip-in":
      return [
        {
          opacity: 0,
          transform: "perspective(700px) rotateX(-58deg) translateY(6px)",
        },
        { opacity: 1, transform: "none" },
      ];
    default:
      return [{ opacity: 1 }, { opacity: 1 }];
  }
}

function playMotion(
  elements: HTMLElement[],
  spec: WebMotionSpec,
  replayKey: string,
) {
  elements.forEach((element, index) => {
    const token = `${replayKey}:${spec.effect}:${spec.speed}:${spec.delayMs}:${spec.staggerMs}:${index}`;
    if (element.dataset.resumeWebMotionToken === token) return;
    element.dataset.resumeWebMotionToken = token;
    element.getAnimations().forEach(animation => animation.cancel());

    if (spec.effect === "none") {
      element.style.removeProperty("opacity");
      element.style.removeProperty("transform");
      element.style.removeProperty("filter");
      element.style.removeProperty("letter-spacing");
      return;
    }

    element.animate(keyframesFor(spec.effect), {
      duration: motionDurationMs(spec.speed),
      delay: spec.delayMs + spec.staggerMs * index,
      fill: "both",
      easing: "cubic-bezier(.2,.8,.2,1)",
    });
  });
}

const WEB_LOGO_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";

function WebCompanyLogo({
  company,
  logoUrl,
}: {
  company: string;
  logoUrl?: string;
}) {
  const fallback =
    `https://img.logo.dev/${companyLogoDomain(company)}?token=${WEB_LOGO_TOKEN}`;
  const [src, setSrc] = useState(logoUrl?.trim() || fallback);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const nextFallback =
      `https://img.logo.dev/${companyLogoDomain(company)}?token=${WEB_LOGO_TOKEN}`;
    setSrc(logoUrl?.trim() || nextFallback);
    setFailed(false);
  }, [company, logoUrl]);

  if (!company.trim() || failed) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => {
        if (src !== fallback) {
          setSrc(fallback);
        } else {
          setFailed(true);
        }
      }}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        borderRadius: "inherit",
        background: "transparent",
        pointerEvents: "none",
      }}
    />
  );
}

function EditableRichText({
  html,
  editing,
  onStartEdit,
  onCommit,
  style,
}: {
  html: string;
  editing: boolean;
  onStartEdit: () => void;
  onCommit: (html: string) => void;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || editing) return;
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [html, editing]);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const commit = () => {
    if (!editing || !ref.current) return;
    onCommit(ref.current.innerHTML);
  };

  if (!html.trim() && !editing) {
    return (
      <div
        onDoubleClick={event => {
          event.stopPropagation();
          onStartEdit();
        }}
        style={{
          ...style,
          minHeight: 22,
          color: "var(--web-muted)",
          fontStyle: "italic",
          opacity: .58,
          cursor: "text",
        }}
      >
        Double-click to add description
      </div>
    );
  }

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: html }}
      onDoubleClick={event => {
        event.stopPropagation();
        onStartEdit();
      }}
      onBlur={commit}
      onKeyDown={event => {
        if (!editing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          ref.current?.blur();
        }
      }}
      style={{
        ...style,
        outline: editing ? "1px solid rgba(109,40,217,.38)" : undefined,
        outlineOffset: editing ? 3 : undefined,
        cursor: editing ? "text" : "grab",
      }}
    />
  );
}

function EditableText({
  value,
  onCommit,
  editing,
  onStartEdit,
  as = "span",
  style,
  className,
}: {
  value: string;
  onCommit?: (value: string) => void;
  editing: boolean;
  onStartEdit?: () => void;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
  style?: CSSProperties;
  className?: string;
}) {
  const Tag = as;
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    ref.current.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const commit = () => {
    if (!editing || !ref.current || !onCommit) return;
    onCommit(ref.current.textContent?.trim() ?? "");
  };

  return (
    <Tag
      ref={ref as any}
      className={className}
      style={{
        ...style,
        outline: editing ? "1px solid rgba(109,40,217,.35)" : undefined,
        outlineOffset: editing ? 2 : undefined,
        cursor: editing ? "text" : undefined,
      }}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={event => {
        if (!onCommit) return;
        event.stopPropagation();
        onStartEdit?.();
      }}
      onBlur={commit}
      onKeyDown={event => {
        if (!editing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          ref.current?.blur();
        }
        if (event.key === "Enter" && !event.shiftKey && as !== "p" && as !== "div") {
          event.preventDefault();
          ref.current?.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}

function parseCssColor(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const input = value.trim().toLowerCase();

  const shortHex = input.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return shortHex[1].split("").map(char => parseInt(char + char, 16)) as [
      number,
      number,
      number,
    ];
  }

  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }

  const rgb = input.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
  );
  if (rgb) {
    return [
      Math.max(0, Math.min(255, Number(rgb[1]))),
      Math.max(0, Math.min(255, Number(rgb[2]))),
      Math.max(0, Math.min(255, Number(rgb[3]))),
    ];
  }

  if (input === "black") return [0, 0, 0];
  if (input === "white") return [255, 255, 255];
  return null;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const channels = rgb.map(value => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(
  foreground: string | undefined,
  background: string,
): number | null {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return null;

  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function ensureReadableDarkText(
  style: CSSProperties,
  background: string,
  fallback: string,
): CSSProperties {
  const color = typeof style.color === "string" ? style.color : undefined;
  const ratio = contrastRatio(color, background);

  if (!color || (ratio != null && ratio < 4.5)) {
    return { ...style, color: fallback };
  }

  return style;
}

function WorkBody({
  html,
  blocks,
  mode,
  index,
  textStyle,
  editing,
  onStartEdit,
  onCommit,
  selectableProps,
  containerStyle,
}: {
  html: string;
  blocks: ReturnType<typeof projectResumeToWeb>["work"][number]["body"];
  mode: ResumeWebDetailsMode;
  index: number;
  textStyle: CSSProperties;
  editing: boolean;
  onStartEdit: () => void;
  onCommit: (html: string) => void;
  selectableProps: Record<string, string | undefined>;
  containerStyle: CSSProperties;
}) {
  const initialOpen =
    mode === "all" ||
    (mode === "first-two" && index < 2);
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    setOpen(
      mode === "all" ||
      (mode === "first-two" && index < 2),
    );
  }, [mode, index]);

  const hasContent = html.trim().length > 0 || blocks.length > 0;

  return (
    <div
      {...selectableProps}
      style={{
        position: "relative",
        marginTop: hasContent ? 8 : 5,
        minHeight: 20,
        ...containerStyle,
      }}
    >
      {(open || editing || !hasContent) && (
        <EditableRichText
          html={html}
          editing={editing}
          onStartEdit={onStartEdit}
          onCommit={onCommit}
          style={{
            maxWidth: 820,
            color: "var(--web-muted)",
            fontSize: 13,
            lineHeight: 1.55,
            ...textStyle,
          }}
        />
      )}

      {hasContent && mode !== "all" && !editing && (
        <button
          type="button"
          data-web-visitor-ui
          onClick={() => setOpen(value => !value)}
          style={{
            marginTop: open ? 7 : 4,
            border: 0,
            background: "transparent",
            padding: 0,
            color: "var(--web-muted)",
            cursor: "pointer",
            fontSize: 9.5,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {open ? "Hide details" : "Show details"}
        </button>
      )}
    </div>
  );
}

function BackgroundMotion({
  effect,
  speed,
  intensity,
  secondaryColor,
}: {
  effect: WebBackgroundEffect;
  speed: WebBackgroundSpeed;
  intensity: number;
  secondaryColor: string;
}) {
  const duration = backgroundDurationSeconds(speed);
  const opacity = Math.max(0, Math.min(1, intensity / 100));

  if (effect === "none" || effect === "gradient-drift" || effect === "grid-flow") {
    return null;
  }

  const common: CSSProperties = {
    position: "absolute",
    display: "block",
    pointerEvents: "none",
    opacity: .14 + opacity * .42,
    filter: "blur(44px)",
  };

  if (effect === "spotlight") {
    return (
      <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <i
          style={{
            ...common,
            width: "70%",
            aspectRatio: "1",
            left: "15%",
            top: "-38%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--web-accent) 56%, transparent), transparent 68%)",
            animation: `web-editor-spot ${duration}s ease-in-out infinite`,
          }}
        />
      </div>
    );
  }

  const aurora = effect === "aurora";
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {[0, 1, 2].map(index => (
        <i
          key={index}
          style={{
            ...common,
            width: aurora ? "62%" : index === 0 ? "38%" : index === 1 ? "31%" : "24%",
            height: aurora ? "15%" : undefined,
            aspectRatio: aurora ? undefined : "1",
            left: index === 0 ? "-8%" : index === 2 ? "38%" : undefined,
            right: index === 1 ? "-5%" : undefined,
            top: index === 0 ? "7%" : index === 1 ? "38%" : "70%",
            borderRadius: aurora ? "55% 45% 60% 40%" : "50%",
            background: index === 1 ? secondaryColor : "var(--web-accent)",
            animation: `web-editor-float ${duration}s ease-in-out infinite`,
            animationDelay:
              index === 1 ? `${-duration / 3}s` :
              index === 2 ? `${-(duration * 2) / 3}s` :
              undefined,
          }}
        />
      ))}
    </div>
  );
}

function MiniFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: "block",
      marginBottom: 4,
      color: "#71717a",
      fontSize: 9,
      fontWeight: 700,
    }}>
      {children}
    </span>
  );
}

const smallInput: CSSProperties = {
  width: "100%",
  height: 30,
  border: "1px solid #e4e4e7",
  borderRadius: 7,
  background: "#fff",
  padding: "0 7px",
  color: "#27272a",
  fontSize: 9.5,
  outline: "none",
};

const iconButton: CSSProperties = {
  height: 28,
  minWidth: 28,
  border: "1px solid transparent",
  borderRadius: 7,
  background: "transparent",
  color: "#52525b",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 800,
};

function LayoutInspector({
  selection,
  breakpoint,
  placement,
  onPatch,
  onLogoSizeChange,
  onReset,
}: {
  selection: EditorSelection;
  breakpoint: WebBreakpoint;
  placement: WebLayoutPlacement;
  onPatch: (patch: Partial<WebLayoutPlacement>) => void;
  onLogoSizeChange?: (sizePx: number) => void;
  onReset: () => void;
}) {
  const isSection = selection.target === "section" && !!selection.sectionId;
  const isCompanyLogo = selection.instanceId?.startsWith("work-logo:") ?? false;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ color: "#71717a", fontSize: 9, lineHeight: 1.45 }}>
        Drag the selected item on the canvas first. These values are precision controls for the
        <strong style={{ color: "#3f3f46" }}> {breakpoint}</strong> breakpoint.
      </div>

      <label>
        <MiniFieldLabel>Position</MiniFieldLabel>
        <select
          value={placement.mode ?? "flow"}
          onChange={event => onPatch({
            mode: event.target.value as WebLayoutPlacement["mode"],
          })}
          style={smallInput}
        >
          <option value="flow">Auto / responsive flow</option>
          <option value="floating">Free position</option>
        </select>
      </label>

      {isSection && (
        <div>
          <MiniFieldLabel>Responsive section width</MiniFieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4 }}>
            {([12, 8, 6, 4] as const).map(span => (
              <button
                key={span}
                type="button"
                onClick={() => onPatch({ span })}
                style={{
                  ...iconButton,
                  borderColor: (placement.span ?? 12) === span ? "#c4b5fd" : "#e4e4e7",
                  background: (placement.span ?? 12) === span ? "#f5f3ff" : "#fff",
                  color: (placement.span ?? 12) === span ? "#6d28d9" : "#52525b",
                  fontSize: 8.5,
                }}
              >
                {span === 12 ? "Full" : span === 8 ? "2/3" : span === 6 ? "1/2" : "1/3"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: isSection ? "1fr" : "1fr 1fr",
        gap: 8,
      }}>
        {!isSection && (
          <label>
            <MiniFieldLabel>{isCompanyLogo ? "Size (px)" : "Width %"}</MiniFieldLabel>
            <input
              type="number"
              min={isCompanyLogo ? 12 : 1}
              max={isCompanyLogo ? 160 : 100}
              value={
                isCompanyLogo
                  ? Math.round(placement.widthPx ?? 30)
                  : Math.round(placement.widthPct ?? 100)
              }
              onChange={event => {
                const value = Number(event.target.value) || (isCompanyLogo ? 30 : 100);
                if (isCompanyLogo && onLogoSizeChange) {
                  onLogoSizeChange(
                    Math.max(12, Math.min(160, value)),
                  );
                  return;
                }

                onPatch({
                  widthPct: Math.max(1, Math.min(100, value)),
                });
              }}
              style={smallInput}
            />
          </label>
        )}

        <label>
          <MiniFieldLabel>Align</MiniFieldLabel>
          <select
            value={placement.align ?? "stretch"}
            onChange={event => onPatch({
              align: event.target.value as WebLayoutPlacement["align"],
            })}
            style={smallInput}
          >
            <option value="stretch">Stretch</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          <MiniFieldLabel>X offset</MiniFieldLabel>
          <input
            type="number"
            value={Math.round(placement.offsetX ?? 0)}
            onChange={event => onPatch({ offsetX: Number(event.target.value) || 0 })}
            style={smallInput}
          />
        </label>
        <label>
          <MiniFieldLabel>Y offset</MiniFieldLabel>
          <input
            type="number"
            value={Math.round(placement.offsetY ?? 0)}
            onChange={event => onPatch({ offsetY: Number(event.target.value) || 0 })}
            style={smallInput}
          />
        </label>
      </div>

      <label style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        padding: "7px 8px",
      }}>
        <span>
          <span style={{ display: "block", fontSize: 9, fontWeight: 750 }}>
            Hide on {breakpoint}
          </span>
          <span style={{ display: "block", marginTop: 2, color: "#71717a", fontSize: 8 }}>
            Smaller breakpoints inherit until you override them.
          </span>
        </span>
        <input
          type="checkbox"
          checked={!!placement.hidden}
          onChange={event => onPatch({ hidden: event.target.checked })}
        />
      </label>

      <button
        type="button"
        onClick={onReset}
        style={{
          height: 30,
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          background: "#fafafa",
          color: "#52525b",
          cursor: "pointer",
          fontSize: 9,
          fontWeight: 750,
        }}
      >
        Reset {breakpoint} layout
      </button>
    </div>
  );
}

function StyleInspector({
  boxStyle,
  onPatch,
}: {
  boxStyle: ReturnType<typeof getWebBoxStyle>;
  onPatch: (patch: Parameters<typeof updateWebBoxStyle>[2]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ color: "#71717a", fontSize: 9, lineHeight: 1.45 }}>
        Web surface styling is optional. The default canvas is deliberately neutral.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          <MiniFieldLabel>Background</MiniFieldLabel>
          <input
            type="color"
            value={
              boxStyle.backgroundColor && /^#[0-9a-f]{6}$/i.test(boxStyle.backgroundColor)
                ? boxStyle.backgroundColor
                : "#ffffff"
            }
            onChange={event => onPatch({ backgroundColor: event.target.value })}
            style={{ ...smallInput, padding: 3 }}
          />
        </label>

        <label>
          <MiniFieldLabel>Border</MiniFieldLabel>
          <input
            type="color"
            value={
              boxStyle.borderColor && /^#[0-9a-f]{6}$/i.test(boxStyle.borderColor)
                ? boxStyle.borderColor
                : "#e4e4e7"
            }
            onChange={event => onPatch({ borderColor: event.target.value })}
            style={{ ...smallInput, padding: 3 }}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          <MiniFieldLabel>Border width</MiniFieldLabel>
          <input
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={boxStyle.borderWidth ?? 0}
            onChange={event => onPatch({
              borderWidth: Math.max(0, Math.min(12, Number(event.target.value) || 0)),
            })}
            style={smallInput}
          />
        </label>

        <label>
          <MiniFieldLabel>Radius</MiniFieldLabel>
          <input
            type="number"
            min={0}
            max={100}
            value={boxStyle.borderRadius ?? 0}
            onChange={event => onPatch({
              borderRadius: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
            })}
            style={smallInput}
          />
        </label>
      </div>

      <label>
        <MiniFieldLabel>Shadow</MiniFieldLabel>
        <select
          value={boxStyle.shadow ?? "none"}
          onChange={event => onPatch({
            shadow: event.target.value as typeof boxStyle.shadow,
          })}
          style={smallInput}
        >
          <option value="none">None</option>
          <option value="soft">Soft</option>
          <option value="medium">Medium</option>
          <option value="strong">Strong</option>
          <option value="glow">Accent glow</option>
        </select>
      </label>

      <label>
        <MiniFieldLabel>
          Opacity · {Math.round((boxStyle.opacity ?? 1) * 100)}%
        </MiniFieldLabel>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={boxStyle.opacity ?? 1}
          onChange={event => onPatch({ opacity: Number(event.target.value) })}
          style={{ width: "100%", accentColor: "#6d28d9" }}
        />
      </label>
    </div>
  );
}

function AnimationInspector({
  spec,
  onPatch,
  onPreset,
  onReplay,
}: {
  spec: WebMotionSpec;
  onPatch: (patch: Partial<WebMotionSpec>) => void;
  onPreset: (preset: WebAnimationPreset) => void;
  onReplay: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
        {([
          ["polished", "Polish"],
          ["editorial", "Editorial"],
          ["bold", "Bold"],
          ["playful", "Playful"],
          ["none", "None"],
        ] as Array<[WebAnimationPreset, string]>).map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => onPreset(preset)}
            style={{
              height: 28,
              border: "1px solid #e4e4e7",
              borderRadius: 7,
              background: "#fff",
              color: "#52525b",
              cursor: "pointer",
              fontSize: 7.5,
              fontWeight: 750,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          <MiniFieldLabel>Effect</MiniFieldLabel>
          <select
            value={spec.effect}
            onChange={event => onPatch({ effect: event.target.value as WebMotionEffect })}
            style={smallInput}
          >
            {MOTION_EFFECTS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label>
          <MiniFieldLabel>Speed</MiniFieldLabel>
          <select
            value={spec.speed}
            onChange={event => onPatch({ speed: event.target.value as WebMotionSpeed })}
            style={smallInput}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>

        <label>
          <MiniFieldLabel>Delay (ms)</MiniFieldLabel>
          <input
            type="number"
            min={0}
            max={4000}
            step={25}
            value={spec.delayMs}
            onChange={event => onPatch({
              delayMs: Math.max(0, Math.min(4000, Number(event.target.value) || 0)),
            })}
            style={smallInput}
          />
        </label>

        <label>
          <MiniFieldLabel>Stagger (ms)</MiniFieldLabel>
          <input
            type="number"
            min={0}
            max={1000}
            step={10}
            value={spec.staggerMs}
            onChange={event => onPatch({
              staggerMs: Math.max(0, Math.min(1000, Number(event.target.value) || 0)),
            })}
            style={smallInput}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onReplay}
        style={{
          height: 30,
          border: "1px solid #ddd6fe",
          borderRadius: 8,
          background: "#faf5ff",
          color: "#6d28d9",
          cursor: "pointer",
          fontSize: 9,
          fontWeight: 800,
        }}
      >
        ↻ Replay
      </button>
    </div>
  );
}

function BackgroundInspector({
  studio,
  backgroundStyle,
  theme,
  onThemeChange,
  onStudioPatch,
  onBackgroundStylePatch,
  onPreset,
  onReplay,
}: {
  studio: ReturnType<typeof getWebAnimationStudio>;
  backgroundStyle: ReturnType<typeof getWebBoxStyle>;
  theme: ResumeWebTheme;
  onThemeChange: (theme: ResumeWebTheme) => void;
  onStudioPatch: (patch: Partial<ReturnType<typeof getWebAnimationStudio>>) => void;
  onBackgroundStylePatch: (patch: Parameters<typeof updateWebBoxStyle>[2]) => void;
  onPreset: (preset: WebAnimationPreset) => void;
  onReplay: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label>
        <MiniFieldLabel>Published theme</MiniFieldLabel>
        <select
          value={theme}
          onChange={event => onThemeChange(event.target.value as ResumeWebTheme)}
          style={smallInput}
        >
          <option value="auto">Follow visitor device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label>
        <MiniFieldLabel>Page colour</MiniFieldLabel>
        <input
          type="color"
          value={
            backgroundStyle.backgroundColor &&
            /^#[0-9a-f]{6}$/i.test(backgroundStyle.backgroundColor)
              ? backgroundStyle.backgroundColor
              : "#ffffff"
          }
          onChange={event => onBackgroundStylePatch({ backgroundColor: event.target.value })}
          style={{ ...smallInput, padding: 3 }}
        />
      </label>

      <label>
        <MiniFieldLabel>Animated background</MiniFieldLabel>
        <select
          value={studio.background.effect}
          onChange={event => onStudioPatch({
            background: {
              ...studio.background,
              effect: event.target.value as WebBackgroundEffect,
            },
          })}
          style={smallInput}
        >
          <option value="none">None</option>
          <option value="gradient-drift">Gradient drift</option>
          <option value="aurora">Aurora</option>
          <option value="floating-orbs">Floating orbs</option>
          <option value="grid-flow">Moving grid</option>
          <option value="spotlight">Moving spotlight</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          <MiniFieldLabel>Speed</MiniFieldLabel>
          <select
            value={studio.background.speed}
            onChange={event => onStudioPatch({
              background: {
                ...studio.background,
                speed: event.target.value as WebBackgroundSpeed,
              },
            })}
            style={smallInput}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>

        <label>
          <MiniFieldLabel>Second colour</MiniFieldLabel>
          <input
            type="color"
            value={
              /^#[0-9a-f]{6}$/i.test(studio.background.secondaryColor)
                ? studio.background.secondaryColor
                : "#7c3aed"
            }
            onChange={event => onStudioPatch({
              background: {
                ...studio.background,
                secondaryColor: event.target.value,
              },
            })}
            style={{ ...smallInput, padding: 3 }}
          />
        </label>
      </div>

      <label>
        <MiniFieldLabel>
          Intensity · {Math.round(studio.background.intensity)}%
        </MiniFieldLabel>
        <input
          type="range"
          min={0}
          max={100}
          value={studio.background.intensity}
          onChange={event => onStudioPatch({
            background: {
              ...studio.background,
              intensity: Number(event.target.value),
            },
          })}
          style={{ width: "100%", accentColor: "#6d28d9" }}
        />
      </label>

      <label>
        <MiniFieldLabel>Card hover</MiniFieldLabel>
        <select
          value={studio.hoverEffect}
          onChange={event => onStudioPatch({
            hoverEffect: event.target.value as WebHoverEffect,
          })}
          style={smallInput}
        >
          <option value="none">None</option>
          <option value="lift">Lift</option>
          <option value="glow">Glow</option>
          <option value="tilt">Tilt</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
        {([
          ["polished", "Polish"],
          ["editorial", "Editorial"],
          ["bold", "Bold"],
          ["playful", "Playful"],
          ["none", "None"],
        ] as Array<[WebAnimationPreset, string]>).map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => onPreset(preset)}
            style={{
              height: 28,
              border: "1px solid #e4e4e7",
              borderRadius: 7,
              background: "#fff",
              color: "#52525b",
              cursor: "pointer",
              fontSize: 7.5,
              fontWeight: 750,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onReplay}
        style={{
          height: 30,
          border: "1px solid #ddd6fe",
          borderRadius: 8,
          background: "#faf5ff",
          color: "#6d28d9",
          cursor: "pointer",
          fontSize: 9,
          fontWeight: 800,
        }}
      >
        ↻ Replay
      </button>
    </div>
  );
}

function SelectionToolbar({
  selection,
  rect,
  viewportWidth,
  viewportScrollLeft,
  viewportScrollTop,
  parentGroupLabel,
  role,
  textStyle,
  linked,
  logoSameTypeLink,
  logoCrossFormatLink,
  rotationCrossFormatLink,
  activeTab,
  onActiveTab,
  onTextPatch,
  onToggleLink,
  onSelectParent,
  onClear,
}: {
  selection: EditorSelection;
  rect: EditorRect;
  viewportWidth: number;
  viewportScrollLeft: number;
  viewportScrollTop: number;
  parentGroupLabel?: string | null;
  role: ResumeVisualRole | null;
  textStyle: ResumeTextStylePatch | null;
  linked: boolean;
  logoSameTypeLink?: {
    linked: boolean;
    count: number;
    onToggle: () => void;
  };
  logoCrossFormatLink?: {
    linked: boolean;
    onToggle: () => void;
  };
  rotationCrossFormatLink?: {
    linked: boolean;
    onToggle: () => void;
  };
  activeTab: InspectorTab | null;
  onActiveTab: (tab: InspectorTab | null) => void;
  onTextPatch: (patch: ResumeTextStylePatch) => void;
  onToggleLink: () => void;
  onSelectParent?: () => void;
  onClear: () => void;
}) {
  const traits = fontTraits(textStyle?.fontFamily);
  const estimatedWidth =
    role ? 560 : rotationCrossFormatLink ? 420 : 300;
  const minLeft = viewportScrollLeft + 8;
  const maxLeft = Math.max(
    minLeft,
    viewportScrollLeft + viewportWidth - estimatedWidth - 8,
  );
  const left = Math.max(minLeft, Math.min(rect.left, maxLeft));
  const aboveTop = rect.top - 62;
  const top =
    aboveTop >= viewportScrollTop + 8
      ? aboveTop
      : rect.top + rect.height + 12;

  return (
    <div
      data-web-selection-ui
      style={{
        position: "absolute",
        top,
        left,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: 3,
        minHeight: 34,
        maxWidth: "calc(100% - 20px)",
        padding: "3px 4px",
        border: "1px solid #e4e4e7",
        borderRadius: 9,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(15,23,42,.13)",
        color: "#27272a",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        maxWidth: parentGroupLabel ? 170 : 115,
      }}>
        {parentGroupLabel && onSelectParent && (
          <>
            <button
              type="button"
              onClick={onSelectParent}
              title={`Select ${parentGroupLabel}`}
              style={{
                border: 0,
                background: "transparent",
                padding: "0 4px 0 6px",
                color: "#6d28d9",
                cursor: "pointer",
                fontSize: 8.5,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {parentGroupLabel}
            </button>
            <span style={{ color: "#c4b5fd", fontSize: 10 }}>›</span>
          </>
        )}
        <span style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          padding: "0 6px",
          color: "#71717a",
          fontSize: 9,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}>
          {selection.label}
        </span>
      </div>

      {logoSameTypeLink && (
        <>
          <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />
          <button
            type="button"
            onClick={logoSameTypeLink.onToggle}
            title={
              logoSameTypeLink.linked
                ? `All ${logoSameTypeLink.count} company logos share size on Web. Click for an individual logo.`
                : "This logo has its own Web size. Click to match all company logos."
            }
            style={{
              ...iconButton,
              width: "auto",
              minWidth: 0,
              padding: "0 7px",
              borderColor: logoSameTypeLink.linked ? "#fde68a" : "#e4e4e7",
              background: logoSameTypeLink.linked ? "#fffbeb" : "#fff",
              color: logoSameTypeLink.linked ? "#a16207" : "#71717a",
              fontSize: 8.5,
              whiteSpace: "nowrap",
            }}
          >
            {logoSameTypeLink.linked
              ? `⛓ All logos · ${logoSameTypeLink.count}`
              : "Individual logo"}
          </button>
        </>
      )}

      {logoCrossFormatLink && (
        <>
          <button
            type="button"
            onClick={logoCrossFormatLink.onToggle}
            title={
              logoCrossFormatLink.linked
                ? "Logo size is synchronized between Designed PDF and Web. Position remains layout-specific."
                : "Web and PDF logo sizes are independent. Click to synchronize them."
            }
            style={{
              ...iconButton,
              width: "auto",
              minWidth: 0,
              padding: "0 7px",
              borderColor: logoCrossFormatLink.linked ? "#ddd6fe" : "#e4e4e7",
              background: logoCrossFormatLink.linked ? "#f5f3ff" : "#fff",
              color: logoCrossFormatLink.linked ? "#6d28d9" : "#71717a",
              fontSize: 8.5,
              whiteSpace: "nowrap",
            }}
          >
            {logoCrossFormatLink.linked
              ? "⇄ PDF + Web"
              : "Web only"}
          </button>
          <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />
        </>
      )}

      {rotationCrossFormatLink && (
        <>
          <button
            type="button"
            onClick={rotationCrossFormatLink.onToggle}
            title={
              rotationCrossFormatLink.linked
                ? "Rotation is synchronized between Designed PDF and Web. Click to give Web its own rotation."
                : "Web rotation is independent from Designed PDF. Click to synchronize rotation again."
            }
            style={{
              ...iconButton,
              width: "auto",
              minWidth: 0,
              padding: "0 7px",
              borderColor: rotationCrossFormatLink.linked
                ? "#ddd6fe"
                : "#e4e4e7",
              background: rotationCrossFormatLink.linked
                ? "#f5f3ff"
                : "#fff",
              color: rotationCrossFormatLink.linked
                ? "#6d28d9"
                : "#71717a",
              fontSize: 8.5,
              whiteSpace: "nowrap",
            }}
          >
            {rotationCrossFormatLink.linked
              ? "↻ PDF + Web"
              : "↻ Web only"}
          </button>
          <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />
        </>
      )}

      {role && textStyle && (
        <>
          <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />

          <select
            value={traits.family === "Times" ? "Times-Roman" : traits.family === "Courier" ? "Courier" : "Helvetica"}
            onChange={event => onTextPatch({
              fontFamily: fontVariant(textStyle.fontFamily, {
                family:
                  event.target.value.startsWith("Times") ? "Times" :
                  event.target.value.startsWith("Courier") ? "Courier" :
                  "Helvetica",
              }),
            })}
            title="Font family"
            style={{
              height: 27,
              maxWidth: 98,
              border: "none",
              background: "transparent",
              color: "#27272a",
              fontSize: 9,
              outline: "none",
            }}
          >
            {FONT_FAMILIES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <input
            type="number"
            min={7}
            max={72}
            step={0.5}
            value={textStyle.fontSize ?? 12}
            onChange={event => onTextPatch({
              fontSize: Math.max(7, Math.min(72, Number(event.target.value) || 12)),
            })}
            title="Font size"
            style={{
              width: 43,
              height: 26,
              border: "1px solid #ececf0",
              borderRadius: 6,
              padding: "0 4px",
              fontSize: 9,
              textAlign: "center",
              outline: "none",
            }}
          />

          <button
            type="button"
            onClick={() => onTextPatch({
              fontFamily: fontVariant(textStyle.fontFamily, { bold: !traits.bold }),
            })}
            style={{
              ...iconButton,
              background: traits.bold ? "#f3e8ff" : "transparent",
              color: traits.bold ? "#6d28d9" : "#52525b",
            }}
            title="Bold"
          >
            B
          </button>

          <button
            type="button"
            onClick={() => onTextPatch({
              fontFamily: fontVariant(textStyle.fontFamily, { italic: !traits.italic }),
            })}
            style={{
              ...iconButton,
              fontStyle: "italic",
              background: traits.italic ? "#f3e8ff" : "transparent",
              color: traits.italic ? "#6d28d9" : "#52525b",
            }}
            title="Italic"
          >
            I
          </button>

          <input
            type="color"
            value={
              textStyle.color && /^#[0-9a-f]{6}$/i.test(textStyle.color)
                ? textStyle.color
                : "#18181b"
            }
            onChange={event => onTextPatch({ color: event.target.value })}
            title="Text color"
            style={{
              width: 28,
              height: 25,
              border: "none",
              background: "transparent",
              padding: 2,
              cursor: "pointer",
            }}
          />

          {(["left", "center", "right"] as const).map(align => (
            <button
              key={align}
              type="button"
              onClick={() => onTextPatch({ textAlign: align })}
              title={`Align ${align}`}
              style={{
                ...iconButton,
                minWidth: 25,
                background: (textStyle.textAlign ?? "left") === align
                  ? "#f3e8ff"
                  : "transparent",
                color: (textStyle.textAlign ?? "left") === align
                  ? "#6d28d9"
                  : "#52525b",
                fontSize: 9,
              }}
            >
              <span style={{
                display: "inline-block",
                width: align === "center" ? 12 : 13,
                textAlign: align,
                letterSpacing: "-2px",
              }}>
                ≡
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={onToggleLink}
            title={
              linked
                ? "Typography is linked between Designed PDF and Web. Click to create a Web override."
                : "Web typography is overridden. Click to relink it to the Designed PDF."
            }
            style={{
              ...iconButton,
              minWidth: 31,
              background: linked ? "#f3e8ff" : "#fff7ed",
              color: linked ? "#6d28d9" : "#c2410c",
              borderColor: linked ? "#ddd6fe" : "#fed7aa",
            }}
          >
            {linked ? "🔗" : "⛓"}
          </button>
        </>
      )}

      <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />

      {(["layout", "style", "animate"] as InspectorTab[]).map(tab => (
        <button
          type="button"
          key={tab}
          onClick={() => onActiveTab(activeTab === tab ? null : tab)}
          style={{
            ...iconButton,
            minWidth: 46,
            padding: "0 6px",
            background: activeTab === tab ? "#f5f3ff" : "transparent",
            color: activeTab === tab ? "#6d28d9" : "#52525b",
            fontSize: 8.5,
            textTransform: "capitalize",
          }}
        >
          {tab === "animate" ? "✦ Motion" : tab}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onActiveTab(activeTab === "more" ? null : "more")}
        style={{
          ...iconButton,
          background: activeTab === "more" ? "#f5f3ff" : "transparent",
          color: activeTab === "more" ? "#6d28d9" : "#52525b",
        }}
        title="More"
      >
        ⋯
      </button>

      <button
        type="button"
        onClick={onClear}
        style={{ ...iconButton, minWidth: 25, color: "#a1a1aa" }}
        title="Clear selection"
      >
        ×
      </button>
    </div>
  );
}

function InspectorPopover({
  rect,
  viewportWidth,
  viewportScrollLeft,
  children,
}: {
  rect: EditorRect;
  viewportWidth: number;
  viewportScrollLeft: number;
  children: ReactNode;
}) {
  return (
    <div
      data-web-selection-ui
      style={{
        position: "absolute",
        top: Math.max(48, rect.top + 4),
        left: Math.max(
          viewportScrollLeft + 8,
          Math.min(
            rect.left,
            viewportScrollLeft + Math.max(8, viewportWidth - 308),
          ),
        ),
        zIndex: 290,
        width: 300,
        maxWidth: "calc(100% - 20px)",
        maxHeight: 410,
        overflowY: "auto",
        border: "1px solid #e4e4e7",
        borderRadius: 11,
        background: "#fff",
        padding: 11,
        boxShadow: "0 16px 40px rgba(15,23,42,.15)",
        color: "#27272a",
      }}
    >
      {children}
    </div>
  );
}

function SelectionOverlay({
  rect,
  canResize,
  onResizePointerDown,
}: {
  rect: EditorRect;
  canResize: boolean;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    horizontal: "left" | "right",
    vertical: "top" | "bottom",
  ) => void;
}) {
  const handles = [
    ["left", "top"],
    ["right", "top"],
    ["left", "bottom"],
    ["right", "bottom"],
  ] as const;

  return (
    <div
      data-web-selection-ui
      style={{
        position: "absolute",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        zIndex: 250,
        border: "1.5px solid #7c3aed",
        borderRadius: 3,
        pointerEvents: "none",
        boxSizing: "border-box",
        rotate: rect.rotation ? `${rect.rotation}deg` : undefined,
        transformOrigin: "center center",
        overflow: "visible",
      }}
    >
      {canResize && handles.map(([horizontal, vertical]) => (
        <button
          key={`${horizontal}-${vertical}`}
          type="button"
          aria-label={`Resize ${horizontal} ${vertical}`}
          onPointerDown={event => onResizePointerDown(event, horizontal, vertical)}
          style={{
            position: "absolute",
            width: 9,
            height: 9,
            border: "1px solid #7c3aed",
            borderRadius: 2,
            background: "#fff",
            padding: 0,
            pointerEvents: "auto",
            cursor:
              (horizontal === "left" && vertical === "top") ||
              (horizontal === "right" && vertical === "bottom")
                ? "nwse-resize"
                : "nesw-resize",
            left: horizontal === "left" ? -5 : undefined,
            right: horizontal === "right" ? -5 : undefined,
            top: vertical === "top" ? -5 : undefined,
            bottom: vertical === "bottom" ? -5 : undefined,
          }}
        />
      ))}
    </div>
  );
}

function WebRotationHandle({
  rect,
  onPointerDown,
}: {
  rect: EditorRect;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}) {
  const angle = (rect.rotation ?? 0) * Math.PI / 180;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Match the PDF handle: its center sits 7px outside the local top edge,
  // then that point rotates around the selected element's center.
  const radius = rect.height / 2 + 7;
  const left = centerX + Math.sin(angle) * radius;
  const top = centerY - Math.cos(angle) * radius;

  return (
    <div
      data-web-selection-ui
      data-web-rotation-handle
      role="button"
      aria-label="Rotate selected element"
      title="Drag to rotate"
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        top,
        left,
        width: 14,
        height: 14,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background: "#7c3aed",
        border: "2px solid white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        boxSizing: "border-box",
        cursor: "crosshair",
        zIndex: 360,
        userSelect: "none",
        touchAction: "none",
      }}
    />
  );
}

function neutralHoverStyle(
  effect: WebHoverEffect,
  element: HTMLElement,
  entering: boolean,
) {
  if (!entering) {
    element.style.transform = "";
    element.style.boxShadow = "";
    element.style.outline = "";
    return;
  }

  if (effect === "lift") {
    element.style.transform = "translateY(-3px)";
    element.style.boxShadow = "0 10px 24px rgba(15,23,42,.10)";
  } else if (effect === "glow") {
    element.style.outline = "2px solid var(--web-accent-soft)";
    element.style.boxShadow = "0 8px 22px rgba(15,23,42,.08)";
  } else if (effect === "tilt") {
    element.style.transform = "translateY(-2px) rotate(-.5deg)";
    element.style.boxShadow = "0 10px 24px rgba(15,23,42,.10)";
  }
}

export default function ResumeWebPreview({
  data,
  onDesignChange,
  onDataChange,
}: {
  data: ResumeData;
  onDesignChange?: (design: ResumeDesign) => void;
  onDataChange?: (data: ResumeData) => void;
}) {
  const settings = useMemo(() => getResumeWebSettings(data.design), [data.design]);
  const sharedProjects = useMemo(() => getResumeProjects(data), [data]);
  const studio = useMemo(() => getWebAnimationStudio(data.design), [data.design]);

  const [breakpoint, setBreakpoint] = useState<WebBreakpoint>("desktop");
  const [runtimeTheme, setRuntimeTheme] = useState<"light" | "dark">(
    settings.theme === "dark" ? "dark" : "light",
  );
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [selectionRect, setSelectionRect] = useState<EditorRect | null>(null);
  const [parentGroupRect, setParentGroupRect] = useState<EditorRect | null>(null);
  const [parentGroupLabel, setParentGroupLabel] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null);
  const [dropGuide, setDropGuide] = useState<DropGuide | null>(null);
  const [motionReplay, setMotionReplay] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollRatio, setScrollRatio] = useState(0);
  const [activeSection, setActiveSection] = useState<WebSectionId | null>(null);
  const [renderedArtboardWidth, setRenderedArtboardWidth] = useState(
    BREAKPOINT_WIDTH.desktop,
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const parentGroupElementRef = useRef<HTMLElement | null>(null);

  const clearSelection = () => {
    selectedElementRef.current = null;
    parentGroupElementRef.current = null;
    setSelection(null);
    setSelectionRect(null);
    setParentGroupRect(null);
    setParentGroupLabel(null);
    setInspectorTab(null);
    setDropGuide(null);
    setEditingKey(null);
  };

  const projection = useMemo(
    () => projectResumeToWeb(data, runtimeTheme),
    [data, runtimeTheme],
  );

  useEffect(() => {
    const artboard = artboardRef.current;
    if (!artboard) return;

    const updateWidth = () => {
      setRenderedArtboardWidth(artboard.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(artboard);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [breakpoint]);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!selection) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest("[data-web-selection-ui]")) return;

      const viewport = viewportRef.current;
      if (!viewport || !viewport.contains(target)) {
        clearSelection();
      }
    };

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    };
  }, [selection]);

  useEffect(() => {
    if (settings.theme === "light" || settings.theme === "dark") {
      setRuntimeTheme(settings.theme);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      setRuntimeTheme(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      );
    }
  }, [settings.theme]);

  const activeSections = useMemo(() => {
    const ids: WebSectionId[] = [];
    if (settings.videoIntro.enabled) ids.push("video");
    if (projection.summary) ids.push("about");
    if (projection.work.length) ids.push("experience");
    if (sharedProjects.some(project =>
      [project.title, project.description, project.techStack, project.githubUrl, project.liveUrl, project.imageUrl]
        .some(value => {
          try {
            return String(value ?? "").trim().length > 0;
          } catch {
            return false;
          }
        })
    )) ids.push("projects");
    if (projection.education.length) ids.push("education");
    if (projection.skills.length) ids.push("skills");
    if (settings.featuredLinks.some(link => normalizeWebUrl(link.url))) {
      ids.push("featured");
    }
    if (projection.links.length) ids.push("links");

    const order = getWebSectionOrder(data.design);
    return order.filter(id => ids.includes(id));
  }, [
    data.design,
    projection.summary,
    projection.work.length,
    projection.education.length,
    projection.skills.length,
    projection.links.length,
    settings.videoIntro.enabled,
    sharedProjects,
    settings.featuredLinks,
  ]);

  const selectedWorkLogoEntryId =
    selection?.instanceId?.startsWith("work-logo:")
      ? selection.instanceId.slice("work-logo:".length)
      : null;

  const selectedWorkLogoEntry =
    selectedWorkLogoEntryId
      ? (data.workEntries ?? []).find(entry => entry.id === selectedWorkLogoEntryId)
      : undefined;

  const workEntryIds = (data.workEntries ?? []).map(entry => entry.id);

  const selectedLogoSameTypeLinked =
    selectedWorkLogoEntryId
      ? isWebCompanyLogoGroupLinked(
          data.design,
          selectedWorkLogoEntryId,
        )
      : false;

  const companyLogoCrossFormatLinked =
    isCompanyLogoCrossFormatLinked(data.design);

  const roleForSelection = selection?.role ?? (
    selection ? TARGET_ROLE[selection.target] ?? null : null
  );

  const selectedTextStyle = roleForSelection
    ? getEffectiveWebTextStyle(data.design, roleForSelection)
    : null;

  const textLinked = roleForSelection
    ? isWebTextLinked(data.design, roleForSelection)
    : true;

  const selectedStyleInstanceId =
    selection?.instanceId ??
    (
      selection?.target === "section" && selection.sectionId
        ? `section:${selection.sectionId}`
        : undefined
    );

  const selectedBoxStyle =
    selection && selection.target !== "background"
      ? getEffectiveWebBoxStyle(
          data.design,
          selection.target as WebElementTarget,
          selectedStyleInstanceId,
        )
      : getWebBoxStyle(data.design, "background");

  const placementForSelection = (
    current: EditorSelection | null,
  ): WebLayoutPlacement => {
    if (!current) return {};
    if (current.instanceId) {
      return getWebInstancePlacement(data.design, breakpoint, current.instanceId);
    }
    if (current.target === "section" && current.sectionId) {
      return getWebSectionPlacement(data.design, breakpoint, current.sectionId);
    }
    if (current.target === "background") return {};
    return getWebElementPlacement(
      data.design,
      breakpoint,
      current.target as WebElementTarget,
    );
  };

  const selectionPlacement = (): WebLayoutPlacement =>
    placementForSelection(selection);

  const selectedRotationSyncTarget: ResumeRotationSyncTarget | null =
    selection
      ? getWebRotationSyncTarget({
          sectionId: selection.sectionId,
          instanceId: selection.instanceId,
          sectionRoot: selection.target === "section",
        })
      : null;

  const selectedRotationCrossFormatLinked =
    selectedRotationSyncTarget
      ? isWebRotationCrossFormatLinked(
          data.design,
          selectedRotationSyncTarget.syncKey,
        )
      : false;

  const updateSelectionRect = (rotationOverride?: number) => {
    const viewport = viewportRef.current;
    const element = selectedElementRef.current;
    if (!viewport || !element || !selection) {
      setSelectionRect(null);
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const placementRotation =
      rotationOverride ?? placementForSelection(selection).rotation ?? 0;

    // getBoundingClientRect() becomes an axis-aligned bounding box after rotation.
    // Build the editor outline from the element's unrotated layout dimensions and
    // then rotate the outline by the same persisted angle.
    const rawWidth = Math.max(1, element.offsetWidth || rect.width);
    const rawHeight = Math.max(1, element.offsetHeight || rect.height);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setSelectionRect({
      top: centerY - rawHeight / 2 - viewportRect.top + viewport.scrollTop,
      left: centerX - rawWidth / 2 - viewportRect.left + viewport.scrollLeft,
      width: rawWidth,
      height: rawHeight,
      rotation: placementRotation,
    });

    const parent = parentGroupElementRef.current;
    if (parent && parent !== element) {
      const groupRect = parent.getBoundingClientRect();
      setParentGroupRect({
        top: groupRect.top - viewportRect.top + viewport.scrollTop,
        left: groupRect.left - viewportRect.left + viewport.scrollLeft,
        width: groupRect.width,
        height: groupRect.height,
      });
    } else {
      setParentGroupRect(null);
    }
  };

  useLayoutEffect(() => {
    updateSelectionRect();
  }, [
    selection?.target,
    selection?.sectionId,
    selection?.instanceId,
    breakpoint,
    data.design,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const element = selectedElementRef.current;
    if (!viewport || !element || !selection) return;

    const refreshSelectionRect = () => updateSelectionRect();
    const observer = new ResizeObserver(refreshSelectionRect);
    observer.observe(element);
    viewport.addEventListener("scroll", refreshSelectionRect, { passive: true });
    window.addEventListener("resize", refreshSelectionRect);

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", refreshSelectionRect);
      window.removeEventListener("resize", refreshSelectionRect);
    };
  }, [selection]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const max = Math.max(1, viewport.scrollHeight - viewport.clientHeight);
      setScrollRatio(Math.max(0, Math.min(1, viewport.scrollTop / max)));

      const viewportRect = viewport.getBoundingClientRect();
      const candidates = activeSections
        .map(sectionId => {
          const element = artboardRef.current?.querySelector<HTMLElement>(
            `[data-web-section-id="${sectionId}"][data-web-section-container]`,
          );
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            sectionId,
            distance: Math.abs(rect.top - (viewportRect.top + 120)),
          };
        })
        .filter(Boolean) as Array<{ sectionId: WebSectionId; distance: number }>;

      if (candidates.length) {
        candidates.sort((a, b) => a.distance - b.distance);
        setActiveSection(candidates[0].sectionId);
      }
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [activeSections.join("|")]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!selection || editingKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }

      if (!onDesignChange || selection.target === "background") return;
      event.preventDefault();

      const amount = event.shiftKey ? 10 : 1;
      const placement = selectionPlacement();
      const patch: Partial<WebLayoutPlacement> = {
        mode: "floating",
        offsetX: placement.offsetX ?? 0,
        offsetY: placement.offsetY ?? 0,
      };

      if (event.key === "ArrowLeft") patch.offsetX = (patch.offsetX ?? 0) - amount;
      if (event.key === "ArrowRight") patch.offsetX = (patch.offsetX ?? 0) + amount;
      if (event.key === "ArrowUp") patch.offsetY = (patch.offsetY ?? 0) - amount;
      if (event.key === "ArrowDown") patch.offsetY = (patch.offsetY ?? 0) + amount;

      patchPlacement(selection, patch);
    };

    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [selection, breakpoint, data.design, editingKey, onDesignChange]);

  useEffect(() => {
    const root = artboardRef.current;
    if (!root) return;

    const key = `${motionReplay}:${JSON.stringify(studio.targets)}:${JSON.stringify(studio.instances)}`;

    Array.from(root.querySelectorAll<HTMLElement>("[data-web-motion]")).forEach(
      element => {
        const target = element.dataset.webMotion as WebAnimationTarget;
        const instanceId = element.dataset.webInstanceId;
        playMotion(
          [element],
          effectiveWebMotionSpec(studio, target, instanceId),
          `${key}:${target}:${instanceId ?? "group"}`,
        );
      },
    );
  }, [studio.targets, motionReplay, breakpoint]);

  const backgroundStyle = getWebBoxStyle(data.design, "background");
  const bgColor =
    backgroundStyle.backgroundColor ||
    (runtimeTheme === "dark" ? "#0b0b0d" : "#ffffff");

  const backgroundIntensity = Math.max(
    0,
    Math.min(1, studio.background.intensity / 100),
  );

  const animatedBackground =
    studio.background.effect === "gradient-drift"
      ? `linear-gradient(120deg, ${bgColor}, color-mix(in srgb, var(--web-accent) ${Math.round(backgroundIntensity * 22)}%, ${bgColor}), color-mix(in srgb, ${studio.background.secondaryColor} ${Math.round(backgroundIntensity * 20)}%, ${bgColor}), ${bgColor})`
      : studio.background.effect === "grid-flow"
        ? `linear-gradient(color-mix(in srgb, var(--web-accent) ${Math.round(backgroundIntensity * 17)}%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--web-accent) ${Math.round(backgroundIntensity * 17)}%, transparent) 1px, transparent 1px)`
        : bgColor;

  const artboardStyle: CSSProperties = {
    "--web-page": projection.palette.page,
    "--web-canvas": projection.palette.canvas,
    "--web-ink": runtimeTheme === "dark" ? "#f4f4f5" : "#18181b",
    "--web-muted": runtimeTheme === "dark" ? "#d4d4d8" : "#71717a",
    "--web-accent": projection.palette.accent,
    "--web-accent-soft": projection.palette.accentSoft,
    "--web-accent-text": runtimeTheme === "dark" ? "#ffffff" : projection.palette.accent,
    "--web-border": runtimeTheme === "dark" ? "#303036" : "#e4e4e7",
    position: "relative",
    width: BREAKPOINT_WIDTH[breakpoint],
    maxWidth: "100%",
    minHeight: breakpoint === "mobile" ? 760 : 860,
    margin: "0 auto",
    padding: breakpoint === "mobile" ? "32px 24px 72px" : "44px 48px 88px",
    background: animatedBackground,
    backgroundSize:
      studio.background.effect === "gradient-drift"
        ? "320% 320%"
        : studio.background.effect === "grid-flow"
          ? "32px 32px"
          : undefined,
    animation:
      studio.background.effect === "gradient-drift"
        ? `web-editor-gradient ${backgroundDurationSeconds(studio.background.speed)}s ease-in-out infinite`
        : studio.background.effect === "grid-flow"
          ? `web-editor-grid ${backgroundDurationSeconds(studio.background.speed)}s linear infinite`
          : undefined,
    color: "var(--web-ink)",
    fontFamily: "Arial, Helvetica, sans-serif",
    boxSizing: "border-box",
    transition: "width .18s ease, background .18s ease",
  } as CSSProperties;

  function patchText(patch: ResumeTextStylePatch) {
    if (!onDesignChange || !roleForSelection) return;
    onDesignChange(
      applyWebEditorTextStylePatch(
        data.design,
        roleForSelection,
        patch,
      ),
    );
  }

  function patchBox(
    target: WebElementTarget,
    patch: Parameters<typeof updateWebBoxStyle>[2],
    instanceId?: string,
  ) {
    if (!onDesignChange) return;
    onDesignChange(
      instanceId
        ? updateWebInstanceBoxStyle(data.design, instanceId, patch)
        : updateWebBoxStyle(data.design, target, patch),
    );
  }

  function patchPlacement(
    current: EditorSelection,
    patch: Partial<WebLayoutPlacement>,
  ) {
    if (!onDesignChange) return;

    if (current.instanceId) {
      onDesignChange(
        updateWebInstancePlacement(
          data.design,
          breakpoint,
          current.instanceId,
          patch,
        ),
      );
      return;
    }

    if (current.target === "section" && current.sectionId) {
      onDesignChange(
        updateWebSectionPlacement(
          data.design,
          breakpoint,
          current.sectionId,
          patch,
        ),
      );
      return;
    }

    if (current.target === "background") return;

    onDesignChange(
      updateWebElementPlacement(
        data.design,
        breakpoint,
        current.target as WebElementTarget,
        patch,
      ),
    );
  }

  function resetPlacement(current: EditorSelection) {
    if (!onDesignChange) return;

    if (current.instanceId) {
      onDesignChange(
        clearWebInstancePlacement(
          data.design,
          breakpoint,
          current.instanceId,
        ),
      );
      return;
    }

    if (current.target === "section" && current.sectionId) {
      onDesignChange(
        clearWebPlacementOverride(
          data.design,
          breakpoint,
          "sections",
          current.sectionId,
        ),
      );
      return;
    }

    if (current.target === "background") return;

    onDesignChange(
      clearWebPlacementOverride(
        data.design,
        breakpoint,
        "elements",
        current.target,
      ),
    );
  }

  function patchMotion(patch: Partial<WebMotionSpec>) {
    if (!onDesignChange || !selection || selection.target === "background") return;

    const target = selection.target as WebAnimationTarget;
    onDesignChange(
      selection.instanceId
        ? updateWebInstanceAnimation(
            data.design,
            selection.instanceId,
            target,
            patch,
          )
        : updateWebAnimationTarget(
            data.design,
            target,
            patch,
          ),
    );
    setMotionReplay(value => value + 1);
  }

  function patchStudio(
    patch: Partial<ReturnType<typeof getWebAnimationStudio>>,
  ) {
    if (!onDesignChange) return;
    onDesignChange(
      withWebAnimationStudio(data.design, {
        ...studio,
        ...patch,
        background: patch.background
          ? { ...studio.background, ...patch.background }
          : studio.background,
        targets: patch.targets
          ? { ...studio.targets, ...patch.targets }
          : studio.targets,
      }),
    );
    setMotionReplay(value => value + 1);
  }

  function applyPreset(preset: WebAnimationPreset) {
    if (!onDesignChange) return;
    onDesignChange(applyWebAnimationPreset(data.design, preset));
    setMotionReplay(value => value + 1);
  }

  function selectionFromElement(element: HTMLElement): EditorSelection {
    const target = element.dataset.webTarget as EditorTarget;
    const sectionId = element.dataset.webSectionId as WebSectionId | undefined;
    const instanceId = element.dataset.webInstanceId || undefined;
    const role = element.dataset.webRole as ResumeVisualRole | undefined;
    return {
      target,
      sectionId,
      instanceId,
      role,
      label:
        element.dataset.webLabel ||
        (target === "section" && sectionId
          ? `${sectionId.charAt(0).toUpperCase()}${sectionId.slice(1)} section`
          : TARGET_LABEL[target]),
    };
  }

  function selectElement(element: HTMLElement) {
    selectedElementRef.current = element;

    const group =
      element.parentElement?.closest<HTMLElement>("[data-web-group-root]") ?? null;

    parentGroupElementRef.current = group;
    setParentGroupLabel(group?.dataset.webLabel ?? null);
    setSelection(selectionFromElement(element));
    setInspectorTab(null);
    requestAnimationFrame(() => updateSelectionRect());
  }

  function selectParentGroup() {
    const group = parentGroupElementRef.current;
    if (!group) return;
    selectElement(group);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("[data-web-selection-ui]")) return;

    if (target.closest("[data-web-visitor-ui]")) {
      clearSelection();
      return;
    }

    if (target.closest("[data-web-editor-ui]")) return;
    if (editingKey) return;
    const selectable = target.closest<HTMLElement>("[data-web-selectable]");

    if (!selectable || !artboardRef.current?.contains(selectable)) {
      selectedElementRef.current = null;
      setSelection({
        target: "background",
        label: "Background",
      });
      setSelectionRect(null);
      setInspectorTab("style");
      return;
    }

    const next = selectionFromElement(selectable);
    const same =
      selection?.target === next.target &&
      selection?.sectionId === next.sectionId &&
      selection?.instanceId === next.instanceId &&
      selectedElementRef.current === selectable;

    const interactive = target.closest(
      "button,a,input,select,textarea,[contenteditable='true']",
    );

    if (!same) {
      selectElement(selectable);
      if (!interactive) beginDirectDrag(event, selectable, next);
      return;
    }

    if (interactive) return;
    beginDirectDrag(event, selectable, next);
  }

  function beginDirectDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    element: HTMLElement,
    current: EditorSelection,
  ) {
    if (!onDesignChange || current.target === "background") return;

    // Do not prevent the initial pointerdown: an unmoved second click must still
    // be able to become a double-click for inline text editing.
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const initialPlacement = placementForSelection(current);
    const baseX = initialPlacement.offsetX ?? 0;
    const baseY = initialPlacement.offsetY ?? 0;

    const originalTransform = element.style.transform;
    const originalTransition = element.style.transition;
    const originalZ = element.style.zIndex;
    element.style.transition = "none";
    element.style.zIndex = "60";

    let moved = false;
    let lastX = baseX;
    let lastY = baseY;
    let currentGuide: DropGuide | null = null;

    const pointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) {
        moved = true;
        element.getAnimations().forEach(animation => animation.cancel());
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      moveEvent.preventDefault();

      element.style.transform = `${originalTransform || ""} translate(${dx}px, ${dy}px)`;

      if (current.target === "section" && current.sectionId && (initialPlacement.mode ?? "flow") === "flow") {
        currentGuide = computeSectionDropGuide(
          current.sectionId,
          moveEvent.clientX,
          moveEvent.clientY,
        );
        setDropGuide(currentGuide);
      } else {
        lastX = Math.round(baseX + dx);
        lastY = Math.round(baseY + dy);
      }

      updateSelectionRect();
    };

    const pointerUp = () => {
      document.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("pointerup", pointerUp);
      element.style.transform = originalTransform;
      element.style.transition = originalTransition;
      element.style.zIndex = originalZ;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      if (!moved) return;

      if (
        current.target === "section" &&
        current.sectionId &&
        (initialPlacement.mode ?? "flow") === "flow" &&
        currentGuide
      ) {
        commitSectionDrop(current.sectionId, currentGuide);
      } else {
        patchPlacement(current, {
          mode: "floating",
          offsetX: lastX,
          offsetY: lastY,
        });
      }

      setDropGuide(null);
      requestAnimationFrame(() => updateSelectionRect());
    };

    document.addEventListener("pointermove", pointerMove);
    document.addEventListener("pointerup", pointerUp, { once: true });
  }

  function computeSectionDropGuide(
    sectionId: WebSectionId,
    clientX: number,
    clientY: number,
  ): DropGuide | null {
    const artboard = artboardRef.current;
    const viewport = viewportRef.current;
    if (!artboard || !viewport) return null;

    const all = Array.from(
      artboard.querySelectorAll<HTMLElement>("[data-web-section-container]"),
    ).filter(element => element.dataset.webSectionId !== sectionId);

    const artboardRect = artboard.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const relativeX = clientX - artboardRect.left;
    const horizontalIntent =
      relativeX < artboardRect.width * .36 ? "left" :
      relativeX > artboardRect.width * .64 ? "right" :
      "full";

    // Side-by-side intent: when the pointer is over the vertical body of another
    // section, show an actual left/right drop zone instead of a vague line.
    if (horizontalIntent !== "full" && all.length) {
      let closest: HTMLElement | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      all.forEach(element => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(clientY - (rect.top + rect.height / 2));
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = element;
        }
      });

      if (closest) {
        const rect = closest.getBoundingClientRect();
        const insideVerticalBand =
          clientY >= rect.top - Math.min(24, rect.height * .15) &&
          clientY <= rect.bottom + Math.min(24, rect.height * .15);

        if (insideVerticalBand) {
          const pairWith = closest.dataset.webSectionId as WebSectionId;
          const pairIndex = all.findIndex(element => element === closest);
          const zoneLeftBase =
            rect.left - viewportRect.left + viewport.scrollLeft;
          const zoneTop =
            rect.top - viewportRect.top + viewport.scrollTop;
          const half = rect.width / 2;

          return {
            top: zoneTop,
            left: zoneLeftBase,
            width: rect.width,
            sectionIndex:
              horizontalIntent === "left" ? pairIndex : pairIndex + 1,
            horizontalIntent,
            pairWith,
            zoneTop,
            zoneLeft:
              horizontalIntent === "left"
                ? zoneLeftBase
                : zoneLeftBase + half,
            zoneWidth: half,
            zoneHeight: rect.height,
          };
        }
      }
    }

    // Normal vertical reorder.
    let index = all.length;
    let guideY = artboardRect.bottom - viewportRect.top + viewport.scrollTop - 20;

    for (let i = 0; i < all.length; i++) {
      const rect = all[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = i;
        guideY = rect.top - viewportRect.top + viewport.scrollTop - 7;
        break;
      }
    }

    return {
      top: guideY,
      left: artboardRect.left - viewportRect.left + viewport.scrollLeft + 30,
      width: Math.max(120, artboardRect.width - 60),
      sectionIndex: index,
      horizontalIntent: "full",
    };
  }

  function commitSectionDrop(
    sectionId: WebSectionId,
    guide: DropGuide,
  ) {
    if (!onDesignChange) return;

    const order = activeSections.filter(id => id !== sectionId);

    let destination = Math.max(
      0,
      Math.min(order.length, guide.sectionIndex),
    );

    if (guide.pairWith) {
      const pairIndex = order.indexOf(guide.pairWith);
      if (pairIndex >= 0) {
        destination =
          guide.horizontalIntent === "left"
            ? pairIndex
            : pairIndex + 1;
      }
    }

    const nextOrder = [...order];
    nextOrder.splice(destination, 0, sectionId);

    let nextDesign = setWebSectionOrder(data.design, nextOrder);

    if (guide.pairWith && guide.horizontalIntent !== "full") {
      nextDesign = updateWebSectionPlacement(
        nextDesign,
        breakpoint,
        guide.pairWith,
        {
          mode: "flow",
          span: 6,
          align: "stretch",
          widthPct: 100,
          offsetX: 0,
          offsetY: 0,
        },
      );
      nextDesign = updateWebSectionPlacement(
        nextDesign,
        breakpoint,
        sectionId,
        {
          mode: "flow",
          span: 6,
          align: "stretch",
          widthPct: 100,
          offsetX: 0,
          offsetY: 0,
        },
      );
    } else {
      nextDesign = updateWebSectionPlacement(
        nextDesign,
        breakpoint,
        sectionId,
        {
          mode: "flow",
          span: 12,
          align: "stretch",
          widthPct: 100,
          offsetX: 0,
          offsetY: 0,
        },
      );
    }

    onDesignChange(nextDesign);
  }

  function beginRotate(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !selection ||
      !selectedElementRef.current ||
      !onDesignChange ||
      selection.target === "background"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = selectedElementRef.current;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startPlacement = placementForSelection(selection);
    const originalRotate = element.style.rotate;
    let rotation = startPlacement.rotation ?? 0;

    const move = (moveEvent: PointerEvent) => {
      rotation = snapWebRotation(
        Math.atan2(
          moveEvent.clientY - centerY,
          moveEvent.clientX - centerX,
        ) * 180 / Math.PI + 90,
      );

      element.style.rotate = rotation ? `${rotation}deg` : "";
      updateSelectionRect(rotation);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);

      element.style.rotate = originalRotate;

      const syncTarget = getWebRotationSyncTarget({
        sectionId: selection.sectionId,
        instanceId: selection.instanceId,
        sectionRoot: selection.target === "section",
      });

      if (syncTarget) {
        onDesignChange(
          updateWebRotationWithPdfSync(
            data.design,
            breakpoint,
            syncTarget,
            rotation,
          ),
        );
      } else {
        patchPlacement(selection, {
          rotation: rotation || undefined,
        });
      }

      requestAnimationFrame(() => updateSelectionRect());
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }

  function beginResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    horizontal: "left" | "right",
    vertical: "top" | "bottom",
  ) {
    if (!selection || !selectionRect || !selectedElementRef.current || !onDesignChange) {
      return;
    }
    if (selection.target === "background") return;

    event.preventDefault();
    event.stopPropagation();

    const element = selectedElementRef.current;
    const artboard = artboardRef.current;
    if (!artboard) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = element.getBoundingClientRect();
    const startWidth = selectionRect.width;
    const startHeight = selectionRect.height;
    const rotation = (selectionRect.rotation ?? 0) * Math.PI / 180;
    const artboardRect = artboard.getBoundingClientRect();

    const originalWidth = element.style.width;
    const originalHeight = element.style.height;
    const originalLeft = element.style.left;
    const originalTop = element.style.top;
    const originalPosition = element.style.position;

    element.style.position = "relative";

    let width = startWidth;
    let height = startHeight;
    let xDelta = 0;
    let yDelta = 0;

    const move = (moveEvent: PointerEvent) => {
      const screenDx = moveEvent.clientX - startX;
      const screenDy = moveEvent.clientY - startY;

      // Convert the pointer delta into the selected element's local coordinate
      // system so resize directions remain correct after rotation.
      const localDx =
        screenDx * Math.cos(rotation) + screenDy * Math.sin(rotation);
      const localDy =
        -screenDx * Math.sin(rotation) + screenDy * Math.cos(rotation);

      width = Math.max(
        40,
        horizontal === "right" ? startWidth + localDx : startWidth - localDx,
      );
      height = Math.max(
        24,
        vertical === "bottom" ? startHeight + localDy : startHeight - localDy,
      );

      xDelta = horizontal === "left" ? screenDx : 0;
      yDelta = vertical === "top" ? screenDy : 0;

      element.style.width = `${width}px`;
      element.style.left = `${xDelta}px`;

      const allowHeight =
        selection.target === "photo" ||
        selection.target === "video";
      if (allowHeight) {
        element.style.height = `${height}px`;
        element.style.top = `${yDelta}px`;
      }

      updateSelectionRect();
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);

      element.style.width = originalWidth;
      element.style.height = originalHeight;
      element.style.left = originalLeft;
      element.style.top = originalTop;
      element.style.position = originalPosition;

      const widthReference =
        selection.target === "section"
          ? artboardRect.width
          : element.parentElement?.getBoundingClientRect().width ?? artboardRect.width;

      const widthPct = Math.max(
        10,
        Math.min(100, (width / Math.max(1, widthReference)) * 100),
      );

      const patch: Partial<WebLayoutPlacement> = {};
      const isCompanyLogo =
        selection.instanceId?.startsWith("work-logo:") ?? false;

      if (selection.target === "section") {
        // Sections resize by responsive grid span. Keep width at 100% inside
        // that span so "half width" really means half of the artboard.
        patch.span =
          widthPct <= 38 ? 4 :
          widthPct <= 58 ? 6 :
          widthPct <= 76 ? 8 :
          12;
        patch.widthPct = 100;
      } else if (isCompanyLogo && selectedWorkLogoEntryId) {
        const size = Math.max(
          12,
          Math.min(160, Math.round(Math.max(width, height))),
        );
        onDesignChange(
          updateWebCompanyLogoSize(
            data.design,
            breakpoint,
            selectedWorkLogoEntryId,
            workEntryIds,
            size,
          ),
        );
        requestAnimationFrame(() => updateSelectionRect());
        return;
      } else {
        patch.widthPct = widthPct;
      }

      if (
        !isCompanyLogo &&
        (selection.target === "photo" || selection.target === "video")
      ) {
        patch.heightPx = Math.round(height);
      }

      patchPlacement(selection, patch);
      requestAnimationFrame(() => updateSelectionRect());
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }

  function elementPlacementStyle(
    target: WebElementTarget,
    instanceId?: string,
  ): CSSProperties {
    const placement = instanceId
      ? getWebInstancePlacement(data.design, breakpoint, instanceId)
      : getWebElementPlacement(data.design, breakpoint, target);
    return webPlacementToStyle(placement);
  }

  function sectionPlacementStyle(sectionId: WebSectionId): CSSProperties {
    const placement = getWebSectionPlacement(data.design, breakpoint, sectionId);
    return {
      ...webPlacementToStyle(placement, { section: true }),
      order: activeSections.indexOf(sectionId),
    };
  }

  function boxStyle(
    target: WebElementTarget,
    instanceId?: string,
  ): CSSProperties {
    return webBoxStyleToCss(
      getEffectiveWebBoxStyle(data.design, target, instanceId),
    );
  }

  const darkSurface = backgroundStyle.backgroundColor || "#111318";

  const darkSafe = (
    role: ResumeVisualRole,
    fallback: string,
  ): CSSProperties => {
    const style = webTextStyleToCss(getEffectiveWebTextStyle(data.design, role));
    return runtimeTheme === "dark"
      ? ensureReadableDarkText(style, darkSurface, fallback)
      : style;
  };

  const textCss = {
    name: darkSafe("name", "#fafafa"),
    contact: darkSafe("contact", "#d4d4d8"),
    sectionHeading: darkSafe("sectionHeading", "#ffffff"),
    entryTitle: darkSafe("entryTitle", "#fafafa"),
    entryOrg: darkSafe("entryOrg", "#d4d4d8"),
    entryDate: darkSafe("entryDate", "#d4d4d8"),
    entryBody: darkSafe("entryBody", "#e4e4e7"),
    summary: darkSafe("summary", "#e4e4e7"),
    skill: darkSafe("skill", "#f4f4f5"),
    link: darkSafe("link", "#f4f4f5"),
  };

  const baseSelectableStyle: CSSProperties = {
    position: "relative",
    transition: "outline-color .12s ease, box-shadow .12s ease",
  };

  function selectableAttrs(
    target: EditorTarget,
    label: string,
    options?: {
      sectionId?: WebSectionId;
      instanceId?: string;
      role?: ResumeVisualRole;
      motion?: WebAnimationTarget;
    },
  ) {
    return {
      "data-web-selectable": "true",
      "data-web-target": target,
      "data-web-label": label,
      "data-web-section-id": options?.sectionId,
      "data-web-instance-id": options?.instanceId,
      "data-web-style-instance":
        options?.instanceId ??
        (
          target === "section" && options?.sectionId
            ? `section:${options.sectionId}`
            : undefined
        ),
      "data-web-role": options?.role,
      "data-web-motion": options?.motion ?? (
        target !== "background" ? target : undefined
      ),
    } as Record<string, string | undefined>;
  }

  const canResizeSelection =
    !!selection &&
    selection.target !== "background" &&
    selection.target !== "contact";

  const compactVisitorHeader =
    breakpoint === "mobile" || renderedArtboardWidth < 520;

  const artboardHorizontalInset =
    breakpoint === "mobile" ? 24 : 48;

  function updateWorkEntry(
    id: string,
    patch: Partial<NonNullable<ResumeData["workEntries"]>[number]>,
  ) {
    if (!onDataChange) return;
    onDataChange({
      ...data,
      workEntries: (data.workEntries ?? []).map(entry =>
        entry.id === id ? { ...entry, ...patch } : entry
      ),
    });
  }

  function updateProjectEntry(
    id: string,
    patch: Partial<ResumeProjectEntry>,
  ) {
    if (!onDataChange) return;
    const nextProjects = getResumeProjects(data).map(project =>
      project.id === id ? { ...project, ...patch } : project
    );
    onDataChange(withResumeProjects(data, nextProjects));
  }

  function updateEducation(
    id: string,
    patch: Partial<NonNullable<ResumeData["education"]>[number]>,
  ) {
    if (!onDataChange) return;
    onDataChange({
      ...data,
      education: (data.education ?? []).map(entry =>
        entry.id === id ? { ...entry, ...patch } : entry
      ),
    });
  }

  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (...values: Array<string | undefined | null>): boolean => {
    if (!q) return true;
    return values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  };

  function jumpToSection(sectionId: WebSectionId) {
    const viewport = viewportRef.current;
    const element = artboardRef.current?.querySelector<HTMLElement>(
      `[data-web-section-id="${sectionId}"][data-web-section-container]`,
    );
    if (!viewport || !element) return;

    const viewportRect = viewport.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    viewport.scrollTo({
      top: viewport.scrollTop + rect.top - viewportRect.top - 56,
      behavior: "smooth",
    });
  }

  function renderVideo() {
    if (!settings.videoIntro.enabled) return null;
    const embed = resolveVideoEmbed(settings.videoIntro.url);
    const instanceId = "video:intro";
    const style = {
      ...baseSelectableStyle,
      ...elementPlacementStyle("video", instanceId),
      ...boxStyle("video", instanceId),
    } as CSSProperties;

    return (
      <section
        key="video"
        {...selectableAttrs("section", "Video section", {
          sectionId: "video",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 22,
          ...sectionPlacementStyle("video"),
          ...boxStyle("section", "section:video"),
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "var(--web-muted)", fontSize: 10, fontWeight: 700 }}>
            VIDEO
          </div>
          <h2
            {...selectableAttrs("sectionHeading", "Video heading", {
              sectionId: "video",
              instanceId: "heading:video",
              role: "sectionHeading",
              motion: "sectionHeading",
            })}
            style={{
              ...baseSelectableStyle,
              margin: "4px 0 0",
              fontSize: 24,
              lineHeight: 1.1,
              ...textCss.sectionHeading,
              ...elementPlacementStyle("sectionHeading", "heading:video"),
              ...boxStyle("sectionHeading", "heading:video"),
            }}
          >
            {settings.videoIntro.title || "Video introduction"}
          </h2>
        </div>

        <div
          {...selectableAttrs("sectionBody", "Video content", {
            sectionId: "video",
            instanceId: "body:video",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            ...elementPlacementStyle("sectionBody", "body:video"),
            ...boxStyle("sectionBody", "body:video"),
          }}
        >
          <div
            {...selectableAttrs("video", "Video", {
              sectionId: "video",
              instanceId,
              motion: "video",
            })}
            style={style}
          >
          {embed ? (
            embed.kind === "iframe" ? (
              <iframe
                src={embed.src}
                title={settings.videoIntro.title || "Video introduction"}
                allowFullScreen
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  border: 0,
                  background: "#000",
                }}
              />
            ) : (
              <video
                src={embed.src}
                controls
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: "#000",
                }}
              />
            )
          ) : (
            <div style={{
              display: "grid",
              minHeight: 180,
              placeItems: "center",
              border: "1px dashed var(--web-border)",
              color: "var(--web-muted)",
              fontSize: 11,
            }}>
              Add a YouTube, Vimeo, MP4 or WebM URL.
            </div>
          )}
          </div>
        </div>
      </section>
    );
  }

  function renderAbout() {
    if (!projection.summary) return null;
    return (
      <section
        key="about"
        {...selectableAttrs("section", "About section", {
          sectionId: "about",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 22,
          ...sectionPlacementStyle("about"),
          ...boxStyle("section", "section:about"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "About heading", {
            sectionId: "about",
            instanceId: "heading:about",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:about"),
            ...boxStyle("sectionHeading", "heading:about"),
          }}
        >
          About
        </h2>
        <div
          {...selectableAttrs("sectionBody", "About text", {
            sectionId: "about",
            instanceId: "body:about",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            marginTop: 10,
            maxWidth: 800,
            color: "var(--web-muted)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            ...textCss.summary,
            ...elementPlacementStyle("sectionBody", "body:about"),
            ...boxStyle("sectionBody", "body:about"),
          }}
        >
          <EditableText
            as="p"
            value={data.summary ?? ""}
            editing={editingKey === "summary"}
            onStartEdit={() => setEditingKey("summary")}
            onCommit={value => {
              setEditingKey(null);
              onDataChange?.({ ...data, summary: value });
            }}
            style={{ margin: 0 }}
          />
        </div>
      </section>
    );
  }

  function renderExperience() {
    if (!projection.work.length) return null;
    return (
      <section
        key="experience"
        {...selectableAttrs("section", "Experience section", {
          sectionId: "experience",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...sectionPlacementStyle("experience"),
          ...boxStyle("section", "section:experience"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "Experience heading", {
            sectionId: "experience",
            instanceId: "heading:experience",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:experience"),
            ...boxStyle("sectionHeading", "heading:experience"),
          }}
        >
          Experience
        </h2>

        <div
          {...selectableAttrs("sectionBody", "Experience content", {
            sectionId: "experience",
            instanceId: "body:experience",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            marginTop: 12,
            ...elementPlacementStyle("sectionBody", "body:experience"),
            ...boxStyle("sectionBody", "body:experience"),
          }}
        >
          {projection.work
            .filter(entry => matchesSearch(
              entry.title,
              entry.company,
              entry.dates,
              entry.body.map(block => block.text).join(" "),
            ))
            .map((entry, index) => {
            const instanceId = `work:${entry.id}`;
            const source = (data.workEntries ?? []).find(item => item.id === entry.id);
            return (
              <article
                key={entry.id}
                {...selectableAttrs("experience", `${entry.title || "Role"} · ${entry.company || "Company"}`, {
                  sectionId: "experience",
                  instanceId,
                  role: "entryTitle",
                  motion: "experience",
                })}
                data-web-group-root
                style={{
                  ...baseSelectableStyle,
                  padding: "14px 0",
                  borderTop: index === 0 ? "none" : "1px solid var(--web-border)",
                  ...elementPlacementStyle("experience", instanceId),
                  ...boxStyle("experience", instanceId),
                }}
              >
                <div style={{
                  display: "grid",
                  gridTemplateColumns: breakpoint === "mobile" ? "1fr" : "minmax(0,1fr) auto",
                  gap: 8,
                  alignItems: "start",
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: data.design.showCompanyLogos && entry.company ? 10 : 0,
                    minWidth: 0,
                  }}>
                    {data.design.showCompanyLogos && entry.company && (() => {
                      const logoInstanceId = `work-logo:${entry.id}`;
                      const logoPlacement = getWebInstancePlacement(
                        data.design,
                        breakpoint,
                        logoInstanceId,
                      );
                      const effectiveLogoSize =
                        getEffectiveWebCompanyLogoSize(
                          data.design,
                          breakpoint,
                          entry.id,
                          workEntryIds,
                        );

                      return (
                        <div
                          {...selectableAttrs("photo", "Company logo", {
                            sectionId: "experience",
                            instanceId: logoInstanceId,
                            motion: "photo",
                          })}
                          style={{
                            ...baseSelectableStyle,
                            width: effectiveLogoSize,
                            height: effectiveLogoSize,
                            flex: "0 0 auto",
                            borderRadius: 5,
                            ...elementPlacementStyle("photo", logoInstanceId),
                            ...boxStyle("photo", logoInstanceId),
                          }}
                        >
                          <WebCompanyLogo
                            company={entry.company}
                            logoUrl={source?.logoUrl}
                          />
                        </div>
                      );
                    })()}

                    <div style={{ minWidth: 0 }}>
                    <EditableText
                      as="h3"
                      value={entry.title || "Role"}
                      editing={editingKey === `work-title:${entry.id}`}
                      onStartEdit={() => setEditingKey(`work-title:${entry.id}`)}
                      onCommit={value => {
                        setEditingKey(null);
                        updateWorkEntry(entry.id, { title: value });
                      }}
                      style={{
                        margin: 0,
                        fontSize: 15,
                        lineHeight: 1.35,
                        ...textCss.entryTitle,
                      }}
                    />

                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                      marginTop: 2,
                      color: "var(--web-muted)",
                      fontSize: 11.5,
                      ...textCss.entryOrg,
                    }}>
                      <EditableText
                        value={entry.company || "Company"}
                        editing={editingKey === `work-company:${entry.id}`}
                        onStartEdit={() => setEditingKey(`work-company:${entry.id}`)}
                        onCommit={value => {
                          setEditingKey(null);
                          updateWorkEntry(entry.id, { company: value });
                        }}
                      />
                      {entry.dates && <span>·</span>}
                      {entry.dates && (
                        <span style={textCss.entryDate}>{entry.dates}</span>
                      )}
                    </div>
                    </div>
                  </div>
                </div>

                <WorkBody
                  html={source?.body ?? ""}
                  blocks={entry.body}
                  mode={settings.detailsMode}
                  index={index}
                  textStyle={textCss.entryBody}
                  editing={editingKey === `work-body:${entry.id}`}
                  onStartEdit={() => setEditingKey(`work-body:${entry.id}`)}
                  onCommit={html => {
                    setEditingKey(null);
                    updateWorkEntry(entry.id, { body: html });
                  }}
                  selectableProps={selectableAttrs("sectionBody", "Description", {
                    sectionId: "experience",
                    instanceId: `work-body:${entry.id}`,
                    role: "entryBody",
                    motion: "sectionBody",
                  })}
                  containerStyle={{
                    ...baseSelectableStyle,
                    ...elementPlacementStyle("sectionBody", `work-body:${entry.id}`),
                    ...boxStyle("sectionBody", `work-body:${entry.id}`),
                  }}
                />
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderProjects() {
    // Keep this renderer intentionally self-contained. Projects are persisted
    // shared content, but older saved Web presentation state can be malformed.
    // A project card must never be able to take down the entire Web preview.
    const asText = (value: unknown): string => {
      if (value == null) return "";
      try {
        return typeof value === "string" ? value : String(value);
      } catch {
        return "";
      }
    };

    const safeUrl = (value: unknown): string | null => {
      const raw = asText(value).trim();
      if (!raw) return null;
      if (/^https?:\/\//i.test(raw)) return raw;
      if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
        return `https://${raw}`;
      }
      return null;
    };

    const safeImageUrl = (value: unknown): string | null => {
      const url = safeUrl(value);
      return url && /^https?:\/\//i.test(url) ? url : null;
    };

    const safeSectionPlacement = (): CSSProperties => {
      try {
        return sectionPlacementStyle("projects");
      } catch {
        return {};
      }
    };

    const safeElementPlacement = (
      target: WebElementTarget,
      instanceId: string,
    ): CSSProperties => {
      try {
        return elementPlacementStyle(target, instanceId);
      } catch {
        return {};
      }
    };

    const safeBox = (
      target: WebElementTarget,
      instanceId: string,
    ): CSSProperties => {
      try {
        return boxStyle(target, instanceId);
      } catch {
        return {};
      }
    };

    const projects = (Array.isArray(sharedProjects) ? sharedProjects : [])
      .map((rawProject, index) => ({
        id: asText(rawProject?.id).trim() || `project-${index}`,
        title: asText(rawProject?.title),
        description: asText(rawProject?.description),
        techStack: asText(rawProject?.techStack),
        githubUrl: asText(rawProject?.githubUrl),
        liveUrl: asText(rawProject?.liveUrl),
        imageUrl: asText(rawProject?.imageUrl),
      }))
      .filter(project =>
        Boolean(
          project.title.trim() ||
          project.description.trim() ||
          project.techStack.trim() ||
          project.githubUrl.trim() ||
          project.liveUrl.trim() ||
          project.imageUrl.trim()
        )
      )
      .filter(project => {
        if (!q) return true;
        return [
          project.title,
          project.description,
          project.techStack,
          project.githubUrl,
          project.liveUrl,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });

    if (!projects.length) return null;

    return (
      <section
        key="projects"
        data-web-selectable="true"
        data-web-target="section"
        data-web-label="Projects section"
        data-web-section-id="projects"
        data-web-style-instance="section:projects"
        data-web-motion="section"
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...safeSectionPlacement(),
          ...safeBox("section", "section:projects"),
        }}
      >
        <h2
          data-web-selectable="true"
          data-web-target="sectionHeading"
          data-web-label="Projects heading"
          data-web-section-id="projects"
          data-web-instance-id="heading:projects"
          data-web-style-instance="heading:projects"
          data-web-role="sectionHeading"
          data-web-motion="sectionHeading"
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...safeElementPlacement("sectionHeading", "heading:projects"),
            ...safeBox("sectionHeading", "heading:projects"),
          }}
        >
          Projects
        </h2>

        <div
          data-web-selectable="true"
          data-web-target="sectionBody"
          data-web-label="Projects content"
          data-web-section-id="projects"
          data-web-instance-id="body:projects"
          data-web-style-instance="body:projects"
          data-web-role="entryBody"
          data-web-motion="sectionBody"
          style={{
            ...baseSelectableStyle,
            display: "grid",
            gridTemplateColumns:
              breakpoint === "mobile"
                ? "1fr"
                : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginTop: 14,
            ...safeElementPlacement("sectionBody", "body:projects"),
            ...safeBox("sectionBody", "body:projects"),
          }}
        >
          {projects.map((project, index) => {
            const instanceId = `project:${project.id}`;
            const image = safeImageUrl(project.imageUrl);
            const github = safeUrl(project.githubUrl);
            const live = safeUrl(project.liveUrl);
            const stackTags = project.techStack
              .split(/[,;|\n]+/)
              .map(item => item.trim())
              .filter(Boolean);

            const titleKey = `project-title:${project.id}`;
            const descriptionKey = `project-description:${project.id}`;
            const techKey = `project-tech:${project.id}`;

            return (
              <article
                key={`${project.id}-${index}`}
                data-web-selectable="true"
                data-web-target="projects"
                data-web-label={project.title || `Project ${index + 1}`}
                data-web-section-id="projects"
                data-web-instance-id={instanceId}
                data-web-style-instance={instanceId}
                data-web-role="entryTitle"
                data-web-motion="projects"
                data-web-group-root
                onMouseEnter={event =>
                  neutralHoverStyle(studio.hoverEffect, event.currentTarget, true)
                }
                onMouseLeave={event =>
                  neutralHoverStyle(studio.hoverEffect, event.currentTarget, false)
                }
                style={{
                  ...baseSelectableStyle,
                  minWidth: 0,
                  ...safeElementPlacement("projects", instanceId),
                  ...safeBox("projects", instanceId),
                }}
              >
                {image && (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    style={{
                      display: "block",
                      width: "100%",
                      aspectRatio: "16 / 9",
                      objectFit: "cover",
                      marginBottom: 10,
                    }}
                  />
                )}

                <div
                  data-web-selectable="true"
                  data-web-target="projects"
                  data-web-label="Project title"
                  data-web-section-id="projects"
                  data-web-instance-id={titleKey}
                  data-web-style-instance={titleKey}
                  data-web-role="entryTitle"
                  data-web-motion="projects"
                  onDoubleClick={event => {
                    event.stopPropagation();
                    setEditingKey(titleKey);
                  }}
                  style={{
                    ...baseSelectableStyle,
                    ...safeElementPlacement("projects", titleKey),
                  }}
                >
                  {editingKey === titleKey ? (
                    <input
                      autoFocus
                      defaultValue={project.title}
                      placeholder="Project"
                      onBlur={event => {
                        updateProjectEntry(project.id, {
                          title: event.currentTarget.value,
                        });
                        setEditingKey(null);
                      }}
                      onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === "Enter" || event.key === "Escape") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      style={{
                        width: "100%",
                        border: 0,
                        outline: "1px solid var(--web-border)",
                        borderRadius: 3,
                        background: "transparent",
                        padding: "1px 2px",
                        margin: 0,
                        font: "inherit",
                        fontSize: 15,
                        ...textCss.entryTitle,
                      }}
                    />
                  ) : (
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 15,
                        ...textCss.entryTitle,
                      }}
                    >
                      {project.title || "Project"}
                    </h3>
                  )}
                </div>

                <div
                  data-web-selectable="true"
                  data-web-target="sectionBody"
                  data-web-label="Project description"
                  data-web-section-id="projects"
                  data-web-instance-id={descriptionKey}
                  data-web-style-instance={descriptionKey}
                  data-web-role="entryBody"
                  data-web-motion="sectionBody"
                  onDoubleClick={event => {
                    event.stopPropagation();
                    setEditingKey(descriptionKey);
                  }}
                  style={{
                    ...baseSelectableStyle,
                    marginTop: 6,
                    ...safeElementPlacement("sectionBody", descriptionKey),
                    ...safeBox("sectionBody", descriptionKey),
                  }}
                >
                  {editingKey === descriptionKey ? (
                    <textarea
                      autoFocus
                      defaultValue={project.description}
                      rows={4}
                      placeholder="Describe this project"
                      onBlur={event => {
                        updateProjectEntry(project.id, {
                          description: event.currentTarget.value,
                        });
                        setEditingKey(null);
                      }}
                      onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      style={{
                        width: "100%",
                        minHeight: 70,
                        resize: "vertical",
                        border: 0,
                        outline: "1px solid var(--web-border)",
                        borderRadius: 3,
                        background: "transparent",
                        padding: 2,
                        color: "var(--web-muted)",
                        font: "inherit",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        ...textCss.entryBody,
                      }}
                    />
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        color: "var(--web-muted)",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        opacity: project.description ? 1 : .48,
                        ...textCss.entryBody,
                      }}
                    >
                      {project.description || "Double-click to add project description"}
                    </p>
                  )}
                </div>

                <div
                  data-web-selectable="true"
                  data-web-target="skills"
                  data-web-label="Project tech stack"
                  data-web-section-id="projects"
                  data-web-instance-id={techKey}
                  data-web-style-instance={techKey}
                  data-web-role="skill"
                  data-web-motion="skills"
                  onDoubleClick={event => {
                    event.stopPropagation();
                    setEditingKey(techKey);
                  }}
                  style={{
                    ...baseSelectableStyle,
                    marginTop: 9,
                    ...safeElementPlacement("skills", techKey),
                    ...safeBox("skills", techKey),
                  }}
                >
                  {editingKey === techKey ? (
                    <input
                      autoFocus
                      defaultValue={project.techStack}
                      placeholder="React, TypeScript, PostgreSQL"
                      onBlur={event => {
                        updateProjectEntry(project.id, {
                          techStack: event.currentTarget.value,
                        });
                        setEditingKey(null);
                      }}
                      onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === "Enter" || event.key === "Escape") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      style={{
                        width: "100%",
                        minHeight: 24,
                        border: 0,
                        outline: "1px solid var(--web-border)",
                        borderRadius: 3,
                        background: "transparent",
                        padding: "2px 3px",
                        color: "var(--web-ink)",
                        font: "inherit",
                        fontSize: 10.5,
                        ...textCss.skill,
                      }}
                    />
                  ) : stackTags.length ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {stackTags.map((tag, tagIndex) => (
                        <span
                          key={`${project.id}-tech-${tagIndex}-${tag}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: 22,
                            padding: "2px 7px",
                            border: "1px solid var(--web-border)",
                            borderRadius: 4,
                            background:
                              runtimeTheme === "dark"
                                ? "rgba(255,255,255,.065)"
                                : "rgba(15,23,42,.045)",
                            color: "var(--web-ink)",
                            fontSize: 10,
                            fontWeight: 650,
                            lineHeight: 1.25,
                            ...textCss.skill,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        minHeight: 22,
                        color: "var(--web-muted)",
                        fontSize: 10.5,
                        fontStyle: "italic",
                        opacity: .45,
                      }}
                    >
                      Double-click to add tech stack
                    </div>
                  )}
                </div>

                {(github || live) && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      marginTop: 9,
                      fontSize: 11,
                      ...textCss.link,
                    }}
                  >
                    {github && (
                      <a href={github} target="_blank" rel="noreferrer">
                        GitHub ↗
                      </a>
                    )}
                    {live && (
                      <a href={live} target="_blank" rel="noreferrer">
                        Live ↗
                      </a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderEducation() {
    if (!projection.education.length) return null;

    return (
      <section
        key="education"
        {...selectableAttrs("section", "Education section", {
          sectionId: "education",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...sectionPlacementStyle("education"),
          ...boxStyle("section", "section:education"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "Education heading", {
            sectionId: "education",
            instanceId: "heading:education",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:education"),
            ...boxStyle("sectionHeading", "heading:education"),
          }}
        >
          Education
        </h2>

        <div
          {...selectableAttrs("sectionBody", "Education content", {
            sectionId: "education",
            instanceId: "body:education",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            marginTop: 12,
            ...elementPlacementStyle("sectionBody", "body:education"),
            ...boxStyle("sectionBody", "body:education"),
          }}
        >
          {projection.education
            .filter(entry => matchesSearch(
              entry.school,
              entry.credential,
              entry.years,
            ))
            .map((entry, index) => {
            const instanceId = `education:${entry.id}`;
            return (
              <article
                key={entry.id}
                {...selectableAttrs("education", entry.school || `Education ${index + 1}`, {
                  sectionId: "education",
                  instanceId,
                  role: "entryTitle",
                  motion: "education",
                })}
                style={{
                  ...baseSelectableStyle,
                  padding: "12px 0",
                  borderTop: index === 0 ? "none" : "1px solid var(--web-border)",
                  ...elementPlacementStyle("education", instanceId),
                  ...boxStyle("education", instanceId),
                }}
              >
                <EditableText
                  as="h3"
                  value={entry.school || "School"}
                  editing={editingKey === `edu-school:${entry.id}`}
                  onStartEdit={() => setEditingKey(`edu-school:${entry.id}`)}
                  onCommit={value => {
                    setEditingKey(null);
                    updateEducation(entry.id, { school: value });
                  }}
                  style={{
                    margin: 0,
                    fontSize: 15,
                    ...textCss.entryTitle,
                  }}
                />
                {entry.credential && (
                  <div style={{
                    marginTop: 3,
                    color: "var(--web-muted)",
                    fontSize: 12.5,
                    ...textCss.entryOrg,
                  }}>
                    {entry.credential}
                  </div>
                )}
                {entry.years && (
                  <div style={{
                    marginTop: 2,
                    color: "var(--web-muted)",
                    fontSize: 11,
                    ...textCss.entryDate,
                  }}>
                    {entry.years}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderSkills() {
    if (!projection.skills.length) return null;

    return (
      <section
        key="skills"
        {...selectableAttrs("section", "Skills section", {
          sectionId: "skills",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...sectionPlacementStyle("skills"),
          ...boxStyle("section", "section:skills"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "Skills heading", {
            sectionId: "skills",
            instanceId: "heading:skills",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:skills"),
            ...boxStyle("sectionHeading", "heading:skills"),
          }}
        >
          Skills
        </h2>

        <div
          {...selectableAttrs("sectionBody", "Skills content", {
            sectionId: "skills",
            instanceId: "body:skills",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            display: "flex",
            flexWrap: "wrap",
            gap: "7px 14px",
            marginTop: 10,
            ...elementPlacementStyle("sectionBody", "body:skills"),
            ...boxStyle("sectionBody", "body:skills"),
          }}
        >
          {projection.skills
            .filter(skill => matchesSearch(skill))
            .map((skill, index) => {
            const instanceId = `skill:${index}`;
            return (
              <span
                key={`${skill}-${index}`}
                {...selectableAttrs("skills", skill, {
                  sectionId: "skills",
                  instanceId,
                  role: "skill",
                  motion: "skills",
                })}
                style={{
                  ...baseSelectableStyle,
                  color: "var(--web-ink)",
                  fontSize: 12,
                  ...textCss.skill,
                  ...elementPlacementStyle("skills", instanceId),
                  ...boxStyle("skills", instanceId),
                }}
              >
                {skill}
              </span>
            );
          })}
        </div>
      </section>
    );
  }

  function renderFeatured() {
    const links = settings.featuredLinks
      .map(link => ({ ...link, normalized: normalizeWebUrl(link.url) }))
      .filter(link => !!link.normalized)
      .filter(link => matchesSearch(link.label, link.description, link.url));

    if (!links.length) return null;

    return (
      <section
        key="featured"
        {...selectableAttrs("section", "Featured links section", {
          sectionId: "featured",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...sectionPlacementStyle("featured"),
          ...boxStyle("section", "section:featured"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "Featured links heading", {
            sectionId: "featured",
            instanceId: "heading:featured",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:featured"),
            ...boxStyle("sectionHeading", "heading:featured"),
          }}
        >
          Featured links
        </h2>

        <div
          {...selectableAttrs("sectionBody", "Featured links content", {
            sectionId: "featured",
            instanceId: "body:featured",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            display: "grid",
            gap: 8,
            marginTop: 10,
            fontSize: 12,
            ...textCss.link,
            ...elementPlacementStyle("sectionBody", "body:featured"),
            ...boxStyle("sectionBody", "body:featured"),
          }}
        >
          {links.map(link => (
            <a
              key={link.id}
              {...selectableAttrs("links", link.label || "Featured link", {
                sectionId: "featured",
                instanceId: `link:${link.id}`,
                role: "link",
                motion: "links",
              })}
              href={link.normalized!}
              target="_blank"
              rel="noreferrer"
              style={{
                ...baseSelectableStyle,
                ...elementPlacementStyle("links", `link:${link.id}`),
                ...boxStyle("links", `link:${link.id}`),
              }}
            >
              {link.label || "Link"}{link.description ? ` — ${link.description}` : ""} ↗
            </a>
          ))}
        </div>
      </section>
    );
  }

  function renderLinks() {
    if (!projection.links.length) return null;

    return (
      <section
        key="links"
        {...selectableAttrs("section", "Links section", {
          sectionId: "links",
          motion: "section",
        })}
        data-web-section-container
        data-web-group-root
        style={{
          ...baseSelectableStyle,
          gridColumn: "span 12",
          marginTop: 24,
          ...sectionPlacementStyle("links"),
          ...boxStyle("section", "section:links"),
        }}
      >
        <h2
          {...selectableAttrs("sectionHeading", "Links heading", {
            sectionId: "links",
            instanceId: "heading:links",
            role: "sectionHeading",
            motion: "sectionHeading",
          })}
          style={{
            ...baseSelectableStyle,
            margin: 0,
            fontSize: 24,
            lineHeight: 1.1,
            ...textCss.sectionHeading,
            ...elementPlacementStyle("sectionHeading", "heading:links"),
            ...boxStyle("sectionHeading", "heading:links"),
          }}
        >
          Links
        </h2>

        <div
          {...selectableAttrs("sectionBody", "Links content", {
            sectionId: "links",
            instanceId: "body:links",
            role: "entryBody",
            motion: "sectionBody",
          })}
          style={{
            ...baseSelectableStyle,
            display: "grid",
            gap: 7,
            marginTop: 10,
            fontSize: 12,
            ...textCss.link,
            ...elementPlacementStyle("sectionBody", "body:links"),
            ...boxStyle("sectionBody", "body:links"),
          }}
        >
          {projection.links
            .filter(link => matchesSearch(link.label, link.url))
            .map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              {...selectableAttrs("links", link.label, {
                sectionId: "links",
                instanceId: `resume-link:${index}`,
                role: "link",
                motion: "links",
              })}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{
                ...baseSelectableStyle,
                ...elementPlacementStyle("links", `resume-link:${index}`),
                ...boxStyle("links", `resume-link:${index}`),
              }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>
    );
  }

  const sectionRenderers: Record<WebSectionId, () => ReactNode> = {
    video: renderVideo,
    about: renderAbout,
    experience: renderExperience,
    projects: renderProjects,
    education: renderEducation,
    skills: renderSkills,
    featured: renderFeatured,
    links: renderLinks,
  };

  const heroPlacement = elementPlacementStyle("hero");
  const heroBox = boxStyle("hero");
  const photoPlacement = elementPlacementStyle("photo");

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <style>{`
        @keyframes web-editor-gradient {
          0%,100% { background-position:0% 50%; }
          50% { background-position:100% 50%; }
        }
        @keyframes web-editor-grid {
          to { background-position:32px 32px; }
        }
        @keyframes web-editor-float {
          0%,100% { transform:translate3d(0,0,0) scale(1); }
          35% { transform:translate3d(8%,-4%,0) scale(1.07); }
          70% { transform:translate3d(-5%,5%,0) scale(.95); }
        }
        @keyframes web-editor-spot {
          0%,100% { transform:translateX(-18%); }
          50% { transform:translateX(18%); }
        }
        [data-web-selectable] { cursor: default; }
        [data-web-selectable]:hover {
          outline: 1px solid rgba(124,58,237,.16);
          outline-offset: 3px;
          cursor: grab;
        }
        [contenteditable="true"] { cursor:text!important; }
        @media (prefers-reduced-motion: reduce) {
          [data-web-motion] { animation:none!important; }
        }
      `}</style>

      <div
        data-web-editor-ui
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
          padding: "0 2px",
        }}
      >
        <div style={{
          color: "#71717a",
          fontSize: 9,
          lineHeight: 1.35,
        }}>
          Click to select · drag selected items · double-click text to edit
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          padding: 3,
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          background: "#fff",
        }}>
          {([
            ["desktop", "▰", "Desktop"],
            ["tablet", "▯", "Tablet"],
            ["mobile", "▯", "Mobile"],
          ] as Array<[WebBreakpoint, string, string]>).map(([bp, icon, title]) => (
            <button
              key={bp}
              type="button"
              title={title}
              onClick={() => {
                setBreakpoint(bp);
                clearSelection();
              }}
              style={{
                ...iconButton,
                minWidth: 31,
                height: 26,
                background: breakpoint === bp ? "#f5f3ff" : "transparent",
                color: breakpoint === bp ? "#6d28d9" : "#71717a",
                borderColor: breakpoint === bp ? "#ddd6fe" : "transparent",
              }}
            >
              {bp === "desktop" ? "🖥" : bp === "tablet" ? "▭" : "▯"}
            </button>
          ))}

          <span style={{ width: 1, height: 18, background: "#e4e4e7" }} />

          <button
            type="button"
            title="Replay animations"
            onClick={() => setMotionReplay(value => value + 1)}
            style={{ ...iconButton, minWidth: 31, height: 26 }}
          >
            ↻
          </button>

          <button
            type="button"
            title="Switch preview theme"
            onClick={() => setRuntimeTheme(theme => theme === "dark" ? "light" : "dark")}
            style={{ ...iconButton, minWidth: 31, height: 26 }}
          >
            {runtimeTheme === "dark" ? "☀" : "◐"}
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        onPointerDown={handleCanvasPointerDown}
        onClick={event => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-web-selectable]") &&
            target.closest("a")
          ) {
            event.preventDefault();
          }
        }}
        style={{
          position: "relative",
          width: "100%",
          height: "min(920px, calc(100vh - 190px))",
          minHeight: 580,
          overflow: "auto",
          border: "1px solid #e5e7eb",
          background: "#f6f6f7",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.7)",
        }}
      >
        <div
          ref={artboardRef}
          data-web-artboard
          style={artboardStyle}
        >
          <BackgroundMotion
            effect={studio.background.effect}
            speed={studio.background.speed}
            intensity={studio.background.intensity}
            secondaryColor={studio.background.secondaryColor}
          />

          {(settings.showNav || settings.showSearch || settings.showPrint) && (
            <div
              data-web-visitor-ui
              style={{
                position: settings.showNav ? "sticky" : "relative",
                top: settings.showNav ? 8 : undefined,
                zIndex: 90,
                display: "flex",
                flexDirection: compactVisitorHeader ? "column" : "row",
                alignItems: compactVisitorHeader ? "stretch" : "center",
                justifyContent: "space-between",
                gap: compactVisitorHeader ? 9 : 14,
                marginLeft: -artboardHorizontalInset,
                marginRight: -artboardHorizontalInset,
                marginBottom: 28,
                padding: compactVisitorHeader
                  ? `10px ${artboardHorizontalInset}px`
                  : `9px ${artboardHorizontalInset}px`,
                borderTop: "1px solid var(--web-border)",
                borderBottom: "1px solid var(--web-border)",
                borderLeft: 0,
                borderRight: 0,
                borderRadius: 0,
                background:
                  runtimeTheme === "dark"
                    ? "rgba(24,24,27,.96)"
                    : "rgba(255,255,255,.96)",
                boxShadow:
                  runtimeTheme === "dark"
                    ? "0 3px 12px rgba(0,0,0,.12)"
                    : "0 3px 12px rgba(15,23,42,.045)",
                backdropFilter: "blur(10px)",
                boxSizing: "border-box",
                minWidth: 0,
              }}
            >
              {settings.showNav && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  flex: "1 1 auto",
                  minWidth: 0,
                  gap: 16,
                  overflowX: "auto",
                  overflowY: "hidden",
                  scrollbarWidth: "none",
                  padding: "0 4px 0 2px",
                }}>
                  {activeSections.map(sectionId => (
                    <button
                      key={sectionId}
                      type="button"
                      onClick={() => jumpToSection(sectionId)}
                      style={{
                        border: 0,
                        borderBottom:
                          activeSection === sectionId
                            ? "1px solid var(--web-accent)"
                            : "1px solid transparent",
                        background: "transparent",
                        padding: "6px 1px 5px",
                        color:
                          activeSection === sectionId
                            ? "var(--web-ink)"
                            : "var(--web-muted)",
                        cursor: "pointer",
                        fontSize: 9.5,
                        fontWeight: activeSection === sectionId ? 800 : 650,
                        textTransform: "capitalize",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sectionId === "featured" ? "Featured links" : sectionId}
                    </button>
                  ))}
                </div>
              )}

              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: compactVisitorHeader ? "space-between" : "flex-end",
                gap: 8,
                minWidth: 0,
                flex: compactVisitorHeader ? "0 0 auto" : "0 0 auto",
                width: compactVisitorHeader ? "100%" : "auto",
              }}>
                {settings.showSearch && (
                  <label style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 30,
                    minWidth: 0,
                    flex: compactVisitorHeader ? "1 1 auto" : "0 0 136px",
                    width: compactVisitorHeader ? "auto" : 136,
                    maxWidth: compactVisitorHeader ? 230 : 136,
                    padding: "0 9px",
                    border: "1px solid var(--web-border)",
                    borderRadius: 9,
                    background:
                      runtimeTheme === "dark"
                        ? "rgba(255,255,255,.045)"
                        : "rgba(15,23,42,.028)",
                    color: "var(--web-muted)",
                    boxSizing: "border-box",
                  }}>
                    <span aria-hidden style={{
                      fontSize: 10,
                      lineHeight: 1,
                      opacity: .8,
                    }}>⌕</span>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      placeholder="Search"
                      style={{
                        width: "100%",
                        minWidth: 0,
                        border: 0,
                        outline: 0,
                        background: "transparent",
                        color: "var(--web-ink)",
                        font: "inherit",
                        fontSize: 9.5,
                      }}
                    />
                  </label>
                )}

                {settings.showPrint && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      height: 30,
                      border: "1px solid transparent",
                      borderRadius: 8,
                      background:
                        runtimeTheme === "dark"
                          ? "rgba(255,255,255,.035)"
                          : "rgba(15,23,42,.02)",
                      padding: "0 9px",
                      flexShrink: 0,
                      color: "var(--web-ink)",
                      cursor: "pointer",
                      fontSize: 9.5,
                      fontWeight: 700,
                    }}
                  >
                    Print
                  </button>
                )}
              </div>
            </div>
          )}

          <header
            {...selectableAttrs("hero", "Personal info", { motion: "hero" })}
            data-web-group-root
            style={{
              ...baseSelectableStyle,
              display: "grid",
              gridTemplateColumns:
                breakpoint === "mobile" || !settings.showPhoto || !projection.profilePhoto
                  ? "1fr"
                  : "minmax(0,1fr) auto",
              alignItems: "start",
              gap: 26,
              marginBottom: 28,
              ...heroPlacement,
              ...heroBox,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                {...selectableAttrs("name", "Name", {
                  role: "name",
                  motion: "name",
                })}
                style={{
                  ...baseSelectableStyle,
                  margin: 0,
                  fontSize: breakpoint === "mobile" ? 38 : 54,
                  lineHeight: 1,
                  letterSpacing: "-.045em",
                  ...textCss.name,
                  ...elementPlacementStyle("name"),
                  ...boxStyle("name"),
                }}
              >
                <EditableText
                  value={data.firstName ?? ""}
                  editing={editingKey === "firstName"}
                  onStartEdit={() => setEditingKey("firstName")}
                  onCommit={value => {
                    setEditingKey(null);
                    onDataChange?.({ ...data, firstName: value });
                  }}
                />
                {(data.firstName || data.lastName) && " "}
                <EditableText
                  value={data.lastName ?? ""}
                  editing={editingKey === "lastName"}
                  onStartEdit={() => setEditingKey("lastName")}
                  onCommit={value => {
                    setEditingKey(null);
                    onDataChange?.({ ...data, lastName: value });
                  }}
                />
              </h1>

              {projection.summary && (
                <div
                  {...selectableAttrs("summary", "Hero summary", {
                    role: "summary",
                    motion: "summary",
                  })}
                  style={{
                    ...baseSelectableStyle,
                    maxWidth: 720,
                    marginTop: 12,
                    color: "var(--web-muted)",
                    fontSize: 15,
                    lineHeight: 1.55,
                    ...textCss.summary,
                    ...elementPlacementStyle("summary"),
                    ...boxStyle("summary"),
                  }}
                >
                  <EditableText
                    as="p"
                    value={data.summary ?? ""}
                    editing={editingKey === "hero-summary"}
                    onStartEdit={() => setEditingKey("hero-summary")}
                    onCommit={value => {
                      setEditingKey(null);
                      onDataChange?.({ ...data, summary: value });
                    }}
                    style={{ margin: 0 }}
                  />
                </div>
              )}

              <div
                {...selectableAttrs("contact", "Contact", {
                  role: "contact",
                  motion: "contact",
                })}
                style={{
                  ...baseSelectableStyle,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 12px",
                  marginTop: 15,
                  color: "var(--web-muted)",
                  fontSize: 11.5,
                  ...textCss.contact,
                  ...elementPlacementStyle("contact"),
                  ...boxStyle("contact"),
                }}
              >
                {projection.email && <a href={`mailto:${projection.email}`}>{projection.email}</a>}
                {projection.phone && <a href={`tel:${projection.phone.replace(/[^\d+]/g, "")}`}>{projection.phone}</a>}
                {projection.location && <span>{projection.location}</span>}
                {projection.website && normalizeWebUrl(projection.website) && (
                  <a href={normalizeWebUrl(projection.website)!} target="_blank" rel="noreferrer">
                    {projection.website}
                  </a>
                )}

              </div>
            </div>

            {settings.showPhoto && projection.profilePhoto && (
              <img
                {...selectableAttrs("photo", "Profile photo", {
                  motion: "photo",
                })}
                src={projection.profilePhoto}
                alt=""
                draggable={false}
                style={{
                  ...baseSelectableStyle,
                  width: breakpoint === "mobile" ? 96 : 132,
                  height: breakpoint === "mobile" ? 96 : 132,
                  objectFit: "cover",
                  ...photoPlacement,
                  ...boxStyle("photo"),
                }}
              />
            )}
          </header>

          {q && (
            <div
              data-web-visitor-ui
              style={{
                margin: "0 0 12px",
                color: "var(--web-muted)",
                fontSize: 9.5,
              }}
            >
              Filtering for “{searchQuery.trim()}”
            </div>
          )}

          <main style={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            columnGap: 22,
            rowGap: 0,
            alignItems: "start",
          }}>
            {activeSections.map(sectionId => sectionRenderers[sectionId]())}
          </main>

          <footer style={{
            marginTop: 42,
            color: "var(--web-muted)",
            fontSize: 10,
          }}>
            {projection.fullName}
          </footer>
        </div>

        {selection && selection.target !== "background" && selectionRect && (
          <>
            {parentGroupRect && (
              <div
                data-web-selection-ui
                aria-hidden
                style={{
                  position: "absolute",
                  top: parentGroupRect.top,
                  left: parentGroupRect.left,
                  width: parentGroupRect.width,
                  height: parentGroupRect.height,
                  zIndex: 238,
                  border: "1px dashed rgba(124,58,237,.42)",
                  borderRadius: 4,
                  pointerEvents: "none",
                  boxSizing: "border-box",
                }}
              >
                {parentGroupLabel && (
                  <span style={{
                    position: "absolute",
                    top: -18,
                    left: -1,
                    borderRadius: 5,
                    background: "rgba(245,243,255,.96)",
                    padding: "2px 5px",
                    color: "#6d28d9",
                    fontSize: 7.5,
                    fontWeight: 800,
                  }}>
                    {parentGroupLabel}
                  </span>
                )}
              </div>
            )}

            <SelectionOverlay
              rect={selectionRect}
              canResize={canResizeSelection}
              onResizePointerDown={beginResize}
            />

            <WebRotationHandle
              rect={selectionRect}
              onPointerDown={beginRotate}
            />

            <SelectionToolbar
              selection={selection}
              rect={selectionRect}
              viewportWidth={viewportRef.current?.clientWidth ?? 900}
              viewportScrollLeft={viewportRef.current?.scrollLeft ?? 0}
              viewportScrollTop={viewportRef.current?.scrollTop ?? 0}
              parentGroupLabel={parentGroupLabel}
              role={roleForSelection}
              textStyle={selectedTextStyle}
              linked={textLinked}
              logoSameTypeLink={
                selectedWorkLogoEntryId
                  ? {
                      linked: selectedLogoSameTypeLinked,
                      count: workEntryIds.length,
                      onToggle: () => {
                        if (!onDesignChange) return;
                        onDesignChange(
                          setWebCompanyLogoGroupLinked(
                            data.design,
                            breakpoint,
                            selectedWorkLogoEntryId,
                            workEntryIds,
                            !selectedLogoSameTypeLinked,
                          ),
                        );
                      },
                    }
                  : undefined
              }
              logoCrossFormatLink={
                selectedWorkLogoEntryId
                  ? {
                      linked: companyLogoCrossFormatLinked,
                      onToggle: () => {
                        if (!onDesignChange) return;

                        if (companyLogoCrossFormatLinked) {
                          onDesignChange(
                            setCompanyLogoCrossFormatLinked(
                              data.design,
                              false,
                            ),
                          );
                          return;
                        }

                        let next = setCompanyLogoCrossFormatLinked(
                          data.design,
                          true,
                        );
                        next = syncCompanyLogoSizeFromWebNow(
                          next,
                          breakpoint,
                          selectedWorkLogoEntryId,
                          workEntryIds,
                        );
                        onDesignChange(next);
                      },
                    }
                  : undefined
              }
              rotationCrossFormatLink={
                selectedRotationSyncTarget
                  ? {
                      linked: selectedRotationCrossFormatLinked,
                      onToggle: () => {
                        if (!onDesignChange) return;
                        onDesignChange(
                          setWebRotationCrossFormatLinked(
                            data.design,
                            breakpoint,
                            selectedRotationSyncTarget,
                            !selectedRotationCrossFormatLinked,
                          ),
                        );
                      },
                    }
                  : undefined
              }
              activeTab={inspectorTab}
              onActiveTab={setInspectorTab}
              onTextPatch={patchText}
              onToggleLink={() => {
                if (!onDesignChange || !roleForSelection) return;
                onDesignChange(
                  setWebTextLinked(
                    data.design,
                    roleForSelection,
                    !textLinked,
                  ),
                );
              }}
              onSelectParent={parentGroupLabel ? selectParentGroup : undefined}
              onClear={clearSelection}
            />

            {inspectorTab && (
              <InspectorPopover
                rect={selectionRect}
                viewportWidth={viewportRef.current?.clientWidth ?? 900}
                viewportScrollLeft={viewportRef.current?.scrollLeft ?? 0}
              >
                {inspectorTab === "layout" && (
                  <LayoutInspector
                    selection={selection}
                    breakpoint={breakpoint}
                    placement={selectionPlacement()}
                    onPatch={patch => patchPlacement(selection, patch)}
                    onLogoSizeChange={
                      selectedWorkLogoEntryId
                        ? sizePx => onDesignChange?.(
                            updateWebCompanyLogoSize(
                              data.design,
                              breakpoint,
                              selectedWorkLogoEntryId,
                              workEntryIds,
                              sizePx,
                            ),
                          )
                        : undefined
                    }
                    onReset={() => resetPlacement(selection)}
                  />
                )}

                {inspectorTab === "style" && (
                  <StyleInspector
                    boxStyle={selectedBoxStyle}
                    onPatch={patch => patchBox(
                      selection.target as WebElementTarget,
                      patch,
                      selectedStyleInstanceId,
                    )}
                  />
                )}

                {inspectorTab === "animate" && (
                  <AnimationInspector
                    spec={effectiveWebMotionSpec(
                      studio,
                      selection.target as WebAnimationTarget,
                      selection.instanceId,
                    )}
                    onPatch={patchMotion}
                    onPreset={applyPreset}
                    onReplay={() => setMotionReplay(value => value + 1)}
                  />
                )}

                {inspectorTab === "more" && (
                  <div style={{ display: "grid", gap: 9 }}>
                    <div style={{
                      borderRadius: 8,
                      background: "#f8fafc",
                      padding: "8px 9px",
                      color: "#64748b",
                      fontSize: 8.5,
                      lineHeight: 1.5,
                    }}>
                      <strong style={{ color: "#334155" }}>One resume, three presentations.</strong><br />
                      Content is shared. Typography is linked between Designed PDF + Web until you
                      unlink it. Project content is shared across Designed PDF, ATS and Web. Responsive layout, motion, video and hover behavior are Web-only.
                      ATS remains semantic.
                    </div>

                    {selectedWorkLogoEntry && (
                      <div style={{
                        display: "grid",
                        gap: 6,
                        borderRadius: 8,
                        background: "#f8fafc",
                        padding: "8px 9px",
                        color: "#64748b",
                        fontSize: 8.5,
                        lineHeight: 1.45,
                      }}>
                        <strong style={{ color: "#334155" }}>
                          Two independent logo relationships
                        </strong>
                        <span>
                          <strong>All logos</strong> controls whether logo size matches
                          other company logos in this Web presentation.
                          <strong> PDF + Web</strong> synchronizes compatible logo
                          appearance across formats. Position always remains
                          layout-specific.
                        </span>
                      </div>
                    )}

                    {selectedWorkLogoEntry && (
                      <div style={{
                        display: "grid",
                        gap: 7,
                        border: "1px solid #e4e4e7",
                        borderRadius: 9,
                        padding: 9,
                      }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800 }}>
                            Company logo
                          </div>
                          <div style={{
                            marginTop: 2,
                            color: "#71717a",
                            fontSize: 8,
                            lineHeight: 1.4,
                          }}>
                            Leave the URL empty to use the automatic company logo.
                          </div>
                        </div>

                        <label>
                          <MiniFieldLabel>Custom logo URL</MiniFieldLabel>
                          <input
                            type="url"
                            value={selectedWorkLogoEntry.logoUrl ?? ""}
                            placeholder="https://…"
                            onChange={event =>
                              updateWorkEntry(selectedWorkLogoEntry.id, {
                                logoUrl: event.target.value,
                              })
                            }
                            style={smallInput}
                          />
                        </label>

                        {!!selectedWorkLogoEntry.logoUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              updateWorkEntry(selectedWorkLogoEntry.id, {
                                logoUrl: "",
                              })
                            }
                            style={{
                              height: 30,
                              border: "1px solid #e4e4e7",
                              borderRadius: 8,
                              background: "#fafafa",
                              color: "#52525b",
                              cursor: "pointer",
                              fontSize: 9,
                              fontWeight: 750,
                            }}
                          >
                            Use automatic company logo
                          </button>
                        )}
                      </div>
                    )}

                    {roleForSelection && !textLinked && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!onDesignChange) return;
                          onDesignChange(
                            setWebTextLinked(data.design, roleForSelection, true),
                          );
                        }}
                        style={{
                          height: 30,
                          border: "1px solid #ddd6fe",
                          borderRadius: 8,
                          background: "#faf5ff",
                          color: "#6d28d9",
                          cursor: "pointer",
                          fontSize: 9,
                          fontWeight: 800,
                        }}
                      >
                        🔗 Relink typography to Designed PDF
                      </button>
                    )}

                    {selection.instanceId && studio.instances[selection.instanceId] && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!onDesignChange || !selection.instanceId) return;
                          onDesignChange(
                            clearWebInstanceAnimation(
                              data.design,
                              selection.instanceId,
                            ),
                          );
                          setMotionReplay(value => value + 1);
                        }}
                        style={{
                          height: 30,
                          border: "1px solid #e4e4e7",
                          borderRadius: 8,
                          background: "#fafafa",
                          color: "#52525b",
                          cursor: "pointer",
                          fontSize: 9,
                          fontWeight: 750,
                        }}
                      >
                        Use group animation
                      </button>
                    )}
                  </div>
                )}
              </InspectorPopover>
            )}
          </>
        )}

        {selection?.target === "background" && (
          <div
            data-web-selection-ui
            style={{
              position: "absolute",
              top: (viewportRef.current?.scrollTop ?? 0) + 14,
              left: (viewportRef.current?.scrollLeft ?? 0) + 14,
              zIndex: 300,
              width: 302,
              maxWidth: "calc(100% - 28px)",
              border: "1px solid #e4e4e7",
              borderRadius: 11,
              background: "#fff",
              padding: 11,
              boxShadow: "0 14px 34px rgba(15,23,42,.14)",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 9,
            }}>
              <div>
                <div style={{ color: "#6d28d9", fontSize: 8, fontWeight: 800, textTransform: "uppercase" }}>
                  Web
                </div>
                <div style={{ marginTop: 1, fontSize: 11, fontWeight: 800 }}>
                  Background
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelection(null)}
                style={{ ...iconButton, minWidth: 24 }}
              >
                ×
              </button>
            </div>

            <BackgroundInspector
              studio={studio}
              backgroundStyle={backgroundStyle}
              theme={settings.theme}
              onThemeChange={theme => {
                if (!onDesignChange) return;
                onDesignChange(withResumeWebSettings(data.design, { theme }));
              }}
              onStudioPatch={patchStudio}
              onBackgroundStylePatch={patch => patchBox("background", patch)}
              onPreset={applyPreset}
              onReplay={() => setMotionReplay(value => value + 1)}
            />
          </div>
        )}

        {dropGuide && (
          dropGuide.pairWith && dropGuide.zoneTop != null ? (
            <div
              data-web-editor-ui
              style={{
                position: "absolute",
                top: dropGuide.zoneTop,
                left: dropGuide.zoneLeft,
                width: dropGuide.zoneWidth,
                height: dropGuide.zoneHeight,
                zIndex: 280,
                pointerEvents: "none",
                border: "2px solid #7c3aed",
                background: "rgba(124,58,237,.07)",
                boxSizing: "border-box",
              }}
            >
              <div style={{
                position: "absolute",
                top: 8,
                left: 8,
                borderRadius: 999,
                background: "#7c3aed",
                padding: "3px 7px",
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
              }}>
                {dropGuide.horizontalIntent === "left"
                  ? "Drop left"
                  : "Drop right"}
              </div>
            </div>
          ) : (
            <div
              data-web-editor-ui
              style={{
                position: "absolute",
                top: dropGuide.top,
                left: dropGuide.left,
                width: dropGuide.width,
                zIndex: 280,
                pointerEvents: "none",
              }}
            >
              <div style={{
                height: 2,
                background: "#7c3aed",
              }} />
              <div style={{
                position: "absolute",
                top: -11,
                left: "50%",
                transform: "translateX(-50%)",
                borderRadius: 999,
                background: "#7c3aed",
                padding: "3px 7px",
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
              }}>
                Drop here
              </div>
            </div>
          )
        )}

        {settings.showBackToTop && scrollRatio > 0.28 && (
          <button
            type="button"
            data-web-visitor-ui
            aria-label="Back to top"
            onClick={() => viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              position: "sticky",
              left: "calc(100% - 48px)",
              bottom: 12,
              zIndex: 320,
              width: 34,
              height: 34,
              margin: "0 12px 12px 0",
              border: "1px solid #e4e4e7",
              borderRadius: "50%",
              background: "#fff",
              color: "#52525b",
              boxShadow: "0 6px 18px rgba(15,23,42,.11)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}