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
import { ChevronDown, Link2, Unlink2 } from "lucide-react";
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
  type ResumeWebTemplatePresentation,
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
import {
  RESUME_TEMPLATES,
  getAppliedResumeTemplateId,
} from "./resumeDesignTemplates";
import {
  createLinkedTextDesignObject,
  effectiveLinkedTextWebPlacement,
  getDesignObjects,
  removeDesignObject,
  resumeDesignPageSize,
  setLinkedTextLayoutUnlinked,
  setLinkedTextWebPlacement,
  upsertDesignObject,
  type LinkedTextPlacement,
  type TextDesignObject,
} from "./resumeDesignObjects";
import {
  effectiveResumeDataForSurface,
  isSharedContentBindingLocal,
  mergeSurfaceResumeDataChange,
  relinkSharedContentUsingLocal,
  relinkSharedContentUsingShared,
  sharedContentBindingLabel,
  unlinkSharedContentBinding,
  type SharedContentBinding,
} from "./resumeSharedContentOverrides";

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

type RotationPreview = {
  selectionKey: string;
  rotation: number;
};

function editorSelectionKey(selection: EditorSelection | null): string {
  if (!selection) return "";
  return [
    selection.target,
    selection.sectionId ?? "",
    selection.instanceId ?? "",
  ].join("|");
}

function sharedBindingForWebSelection(
  selection: EditorSelection | null,
): SharedContentBinding | null {
  if (!selection) return null;

  const instanceId = selection.instanceId ?? "";
  const suffix = (prefix: string) =>
    instanceId.startsWith(prefix) ? instanceId.slice(prefix.length) : "";

  if (selection.target === "name") return { kind: "name" };
  if (selection.target === "contact") return { kind: "contact" };
  if (selection.target === "summary") return { kind: "summary" };

  if (selection.target === "experience") {
    const id = suffix("work:");
    return id ? { kind: "work", id } : null;
  }
  if (instanceId.startsWith("work-title:")) return { kind: "work", id: suffix("work-title:") };
  if (instanceId.startsWith("work-company:")) return { kind: "work", id: suffix("work-company:") };
  if (instanceId.startsWith("work-body:")) return { kind: "work", id: suffix("work-body:") };

  if (selection.target === "projects" && instanceId.startsWith("project:")) {
    return { kind: "project", id: suffix("project:") };
  }
  if (instanceId.startsWith("project-title:")) return { kind: "project", id: suffix("project-title:") };
  if (instanceId.startsWith("project-description:")) return { kind: "project", id: suffix("project-description:") };
  if (instanceId.startsWith("project-tech:")) return { kind: "project", id: suffix("project-tech:") };

  if (selection.target === "education") {
    const id = suffix("education:");
    return id ? { kind: "education", id } : null;
  }
  if (instanceId.startsWith("edu-school:")) return { kind: "education", id: suffix("edu-school:") };

  if (selection.target === "skills" && selection.sectionId === "skills") {
    return { kind: "skills" };
  }
  if (selection.target === "links" && selection.sectionId === "links") {
    return { kind: "links" };
  }

  return null;
}

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

type InspectorTab = "shared" | "text" | "layout" | "style" | "animate" | "more";

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
  const lastTouchTapRef = useRef(0);

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
      onTouchEnd={event => {
        if (!onCommit || editing) return;
        const now = Date.now();
        const elapsed = now - lastTouchTapRef.current;
        lastTouchTapRef.current = now;
        if (elapsed > 0 && elapsed < 360) {
          event.preventDefault();
          event.stopPropagation();
          lastTouchTapRef.current = 0;
          onStartEdit?.();
        }
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

function SharedContentInspector({
  status,
  label,
  surfaceLabel,
  onEditOnlyHere,
  onRelinkUseShared,
  onRelinkUseLocal,
}: {
  status: "shared" | "local";
  label: string;
  surfaceLabel: string;
  onEditOnlyHere?: () => void;
  onRelinkUseShared?: () => void;
  onRelinkUseLocal?: () => void;
}) {
  const actionStyle: CSSProperties = {
    width: "100%",
    border: "1px solid #e4e4e7",
    borderRadius: 9,
    background: "#fff",
    padding: "9px 10px",
    textAlign: "left",
    cursor: "pointer",
  };

  if (status === "shared") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: "#27272a" }}>
          <Link2 size={13} color="#2e0562" /> Shared content
        </div>
        <div style={{ marginTop: 5, color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
          {label} uses your shared resume content. Text changes here update the same content anywhere else it remains linked.
        </div>
        {onEditOnlyHere && (
          <button type="button" onClick={onEditOnlyHere} style={{ ...actionStyle, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <Unlink2 size={13} color="#a16207" style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#27272a" }}>Edit only here</div>
                <div style={{ marginTop: 2, color: "#71717a", fontSize: 10.5, lineHeight: 1.45 }}>
                  Make a local version for {surfaceLabel}. The shared resume stays unchanged.
                </div>
              </div>
            </div>
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: "#27272a" }}>
        <Unlink2 size={13} color="#a16207" /> Local version
      </div>
      <div style={{ marginTop: 5, color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
        Changes to {label.toLowerCase()} apply only to {surfaceLabel}. The shared resume can continue changing independently.
      </div>
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #e4e4e7" }}>
        <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: ".07em", textTransform: "uppercase", color: "#71717a" }}>
          Relink to shared content
        </div>
        <div style={{ marginTop: 3, color: "#71717a", fontSize: 9, lineHeight: 1.45 }}>
          These versions may differ. Choose which version should win.
        </div>
        {onRelinkUseShared && (
          <button type="button" onClick={onRelinkUseShared} style={{ ...actionStyle, marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#27272a" }}>Use shared version here</div>
            <div style={{ marginTop: 2, color: "#71717a", fontSize: 9, lineHeight: 1.45 }}>
              Shared → {surfaceLabel} · discard the local changes and sync this version to the resume.
            </div>
          </button>
        )}
        {onRelinkUseLocal && (
          <button
            type="button"
            onClick={onRelinkUseLocal}
            style={{
              ...actionStyle,
              marginTop: 7,
              borderColor: "rgba(46,5,98,.18)",
              background: "rgba(46,5,98,.045)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: "#2e0562" }}>Make this the shared version</div>
            <div style={{ marginTop: 2, color: "#71717a", fontSize: 9, lineHeight: 1.45 }}>
              {surfaceLabel} → Shared · keep these changes and update the shared resume for other linked uses.
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

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
  sharedContentStatus,
  sharedContentLabel,
  showMore,
  activeTab,
  onActiveTab,
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
  sharedContentStatus?: "shared" | "local" | null;
  sharedContentLabel?: string | null;
  showMore: boolean;
  activeTab: InspectorTab | null;
  onActiveTab: (tab: InspectorTab | null) => void;
  onSelectParent?: () => void;
  onClear: () => void;
}) {
  const baseEstimatedWidth = role ? (showMore ? 313 : 280) : (showMore ? 310 : 277);
  const estimatedWidth = baseEstimatedWidth + (sharedContentStatus ? 84 : 0);
  const minLeft = viewportScrollLeft + 8;
  const maxLeft = Math.max(
    minLeft,
    viewportScrollLeft + viewportWidth - estimatedWidth - 8,
  );
  const left = Math.max(minLeft, Math.min(rect.left, maxLeft));
  const aboveTop = rect.top - 52;
  const top =
    aboveTop >= viewportScrollTop + 8
      ? aboveTop
      : rect.top + rect.height + 12;

  const tabButton = (tab: InspectorTab, label: string, minWidth = 42) => (
    <button
      type="button"
      onClick={() => onActiveTab(activeTab === tab ? null : tab)}
      aria-pressed={activeTab === tab}
      title={`${label} controls`}
      style={{
        ...iconButton,
        minWidth,
        padding: "0 6px",
        borderColor: activeTab === tab ? "#ddd6fe" : "transparent",
        background: activeTab === tab ? "#f5f3ff" : "transparent",
        color: activeTab === tab ? "#6d28d9" : "#52525b",
        fontSize: 8.5,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

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
        gap: 2,
        minHeight: 34,
        maxWidth: "calc(100% - 20px)",
        padding: "3px 4px",
        border: "1px solid #e4e4e7",
        borderRadius: 10,
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
        maxWidth: parentGroupLabel ? 135 : 105,
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
                padding: "0 3px 0 5px",
                color: "#6d28d9",
                cursor: "pointer",
                fontSize: 8,
                fontWeight: 800,
                whiteSpace: "nowrap",
                maxWidth: 68,
                overflow: "hidden",
                textOverflow: "ellipsis",
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
          padding: "0 5px",
          color: "#52525b",
          fontSize: 8.5,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}>
          {selection.label}
        </span>
      </div>

      <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />

      {sharedContentStatus && (
        <>
          <button
            type="button"
            onClick={() => onActiveTab(activeTab === "shared" ? null : "shared")}
            aria-pressed={activeTab === "shared"}
            title={
              sharedContentStatus === "shared"
                ? `${sharedContentLabel ?? "This content"} is shared across linked resume formats`
                : `${sharedContentLabel ?? "This content"} is local to Responsive Web`
            }
            style={{
              ...iconButton,
              minWidth: 72,
              padding: "0 7px",
              gap: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderColor: activeTab === "shared"
                ? "#c4b5fd"
                : sharedContentStatus === "shared"
                  ? "rgba(46,5,98,.22)"
                  : "#fcd34d",
              background: activeTab === "shared"
                ? "#f5f3ff"
                : sharedContentStatus === "shared"
                  ? "rgba(46,5,98,.055)"
                  : "#fffbeb",
              color: sharedContentStatus === "shared" ? "#2e0562" : "#a16207",
              fontSize: 10.5,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {sharedContentStatus === "shared"
              ? <Link2 size={12.5} strokeWidth={2.2} />
              : <Unlink2 size={12.5} strokeWidth={2.1} />}
            {sharedContentStatus === "shared" ? "Shared" : "Local"}
            <ChevronDown size={11.5} strokeWidth={2} />
          </button>
          <span style={{ width: 1, height: 19, background: "#e4e4e7" }} />
        </>
      )}

      {tabButton("layout", "Layout", 44)}
      {tabButton("style", "Style", 38)}
      {tabButton("animate", "Motion", 44)}

      {showMore && (
        <button
          type="button"
          onClick={() => onActiveTab(activeTab === "more" ? null : "more")}
          aria-pressed={activeTab === "more"}
          style={{
            ...iconButton,
            minWidth: 28,
            borderColor: activeTab === "more" ? "#ddd6fe" : "transparent",
            background: activeTab === "more" ? "#f5f3ff" : "transparent",
            color: activeTab === "more" ? "#6d28d9" : "#52525b",
          }}
          title="More options"
        >
          ⋯
        </button>
      )}

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
  viewportHeight,
  viewportScrollLeft,
  viewportScrollTop,
  children,
}: {
  rect: EditorRect;
  viewportWidth: number;
  viewportHeight: number;
  viewportScrollLeft: number;
  viewportScrollTop: number;
  children: ReactNode;
}) {
  const width = 300;
  const margin = 10;
  const belowStart = rect.top + rect.height + 52;
  const viewportBottom = viewportScrollTop + viewportHeight;
  const spaceBelow = viewportBottom - belowStart - margin;
  const spaceAbove = rect.top - viewportScrollTop - 54 - margin;
  const openBelow = spaceBelow >= 190 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(150, Math.min(410, openBelow ? spaceBelow : spaceAbove));
  const top = openBelow
    ? belowStart
    : Math.max(viewportScrollTop + margin, rect.top - 54 - maxHeight - margin);

  return (
    <div
      data-web-selection-ui
      style={{
        position: "absolute",
        top,
        left: Math.max(
          viewportScrollLeft + 8,
          Math.min(
            rect.left,
            viewportScrollLeft + Math.max(8, viewportWidth - width - 8),
          ),
        ),
        zIndex: 290,
        width,
        maxWidth: "calc(100% - 20px)",
        maxHeight,
        overflowY: "auto",
        overscrollBehavior: "contain",
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
  data: sharedData,
  onDesignChange,
  onDataChange,
}: {
  data: ResumeData;
  onDesignChange?: (design: ResumeDesign) => void;
  onDataChange?: (data: ResumeData) => void;
}) {
  const data = useMemo(
    () => effectiveResumeDataForSurface(sharedData, "responsive"),
    [sharedData],
  );

  const commitSurfaceData = (nextEffectiveData: ResumeData) => {
    onDataChange?.(
      mergeSurfaceResumeDataChange(
        sharedData,
        nextEffectiveData,
        "responsive",
      ),
    );
  };

  const settings = useMemo(() => getResumeWebSettings(data.design), [data.design]);
  const sharedProjects = useMemo(() => getResumeProjects(data), [data]);
  const studio = useMemo(() => getWebAnimationStudio(data.design), [data.design]);
  const appliedSharedTemplate = useMemo(() => {
    const templateId = getAppliedResumeTemplateId(data.design);
    return templateId
      ? RESUME_TEMPLATES.find(template => template.id === templateId)
      : undefined;
  }, [data.design]);

  const templatePresentation = useMemo<ResumeWebTemplatePresentation>(() => {
    // New saves persist the Web adaptation explicitly so detaching a template
    // keeps the current Responsive appearance. For existing saves created
    // before this patch, derive the recipe from the still-applied PDF template.
    if (settings.templatePresentation.templateId) {
      return settings.templatePresentation;
    }

    const template = appliedSharedTemplate;
    if (!template) return settings.templatePresentation;

    return {
      templateId: template.id,
      layout: template.preview.layout,
      accent: template.preview.accent,
      paper: template.preview.paper,
      sidebarColor: template.preview.sidebarColor ?? "",
      headerAccent: Boolean(template.preview.headerAccent),
      timeline: Boolean(template.preview.timeline),
    };
  }, [settings.templatePresentation, appliedSharedTemplate]);

  const [breakpoint, setBreakpoint] = useState<WebBreakpoint>("desktop");
  const [runtimeTheme, setRuntimeTheme] = useState<"light" | "dark">(
    settings.theme === "dark" ? "dark" : "light",
  );
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [selectionRect, setSelectionRect] = useState<EditorRect | null>(null);
  // Keep the live Responsive rotation in React state until persistence catches
  // up. A ref-only/imperative bridge can be overwritten by the render that
  // follows pointer-up, leaving rotated editor chrome around horizontal content.
  // The state below participates in the selected element's actual render, so
  // there is no frame where React can silently remove the dropped angle.
  const [rotationPreview, setRotationPreviewState] = useState<RotationPreview | null>(null);
  const rotationPreviewRef = useRef<RotationPreview | null>(null);
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
  const [selectedCustomTextId, setSelectedCustomTextId] = useState<string | null>(null);
  const [editingCustomTextId, setEditingCustomTextId] = useState<string | null>(null);
  const [customTextDraft, setCustomTextDraft] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const parentGroupElementRef = useRef<HTMLElement | null>(null);
  const customTextTouchTapRef = useRef<Record<string, number>>({});

  const setRotationPreview = (next: RotationPreview | null) => {
    rotationPreviewRef.current = next;
    setRotationPreviewState(next);
  };

  const clearSelection = () => {
    setRotationPreview(null);
    selectedElementRef.current = null;
    parentGroupElementRef.current = null;
    setSelection(null);
    setSelectionRect(null);
    setParentGroupRect(null);
    setParentGroupLabel(null);
    setInspectorTab(null);
    setDropGuide(null);
    setEditingKey(null);
    setSelectedCustomTextId(null);
    setEditingCustomTextId(null);
  };

  const projection = useMemo(
    () => projectResumeToWeb(data, runtimeTheme),
    [data, runtimeTheme],
  );

  const customTextObjects = useMemo(
    () => getDesignObjects(data.design).filter((object): object is TextDesignObject => object.type === "text" && !object.hidden),
    [data.design],
  );
  const designPageSize = useMemo(() => resumeDesignPageSize(data.design), [data.design]);
  const customWebPageHeight = breakpoint === "mobile" ? 760 : 860;
  const customTextArtboardMinHeight = customTextObjects.reduce((max, object) => {
    const placement = effectiveLinkedTextWebPlacement(
      object,
      breakpoint,
      designPageSize.width,
      designPageSize.height,
    );
    const bottom =
      placement.page * customWebPageHeight +
      placement.yRatio * customWebPageHeight +
      Math.max(28, placement.heightRatio * customWebPageHeight) +
      72;
    return Math.max(max, bottom);
  }, customWebPageHeight);

  function customTextPlacement(object: TextDesignObject): LinkedTextPlacement {
    return effectiveLinkedTextWebPlacement(
      object,
      breakpoint,
      designPageSize.width,
      designPageSize.height,
    );
  }

  function customTextPixels(object: TextDesignObject) {
    const placement = customTextPlacement(object);
    const artboardWidth = Math.max(1, renderedArtboardWidth);
    const width = Math.max(72, placement.widthRatio * artboardWidth);
    const height = Math.max(28, placement.heightRatio * customWebPageHeight);
    const maxX = Math.max(0, artboardWidth - width);
    return {
      x: Math.max(0, Math.min(maxX, placement.xRatio * artboardWidth)),
      y: Math.max(0, placement.page * customWebPageHeight + placement.yRatio * customWebPageHeight),
      width,
      height,
      rotation: placement.rotation ?? object.rotation ?? 0,
    };
  }

  function customTextPlacementFromPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
  ): LinkedTextPlacement {
    const artboardWidth = Math.max(1, renderedArtboardWidth);
    const page = Math.max(0, Math.floor(Math.max(0, y) / customWebPageHeight));
    const localY = Math.max(0, y - page * customWebPageHeight);
    return {
      page,
      xRatio: Math.max(0, Math.min(1, x / artboardWidth)),
      yRatio: Math.max(0, Math.min(1, localY / customWebPageHeight)),
      widthRatio: Math.max(0.04, Math.min(1, width / artboardWidth)),
      heightRatio: Math.max(0.025, Math.min(1, height / customWebPageHeight)),
      rotation: rotation || undefined,
    };
  }

  function saveCustomText(object: TextDesignObject) {
    if (!onDesignChange) return;
    onDesignChange(upsertDesignObject(data.design, object));
  }

  function addCustomTextBox() {
    if (!onDesignChange) return;
    const object = createLinkedTextDesignObject(data.design, 0);
    onDesignChange(upsertDesignObject(data.design, object));
    setSelection(null);
    setSelectionRect(null);
    setSelectedCustomTextId(object.id);
    setCustomTextDraft(object.text);
    requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function beginCustomTextMove(event: ReactPointerEvent<HTMLDivElement>, object: TextDesignObject) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelection(null);
    setSelectionRect(null);
    setSelectedCustomTextId(object.id);
    if (!onDesignChange || object.locked || editingCustomTextId === object.id || event.detail >= 2) return;
    event.preventDefault();

    const start = customTextPixels(object);
    const startX = event.clientX;
    const startY = event.clientY;
    let finalX = start.x;
    let finalY = start.y;
    const element = event.currentTarget;

    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      const artboardWidth = Math.max(1, renderedArtboardWidth);
      finalX = Math.max(0, Math.min(artboardWidth - start.width, start.x + dx));
      finalY = Math.max(0, start.y + dy);
      element.style.left = `${finalX}px`;
      element.style.top = `${finalY}px`;
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const placement = customTextPlacementFromPixels(
        finalX,
        finalY,
        start.width,
        start.height,
        start.rotation,
      );
      saveCustomText(setLinkedTextWebPlacement(
        object,
        breakpoint,
        placement,
        designPageSize.width,
        designPageSize.height,
      ));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function beginCustomTextResize(event: ReactPointerEvent<HTMLDivElement>, object: TextDesignObject) {
    if (!onDesignChange || object.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedCustomTextId(object.id);

    const start = customTextPixels(object);
    const startX = event.clientX;
    const startY = event.clientY;
    let finalWidth = start.width;
    let finalHeight = start.height;
    const box = event.currentTarget.parentElement as HTMLElement | null;

    const move = (pointerEvent: PointerEvent) => {
      finalWidth = Math.max(72, start.width + (pointerEvent.clientX - startX));
      finalHeight = Math.max(28, start.height + (pointerEvent.clientY - startY));
      const maxWidth = Math.max(72, renderedArtboardWidth - start.x);
      finalWidth = Math.min(maxWidth, finalWidth);
      if (box) {
        box.style.width = `${finalWidth}px`;
        box.style.height = `${finalHeight}px`;
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const placement = customTextPlacementFromPixels(
        start.x,
        start.y,
        finalWidth,
        finalHeight,
        start.rotation,
      );
      saveCustomText(setLinkedTextWebPlacement(
        object,
        breakpoint,
        placement,
        designPageSize.width,
        designPageSize.height,
      ));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

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
      if (!selection && !selectedCustomTextId) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest("[data-web-selection-ui], [data-web-custom-text]")) return;

      const viewport = viewportRef.current;
      if (!viewport || !viewport.contains(target)) {
        clearSelection();
      }
    };

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    };
  }, [selection, selectedCustomTextId]);

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

  const selectedSharedBinding = sharedBindingForWebSelection(selection);
  const selectedSharedContentStatus = selectedSharedBinding
    ? isSharedContentBindingLocal(
        sharedData.design,
        "responsive",
        selectedSharedBinding,
      )
      ? "local" as const
      : "shared" as const
    : null;

  const editSelectedSharedContentOnlyHere = () => {
    if (!selectedSharedBinding || !onDataChange) return;
    onDataChange(
      unlinkSharedContentBinding(
        sharedData,
        "responsive",
        selectedSharedBinding,
      ),
    );
  };

  const relinkSelectedSharedContentUsingShared = () => {
    if (!selectedSharedBinding || !onDataChange) return;
    onDataChange(
      relinkSharedContentUsingShared(
        sharedData,
        "responsive",
        selectedSharedBinding,
      ),
    );
  };

  const relinkSelectedSharedContentUsingLocal = () => {
    if (!selectedSharedBinding || !onDataChange) return;
    onDataChange(
      relinkSharedContentUsingLocal(
        sharedData,
        "responsive",
        selectedSharedBinding,
      ),
    );
  };

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
    const preview = rotationPreviewRef.current;
    const previewRotation =
      preview && preview.selectionKey === editorSelectionKey(selection)
        ? preview.rotation
        : null;
    const placementRotation =
      rotationOverride ??
      previewRotation ??
      placementForSelection(selection).rotation ??
      0;

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
    if (!selection || selection.target === "background") {
      updateSelectionRect();
      return;
    }

    const preview = rotationPreviewRef.current;
    const key = editorSelectionKey(selection);
    const savedRotation = placementForSelection(selection).rotation ?? 0;

    // The render containing the new data.design still uses rotationPreview, so
    // clearing it here cannot create a visible snap: the following render falls
    // back to the now-identical persisted rotation.
    if (
      preview &&
      preview.selectionKey === key &&
      Math.abs(normalizeWebRotation(savedRotation - preview.rotation)) < 0.05
    ) {
      setRotationPreview(null);
      updateSelectionRect(savedRotation);
      return;
    }

    updateSelectionRect(
      preview?.selectionKey === key ? preview.rotation : undefined,
    );
  }, [
    selection?.target,
    selection?.sectionId,
    selection?.instanceId,
    breakpoint,
    data.design,
  ]);

  useEffect(() => {
    // A preview belongs to one exact selected object. Never let it bleed into a
    // newly selected element that happens to use the same target type.
    const preview = rotationPreviewRef.current;
    if (preview && preview.selectionKey !== editorSelectionKey(selection)) {
      setRotationPreview(null);
    }
  }, [selection?.target, selection?.sectionId, selection?.instanceId]);

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
      if (editingKey || editingCustomTextId) return;

      const customText = selectedCustomTextId
        ? customTextObjects.find(object => object.id === selectedCustomTextId)
        : undefined;

      if (customText) {
        if (event.key === "Escape") {
          event.preventDefault();
          clearSelection();
          return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && onDesignChange) {
          event.preventDefault();
          onDesignChange(removeDesignObject(data.design, customText.id));
          setSelectedCustomTextId(null);
          return;
        }
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && onDesignChange && !customText.locked) {
          event.preventDefault();
          const amount = event.shiftKey ? 10 : 1;
          const box = customTextPixels(customText);
          let x = box.x;
          let y = box.y;
          if (event.key === "ArrowLeft") x -= amount;
          if (event.key === "ArrowRight") x += amount;
          if (event.key === "ArrowUp") y -= amount;
          if (event.key === "ArrowDown") y += amount;
          x = Math.max(0, Math.min(Math.max(0, renderedArtboardWidth - box.width), x));
          y = Math.max(0, y);
          const placement = customTextPlacementFromPixels(x, y, box.width, box.height, box.rotation);
          onDesignChange(upsertDesignObject(
            data.design,
            setLinkedTextWebPlacement(customText, breakpoint, placement, designPageSize.width, designPageSize.height),
          ));
          return;
        }
        return;
      }

      if (!selection) return;
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
  }, [selection, breakpoint, data.design, editingKey, editingCustomTextId, selectedCustomTextId, customTextObjects, renderedArtboardWidth, onDesignChange]);

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
    minHeight: Math.max(breakpoint === "mobile" ? 760 : 860, customTextArtboardMinHeight),
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

    // Keep editor drag movement on the individual CSS translate channel.
    // Using `transform` here competes with Web motion effects (which also animate
    // transform) and can make the selection overlay move while the rendered
    // card/text appears to stay behind. `translate` composes independently with
    // the persisted `rotate` property and animated transform.
    const originalTranslate = element.style.getPropertyValue("translate");
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

      element.style.setProperty("translate", `${dx}px ${dy}px`);

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
      if (originalTranslate) element.style.setProperty("translate", originalTranslate);
      else element.style.removeProperty("translate");
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
      !selectionRect ||
      !selectedElementRef.current ||
      !viewportRef.current ||
      !onDesignChange ||
      selection.target === "background"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = selectedElementRef.current;
    const viewport = viewportRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const gestureRect: EditorRect = { ...selectionRect };
    const centerX =
      viewportRect.left - viewport.scrollLeft +
      gestureRect.left + gestureRect.width / 2;
    const centerY =
      viewportRect.top - viewport.scrollTop +
      gestureRect.top + gestureRect.height / 2;

    const startPlacement = placementForSelection(selection);
    const previewKey = editorSelectionKey(selection);
    let rotation = startPlacement.rotation ?? gestureRect.rotation ?? 0;

    const paintLiveRotation = (nextRotation: number) => {
      rotation = nextRotation;
      const preview = { selectionKey: previewKey, rotation: nextRotation };
      setRotationPreview(preview);

      // Keep the pointer gesture visually immediate even before React paints.
      // React renders the same value from rotationPreview, so this imperative
      // write is never the source of truth and cannot be lost on pointer-up.
      element.style.rotate = nextRotation ? `${nextRotation}deg` : "";
      setSelectionRect({
        ...gestureRect,
        rotation: nextRotation,
      });
    };

    paintLiveRotation(rotation);

    const move = (moveEvent: PointerEvent) => {
      const nextRotation = snapWebRotation(
        Math.atan2(
          moveEvent.clientY - centerY,
          moveEvent.clientX - centerX,
        ) * 180 / Math.PI + 90,
      );

      paintLiveRotation(nextRotation);
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);

      // Keep rotationPreview alive across the design update. It is cleared only
      // by the layout effect once the persisted placement reports this angle.
      paintLiveRotation(rotation);

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

      requestAnimationFrame(() => {
        updateSelectionRect(rotation);
      });
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

  function previewRotationForRenderable(
    target: WebElementTarget | "section",
    instanceId?: string,
    sectionId?: WebSectionId,
  ): number | null {
    const preview = rotationPreview;
    if (!preview || !selection || selection.target === "background") {
      return null;
    }
    if (preview.selectionKey !== editorSelectionKey(selection)) return null;

    if (selection.instanceId) {
      return selection.instanceId === instanceId ? preview.rotation : null;
    }

    if (selection.target === "section") {
      return target === "section" && selection.sectionId === sectionId
        ? preview.rotation
        : null;
    }

    return selection.target === target && !instanceId
      ? preview.rotation
      : null;
  }

  function elementPlacementStyle(
    target: WebElementTarget,
    instanceId?: string,
  ): CSSProperties {
    const placement = instanceId
      ? getWebInstancePlacement(data.design, breakpoint, instanceId)
      : getWebElementPlacement(data.design, breakpoint, target);
    const previewRotation = previewRotationForRenderable(target, instanceId);
    return webPlacementToStyle(
      previewRotation == null
        ? placement
        : { ...placement, rotation: previewRotation || undefined },
    );
  }

  function sectionPlacementStyle(sectionId: WebSectionId): CSSProperties {
    const placement = getWebSectionPlacement(data.design, breakpoint, sectionId);
    const previewRotation = previewRotationForRenderable(
      "section",
      undefined,
      sectionId,
    );
    return {
      ...webPlacementToStyle(
        previewRotation == null
          ? placement
          : { ...placement, rotation: previewRotation || undefined },
        { section: true },
      ),
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
    commitSurfaceData({
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
    commitSurfaceData(withResumeProjects(data, nextProjects));
  }

  function updateEducation(
    id: string,
    patch: Partial<NonNullable<ResumeData["education"]>[number]>,
  ) {
    if (!onDataChange) return;
    commitSurfaceData({
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
              commitSurfaceData({ ...data, summary: value });
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
                  padding: templatePresentation.timeline ? "14px 0 14px 20px" : "14px 0",
                  borderTop: templatePresentation.timeline
                    ? "none"
                    : index === 0
                      ? "none"
                      : "1px solid var(--web-border)",
                  borderLeft: templatePresentation.timeline
                    ? "2px solid var(--web-accent)"
                    : undefined,
                  ...elementPlacementStyle("experience", instanceId),
                  ...boxStyle("experience", instanceId),
                }}
              >
                {templatePresentation.timeline && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: -6,
                      top: 19,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--web-accent)",
                      border: "2px solid var(--web-page)",
                      boxSizing: "border-box",
                      pointerEvents: "none",
                    }}
                  />
                )}
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

  const templateUsesSidebar = templatePresentation.layout !== "single";
  const templateHasSideRail = templateUsesSidebar && breakpoint !== "mobile";
  const templateSidebarLeft = templatePresentation.layout === "sidebar-left";
  const templateSidebarSurface =
    runtimeTheme === "dark"
      ? "var(--web-accent-soft)"
      : templatePresentation.sidebarColor.trim() || "var(--web-accent-soft)";
  const templateLayoutGap = breakpoint === "tablet" ? 24 : 34;
  const templateHeroPadding = breakpoint === "mobile" ? 20 : breakpoint === "tablet" ? 20 : 24;

  return (
    <div style={{ width: "100%", minWidth: 0, height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
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
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 10,
          padding: "0 2px",
          flex: "0 0 auto",
        }}
      >
        <div
          style={{
            minWidth: 180,
            flex: "1 1 260px",
            color: "#71717a",
            fontSize: 9,
            lineHeight: 1.35,
          }}
        >
          Select anything on the page to edit it.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 7,
          }}
        >
          <button
            type="button"
            onClick={addCustomTextBox}
            disabled={!onDesignChange}
            title="Add a textbox linked to Designed PDF by default"
            style={{
              height: 32,
              padding: "0 10px",
              border: "1px solid #ddd6fe",
              borderRadius: 8,
              background: "#fff",
              color: "#6d28d9",
              cursor: onDesignChange ? "pointer" : "default",
              fontSize: 9.5,
              fontWeight: 800,
              whiteSpace: "nowrap",
              opacity: onDesignChange ? 1 : .45,
            }}
          >
            + Text
          </button>

          <div
            role="group"
            aria-label="Responsive preview size"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              border: "1px solid #e4e4e7",
              borderRadius: 9,
              background: "#fff",
              boxShadow: "0 1px 2px rgba(15,23,42,.035)",
            }}
          >
            {([
              ["desktop", "Desktop", "Base layout"],
              ["tablet", "Tablet", "Responsive layout"],
              ["mobile", "Mobile", "Responsive layout"],
            ] as Array<[WebBreakpoint, string, string]>).map(([bp, label, hint]) => {
              const active = breakpoint === bp;
              const glyphWidth = bp === "desktop" ? 15 : bp === "tablet" ? 11 : 8;
              const glyphHeight = bp === "mobile" ? 15 : bp === "tablet" ? 14 : 11;

              return (
                <button
                  key={bp}
                  type="button"
                  aria-pressed={active}
                  title={`${label} · ${BREAKPOINT_WIDTH[bp]}px · ${hint}`}
                  onClick={() => {
                    setBreakpoint(bp);
                    clearSelection();
                    window.requestAnimationFrame(() => {
                      viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
                    });
                  }}
                  style={{
                    height: 32,
                    minWidth: 78,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "0 9px",
                    border: active ? "1px solid #ddd6fe" : "1px solid transparent",
                    borderRadius: 7,
                    background: active ? "#f5f3ff" : "transparent",
                    color: active ? "#5b21b6" : "#71717a",
                    cursor: "pointer",
                    fontSize: 9.5,
                    fontWeight: active ? 800 : 650,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    transition: "background .15s ease, color .15s ease, border-color .15s ease",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: glyphWidth,
                      height: glyphHeight,
                      border: "1.4px solid currentColor",
                      borderRadius: bp === "mobile" ? 3 : 2.5,
                      boxSizing: "border-box",
                      position: "relative",
                    }}
                  >
                    {bp === "desktop" && (
                      <span
                        style={{
                          position: "absolute",
                          left: "50%",
                          bottom: -4,
                          width: 7,
                          height: 1.4,
                          borderRadius: 2,
                          background: "currentColor",
                          transform: "translateX(-50%)",
                        }}
                      />
                    )}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          <span
            title={
              breakpoint === "desktop"
                ? "Desktop is the base Web layout."
                : `${breakpoint === "tablet" ? "Tablet" : "Mobile"} inherits the larger layout until you make an override.`
            }
            style={{
              display: "inline-flex",
              height: 28,
              alignItems: "center",
              borderRadius: 999,
              background: "#f4f4f5",
              padding: "0 8px",
              color: "#71717a",
              fontSize: 8.5,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {BREAKPOINT_WIDTH[breakpoint]}px
          </span>

          <span style={{ width: 1, height: 20, background: "#e4e4e7" }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <button
              type="button"
              title="Replay animations"
              aria-label="Replay animations"
              onClick={() => setMotionReplay(value => value + 1)}
              style={{ ...iconButton, minWidth: 31, height: 26 }}
            >
              ↻
            </button>

            <button
              type="button"
              title="Switch preview theme"
              aria-label="Switch preview theme"
              onClick={() => setRuntimeTheme(theme => theme === "dark" ? "light" : "dark")}
              style={{ ...iconButton, minWidth: 31, height: 26 }}
            >
              {runtimeTheme === "dark" ? "☀" : "◐"}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        data-web-primary-scroll
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
          flex: "1 1 auto",
          minHeight: 0,
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

          <div
            data-web-shared-template-layout
            data-web-template-id={templatePresentation.templateId || undefined}
            style={{
              position: "relative",
              zIndex: 1,
              display: templateHasSideRail ? "grid" : "block",
              gridTemplateColumns: templateHasSideRail
                ? templateSidebarLeft
                  ? "minmax(190px, 30%) minmax(0, 1fr)"
                  : "minmax(0, 1fr) minmax(190px, 30%)"
                : undefined,
              gap: templateHasSideRail ? templateLayoutGap : undefined,
              alignItems: "stretch",
              minWidth: 0,
            }}
          >
            <div
              data-web-template-hero-column
              style={{
                minWidth: 0,
                ...(templateHasSideRail
                  ? {
                      gridColumn: templateSidebarLeft ? 1 : 2,
                      gridRow: 1,
                    }
                  : {}),
                ...(templateUsesSidebar
                  ? {
                      alignSelf: "stretch",
                      borderRadius: 14,
                      background: templateSidebarSurface,
                      padding: templateHeroPadding,
                      marginBottom: templateHasSideRail ? 0 : 28,
                      boxSizing: "border-box",
                    }
                  : {}),
              }}
            >
          <header
            {...selectableAttrs("hero", "Personal info", { motion: "hero" })}
            data-web-group-root
            style={{
              ...baseSelectableStyle,
              display: "grid",
              gridTemplateColumns:
                templateUsesSidebar ||
                breakpoint === "mobile" ||
                !settings.showPhoto ||
                !projection.profilePhoto
                  ? "1fr"
                  : "minmax(0,1fr) auto",
              alignItems: "start",
              gap: templateUsesSidebar ? 16 : 26,
              marginBottom: templateUsesSidebar ? 0 : 28,
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
                  fontSize: templateUsesSidebar
                    ? breakpoint === "mobile" ? 38 : 40
                    : breakpoint === "mobile" ? 38 : 54,
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
                    commitSurfaceData({ ...data, firstName: value });
                  }}
                />
                {(data.firstName || data.lastName) && " "}
                <EditableText
                  value={data.lastName ?? ""}
                  editing={editingKey === "lastName"}
                  onStartEdit={() => setEditingKey("lastName")}
                  onCommit={value => {
                    setEditingKey(null);
                    commitSurfaceData({ ...data, lastName: value });
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
                      commitSurfaceData({ ...data, summary: value });
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
                  width: templateUsesSidebar ? 96 : breakpoint === "mobile" ? 96 : 132,
                  height: templateUsesSidebar ? 96 : breakpoint === "mobile" ? 96 : 132,
                  objectFit: "cover",
                  ...photoPlacement,
                  ...boxStyle("photo"),
                }}
              />
            )}
          </header>
            </div>

            <div
              data-web-template-main-column
              style={{
                minWidth: 0,
                ...(templateHasSideRail
                  ? {
                      gridColumn: templateSidebarLeft ? 2 : 1,
                      gridRow: 1,
                    }
                  : {}),
              }}
            >
              {templatePresentation.headerAccent && (
                <div
                  aria-hidden="true"
                  data-web-template-header-accent
                  style={{
                    height: 3,
                    width: "100%",
                    borderRadius: 999,
                    background: "var(--web-accent)",
                    marginBottom: 18,
                  }}
                />
              )}

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
          </div>

          {customTextObjects.map(object => {
            const box = customTextPixels(object);
            const selectedText = selectedCustomTextId === object.id;
            const editingText = editingCustomTextId === object.id;
            const browserFont = String(object.fontFamily ?? "").includes("Times")
              ? "'Times New Roman', Times, serif"
              : String(object.fontFamily ?? "").includes("Courier")
                ? "'Courier New', Courier, monospace"
                : "Arial, Helvetica, sans-serif";
            const inferredBold = String(object.fontFamily ?? "").includes("Bold");
            const fontWeight = object.fontWeight ?? (inferredBold ? 700 : 400);

            const commitText = () => {
              const nextText = customTextDraft.trimEnd() || "Text";
              saveCustomText({ ...object, text: nextText });
              setEditingCustomTextId(null);
            };

            return (
              <div
                key={object.id}
                data-web-custom-text={object.id}
                onPointerDown={event => beginCustomTextMove(event, object)}
                onDoubleClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (object.locked) return;
                  setSelection(null);
                  setSelectionRect(null);
                  setSelectedCustomTextId(object.id);
                  setCustomTextDraft(object.text);
                  setEditingCustomTextId(object.id);
                }}
                onTouchEnd={event => {
                  if (object.locked || editingText) return;
                  const now = Date.now();
                  const previous = customTextTouchTapRef.current[object.id] ?? 0;
                  customTextTouchTapRef.current[object.id] = now;
                  if (now - previous > 0 && now - previous < 360) {
                    event.preventDefault();
                    event.stopPropagation();
                    customTextTouchTapRef.current[object.id] = 0;
                    setSelection(null);
                    setSelectionRect(null);
                    setSelectedCustomTextId(object.id);
                    setCustomTextDraft(object.text);
                    setEditingCustomTextId(object.id);
                  }
                }}
                style={{
                  position: "absolute",
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  zIndex: 120 + (object.zIndex ?? 0),
                  transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
                  transformOrigin: "center center",
                  boxSizing: "border-box",
                  color: object.color ?? "var(--web-ink)",
                  fontFamily: browserFont,
                  fontSize: object.fontSize ?? 12,
                  fontWeight,
                  fontStyle: object.fontStyle ?? "normal",
                  textAlign: object.textAlign ?? "left",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.25,
                  opacity: object.opacity ?? 1,
                  cursor: object.locked ? "not-allowed" : editingText ? "text" : "move",
                  userSelect: editingText ? "text" : "none",
                  outline: selectedText ? "2px solid #7c3aed" : "1px solid transparent",
                  outlineOffset: selectedText ? 2 : 0,
                }}
              >
                {editingText ? (
                  <textarea
                    autoFocus
                    value={customTextDraft}
                    onChange={event => setCustomTextDraft(event.target.value)}
                    onPointerDown={event => event.stopPropagation()}
                    onBlur={commitText}
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setCustomTextDraft(object.text);
                        setEditingCustomTextId(null);
                      }
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        commitText();
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      resize: "none",
                      border: 0,
                      outline: 0,
                      margin: 0,
                      padding: 0,
                      background: runtimeTheme === "dark" ? "rgba(24,24,27,.92)" : "rgba(255,255,255,.94)",
                      color: "inherit",
                      font: "inherit",
                      fontStyle: "inherit",
                      textAlign: "inherit",
                      lineHeight: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  object.text
                )}

                {selectedText && !editingText && (
                  <>
                    <div
                      data-web-selection-ui
                      onPointerDown={event => event.stopPropagation()}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: box.y < 54 ? "calc(100% + 8px)" : -42,
                        minHeight: 34,
                        maxWidth: 470,
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 5,
                        padding: 4,
                        border: "1px solid #e4e4e7",
                        borderRadius: 8,
                        background: "#fff",
                        color: "#52525b",
                        boxShadow: "0 7px 22px rgba(15,23,42,.14)",
                        fontFamily: "system-ui, sans-serif",
                        transform: box.rotation ? `rotate(${-box.rotation}deg)` : undefined,
                        transformOrigin: "left center",
                        zIndex: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        type="button"
                        title={object.webLayoutUnlinked ? "Relink Web layout to Designed PDF" : "Unlink Web layout from Designed PDF"}
                        onClick={() => saveCustomText(setLinkedTextLayoutUnlinked(
                          object,
                          !object.webLayoutUnlinked,
                          designPageSize.width,
                          designPageSize.height,
                        ))}
                        style={{
                          height: 26,
                          border: object.webLayoutUnlinked ? "1px solid #e4e4e7" : "1px solid #ddd6fe",
                          borderRadius: 6,
                          background: object.webLayoutUnlinked ? "#fafafa" : "#faf5ff",
                          color: object.webLayoutUnlinked ? "#71717a" : "#6d28d9",
                          padding: "0 7px",
                          cursor: "pointer",
                          fontSize: 8.5,
                          fontWeight: 800,
                        }}
                      >
                        {object.webLayoutUnlinked ? "Layout unlinked" : "🔗 Linked to PDF"}
                      </button>

                      <input
                        type="color"
                        aria-label="Text color"
                        value={object.color ?? "#111827"}
                        onChange={event => saveCustomText({ ...object, color: event.target.value })}
                        style={{ width: 28, height: 26, padding: 1, border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff" }}
                      />

                      <input
                        type="number"
                        aria-label="Font size"
                        min={6}
                        max={96}
                        value={object.fontSize ?? 12}
                        onChange={event => saveCustomText({ ...object, fontSize: Math.max(6, Math.min(96, Number(event.target.value) || 12)) })}
                        style={{ width: 46, height: 26, border: "1px solid #e4e4e7", borderRadius: 6, padding: "0 5px", fontSize: 9 }}
                      />

                      <button
                        type="button"
                        title="Bold"
                        onClick={() => saveCustomText({ ...object, fontWeight: Number(fontWeight) >= 600 ? 400 : 700 })}
                        style={{ width: 27, height: 26, border: "1px solid #e4e4e7", borderRadius: 6, background: Number(fontWeight) >= 600 ? "#f5f3ff" : "#fff", color: Number(fontWeight) >= 600 ? "#6d28d9" : "#52525b", fontWeight: 900, cursor: "pointer" }}
                      >
                        B
                      </button>

                      <button
                        type="button"
                        title="Italic"
                        onClick={() => saveCustomText({ ...object, fontStyle: object.fontStyle === "italic" ? "normal" : "italic" })}
                        style={{ width: 27, height: 26, border: "1px solid #e4e4e7", borderRadius: 6, background: object.fontStyle === "italic" ? "#f5f3ff" : "#fff", color: object.fontStyle === "italic" ? "#6d28d9" : "#52525b", fontStyle: "italic", cursor: "pointer" }}
                      >
                        I
                      </button>

                      <select
                        aria-label="Text alignment"
                        value={object.textAlign ?? "left"}
                        onChange={event => saveCustomText({ ...object, textAlign: event.target.value as TextDesignObject["textAlign"] })}
                        style={{ height: 26, border: "1px solid #e4e4e7", borderRadius: 6, background: "#fff", color: "#52525b", fontSize: 8.5 }}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>

                      <button
                        type="button"
                        title="Delete text box"
                        onClick={() => {
                          if (!onDesignChange) return;
                          onDesignChange(removeDesignObject(data.design, object.id));
                          setSelectedCustomTextId(null);
                        }}
                        style={{ height: 26, border: "1px solid #fecaca", borderRadius: 6, background: "#fffafa", color: "#dc2626", padding: "0 7px", cursor: "pointer", fontSize: 8.5, fontWeight: 800 }}
                      >
                        Delete
                      </button>
                    </div>

                    {!object.locked && (
                      <div
                        data-web-selection-ui
                        title="Resize text box"
                        onPointerDown={event => beginCustomTextResize(event, object)}
                        style={{
                          position: "absolute",
                          right: -6,
                          bottom: -6,
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          border: "2px solid #fff",
                          background: "#7c3aed",
                          boxShadow: "0 1px 4px rgba(15,23,42,.25)",
                          cursor: "nwse-resize",
                          transform: box.rotation ? `rotate(${-box.rotation}deg)` : undefined,
                          zIndex: 501,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
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
              sharedContentStatus={selectedSharedContentStatus}
              sharedContentLabel={selectedSharedBinding ? sharedContentBindingLabel(selectedSharedBinding) : null}
              showMore={!!(
                selectedWorkLogoEntryId ||
                selectedRotationSyncTarget ||
                selectedWorkLogoEntry ||
                (roleForSelection && !textLinked) ||
                (selection.instanceId && studio.instances[selection.instanceId])
              )}
              activeTab={inspectorTab}
              onActiveTab={setInspectorTab}
              onSelectParent={parentGroupLabel ? selectParentGroup : undefined}
              onClear={clearSelection}
            />

            {inspectorTab && (
              <InspectorPopover
                rect={selectionRect}
                viewportWidth={viewportRef.current?.clientWidth ?? 900}
                viewportHeight={viewportRef.current?.clientHeight ?? 700}
                viewportScrollLeft={viewportRef.current?.scrollLeft ?? 0}
                viewportScrollTop={viewportRef.current?.scrollTop ?? 0}
              >
                {inspectorTab === "shared" && selectedSharedBinding && selectedSharedContentStatus && (
                  <SharedContentInspector
                    status={selectedSharedContentStatus}
                    label={sharedContentBindingLabel(selectedSharedBinding)}
                    surfaceLabel="Responsive Web"
                    onEditOnlyHere={editSelectedSharedContentOnlyHere}
                    onRelinkUseShared={relinkSelectedSharedContentUsingShared}
                    onRelinkUseLocal={relinkSelectedSharedContentUsingLocal}
                  />
                )}

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
                    {(selectedWorkLogoEntryId || selectedRotationSyncTarget) && (
                      <div style={{
                        display: "grid",
                        gap: 7,
                        border: "1px solid #e4e4e7",
                        borderRadius: 9,
                        padding: 9,
                      }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 800 }}>Relationships</div>
                          <div style={{ marginTop: 2, color: "#71717a", fontSize: 8, lineHeight: 1.4 }}>
                            Choose what this Web element should keep synchronized.
                          </div>
                        </div>

                        {selectedWorkLogoEntryId && (
                          <button
                            type="button"
                            onClick={() => {
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
                            }}
                            style={{
                              height: 30,
                              border: selectedLogoSameTypeLinked ? "1px solid #fde68a" : "1px solid #e4e4e7",
                              borderRadius: 8,
                              background: selectedLogoSameTypeLinked ? "#fffbeb" : "#fafafa",
                              color: selectedLogoSameTypeLinked ? "#a16207" : "#52525b",
                              cursor: "pointer",
                              fontSize: 8.5,
                              fontWeight: 800,
                            }}
                          >
                            {selectedLogoSameTypeLinked
                              ? `⛓ Match all company logos · ${workEntryIds.length}`
                              : "Use an individual logo size"}
                          </button>
                        )}

                        {selectedWorkLogoEntryId && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!onDesignChange) return;
                              if (companyLogoCrossFormatLinked) {
                                onDesignChange(setCompanyLogoCrossFormatLinked(data.design, false));
                                return;
                              }
                              let next = setCompanyLogoCrossFormatLinked(data.design, true);
                              next = syncCompanyLogoSizeFromWebNow(
                                next,
                                breakpoint,
                                selectedWorkLogoEntryId,
                                workEntryIds,
                              );
                              onDesignChange(next);
                            }}
                            style={{
                              height: 30,
                              border: companyLogoCrossFormatLinked ? "1px solid #ddd6fe" : "1px solid #e4e4e7",
                              borderRadius: 8,
                              background: companyLogoCrossFormatLinked ? "#f5f3ff" : "#fafafa",
                              color: companyLogoCrossFormatLinked ? "#6d28d9" : "#52525b",
                              cursor: "pointer",
                              fontSize: 8.5,
                              fontWeight: 800,
                            }}
                          >
                            {companyLogoCrossFormatLinked ? "⇄ Logo size · PDF + Web" : "Logo size · Web only"}
                          </button>
                        )}

                        {selectedRotationSyncTarget && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!onDesignChange || !selectedRotationSyncTarget) return;
                              onDesignChange(
                                setWebRotationCrossFormatLinked(
                                  data.design,
                                  breakpoint,
                                  selectedRotationSyncTarget,
                                  !selectedRotationCrossFormatLinked,
                                ),
                              );
                            }}
                            style={{
                              height: 30,
                              border: selectedRotationCrossFormatLinked ? "1px solid #ddd6fe" : "1px solid #e4e4e7",
                              borderRadius: 8,
                              background: selectedRotationCrossFormatLinked ? "#f5f3ff" : "#fafafa",
                              color: selectedRotationCrossFormatLinked ? "#6d28d9" : "#52525b",
                              cursor: "pointer",
                              fontSize: 8.5,
                              fontWeight: 800,
                            }}
                          >
                            {selectedRotationCrossFormatLinked ? "↻ Rotation · PDF + Web" : "↻ Rotation · Web only"}
                          </button>
                        )}
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
                          setInspectorTab(null);
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
                          setInspectorTab(null);
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
                onClick={clearSelection}
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
