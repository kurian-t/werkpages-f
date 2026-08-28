/**
 * ResumeCanvas - interactive DOM-rendered resume.\n * Phase 13D: Web animation editing is contextual inside the Web preview; PDF canvas geometry is unchanged.\n * Phase 13C: Web Animation Studio remains separate from PDF geometry.
 * Phase 13B: web-only video/projects/GitHub/animations remain outside PDF geometry.
 * Phase 13: web superpowers remain a separate responsive projection; PDF canvas interaction model preserved.
 * Phase 12: responsive web resume is a separate projection; canvas geometry stays PDF-focused.
 * Phase 11: design intelligence remains external to canvas geometry; latest interaction fixes preserved.
 * Phase 9: Templates 2.0 uses this same editable canvas; templates only seed design state.
 * Single-click → floating style popover.
 * Double-click → contenteditable in-place text editing.
 *
 * contenteditable is used instead of <input> because inputs inside a CSS
 * transform:scale() container have broken keyboard routing in Chromium -
 * the space key gets swallowed. contenteditable uses the browser's native
 * editing engine which works correctly inside any container.
 */
import { CSSProperties, ReactNode, useState, useRef, useEffect, useLayoutEffect, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_DESIGN } from "./defaults";
import type { ResumeData, ResumeDesign, TextStyle, FontFamily, WorkEntry, EducationEntry, BulletPoint, LayoutOverride } from "./types";
import { formatDateRange, formatEduYears, genId } from "./types";
import {
  getResumeProjects,
  projectHasContent,
  splitTechStack,
  withResumeProjects,
  type ResumeProjectEntry,
} from "./resumeProjects";
import { Link2, Unlink2, List, ListOrdered, Plus, ChevronDown, Square, Circle, Minus, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, MoreHorizontal, Trash2, Image as ImageIcon, User, Upload, Layers3, Eye, EyeOff, Lock, Unlock, GripVertical, X, FileText, Check, MoveHorizontal, MoveVertical, Pencil } from "lucide-react";
import { companyLogoDomain } from "@/lib/utils";
import {
  applyLinkedDesignObjectChange,
  canLinkDesignObjects,
  copyLinkedDesignAppearance,
  designObjectsForPage,
  getDesignObjects,
  linkedDesignObjectPeers,
  normalizeDesignObjectLinks,
  removeDesignObject,
  upsertDesignObject,
  withDesignObjects,
  type DesignObjectAttachment,
  type DesignObjectLayer,
  type DesignSectionTarget,
  type ImageDesignKind,
  type ImageDesignObject,
  type ImageMask,
  type ImageShadow,
  type ResumeDesignObject,
  type ShapeDesignObject,
  type SmartDesignKind,
  type SmartDesignObject,
  type TextDesignObject,
  createLinkedTextDesignObject,
  setLinkedTextLayoutUnlinked,
} from "./resumeDesignObjects";
import {
  prepareResumeImageFile,
  resumeImageTargetChars,
} from "./resumeImageCompression";
import {
  applyPdfEditorTextStylePatch,
  isCompanyLogoCrossFormatLinked,
  isWebTextLinked,
  setCompanyLogoCrossFormatLinked,
  setWebTextLinked,
  syncCompanyLogoSizeFromPdf,
  syncCompanyLogoSizeFromPdfNow,
  visualRoleForDesignKey,
} from "./resumePresentation";
import {
  CONTEXT_ACTIVE_BUTTON,
  CONTEXT_BUTTON,
  CONTEXT_ICON_BUTTON,
  CONTEXT_POPOVER_SURFACE,
  CONTEXT_PURPLE,
  CONTEXT_TOOLBAR_SURFACE,
  CONTEXT_WARNING_BUTTON,
} from "./resumeContextualUi";

// ── Editor-only PDF canvas zoom ──────────────────────────────────────────────

// Zoom is deliberately an editor preference, not resume design state.
// It changes only how large the PDF canvas appears while editing; exports and
// saved resume geometry remain untouched.
const PDF_CANVAS_ZOOM_STORAGE_KEY = "werkpages.resumeBuilder.pdfCanvasZoom";
const PDF_CANVAS_ZOOM_MIN = 0.4;
const PDF_CANVAS_ZOOM_MAX = 1.4;
const PDF_CANVAS_ZOOM_STEP = 0.1;
const PDF_CANVAS_ZOOM_DEFAULT = 0.8;

function clampPdfCanvasZoom(value: number): number {
  return Math.min(PDF_CANVAS_ZOOM_MAX, Math.max(PDF_CANVAS_ZOOM_MIN, value));
}

function readInitialPdfCanvasZoom(): number {
  if (typeof window === "undefined") return PDF_CANVAS_ZOOM_DEFAULT;
  try {
    const saved = Number(window.localStorage.getItem(PDF_CANVAS_ZOOM_STORAGE_KEY));
    return Number.isFinite(saved)
      ? clampPdfCanvasZoom(saved)
      : PDF_CANVAS_ZOOM_DEFAULT;
  } catch {
    return PDF_CANVAS_ZOOM_DEFAULT;
  }
}

// ── Font mapping: PDF built-ins → CSS ────────────────────────────────────────

const FONT_CSS: Record<FontFamily, CSSProperties> = {
  "Helvetica":             { fontFamily: "Helvetica, Arial, sans-serif" },
  "Helvetica-Bold":        { fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 },
  "Helvetica-Oblique":     { fontFamily: "Helvetica, Arial, sans-serif", fontStyle: "italic" },
  "Helvetica-BoldOblique": { fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontStyle: "italic" },
  "Times-Roman":           { fontFamily: "'Times New Roman', Times, serif" },
  "Times-Bold":            { fontFamily: "'Times New Roman', Times, serif", fontWeight: 700 },
  "Times-Italic":          { fontFamily: "'Times New Roman', Times, serif", fontStyle: "italic" },
  "Times-BoldItalic":      { fontFamily: "'Times New Roman', Times, serif", fontWeight: 700, fontStyle: "italic" },
  "Courier":               { fontFamily: "'Courier New', Courier, monospace" },
  "Courier-Bold":          { fontFamily: "'Courier New', Courier, monospace", fontWeight: 700 },
  "Courier-Oblique":       { fontFamily: "'Courier New', Courier, monospace", fontStyle: "italic" },
  "Courier-BoldOblique":   { fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, fontStyle: "italic" },
};

export function toCss(s: TextStyle, extra?: CSSProperties): CSSProperties {
  const out: CSSProperties = {
    ...FONT_CSS[s.fontFamily],
    fontSize: s.fontSize,
    color: s.color,
    backgroundColor: s.backgroundColor === "transparent" ? undefined : s.backgroundColor,
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
    lineHeight: s.lineHeight,
    textTransform: s.textTransform === "none" ? undefined : (s.textTransform as CSSProperties["textTransform"]),
    textAlign: s.textAlign !== "left" ? (s.textAlign as CSSProperties["textAlign"]) : undefined,
    marginTop: s.marginTop || undefined,
    marginBottom: s.marginBottom || undefined,
    marginLeft: s.marginLeft || undefined,
    marginRight: s.marginRight || undefined,
    paddingTop: s.paddingTop || undefined,
    paddingBottom: s.paddingBottom || undefined,
    paddingLeft: s.paddingLeft || undefined,
    paddingRight: s.paddingRight || undefined,
    borderRadius: s.borderRadius || undefined,
    borderBottom: s.borderBottomWidth > 0 && s.borderBottomColor !== "transparent"
      ? `${s.borderBottomWidth}px solid ${s.borderBottomColor}` : undefined,
  };
  return extra ? { ...out, ...extra } : out;
}

// ── Company logo with logo.dev fallback ──────────────────────────────────────

const LOGO_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";

function CanvasLogo({ company, logoUrl }: { company: string; logoUrl?: string }) {
  const logoDevUrl = `https://img.logo.dev/${companyLogoDomain(company)}?token=${LOGO_TOKEN}`;
  const [src, setSrc] = useState(logoUrl ?? logoDevUrl);
  const [failed, setFailed] = useState(false);

  // Reset when company or logoUrl changes so the logo refreshes without a page reload.
  useEffect(() => {
    const fresh = `https://img.logo.dev/${companyLogoDomain(company)}?token=${LOGO_TOKEN}`;
    setSrc(logoUrl ?? fresh);
    setFailed(false);
  }, [company, logoUrl]);

  if (failed || !company.trim()) return null;
  return (
    // width:"100%" fills the SubDrag wrapper - default is 20px (from defaultWidth={20}),
    // grows when the user drags the resize handle to save a larger override.
    <img
      src={src}
      alt=""
      onError={() => {
        if (src !== logoDevUrl) setSrc(logoDevUrl);
        else setFailed(true);
      }}
      style={{ width: "100%", height: "auto", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: 3, marginBottom: 3, display: "block" }}
    />
  );
}

// ── Section bounds context (for child sub-element dragging) ──────────────────

interface SectionBoundsCtxValue {
  containerRef: React.RefObject<HTMLDivElement | null>;
  design: ResumeDesign;
  onDesignChange: (d: ResumeDesign) => void;
  scale: number;
}
const SectionBoundsCtx = createContext<SectionBoundsCtxValue | null>(null);

// Bullet editing state lives here so it survives FreeFormLayout's pass-1 ↔ pass-2
// remount cycle. Key format: "<entryKey>:<bulletId>", e.g. "work.abc123:bullet456".
const BulletEditCtx = createContext<{
  key: string | null;
  set: (k: string | null) => void;
}>({ key: null, set: () => {} });

// Snap angle to nearest right-angle; magnet activates within 8 degrees.
function snapRotation(r: number): number {
  const SNAP = 8;
  for (const s of [0, 90, -90, 180, -180, 270, -270]) {
    if (Math.abs(r - s) < SNAP) return s;
  }
  return r;
}

// SubDrag - wraps an individual sub-element within a section block.
// Independently moveable (visualDx/visualDy), resizable (width), and rotatable.
// Movement is clamped to the section bounds. All overrides are visual-only (no cascade).
//
// Repeatable work-entry elements can also be LINKED. Linked peers share layout edits
// (move, resize, rotation) while their actual text/logo content remains entry-specific.
// The link state is persisted on the element's LayoutOverride so it survives remeasure,
// pagination remounts, and reloads without requiring a separate settings model.
type LinkableLayoutOverride = LayoutOverride & { linked?: boolean };

function linkedOverride(ov: LayoutOverride | undefined): LinkableLayoutOverride | undefined {
  return ov as LinkableLayoutOverride | undefined;
}

function SubDrag({
  overrideKey,
  defaultWidth,
  design,
  inheritFrom,
  linkKeys,
  linkLabel,
  crossFormatCompanyLogo = false,
  allWorkEntryIds,
  constrainToBounds = false,
  children,
}: {
  overrideKey: string;
  defaultWidth?: number;
  design?: ResumeDesign;
  inheritFrom?: string;
  linkKeys?: string[];
  linkLabel?: string;
  crossFormatCompanyLogo?: boolean;
  allWorkEntryIds?: string[];
  constrainToBounds?: boolean;
  children: ReactNode;
}) {
  const ctx = useContext(SectionBoundsCtx);
  const elRef    = useRef<HTMLDivElement>(null);  // content wrapper (carries transform)
  const outerRef = useRef<HTMLDivElement>(null);  // outer wrapper (hover zone)
  const ctxRef   = useRef(ctx);
  ctxRef.current = ctx;
  const inheritFromRef = useRef(inheritFrom);
  inheritFromRef.current = inheritFrom;
  const linkKeysRef = useRef(linkKeys);
  linkKeysRef.current = linkKeys;
  const [isHovered,  setIsHovered]  = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  // A click/drag selects this sub-element. Selection is sticky until the user clicks
  // elsewhere, so editor-only controls remain reachable even after the pointer leaves.
  const [isPinned,   setIsPinned]   = useState(false);
  // Text elements already have the main formatting toolbar. Non-text repeated elements
  // (company logo / description) get a compact matching toolbar of their own.
  const [selectedViaText, setSelectedViaText] = useState(false);
  // Prevents onMouseLeave from collapsing handles mid-operation
  const operationRef = useRef(false);

  function peerSource(designValue: ResumeDesign | undefined, currentKey = overrideKey): LinkableLayoutOverride | undefined {
    if (!designValue || !linkKeysRef.current?.length) return undefined;
    const own = linkedOverride(designValue.layoutOverrides?.[currentKey]);
    if (own?.linked === false) return undefined;
    for (const key of linkKeysRef.current) {
      if (key === currentKey) continue;
      const candidate = linkedOverride(designValue.layoutOverrides?.[key]);
      if (candidate && candidate.linked !== false) return candidate;
    }
    return undefined;
  }

  function sanitizeOverride(value: LinkableLayoutOverride): LinkableLayoutOverride {
    const next: LinkableLayoutOverride = { ...value };
    if (!next.visualDx) delete next.visualDx;
    if (!next.visualDy) delete next.visualDy;
    if (!next.rotation) delete next.rotation;
    if (!next.width)    delete next.width;
    // linked=true is the default, so only persist the explicit opt-out.
    if (next.linked !== false) delete next.linked;
    return next;
  }

  // In pass-1 (no SectionBoundsCtx), still render a width-constraining wrapper so
  // images with width:"100%" don't expand to fill the whole region column.
  // A newly-added linked item inherits a linked peer's width so pagination measures
  // it exactly as it will appear in pass 2.
  if (!ctx) {
    const own = linkedOverride(design?.layoutOverrides?.[overrideKey]);
    const source = own?.linked === false ? undefined : peerSource(design);
    const savedW = own?.width ?? source?.width;
    const savedDx = own?.visualDx ?? source?.visualDx ?? 0;
    const boundedMaxWidth = constrainToBounds
      ? `max(20px, calc(100% - ${Math.max(0, savedDx)}px))`
      : "100%";
    return (
      <div style={{
        width: savedW ?? defaultWidth ?? "fit-content",
        maxWidth: boundedMaxWidth,
        boxSizing: "border-box",
      }}>
        {children}
      </div>
    );
  }

  const override = linkedOverride(ctx.design.layoutOverrides?.[overrideKey]);
  const supportsLinking = !!linkKeys && linkKeys.length > 1;
  const isLinked = supportsLinking && override?.linked !== false;

  // Selecting a repeated element gives the linked group a short, soft amber pulse.
  // The pulse is intentionally temporary: it teaches the relationship, then fades away
  // so the resume itself stays visually clean. The link pill remains pinned until the
  // user clicks elsewhere, so the control is still easy to reach after the glow ends.
  useEffect(() => {
    if (!isPinned) return;
    const current = ctxRef.current;
    if (!current) return;

    const allowed = new Set(isLinked ? linkedPeerKeys(current.design) : [overrideKey]);
    const animations: Animation[] = [];

    document.querySelectorAll<HTMLDivElement>("[data-subdrag-key]").forEach(outer => {
      const key = outer.dataset.subdragKey;
      if (!key || !allowed.has(key)) return;
      const content = outer.querySelector<HTMLDivElement>("[data-subdrag-content]");
      if (!content) return;

      const selected = key === overrideKey;
      const strongGlow = selected
        ? "0 0 17px 6px rgba(250,204,21,0.58), 0 0 34px 12px rgba(250,204,21,0.24)"
        : "0 0 14px 5px rgba(250,204,21,0.46), 0 0 28px 10px rgba(250,204,21,0.18)";
      const softGlow = selected
        ? "0 0 9px 3px rgba(250,204,21,0.31), 0 0 19px 6px rgba(250,204,21,0.12)"
        : "0 0 8px 3px rgba(250,204,21,0.24), 0 0 16px 5px rgba(250,204,21,0.09)";
      const strongFill = selected ? "rgba(254,240,138,0.24)" : "rgba(254,240,138,0.17)";
      const softFill   = selected ? "rgba(254,240,138,0.10)" : "rgba(254,240,138,0.07)";

      const animation = content.animate(
        [
          { boxShadow: "0 0 0 0 rgba(250,204,21,0)", backgroundColor: "rgba(254,240,138,0)", offset: 0 },
          { boxShadow: strongGlow, backgroundColor: strongFill, offset: 1 / 6 },
          { boxShadow: softGlow,   backgroundColor: softFill,   offset: 2 / 6 },
          { boxShadow: strongGlow, backgroundColor: strongFill, offset: 3 / 6 },
          { boxShadow: softGlow,   backgroundColor: softFill,   offset: 4 / 6 },
          { boxShadow: strongGlow, backgroundColor: strongFill, offset: 5 / 6 },
          { boxShadow: "0 0 0 0 rgba(250,204,21,0)", backgroundColor: "rgba(254,240,138,0)", offset: 1 },
        ],
        {
          duration: 4500,
          easing: "ease-in-out",
          fill: "none",
        }
      );
      animations.push(animation);
    });

    return () => animations.forEach(animation => animation.cancel());
  }, [isPinned, isLinked, overrideKey]);

  // Exactly ONE repeated sub-element can be selected at a time. Linked peers are
  // highlighted as a preview, but they are not themselves selected and never show
  // their own handles/link pills. A small custom event lets sibling SubDrag instances
  // clear their sticky selection even though canvas mouse events stop propagation.
  useEffect(() => {
    function clearForAnotherSelection(e: Event) {
      const selectedKey = (e as CustomEvent<string>).detail;
      if (selectedKey !== overrideKey) {
        setIsPinned(false);
        setSelectedViaText(false);
      }
    }
    window.addEventListener("resume-subdrag-select", clearForAnotherSelection);
    return () => window.removeEventListener("resume-subdrag-select", clearForAnotherSelection);
  }, [overrideKey]);

  function selectThisSubDrag(viaText = false) {
    window.dispatchEvent(new CustomEvent<string>("resume-subdrag-select", { detail: overrideKey }));
    setSelectedViaText(viaText);
    setIsPinned(true);
  }

  // Keep the one selected control available until the user deliberately clicks away.
  useEffect(() => {
    if (!isPinned) return;
    function clearPinned(e: MouseEvent) {
      const outer = outerRef.current;
      if (outer && outer.contains(e.target as Node)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`[data-subdrag-toolbar-key="${overrideKey}"]`)) return;
      setIsPinned(false);
      setSelectedViaText(false);
    }
    document.addEventListener("mousedown", clearPinned);
    return () => document.removeEventListener("mousedown", clearPinned);
  }, [isPinned]);

  // Linked peers are the preferred inheritance source. `inheritFrom` remains as a
  // backwards-compatible fallback for layouts saved before linking existed.
  const linkedSource = isLinked ? peerSource(ctx.design) : undefined;
  const hasOwnPosition = !!(override?.visualDx || override?.visualDy);
  const legacyInherited = (!hasOwnPosition && inheritFrom)
    ? linkedOverride(ctx.design.layoutOverrides?.[inheritFrom])
    : undefined;
  const inherited = linkedSource ?? legacyInherited;

  const dx        = override?.visualDx ?? inherited?.visualDx ?? 0;
  const dy        = override?.visualDy ?? inherited?.visualDy ?? 0;
  const rot       = override?.rotation  ?? inherited?.rotation ?? 0;
  const overrideW = override?.width     ?? inherited?.width;

  function linkedPeerKeys(designValue: ResumeDesign): string[] {
    if (!linkKeysRef.current?.length) return [overrideKey];
    return linkKeysRef.current.filter(key => {
      if (key === overrideKey) return true;
      return linkedOverride(designValue.layoutOverrides?.[key])?.linked !== false;
    });
  }

  // Update rendered linked peers while the pointer is moving so the relationship is
  // obvious immediately - peers do not wait until mouse-up to snap into place.
  function forEachRenderedLinkedPeer(fn: (el: HTMLDivElement) => void) {
    const current = ctxRef.current;
    if (!current || !isLinked) return;
    const allowed = new Set(linkedPeerKeys(current.design));
    document.querySelectorAll<HTMLDivElement>("[data-subdrag-key]").forEach(outer => {
      const key = outer.dataset.subdragKey;
      if (!key || key === overrideKey || !allowed.has(key)) return;
      const content = outer.querySelector<HTMLDivElement>("[data-subdrag-content]");
      if (content) fn(content);
    });
  }

  // Merge partial updates into this element. When linked, the exact same geometry is
  // committed to every peer that has not explicitly opted out.
  function saveSubOverride(updates: Partial<LayoutOverride>) {
    const current = ctxRef.current!;
    const d = current.design;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}) };
    const targets = isLinked ? linkedPeerKeys(d) : [overrideKey];

    for (const key of targets) {
      const existing = linkedOverride(layoutOverrides[key]) ?? {};
      const next = sanitizeOverride({ ...existing, ...updates });
      if (Object.keys(next).length) layoutOverrides[key] = next;
      else delete layoutOverrides[key];
    }
    let nextDesign: ResumeDesign = { ...d, layoutOverrides };

    if (
      crossFormatCompanyLogo &&
      typeof updates.width === "number" &&
      allWorkEntryIds?.length
    ) {
      nextDesign = syncCompanyLogoSizeFromPdf(
        nextDesign,
        overrideKey,
        updates.width,
        allWorkEntryIds,
      );
    }

    current.onDesignChange(nextDesign);
  }

  function toggleCrossFormatLogoSync(ev: React.MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!crossFormatCompanyLogo || !allWorkEntryIds?.length) return;

    const current = ctxRef.current!;
    const linked = isCompanyLogoCrossFormatLinked(current.design);

    if (linked) {
      current.onDesignChange(
        setCompanyLogoCrossFormatLinked(
          current.design,
          false,
        ),
      );
      return;
    }

    let next = setCompanyLogoCrossFormatLinked(
      current.design,
      true,
    );
    next = syncCompanyLogoSizeFromPdfNow(
      next,
      overrideKey,
      allWorkEntryIds,
    );
    current.onDesignChange(next);
  }

  function toggleLinked(ev: React.MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const current = ctxRef.current!;
    const d = current.design;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}) };
    const existing = linkedOverride(layoutOverrides[overrideKey]) ?? {};

    if (isLinked) {
      // Freeze the CURRENT effective geometry before detaching so the item does not jump
      // when it stops inheriting values from its peers.
      layoutOverrides[overrideKey] = sanitizeOverride({
        ...existing,
        visualDx: dx || undefined,
        visualDy: dy || undefined,
        rotation: rot || undefined,
        width: typeof overrideW === "number" ? overrideW : undefined,
        linked: false,
      });
    } else {
      // Relinking intentionally snaps this item back to the shared geometry.
      const source = (() => {
        for (const key of linkKeysRef.current ?? []) {
          if (key === overrideKey) continue;
          const candidate = linkedOverride(d.layoutOverrides?.[key]);
          if (candidate && candidate.linked !== false) return candidate;
        }
        return undefined;
      })();
      const next = sanitizeOverride({
        ...existing,
        visualDx: source?.visualDx,
        visualDy: source?.visualDy,
        rotation: source?.rotation,
        width: source?.width,
        linked: true,
      });
      if (Object.keys(next).length) layoutOverrides[overrideKey] = next;
      else delete layoutOverrides[overrideKey];
    }

    current.onDesignChange({ ...d, layoutOverrides });
  }

  // After an operation ends, check if the mouse is still over the element.
  // If not, clear the hover state so handles collapse.
  function finishOperation(e: MouseEvent, setter: (v: boolean) => void) {
    operationRef.current = false;
    setter(false);
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    // Extend check 18px above to cover both the rotation and link controls.
    const over = e.clientX >= rect.left - 18 && e.clientX <= rect.right + 18 &&
                 e.clientY >= rect.top - 18 && e.clientY <= rect.bottom;
    if (!over) setIsHovered(false);
  }

  const tfStr = (dx || dy || rot)
    ? `translate(${dx}px, ${dy}px) rotate(${rot}deg)` : undefined;

  // ── Move ──────────────────────────────────────────────────────────────────
  function handleMouseDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest("[data-subdrag-handle]")) return;
    ev.stopPropagation();
    const viaText = !!(ev.target as HTMLElement).closest("[data-selectable-key]");
    selectThisSubDrag(viaText);
    const el = elRef.current;
    const container = ctxRef.current?.containerRef.current;
    if (!el || !container) return;
    const s = ctxRef.current?.scale ?? 1;
    const startCX = ev.clientX, startCY = ev.clientY;
    const startOvr = linkedOverride(ctxRef.current?.design.layoutOverrides?.[overrideKey]);
    const source = startOvr?.linked === false ? undefined : peerSource(ctxRef.current?.design);
    const hasOwnPos = !!(startOvr?.visualDx || startOvr?.visualDy);
    const legacyOvr = (!hasOwnPos && inheritFromRef.current)
      ? linkedOverride(ctxRef.current?.design.layoutOverrides?.[inheritFromRef.current])
      : undefined;
    const inheritedOvr = source ?? legacyOvr;
    // Use effective position (own or inherited) as the drag baseline so the first drag
    // from an inherited position doesn't snap back to zero.
    const startDx  = startOvr?.visualDx ?? inheritedOvr?.visualDx ?? 0;
    const startDy  = startOvr?.visualDy ?? inheritedOvr?.visualDy ?? 0;
    const startRot = startOvr?.rotation  ?? inheritedOvr?.rotation ?? 0;
    const elRect  = el.getBoundingClientRect();
    const conRect = container.getBoundingClientRect();
    const elLeft  = (elRect.left - conRect.left) / s;
    const elTop   = (elRect.top  - conRect.top)  / s;
    const elW     = elRect.width  / s;
    const elH     = elRect.height / s;
    const conW    = conRect.width  / s;
    const conH    = conRect.height / s;
    let moved = false;

    function onMove(e: MouseEvent) {
      const rawDx = (e.clientX - startCX) / s;
      const rawDy = (e.clientY - startCY) / s;
      if (!moved && (Math.abs(e.clientX - startCX) > 4 || Math.abs(e.clientY - startCY) > 4)) moved = true;
      if (moved && elRef.current) {
        const cL = Math.max(0, Math.min(conW - elW, elLeft + rawDx));
        const cT = Math.max(0, Math.min(conH - elH, elTop  + rawDy));
        const nDx = startDx + (cL - elLeft);
        const nDy = startDy + (cT - elTop);
        const tf = (nDx || nDy || startRot)
          ? `translate(${nDx}px, ${nDy}px) rotate(${startRot}deg)` : "";
        elRef.current.style.transform = tf;
        forEachRenderedLinkedPeer(peer => { peer.style.transform = tf; });
      }
    }

    function onUp(e: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      if (!moved) return;
      const rawDx = (e.clientX - startCX) / s;
      const rawDy = (e.clientY - startCY) / s;
      const cL = Math.max(0, Math.min(conW - elW, elLeft + rawDx));
      const cT = Math.max(0, Math.min(conH - elH, elTop  + rawDy));
      saveSubOverride({
        visualDx: startDx + (cL - elLeft) || undefined,
        visualDy: startDy + (cT - elTop)  || undefined,
        rotation: startRot || undefined,
      });
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ── Width resize ──────────────────────────────────────────────────────────
  // Explicit pixel width stored in override; auto-stretches when not set.
  // Left-edge resize keeps the right edge fixed; right-edge keeps the left fixed.
  function makeResizeDown(leftEdge: boolean) {
    return (ev: React.MouseEvent) => {
      ev.stopPropagation(); ev.preventDefault();
      selectThisSubDrag(selectedViaText);
      operationRef.current = true;
      setIsResizing(true);
      const el = elRef.current;
      if (!el) return;
      const s = ctxRef.current?.scale ?? 1;
      const startCX  = ev.clientX;
      const startW   = el.getBoundingClientRect().width / s;
      const startOvr = linkedOverride(ctxRef.current?.design.layoutOverrides?.[overrideKey]);
      const source = startOvr?.linked === false ? undefined : peerSource(ctxRef.current?.design);
      const startDx  = startOvr?.visualDx ?? source?.visualDx ?? 0;
      const startDy  = startOvr?.visualDy ?? source?.visualDy ?? 0;
      const startRot = startOvr?.rotation  ?? source?.rotation ?? 0;

      function onMove(e: MouseEvent) {
        if (!elRef.current) return;
        const ddx = (e.clientX - startCX) / s;
        if (leftEdge) {
          const newW  = Math.max(20, startW - ddx);
          const newDx = startDx + (startW - newW);
          elRef.current.style.width = `${newW}px`;
          const tf = (newDx || startDy || startRot)
            ? `translate(${newDx}px, ${startDy}px) rotate(${startRot}deg)` : "";
          elRef.current.style.transform = tf;
          forEachRenderedLinkedPeer(peer => {
            peer.style.width = `${newW}px`;
            peer.style.transform = tf;
          });
        } else {
          const newW = Math.max(20, startW + ddx);
          elRef.current.style.width = `${newW}px`;
          forEachRenderedLinkedPeer(peer => { peer.style.width = `${newW}px`; });
        }
      }

      function onUp(e: MouseEvent) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
        const ddx = (e.clientX - startCX) / s;
        if (leftEdge) {
          const newW  = Math.max(20, startW - ddx);
          const newDx = startDx + (startW - newW);
          saveSubOverride({ width: newW, visualDx: newDx || undefined, visualDy: startDy || undefined, rotation: startRot || undefined });
        } else {
          saveSubOverride({ width: Math.max(20, startW + ddx), visualDx: startDx || undefined, visualDy: startDy || undefined, rotation: startRot || undefined });
        }
        finishOperation(e, setIsResizing);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    };
  }

  // ── Rotation ──────────────────────────────────────────────────────────────
  function handleRotateDown(ev: React.MouseEvent) {
    ev.stopPropagation(); ev.preventDefault();
    selectThisSubDrag(selectedViaText);
    operationRef.current = true;
    setIsRotating(true);
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const startOvr = linkedOverride(ctxRef.current?.design.layoutOverrides?.[overrideKey]);
    const source = startOvr?.linked === false ? undefined : peerSource(ctxRef.current?.design);
    const startDx  = startOvr?.visualDx ?? source?.visualDx ?? 0;
    const startDy  = startOvr?.visualDy ?? source?.visualDy ?? 0;
    let newRot = startOvr?.rotation ?? source?.rotation ?? 0;

    function onMove(e: MouseEvent) {
      newRot = snapRotation(Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90) * 10) / 10);
      if (elRef.current) {
        const tf = (startDx || startDy || newRot)
          ? `translate(${startDx}px, ${startDy}px) rotate(${newRot}deg)` : "";
        elRef.current.style.transform = tf;
        forEachRenderedLinkedPeer(peer => { peer.style.transform = tf; });
      }
    }

    function onUp(e: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      saveSubOverride({ visualDx: startDx || undefined, visualDy: startDy || undefined, rotation: newRot || undefined });
      finishOperation(e, setIsRotating);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  const showHandles = isHovered || isPinned || isResizing || isRotating;

  const subEdgeH = (p: CSSProperties): CSSProperties => ({
    position: "absolute", ...p,
    width: 4, height: "60%", top: "20%",
    borderRadius: 2, backgroundColor: HC, opacity: 0.8,
    cursor: "ew-resize", zIndex: 10, userSelect: "none",
  });

  return (
    <div
      ref={outerRef}
      data-subdrag-key={overrideKey}
      style={{
        position: "relative",
        width: overrideW ?? defaultWidth ?? "fit-content",
        maxWidth: constrainToBounds
          ? `max(20px, calc(100% - ${Math.max(0, dx)}px))`
          : overrideW ? undefined : "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!operationRef.current) setIsHovered(false); }}
    >
      {/* Content wrapper - carries transform + rotation handle + resize handles */}
      <div
        ref={elRef}
        data-subdrag-content
        onMouseDown={handleMouseDown}
        style={{
          position: "relative",
          width: "100%",
          transform: tfStr,
          transformOrigin: "center center",
          cursor: "grab",
          outline: showHandles ? `1px dashed ${HC}55` : "none",
        }}
      >
        {children}

        {showHandles && (
          <>
            {/* Rotation handle inside elRef so it moves with the translated content */}
            <div
              data-subdrag-handle="rotate"
              onMouseDown={handleRotateDown}
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", top: -12, left: "50%",
                transform: "translateX(-50%)",
                width: 10, height: 10, borderRadius: "50%",
                backgroundColor: HC, border: "1.5px solid white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                cursor: "crosshair", zIndex: 20, userSelect: "none",
              }}
            />

            {/* Link / unlink now lives in the contextual toolbar, not on the canvas. */}

            <div data-subdrag-handle="left"  onMouseDown={makeResizeDown(true)}  onClick={e => e.stopPropagation()} style={subEdgeH({ left: 0 })} />
            <div data-subdrag-handle="right" onMouseDown={makeResizeDown(false)} onClick={e => e.stopPropagation()} style={subEdgeH({ right: 0 })} />
          </>
        )}
      </div>

      {/* Logos and rich descriptions do not use the regular text ContextToolbar.
          Give those repeated elements a compact matching toolbar, with linking first. */}
      {supportsLinking && isPinned && !selectedViaText && elRef.current && createPortal((() => {
        const rect = elRef.current!.getBoundingClientRect();
        const toolbarH = 34;
        const top = rect.bottom + 6 + toolbarH < window.innerHeight
          ? rect.bottom + 6
          : Math.max(4, rect.top - toolbarH - 6);
        const left = Math.min(window.innerWidth - 210, Math.max(4, rect.left));
        return (
          <div
            data-subdrag-toolbar-key={overrideKey}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            style={{
              position: "fixed", top, left, zIndex: 9999,
              height: toolbarH,
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 6px",
              ...CONTEXT_TOOLBAR_SURFACE,
            }}
          >
            <span style={{
              fontSize: 10, color: "#9ca3af", padding: "0 6px 0 2px",
              borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap",
            }}>
              {linkLabel ?? "Element"}
            </span>
            <button
              type="button"
              aria-label={isLinked ? `Unlink ${linkLabel ?? "element"}` : `Link ${linkLabel ?? "element"}`}
              title={
                linkLabel === "Company logo"
                  ? isLinked
                    ? "All company logos share geometry in the Designed PDF."
                    : "This company logo has independent PDF geometry."
                  : isLinked
                    ? `${linkLabel ?? "Element"} is linked across matching fields`
                    : `${linkLabel ?? "Element"} is independent`
              }
              onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
              onClick={toggleLinked}
              style={{
                height: 24,
                padding: "0 8px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 6,
                border: isLinked ? "1px solid rgba(245,158,11,0.38)" : "1px solid #d1d5db",
                background: isLinked ? "rgba(255,251,235,0.98)" : "#fff",
                color: isLinked ? "#a16207" : "#64748b",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {linkLabel === "Company logo"
                ? isLinked
                  ? <><Link2 size={13} strokeWidth={2.1} /><span>All logos · {linkedPeerKeys(ctx.design).length}</span></>
                  : <><Unlink2 size={13} strokeWidth={2} /><span>Individual logo</span></>
                : isLinked
                  ? <><Link2 size={13} strokeWidth={2.1} /><span>Linked · {linkedPeerKeys(ctx.design).length}</span></>
                  : <><Unlink2 size={13} strokeWidth={2} /><span>Unlinked</span></>}
            </button>

            {crossFormatCompanyLogo && (
              <button
                type="button"
                onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
                onClick={toggleCrossFormatLogoSync}
                title={
                  isCompanyLogoCrossFormatLinked(ctx.design)
                    ? "Logo size is synchronized between Designed PDF and Web. Position remains layout-specific."
                    : "PDF and Web logo sizes are independent."
                }
                style={{
                  ...CONTEXT_BUTTON,
                  minHeight: 28,
                  height: 28,
                  ...(isCompanyLogoCrossFormatLinked(ctx.design) ? CONTEXT_ACTIVE_BUTTON : CONTEXT_WARNING_BUTTON),
                }}
              >
                {isCompanyLogoCrossFormatLinked(ctx.design) ? <Link2 size={13} /> : <Unlink2 size={13} />}
                {isCompanyLogoCrossFormatLinked(ctx.design) ? "PDF + Web" : "PDF only"}
              </button>
            )}
          </div>
        );
      })(), document.body)}
    </div>
  );
}

// ── Selectable element keys ───────────────────────────────────────────────────

export type SelectableKey = keyof Pick<ResumeDesign,
  "name" | "contact" | "sectionHeading" | "entryTitle" | "entryOrg" |
  "entryDate" | "entryBullet" | "summary" | "skillItem" | "linkItem">;

export const ELEMENT_LABELS: Record<SelectableKey, string> = {
  name:           "Name",
  contact:        "Contact info",
  sectionHeading: "Section heading",
  entryTitle:     "Entry title",
  entryOrg:       "Company / School",
  entryDate:      "Date",
  entryBullet:    "Bullet text",
  summary:        "Summary",
  skillItem:      "Skill item",
  linkItem:       "Link",
};

// ── Inline edit info ──────────────────────────────────────────────────────────

interface EditInfo {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}

// ── Selection context ─────────────────────────────────────────────────────────

interface SelectCtx {
  selected:      SelectableKey | null;
  hovered:       SelectableKey | null;
  onSelect:      (key: SelectableKey, el: HTMLElement) => void;
  onHover:       (key: SelectableKey | null) => void;
  onClearSelect: () => void;
  onRightClick:  (key: SelectableKey, el: HTMLElement) => void;
}

// ── Selectable wrapper ────────────────────────────────────────────────────────
// Single-click → contextual toolbar (quick formatting).
// Double-click  → contenteditable in-place text edit.
// Right-click   → full advanced style popover.
// Using contenteditable instead of <input> so keyboard events (including space)
// are handled by the browser's native editing engine, which works correctly
// inside CSS transform:scale() containers where <input> can't receive space.

function Sel({ k, ctx, style, block, children, editInfo }: {
  k: SelectableKey;
  ctx: SelectCtx;
  style?: CSSProperties;
  block?: boolean;
  children: ReactNode;
  editInfo?: EditInfo;
}) {
  const [editing, setEditing]   = useState(false);
  const editRef                 = useRef<HTMLElement | null>(null);
  const isSelected              = ctx.selected === k;
  const isHovered               = ctx.hovered === k;
  const Tag                     = block ? "div" : "span";

  // On edit-start: write text content into the contenteditable and place focus.
  // We do NOT pass children into the contenteditable element in JSX, so React
  // never tries to reconcile (and overwrite) the user's typed content.
  useEffect(() => {
    if (!editing || !editRef.current || !editInfo) return;
    const el = editRef.current;
    el.textContent = editInfo.value;
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // cursor at end
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    } catch { /* safari may throw */ }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Editing mode: contenteditable in-place ──────────────────────────────────
  if (editing && editInfo) {
    return (
      <Tag
        ref={(el: HTMLElement | null) => { editRef.current = el; }}
        data-selectable-key={k}
        contentEditable
        suppressContentEditableWarning
        onInput={(e: React.FormEvent<HTMLElement>) => {
          const raw = (e.currentTarget as HTMLElement).innerText ?? "";
          editInfo.onChange(editInfo.multiline ? raw.replace(/\n+$/, "") : raw);
        }}
        onBlur={() => {
          if (editRef.current) {
            const raw = editRef.current.innerText ?? "";
            editInfo.onChange(editInfo.multiline ? raw.replace(/\n+$/, "") : raw);
          }
          setEditing(false);
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); setEditing(false); return; }
          if (e.key === "Enter" && !editInfo.multiline) {
            // Single-line fields: Enter exits editing. Multiline: let browser insert <div>/<br> natively.
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{
          ...style,
          cursor: "text",
          outline: "1px solid #adb5bd",
          boxShadow: "none",
          borderRadius: (style?.borderRadius as number | undefined) ?? 2,
          whiteSpace: editInfo.multiline ? "pre-wrap" : "nowrap",
          minWidth: "2px",
        }}
      />
    );
  }

  // ── Display mode ────────────────────────────────────────────────────────────
  const shadow = isSelected
    ? "0 0 0 1px #9ca3af"
    : isHovered
    ? "0 0 0 1px rgba(0,0,0,0.12)"
    : "none";

  return (
    <Tag
      data-selectable-key={k}
      style={{
        ...style,
        cursor: "inherit",
        boxShadow: shadow,
        borderRadius: (style?.borderRadius as number | undefined) ?? 2,
        transition: "box-shadow 0.1s",
        ...(editInfo?.multiline ? { whiteSpace: "pre-wrap" as const } : {}),
      }}
      onMouseEnter={() => ctx.onHover(k)}
      onMouseLeave={() => ctx.onHover(null)}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); ctx.onSelect(k, e.currentTarget as HTMLElement); }}
      onDoubleClick={(e: React.MouseEvent) => {
        if (!editInfo) return;
        e.stopPropagation();
        ctx.onClearSelect();
        setEditing(true);
      }}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.onRightClick(k, e.currentTarget as HTMLElement);
      }}
    >
      {children}
    </Tag>
  );
}

// ── Section helpers ───────────────────────────────────────────────────────────

type SectionId = "work" | "projects" | "education" | "skills" | "bio" | "links";
const ALL_SECTIONS: SectionId[] = ["work", "projects", "education", "skills", "bio", "links"];
const SECTION_LABELS: Record<SectionId, string> = {
  work: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  bio: "Summary",
  links: "Links",
};

function getOrderedSections(d: ResumeDesign): SectionId[] {
  const order  = (d.sectionOrder ?? []).length > 0 ? d.sectionOrder : [...ALL_SECTIONS];
  const hidden = d.hiddenSections ?? [];
  const result: SectionId[] = [];
  for (const id of order) {
    if (ALL_SECTIONS.includes(id as SectionId) && !hidden.includes(id)) result.push(id as SectionId);
  }
  for (const id of ALL_SECTIONS) {
    if (!result.includes(id) && !hidden.includes(id)) result.push(id);
  }
  return result;
}

function sectionHasContent(id: SectionId, data: ResumeData): boolean {
  switch (id) {
    case "work":      return data.workEntries.length > 0;
    case "projects":  return getResumeProjects(data).some(projectHasContent);
    case "education": return data.education.length > 0;
    case "skills":    return data.skills.length > 0;
    case "bio":       return data.summary.trim().length > 0;
    case "links":     return data.extraLinks.length > 0;
  }
}

// ── Flow layout engine ────────────────────────────────────────────────────────
// Phase 1: computed base positions + user flow-displacement and visual-nudge overrides.
//
// Each layout preset maps to one or more independent flow regions (e.g. sidebar +
// main column). Blocks within a region cascade vertically; blocks in different
// regions are independent.
//
// Block ID scheme (dot-separated, stable):
//   "name"             - full name
//   "contact"          - contact line
//   "work.heading"     - Experience section heading
//   "work.<entryId>"   - individual work entry (stable entry.id, NOT array index)
//   "projects.heading" - Projects section heading
//   "projects.<entryId>" - individual shared project entry
//   "edu.heading"      - Education section heading
//   "edu.<entryId>"    - individual education entry
//   "bio.heading"      - Summary heading
//   "bio"              - summary body
//   "skills.heading"   - Skills heading
//   "skills"           - skills body
//   "links.heading"    - Links heading
//   "links"            - links body

interface FlowRegion {
  id: string;
  x: number;           // page-relative left edge (pts)
  y: number;           // page-relative top edge (pts)
  width: number;       // available content width (pts)
  blockIds: string[];  // ordered block IDs whose flow belongs to this region
}

interface ComputedPos { x: number; y: number; w: number; h: number }
interface PageComputedPos extends ComputedPos { page: number }

function buildSectionBlockIds(sectionId: SectionId, data: ResumeData): string[] {
  if (!sectionHasContent(sectionId, data)) return [];
  const ids: string[] = [`${sectionId}.heading`];
  switch (sectionId) {
    case "work":
      data.workEntries.forEach(e => ids.push(`work.${e.id}`));
      break;
    case "projects":
      getResumeProjects(data)
        .filter(projectHasContent)
        .forEach(project => ids.push(`projects.${project.id}`));
      break;
    case "education":
      data.education.forEach(e => ids.push(`edu.${e.id}`));
      break;
    case "bio":
      ids.push("bio");
      break;
    case "skills":
      ids.push("skills");
      break;
    case "links":
      ids.push("links");
      break;
  }
  return ids;
}

function buildFlowRegions(data: ResumeData, d: ResumeDesign, pageW: number): FlowRegion[] {
  const mL = d.pageMarginLeft, mR = d.pageMarginRight, mT = d.pageMarginTop;
  const contentW = pageW - mL - mR;
  const sections = getOrderedSections(d);
  const hasContact = [data.email, data.phone, data.location, data.website].some(Boolean);
  const headerIds = ["name", ...(hasContact ? ["contact"] : [])];

  switch (d.layout) {
    case "single": {
      const allIds = [...headerIds, ...sections.flatMap(s => buildSectionBlockIds(s, data))];
      return [{ id: "main", x: mL, y: mT, width: contentW, blockIds: allIds }];
    }

    case "label": {
      // Narrow label column left, content right - content is the single flow column.
      const labelW = d.sidebarWidth;  // stored as pts for label layout
      const mainW  = contentW - labelW - d.columnGap;
      const allIds = [...headerIds, ...sections.flatMap(s => buildSectionBlockIds(s, data))];
      return [{ id: "main", x: mL + labelW + d.columnGap, y: mT, width: Math.max(mainW, 80), blockIds: allIds }];
    }

    case "sidebar-left": {
      const sideW = Math.round((d.sidebarWidth / 100) * pageW);
      const mainW = contentW - sideW - d.columnGap;
      const sidebarSects = (d.sidebarSections ?? []) as SectionId[];
      const sideIds = [...headerIds, ...sidebarSects.flatMap(s => buildSectionBlockIds(s, data))];
      const mainIds = sections.filter(s => !sidebarSects.includes(s)).flatMap(s => buildSectionBlockIds(s, data));
      return [
        { id: "sidebar", x: mL,                            y: mT, width: Math.max(sideW, 40),  blockIds: sideIds },
        { id: "main",    x: mL + sideW + d.columnGap,      y: mT, width: Math.max(mainW, 80),  blockIds: mainIds },
      ];
    }

    case "sidebar-right": {
      const sideW = Math.round((d.sidebarWidth / 100) * pageW);
      const mainW = contentW - sideW - d.columnGap;
      const sidebarSects = (d.sidebarSections ?? []) as SectionId[];
      const sideIds = [...headerIds, ...sidebarSects.flatMap(s => buildSectionBlockIds(s, data))];
      const mainIds = sections.filter(s => !sidebarSects.includes(s)).flatMap(s => buildSectionBlockIds(s, data));
      return [
        { id: "main",    x: mL,                            y: mT, width: Math.max(mainW, 80),  blockIds: mainIds },
        { id: "sidebar", x: mL + mainW + d.columnGap,      y: mT, width: Math.max(sideW, 40),  blockIds: sideIds },
      ];
    }

    case "two-column": {
      const halfW = Math.floor((contentW - d.columnGap) / 2);
      const allSects = sections.filter(s => sectionHasContent(s, data));
      const mid = Math.ceil(allSects.length / 2);
      return [
        { id: "col1", x: mL,                       y: mT, width: halfW, blockIds: [...headerIds, ...allSects.slice(0, mid).flatMap(s => buildSectionBlockIds(s, data))] },
        { id: "col2", x: mL + halfW + d.columnGap, y: mT, width: halfW, blockIds: allSects.slice(mid).flatMap(s => buildSectionBlockIds(s, data)) },
      ];
    }
  }
}

// Given pass-1 natural positions and user overrides, compute final render positions.
//
// Cascade rule: for each block in a region, accumulate ALL flowDisplacementY values
// from blocks at or before it - including blocks whose nat entry is missing (e.g. a
// block that has a displacement override but wasn't measured in the last pass-1).
// Skipping displacement accumulation when nat is missing was the prior bug: if
// "name" happened to be absent from naturalPos, its flowDisplacementY=200 would
// never enter cumulativeY, and every subsequent block would silently get cumulativeY=0.
//
// effectiveBottom(block) = out[block].y + out[block].h
// The next block in reading order should start at effectiveBottom(prev) + natural_gap,
// which the cascade already achieves because nat.y encodes those gaps from pass-1.
//
// visualDx is added to x only - never cascades.
// Width override is pre-applied during pass-1 measurement, so it's already
// encoded in the natural positions of subsequent blocks.
function computeBlockPositions(
  regions: FlowRegion[],
  naturalPos: Record<string, ComputedPos>,
  overrides: Record<string, LayoutOverride>,
): Record<string, ComputedPos> {
  const out: Record<string, ComputedPos> = {};
  for (const region of regions) {
    let cumulativeY = 0;
    for (const bid of region.blockIds) {
      const ov = overrides[bid] ?? {};
      // Role blocks (work/edu entries, not headings) are independently positioned -
      // their flowDisplacementY does NOT cascade to subsequent blocks. It only offsets
      // the role itself (treated like visualDy). This prevents one role's drag from
      // shifting all roles below it. Old data with flowDisplacementY on roles is
      // automatically handled: it moves the role but doesn't cascade.
      const isRoleBlock = (
        bid.startsWith("work.") ||
        bid.startsWith("projects.") ||
        bid.startsWith("edu.")
      ) && !bid.endsWith(".heading");
      const fdy = ov.flowDisplacementY ?? 0;
      if (!isRoleBlock) {
        // Accumulate BEFORE the nat-missing check so a displaced non-role block
        // (e.g. "name" with flowDisplacementY=200) always cascades to every block
        // that follows it, even if that block itself is not yet in naturalPos.
        cumulativeY += fdy;
      }
      const nat = naturalPos[bid];
      if (!nat) continue;
      out[bid] = {
        x: nat.x + (ov.visualDx ?? 0),
        y: nat.y + cumulativeY + (ov.visualDy ?? 0) + (isRoleBlock ? fdy : 0),
        w: ov.width ?? nat.w,
        h: nat.h,
      };
    }
  }
  return out;
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeadingC({ title, d, ctx }: { title: string; d: ResumeDesign; ctx: SelectCtx }) {
  return (
    <Sel k="sectionHeading" ctx={ctx} block style={toCss(d.sectionHeading)}>
      {title}
      {d.sectionRuleShow && (
        <div style={{
          borderBottom: `${d.sectionRuleThickness || 1}px solid ${d.sectionRuleColor}`,
          marginTop: d.sectionRuleMarginTop,
          marginBottom: d.sectionRuleMarginBottom,
        }} />
      )}
    </Sel>
  );
}

// ── Bullet editor ──────────────────────────────────────────────────────────────
// A contenteditable span that sets its initial content on mount (avoiding React
// reconciliation fighting with browser editing). Unmounts when a different bullet
// takes over editing, which re-triggers the focus useEffect cleanly.

function EditingBullet({ text, onInput, onKeyDown, onPaste, style, bulletRef }: {
  text: string;
  onInput: (el: HTMLElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  style: CSSProperties;
  bulletRef: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Set initial text content; focus is managed by BulletEditor.
    if (ref.current) ref.current.textContent = text;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span
      ref={el => { ref.current = el; bulletRef(el); }}
      contentEditable suppressContentEditableWarning
      onInput={e => onInput(e.currentTarget as HTMLElement)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      style={style}
    />
  );
}

function BulletEditor({ bullets, onChange, d, ctx, entryKey }: {
  bullets: BulletPoint[];
  onChange: (b: BulletPoint[]) => void;
  d: ResumeDesign;
  ctx: SelectCtx;
  entryKey: string; // unique per editor instance, e.g. "work.abc123" or "edu.abc123"
}) {
  const editCtx = useContext(BulletEditCtx);

  // Initialize from context so editing survives FreeFormLayout's pass-1 ↔ pass-2 remount.
  const [editingId, setEditingIdLocal] = useState<string | null>(() => {
    const k = editCtx.key;
    if (!k || !k.startsWith(entryKey + ":")) return null;
    return k.slice(entryKey.length + 1);
  });

  function setEditingId(id: string | null) {
    setEditingIdLocal(id);
    editCtx.set(id ? `${entryKey}:${id}` : null);
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const bulletRefs   = useRef<Map<string, HTMLElement | null>>(new Map());

  const isSelected = ctx.selected === "entryBullet";
  const isHovered  = ctx.hovered  === "entryBullet";
  const isEmpty    = bullets.length === 0;

  useEffect(() => {
    if (!editingId) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditingId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Explicit focus after every editingId change - runs after React commits the DOM,
  // so the EditingBullet element is guaranteed to exist in bulletRefs by the time
  // the animation frame fires.
  useEffect(() => {
    if (!editingId) return;
    const raf = requestAnimationFrame(() => {
      const el = bulletRefs.current.get(editingId);
      if (!el) return;
      el.focus();
      try {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);
      } catch { /* safari */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [editingId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>, id: string) {
    e.stopPropagation();
    if (e.key === "Escape") { setEditingId(null); return; }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const idx = bullets.findIndex(b => b.id === id);
      const nb  = { id: genId(), text: "" };
      onChange([...bullets.slice(0, idx + 1), nb, ...bullets.slice(idx + 1)]);
      setEditingId(nb.id);
      return;
    }
    // Shift+Enter: let browser insert <br> → \n within the current bullet

    if (e.key === "Backspace") {
      const el = bulletRefs.current.get(id);
      if (!el) return;
      if (el.innerText.replace(/\n+$/, "") === "") {
        e.preventDefault();
        if (bullets.length === 1) {
          // Last bullet deleted - clear the list and exit editing mode (shows placeholder).
          onChange([]);
          setEditingId(null);
          return;
        }
        const idx  = bullets.findIndex(b => b.id === id);
        const next = bullets.filter(b => b.id !== id);
        onChange(next);
        const prevId = next[Math.max(0, idx - 1)]?.id;
        if (prevId) setEditingId(prevId);
      }
    }
  }

  function handleInput(id: string, el: HTMLElement) {
    onChange(bullets.map(b => b.id === id ? { ...b, text: el.innerText.replace(/\n+$/, "") } : b));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLElement>, id: string) {
    const lines = e.clipboardData.getData("text/plain").split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return; // single line: browser handles it
    e.preventDefault();
    const idx = bullets.findIndex(b => b.id === id);
    const newBullets = lines.map((text, i) => ({ id: i === 0 ? id : genId(), text }));
    onChange([...bullets.slice(0, idx), ...newBullets, ...bullets.slice(idx + 1)]);
    setEditingId(newBullets[newBullets.length - 1].id);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    ctx.onClearSelect();
    const bid = (e.target as HTMLElement).closest("[data-bid]")?.getAttribute("data-bid");
    if (bid && bullets.find(b => b.id === bid)) { setEditingId(bid); return; }
    if (bullets.length > 0) { setEditingId(bullets[bullets.length - 1].id); return; }
    const nb = { id: genId(), text: "" };
    onChange([nb]);
    setEditingId(nb.id);
  }

  const shadow = editingId
    ? "0 0 0 0 transparent"
    : isSelected ? "0 0 0 1px #9ca3af"
    : isHovered  ? "0 0 0 1px rgba(0,0,0,0.12)"
    : "none";

  const rowSt: CSSProperties = { display: "flex", alignItems: "flex-start" };
  const markerSt: CSSProperties = {
    width: d.bulletMarkerWidth, color: d.bulletMarkerColor, flexShrink: 0,
    ...FONT_CSS[d.entryBullet.fontFamily], fontSize: d.entryBullet.fontSize,
  };
  const textSt: CSSProperties = { ...toCss(d.entryBullet), flex: 1, marginBottom: 0 };
  const editSt: CSSProperties = { ...textSt, outline: "none", whiteSpace: "pre-wrap", cursor: "text" };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => ctx.onHover("entryBullet")}
      onMouseLeave={() => { if (!editingId) ctx.onHover(null); }}
      onClick={e => { e.stopPropagation(); if (!editingId) ctx.onSelect("entryBullet", e.currentTarget as HTMLElement); }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); ctx.onRightClick("entryBullet", e.currentTarget as HTMLElement); }}
      style={{ boxShadow: shadow, borderRadius: 2, transition: "box-shadow 0.1s", cursor: editingId ? "text" : "pointer", minHeight: 14 }}
    >
      {isEmpty && !editingId
        ? <em style={{ ...toCss(d.entryBullet), opacity: 0.3 }}>Double-click to add bullet points…</em>
        : bullets.map(b => (
            <div key={b.id} data-bid={b.id} style={{ ...rowSt, marginBottom: d.entryBullet.marginBottom || 1 }}>
              <span style={markerSt}>{d.bulletMarkerChar}</span>
              {editingId === b.id
                ? <EditingBullet
                    text={b.text}
                    onInput={el => handleInput(b.id, el)}
                    onKeyDown={e  => handleKeyDown(e, b.id)}
                    onPaste={e   => handlePaste(e, b.id)}
                    bulletRef={el => { bulletRefs.current.set(b.id, el); }}
                    style={editSt}
                  />
                : <span style={textSt}>{b.text || <em style={{ opacity: 0.35 }}>-</em>}</span>
              }
            </div>
          ))
      }
    </div>
  );
}

// ── Rich-text body renderer (canvas) ─────────────────────────────────────────
// Renders Tiptap HTML output on the canvas. Uses the entryBullet design style as
// the base, with CSS overrides to apply the design system's bullet marker.

// Tiptap wraps list content as <li><p><span style="font-size:Xpt">…</span></p></li>.
// The ::marker pseudo-element inherits font-size from <li>, not from child spans,
// so the marker stays at the ambient font size while text has an override.
// Fix: propagate the first child span's font-size onto each <li> element.
function applyListMarkerSizes(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("li").forEach(li => {
    const span = li.querySelector("[style*='font-size']") as HTMLElement | null;
    if (span?.style.fontSize) (li as HTMLElement).style.fontSize = span.style.fontSize;
  });
  return div.innerHTML;
}

function EntryBody({ body, d }: { body?: string; d: ResumeDesign }) {
  const base = toCss(d.entryBullet);
  if (!body) {
    return (
      <div style={{
        ...base,
        opacity: 0.3,
        fontStyle: "italic",
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        boxSizing: "border-box",
      }}>
        Describe this role - use the editor on the left to add text and bullet points.
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        boxSizing: "border-box",
      }}
      className="resume-body-html"
      dangerouslySetInnerHTML={{ __html: applyListMarkerSizes(body) }}
    />
  );
}

// ── Content renderers ─────────────────────────────────────────────────────────

interface SectionProps { data: ResumeData; d: ResumeDesign; ctx: SelectCtx; setData: (d: ResumeData) => void }

function WorkC({ data, d, ctx, setData }: SectionProps) {
  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function setSource(i: number | null) { dragFromRef.current = i; setDragFrom(i); }
  function reorderWork(from: number, to: number) {
    const next = [...data.workEntries];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setData({ ...data, workEntries: next });
  }

  return (
    <>
      {data.workEntries.map((e, i) => {
        function updateEntry(partial: Partial<typeof e>) {
          setData({ ...data, workEntries: data.workEntries.map((x, j) => j === i ? { ...x, ...partial } : x) });
        }
        return (
          <div
            key={e.id}
            draggable
            onDragStart={ev => {
              ev.dataTransfer.setData("text/plain", String(i));
              ev.dataTransfer.effectAllowed = "move";
              setSource(i);
            }}
            onDragEnd={() => { setSource(null); setDragOver(null); }}
            onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOver(i); }}
            onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOver(null); }}
            onDrop={ev => {
              ev.preventDefault();
              const from = dragFromRef.current;
              if (from !== null && from !== i) reorderWork(from, i);
              setSource(null); setDragOver(null);
            }}
            style={{
              marginBottom: d.entrySpacing,
              opacity: dragFrom === i ? 0.35 : 1,
              outline: dragOver === i && dragFromRef.current !== null && dragFromRef.current !== i
                ? "1.5px dashed #7c3aed" : "none",
              borderRadius: 3,
              transition: "opacity 0.1s",
              cursor: "grab",
            }}
          >
            {d.showCompanyLogos && e.company && (
              <CanvasLogo company={e.company} logoUrl={e.logoUrl} />
            )}
            {d.entryDate.position === "right" ? (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <Sel k="entryTitle" ctx={ctx} style={{ ...toCss(d.entryTitle), flex: 1, marginRight: 8 }}
                  editInfo={{ value: e.title, onChange: v => updateEntry({ title: v }) }}>
                  {e.title || <em style={{ opacity: 0.3 }}>Job title</em>}
                </Sel>
                <Sel k="entryDate" ctx={ctx} style={{ ...toCss(d.entryDate), flexShrink: 0 }}>
                  {formatDateRange(e.startDate, e.endDate, e.current)}
                </Sel>
              </div>
            ) : (
              <Sel k="entryTitle" ctx={ctx} block style={toCss(d.entryTitle)}
                editInfo={{ value: e.title, onChange: v => updateEntry({ title: v }) }}>
                {e.title || <em style={{ opacity: 0.3 }}>Job title</em>}
              </Sel>
            )}
            <Sel k="entryOrg" ctx={ctx} block style={toCss(d.entryOrg)}
              editInfo={{ value: e.company, onChange: v => updateEntry({ company: v }) }}>
              {e.company || <em style={{ opacity: 0.3 }}>Company name</em>}
            </Sel>
            {d.entryDate.position === "below" && (
              <Sel k="entryDate" ctx={ctx} block style={toCss(d.entryDate)}>
                {formatDateRange(e.startDate, e.endDate, e.current)}
              </Sel>
            )}
            <EntryBody body={e.body} d={d} />
          </div>
        );
      })}
    </>
  );
}


function projectHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ProjectTechTags({
  project,
  d,
  ctx,
  onChange,
}: {
  project: ResumeProjectEntry;
  d: ResumeDesign;
  ctx: SelectCtx;
  onChange: (value: string) => void;
}) {
  const tags = splitTechStack(project.techStack);
  const orgCss = toCss(d.entryOrg);

  return (
    <Sel
      k="entryOrg"
      ctx={ctx}
      block
      editInfo={{
        value: project.techStack,
        onChange,
      }}
      style={{
        ...orgCss,
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 3,
        marginBottom: 3,
        minHeight: 18,
      }}
    >
      {tags.length ? (
        tags.map((tag, index) => (
          <span
            key={`${project.id}-tech-${index}-${tag}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 16,
              padding: "1px 5px",
              border: "1px solid rgba(71,85,105,.28)",
              borderRadius: 3,
              background: "rgba(15,23,42,.045)",
              color: d.entryOrg.color,
              fontFamily: orgCss.fontFamily,
              fontSize: Math.max(7, (d.entryOrg.fontSize ?? 9) - 1),
              fontWeight: 600,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {tag}
          </span>
        ))
      ) : (
        <em style={{ opacity: 0.3 }}>Tech stack</em>
      )}
    </Sel>
  );
}

function ProjectsC({ data, d, ctx, setData }: SectionProps) {
  const projects = getResumeProjects(data).filter(projectHasContent);

  function updateProject(id: string, patch: Partial<ResumeProjectEntry>) {
    const next = getResumeProjects(data).map(project =>
      project.id === id ? { ...project, ...patch } : project
    );
    setData(withResumeProjects(data, next));
  }

  return (
    <>
      {projects.map(project => (
        <div key={project.id} style={{ marginBottom: d.entrySpacing }}>
          <Sel
            k="entryTitle"
            ctx={ctx}
            block
            style={toCss(d.entryTitle)}
            editInfo={{
              value: project.title,
              onChange: value => updateProject(project.id, { title: value }),
            }}
          >
            {project.title || <em style={{ opacity: 0.3 }}>Project name</em>}
          </Sel>

          {!!project.techStack.trim() && (
            <ProjectTechTags
              project={project}
              d={d}
              ctx={ctx}
              onChange={value =>
                updateProject(project.id, { techStack: value })
              }
            />
          )}

          <Sel
            k="entryBullet"
            ctx={ctx}
            block
            style={toCss(d.entryBullet)}
            editInfo={{
              value: project.description,
              onChange: value => updateProject(project.id, { description: value }),
              multiline: true,
            }}
          >
            {project.description || (
              <em style={{ opacity: 0.3 }}>Describe this project…</em>
            )}
          </Sel>

          {!!project.githubUrl.trim() && (
            <Sel
              k="linkItem"
              ctx={ctx}
              block
              style={toCss(d.linkItem)}
              editInfo={{
                value: project.githubUrl,
                onChange: value => updateProject(project.id, { githubUrl: value }),
              }}
            >
              <a
                href={projectHref(project.githubUrl)}
                target="_blank"
                rel="noreferrer"
                onClick={event => event.stopPropagation()}
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                {project.githubUrl}
              </a>
            </Sel>
          )}

          {!!project.liveUrl.trim() && (
            <Sel
              k="linkItem"
              ctx={ctx}
              block
              style={toCss(d.linkItem)}
              editInfo={{
                value: project.liveUrl,
                onChange: value => updateProject(project.id, { liveUrl: value }),
              }}
            >
              <a
                href={projectHref(project.liveUrl)}
                target="_blank"
                rel="noreferrer"
                onClick={event => event.stopPropagation()}
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                {project.liveUrl}
              </a>
            </Sel>
          )}
        </div>
      ))}
    </>
  );
}

function SingleProjectEntryC({
  entry: project,
  data,
  d,
  ctx,
  setData,
}: SectionProps & { entry: ResumeProjectEntry }) {
  const projects = getResumeProjects(data);
  const pfx = `projects.${project.id}`;

  function update(patch: Partial<ResumeProjectEntry>) {
    setData(withResumeProjects(
      data,
      projects.map(item =>
        item.id === project.id ? { ...item, ...patch } : item
      ),
    ));
  }

  const projectLinkKeys = (
    part: "title" | "tech" | "body" | "github" | "live",
  ) => projects.map(item => `projects.${item.id}.${part}`);

  const peerId = projects.find(item => item.id !== project.id)?.id;
  const peerPfx = peerId ? `projects.${peerId}` : undefined;

  return (
    <div>
      <SubDrag
        overrideKey={`${pfx}.title`}
        inheritFrom={peerPfx ? `${peerPfx}.title` : undefined}
        linkKeys={projectLinkKeys("title")}
        linkLabel="Project title"
      >
        <Sel
          k="entryTitle"
          ctx={ctx}
          block
          style={toCss(d.entryTitle)}
          editInfo={{
            value: project.title,
            onChange: value => update({ title: value }),
          }}
        >
          {project.title || <em style={{ opacity: 0.3 }}>Project name</em>}
        </Sel>
      </SubDrag>

      <SubDrag
        overrideKey={`${pfx}.tech`}
        inheritFrom={peerPfx ? `${peerPfx}.tech` : undefined}
        linkKeys={projectLinkKeys("tech")}
        linkLabel="Project tech"
      >
        <ProjectTechTags
          project={project}
          d={d}
          ctx={ctx}
          onChange={value => update({ techStack: value })}
        />
      </SubDrag>

      <SubDrag
        overrideKey={`${pfx}.body`}
        inheritFrom={peerPfx ? `${peerPfx}.body` : undefined}
        linkKeys={projectLinkKeys("body")}
        linkLabel="Project description"
        constrainToBounds
      >
        <Sel
          k="entryBullet"
          ctx={ctx}
          block
          style={{
            ...toCss(d.entryBullet),
            maxWidth: "100%",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
          editInfo={{
            value: project.description,
            onChange: value => update({ description: value }),
            multiline: true,
          }}
        >
          {project.description || (
            <em style={{ opacity: 0.3 }}>Describe this project…</em>
          )}
        </Sel>
      </SubDrag>

      {!!project.githubUrl.trim() && (
        <SubDrag
          overrideKey={`${pfx}.github`}
          inheritFrom={peerPfx ? `${peerPfx}.github` : undefined}
          linkKeys={projectLinkKeys("github")}
          linkLabel="GitHub link"
          constrainToBounds
        >
          <Sel
            k="linkItem"
            ctx={ctx}
            block
            style={{
              ...toCss(d.linkItem),
              maxWidth: "100%",
              overflowWrap: "anywhere",
            }}
            editInfo={{
              value: project.githubUrl,
              onChange: value => update({ githubUrl: value }),
            }}
          >
            <a
              href={projectHref(project.githubUrl)}
              target="_blank"
              rel="noreferrer"
              onClick={event => event.stopPropagation()}
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {project.githubUrl}
            </a>
          </Sel>
        </SubDrag>
      )}

      {!!project.liveUrl.trim() && (
        <SubDrag
          overrideKey={`${pfx}.live`}
          inheritFrom={peerPfx ? `${peerPfx}.live` : undefined}
          linkKeys={projectLinkKeys("live")}
          linkLabel="Live project link"
          constrainToBounds
        >
          <Sel
            k="linkItem"
            ctx={ctx}
            block
            style={{
              ...toCss(d.linkItem),
              maxWidth: "100%",
              overflowWrap: "anywhere",
            }}
            editInfo={{
              value: project.liveUrl,
              onChange: value => update({ liveUrl: value }),
            }}
          >
            <a
              href={projectHref(project.liveUrl)}
              target="_blank"
              rel="noreferrer"
              onClick={event => event.stopPropagation()}
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {project.liveUrl}
            </a>
          </Sel>
        </SubDrag>
      )}
    </div>
  );
}

function EduC({ data, d, ctx, setData }: SectionProps) {
  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function setSource(i: number | null) { dragFromRef.current = i; setDragFrom(i); }
  function reorderEdu(from: number, to: number) {
    const next = [...data.education];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setData({ ...data, education: next });
  }

  return (
    <>
      {data.education.map((e, i) => {
        function updateEdu(partial: Partial<typeof e>) {
          setData({ ...data, education: data.education.map((x, j) => j === i ? { ...x, ...partial } : x) });
        }
        const degreeField = [e.degree, e.field].filter(Boolean).join(", ");
        return (
          <div
            key={e.id}
            draggable
            onDragStart={ev => {
              ev.dataTransfer.setData("text/plain", String(i));
              ev.dataTransfer.effectAllowed = "move";
              setSource(i);
            }}
            onDragEnd={() => { setSource(null); setDragOver(null); }}
            onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOver(i); }}
            onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOver(null); }}
            onDrop={ev => {
              ev.preventDefault();
              const from = dragFromRef.current;
              if (from !== null && from !== i) reorderEdu(from, i);
              setSource(null); setDragOver(null);
            }}
            style={{
              marginBottom: d.entrySpacing,
              opacity: dragFrom === i ? 0.35 : 1,
              outline: dragOver === i && dragFromRef.current !== null && dragFromRef.current !== i
                ? "1.5px dashed #7c3aed" : "none",
              borderRadius: 3,
              transition: "opacity 0.1s",
              cursor: "grab",
            }}
          >
            {d.entryDate.position === "right" ? (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <Sel k="entryTitle" ctx={ctx} style={{ ...toCss(d.entryTitle), flex: 1, marginRight: 8 }}
                  editInfo={{ value: e.school, onChange: v => updateEdu({ school: v }) }}>
                  {e.school || <em style={{ opacity: 0.3 }}>School name</em>}
                </Sel>
                <Sel k="entryDate" ctx={ctx} style={{ ...toCss(d.entryDate), flexShrink: 0 }}>
                  {formatEduYears(e.startYear, e.endYear, e.current)}
                </Sel>
              </div>
            ) : (
              <Sel k="entryTitle" ctx={ctx} block style={toCss(d.entryTitle)}
                editInfo={{ value: e.school, onChange: v => updateEdu({ school: v }) }}>
                {e.school || <em style={{ opacity: 0.3 }}>School name</em>}
              </Sel>
            )}
            {degreeField && (
              <Sel k="entryOrg" ctx={ctx} block style={toCss(d.entryOrg)}
                editInfo={{ value: degreeField, onChange: v => {
                  const [deg, ...rest] = v.split(",");
                  updateEdu({ degree: deg.trim(), field: rest.join(",").trim() });
                }}}>
                {degreeField}
              </Sel>
            )}
            {d.entryDate.position === "below" && formatEduYears(e.startYear, e.endYear, e.current) && (
              <Sel k="entryDate" ctx={ctx} block style={toCss(d.entryDate)}>
                {formatEduYears(e.startYear, e.endYear, e.current)}
              </Sel>
            )}
          </div>
        );
      })}
    </>
  );
}

function SkillsC({ data, d, ctx, setData }: SectionProps) {
  const { skillDisplay, skillItem, skillGridColumns } = d;

  function updateSkill(i: number, v: string) {
    setData({ ...data, skills: data.skills.map((x, j) => j === i ? v : x) });
  }

  if (skillDisplay === "tags") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {data.skills.map((sk, i) => (
          <Sel key={i} k="skillItem" ctx={ctx} style={{ ...toCss(skillItem), display: "inline-block" }}
            editInfo={{ value: sk, onChange: v => updateSkill(i, v) }}>
            {sk}
          </Sel>
        ))}
      </div>
    );
  }
  if (skillDisplay === "inline") {
    return <Sel k="skillItem" ctx={ctx} block style={toCss(skillItem)}>{data.skills.join(" · ")}</Sel>;
  }
  if (skillDisplay === "grid") {
    const rows: string[][] = [];
    for (let i = 0; i < data.skills.length; i += skillGridColumns) rows.push(data.skills.slice(i, i + skillGridColumns));
    return (
      <>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex" }}>
            {row.map((sk, ci) => {
              const gi = ri * skillGridColumns + ci;
              return (
                <Sel key={ci} k="skillItem" ctx={ctx} style={{ ...toCss(skillItem), flex: 1 }}
                  editInfo={{ value: sk, onChange: v => updateSkill(gi, v) }}>
                  {sk}
                </Sel>
              );
            })}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {data.skills.map((sk, i) => (
        <div key={i} style={{ display: "flex", marginBottom: 2 }}>
          <span style={{ width: d.bulletMarkerWidth, color: d.bulletMarkerColor, flexShrink: 0 }}>{d.bulletMarkerChar}</span>
          <Sel k="skillItem" ctx={ctx} style={toCss(skillItem)}
            editInfo={{ value: sk, onChange: v => updateSkill(i, v) }}>
            {sk}
          </Sel>
        </div>
      ))}
    </>
  );
}

function BioC({ data, d, ctx, setData }: SectionProps) {
  return (
    <Sel k="summary" ctx={ctx} block style={toCss(d.summary)}
      editInfo={{ value: data.summary, onChange: v => setData({ ...data, summary: v }), multiline: true }}>
      {data.summary || <em style={{ opacity: 0.3 }}>Write a brief professional summary…</em>}
    </Sel>
  );
}

function LinksC({ data, d, ctx, setData }: SectionProps) {
  return (
    <>
      {data.extraLinks.filter(l => l.label || l.url).map((lnk, i) => (
        <Sel key={i} k="linkItem" ctx={ctx} block style={toCss(d.linkItem)}
          editInfo={{ value: lnk.label || lnk.url, onChange: v => {
            setData({ ...data, extraLinks: data.extraLinks.map((x, j) => j === i ? { ...x, label: v } : x) });
          }}}>
          {lnk.label || lnk.url}
        </Sel>
      ))}
    </>
  );
}

function SectionContent({ id, data, d, ctx, setData }: SectionProps & { id: SectionId }) {
  switch (id) {
    case "work":      return <WorkC     data={data} d={d} ctx={ctx} setData={setData} />;
    case "projects":  return <ProjectsC data={data} d={d} ctx={ctx} setData={setData} />;
    case "education": return <EduC      data={data} d={d} ctx={ctx} setData={setData} />;
    case "skills":    return <SkillsC data={data} d={d} ctx={ctx} setData={setData} />;
    case "bio":       return <BioC    data={data} d={d} ctx={ctx} setData={setData} />;
    case "links":     return <LinksC  data={data} d={d} ctx={ctx} setData={setData} />;
  }
}

function SectionC({ id, data, d, ctx, setData }: SectionProps & { id: SectionId }) {
  if (!sectionHasContent(id, data)) return null;
  return (
    <div>
      <SectionHeadingC title={SECTION_LABELS[id]} d={d} ctx={ctx} />
      <SectionContent id={id} data={data} d={d} ctx={ctx} setData={setData} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function HeaderC({ data, d, ctx, setData }: SectionProps) {
  const fullName = `${data.firstName} ${data.lastName}`.trim() || "Your Name";
  const contact  = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];
  return (
    <div>
      <Sel k="name" ctx={ctx} block style={toCss(d.name)}
        editInfo={{ value: fullName, onChange: v => {
          const idx = v.indexOf(" ");
          if (idx === -1) setData({ ...data, firstName: v, lastName: "" });
          else setData({ ...data, firstName: v.slice(0, idx), lastName: v.slice(idx + 1) });
        }}}>
        {fullName}
      </Sel>
      {contact.length > 0 && (
        <Sel k="contact" ctx={ctx} block style={toCss(d.contact)}>
          {contact.join(d.contact.separator)}
        </Sel>
      )}
    </div>
  );
}

// ── Per-element canvas components ─────────────────────────────────────────────
// Standalone name / contact / single-entry renderers used in FreeFormLayout
// so each entry is an independently moveable block.

function NameC({ data, d, ctx, setData }: SectionProps) {
  const fullName = `${data.firstName} ${data.lastName}`.trim() || "Your Name";
  return (
    <Sel k="name" ctx={ctx} block style={toCss(d.name)}
      editInfo={{ value: fullName, onChange: v => {
        const idx = v.indexOf(" ");
        if (idx === -1) setData({ ...data, firstName: v, lastName: "" });
        else setData({ ...data, firstName: v.slice(0, idx), lastName: v.slice(idx + 1) });
      }}}>
      {fullName}
    </Sel>
  );
}

function ContactC({ data, d, ctx }: Omit<SectionProps, "setData"> & { setData?: (d: ResumeData) => void }) {
  const contact = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];
  if (contact.length === 0) return null;
  return (
    <Sel k="contact" ctx={ctx} block style={toCss(d.contact)}>
      {contact.join(d.contact.separator)}
    </Sel>
  );
}

function SingleWorkEntryC({ entry: e, i, data, d, ctx, setData }: SectionProps & { entry: WorkEntry; i: number }) {
  function update(partial: Partial<WorkEntry>) {
    setData({ ...data, workEntries: data.workEntries.map((x, j) => j === i ? { ...x, ...partial } : x) });
  }
  const pfx = `work.${e.id}`;
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(e.body ?? "");
  const [bodyFontSize, setBodyFontSize] = useState(d.entryBullet.fontSize);
  const [bodyFontBase, setBodyFontBase] = useState<"default" | "Helvetica" | "Times" | "Courier">("default");
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const bodyEditRef = useRef<HTMLDivElement>(null);
  const bodyRoleBaseHeightRef = useRef<number | null>(null);

  // Repeated role elements are linked by default. SubDrag itself inherits the shared
  // geometry from a linked peer; an explicitly unlinked element falls back to its own
  // saved geometry (or the normal default) instead of accidentally borrowing a peer.
  const workLinkKeys = (part: "logo" | "title" | "org" | "date" | "body") =>
    data.workEntries.map(we => `work.${we.id}.${part}`);

  // First peer entry: used as the inheritance source for sub-element positions (dx/dy).
  // When this entry has no own override for a sub-element (e.g. title), it inherits the
  // peer's offset so new entries automatically match the existing layout (e.g. title beside logo).
  const firstPeerId = data.workEntries.find(we => we.id !== e.id)?.id;
  const peerPfx = firstPeerId ? `work.${firstPeerId}` : undefined;

  function normalizeBodyHtml(html: string): string | undefined {
    const probe = document.createElement("div");
    probe.innerHTML = html;
    const meaningfulText = (probe.textContent ?? "").replace(/\u200B/g, "").trim();
    return meaningfulText ? html : undefined;
  }

  function commitBodyEditor() {
    const html = bodyEditRef.current?.innerHTML ?? bodyDraft;
    const normalized = normalizeBodyHtml(html);
    if ((e.body ?? undefined) !== normalized) update({ body: normalized });
    setBodyDraft(normalized ?? "");
    setEditingBody(false);
  }

  function openBodyEditor(ev: React.MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    ctx.onClearSelect();
    setBodyDraft(e.body ?? "");
    setBodyFontSize(d.entryBullet.fontSize);
    setBodyFontBase("default");
    setEditingBody(true);
  }

  useLayoutEffect(() => {
    if (!editingBody || !bodyEditRef.current) return;
    const el = bodyEditRef.current;
    el.innerHTML = e.body ?? "";
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch { /* Safari can throw while the node is settling. */ }
  }, [editingBody]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!editingBody || !bodyWrapRef.current) return;

    // Measure the whole role block, not just the description. The role is absolutely
    // positioned in pass 2, so its intrinsic growth does not naturally move siblings.
    const roleOuter = bodyWrapRef.current.closest<HTMLElement>(`[data-blockid="${pfx}"]`);
    const roleInner = roleOuter?.querySelector<HTMLElement>(".canvas-block");
    if (!roleInner) return;

    bodyRoleBaseHeightRef.current = roleInner.offsetHeight;

    const emitDelta = () => {
      const base = bodyRoleBaseHeightRef.current;
      if (base == null) return;
      const delta = Math.max(0, roleInner.offsetHeight - base);
      window.dispatchEvent(new CustomEvent("resume-inline-block-resize", {
        detail: { blockId: pfx, delta },
      }));
    };

    emitDelta();
    const observer = new ResizeObserver(emitDelta);
    observer.observe(roleInner);

    return () => {
      observer.disconnect();
      bodyRoleBaseHeightRef.current = null;
      window.dispatchEvent(new CustomEvent("resume-inline-block-resize", {
        detail: { blockId: pfx, delta: 0 },
      }));
    };
  }, [editingBody, pfx]);

  useEffect(() => {
    if (!editingBody) return;
    function closeOnOutsideClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (bodyWrapRef.current?.contains(target as Node)) return;
      if (target?.closest?.(`[data-inline-body-toolbar="${pfx}"]`)) return;
      commitBodyEditor();
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [editingBody, bodyDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  function richBodyCommand(command: string, value?: string) {
    const el = bodyEditRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    setBodyDraft(el.innerHTML);
  }

  function applyBodyFontSize(pt: number) {
    const el = bodyEditRef.current;
    if (!el) return;
    el.focus();

    // execCommand's fontSize API only accepts 1–7, so use a temporary marker and
    // immediately convert it to the exact point size used everywhere else in the resume.
    document.execCommand("fontSize", false, "7");
    el.querySelectorAll<HTMLFontElement>('font[size="7"]').forEach(font => {
      font.removeAttribute("size");
      font.style.fontSize = `${pt}pt`;
    });

    setBodyFontSize(pt);
    setBodyDraft(el.innerHTML);
  }

  function applyBodyFontFamily(base: "default" | "Helvetica" | "Times" | "Courier") {
    const el = bodyEditRef.current;
    if (!el) return;
    el.focus();

    const face = base === "default"
      ? parseFontFamily(d.entryBullet.fontFamily).base
      : base;

    const cssFace = face === "Times"
      ? "Times New Roman"
      : face === "Courier"
      ? "Courier New"
      : "Helvetica";

    document.execCommand("fontName", false, cssFace);
    setBodyFontBase(base);
    setBodyDraft(el.innerHTML);
  }

  function richButton(label: ReactNode, title: string, command: string, value?: string, active?: boolean) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); }}
        onClick={ev => { ev.stopPropagation(); richBodyCommand(command, value); }}
        style={{
          width: 27, height: 27, border: "none", borderRadius: 4,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: active ? "#ede9fe" : "transparent",
          color: active ? "#7c3aed" : "#374151",
          cursor: "pointer", fontSize: 12, flexShrink: 0,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      {d.showCompanyLogos && e.company && (
        <SubDrag
          overrideKey={`${pfx}.logo`}
          defaultWidth={20}
          design={d}
          linkKeys={workLinkKeys("logo")}
          linkLabel="Company logo"
          crossFormatCompanyLogo
          allWorkEntryIds={data.workEntries.map(entry => entry.id)}
        >
          <CanvasLogo company={e.company} logoUrl={e.logoUrl} />
        </SubDrag>
      )}
      <SubDrag overrideKey={`${pfx}.title`} inheritFrom={peerPfx ? `${peerPfx}.title` : undefined}
        linkKeys={workLinkKeys("title")} linkLabel="Job title">
        {d.entryDate.position === "right" ? (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <Sel k="entryTitle" ctx={ctx} style={{ ...toCss(d.entryTitle), flex: 1, marginRight: 8 }}
              editInfo={{ value: e.title, onChange: v => update({ title: v }) }}>
              {e.title || <em style={{ opacity: 0.3 }}>Job title</em>}
            </Sel>
            <Sel k="entryDate" ctx={ctx} style={{ ...toCss(d.entryDate), flexShrink: 0 }}>
              {formatDateRange(e.startDate, e.endDate, e.current)}
            </Sel>
          </div>
        ) : (
          <Sel k="entryTitle" ctx={ctx} block style={toCss(d.entryTitle)}
            editInfo={{ value: e.title, onChange: v => update({ title: v }) }}>
            {e.title || <em style={{ opacity: 0.3 }}>Job title</em>}
          </Sel>
        )}
      </SubDrag>
      <SubDrag overrideKey={`${pfx}.org`} inheritFrom={peerPfx ? `${peerPfx}.org` : undefined}
        linkKeys={workLinkKeys("org")} linkLabel="Company">
        <Sel k="entryOrg" ctx={ctx} block style={toCss(d.entryOrg)}
          editInfo={{ value: e.company, onChange: v => update({ company: v }) }}>
          {e.company || <em style={{ opacity: 0.3 }}>Company name</em>}
        </Sel>
      </SubDrag>
      {d.entryDate.position === "below" && (
        <SubDrag overrideKey={`${pfx}.date`} inheritFrom={peerPfx ? `${peerPfx}.date` : undefined}
          linkKeys={workLinkKeys("date")} linkLabel="Date">
          <Sel k="entryDate" ctx={ctx} block style={toCss(d.entryDate)}>
            {formatDateRange(e.startDate, e.endDate, e.current)}
          </Sel>
        </SubDrag>
      )}
      <SubDrag overrideKey={`${pfx}.body`} inheritFrom={peerPfx ? `${peerPfx}.body` : undefined}
        linkKeys={workLinkKeys("body")} linkLabel="Description" constrainToBounds>
        <div
          ref={bodyWrapRef}
          data-selectable-key="entryBullet"
          onMouseEnter={() => { if (!editingBody) ctx.onHover("entryBullet"); }}
          onMouseLeave={() => { if (!editingBody) ctx.onHover(null); }}
          onClick={ev => {
            if (editingBody) return;
            ev.stopPropagation();
            ctx.onSelect("entryBullet", ev.currentTarget);
          }}
          onDoubleClick={openBodyEditor}
          onContextMenu={ev => {
            if (editingBody) return;
            ev.preventDefault();
            ev.stopPropagation();
            ctx.onRightClick("entryBullet", ev.currentTarget);
          }}
          style={{
            position: "relative",
            borderRadius: 2,
            cursor: editingBody ? "text" : "inherit",
            boxShadow: !editingBody && ctx.selected === "entryBullet"
              ? "0 0 0 1px #9ca3af"
              : !editingBody && ctx.hovered === "entryBullet"
              ? "0 0 0 1px rgba(0,0,0,0.12)"
              : "none",
            transition: "box-shadow 0.1s",
          }}
        >
          {editingBody ? (
            <div
              ref={bodyEditRef}
              contentEditable
              suppressContentEditableWarning
              className="resume-body-html"
              onMouseDown={ev => ev.stopPropagation()}
              onClick={ev => ev.stopPropagation()}
              onDoubleClick={ev => ev.stopPropagation()}
              onInput={ev => setBodyDraft((ev.currentTarget as HTMLDivElement).innerHTML)}
              onPaste={ev => {
                ev.preventDefault();
                const plain = ev.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, plain);
                requestAnimationFrame(() => {
                  if (bodyEditRef.current) setBodyDraft(bodyEditRef.current.innerHTML);
                });
              }}
              onKeyDown={ev => {
                ev.stopPropagation();
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  commitBodyEditor();
                }
              }}
              style={{
                ...toCss(d.entryBullet),
                minHeight: 16,
                outline: "1px solid rgba(124,58,237,0.5)",
                outlineOffset: 2,
                borderRadius: 2,
                cursor: "text",
                width: "100%",
                maxWidth: "100%",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <EntryBody body={e.body} d={d} />
          )}
        </div>
      </SubDrag>

      {editingBody && bodyWrapRef.current && createPortal((() => {
        const rect = bodyWrapRef.current!.getBoundingClientRect();
        const toolbarH = 38;
        const toolbarW = Math.min(590, window.innerWidth - 8);
        const top = rect.top - toolbarH - 6 >= 4
          ? rect.top - toolbarH - 6
          : Math.min(window.innerHeight - toolbarH - 4, rect.bottom + 6);
        const left = Math.min(window.innerWidth - toolbarW - 4, Math.max(4, rect.left));
        const divider = <span style={{ width: 1, height: 17, background: "#e5e7eb", margin: "0 3px", flexShrink: 0 }} />;
        return (
          <div
            data-inline-body-toolbar={pfx}
            onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); }}
            onClick={ev => ev.stopPropagation()}
            style={{
              position: "fixed", top, left, zIndex: 10000,
              minHeight: toolbarH,
              display: "flex", alignItems: "center", gap: 2,
              padding: "4px 6px",
              ...CONTEXT_TOOLBAR_SURFACE,
              whiteSpace: "nowrap",
            }}
          >
            {/* Keep description editing consistent with the other text toolbars:
                font family/style and size come first, then inline formatting. */}
            <select
              value={bodyFontBase}
              title="Font"
              onMouseDown={ev => ev.stopPropagation()}
              onChange={ev => applyBodyFontFamily(ev.target.value as "default" | "Helvetica" | "Times" | "Courier")}
              style={{
                height: 27, maxWidth: 92, border: "1px solid #d1d5db", borderRadius: 5,
                background: "white", color: "#374151", fontSize: 11, padding: "0 5px",
                cursor: "pointer",
              }}
            >
              <option value="default">Default</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times">Times</option>
              <option value="Courier">Courier</option>
            </select>

            <button
              type="button"
              title="Decrease font size"
              onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); }}
              onClick={ev => { ev.stopPropagation(); applyBodyFontSize(Math.max(6, bodyFontSize - 1)); }}
              style={{ ...TB_BTN, width: 25, height: 27 }}
            >−</button>
            <span style={{ minWidth: 21, textAlign: "center", fontSize: 11, color: "#374151" }}>
              {bodyFontSize}
            </span>
            <button
              type="button"
              title="Increase font size"
              onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); }}
              onClick={ev => { ev.stopPropagation(); applyBodyFontSize(Math.min(72, bodyFontSize + 1)); }}
              style={{ ...TB_BTN, width: 25, height: 27 }}
            >+</button>

            {divider}
            {richButton(<strong>B</strong>, "Bold selected text", "bold")}
            {richButton(<em>I</em>, "Italic selected text", "italic")}
            {richButton(<span style={{ textDecoration: "underline" }}>U</span>, "Underline selected text", "underline")}
            {divider}
            {richButton(<List size={14} strokeWidth={1.8} />, "Bulleted list", "insertUnorderedList")}
            {richButton(<ListOrdered size={14} strokeWidth={1.8} />, "Numbered list", "insertOrderedList")}
            {divider}
            {richButton(<AlignIcon align="left" />, "Align left", "justifyLeft")}
            {richButton(<AlignIcon align="center" />, "Align center", "justifyCenter")}
            {richButton(<AlignIcon align="right" />, "Align right", "justifyRight")}
            {divider}
            <button
              type="button"
              onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); }}
              onClick={ev => { ev.stopPropagation(); commitBodyEditor(); }}
              style={{
                height: 27, padding: "0 9px", border: "none", borderRadius: 5,
                background: "#7c3aed", color: "white", cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >
              Done
            </button>
          </div>
        );
      })(), document.body)}
    </div>
  );
}

function SingleEduEntryC({ entry: e, i, data, d, ctx, setData }: SectionProps & { entry: EducationEntry; i: number }) {
  function update(partial: Partial<EducationEntry>) {
    setData({ ...data, education: data.education.map((x, j) => j === i ? { ...x, ...partial } : x) });
  }
  const degreeField = [e.degree, e.field].filter(Boolean).join(", ");
  const pfx = `edu.${e.id}`;

  // Phase 7: repeated education fields use the same linked-by-default geometry
  // model as work roles. Content stays unique; layout edits stay consistent.
  const eduLinkKeys = (part: "title" | "org" | "date") =>
    data.education.map(edu => `edu.${edu.id}.${part}`);
  const firstPeerId = data.education.find(edu => edu.id !== e.id)?.id;
  const peerPfx = firstPeerId ? `edu.${firstPeerId}` : undefined;

  return (
    <div>
      <SubDrag overrideKey={`${pfx}.title`} inheritFrom={peerPfx ? `${peerPfx}.title` : undefined}
        linkKeys={eduLinkKeys("title")} linkLabel="School">
        {d.entryDate.position === "right" ? (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <Sel k="entryTitle" ctx={ctx} style={{ ...toCss(d.entryTitle), flex: 1, marginRight: 8 }}
              editInfo={{ value: e.school, onChange: v => update({ school: v }) }}>
              {e.school || <em style={{ opacity: 0.3 }}>School name</em>}
            </Sel>
            <Sel k="entryDate" ctx={ctx} style={{ ...toCss(d.entryDate), flexShrink: 0 }}>
              {formatEduYears(e.startYear, e.endYear, e.current)}
            </Sel>
          </div>
        ) : (
          <Sel k="entryTitle" ctx={ctx} block style={toCss(d.entryTitle)}
            editInfo={{ value: e.school, onChange: v => update({ school: v }) }}>
            {e.school || <em style={{ opacity: 0.3 }}>School name</em>}
          </Sel>
        )}
      </SubDrag>
      {degreeField && (
        <SubDrag overrideKey={`${pfx}.org`} inheritFrom={peerPfx ? `${peerPfx}.org` : undefined}
          linkKeys={eduLinkKeys("org")} linkLabel="Degree">
          <Sel k="entryOrg" ctx={ctx} block style={toCss(d.entryOrg)}
            editInfo={{ value: degreeField, onChange: v => {
              const [deg, ...rest] = v.split(",");
              update({ degree: deg.trim(), field: rest.join(",").trim() });
            }}}>
            {degreeField}
          </Sel>
        </SubDrag>
      )}
      {d.entryDate.position === "below" && formatEduYears(e.startYear, e.endYear, e.current) && (
        <SubDrag overrideKey={`${pfx}.date`} inheritFrom={peerPfx ? `${peerPfx}.date` : undefined}
          linkKeys={eduLinkKeys("date")} linkLabel="Education date">
          <Sel k="entryDate" ctx={ctx} block style={toCss(d.entryDate)}>
            {formatEduYears(e.startYear, e.endYear, e.current)}
          </Sel>
        </SubDrag>
      )}
    </div>
  );
}

// ── Draggable block ───────────────────────────────────────────────────────────
// Wraps any canvas element: move by dragging inside, resize with edge handles,
// rotate with the circle handle above. All state saved to design.layoutOverrides.
//
// Drag semantics (Phase 1):
//   Horizontal drag → visualDx  (visual-only, no flow cascade)
//   Vertical   drag → flowDisplacementY  (cascades to subsequent siblings in region)
//   Width resize    → width override (triggers text reflow in next pass-1)
// Overrides accumulate correctly: each drag captures start-override + pointer delta,
// avoiding the double-count bug where rendered-pos already contains the old override.

interface DragBlockProps {
  id: string;
  computedPos: ComputedPos;           // from layout engine: base + cumulative overrides
  override: LayoutOverride | undefined; // current override for this block
  scale: number;
  design: ResumeDesign;
  onDesignChange: (d: ResumeDesign) => void;
  onHoverBlock: (id: string | null) => void;
  onBlockClick?: (id: string, rect: DOMRect | null) => void;
  onDragMove?: (dy: number, dx: number) => void;
  onDragEnd?: (dx: number, dy: number) => void;
  // Live rotation callbacks: heading fires these during and after rotation drag so
  // FreeLayout can propagate the live angle to entries for real-time group rotation.
  onRotate?: (rot: number) => void;
  onRotateEnd?: () => void;
  additionalDy?: number;
  additionalDx?: number;
  // Group rotation: when the section heading is rotated, entries receive the
  // heading's rotation here so they visually rotate with the group. Kept separate
  // from override.rotation so each entry's own rotation drag is still independent.
  additionalRotation?: number;
  // For section heading blocks: computed height encompassing the entries in this page fragment.
  // Makes the block visually span the visible portion of the section on this page.
  groupHeight?: number;
  // When a section spans pages, clamp a saved manual height to the current page.
  groupMaxHeight?: number;
  // Forced hover: true when any block in this section is hovered (makes group border visible).
  forcedHover?: boolean;
  children: ReactNode;
}

// px of invisible padding above the block that keeps handles reachable
const ABOVE_PAD = 30;
const HC = "#7c3aed"; // handle colour

function DraggableBlock({ id, computedPos, override, scale, design, onDesignChange, onHoverBlock, onBlockClick, onDragMove, onDragEnd, onRotate, onRotateEnd, additionalDy, additionalDx, additionalRotation, groupHeight, groupMaxHeight, forcedHover, children }: DragBlockProps) {
  // abovePad = 0: every block's outer div starts exactly at its visible content top.
  // No block's invisible zone extends into the space above it, so adjacent blocks
  // never intercept each other's hover/click events when stacked closely.
  const abovePad = 0;

  const initRot = override?.rotation ?? 0;

  const [pos,        setPos]      = useState({ x: computedPos.x, y: computedPos.y });
  const [width,      setWidth]    = useState(computedPos.w);
  const [height,     setHeight]   = useState<number | null>(override?.height ?? null);
  const [rotation,   setRotation] = useState(initRot);
  const [isDragging, setIsDrag]   = useState(false);
  const [isHovered,  setHover]    = useState(false);
  const [isResizing, setIsRes]    = useState(false);
  const [isRotating, setIsRot]    = useState(false);
  const [isPinned,   setIsPinned] = useState(false);

  const posRef      = useRef({ x: computedPos.x, y: computedPos.y });
  const widthRef    = useRef(computedPos.w);
  const heightRef   = useRef<number | null>(override?.height ?? null);
  const rotRef      = useRef(initRot);
  const wasDragRef  = useRef(false);
  const innerRef    = useRef<HTMLDivElement | null>(null);
  const outerDivRef = useRef<HTMLDivElement | null>(null);
  const designRef       = useRef(design);
  const onChangeRef     = useRef(onDesignChange);
  const scaleRef        = useRef(scale);
  const onBlockClickRef = useRef(onBlockClick);
  const onDragMoveRef   = useRef(onDragMove);
  const onDragEndRef    = useRef(onDragEnd);
  const onRotateRef     = useRef(onRotate);
  const onRotateEndRef  = useRef(onRotateEnd);

  useEffect(() => { designRef.current     = design;         }, [design]);
  useEffect(() => { onChangeRef.current   = onDesignChange; }, [onDesignChange]);
  useEffect(() => { scaleRef.current      = scale;          }, [scale]);
  useEffect(() => { onBlockClickRef.current = onBlockClick; }, [onBlockClick]);
  useEffect(() => { onDragMoveRef.current   = onDragMove;   }, [onDragMove]);
  useEffect(() => { onDragEndRef.current    = onDragEnd;    }, [onDragEnd]);
  useEffect(() => { onRotateRef.current     = onRotate;     }, [onRotate]);
  useEffect(() => { onRotateEndRef.current  = onRotateEnd;  }, [onRotateEnd]);

  // When computed position changes (layout engine rerun or override changed externally),
  // sync local state so the block renders at the new position.
  useEffect(() => {
    posRef.current = { x: computedPos.x, y: computedPos.y };
    setPos({ x: computedPos.x, y: computedPos.y });
    widthRef.current = computedPos.w;
    setWidth(computedPos.w);
  }, [computedPos.x, computedPos.y, computedPos.w]);

  useEffect(() => {
    const rot = override?.rotation ?? 0;
    rotRef.current = rot; setRotation(rot);
  }, [override?.rotation]);

  useEffect(() => {
    const h = override?.height ?? null;
    heightRef.current = h; setHeight(h);
  }, [override?.height]);

  // Unpin when the user clicks outside this block.
  useEffect(() => {
    if (!isPinned) return;
    function handler(e: MouseEvent) {
      if (outerDivRef.current && !outerDivRef.current.contains(e.target as Node)) {
        setIsPinned(false);
      }
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [isPinned]);

  // Persist a partial override update.  Merges with existing override and strips zeros.
  function saveOverride(updates: Partial<LayoutOverride>) {
    const d = designRef.current;
    const existing = d.layoutOverrides?.[id] ?? {};
    const next: LayoutOverride = { ...existing, ...updates };
    if (!next.flowDisplacementY) delete next.flowDisplacementY;
    if (!next.visualDx)          delete next.visualDx;
    if (!next.rotation)          delete next.rotation;
    if (!next.width)             delete next.width;
    if (!next.height)            delete next.height;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}), [id]: next };
    if (!Object.keys(next).length) delete layoutOverrides[id];
    onChangeRef.current({ ...d, layoutOverrides });
  }

  const s = () => scaleRef.current || 1;

  // ── Move ──────────────────────────────────────────────────────────────────
  // Horizontal → visualDx (visual only)
  // Vertical   → flowDisplacementY (cascades to subsequent region siblings)
  // Accumulation: capture start-override at drag start, add pointer delta.
  // This avoids double-counting since computedPos already bakes in the old override.
  function handleMouseDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest("[data-handle]")) return;
    const startCX = ev.clientX, startCY = ev.clientY;
    const startPX = posRef.current.x, startPY = posRef.current.y;
    const isRoleBlock = (
      id.startsWith("work.") ||
      id.startsWith("projects.") ||
      id.startsWith("edu.")
    ) && !id.endsWith(".heading");
    const startVisualDx          = override?.visualDx          ?? 0;
    const startVisualDy          = override?.visualDy          ?? 0;
    const startFlowDisplacementY = override?.flowDisplacementY ?? 0;
    let moved = false;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - startCX, dy = e.clientY - startCY;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { moved = true; setIsDrag(true); }
      if (moved) {
        const scaledDy = dy / s();
        const scaledDx = dx / s();
        posRef.current = { x: startPX + scaledDx, y: startPY + scaledDy };
        setPos({ ...posRef.current });
        onDragMoveRef.current?.(scaledDy, scaledDx);
      }
    }
    function onUp(e: MouseEvent) {
      if (moved) {
        wasDragRef.current = true;
        setTimeout(() => { wasDragRef.current = false; }, 80);
        setIsDrag(false);
        const dx = (e.clientX - startCX) / s();
        const dy = (e.clientY - startCY) / s();
        if (onDragEndRef.current) {
          // Heading with group drag: parent handles ALL override saving in one
          // atomic onDesignChange call to avoid React batching clobbering the
          // heading's flowDisplacementY when entries' visualDx is also updated.
          onDragEndRef.current(dx, dy);
        } else if (isRoleBlock) {
          // Independent vertical offset - does not cascade to other roles.
          saveOverride({
            visualDx: startVisualDx + dx,
            visualDy: startVisualDy + dy,
            flowDisplacementY: 0,  // clear any legacy cascade offset
          });
        } else {
          saveOverride({
            visualDx:          startVisualDx          + dx,
            flowDisplacementY: startFlowDisplacementY + dy,
          });
        }
      } else {
        setIsPinned(true);
        onBlockClickRef.current?.(id, innerRef.current?.getBoundingClientRect() ?? null);
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ── Width resize (left / right edge) ─────────────────────────────────────
  // Width change triggers text reflow → height change → flow cascade in next pass-1.
  // Height is never stored; only width is overridable for text/semantic blocks.
  function makeWidthResizeDown(leftEdge: boolean) {
    return (ev: React.MouseEvent) => {
      ev.stopPropagation(); ev.preventDefault(); setIsRes(true);
      const startCX = ev.clientX;
      const startW  = widthRef.current;
      const startX  = posRef.current.x;
      const startVisualDx = override?.visualDx ?? 0;

      function onMove(e: MouseEvent) {
        const dx = (e.clientX - startCX) / s();
        if (leftEdge) {
          const nw = Math.max(40, startW - dx);
          widthRef.current = nw;
          posRef.current = { ...posRef.current, x: startX + (startW - nw) };
          setWidth(nw); setPos({ ...posRef.current });
        } else {
          widthRef.current = Math.max(40, startW + dx);
          setWidth(widthRef.current);
        }
      }
      function onUp(e: MouseEvent) {
        setIsRes(false);
        const dx = (e.clientX - startCX) / s();
        if (leftEdge) {
          const nw = Math.max(40, startW - dx);
          saveOverride({ width: nw, visualDx: startVisualDx + (startW - nw) });
        } else {
          saveOverride({ width: Math.max(40, startW + dx) });
        }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    };
  }

  const handleLeft  = makeWidthResizeDown(true);
  const handleRight = makeWidthResizeDown(false);

  // ── Height resize (top / bottom edge) ────────────────────────────────────
  function makeHeightResizeDown(topEdge: boolean) {
    return (ev: React.MouseEvent) => {
      ev.stopPropagation(); ev.preventDefault(); setIsRes(true);
      const startCY = ev.clientY;
      const startH  = heightRef.current ?? (innerRef.current?.getBoundingClientRect().height ?? 60) / s();
      const startY  = posRef.current.y;
      const startFlowDisplacementY = override?.flowDisplacementY ?? 0;

      function onMove(e: MouseEvent) {
        const dy = (e.clientY - startCY) / s();
        if (topEdge) {
          const nh = Math.max(20, startH - dy);
          heightRef.current = nh;
          posRef.current = { ...posRef.current, y: startY + dy };
          setHeight(nh); setPos({ ...posRef.current });
        } else {
          heightRef.current = Math.max(20, startH + dy);
          setHeight(heightRef.current);
        }
      }
      function onUp(e: MouseEvent) {
        setIsRes(false);
        const dy = (e.clientY - startCY) / s();
        if (topEdge) {
          const nh = Math.max(20, startH - dy);
          saveOverride({ height: nh, flowDisplacementY: startFlowDisplacementY + dy });
        } else {
          saveOverride({ height: Math.max(20, startH + dy) });
        }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    };
  }

  const handleTop    = makeHeightResizeDown(true);
  const handleBottom = makeHeightResizeDown(false);

  // ── Rotation ──────────────────────────────────────────────────────────────
  function handleRotateDown(ev: React.MouseEvent) {
    ev.stopPropagation(); ev.preventDefault(); setIsRot(true);
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    function onMove(e: MouseEvent) {
      rotRef.current = snapRotation(Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90) * 10) / 10);
      setRotation(rotRef.current);
      onRotateRef.current?.(rotRef.current);
    }
    function onUp() {
      setIsRot(false);
      saveOverride({ rotation: rotRef.current || undefined });
      onRotateEndRef.current?.();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  function handleClickCapture(ev: React.MouseEvent) {
    if (wasDragRef.current) { ev.stopPropagation(); ev.preventDefault(); }
  }

  // Clear all child sub-element overrides for this block (e.g., work.<entryId>.title etc.)
  function clearChildOverrides() {
    const d = designRef.current;
    const prefix = id + ".";
    const layoutOverrides = Object.fromEntries(
      Object.entries(d.layoutOverrides ?? {}).filter(([k]) => !k.startsWith(prefix))
    );
    onChangeRef.current({ ...d, layoutOverrides });
  }

  const isEntryBlock =
    id.startsWith("work.") ||
    id.startsWith("projects.") ||
    id.startsWith("edu.");
  const hasChildOverrides = isEntryBlock &&
    Object.keys(design.layoutOverrides ?? {}).some(k => k.startsWith(id + "."));

  const showHandles = (isHovered || forcedHover || isResizing || isRotating || isPinned) && !isDragging;

  const edgeH = (cursor: string, p: CSSProperties, w = 10, h = 20): CSSProperties => ({
    position: "absolute", ...p,
    width: w, height: h, borderRadius: 3,
    backgroundColor: "white", border: `1.5px solid ${HC}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.18)", cursor, zIndex: 30,
  });

  return (
    <SectionBoundsCtx.Provider value={{ containerRef: innerRef, design, onDesignChange, scale }}>
      {/* Outer zone: extends ABOVE_PAD px above the content so mouse can reach the rotation handle.
          Hover events live on the inner content div - NOT here - so the hover zone matches the
          visible block, not the invisible pad zone above it. */}
      <div
        ref={outerDivRef}
        data-blockid={id}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClickCapture}
        style={{
          position: "absolute",
          left: pos.x + (additionalDx ?? 0),
          top:  pos.y - abovePad + (additionalDy ?? 0),
          width,
          paddingTop: abovePad,
          boxSizing: "border-box",
          zIndex: isDragging || isResizing || isRotating || isPinned ? 20 : "auto",
        }}
      >
        {/* (rotation handle is now inside the inner div so it rotates with the content) */}

        {/* Inner content div - carries the outline, rotation, and resize handles */}
        <div
          ref={innerRef}
          onMouseEnter={() => { setHover(true);  onHoverBlock(id); }}
          onMouseLeave={() => { if (!isDragging && !isResizing && !isRotating) { setHover(false); if (!isPinned) onHoverBlock(null); } }}
          className={isDragging ? "canvas-block canvas-block--dragging" : "canvas-block"}
          style={{
            position: "relative",
            width: "100%",
            minHeight: groupHeight != null
              ? Math.max(groupHeight, Math.min(height ?? 0, groupMaxHeight ?? Number.POSITIVE_INFINITY))
              : height != null ? height * scale : undefined, // entry blocks: user resize override only
            transform:       (rotation || additionalRotation) ? `rotate(${rotation + (additionalRotation ?? 0)}deg)` : undefined,
            transformOrigin: "center center",
            outline: isDragging ? `1.5px dashed ${HC}` : showHandles ? `1px solid ${HC}55` : "none",
          }}
        >
          {showHandles && (
            /* Rotation handle lives INSIDE the rotating inner div so it always sits at
               the top-center of the block even as the block rotates. Being inside the
               inner div also means the mouse never leaves the hover zone while moving
               toward the handle, so it never disappears mid-reach. */
            <div
              data-handle="rotate"
              onMouseDown={handleRotateDown}
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", top: -14, left: "50%",
                transform: "translateX(-50%)",
                width: 14, height: 14, borderRadius: "50%",
                backgroundColor: HC, border: "2px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                cursor: "crosshair", zIndex: 30,
              }}
            />
          )}

          {children}

          {showHandles && (
            <>
              {/* Left / Right edge handles */}
              <div data-handle="resize-left"   onMouseDown={handleLeft}   onClick={e=>e.stopPropagation()} style={edgeH("ew-resize", { top:"50%",  left:-5,  transform:"translateY(-50%)" })} />
              <div data-handle="resize-right"  onMouseDown={handleRight}  onClick={e=>e.stopPropagation()} style={edgeH("ew-resize", { top:"50%",  right:-5, transform:"translateY(-50%)" })} />
              {/* Top / Bottom edge handles */}
              <div data-handle="resize-top"    onMouseDown={handleTop}    onClick={e=>e.stopPropagation()} style={edgeH("ns-resize", { top:-5,    left:"50%", transform:"translateX(-50%)" }, 20, 10)} />
              <div data-handle="resize-bottom" onMouseDown={handleBottom} onClick={e=>e.stopPropagation()} style={edgeH("ns-resize", { bottom:-5, left:"50%", transform:"translateX(-50%)" }, 20, 10)} />
            </>
          )}
        </div>

      </div>
    </SectionBoundsCtx.Provider>
  );
}


// ── Design object layer ───────────────────────────────────────────────────────
//
// Phases 3-8 add smart resume-aware decorative components.
//
// Free design objects still use their own x/y/width/height and never participate in
// resume flow. Attached backgrounds are different only at render time: their geometry
// is derived from page/header/section bounds, so they automatically grow and move with
// the resume content they decorate.
//
// Persisted structured resume content remains completely untouched.

interface ResolvedDesignObject {
  source: ResumeDesignObject;
  rendered: ResumeDesignObject;
}

function designObjectIsResumeDriven(object: ResumeDesignObject): boolean {
  return (object.type === "shape" && !!object.attachment) || object.type === "smart";
}

function designObjectDefaultLayer(object: ResumeDesignObject): DesignObjectLayer {
  if (object.layer) return object.layer;
  if (object.type === "image") return "foreground";
  if (object.type === "smart" && (object.smartKind === "timeline" || object.smartKind === "section-divider")) {
    return "foreground";
  }
  return "background";
}

interface DesignSnapGuideState {
  page: number;
  vertical: number[];
  horizontal: number[];
  spacing: Array<
    | { orientation: "horizontal"; startA: number; endA: number; startB: number; endB: number; cross: number; gap: number }
    | { orientation: "vertical"; startA: number; endA: number; startB: number; endB: number; cross: number; gap: number }
  >;
}

interface DesignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function designRectForObject(object: ResumeDesignObject): DesignRect {
  return { x: object.x, y: object.y, w: object.width, h: object.height };
}

function unionDesignRects(rects: DesignRect[]): DesignRect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map(r => r.x));
  const y = Math.min(...rects.map(r => r.y));
  const right = Math.max(...rects.map(r => r.x + r.w));
  const bottom = Math.max(...rects.map(r => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

function selectionBoundingClientRect(ids: string[], preferredPage?: number): DOMRect | null {
  const rects: DOMRect[] = [];

  for (const id of ids) {
    const candidates = renderedDesignObjectElements(id);
    const preferred = preferredPage == null
      ? candidates[0]
      : candidates.find(el => el.dataset.designObjectPage === String(preferredPage)) ?? candidates[0];
    if (preferred) rects.push(preferred.getBoundingClientRect());
  }

  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));

  return new DOMRect(left, top, right - left, bottom - top);
}

function snapDesignRect(
  rect: DesignRect,
  targets: DesignRect[],
  pageW: number,
  pageH: number,
  page: number,
  threshold = 5,
): { x: number; y: number; guides: DesignSnapGuideState } {
  const xAnchors = [
    { value: rect.x, kind: "left" as const },
    { value: rect.x + rect.w / 2, kind: "center" as const },
    { value: rect.x + rect.w, kind: "right" as const },
  ];
  const yAnchors = [
    { value: rect.y, kind: "top" as const },
    { value: rect.y + rect.h / 2, kind: "middle" as const },
    { value: rect.y + rect.h, kind: "bottom" as const },
  ];

  const xTargets = [0, pageW / 2, pageW];
  const yTargets = [0, pageH / 2, pageH];

  targets.forEach(target => {
    xTargets.push(target.x, target.x + target.w / 2, target.x + target.w);
    yTargets.push(target.y, target.y + target.h / 2, target.y + target.h);
  });

  let bestDx: number | null = null;
  let bestXGuide: number | null = null;
  for (const anchor of xAnchors) {
    for (const target of xTargets) {
      const delta = target - anchor.value;
      if (Math.abs(delta) <= threshold && (bestDx == null || Math.abs(delta) < Math.abs(bestDx))) {
        bestDx = delta;
        bestXGuide = target;
      }
    }
  }

  let bestDy: number | null = null;
  let bestYGuide: number | null = null;
  for (const anchor of yAnchors) {
    for (const target of yTargets) {
      const delta = target - anchor.value;
      if (Math.abs(delta) <= threshold && (bestDy == null || Math.abs(delta) < Math.abs(bestDy))) {
        bestDy = delta;
        bestYGuide = target;
      }
    }
  }

  const spacing: DesignSnapGuideState["spacing"] = [];

  // Equal horizontal spacing: if the moving rectangle sits between two nearby
  // objects, snap it so the left/right gaps are identical.
  const leftCandidates = targets
    .filter(target => target.x + target.w <= rect.x + threshold)
    .sort((a, b) => (b.x + b.w) - (a.x + a.w));
  const rightCandidates = targets
    .filter(target => target.x >= rect.x + rect.w - threshold)
    .sort((a, b) => a.x - b.x);

  const left = leftCandidates[0];
  const right = rightCandidates[0];
  if (left && right && left.x + left.w <= right.x) {
    const idealX = (left.x + left.w + right.x - rect.w) / 2;
    const delta = idealX - rect.x;
    if (
      Math.abs(delta) <= threshold &&
      (bestDx == null || Math.abs(delta) < Math.abs(bestDx))
    ) {
      bestDx = delta;
      bestXGuide = null;
      const snappedX = rect.x + delta;
      const gap = Math.max(0, snappedX - (left.x + left.w));
      spacing.push({
        orientation: "horizontal",
        startA: left.x + left.w,
        endA: snappedX,
        startB: snappedX + rect.w,
        endB: right.x,
        cross: snappedX < pageW / 2 ? rect.y + rect.h / 2 : rect.y + rect.h / 2,
        gap,
      });
    }
  }

  // Equal vertical spacing.
  const topCandidates = targets
    .filter(target => target.y + target.h <= rect.y + threshold)
    .sort((a, b) => (b.y + b.h) - (a.y + a.h));
  const bottomCandidates = targets
    .filter(target => target.y >= rect.y + rect.h - threshold)
    .sort((a, b) => a.y - b.y);

  const topTarget = topCandidates[0];
  const bottomTarget = bottomCandidates[0];
  if (topTarget && bottomTarget && topTarget.y + topTarget.h <= bottomTarget.y) {
    const idealY = (topTarget.y + topTarget.h + bottomTarget.y - rect.h) / 2;
    const delta = idealY - rect.y;
    if (
      Math.abs(delta) <= threshold &&
      (bestDy == null || Math.abs(delta) < Math.abs(bestDy))
    ) {
      bestDy = delta;
      bestYGuide = null;
      const snappedY = rect.y + delta;
      const gap = Math.max(0, snappedY - (topTarget.y + topTarget.h));
      spacing.push({
        orientation: "vertical",
        startA: topTarget.y + topTarget.h,
        endA: snappedY,
        startB: snappedY + rect.h,
        endB: bottomTarget.y,
        cross: rect.x + rect.w / 2,
        gap,
      });
    }
  }

  const x = clampDesignObject(rect.x + (bestDx ?? 0), 0, Math.max(0, pageW - rect.w));
  const y = clampDesignObject(rect.y + (bestDy ?? 0), 0, Math.max(0, pageH - rect.h));

  return {
    x,
    y,
    guides: {
      page,
      vertical: bestXGuide == null ? [] : [bestXGuide],
      horizontal: bestYGuide == null ? [] : [bestYGuide],
      spacing,
    },
  };
}

function DesignSnapGuides({
  guides,
  pageW,
  pageH,
}: {
  guides: DesignSnapGuideState | null;
  pageW: number;
  pageH: number;
}) {
  if (!guides) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 95,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {guides.vertical.map((x, i) => (
        <div
          key={`v-${i}-${x}`}
          style={{
            position: "absolute",
            left: x,
            top: 0,
            width: 1,
            height: pageH,
            background: "#a855f7",
            boxShadow: "0 0 0 0.5px rgba(168,85,247,0.15)",
          }}
        />
      ))}

      {guides.horizontal.map((y, i) => (
        <div
          key={`h-${i}-${y}`}
          style={{
            position: "absolute",
            left: 0,
            top: y,
            width: pageW,
            height: 1,
            background: "#a855f7",
            boxShadow: "0 0 0 0.5px rgba(168,85,247,0.15)",
          }}
        />
      ))}

      {guides.spacing.map((guide, i) => {
        if (guide.orientation === "horizontal") {
          return (
            <div key={`space-h-${i}`}>
              {[{ a: guide.startA, b: guide.endA }, { a: guide.startB, b: guide.endB }].map((seg, si) => (
                <div
                  key={si}
                  style={{
                    position: "absolute",
                    left: Math.min(seg.a, seg.b),
                    top: guide.cross,
                    width: Math.abs(seg.b - seg.a),
                    height: 1,
                    borderTop: "1px dashed #a855f7",
                  }}
                />
              ))}
              <span
                style={{
                  position: "absolute",
                  left: (guide.startA + guide.endA) / 2,
                  top: guide.cross - 13,
                  transform: "translateX(-50%)",
                  padding: "1px 3px",
                  borderRadius: 3,
                  background: "#faf5ff",
                  color: "#7e22ce",
                  font: "600 8px system-ui, sans-serif",
                }}
              >
                {Math.round(guide.gap)}
              </span>
            </div>
          );
        }

        return (
          <div key={`space-v-${i}`}>
            {[{ a: guide.startA, b: guide.endA }, { a: guide.startB, b: guide.endB }].map((seg, si) => (
              <div
                key={si}
                style={{
                  position: "absolute",
                  left: guide.cross,
                  top: Math.min(seg.a, seg.b),
                  width: 1,
                  height: Math.abs(seg.b - seg.a),
                  borderLeft: "1px dashed #a855f7",
                }}
              />
            ))}
            <span
              style={{
                position: "absolute",
                left: guide.cross + 4,
                top: (guide.startA + guide.endA) / 2 - 5,
                padding: "1px 3px",
                borderRadius: 3,
                background: "#faf5ff",
                color: "#7e22ce",
                font: "600 8px system-ui, sans-serif",
              }}
            >
              {Math.round(guide.gap)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function clampDesignObject(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function renderedDesignObjectElements(id: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-design-object-id]"))
    .filter(el => el.dataset.designObjectId === id);
}

function renderedDesignSelectionElements(id: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-design-object-selection-id]"))
    .filter(el => el.dataset.designObjectSelectionId === id);
}

function updateLiveDesignObjectStyle(
  id: string,
  style: Partial<Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height" | "transform">>,
) {
  [...renderedDesignObjectElements(id), ...renderedDesignSelectionElements(id)].forEach(el => {
    if (style.left      !== undefined) el.style.left      = style.left;
    if (style.top       !== undefined) el.style.top       = style.top;
    if (style.width     !== undefined) el.style.width     = style.width;
    if (style.height    !== undefined) el.style.height    = style.height;
    if (style.transform !== undefined) el.style.transform = style.transform;
  });
}

function CanvasDesignObject({
  sourceObject,
  object,
  page,
  scale,
  pageW,
  pageH,
  selectedIds,
  allResolvedObjects,
  onSelect,
  onChange,
  onChangeMany,
  onGuidesChange,
}: {
  sourceObject: ResumeDesignObject;
  object: ResumeDesignObject;
  page: number;
  scale: number;
  pageW: number;
  pageH: number;
  selectedIds: string[];
  allResolvedObjects: ResolvedDesignObject[];
  onSelect: (
    source: ResumeDesignObject,
    rendered: ResumeDesignObject,
    rect: DOMRect | null,
    additive: boolean,
  ) => void;
  onChange: (object: ResumeDesignObject) => void;
  onChangeMany: (objects: ResumeDesignObject[]) => void;
  onGuidesChange: (guides: DesignSnapGuideState | null) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(sourceObject.type === "text" ? sourceObject.text : "");
  const attached = designObjectIsResumeDriven(sourceObject);

  useEffect(() => {
    if (sourceObject.type === "text" && !editingText) setTextDraft(sourceObject.text);
  }, [sourceObject, editingText]);

  function beginMove(ev: React.MouseEvent) {
    if (editingText) {
      ev.stopPropagation();
      return;
    }
    const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;

    if (attached || sourceObject.locked) {
      ev.stopPropagation();
      onSelect(sourceObject, object, ref.current?.getBoundingClientRect() ?? null, additive);
      return;
    }

    if (ev.button !== 0) return;
    ev.stopPropagation();

    onSelect(sourceObject, object, ref.current?.getBoundingClientRect() ?? null, additive);

    // Modifier-click is selection-only. This avoids accidentally nudging an object
    // while the user is building a multi-selection.
    if (additive) return;

    // Let the second click of a text double-click reach onDoubleClick instead of
    // beginning another drag gesture.
    if (sourceObject.type === "text" && ev.detail >= 2) return;

    ev.preventDefault();

    const groupedIds = sourceObject.groupId
      ? allResolvedObjects
          .filter(item => item.source.groupId === sourceObject.groupId)
          .map(item => item.source.id)
      : [];

    const currentSelectionCanMoveAsOne =
      selectedIds.includes(sourceObject.id) && selectedIds.length > 1;

    const moveIds = new Set(
      currentSelectionCanMoveAsOne
        ? selectedIds
        : groupedIds.length > 1
        ? groupedIds
        : [sourceObject.id]
    );

    const moving = allResolvedObjects.filter(item =>
      moveIds.has(item.source.id) &&
      !item.source.locked &&
      !(item.source.type === "shape" && !!item.source.attachment)
    );

    if (moving.length === 0) return;

    const movingRects = moving.map(item => designRectForObject(item.rendered));
    const groupRect = unionDesignRects(movingRects);
    if (!groupRect) return;

    const targetRects = allResolvedObjects
      .filter(item => !moveIds.has(item.source.id))
      .map(item => designRectForObject(item.rendered));

    const startClientX = ev.clientX;
    const startClientY = ev.clientY;
    const starts = moving.map(item => ({
      source: item.source,
      rendered: item.rendered,
      x: item.source.x,
      y: item.source.y,
    }));

    let finalDx = 0;
    let finalDy = 0;

    function move(e: MouseEvent) {
      const rawDx = (e.clientX - startClientX) / scale;
      const rawDy = (e.clientY - startClientY) / scale;

      const rawGroup = {
        ...groupRect,
        x: clampDesignObject(groupRect.x + rawDx, 0, Math.max(0, pageW - groupRect.w)),
        y: clampDesignObject(groupRect.y + rawDy, 0, Math.max(0, pageH - groupRect.h)),
      };

      const snapped = snapDesignRect(rawGroup, targetRects, pageW, pageH, page);
      finalDx = snapped.x - groupRect.x;
      finalDy = snapped.y - groupRect.y;
      onGuidesChange(snapped.guides);

      for (const start of starts) {
        updateLiveDesignObjectStyle(start.source.id, {
          left: `${start.rendered.x + finalDx}px`,
          top: `${start.rendered.y + finalDy}px`,
        });
      }
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      onGuidesChange(null);

      const next = starts.map(start => ({
        ...start.source,
        x: start.x + finalDx,
        y: start.y + finalDy,
      } as ResumeDesignObject));

      onChangeMany(next);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  const selectedLinkedPeer = !!sourceObject.linkId && allResolvedObjects.some(item =>
    selectedIds.includes(item.source.id) && item.source.linkId === sourceObject.linkId
  );

  const common: CSSProperties = {
    position: "absolute",
    left: object.x,
    top: object.y,
    width: Math.max(0, object.width),
    height: Math.max(0, object.height),
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: object.opacity ?? 1,
    zIndex: object.zIndex ?? 0,
    boxSizing: "border-box",
    pointerEvents: "auto",
    userSelect: "none",
    cursor: attached ? "default" : sourceObject.locked ? "not-allowed" : "move",
    boxShadow: selectedLinkedPeer
      ? selectedIds.includes(sourceObject.id)
        ? "0 0 0 1px rgba(245,158,11,0.42), 0 0 12px 3px rgba(245,158,11,0.14)"
        : "0 0 0 1px rgba(245,158,11,0.28), 0 0 8px 2px rgba(245,158,11,0.10)"
      : undefined,
  };

  switch (object.type) {
    case "shape": {
      if (object.shape === "line") {
        return (
          <div
            ref={el => { ref.current = el; }}
            data-design-object-id={object.id}
            data-design-object-page={page}
            data-design-object-type={object.type}
            onMouseDown={beginMove}
            onClick={e => e.stopPropagation()}
            style={{
              ...common,
              height: Math.max(object.strokeWidth ?? object.height ?? 1, 1),
              background: object.stroke ?? object.fill ?? "#111827",
              borderRadius: 999,
            }}
          />
        );
      }

      return (
        <div
          ref={el => { ref.current = el; }}
          data-design-object-id={object.id}
          data-design-object-page={page}
          data-design-object-type={object.type}
          onMouseDown={beginMove}
          onClick={e => e.stopPropagation()}
          style={{
            ...common,
            background: object.fill ?? "transparent",
            border: object.stroke && (object.strokeWidth ?? 0) > 0
              ? `${object.strokeWidth ?? 1}px solid ${object.stroke}`
              : undefined,
            borderRadius: object.shape === "ellipse"
              ? "50%"
              : object.borderRadius ?? 0,
          }}
        />
      );
    }

    case "image": {
      const mask = object.mask ?? (object.imageKind === "photo" ? "circle" : "square");
      const radius =
        mask === "circle" ? "50%" :
        mask === "rounded" ? object.borderRadius ?? 12 :
        0;

      const shadow =
        object.shadow === "soft"   ? "0 2px 8px rgba(15,23,42,0.16)" :
        object.shadow === "medium" ? "0 5px 16px rgba(15,23,42,0.20)" :
        object.shadow === "strong" ? "0 9px 28px rgba(15,23,42,0.27)" :
        undefined;

      return (
        <div
          ref={el => { ref.current = el; }}
          data-design-object-id={object.id}
          data-design-object-page={page}
          data-design-object-type={object.type}
          onMouseDown={beginMove}
          onClick={e => e.stopPropagation()}
          style={{
            ...common,
            overflow: "hidden",
            borderRadius: radius,
            border: (object.borderWidth ?? 0) > 0
              ? `${object.borderWidth}px solid ${object.borderColor ?? "#ffffff"}`
              : undefined,
            boxShadow: shadow,
            background: object.backgroundColor ?? "transparent",
          }}
        >
          <img
            src={object.src}
            alt={object.alt ?? ""}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: object.objectFit ?? "cover",
              objectPosition: `${clampDesignObject(object.cropX ?? 50, 0, 100)}% ${clampDesignObject(object.cropY ?? 50, 0, 100)}%`,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        </div>
      );
    }

    case "text": {
      const textObject = sourceObject.type === "text" ? sourceObject : object;
      const commit = () => {
        if (textObject.type !== "text") return;
        const nextText = textDraft.trimEnd();
        onChange({ ...textObject, text: nextText || "Text" });
        setEditingText(false);
      };

      return (
        <div
          ref={el => { ref.current = el; }}
          data-design-object-id={object.id}
          data-design-object-page={page}
          data-design-object-type={object.type}
          onMouseDown={beginMove}
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => {
            e.stopPropagation();
            if (textObject.locked) return;
            setTextDraft(textObject.text);
            setEditingText(true);
          }}
          style={{
            ...common,
            color: object.color ?? "#111827",
            fontFamily: object.fontFamily,
            fontSize: object.fontSize,
            fontWeight: object.fontWeight,
            fontStyle: object.fontStyle,
            textAlign: object.textAlign,
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            cursor: editingText ? "text" : common.cursor,
            userSelect: editingText ? "text" : "none",
          }}
        >
          {editingText ? (
            <textarea
              autoFocus
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTextDraft(textObject.text);
                  setEditingText(false);
                }
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                resize: "none",
                border: "1px dashed #7c3aed",
                outline: "none",
                padding: 0,
                margin: 0,
                background: "rgba(255,255,255,0.92)",
                color: "inherit",
                font: "inherit",
                fontStyle: "inherit",
                textAlign: "inherit",
                lineHeight: "inherit",
                boxSizing: "border-box",
              }}
            />
          ) : object.text}
        </div>
      );
    }

    case "smart": {
      const strokeWidth = Math.max(1, object.strokeWidth ?? 2);
      const fill = object.fill ?? "#7c3aed";
      const stroke = object.stroke ?? fill;
      const radius = object.borderRadius ?? 0;

      if (object.smartKind === "timeline") {
        const points = object.resolvedPoints ?? [];
        const dotSize = Math.max(4, object.dotSize ?? 8);
        const centerX = Math.max(dotSize, object.width) / 2;
        const first = points[0] ?? dotSize / 2;
        const last = points[points.length - 1] ?? first;

        return (
          <div
            ref={el => { ref.current = el; }}
            data-design-object-id={object.id}
            data-design-object-page={page}
            data-design-object-type={object.type}
            onMouseDown={beginMove}
            onClick={e => e.stopPropagation()}
            style={{ ...common, background: "transparent" }}
          >
            {points.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  left: centerX - strokeWidth / 2,
                  top: first,
                  width: strokeWidth,
                  height: Math.max(0, last - first),
                  borderRadius: 999,
                  background: stroke,
                  pointerEvents: "none",
                }}
              />
            )}
            {points.map((point, index) => (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: centerX - dotSize / 2,
                  top: point - dotSize / 2,
                  width: dotSize,
                  height: dotSize,
                  borderRadius: "50%",
                  background: fill,
                  border: `${Math.max(1, Math.min(2, strokeWidth))}px solid ${stroke}`,
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              />
            ))}
          </div>
        );
      }

      return (
        <div
          ref={el => { ref.current = el; }}
          data-design-object-id={object.id}
          data-design-object-page={page}
          data-design-object-type={object.type}
          onMouseDown={beginMove}
          onClick={e => e.stopPropagation()}
          style={{
            ...common,
            background: object.smartKind === "section-divider" ? stroke : fill,
            borderRadius: radius,
          }}
        />
      );
    }

    case "icon":
      return null;
  }
}

function CanvasDesignObjectLayer({
  objects,
  allResolvedObjects,
  page,
  scale,
  pageW,
  pageH,
  selectedIds,
  onSelect,
  onChange,
  onChangeMany,
  onGuidesChange,
}: {
  objects: ResolvedDesignObject[];
  allResolvedObjects: ResolvedDesignObject[];
  page: number;
  scale: number;
  pageW: number;
  pageH: number;
  selectedIds: string[];
  onSelect: (
    source: ResumeDesignObject,
    rendered: ResumeDesignObject,
    rect: DOMRect | null,
    additive: boolean,
  ) => void;
  onChange: (object: ResumeDesignObject) => void;
  onChangeMany: (objects: ResumeDesignObject[]) => void;
  onGuidesChange: (guides: DesignSnapGuideState | null) => void;
}) {
  if (objects.length === 0) return null;

  return (
    <div
      data-design-object-page-layer={page}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {objects.map(({ source, rendered }) => (
        <CanvasDesignObject
          key={`${source.id}:${page}`}
          sourceObject={source}
          object={rendered}
          page={page}
          scale={scale}
          pageW={pageW}
          pageH={pageH}
          selectedIds={selectedIds}
          allResolvedObjects={allResolvedObjects}
          onSelect={onSelect}
          onChange={onChange}
          onChangeMany={onChangeMany}
          onGuidesChange={onGuidesChange}
        />
      ))}
    </div>
  );
}

const DESIGN_HANDLE = 8;

function CanvasDesignObjectSelectionOverlay({
  sourceObject,
  object,
  scale,
  pageW,
  pageH,
  snapTargets,
  page,
  onChange,
  onRectChange,
  onGuidesChange,
}: {
  sourceObject: ResumeDesignObject;
  object: ResumeDesignObject;
  scale: number;
  pageW: number;
  pageH: number;
  snapTargets: ResumeDesignObject[];
  page: number;
  onChange: (object: ResumeDesignObject) => void;
  onRectChange: (rect: DOMRect | null) => void;
  onGuidesChange: (guides: DesignSnapGuideState | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const line = object.type === "shape" && object.shape === "line";
  const attached = designObjectIsResumeDriven(sourceObject);
  const locked = !!sourceObject.locked || attached;
  const visualH = line ? Math.max(12, object.height) : Math.max(12, object.height);
  const visualTop = line ? object.y - (visualH - object.height) / 2 : object.y;

  function commitWithRect(next: ResumeDesignObject) {
    onChange(next);
    requestAnimationFrame(() => {
      onRectChange(overlayRef.current?.getBoundingClientRect() ?? null);
    });
  }

  function beginMove(ev: React.MouseEvent) {
    if (locked || ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest("[data-design-object-handle]")) return;
    ev.stopPropagation();
    ev.preventDefault();

    const sx = ev.clientX, sy = ev.clientY;
    const ox = object.x, oy = object.y;
    let nx = ox, ny = oy;

    const targetRects = snapTargets
      .filter(target => target.id !== object.id)
      .map(designRectForObject);

    function move(e: MouseEvent) {
      const raw = {
        x: clampDesignObject(ox + (e.clientX - sx) / scale, 0, Math.max(0, pageW - object.width)),
        y: clampDesignObject(oy + (e.clientY - sy) / scale, 0, Math.max(0, pageH - object.height)),
        w: object.width,
        h: object.height,
      };

      const snapped = snapDesignRect(raw, targetRects, pageW, pageH, page);
      nx = snapped.x;
      ny = snapped.y;
      onGuidesChange(snapped.guides);

      const overlayY = line ? ny - (visualH - object.height) / 2 : ny;
      updateLiveDesignObjectStyle(object.id, { left: `${nx}px`, top: `${overlayY}px` });
      renderedDesignObjectElements(object.id).forEach(el => { el.style.top = `${ny}px`; });
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      onGuidesChange(null);
      commitWithRect({ ...sourceObject, x: nx, y: ny } as ResumeDesignObject);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function beginResize(ev: React.MouseEvent, horizontal?: "left" | "right", vertical?: "top" | "bottom") {
    if (locked) return;
    ev.stopPropagation();
    ev.preventDefault();

    const sx = ev.clientX, sy = ev.clientY;
    const ox = object.x, oy = object.y;
    const ow = object.width, oh = object.height;
    let nx = ox, ny = oy, nw = ow, nh = oh;

    function move(e: MouseEvent) {
      const dx = (e.clientX - sx) / scale;
      const dy = (e.clientY - sy) / scale;

      if (horizontal === "right") {
        nw = clampDesignObject(ow + dx, 12, pageW - ox);
      } else if (horizontal === "left") {
        const candidateW = clampDesignObject(ow - dx, 12, ow + ox);
        nx = ox + (ow - candidateW);
        nw = candidateW;
      }

      if (!line && vertical) {
        if (vertical === "bottom") {
          nh = clampDesignObject(oh + dy, 12, pageH - oy);
        } else {
          const candidateH = clampDesignObject(oh - dy, 12, oh + oy);
          ny = oy + (oh - candidateH);
          nh = candidateH;
        }
      }

      updateLiveDesignObjectStyle(object.id, {
        left: `${nx}px`,
        top: `${ny}px`,
        width: `${nw}px`,
        height: line ? undefined : `${nh}px`,
      });

      if (line) {
        renderedDesignSelectionElements(object.id).forEach(el => {
          el.style.top = `${ny - (visualH - object.height) / 2}px`;
          el.style.height = `${visualH}px`;
        });
      }
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      onGuidesChange(null);
      commitWithRect({
        ...sourceObject,
        x: nx,
        y: ny,
        width: nw,
        height: line ? sourceObject.height : nh,
      } as ResumeDesignObject);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function beginRotate(ev: React.MouseEvent) {
    if (locked) return;
    ev.stopPropagation();
    ev.preventDefault();

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let rotation = object.rotation ?? 0;

    function move(e: MouseEvent) {
      rotation = snapRotation(
        Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90) * 10) / 10
      );
      updateLiveDesignObjectStyle(object.id, {
        transform: rotation ? `rotate(${rotation}deg)` : "",
      });
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      onGuidesChange(null);
      commitWithRect({ ...sourceObject, rotation: rotation || undefined } as ResumeDesignObject);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  const corner = (cursor: string, position: CSSProperties): CSSProperties => ({
    position: "absolute",
    width: DESIGN_HANDLE,
    height: DESIGN_HANDLE,
    borderRadius: 2,
    background: "white",
    border: "1.5px solid #7c3aed",
    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
    cursor,
    pointerEvents: "auto",
    ...position,
  });

  return (
    <div
      ref={overlayRef}
      data-design-object-selection-id={object.id}
      onMouseDown={beginMove}
      onClick={e => e.stopPropagation()}
      style={{
        position: "absolute",
        left: object.x,
        top: visualTop,
        width: Math.max(12, object.width),
        height: visualH,
        transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
        transformOrigin: "center center",
        outline: attached ? "1.5px dashed #7c3aed" : "1.5px solid #7c3aed",
        outlineOffset: 1,
        boxSizing: "border-box",
        pointerEvents: locked ? "none" : "auto",
        cursor: locked ? "default" : "move",
        zIndex: 80,
      }}
    >
      {!locked && (
        <>
          <div
            data-design-object-handle="rotate"
            onMouseDown={beginRotate}
            style={{
              position: "absolute",
              top: -18,
              left: "50%",
              transform: "translateX(-50%)",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#7c3aed",
              border: "1.5px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
              cursor: "crosshair",
              pointerEvents: "auto",
            }}
          />

          {line ? (
            <>
              <div
                data-design-object-handle="left"
                onMouseDown={ev => beginResize(ev, "left")}
                style={corner("ew-resize", { left: -5, top: "50%", transform: "translateY(-50%)" })}
              />
              <div
                data-design-object-handle="right"
                onMouseDown={ev => beginResize(ev, "right")}
                style={corner("ew-resize", { right: -5, top: "50%", transform: "translateY(-50%)" })}
              />
            </>
          ) : (
            <>
              <div data-design-object-handle="tl" onMouseDown={ev => beginResize(ev, "left", "top")}    style={corner("nwse-resize", { left: -5, top: -5 })} />
              <div data-design-object-handle="tr" onMouseDown={ev => beginResize(ev, "right", "top")}   style={corner("nesw-resize", { right: -5, top: -5 })} />
              <div data-design-object-handle="bl" onMouseDown={ev => beginResize(ev, "left", "bottom")} style={corner("nesw-resize", { left: -5, bottom: -5 })} />
              <div data-design-object-handle="br" onMouseDown={ev => beginResize(ev, "right", "bottom")}style={corner("nwse-resize", { right: -5, bottom: -5 })} />

              <div data-design-object-handle="l" onMouseDown={ev => beginResize(ev, "left")}  style={corner("ew-resize", { left: -5, top: "50%", transform: "translateY(-50%)" })} />
              <div data-design-object-handle="r" onMouseDown={ev => beginResize(ev, "right")} style={corner("ew-resize", { right: -5, top: "50%", transform: "translateY(-50%)" })} />
              <div data-design-object-handle="t" onMouseDown={ev => beginResize(ev, undefined, "top")} style={corner("ns-resize", { top: -5, left: "50%", transform: "translateX(-50%)" })} />
              <div data-design-object-handle="b" onMouseDown={ev => beginResize(ev, undefined, "bottom")} style={corner("ns-resize", { bottom: -5, left: "50%", transform: "translateX(-50%)" })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function CanvasMultiSelectionOverlay({
  objects,
  allResolvedObjects,
  page,
  scale,
  pageW,
  pageH,
  onChangeMany,
  onRectChange,
  onGuidesChange,
}: {
  objects: ResolvedDesignObject[];
  allResolvedObjects: ResolvedDesignObject[];
  page: number;
  scale: number;
  pageW: number;
  pageH: number;
  onChangeMany: (objects: ResumeDesignObject[]) => void;
  onRectChange: (rect: DOMRect | null) => void;
  onGuidesChange: (guides: DesignSnapGuideState | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const bounds = unionDesignRects(objects.map(item => designRectForObject(item.rendered)));
  if (!bounds) return null;

  const immovable = objects.some(item =>
    item.source.locked || designObjectIsResumeDriven(item.source)
  );

  function beginMove(ev: React.MouseEvent) {
    if (immovable || ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();

    const ids = new Set(objects.map(item => item.source.id));
    const targetRects = allResolvedObjects
      .filter(item => !ids.has(item.source.id))
      .map(item => designRectForObject(item.rendered));

    const sx = ev.clientX;
    const sy = ev.clientY;
    const starts = objects.map(item => ({
      source: item.source,
      rendered: item.rendered,
      x: item.source.x,
      y: item.source.y,
    }));

    let finalDx = 0;
    let finalDy = 0;

    function move(e: MouseEvent) {
      const rawDx = (e.clientX - sx) / scale;
      const rawDy = (e.clientY - sy) / scale;

      const raw = {
        ...bounds,
        x: clampDesignObject(bounds.x + rawDx, 0, Math.max(0, pageW - bounds.w)),
        y: clampDesignObject(bounds.y + rawDy, 0, Math.max(0, pageH - bounds.h)),
      };

      const snapped = snapDesignRect(raw, targetRects, pageW, pageH, page);
      finalDx = snapped.x - bounds.x;
      finalDy = snapped.y - bounds.y;
      onGuidesChange(snapped.guides);

      starts.forEach(start => {
        updateLiveDesignObjectStyle(start.source.id, {
          left: `${start.rendered.x + finalDx}px`,
          top: `${start.rendered.y + finalDy}px`,
        });
      });

      if (overlayRef.current) {
        overlayRef.current.style.left = `${bounds.x + finalDx}px`;
        overlayRef.current.style.top = `${bounds.y + finalDy}px`;
      }
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      onGuidesChange(null);

      onChangeMany(starts.map(start => ({
        ...start.source,
        x: start.x + finalDx,
        y: start.y + finalDy,
      } as ResumeDesignObject)));

      requestAnimationFrame(() => {
        onRectChange(overlayRef.current?.getBoundingClientRect() ?? null);
      });
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return (
    <div
      ref={overlayRef}
      data-design-multi-selection
      onMouseDown={beginMove}
      onClick={e => e.stopPropagation()}
      style={{
        position: "absolute",
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        outline: "1.5px dashed #7c3aed",
        outlineOffset: 3,
        background: "rgba(124,58,237,0.025)",
        cursor: immovable ? "default" : "move",
        pointerEvents: immovable ? "none" : "auto",
        zIndex: 82,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -19,
          left: 0,
          height: 15,
          padding: "0 5px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          background: "#7c3aed",
          color: "white",
          font: "600 8px system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {objects.length} selected
      </div>
    </div>
  );
}


// ── Free-form layout (two-pass, per-entry blocks) ─────────────────────────────
// Pass 1: render all blocks invisibly in their correct flow-region positions to
//         measure intrinsic heights at each block's render width.
// Pass 2: apply layout engine (natural positions + flowDisplacementY overrides)
//         and render each block as an independently draggable DraggableBlock.
//
// Block IDs use stable entry IDs (not array indexes) so reordering doesn't
// attach overrides to the wrong entry.

interface FreeFormProps extends SectionProps {
  scale: number;
  pageW: number;
  pageH: number;
  remeasureKey: number;
  onDesignChange: (d: ResumeDesign) => void;
  onHoverBlock: (id: string | null) => void;
  onBlockClick?: (id: string, rect: DOMRect | null) => void;
  selectedDesignObjectId?: string | null;
  selectedDesignObjectIds?: string[];
  selectedDesignObjectPage?: number;
  onSelectDesignObject?: (
    source: ResumeDesignObject,
    rendered: ResumeDesignObject,
    rect: DOMRect | null,
    page: number,
    additive: boolean,
  ) => void;
  onDesignObjectRectChange?: (rect: DOMRect | null) => void;
  onActivePageChange?: (page: number) => void;
}

function FreeFormLayout({
  data, d, ctx, setData, scale, pageW, pageH, remeasureKey,
  onDesignChange, onHoverBlock, onBlockClick,
  selectedDesignObjectId, selectedDesignObjectIds = [], selectedDesignObjectPage = 0,
  onSelectDesignObject, onDesignObjectRectChange, onActivePageChange,
}: FreeFormProps) {
  const sp: SectionProps = { data, d, ctx, setData };

  // ── Bullet editing state - lifted here so it survives pass-1 ↔ pass-2 remounts ──
  const [bulletEditKey, setBulletEditKey] = useState<string | null>(null);
  const bulletEditCtxValue = useMemo(() => ({ key: bulletEditKey, set: setBulletEditKey }), [bulletEditKey]);

  // ── Group drag: heading block drags all its entries in real-time ──────────
  const [groupDrag,     setGroupDrag]     = useState<{ prefix: string; dy: number; dx: number } | null>(null);
  const [groupRotation, setGroupRotation] = useState<{ prefix: string; rot: number } | null>(null);

  // ── Group hover: page-aware because one logical section may have fragments
  // on several physical pages. Hovering an entry reveals only that page fragment's box.
  const [groupHoveredFragment, setGroupHoveredFragment] = useState<{ section: string; page: number } | null>(null);

  // Continuation-page group drag. Page 1 keeps using the real heading block as the
  // group handle; continuation fragments get an editor-only drag tab. The temporary
  // delta is applied live to just the entries on that physical page, then persisted
  // as visualDx/visualDy so pagination itself stays stable.
  const [continuationDrag, setContinuationDrag] = useState<{ section: string; page: number; dx: number; dy: number } | null>(null);

  // Phase 6 smart guides are editor-only and disappear as soon as a drag ends.
  const [designSnapGuides, setDesignSnapGuides] = useState<DesignSnapGuideState | null>(null);

  // ── Stable memoized flow regions ────────────────────────────────────────
  // Re-built when content count, layout type, or sidebar config changes.
  const regions = useMemo(
    () => buildFlowRegions(data, d, pageW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.workEntries.map(e => e.id).join(","),
      getResumeProjects(data)
        .map(project =>
          `${project.id}:${projectHasContent(project) ? "visible" : "empty"}`
        )
        .join(","),
      data.education.map(e => e.id).join(","),
      data.summary ? "1" : "0",
      data.skills.length,
      data.extraLinks.filter(l => l.label || l.url).length,
      [data.email, data.phone, data.location, data.website].filter(Boolean).length,
      d.layout, d.sidebarWidth, d.columnGap, (d.sidebarSections ?? []).join(","),
      d.sectionOrder?.join(","), d.hiddenSections?.join(","),
    ]
  );

  const allBlockIds = useMemo(() => regions.flatMap(r => r.blockIds), [regions]);

  // ── Render a block's content by its stable ID ─────────────────────────
  function renderContent(id: string): ReactNode {
    if (id === "name")    return <NameC {...sp} />;
    if (id === "contact") return <ContactC data={data} d={d} ctx={ctx} setData={setData} />;
    if (id === "bio")     return <BioC {...sp} />;
    if (id === "skills")  return <SkillsC {...sp} />;
    if (id === "links")   return <LinksC {...sp} />;
    if (id.endsWith(".heading")) {
      const sid = id.slice(0, -".heading".length) as SectionId;
      return <SectionHeadingC title={SECTION_LABELS[sid]} d={d} ctx={ctx} />;
    }
    if (id.startsWith("work.")) {
      const entryId = id.slice("work.".length);
      const i = data.workEntries.findIndex(e => e.id === entryId);
      if (i < 0) return null;
      return <SingleWorkEntryC entry={data.workEntries[i]} i={i} {...sp} />;
    }
    if (id.startsWith("projects.")) {
      const entryId = id.slice("projects.".length);
      const project = getResumeProjects(data).find(item => item.id === entryId);
      if (!project) return null;
      return <SingleProjectEntryC entry={project} {...sp} />;
    }
    if (id.startsWith("edu.")) {
      const entryId = id.slice("edu.".length);
      const i = data.education.findIndex(e => e.id === entryId);
      if (i < 0) return null;
      return <SingleEduEntryC entry={data.education[i]} i={i} {...sp} />;
    }
    return null;
  }

  // ── Pass-1: measure natural positions in correct flow regions ──────────
  const [naturalPositions, setNaturalPositions] = useState<Record<string, ComputedPos> | null>(null);
  const [liveBlockHeightDeltas, setLiveBlockHeightDeltas] = useState<Record<string, number>>({});
  const blockRefs    = useRef<Record<string, HTMLDivElement | null>>({});
  const regionRefs   = useRef<Record<string, HTMLDivElement | null>>({});

  // Inline description editing happens entirely inside pass 2 so the editor keeps
  // focus. Receive temporary role-height growth here and use it only for live visual
  // reflow. The committed body still goes through the normal pass-1 measurement path.
  useEffect(() => {
    function handleInlineBlockResize(ev: Event) {
      const detail = (ev as CustomEvent<{ blockId?: string; delta?: number }>).detail;
      if (!detail?.blockId) return;
      const delta = Math.max(0, Number(detail.delta) || 0);
      setLiveBlockHeightDeltas(prev => {
        if (delta === 0) {
          if (!(detail.blockId! in prev)) return prev;
          const next = { ...prev };
          delete next[detail.blockId!];
          return next;
        }
        if (prev[detail.blockId!] === delta) return prev;
        return { ...prev, [detail.blockId!]: delta };
      });
    }
    window.addEventListener("resume-inline-block-resize", handleInlineBlockResize);
    return () => window.removeEventListener("resume-inline-block-resize", handleInlineBlockResize);
  }, []);

  // Reset measurement when anything that affects block heights changes:
  //   • block set changes (entries added/removed/reordered) via allBlockIds
  //   • bullet counts per work entry (adding a bullet grows that block's height)
  //   • font sizes / entry spacing (change intrinsic heights of every block)
  //   • layout geometry (column widths affect text wrap → heights)
  const contentHeightSig = [
    // Use the actual body HTML, not only its length. A formatting change such as
    // font-size:12pt -> font-size:13pt can keep the exact same string length while
    // changing line wrapping and role height. The full HTML guarantees remeasurement.
    data.workEntries.map(e => `${e.id}:${e.body ?? ""}`).join("|"),
    getResumeProjects(data)
      .map(project =>
        `${project.id}:${project.title}:${project.techStack}:${project.description}:${project.githubUrl}:${project.liveUrl}`
      )
      .join("|"),
    data.education.map(e => e.id).join("|"),
    data.summary.length,
    d.sectionHeading.fontSize, d.entryTitle.fontSize,
    d.entryBullet.fontSize, d.entryOrg.fontSize,
    d.entrySpacing,
    d.showCompanyLogos ? "logos:1" : "logos:0",
  ].join("~");

  // Resizing a child SubDrag (especially a company logo) changes the intrinsic
  // height of its role block. Those widths/heights live in layoutOverrides, so
  // they must participate in the pass-1 measurement key. Without this, a larger
  // logo renders immediately in pass 2 while the next role keeps its OLD measured
  // y-position/height, which makes role boxes overlap and prevents pagination from
  // seeing that the section has grown beyond the current page.
  //
  // Deliberately exclude visualDx/visualDy/rotation: those are visual-only edits and
  // should not force a full remeasure/re-pagination on ordinary dragging/rotation.
  const geometryOverrideSig = Object.entries(d.layoutOverrides ?? {})
    .filter(([key, ov]) => ov.width != null || ov.height != null || (key.endsWith(".body") && ov.visualDx != null))
    .map(([key, ov]) => `${key}:${ov.width ?? ""}:${ov.height ?? ""}:${key.endsWith(".body") ? (ov.visualDx ?? "") : ""}`)
    .sort()
    .join("|");

  const measureResetKey = [
    remeasureKey,
    d.layout, d.sidebarWidth, d.columnGap,
    allBlockIds.join(","),
    contentHeightSig,
    geometryOverrideSig,
  ].join("_");
  const prevMeasureKey  = useRef(measureResetKey);
  if (prevMeasureKey.current !== measureResetKey) {
    prevMeasureKey.current = measureResetKey;
    // Reset synchronously in render (before children mount) to avoid stale positions.
    // This is safe because we check `naturalPositions === null` to decide which pass to render.
    // eslint-disable-next-line react-hooks/rules-of-hooks -- intentional synchronous reset
    setNaturalPositions(null);
  }

  // After each invisible pass-1 render, measure block rects relative to the page.
  useLayoutEffect(() => {
    if (naturalPositions !== null) return;  // already measured
    const s = scale || 1;
    const pos: Record<string, ComputedPos> = {};
    for (const region of regions) {
      const regionEl = regionRefs.current[region.id];
      if (!regionEl) continue;
      const regionRect = regionEl.getBoundingClientRect();
      for (const bid of region.blockIds) {
        const el = blockRefs.current[bid];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        pos[bid] = {
          x: region.x + (r.left   - regionRect.left) / s,
          y: region.y + (r.top    - regionRect.top)  / s,
          w: r.width  / s,
          h: r.height / s,
        };
      }
    }
    if (Object.keys(pos).length > 0) setNaturalPositions(pos);
  });

  if (naturalPositions === null) {
    // ── Pass 1 - invisible continuous flow used only for measurement.
    // Render it inside a visible blank first-page shell so remeasurement never makes
    // the entire canvas collapse. Overflow stays visible here because content may be
    // taller than one page and still needs a measurable DOM rect.
    return (
      <BulletEditCtx.Provider value={bulletEditCtxValue}>
        <div style={{ width: pageW * scale, height: pageH * scale, position: "relative", flexShrink: 0 }}>
          <div style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: pageW,
            height: pageH,
            backgroundColor: d.pageBackground,
            boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
            boxSizing: "border-box",
            position: "relative",
            overflow: "visible",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, pointerEvents: "none", userSelect: "none" }}>
              {regions.map(region => (
                <div
                  key={region.id}
                  ref={el => { regionRefs.current[region.id] = el; }}
                  style={{ position: "absolute", left: region.x, top: region.y, width: region.width }}
                >
                  {region.blockIds.map(bid => {
                    const widthOverride = d.layoutOverrides?.[bid]?.width;
                    const isHeading = bid.endsWith(".heading");
                    const heightOverride = !isHeading ? d.layoutOverrides?.[bid]?.height : undefined;
                    return (
                      <div key={bid} ref={el => { blockRefs.current[bid] = el; }}
                        style={{
                          overflow: "hidden",
                          ...(widthOverride ? { width: widthOverride } : {}),
                          // A manually enlarged role/body block must reserve that vertical
                          // space in pass 1 so the following role starts below it. Heading
                          // height is editor group-box metadata, so it must NOT enter flow.
                          ...(heightOverride ? { minHeight: heightOverride } : {}),
                        }}>
                        {renderContent(bid)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </BulletEditCtx.Provider>
    );
  }

  // ── Pass 2 - paginate the measured flow, then render draggable blocks ───────
  const overrides = d.layoutOverrides ?? {};
  // Keep the existing single-page computation as the source of truth for horizontal
  // position and width; pagination only remaps the vertical flow onto physical pages.
  const singlePagePositions = computeBlockPositions(regions, naturalPositions, overrides);

  // The current design has a top margin but no separate bottom-margin field.
  // Use the top margin symmetrically so automatic page breaks never hug the paper edge.
  const pageBottom = Math.max(d.pageMarginTop + 40, pageH - d.pageMarginTop);

  // Pagination deliberately follows FLOW geometry, not visual nudges or rotation.
  // That keeps page assignment stable when the user rotates a section or drags an
  // individual role a few pixels. Width changes still repaginate because pass-1
  // re-measures the resulting text height.
  function paginatePositions(): { positions: Record<string, PageComputedPos>; pageCount: number } {
    const out: Record<string, PageComputedPos> = {};
    let maxPage = 0;

    for (const region of regions) {
      // Recreate the flow-only y coordinate used by computeBlockPositions. Role blocks
      // keep their manual visual Y offsets out of this value so dragging a role does not
      // unexpectedly teleport it to another page.
      const flowTop: Record<string, number> = {};
      let cumulativeY = 0;
      for (const bid of region.blockIds) {
        const ov = overrides[bid] ?? {};
        const isRoleBlock = (
        bid.startsWith("work.") ||
        bid.startsWith("projects.") ||
        bid.startsWith("edu.")
      ) && !bid.endsWith(".heading");
        if (!isRoleBlock) cumulativeY += ov.flowDisplacementY ?? 0;
        const nat = naturalPositions[bid];
        if (nat) flowTop[bid] = nat.y + cumulativeY;
      }

      let page = 0;
      let cursorY = region.y;
      let prevFlowBottom: number | null = null;
      let pageHasBlock = false;

      for (let i = 0; i < region.blockIds.length; i++) {
        const bid = region.blockIds[i];
        const nat = naturalPositions[bid];
        if (!nat) continue;

        const ov = overrides[bid] ?? {};
        const isRoleBlock = (
        bid.startsWith("work.") ||
        bid.startsWith("projects.") ||
        bid.startsWith("edu.")
      ) && !bid.endsWith(".heading");
        const roleVisualY = (ov.visualDy ?? 0) + (isRoleBlock ? (ov.flowDisplacementY ?? 0) : 0);
        const fy = flowTop[bid] ?? nat.y;

        // Preserve the natural gap between adjacent blocks while they remain on the
        // same page. After a page break the first block starts at the region's top.
        const gap = prevFlowBottom == null ? fy - region.y : fy - prevFlowBottom;
        let candidateY = pageHasBlock ? cursorY + gap : (page === 0 ? fy : region.y);

        // Avoid orphaning a section heading at the very bottom of a page. If the next
        // block belongs to the same logical section, require both to fit together.
        let requiredBottom = candidateY + nat.h;
        if (bid.endsWith(".heading")) {
          const nextBid = region.blockIds[i + 1];
          const headingPrefix = bid.slice(0, -".heading".length);
          const nextIsSameSection = !!nextBid && (
            nextBid.startsWith(headingPrefix + ".") ||
            (headingPrefix === "education" && nextBid.startsWith("edu."))
          );
          const nextNat = nextBid ? naturalPositions[nextBid] : undefined;
          if (nextIsSameSection && nextNat) {
            const nextFy = flowTop[nextBid] ?? nextNat.y;
            const nextGap = Math.max(0, nextFy - (fy + nat.h));
            requiredBottom += nextGap + nextNat.h;
          }
        }

        if (requiredBottom > pageBottom && pageHasBlock) {
          page += 1;
          candidateY = region.y;
          pageHasBlock = false;
        }

        const singlePage = singlePagePositions[bid];
        out[bid] = {
          page,
          x: singlePage?.x ?? (nat.x + (ov.visualDx ?? 0)),
          y: candidateY + roleVisualY,
          w: singlePage?.w ?? (ov.width ?? nat.w),
          h: nat.h,
        };

        cursorY = candidateY + nat.h;
        prevFlowBottom = fy + nat.h;
        pageHasBlock = true;
        maxPage = Math.max(maxPage, page);
      }
    }

    return { positions: out, pageCount: maxPage + 1 };
  }

  const { positions: baseComputedPositions, pageCount } = paginatePositions();

  // Live inline-description reflow:
  // - preserve the paginator's current page assignment while typing, so the active
  //   contenteditable never gets unmounted and loses focus;
  // - grow the edited role's effective box height;
  // - shift every later block in the same flow region + physical page by that delta.
  // Once the edit is committed, contentHeightSig triggers a real pass-1 remeasure and
  // the normal paginator takes over (including moving a role to the next page if needed).
  const computedPositions: Record<string, PageComputedPos> = Object.fromEntries(
    Object.entries(baseComputedPositions).map(([key, value]) => [key, { ...value }])
  );

  if (Object.keys(liveBlockHeightDeltas).length > 0) {
    for (const region of regions) {
      let currentPage = -1;
      let cumulativeLiveDy = 0;

      for (const bid of region.blockIds) {
        const pos = computedPositions[bid];
        if (!pos) continue;

        if (pos.page !== currentPage) {
          currentPage = pos.page;
          cumulativeLiveDy = 0;
        }

        if (cumulativeLiveDy) {
          pos.y += cumulativeLiveDy;
        }

        const delta = liveBlockHeightDeltas[bid] ?? 0;
        if (delta > 0) {
          pos.h += delta;
          cumulativeLiveDy += delta;
        }
      }
    }
  }

  function sectionIds(prefix: string): string[] {
    if (prefix === "education" || prefix === "edu") {
      return allBlockIds.filter(bid => bid === "education.heading" || bid.startsWith("edu."));
    }
    return allBlockIds.filter(bid => bid === `${prefix}.heading` || bid.startsWith(prefix + "."));
  }

  function headingIdForSection(prefix: string): string {
    return prefix === "edu" ? "education.heading" : `${prefix}.heading`;
  }

  // Bounds of only the part of a logical section that appears on one physical page.
  // This is also the transform origin for linked section rotation on continuation pages.
  function sectionFragmentBounds(prefix: string, page: number): ComputedPos | undefined {
    const cps = sectionIds(prefix)
      .map(bid => computedPositions[bid])
      .filter((cp): cp is PageComputedPos => !!cp && cp.page === page);
    if (cps.length === 0) return undefined;

    const headingCp = computedPositions[headingIdForSection(prefix)];
    const x = headingCp?.x ?? Math.min(...cps.map(cp => cp.x));
    const w = headingCp?.w ?? (Math.max(...cps.map(cp => cp.x + cp.w)) - x);
    const y = Math.min(...cps.map(cp => cp.y));
    const bottom = Math.max(...cps.map(cp => cp.y + cp.h));
    return { x, y, w, h: Math.max(0, bottom - y) };
  }

  // The saved heading height is allowed to enlarge the group on the page containing
  // the heading, but never beyond that physical page. This keeps the CSS transform
  // origin and the entry-orbit transform origin identical.
  function sectionRenderedFragmentHeight(prefix: string, page: number): number {
    const fragment = sectionFragmentBounds(prefix, page);
    if (!fragment) return 0;
    const headingId = headingIdForSection(prefix);
    const headingCp = computedPositions[headingId];
    if (!headingCp || headingCp.page !== page) return fragment.h;

    const savedH = overrides[headingId]?.height ?? 0;
    const maxH = Math.max(fragment.h, pageBottom - fragment.y);
    return Math.max(fragment.h, Math.min(savedH, maxH));
  }

  function headerFragmentBounds(page: number): ComputedPos | undefined {
    const cps = ["name", "contact"]
      .map(id => computedPositions[id])
      .filter((cp): cp is PageComputedPos => !!cp && cp.page === page);
    if (cps.length === 0) return undefined;

    const x = Math.min(...cps.map(cp => cp.x));
    const y = Math.min(...cps.map(cp => cp.y));
    const right = Math.max(...cps.map(cp => cp.x + cp.w));
    const bottom = Math.max(...cps.map(cp => cp.y + cp.h));
    return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
  }

  function paddedRect(bounds: ComputedPos, padding: number): ComputedPos {
    const x = Math.max(0, bounds.x - padding);
    const y = Math.max(0, bounds.y - padding);
    const right = Math.min(pageW, bounds.x + bounds.w + padding);
    const bottom = Math.min(pageH, bounds.y + bounds.h + padding);
    return {
      x,
      y,
      w: Math.max(0, right - x),
      h: Math.max(0, bottom - y),
    };
  }

  function resolveDesignObjectForPage(
    source: ResumeDesignObject,
    page: number,
  ): ResumeDesignObject | null {
    if (source.hidden) return null;

    if (source.type === "smart") {
      const smart = source as SmartDesignObject;

      if (smart.smartKind === "sidebar") {
        // A sidebar is a page-spanning resume component, not a page-local shape.
        // The same persisted object is resolved to a full-height instance on
        // every physical page that ResumeCanvas renders.
        const width = clampDesignObject(smart.width || 72, 20, Math.max(20, pageW * 0.6));
        return {
          ...smart,
          x: smart.side === "right" ? pageW - width : 0,
          y: 0,
          width,
          height: pageH,
          rotation: 0,
        } as SmartDesignObject;
      }

      if (smart.smartKind === "header-accent") {
        if (page !== 0) return null;
        const header = headerFragmentBounds(0);
        if (!header) return null;
        const thickness = clampDesignObject(smart.height || 4, 1, 40);
        const gap = clampDesignObject(smart.offset ?? 8, -20, 80);
        return {
          ...smart,
          x: header.x,
          y: clampDesignObject(header.y + header.h + gap, 0, pageH - thickness),
          width: header.w,
          height: thickness,
          rotation: 0,
        } as SmartDesignObject;
      }

      if (smart.smartKind === "section-divider") {
        const section = smart.sectionId;
        if (!section) return null;
        const headingId = headingIdForSection(section);
        const heading = computedPositions[headingId];
        if (!heading || heading.page !== page) return null;

        let liveDx = 0;
        let liveDy = 0;
        if (groupDrag?.prefix === section + ".") {
          liveDx += groupDrag.dx;
          liveDy += groupDrag.dy;
        }

        const thickness = clampDesignObject(smart.strokeWidth ?? smart.height ?? 2, 1, 16);
        const gap = clampDesignObject(smart.offset ?? 5, -10, 50);
        const rotation = groupRotation?.prefix === section + "."
          ? groupRotation.rot
          : overrides[headingId]?.rotation ?? 0;

        return {
          ...smart,
          x: heading.x + liveDx,
          y: clampDesignObject(heading.y + liveDy + heading.h + gap, 0, pageH - thickness),
          width: heading.w,
          height: thickness,
          rotation: rotation || 0,
        } as SmartDesignObject;
      }

      if (smart.smartKind === "timeline") {
        const section = smart.sectionId;
        if (section !== "work" && section !== "education") return null;

        const ids = sectionEntryIdsOnPage(section, page);
        if (ids.length === 0) return null;

        let liveDx = 0;
        let liveDy = 0;
        if (groupDrag?.prefix === section + ".") {
          liveDx += groupDrag.dx;
          liveDy += groupDrag.dy;
        }
        if (continuationDrag?.section === section && continuationDrag.page === page) {
          liveDx += continuationDrag.dx;
          liveDy += continuationDrag.dy;
        }

        const entries = ids
          .map(id => computedPositions[id])
          .filter((cp): cp is PageComputedPos => !!cp);
        if (entries.length === 0) return null;

        const dotSize = clampDesignObject(smart.dotSize ?? 8, 4, 30);
        const strokeWidth = clampDesignObject(smart.strokeWidth ?? 2, 1, 12);
        const offset = clampDesignObject(smart.offset ?? 14, 4, 80);
        const contentLeft = Math.min(...entries.map(cp => cp.x)) + liveDx;
        const lineX = clampDesignObject(contentLeft - offset, 4, pageW - 4);
        const pointsAbs = entries.map(cp =>
          cp.y + liveDy + Math.min(14, Math.max(7, cp.h * 0.22))
        ).sort((a, b) => a - b);
        const top = Math.max(0, Math.min(...pointsAbs) - dotSize / 2);
        const bottom = Math.min(pageH, Math.max(...pointsAbs) + dotSize / 2);
        const width = Math.max(dotSize, strokeWidth) + 6;
        const x = clampDesignObject(lineX - width / 2, 0, Math.max(0, pageW - width));

        return {
          ...smart,
          x,
          y: top,
          width,
          height: Math.max(dotSize, bottom - top),
          rotation: 0,
          resolvedPoints: pointsAbs.map(point => point - top),
        } as SmartDesignObject;
      }

      return null;
    }

    if (source.type !== "shape" || !source.attachment) {
      return source.page === page ? source : null;
    }

    const attachment = source.attachment;

    if (attachment.kind === "page") {
      if (source.page !== page) return null;
      return {
        ...source,
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
        rotation: 0,
      } as ShapeDesignObject;
    }

    if (attachment.kind === "header") {
      if (page !== 0) return null;
      const bounds = headerFragmentBounds(page);
      if (!bounds) return null;
      const r = paddedRect(bounds, Math.max(0, attachment.padding ?? 10));
      return {
        ...source,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        rotation: 0,
      } as ShapeDesignObject;
    }

    const section = attachment.sectionId;
    const fragment = sectionFragmentBounds(section, page);
    if (!fragment) return null;

    const renderedHeight = sectionRenderedFragmentHeight(section, page);
    const base = {
      x: fragment.x,
      y: fragment.y,
      w: fragment.w,
      h: Math.max(fragment.h, renderedHeight),
    };

    // Follow live section/group movement too, not only the committed layout.
    if (groupDrag && groupDrag.prefix === section + ".") {
      base.x += groupDrag.dx;
      base.y += groupDrag.dy;
    }
    if (
      continuationDrag &&
      continuationDrag.section === section &&
      continuationDrag.page === page
    ) {
      base.x += continuationDrag.dx;
      base.y += continuationDrag.dy;
    }

    const r = paddedRect(base, Math.max(0, attachment.padding ?? 8));
    const headingId = headingIdForSection(section);
    const liveRot = groupRotation?.prefix === section + "." ? groupRotation.rot : undefined;
    const sectionRotation = liveRot ?? overrides[headingId]?.rotation ?? 0;

    return {
      ...source,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      rotation: sectionRotation || 0,
    } as ShapeDesignObject;
  }

  function resolvedDesignObjectsForPage(
    page: number,
    layer: DesignObjectLayer,
  ): ResolvedDesignObject[] {
    return designObjectsForPage(d, page, layer)
      .map(source => {
        const rendered = resolveDesignObjectForPage(source, page);
        return rendered ? { source, rendered } : null;
      })
      .filter((item): item is ResolvedDesignObject => !!item);
  }

  function commitDesignObjectChanges(changed: ResumeDesignObject[]) {
    if (changed.length === 0) return;

    // Apply each edit against the progressively-updated design. Movement remains
    // local, while linked size/rotation/appearance fields fan out to peers.
    const next = changed.reduce(
      (design, object) => applyLinkedDesignObjectChange(design, object),
      d as ResumeDesign,
    );
    onDesignChange(next);
  }

  // Entries belonging to one logical section fragment on one physical page.
  // The heading is intentionally excluded: continuation pages have no duplicate
  // printed heading, only an editor-only fragment control box.
  function sectionEntryIdsOnPage(prefix: string, page: number): string[] {
    return sectionIds(prefix).filter(bid => {
      if (bid.endsWith(".heading")) return false;
      return computedPositions[bid]?.page === page;
    });
  }

  function saveLogicalSectionRotation(prefix: string, rot: number) {
    const headingId = headingIdForSection(prefix);
    const existing = d.layoutOverrides?.[headingId] ?? {};
    const next: LayoutOverride = { ...existing };
    if (rot) next.rotation = rot; else delete next.rotation;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}) };
    if (Object.keys(next).length) layoutOverrides[headingId] = next;
    else delete layoutOverrides[headingId];
    onDesignChange({ ...d, layoutOverrides });
  }

  function finishContinuationDrag(prefix: string, page: number, dx: number, dy: number) {
    const ids = sectionEntryIdsOnPage(prefix, page);
    if (ids.length === 0) { setContinuationDrag(null); return; }
    const cur = d.layoutOverrides ?? {};
    const next = { ...cur };
    for (const bid of ids) {
      const ov = next[bid] ?? {};
      const n: LayoutOverride = {
        ...ov,
        visualDx: (ov.visualDx ?? 0) + dx,
        visualDy: (ov.visualDy ?? 0) + dy,
      };
      if (!n.visualDx) delete n.visualDx;
      if (!n.visualDy) delete n.visualDy;
      // Role flowDisplacementY is legacy visual Y. Fold it into visualDy when a
      // continuation fragment is group-dragged so the saved model stays unambiguous.
      if (n.flowDisplacementY) {
        n.visualDy = (n.visualDy ?? 0) + n.flowDisplacementY;
        delete n.flowDisplacementY;
      }
      next[bid] = n;
    }
    onDesignChange({ ...d, layoutOverrides: next });
    setContinuationDrag(null);
  }

  function ContinuationSectionBox({
    prefix,
    page,
  }: {
    prefix: "work" | "projects" | "education";
    page: number;
  }) {
    const fragment = sectionFragmentBounds(prefix, page);
    const headingId = headingIdForSection(prefix);
    const headingCp = computedPositions[headingId];
    if (!fragment || !headingCp || headingCp.page === page) return null;

    const logicalRot = groupRotation?.prefix === prefix + "."
      ? groupRotation.rot
      : overrides[headingId]?.rotation ?? 0;
    const h = sectionRenderedFragmentHeight(prefix, page);
    const externallyActive = groupHoveredFragment?.section === prefix && groupHoveredFragment.page === page;
    const draggingThis = continuationDrag?.section === prefix && continuationDrag.page === page;
    const rotatingThis = groupRotation?.prefix === prefix + ".";
    const active = externallyActive || draggingThis || rotatingThis;

    function rotateDown(ev: React.MouseEvent) {
      ev.stopPropagation(); ev.preventDefault();
      const box = (ev.currentTarget as HTMLElement).closest("[data-section-fragment]") as HTMLElement | null;
      const rect = box?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let rot = logicalRot;
      function onMove(e: MouseEvent) {
        rot = snapRotation(Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90) * 10) / 10);
        setGroupRotation({ prefix: prefix + ".", rot });
      }
      function onUp() {
        saveLogicalSectionRotation(prefix, rot);
        setGroupRotation(null);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    function dragDown(ev: React.MouseEvent) {
      if (ev.button !== 0) return;
      ev.stopPropagation(); ev.preventDefault();
      const startX = ev.clientX, startY = ev.clientY;
      let lastDx = 0, lastDy = 0;
      let moved = false;
      function onMove(e: MouseEvent) {
        const dx = (e.clientX - startX) / (scale || 1);
        const dy = (e.clientY - startY) / (scale || 1);
        if (!moved && (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3)) moved = true;
        if (!moved) return;
        lastDx = dx; lastDy = dy;
        setContinuationDrag({ section: prefix, page, dx, dy });
      }
      function onUp() {
        if (moved) finishContinuationDrag(prefix, page, lastDx, lastDy);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    const label = SECTION_LABELS[prefix];
    return (
      <div
        key={`${prefix}-${page}`}
        data-section-fragment={`${prefix}:${page}`}
        style={{
          position: "absolute",
          left: fragment.x + (draggingThis ? continuationDrag!.dx : 0),
          top: fragment.y + (draggingThis ? continuationDrag!.dy : 0),
          width: fragment.w,
          height: h,
          boxSizing: "border-box",
          transform: logicalRot ? `rotate(${logicalRot}deg)` : undefined,
          transformOrigin: "center center",
          outline: active ? `1px solid ${HC}66` : `1px solid ${HC}20`,
          zIndex: active ? 12 : 2,
          pointerEvents: "none",
        }}
      >
        {/* Editor-only continuation label. It is the fragment's group-drag handle;
            it never becomes resume content. */}
        <div
          data-handle="fragment-drag"
          onMouseDown={dragDown}
          onMouseEnter={() => setGroupHoveredFragment({ section: prefix, page })}
          onMouseLeave={() => {
            setGroupHoveredFragment(cur => cur?.section === prefix && cur.page === page ? null : cur);
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: -17, left: 0,
            fontSize: 9, lineHeight: "14px", height: 14,
            padding: "0 5px", borderRadius: 3,
            fontFamily: "system-ui, sans-serif", fontWeight: 600,
            color: HC, background: "rgba(255,255,255,0.94)",
            border: `1px solid ${HC}33`, cursor: "grab",
            userSelect: "none", whiteSpace: "nowrap",
            opacity: active ? 1 : 0.58,
            pointerEvents: "auto",
          }}
        >
          {label} · continued
        </div>

        <div
          data-handle="fragment-rotate"
          onMouseDown={rotateDown}
          onMouseEnter={() => setGroupHoveredFragment({ section: prefix, page })}
          onMouseLeave={() => {
            setGroupHoveredFragment(cur => cur?.section === prefix && cur.page === page ? null : cur);
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: -14, left: "50%",
            transform: "translateX(-50%)",
            width: 14, height: 14, borderRadius: "50%",
            backgroundColor: HC, border: "2px solid white",
            boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
            cursor: "crosshair", zIndex: 30, pointerEvents: "auto",
            opacity: active ? 1 : 0.5,
          }}
        />
      </div>
    );
  }

  const PAGE_GAP_PX = 18;

  return (
    <BulletEditCtx.Provider value={bulletEditCtxValue}>
      <div style={{ display: "flex", flexDirection: "column", gap: PAGE_GAP_PX, width: pageW * scale }}>
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <div
            key={`page-${pageIndex}`}
            data-resume-page={pageIndex + 1}
            onMouseDown={() => onActivePageChange?.(pageIndex)}
            style={{ width: pageW * scale, height: pageH * scale, position: "relative", flexShrink: 0 }}
          >
            <div style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: pageW,
              height: pageH,
              backgroundColor: d.pageBackground,
              boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
              overflow: "hidden",
              boxSizing: "border-box",
              position: "relative",
            }}>
              {(() => {
                const backgroundObjects = resolvedDesignObjectsForPage(pageIndex, "background");
                const foregroundObjects = resolvedDesignObjectsForPage(pageIndex, "foreground");
                const allPageObjects = [...backgroundObjects, ...foregroundObjects];

                return (
                  <CanvasDesignObjectLayer
                    objects={backgroundObjects}
                    allResolvedObjects={allPageObjects}
                    page={pageIndex}
                    scale={scale}
                    pageW={pageW}
                    pageH={pageH}
                    selectedIds={selectedDesignObjectIds}
                    onSelect={(source, rendered, rect, additive) =>
                      onSelectDesignObject?.(source, rendered, rect, pageIndex, additive)}
                    onChange={object => onDesignChange(applyLinkedDesignObjectChange(d, object))}
                    onChangeMany={commitDesignObjectChanges}
                    onGuidesChange={setDesignSnapGuides}
                  />
                );
              })()}

              {/* Continuation pages get their own editor-only section fragment box.
                  It shares the logical section rotation but uses this page fragment's
                  local center and position. */}
              {(["work", "projects", "education"] as const).map(prefix =>
                ContinuationSectionBox({ prefix, page: pageIndex })
              )}

              {allBlockIds.map(bid => {
                const content = renderContent(bid);
                if (!content) return null;
                let cp = computedPositions[bid];
                if (!cp || cp.page !== pageIndex) return null;
          const isHeading = bid.endsWith(".heading");
          const rawSectionPrefix = isHeading ? bid.replace(".heading", "") : bid.split(".")[0];
          const sectionPrefix = rawSectionPrefix === "edu" ? "education" : rawSectionPrefix;

          // Group rotation: when a repeatable section heading is rotated, orbit its
          // entries around the group center so they follow the heading as a rigid body.
          // Projects use the same rigid-group geometry as Work and Education.
          // The heading itself stays at its natural position and CSS-rotates in place
          // (moving it would disconnect it from its selection box / groupHeight area).
          //
          // Orbit uses NATURAL positions (without visualDy/visualDx overrides) so the
          // orbit center is stable. Any user-applied visual displacement is then
          // re-applied in the rotated coordinate frame, keeping manual tweaks intact.
          let entryAdditionalRotation: number | undefined;
          if (
            bid.startsWith("work.") ||
            bid.startsWith("projects.") ||
            bid.startsWith("edu.")
          ) {
            const headingBid = headingIdForSection(sectionPrefix);
            // Live rotation during drag takes priority over the saved logical-section angle.
            const liveRot    = groupRotation?.prefix === sectionPrefix + "." ? groupRotation.rot : undefined;
            const headingRot = liveRot ?? overrides[headingBid]?.rotation ?? 0;
            const headingCp  = computedPositions[headingBid];
            const fragment   = sectionFragmentBounds(sectionPrefix, cp.page);
            if (headingRot !== 0 && headingCp && fragment && !isHeading) {
              const θ    = headingRot * Math.PI / 180;
              const cosT = Math.cos(θ), sinT = Math.sin(θ);

              // Each physical page fragment rotates around its OWN local center, while
              // every fragment shares the same logical section angle. This prevents a
              // page-2 role from orbiting around a center that lives back on page 1.
              const renderedGroupH = sectionRenderedFragmentHeight(sectionPrefix, cp.page);
              const gcx  = headingCp.x + headingCp.w / 2;
              const gcy  = fragment.y + renderedGroupH / 2;

              // Strip visual-only displacement before orbit so page assignment and the
              // fragment center remain stable. Legacy role flowDisplacementY is visual.
              const roleOv = overrides[bid] ?? {};
              const vdx = roleOv.visualDx ?? 0;
              const vdy = (roleOv.visualDy ?? 0) + (roleOv.flowDisplacementY ?? 0);
              const natCx = cp.x - vdx + cp.w / 2;
              const natCy = cp.y - vdy + cp.h / 2;

              const relX = natCx - gcx, relY = natCy - gcy;
              // Match CSS rotate() exactly. CSS uses the standard 2D transform matrix:
              // x' = x·cos - y·sin, y' = x·sin + y·cos.
              // Using the opposite signs makes the entries orbit opposite to the outer
              // section rectangle, which is what caused the section to tear apart visually.
              const orbitCx = gcx + relX * cosT - relY * sinT;
              const orbitCy = gcy + relX * sinT + relY * cosT;

              // Re-apply each entry's manual displacement in that same rotated frame.
              const newCx = orbitCx + vdx * cosT - vdy * sinT;
              const newCy = orbitCy + vdx * sinT + vdy * cosT;

              cp = { ...cp, x: newCx - cp.w / 2, y: newCy - cp.h / 2 };
              entryAdditionalRotation = headingRot;
            }
          }

          return (
            <DraggableBlock
              key={bid}
              id={bid}
              computedPos={cp}
              override={overrides[bid]}
              additionalRotation={entryAdditionalRotation}
              scale={scale}
              design={d}
              onDesignChange={isHeading ? (newD) => {
                // When a section heading is resized, cascade its new width to all
                // entries in the section so they stay visually aligned with the heading.
                const newHeadingW = newD.layoutOverrides?.[bid]?.width;
                const prevHeadingW = d.layoutOverrides?.[bid]?.width;
                if (newHeadingW !== undefined && newHeadingW !== prevHeadingW) {
                  const entryBids = sectionIds(sectionPrefix).filter(b => !b.endsWith(".heading"));
                  const cascaded = { ...(newD.layoutOverrides ?? {}) };
                  for (const ebid of entryBids) {
                    cascaded[ebid] = { ...(cascaded[ebid] ?? {}), width: newHeadingW };
                  }
                  onDesignChange({ ...newD, layoutOverrides: cascaded });
                } else {
                  onDesignChange(newD);
                }
              } : onDesignChange}
              onHoverBlock={blockId => {
                const raw = blockId ? blockId.split(".")[0] : null;
                const logical = raw === "edu" ? "education" : raw;
                setGroupHoveredFragment(logical ? { section: logical, page: cp.page } : null);
                onHoverBlock(blockId);
              }}
              onBlockClick={onBlockClick}
              onRotate={isHeading ? rot => setGroupRotation({ prefix: sectionPrefix + ".", rot }) : undefined}
              onRotateEnd={isHeading ? () => setGroupRotation(null) : undefined}
              onDragMove={isHeading ? (dy, dx) => setGroupDrag({ prefix: sectionPrefix + ".", dy, dx }) : undefined}
              onDragEnd={isHeading ? (dx, dy) => {
                // One atomic onDesignChange: heading flowDisplacementY + visualDx,
                // plus entries' visualDx propagation. Must be one call so React
                // batching doesn't clobber the heading's flowDisplacementY.
                const entryBids = sectionIds(sectionPrefix).filter(b => !b.endsWith(".heading"));
                const curOverrides = d.layoutOverrides ?? {};
                const headingOv = curOverrides[bid] ?? {};
                const newOverrides = { ...curOverrides };

                // Heading: update flowDisplacementY and visualDx
                const newFdy = (headingOv.flowDisplacementY ?? 0) + (dy ?? 0);
                const newVdx = (headingOv.visualDx ?? 0) + dx;
                const newHeadingOv: LayoutOverride = { ...headingOv };
                if (newFdy) newHeadingOv.flowDisplacementY = newFdy; else delete newHeadingOv.flowDisplacementY;
                if (newVdx) newHeadingOv.visualDx = newVdx; else delete newHeadingOv.visualDx;
                if (Object.keys(newHeadingOv).length) newOverrides[bid] = newHeadingOv;
                else delete newOverrides[bid];

                // Entries: propagate horizontal delta
                if (Math.abs(dx) > 0.5) {
                  for (const ebid of entryBids) {
                    newOverrides[ebid] = { ...(newOverrides[ebid] ?? {}), visualDx: ((newOverrides[ebid]?.visualDx ?? 0) + dx) };
                  }
                }

                onDesignChange({ ...d, layoutOverrides: newOverrides });
                setGroupDrag(null);
              } : undefined}
              additionalDy={(() => {
                let dy = 0;
                if (groupDrag && !isHeading) {
                  const logicalPrefix = groupDrag.prefix.slice(0, -1);
                  if (sectionIds(logicalPrefix).includes(bid)) dy += groupDrag.dy;
                }
                if (continuationDrag && !isHeading && continuationDrag.page === cp.page &&
                    sectionIds(continuationDrag.section).includes(bid)) {
                  dy += continuationDrag.dy;
                }
                return dy;
              })()}
              additionalDx={(() => {
                let dx = 0;
                if (groupDrag && !isHeading) {
                  const logicalPrefix = groupDrag.prefix.slice(0, -1);
                  if (sectionIds(logicalPrefix).includes(bid)) dx += groupDrag.dx;
                }
                if (continuationDrag && !isHeading && continuationDrag.page === cp.page &&
                    sectionIds(continuationDrag.section).includes(bid)) {
                  dx += continuationDrag.dx;
                }
                return dx;
              })()}
              groupHeight={isHeading ? sectionRenderedFragmentHeight(sectionPrefix, cp.page) : undefined}
              groupMaxHeight={isHeading ? Math.max(0, pageBottom - cp.y) : undefined}
              forcedHover={isHeading && groupHoveredFragment?.section === sectionPrefix && groupHoveredFragment.page === cp.page}
            >
              {content}
            </DraggableBlock>
          );
              })}

              {(() => {
                const backgroundObjects = resolvedDesignObjectsForPage(pageIndex, "background");
                const foregroundObjects = resolvedDesignObjectsForPage(pageIndex, "foreground");
                const allPageObjects = [...backgroundObjects, ...foregroundObjects];
                const selectedOnPage = allPageObjects.filter(item =>
                  selectedDesignObjectIds.includes(item.source.id)
                );

                return (
                  <>
                    <CanvasDesignObjectLayer
                      objects={foregroundObjects}
                      allResolvedObjects={allPageObjects}
                      page={pageIndex}
                      scale={scale}
                      pageW={pageW}
                      pageH={pageH}
                      selectedIds={selectedDesignObjectIds}
                      onSelect={(source, rendered, rect, additive) =>
                        onSelectDesignObject?.(source, rendered, rect, pageIndex, additive)}
                      onChange={object => onDesignChange(applyLinkedDesignObjectChange(d, object))}
                      onChangeMany={commitDesignObjectChanges}
                      onGuidesChange={setDesignSnapGuides}
                    />

                    {designSnapGuides?.page === pageIndex && (
                      <DesignSnapGuides
                        guides={designSnapGuides}
                        pageW={pageW}
                        pageH={pageH}
                      />
                    )}

                    {pageIndex === selectedDesignObjectPage && selectedOnPage.length > 1 && (
                      <CanvasMultiSelectionOverlay
                        objects={selectedOnPage}
                        allResolvedObjects={allPageObjects}
                        page={pageIndex}
                        scale={scale}
                        pageW={pageW}
                        pageH={pageH}
                        onChangeMany={commitDesignObjectChanges}
                        onRectChange={rect => onDesignObjectRectChange?.(rect)}
                        onGuidesChange={setDesignSnapGuides}
                      />
                    )}

                    {selectedDesignObjectId &&
                      pageIndex === selectedDesignObjectPage &&
                      selectedOnPage.length === 1 &&
                      (() => {
                        const source = getDesignObjects(d).find(item => item.id === selectedDesignObjectId);
                        if (!source) return null;
                        const rendered = resolveDesignObjectForPage(source, pageIndex);
                        if (!rendered) return null;

                        return (
                          <CanvasDesignObjectSelectionOverlay
                            sourceObject={source}
                            object={rendered}
                            scale={scale}
                            pageW={pageW}
                            pageH={pageH}
                            snapTargets={allPageObjects.map(item => item.rendered)}
                            page={pageIndex}
                            onChange={next => onDesignChange(applyLinkedDesignObjectChange(d, next))}
                            onRectChange={rect => onDesignObjectRectChange?.(rect)}
                            onGuidesChange={setDesignSnapGuides}
                          />
                        );
                      })()}
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </BulletEditCtx.Provider>
  );
}

// ── Main canvas ───────────────────────────────────────────────────────────────

interface ResumeCanvasProps {
  data: ResumeData;
  onDesignChange: (d: ResumeDesign) => void;
  onDataChange: (d: ResumeData) => void;
  containerWidth: number;
  remeasureKey?: number;
}


function DesignObjectToolbar({
  object,
  anchorRect,
  linkedCount = 0,
  onChange,
  onUnlink,
  onBringForward,
  onSendBackward,
  onDelete,
  onReplaceImage,
  onToggleTextLayoutLink,
}: {
  object: ResumeDesignObject;
  anchorRect: DOMRect;
  linkedCount?: number;
  onChange: (partial: Partial<ResumeDesignObject>) => void;
  onUnlink?: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
  onReplaceImage?: () => void;
  onToggleTextLayoutLink?: () => void;
}) {
  const shape = object.type === "shape" ? object : null;
  const image = object.type === "image" ? object : null;
  const text = object.type === "text" ? object : null;
  const smart = object.type === "smart" ? object : null;
  if (!shape && !image && !text && !smart) return null;

  const width = image ? 760 : text ? 760 : smart ? 700 : 630;
  const estimatedHeight = image ? 78 : text ? 58 : smart ? 58 : 48;
  const top = anchorRect.top - estimatedHeight - 6 >= 4
    ? anchorRect.top - estimatedHeight - 6
    : anchorRect.bottom + 8;
  const left = Math.max(4, Math.min(window.innerWidth - Math.min(width, window.innerWidth - 8) - 4, anchorRect.left));

  const labelStyle: CSSProperties = {
    fontSize: 9,
    color: "#64748b",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const tinyButton: CSSProperties = {
    width: 28,
    height: 28,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    background: "white",
    color: "#475569",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };

  const commonTail = (
    <>
      <select
        value={designObjectDefaultLayer(object)}
        title={designObjectIsResumeDriven(object) ? "Smart/attached components keep their semantic resume layer" : "Resume layer"}
        disabled={designObjectIsResumeDriven(object)}
        onChange={e => onChange({ layer: e.target.value as DesignObjectLayer } as Partial<ResumeDesignObject>)}
        style={{
          height: 28,
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          background: designObjectIsResumeDriven(object) ? "#f8fafc" : "white",
          color: designObjectIsResumeDriven(object) ? "#94a3b8" : "#475569",
          fontSize: 10,
          padding: "0 4px",
          cursor: designObjectIsResumeDriven(object) ? "not-allowed" : "pointer",
        }}
      >
        <option value="background">Behind</option>
        <option value="foreground">Front</option>
      </select>

      <button type="button" title="Bring forward" onClick={onBringForward} style={tinyButton}>
        <ArrowUp size={14} />
      </button>
      <button type="button" title="Send backward" onClick={onSendBackward} style={tinyButton}>
        <ArrowDown size={14} />
      </button>
      <button
        type="button"
        title={`Delete ${object.type === "smart" ? "component" : object.type === "image" ? "image" : object.type === "text" ? "text box" : "shape"}`}
        onClick={onDelete}
        style={{ ...tinyButton, color: "#dc2626", borderColor: "#fecaca", background: "#fffafa" }}
      >
        <Trash2 size={14} />
      </button>
    </>
  );

  return (
    <div
      data-design-object-toolbar
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 10001,
        minHeight: 40,
        maxWidth: "calc(100vw - 8px)",
        display: "flex",
        flexWrap: image || text ? "wrap" : "nowrap",
        alignItems: "center",
        gap: 7,
        padding: "5px 7px",
        ...CONTEXT_TOOLBAR_SURFACE,
      }}
    >
      {object.linkId && linkedCount > 1 && (
        <button
          type="button"
          title="Linked peers share size and appearance, but keep their own position and content. Click to unlink this object."
          onClick={onUnlink}
          style={{
            height: 28,
            padding: "0 7px",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            borderRadius: 6,
            border: "1px solid rgba(245,158,11,0.38)",
            background: "rgba(255,251,235,0.98)",
            color: "#a16207",
            fontSize: 9.5,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Link2 size={12} />
          Linked · {linkedCount}
        </button>
      )}

      {shape && (() => {
        const attachmentValue =
          !shape.attachment ? "free" :
          shape.attachment.kind === "section" ? `section:${shape.attachment.sectionId}` :
          shape.attachment.kind;

        const attachmentPadding =
          shape.attachment?.kind === "section" || shape.attachment?.kind === "header"
            ? shape.attachment.padding ?? 0
            : 0;

        return (
          <>
            {shape.shape !== "line" && (
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <span style={labelStyle}>Fill</span>
                <input
                  type="color"
                  value={shape.fill ?? "#ede9fe"}
                  onChange={e => onChange({ fill: e.target.value } as Partial<ShapeDesignObject>)}
                  style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
                />
              </label>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <span style={labelStyle}>{shape.shape === "line" ? "Color" : "Border"}</span>
              <input
                type="color"
                value={shape.stroke ?? "#7c3aed"}
                onChange={e => onChange({ stroke: e.target.value } as Partial<ShapeDesignObject>)}
                style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Width</span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={shape.strokeWidth ?? 1}
                onChange={e => onChange({ strokeWidth: clampDesignObject(Number(e.target.value) || 0, 0, 20) } as Partial<ShapeDesignObject>)}
                style={{ width: 43, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Opacity</span>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round((shape.opacity ?? 1) * 100)}
                onChange={e => onChange({ opacity: Number(e.target.value) / 100 } as Partial<ShapeDesignObject>)}
                style={{ width: 58 }}
              />
            </label>

            {shape.shape === "rectangle" && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Round</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={shape.borderRadius ?? 0}
                  onChange={e => onChange({ borderRadius: clampDesignObject(Number(e.target.value) || 0, 0, 100) } as Partial<ShapeDesignObject>)}
                  style={{ width: 42, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            <select
              value={attachmentValue}
              title="Attach this shape to resume content"
              onChange={e => {
                const value = e.target.value;

                if (value === "free") {
                  onChange({ attachment: undefined } as Partial<ShapeDesignObject>);
                  return;
                }

                if (value === "page") {
                  onChange({
                    attachment: { kind: "page" },
                    layer: "background",
                  } as Partial<ShapeDesignObject>);
                  return;
                }

                if (value === "header") {
                  onChange({
                    attachment: { kind: "header", padding: 10 },
                    layer: "background",
                  } as Partial<ShapeDesignObject>);
                  return;
                }

                if (value.startsWith("section:")) {
                  const sectionId = value.slice("section:".length) as DesignSectionTarget;
                  onChange({
                    attachment: { kind: "section", sectionId, padding: 8 },
                    layer: "background",
                  } as Partial<ShapeDesignObject>);
                }
              }}
              style={{ height: 28, border: "1px solid #ddd6fe", borderRadius: 6, background: "#faf5ff", color: "#6d28d9", fontSize: 10, padding: "0 5px", fontWeight: 600 }}
            >
              <option value="free">Free shape</option>
              <option value="page">Page background</option>
              <option value="header">Header background</option>
              <option value="section:work">Experience background</option>
              <option value="section:education">Education background</option>
              <option value="section:skills">Skills background</option>
              <option value="section:bio">Summary background</option>
              <option value="section:links">Links background</option>
            </select>

            {(shape.attachment?.kind === "section" || shape.attachment?.kind === "header") && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Pad</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={1}
                  value={attachmentPadding}
                  onChange={e => {
                    const padding = clampDesignObject(Number(e.target.value) || 0, 0, 80);
                    const attachment = shape.attachment;
                    if (!attachment) return;

                    onChange({
                      attachment: attachment.kind === "header"
                        ? { kind: "header", padding }
                        : { kind: "section", sectionId: attachment.sectionId, padding },
                    } as Partial<ShapeDesignObject>);
                  }}
                  style={{ width: 40, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            {commonTail}
          </>
        );
      })()}

      {image && (() => {
        const mask = image.mask ?? (image.imageKind === "photo" ? "circle" : "square");
        const cropX = clampDesignObject(image.cropX ?? 50, 0, 100);
        const cropY = clampDesignObject(image.cropY ?? 50, 0, 100);

        return (
          <>
            <button
              type="button"
              title="Choose a different image"
              onClick={onReplaceImage}
              style={{ ...tinyButton, width: "auto", padding: "0 8px", gap: 5, fontSize: 10, fontWeight: 600 }}
            >
              <Upload size={13} />
              Replace
            </button>

            <select
              value={image.objectFit ?? "cover"}
              title="How the image fits inside its frame"
              onChange={e => onChange({ objectFit: e.target.value as ImageDesignObject["objectFit"] } as Partial<ImageDesignObject>)}
              style={{ height: 28, border: "1px solid #e2e8f0", borderRadius: 6, background: "white", color: "#475569", fontSize: 10, padding: "0 5px" }}
            >
              <option value="cover">Crop to fill</option>
              <option value="contain">Fit whole image</option>
              <option value="fill">Stretch</option>
            </select>

            <select
              value={mask}
              title="Image frame"
              onChange={e => {
                const nextMask = e.target.value as ImageMask;
                if (nextMask === "circle") {
                  const size = Math.max(20, Math.min(image.width, image.height));
                  onChange({
                    mask: nextMask,
                    width: size,
                    height: size,
                    objectFit: "cover",
                  } as Partial<ImageDesignObject>);
                } else {
                  onChange({ mask: nextMask } as Partial<ImageDesignObject>);
                }
              }}
              style={{ height: 28, border: "1px solid #ddd6fe", borderRadius: 6, background: "#faf5ff", color: "#6d28d9", fontSize: 10, padding: "0 5px", fontWeight: 600 }}
            >
              <option value="square">Square frame</option>
              <option value="rounded">Rounded frame</option>
              <option value="circle">Circle frame</option>
            </select>

            {mask === "rounded" && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Round</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={image.borderRadius ?? 12}
                  onChange={e => onChange({ borderRadius: clampDesignObject(Number(e.target.value) || 0, 0, 100) } as Partial<ImageDesignObject>)}
                  style={{ width: 42, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>X</span>
              <input
                type="range"
                title={`Crop position X: ${Math.round(cropX)}%`}
                min={0}
                max={100}
                value={cropX}
                disabled={(image.objectFit ?? "cover") === "fill"}
                onChange={e => onChange({ cropX: Number(e.target.value) } as Partial<ImageDesignObject>)}
                style={{ width: 64 }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Y</span>
              <input
                type="range"
                title={`Crop position Y: ${Math.round(cropY)}%`}
                min={0}
                max={100}
                value={cropY}
                disabled={(image.objectFit ?? "cover") === "fill"}
                onChange={e => onChange({ cropY: Number(e.target.value) } as Partial<ImageDesignObject>)}
                style={{ width: 64 }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <span style={labelStyle}>Border</span>
              <input
                type="color"
                value={image.borderColor ?? "#ffffff"}
                onChange={e => onChange({ borderColor: e.target.value } as Partial<ImageDesignObject>)}
                style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Width</span>
              <input
                type="number"
                min={0}
                max={20}
                value={image.borderWidth ?? 0}
                onChange={e => onChange({ borderWidth: clampDesignObject(Number(e.target.value) || 0, 0, 20) } as Partial<ImageDesignObject>)}
                style={{ width: 40, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
              />
            </label>

            <select
              value={image.shadow ?? "none"}
              title="Image shadow"
              onChange={e => onChange({ shadow: e.target.value as ImageShadow } as Partial<ImageDesignObject>)}
              style={{ height: 28, border: "1px solid #e2e8f0", borderRadius: 6, background: "white", color: "#475569", fontSize: 10, padding: "0 5px" }}
            >
              <option value="none">No shadow</option>
              <option value="soft">Soft shadow</option>
              <option value="medium">Medium shadow</option>
              <option value="strong">Strong shadow</option>
            </select>

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Opacity</span>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round((image.opacity ?? 1) * 100)}
                onChange={e => onChange({ opacity: Number(e.target.value) / 100 } as Partial<ImageDesignObject>)}
                style={{ width: 58 }}
              />
            </label>

            {commonTail}
          </>
        );
      })()}

      {text && (
        <>
          <button
            type="button"
            title={text.webLayoutUnlinked
              ? "Relink this textbox layout to Responsive Web. Text and style are already shared."
              : "PDF and Responsive Web placement are linked. Unlink layout to position Web independently."}
            onClick={onToggleTextLayoutLink}
            style={{
              height: 28,
              padding: "0 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: 6,
              border: text.webLayoutUnlinked ? "1px solid #e2e8f0" : "1px solid #ddd6fe",
              background: text.webLayoutUnlinked ? "#fff" : "#faf5ff",
              color: text.webLayoutUnlinked ? "#64748b" : "#6d28d9",
              fontSize: 9.5,
              fontWeight: 750,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {text.webLayoutUnlinked ? <Unlink2 size={12} /> : <Link2 size={12} />}
            {text.webLayoutUnlinked ? "Layout unlinked" : "Linked to Web"}
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <span style={labelStyle}>Color</span>
            <input
              type="color"
              value={text.color ?? "#111827"}
              onChange={e => onChange({ color: e.target.value } as Partial<TextDesignObject>)}
              style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={labelStyle}>Size</span>
            <input
              type="number" min={6} max={96} step={1}
              value={text.fontSize ?? 12}
              onChange={e => onChange({ fontSize: clampDesignObject(Number(e.target.value) || 12, 6, 96) } as Partial<TextDesignObject>)}
              style={{ width: 45, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
            />
          </label>

          <button
            type="button"
            title="Bold"
            onClick={() => onChange({ fontWeight: Number(text.fontWeight) >= 600 || String(text.fontFamily ?? "").includes("Bold") ? 400 : 700 } as Partial<TextDesignObject>)}
            style={{ ...tinyButton, fontWeight: 800, background: Number(text.fontWeight) >= 600 ? "#f5f3ff" : "white", color: Number(text.fontWeight) >= 600 ? "#6d28d9" : "#475569" }}
          >
            B
          </button>

          <button
            type="button"
            title="Italic"
            onClick={() => onChange({ fontStyle: text.fontStyle === "italic" ? "normal" : "italic" } as Partial<TextDesignObject>)}
            style={{ ...tinyButton, fontStyle: "italic", background: text.fontStyle === "italic" ? "#f5f3ff" : "white", color: text.fontStyle === "italic" ? "#6d28d9" : "#475569" }}
          >
            I
          </button>

          <select
            value={text.textAlign ?? "left"}
            title="Text alignment"
            onChange={e => onChange({ textAlign: e.target.value as TextDesignObject["textAlign"] } as Partial<TextDesignObject>)}
            style={{ height: 28, border: "1px solid #e2e8f0", borderRadius: 6, background: "white", color: "#475569", fontSize: 10, padding: "0 5px" }}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>

          <span style={{ color: "#94a3b8", fontSize: 9, whiteSpace: "nowrap" }}>Double-click text to edit</span>

          {commonTail}
        </>
      )}

      {smart && (() => {
        const isSidebar = smart.smartKind === "sidebar";
        const isTimeline = smart.smartKind === "timeline";
        const isDivider = smart.smartKind === "section-divider";
        const isHeaderAccent = smart.smartKind === "header-accent";

        return (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <span style={labelStyle}>{isTimeline ? "Dots" : isDivider ? "Color" : "Fill"}</span>
              <input
                type="color"
                value={isDivider ? (smart.stroke ?? "#7c3aed") : (smart.fill ?? "#7c3aed")}
                onChange={e => onChange(
                  isDivider
                    ? ({ stroke: e.target.value } as Partial<SmartDesignObject>)
                    : ({ fill: e.target.value } as Partial<SmartDesignObject>)
                )}
                style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
              />
            </label>

            {isTimeline && (
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <span style={labelStyle}>Line</span>
                <input
                  type="color"
                  value={smart.stroke ?? smart.fill ?? "#7c3aed"}
                  onChange={e => onChange({ stroke: e.target.value } as Partial<SmartDesignObject>)}
                  style={{ width: 27, height: 27, padding: 1, border: "1px solid #e2e8f0", borderRadius: 5, background: "white", cursor: "pointer" }}
                />
              </label>
            )}

            {isSidebar && (
              <>
                <select
                  value={smart.side ?? "left"}
                  title="Sidebar side"
                  onChange={e => onChange({ side: e.target.value as SmartDesignObject["side"] } as Partial<SmartDesignObject>)}
                  style={{ height: 28, border: "1px solid #ddd6fe", borderRadius: 6, background: "#faf5ff", color: "#6d28d9", fontSize: 10, padding: "0 5px", fontWeight: 600 }}
                >
                  <option value="left">Left side</option>
                  <option value="right">Right side</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={labelStyle}>Width</span>
                  <input
                    type="number" min={20} max={260} step={1}
                    value={Math.round(smart.width || 72)}
                    onChange={e => onChange({ width: clampDesignObject(Number(e.target.value) || 72, 20, 260) } as Partial<SmartDesignObject>)}
                    style={{ width: 48, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={labelStyle}>Round</span>
                  <input
                    type="number" min={0} max={80} step={1}
                    value={smart.borderRadius ?? 0}
                    onChange={e => onChange({ borderRadius: clampDesignObject(Number(e.target.value) || 0, 0, 80) } as Partial<SmartDesignObject>)}
                    style={{ width: 43, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                  />
                </label>
              </>
            )}

            {(isTimeline || isDivider) && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Line</span>
                <input
                  type="number" min={1} max={16} step={1}
                  value={smart.strokeWidth ?? 2}
                  onChange={e => onChange({ strokeWidth: clampDesignObject(Number(e.target.value) || 1, 1, 16) } as Partial<SmartDesignObject>)}
                  style={{ width: 40, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            {isHeaderAccent && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Thick</span>
                <input
                  type="number" min={1} max={40} step={1}
                  value={Math.round(smart.height || 4)}
                  onChange={e => onChange({ height: clampDesignObject(Number(e.target.value) || 4, 1, 40) } as Partial<SmartDesignObject>)}
                  style={{ width: 42, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            {isTimeline && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>Dot</span>
                <input
                  type="number" min={4} max={30} step={1}
                  value={smart.dotSize ?? 8}
                  onChange={e => onChange({ dotSize: clampDesignObject(Number(e.target.value) || 8, 4, 30) } as Partial<SmartDesignObject>)}
                  style={{ width: 40, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            {!isSidebar && (
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={labelStyle}>{isTimeline ? "Offset" : "Gap"}</span>
                <input
                  type="number"
                  min={isHeaderAccent || isDivider ? -20 : 4}
                  max={80}
                  step={1}
                  value={smart.offset ?? (isTimeline ? 14 : isHeaderAccent ? 8 : 5)}
                  onChange={e => onChange({ offset: clampDesignObject(Number(e.target.value) || 0, isTimeline ? 4 : -20, 80) } as Partial<SmartDesignObject>)}
                  style={{ width: 44, height: 27, border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", fontSize: 10 }}
                />
              </label>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={labelStyle}>Opacity</span>
              <input
                type="range" min={10} max={100}
                value={Math.round((smart.opacity ?? 1) * 100)}
                onChange={e => onChange({ opacity: Number(e.target.value) / 100 } as Partial<SmartDesignObject>)}
                style={{ width: 58 }}
              />
            </label>

            {commonTail}
          </>
        );
      })()}
    </div>
  );
}


function designObjectLabel(object: ResumeDesignObject): string {
  if (object.name?.trim()) return object.name.trim();

  if (object.type === "image") {
    return object.imageKind === "photo" ? "Profile photo" : "Image";
  }

  if (object.type === "shape") {
    if (object.attachment?.kind === "page") return `Page ${object.page + 1} background`;
    if (object.attachment?.kind === "header") return "Header background";
    if (object.attachment?.kind === "section") {
      return `${SECTION_LABELS[object.attachment.sectionId]} background`;
    }

    return object.shape === "ellipse"
      ? "Circle"
      : object.shape === "line"
      ? "Line"
      : "Rectangle";
  }

  if (object.type === "smart") {
    if (object.smartKind === "sidebar") return `${object.side === "right" ? "Right" : "Left"} sidebar`;
    if (object.smartKind === "header-accent") return "Header accent";
    if (object.smartKind === "timeline") return `${object.sectionId ? SECTION_LABELS[object.sectionId] : "Section"} timeline`;
    if (object.smartKind === "section-divider") return `${object.sectionId ? SECTION_LABELS[object.sectionId] : "Section"} divider`;
  }
  if (object.type === "text") return object.text.trim() || "Text";
  if (object.type === "icon") return object.icon || "Icon";
  return "Object";
}

function designObjectPageBadge(object: ResumeDesignObject): string {
  if (object.type === "shape" && object.attachment?.kind === "section") return "AUTO";
  if (object.type === "shape" && object.attachment?.kind === "header") return "P1";
  if (object.type === "smart" && object.smartKind === "sidebar") return "ALL";
  if (object.type === "smart" && (object.smartKind === "timeline" || object.smartKind === "section-divider")) return "AUTO";
  if (object.type === "smart" && object.smartKind === "header-accent") return "P1";
  return `P${object.page + 1}`;
}

function designObjectMatchesPage(object: ResumeDesignObject, page: number): boolean {
  if (object.type === "shape" && object.attachment?.kind === "section") return true;
  if (object.type === "shape" && object.attachment?.kind === "header") return page === 0;
  if (object.type === "smart" && object.smartKind === "sidebar") return true;
  if (object.type === "smart" && (object.smartKind === "timeline" || object.smartKind === "section-divider")) return true;
  if (object.type === "smart" && object.smartKind === "header-accent") return page === 0;
  return object.page === page;
}

function LayersPanel({
  objects,
  activePage,
  selectedIds,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onRename,
  onReorder,
  onClose,
}: {
  objects: ResumeDesignObject[];
  activePage: number;
  selectedIds: string[];
  onSelect: (object: ResumeDesignObject, additive: boolean) => void;
  onToggleHidden: (object: ResumeDesignObject) => void;
  onToggleLocked: (object: ResumeDesignObject) => void;
  onRename: (object: ResumeDesignObject, name: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onClose: () => void;
}) {
  const [showAllPages, setShowAllPages] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const visibleForPanel = objects.filter(object =>
    showAllPages || designObjectMatchesPage(object, activePage)
  );

  // Highest z-index is visually closest to the user, so show it first.
  const foreground = visibleForPanel
    .filter(object => designObjectDefaultLayer(object) === "foreground")
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  const background = visibleForPanel
    .filter(object => designObjectDefaultLayer(object) === "background")
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  function iconFor(object: ResumeDesignObject) {
    if (object.type === "image") {
      return object.imageKind === "photo"
        ? <User size={13} />
        : <ImageIcon size={13} />;
    }

    if (object.type === "shape") {
      if (object.shape === "ellipse") return <Circle size={13} />;
      if (object.shape === "line") return <Minus size={14} />;
      return <Square size={13} />;
    }

    if (object.type === "smart") return <Layers3 size={13} />;

    return <FileText size={13} />;
  }

  function commitRename(object: ResumeDesignObject) {
    const next = nameDraft.trim();
    onRename(object, next || designObjectLabel(object));
    setEditingId(null);
    setNameDraft("");
  }

  function group(label: string, items: ResumeDesignObject[]) {
    return (
      <>
        <div
          style={{
            height: 25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px",
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#64748b",
            textTransform: "uppercase",
            background: "#f8fafc",
            borderTop: "1px solid #eef2f7",
            borderBottom: "1px solid #eef2f7",
          }}
        >
          <span>{label}</span>
          <span style={{ color: "#94a3b8", fontWeight: 600 }}>{items.length}</span>
        </div>

        {items.length === 0 ? (
          <div
            style={{
              padding: "9px 10px",
              fontSize: 10,
              color: "#94a3b8",
              fontStyle: "italic",
            }}
          >
            No design objects
          </div>
        ) : items.map(object => {
          const selected = selectedIds.includes(object.id);
          const dragging = draggedId === object.id;
          const dragTarget = dragOverId === object.id && draggedId !== object.id;

          return (
            <div
              key={object.id}
              draggable
              onDragStart={e => {
                setDraggedId(object.id);
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", object.id); } catch {}
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragOver={e => {
                if (!draggedId || draggedId === object.id) return;
                const dragged = objects.find(item => item.id === draggedId);
                if (!dragged) return;

                const draggedLayer = designObjectDefaultLayer(dragged);
                const targetLayer = object.layer ?? (object.type === "image" ? "foreground" : "background");
                if (draggedLayer !== targetLayer) return;

                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverId(object.id);
              }}
              onDrop={e => {
                e.preventDefault();
                if (draggedId && draggedId !== object.id) onReorder(draggedId, object.id);
                setDraggedId(null);
                setDragOverId(null);
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                onSelect(object, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
              style={{
                minHeight: 38,
                display: "grid",
                gridTemplateColumns: "18px 22px minmax(0,1fr) auto auto",
                alignItems: "center",
                gap: 4,
                padding: "3px 5px",
                background: selected ? "#f5f3ff" : dragTarget ? "#faf5ff" : "white",
                borderLeft: selected ? "3px solid #7c3aed" : "3px solid transparent",
                borderBottom: "1px solid #f1f5f9",
                opacity: object.hidden ? 0.55 : dragging ? 0.45 : 1,
                cursor: "pointer",
                transition: "background 0.1s, opacity 0.1s",
                boxShadow: dragTarget ? "inset 0 2px 0 #a78bfa" : undefined,
              }}
            >
              <span
                title="Drag to reorder within this layer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#cbd5e1",
                  cursor: "grab",
                }}
              >
                <GripVertical size={13} />
              </span>

              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: selected ? "#ede9fe" : "#f8fafc",
                  color: selected ? "#7c3aed" : "#64748b",
                }}
              >
                {iconFor(object)}
              </span>

              <div style={{ minWidth: 0 }}>
                {editingId === object.id ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 3 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(object);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingId(null);
                          setNameDraft("");
                        }
                      }}
                      onBlur={() => commitRename(object)}
                      style={{
                        minWidth: 0,
                        width: "100%",
                        height: 23,
                        border: "1px solid #c4b5fd",
                        borderRadius: 4,
                        padding: "0 5px",
                        fontSize: 10.5,
                        color: "#334155",
                        outline: "none",
                      }}
                    />
                    <Check size={12} color="#7c3aed" />
                  </div>
                ) : (
                  <div
                    title="Double-click to rename"
                    onDoubleClick={e => {
                      e.stopPropagation();
                      setEditingId(object.id);
                      setNameDraft(designObjectLabel(object));
                    }}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 10.5,
                      fontWeight: selected ? 650 : 500,
                      color: object.hidden ? "#94a3b8" : "#334155",
                    }}
                  >
                    {designObjectLabel(object)}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginTop: 1,
                    fontSize: 8.5,
                    color: "#94a3b8",
                  }}
                >
                  <span>{designObjectPageBadge(object)}</span>
                  {((object.type === "shape" && object.attachment) || object.type === "smart") && (
                    <span style={{ color: "#8b5cf6" }}>{object.type === "smart" ? "smart" : "attached"}</span>
                  )}
                  {object.groupId && <span style={{ color: "#7c3aed" }}>grouped</span>}
                  {object.linkId && (
                    <span style={{ color: "#a16207", display: "inline-flex", alignItems: "center", gap: 2 }}>
                      <Link2 size={8} />
                      linked · {objects.filter(item => item.linkId === object.linkId).length}
                    </span>
                  )}
                  {object.locked && <span>locked</span>}
                </div>
              </div>

              <button
                type="button"
                title={object.hidden ? "Show object" : "Hide object"}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  onToggleHidden(object);
                }}
                style={{
                  width: 25,
                  height: 25,
                  border: "none",
                  borderRadius: 5,
                  background: "transparent",
                  color: object.hidden ? "#94a3b8" : "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                {object.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>

              <button
                type="button"
                title={object.locked ? "Unlock object" : "Lock object"}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  onToggleLocked(object);
                }}
                style={{
                  width: 25,
                  height: 25,
                  border: "none",
                  borderRadius: 5,
                  background: object.locked ? "#f5f3ff" : "transparent",
                  color: object.locked ? "#7c3aed" : "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                {object.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div
      data-layers-panel
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 35,
        right: 0,
        zIndex: 10003,
        width: 285,
        maxHeight: "min(520px, calc(100vh - 120px))",
        display: "flex",
        flexDirection: "column",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        boxShadow: "0 12px 34px rgba(15,23,42,0.18)",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 8px 6px 10px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <Layers3 size={15} color="#6d28d9" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#334155" }}>Layers</div>
          <div style={{ fontSize: 8.5, color: "#94a3b8" }}>
            Top rows appear in front
          </div>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: 2,
            borderRadius: 6,
            background: "#f1f5f9",
          }}
        >
          <button
            type="button"
            onClick={() => setShowAllPages(false)}
            style={{
              height: 22,
              padding: "0 6px",
              border: "none",
              borderRadius: 4,
              background: !showAllPages ? "white" : "transparent",
              color: !showAllPages ? "#6d28d9" : "#64748b",
              fontSize: 8.5,
              fontWeight: 650,
              cursor: "pointer",
              boxShadow: !showAllPages ? "0 1px 2px rgba(15,23,42,0.10)" : "none",
            }}
          >
            P{activePage + 1}
          </button>
          <button
            type="button"
            onClick={() => setShowAllPages(true)}
            style={{
              height: 22,
              padding: "0 6px",
              border: "none",
              borderRadius: 4,
              background: showAllPages ? "white" : "transparent",
              color: showAllPages ? "#6d28d9" : "#64748b",
              fontSize: 8.5,
              fontWeight: 650,
              cursor: "pointer",
              boxShadow: showAllPages ? "0 1px 2px rgba(15,23,42,0.10)" : "none",
            }}
          >
            All
          </button>
        </div>

        <button
          type="button"
          title="Close layers"
          onClick={onClose}
          style={{
            width: 26,
            height: 26,
            border: "none",
            borderRadius: 5,
            background: "transparent",
            color: "#64748b",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ overflowY: "auto", minHeight: 0 }}>
        {group("Front", foreground)}

        {/* The structured resume is the fixed middle layer. It stays semantic/ATS-safe
            and cannot accidentally be hidden, reordered or turned into decoration. */}
        <div
          style={{
            minHeight: 42,
            display: "grid",
            gridTemplateColumns: "18px 22px minmax(0,1fr) auto",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px 4px 5px",
            background: "#fcfcfd",
            borderTop: "1px solid #e2e8f0",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <span />
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#eef2ff",
              color: "#6366f1",
            }}
          >
            <FileText size={13} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 650, color: "#334155" }}>
              Resume content
            </div>
            <div style={{ marginTop: 1, fontSize: 8.5, color: "#94a3b8" }}>
              Structured flow / ATS content
            </div>
          </div>
          <Lock size={12} color="#cbd5e1" />
        </div>

        {group("Behind", background)}
      </div>

      <div
        style={{
          padding: "6px 9px",
          borderTop: "1px solid #e2e8f0",
          background: "#f8fafc",
          fontSize: 8.5,
          color: "#94a3b8",
          lineHeight: 1.35,
        }}
      >
        Shift-click to multi-select · group = move together · link = size/style together
      </div>
    </div>
  );
}


type DesignAlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

function MiniAlignGlyph({
  mode,
}: {
  mode: DesignAlignMode;
}) {
  const horizontal = mode === "left" || mode === "center" || mode === "right";
  const justify =
    mode === "left" || mode === "top" ? "flex-start" :
    mode === "right" || mode === "bottom" ? "flex-end" :
    "center";

  return (
    <span
      style={{
        width: 14,
        height: 14,
        display: "flex",
        flexDirection: horizontal ? "column" : "row",
        justifyContent: "space-between",
        alignItems: justify,
      }}
    >
      <span style={{ width: horizontal ? 12 : 2, height: horizontal ? 2 : 12, background: "currentColor", borderRadius: 1 }} />
      <span style={{ width: horizontal ? 8 : 2, height: horizontal ? 2 : 8, background: "currentColor", borderRadius: 1 }} />
      <span style={{ width: horizontal ? 10 : 2, height: horizontal ? 2 : 10, background: "currentColor", borderRadius: 1 }} />
    </span>
  );
}

function MultiDesignObjectToolbar({
  count,
  anchorRect,
  canDistribute,
  canLink,
  isLinkedSet,
  hasGroup,
  allLocked,
  onAlign,
  onDistribute,
  onLink,
  onUnlink,
  onGroup,
  onUngroup,
  onToggleLock,
  onDelete,
}: {
  count: number;
  anchorRect: DOMRect;
  canDistribute: boolean;
  canLink: boolean;
  isLinkedSet: boolean;
  hasGroup: boolean;
  allLocked: boolean;
  onAlign: (mode: DesignAlignMode) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onLink: () => void;
  onUnlink: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const width = 540;
  const top = anchorRect.top - 45 >= 4 ? anchorRect.top - 45 : anchorRect.bottom + 8;
  const left = Math.max(4, Math.min(window.innerWidth - width - 4, anchorRect.left));

  const button: CSSProperties = {
    width: 28,
    height: 28,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    background: "white",
    color: "#475569",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <div
      data-multi-design-toolbar
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 10002,
        minHeight: 38,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        ...CONTEXT_TOOLBAR_SURFACE,
      }}
    >
      <span
        style={{
          padding: "0 6px 0 2px",
          borderRight: "1px solid #e5e7eb",
          color: "#7c3aed",
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {count} selected
      </span>

      {(["left", "center", "right", "top", "middle", "bottom"] as DesignAlignMode[]).map(mode => (
        <button
          key={mode}
          type="button"
          title={`Align ${mode}`}
          onClick={() => onAlign(mode)}
          style={button}
        >
          <MiniAlignGlyph mode={mode} />
        </button>
      ))}

      <span style={{ width: 1, height: 18, background: "#e5e7eb", margin: "0 2px" }} />

      <button
        type="button"
        title="Distribute horizontally"
        disabled={!canDistribute}
        onClick={() => onDistribute("horizontal")}
        style={{ ...button, opacity: canDistribute ? 1 : 0.35, cursor: canDistribute ? "pointer" : "not-allowed" }}
      >
        <MoveHorizontal size={14} />
      </button>
      <button
        type="button"
        title="Distribute vertically"
        disabled={!canDistribute}
        onClick={() => onDistribute("vertical")}
        style={{ ...button, opacity: canDistribute ? 1 : 0.35, cursor: canDistribute ? "pointer" : "not-allowed" }}
      >
        <MoveVertical size={14} />
      </button>

      <span style={{ width: 1, height: 18, background: "#e5e7eb", margin: "0 2px" }} />

      {isLinkedSet ? (
        <button
          type="button"
          title="Unlink selected objects. Their current appearance stays the same, but future edits become independent."
          onClick={onUnlink}
          style={{
            ...button,
            width: "auto",
            padding: "0 7px",
            gap: 4,
            fontSize: 9.5,
            fontWeight: 650,
            color: "#a16207",
            borderColor: "rgba(245,158,11,0.38)",
            background: "#fffbeb",
          }}
        >
          <Unlink2 size={12} />
          Unlink
        </button>
      ) : (
        <button
          type="button"
          title={canLink
            ? "Link size and appearance. Each object keeps its own position, page and content."
            : "Linking requires compatible objects (same object type; shapes must use the same shape)."}
          disabled={!canLink}
          onClick={onLink}
          style={{
            ...button,
            width: "auto",
            padding: "0 7px",
            gap: 4,
            fontSize: 9.5,
            fontWeight: 650,
            opacity: canLink ? 1 : 0.35,
            cursor: canLink ? "pointer" : "not-allowed",
          }}
        >
          <Link2 size={12} />
          Link
        </button>
      )}

      <span style={{ width: 1, height: 18, background: "#e5e7eb", margin: "0 2px" }} />

      {hasGroup ? (
        <button
          type="button"
          title="Ungroup selected objects"
          onClick={onUngroup}
          style={{ ...button, width: "auto", padding: "0 7px", fontSize: 9.5, fontWeight: 650 }}
        >
          Ungroup
        </button>
      ) : (
        <button
          type="button"
          title="Group selected objects"
          onClick={onGroup}
          style={{ ...button, width: "auto", padding: "0 7px", fontSize: 9.5, fontWeight: 650 }}
        >
          Group
        </button>
      )}

      <button
        type="button"
        title={allLocked ? "Unlock selected objects" : "Lock selected objects"}
        onClick={onToggleLock}
        style={button}
      >
        {allLocked ? <Unlock size={13} /> : <Lock size={13} />}
      </button>

      <button
        type="button"
        title="Delete selected objects"
        onClick={onDelete}
        style={{ ...button, color: "#dc2626", borderColor: "#fecaca", background: "#fffafa" }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}


export default function ResumeCanvas({ data, onDesignChange, onDataChange, containerWidth, remeasureKey = 0 }: ResumeCanvasProps) {
  // Merge with DEFAULT_DESIGN so partial design objects (e.g. only layoutOverrides set)
  // don't break the canvas - any missing field falls back to the default.
  const d = data.design ? { ...DEFAULT_DESIGN, ...data.design } : DEFAULT_DESIGN;
  const [PAGE_W, PAGE_H] = d.pageSize === "A4" ? [595, 842] : [612, 792];
  const [canvasZoom, setCanvasZoom] = useState(readInitialPdfCanvasZoom);
  const fitScale = containerWidth > 0 ? containerWidth / PAGE_W : 1;
  const scale = fitScale * canvasZoom;
  const displayedPageWidth = PAGE_W * scale;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PDF_CANVAS_ZOOM_STORAGE_KEY,
        String(canvasZoom),
      );
    } catch {
      // Editor preference persistence is best-effort only.
    }
  }, [canvasZoom]);

  const [selected,      setSelected]     = useState<SelectableKey | null>(null);
  const [anchorRect,    setAnchorRect]   = useState<DOMRect | null>(null);
  const [hovered,       setHovered]      = useState<SelectableKey | null>(null);
  const [rightKey,      setRightKey]     = useState<SelectableKey | null>(null);
  const [rightAnchor,   setRightAnchor]  = useState<DOMRect | null>(null);
  const [rightBlockId,  setRightBlockId] = useState<string | null>(null);
  const [hoveredBlock,  setHoveredBlock] = useState<string | null>(null);
  const [blockActionId, setBlockActionId]   = useState<string | null>(null);
  const [blockActionRect, setBlockActionRect] = useState<DOMRect | null>(null);
  const [selectedSubDragKey, setSelectedSubDragKey] = useState<string | null>(null);

  // Phase 2 design-object editor state.
  const [selectedDesignObjectId, setSelectedDesignObjectId] = useState<string | null>(null);
  const [selectedDesignObjectIds, setSelectedDesignObjectIds] = useState<string[]>([]);
  const [designObjectAnchorRect, setDesignObjectAnchorRect] = useState<DOMRect | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedDesignObjectPage, setSelectedDesignObjectPage] = useState(0);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [backgroundMenuOpen, setBackgroundMenuOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [componentMenuOpen, setComponentMenuOpen] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [arrangeMenuOpen, setArrangeMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [pendingImageKind, setPendingImageKind] = useState<ImageDesignKind>("image");
  const [pendingReplaceObjectId, setPendingReplaceObjectId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Selection toolbars are portalled using viewport rectangles. Those rectangles
    // change when the editor zoom changes, so dismiss the current selection rather
    // than leaving a toolbar floating at an obsolete location.
    setSelected(null);
    setAnchorRect(null);
    setRightKey(null);
    setRightAnchor(null);
    setRightBlockId(null);
    setBlockActionId(null);
    setBlockActionRect(null);
    setSelectedSubDragKey(null);
    setSelectedDesignObjectId(null);
    setSelectedDesignObjectIds([]);
    setDesignObjectAnchorRect(null);
  }, [canvasZoom]);

  // Selecting a design object happens on mousedown so dragging can begin immediately.
  // React then mounts the selection overlay before mouseup. The browser may synthesize
  // the following click on the nearest common ancestor (rather than the original object),
  // which used to reach the canvas click-away handler and instantly clear the selection.
  // Keep a one-pointer-cycle guard so that click cannot deselect the object we just grabbed.
  const suppressCanvasClearForDesignObjectRef = useRef(false);

  function armDesignObjectCanvasClearGuard() {
    suppressCanvasClearForDesignObjectRef.current = true;

    const releaseAfterClick = () => {
      // `click` is dispatched after `mouseup`; a 0ms task keeps the guard alive
      // through that click but guarantees it cannot swallow the next real click.
      window.setTimeout(() => {
        suppressCanvasClearForDesignObjectRef.current = false;
      }, 0);
    };

    document.addEventListener("mouseup", releaseAfterClick, { once: true });
  }

  function handleCanvasClickAway() {
    if (suppressCanvasClearForDesignObjectRef.current) return;
    clearSelection();
  }

  function handleSelect(key: SelectableKey, el: HTMLElement) {
    setSelectedDesignObjectId(null);
    setSelectedDesignObjectIds([]);
    setDesignObjectAnchorRect(null);
    setSelected(key);
    setAnchorRect(el.getBoundingClientRect());
    const subDrag = el.closest("[data-subdrag-key]") as HTMLElement | null;
    setSelectedSubDragKey(subDrag?.dataset.subdragKey ?? null);
    setRightKey(null); setRightAnchor(null);
  }

  function handleRightClick(key: SelectableKey, el: HTMLElement) {
    setSelectedDesignObjectId(null);
    setSelectedDesignObjectIds([]);
    setDesignObjectAnchorRect(null);
    setRightKey(key);
    setRightAnchor(el.getBoundingClientRect());
    setRightBlockId(hoveredBlock);
    setSelected(null); setAnchorRect(null);
    setSelectedSubDragKey(null);
  }

  function clearSelection() {
    setSelected(null); setAnchorRect(null);
    setRightKey(null); setRightAnchor(null);
    setBlockActionId(null); setBlockActionRect(null);
    setSelectedSubDragKey(null);
    setSelectedDesignObjectId(null);
    setSelectedDesignObjectIds([]);
    setDesignObjectAnchorRect(null);
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);
    setArrangeMenuOpen(false);
    setMoreMenuOpen(false);
    setLayersPanelOpen(false);
  }

  function handleBlockClick(id: string, rect: DOMRect | null) {
    clearSelection();
    setBlockActionId(id);
    setBlockActionRect(rect);
  }

  function clearChildOverridesFor(id: string) {
    const prefix = id + ".";
    const layoutOverrides = Object.fromEntries(
      Object.entries(d.layoutOverrides ?? {}).filter(([k]) => !k.startsWith(prefix))
    );
    onDesignChange({ ...d, layoutOverrides });
    setBlockActionId(null);
    setBlockActionRect(null);
  }

  function refreshDesignObjectSelectionAnchor(ids: string[], page: number) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setDesignObjectAnchorRect(selectionBoundingClientRect(ids, page));
    }));
  }

  function selectDesignObject(
    source: ResumeDesignObject,
    _rendered: ResumeDesignObject,
    rect: DOMRect | null,
    page: number,
    additive: boolean,
  ) {
    armDesignObjectCanvasClearGuard();

    setSelected(null); setAnchorRect(null);
    setRightKey(null); setRightAnchor(null);
    setBlockActionId(null); setBlockActionRect(null);
    setSelectedSubDragKey(null);
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);

    setActivePageIndex(page);
    setSelectedDesignObjectPage(page);

    const all = getDesignObjects(d);

    let nextIds: string[];
    if (!additive && source.groupId && !designObjectIsResumeDriven(source)) {
      nextIds = all
        .filter(object =>
          object.groupId === source.groupId &&
          designObjectMatchesPage(object, page) &&
          !object.hidden
        )
        .map(object => object.id);
    } else if (additive && selectedDesignObjectPage === page) {
      nextIds = selectedDesignObjectIds.includes(source.id)
        ? selectedDesignObjectIds.filter(id => id !== source.id)
        : [...selectedDesignObjectIds, source.id];
    } else {
      nextIds = [source.id];
    }

    if (nextIds.length === 0) {
      setSelectedDesignObjectId(null);
      setSelectedDesignObjectIds([]);
      setDesignObjectAnchorRect(null);
      return;
    }

    setSelectedDesignObjectIds(nextIds);
    setSelectedDesignObjectId(nextIds.includes(source.id) ? source.id : nextIds[nextIds.length - 1]);

    if (nextIds.length === 1) {
      setDesignObjectAnchorRect(rect);
    } else {
      refreshDesignObjectSelectionAnchor(nextIds, page);
    }
  }

  function addTextBox() {
    const object = createLinkedTextDesignObject(d, activePageIndex);
    onDesignChange(upsertDesignObject(d, object));
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);
    setSelectedDesignObjectPage(activePageIndex);
    setSelectedDesignObjectIds([object.id]);
    setSelectedDesignObjectId(object.id);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = renderedDesignObjectElements(object.id)[0];
      setDesignObjectAnchorRect(el?.getBoundingClientRect() ?? null);
    }));
  }

  function addShape(shape: ShapeDesignObject["shape"]) {
    const existing = getDesignObjects(d);
    const onPage = existing.filter(o => o.page === activePageIndex);
    const offset = (onPage.length % 5) * 12;

    const size =
      shape === "ellipse" ? { width: 90, height: 90 } :
      shape === "line"    ? { width: 150, height: 2 } :
                            { width: 160, height: 72 };

    const layer: DesignObjectLayer = "background";
    const maxZ = existing
      .filter(o => o.page === activePageIndex && (o.layer ?? "background") === layer)
      .reduce((m, o) => Math.max(m, o.zIndex ?? 0), 0);

    const object: ShapeDesignObject = {
      id: `shape-${genId()}`,
      type: "shape",
      shape,
      page: activePageIndex,
      x: clampDesignObject((PAGE_W - size.width) / 2 + offset, 8, PAGE_W - size.width - 8),
      y: clampDesignObject(90 + offset, 8, PAGE_H - size.height - 8),
      width: size.width,
      height: size.height,
      rotation: 0,
      opacity: 1,
      zIndex: maxZ + 1,
      layer,
      locked: false,
      hidden: false,
      name: shape === "rectangle" ? "Rectangle" : shape === "ellipse" ? "Circle" : "Line",
      fill: shape === "line" ? undefined : "#ede9fe",
      stroke: "#7c3aed",
      strokeWidth: shape === "line" ? 2 : 1,
      borderRadius: shape === "rectangle" ? 8 : undefined,
    };

    onDesignChange(upsertDesignObject(d, object));
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);
    setSelectedDesignObjectPage(activePageIndex);
    setSelectedDesignObjectIds([object.id]);
    setSelectedDesignObjectId(object.id);

    requestAnimationFrame(() => {
      const el = renderedDesignObjectElements(object.id)[0];
      setDesignObjectAnchorRect(el?.getBoundingClientRect() ?? null);
    });
  }

  function activateNewDesignObject(objectId: string, fallbackPage: number) {
    setSelectedDesignObjectIds([objectId]);
    setSelectedDesignObjectId(objectId);
    setSelectedDesignObjectPage(fallbackPage);

    // Smart section backgrounds can first appear on a page other than the page where
    // the command was invoked. After React paints, discover the first rendered fragment.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const candidates = renderedDesignObjectElements(objectId);
      const el =
        candidates.find(node => node.dataset.designObjectPage === String(fallbackPage)) ??
        candidates[0];
      const page = Number(el?.dataset.designObjectPage ?? fallbackPage);
      if (Number.isFinite(page)) {
        setActivePageIndex(page);
        setSelectedDesignObjectPage(page);
      }
      setDesignObjectAnchorRect(el?.getBoundingClientRect() ?? null);
    }));
  }

  function addSmartBackground(
    target: "page" | "header" | DesignSectionTarget,
  ) {
    const existing = getDesignObjects(d);
    const layer: DesignObjectLayer = "background";
    const maxZ = existing
      .filter(o => (o.layer ?? "background") === layer)
      .reduce((m, o) => Math.max(m, o.zIndex ?? 0), 0);

    const attachment: DesignObjectAttachment =
      target === "page"
        ? { kind: "page" }
        : target === "header"
        ? { kind: "header", padding: 10 }
        : { kind: "section", sectionId: target, padding: 8 };

    const friendly =
      target === "page" ? `Page ${activePageIndex + 1} background` :
      target === "header" ? "Header background" :
      `${SECTION_LABELS[target]} background`;

    const object: ShapeDesignObject = {
      id: `background-${genId()}`,
      type: "shape",
      shape: "rectangle",
      page: target === "header" ? 0 : activePageIndex,

      // Retained free-form geometry. Smart attachment overrides this only while attached.
      x: 40,
      y: 40,
      width: 220,
      height: 100,

      rotation: 0,
      opacity: 1,
      zIndex: maxZ + 1,
      layer,
      locked: false,
      hidden: false,
      name: friendly,

      fill: target === "page" ? "#faf7ff" : "#f5f3ff",
      strokeWidth: 0,
      borderRadius: target === "page" ? 0 : 10,
      attachment,
    };

    onDesignChange(upsertDesignObject(d, object));
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);
    activateNewDesignObject(object.id, object.page);
  }

  type SmartComponentPreset =
    | "sidebar-left"
    | "sidebar-right"
    | "header-accent"
    | "work-timeline"
    | "education-timeline"
    | "work-divider"
    | "education-divider"
    | "skills-divider"
    | "bio-divider"
    | "links-divider";

  function addSmartComponent(preset: SmartComponentPreset) {
    const existing = getDesignObjects(d);
    const accent = d.sectionHeading.color || "#7c3aed";

    const timelineSection: DesignSectionTarget | undefined =
      preset === "work-timeline" ? "work" :
      preset === "education-timeline" ? "education" :
      undefined;

    const dividerSection: DesignSectionTarget | undefined =
      preset === "work-divider" ? "work" :
      preset === "education-divider" ? "education" :
      preset === "skills-divider" ? "skills" :
      preset === "bio-divider" ? "bio" :
      preset === "links-divider" ? "links" :
      undefined;

    const smartKind: SmartDesignKind =
      preset.startsWith("sidebar-") ? "sidebar" :
      preset === "header-accent" ? "header-accent" :
      preset.endsWith("-timeline") ? "timeline" :
      "section-divider";

    const layer: DesignObjectLayer =
      smartKind === "timeline" || smartKind === "section-divider"
        ? "foreground"
        : "background";

    const maxZ = existing
      .filter(object => designObjectDefaultLayer(object) === layer)
      .reduce((max, object) => Math.max(max, object.zIndex ?? 0), 0);

    // `page` remains useful as the creation/selection anchor. Page-spanning smart
    // components such as sidebars ignore it when rendering and resolve on every page.
    const page = smartKind === "header-accent" ? 0 : activePageIndex;
    const side = preset === "sidebar-right" ? "right" : "left";
    const sectionId = timelineSection ?? dividerSection;

    const name =
      smartKind === "sidebar" ? `${side === "right" ? "Right" : "Left"} sidebar` :
      smartKind === "header-accent" ? "Header accent" :
      smartKind === "timeline" ? `${SECTION_LABELS[sectionId!]} timeline` :
      `${SECTION_LABELS[sectionId!]} divider`;

    const object: SmartDesignObject = {
      id: `smart-${genId()}`,
      type: "smart",
      smartKind,
      page,
      x: 0,
      y: 0,
      width: smartKind === "sidebar" ? 72 : 120,
      height: smartKind === "header-accent" ? 4 : smartKind === "section-divider" ? 2 : 80,
      rotation: 0,
      opacity: 1,
      zIndex: maxZ + 1,
      layer,
      locked: false,
      hidden: false,
      name,
      side: smartKind === "sidebar" ? side : undefined,
      sectionId,
      fill: smartKind === "sidebar" ? accent : smartKind === "timeline" ? accent : accent,
      stroke: accent,
      strokeWidth: smartKind === "timeline" || smartKind === "section-divider" ? 2 : undefined,
      dotSize: smartKind === "timeline" ? 8 : undefined,
      offset: smartKind === "timeline" ? 14 : smartKind === "header-accent" ? 8 : smartKind === "section-divider" ? 5 : undefined,
      borderRadius: 0,
    };

    onDesignChange(upsertDesignObject(d, object));
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);
    activateNewDesignObject(object.id, page);
  }

  function requestImageUpload(kind: ImageDesignKind, replaceObjectId?: string) {
    setPendingImageKind(kind);
    setPendingReplaceObjectId(replaceObjectId ?? null);
    setShapeMenuOpen(false);
    setBackgroundMenuOpen(false);
    setImageMenuOpen(false);
    setComponentMenuOpen(false);

    if (imageInputRef.current) {
      // Allows choosing the same local file again after replacing/deleting it.
      imageInputRef.current.value = "";
      imageInputRef.current.click();
    }
  }

  async function handleImageFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    try {
      const designObjects = getDesignObjects(d);
      const replacing = pendingReplaceObjectId
        ? designObjects.find(
            object => object.id === pendingReplaceObjectId && object.type === "image"
          ) as ImageDesignObject | undefined
        : undefined;

      const imageKind: ImageDesignKind = replacing?.imageKind ?? pendingImageKind;
      const imageCount = designObjects.filter(object => object.type === "image").length + (replacing ? 0 : 1);
      const loaded = await prepareResumeImageFile(
        file,
        imageKind,
        resumeImageTargetChars(imageCount, imageKind),
      );

      if (replacing) {
        const existing = replacing;
        if (existing) {
          const next: ImageDesignObject = {
            ...existing,
            src: loaded.src,
            alt: file.name,
            name: file.name || existing.name,
            intrinsicWidth: loaded.width,
            intrinsicHeight: loaded.height,
            cropX: 50,
            cropY: 50,
          };
          onDesignChange(applyLinkedDesignObjectChange(d, next));
          setPendingReplaceObjectId(null);
          activateNewDesignObject(next.id, next.page);
          return;
        }
      }

      const existing = getDesignObjects(d);
      const layer: DesignObjectLayer = "foreground";
      const maxZ = existing
        .filter(o => o.page === activePageIndex && (o.layer ?? "background") === layer)
        .reduce((m, o) => Math.max(m, o.zIndex ?? 0), 0);

      const aspect = loaded.width / Math.max(1, loaded.height);
      const isPhoto = imageKind === "photo";

      const width = isPhoto
        ? 112
        : aspect >= 1 ? 170 : clampDesignObject(118 * aspect, 80, 145);

      const height = isPhoto
        ? 112
        : aspect >= 1 ? clampDesignObject(170 / aspect, 78, 145) : 150;

      const onPageCount = existing.filter(o => o.page === activePageIndex).length;
      const offset = (onPageCount % 5) * 10;

      const object: ImageDesignObject = {
        id: `image-${genId()}`,
        type: "image",
        imageKind,
        page: activePageIndex,
        x: clampDesignObject((PAGE_W - width) / 2 + offset, 8, PAGE_W - width - 8),
        y: clampDesignObject(82 + offset, 8, PAGE_H - height - 8),
        width,
        height,
        rotation: 0,
        opacity: 1,
        zIndex: maxZ + 1,
        layer,
        locked: false,
        hidden: false,
        name: file.name || (isPhoto ? "Profile photo" : "Image"),

        src: loaded.src,
        alt: file.name,
        objectFit: isPhoto ? "cover" : "contain",
        cropX: 50,
        cropY: 50,
        mask: isPhoto ? "circle" : "square",
        borderRadius: isPhoto ? 999 : 0,
        borderColor: "#ffffff",
        borderWidth: isPhoto ? 2 : 0,
        shadow: isPhoto ? "soft" : "none",
        backgroundColor: "transparent",
        intrinsicWidth: loaded.width,
        intrinsicHeight: loaded.height,
      };

      onDesignChange(upsertDesignObject(d, object));
      setPendingReplaceObjectId(null);
      activateNewDesignObject(object.id, object.page);
    } catch (error) {
      console.error("Unable to add resume image", error);
    }
  }

  const selectedDesignObject = selectedDesignObjectId
    ? getDesignObjects(d).find(object => object.id === selectedDesignObjectId) ?? null
    : null;

  function changeSelectedDesignObject(partial: Partial<ResumeDesignObject>) {
    if (!selectedDesignObject) return;

    let next = { ...selectedDesignObject, ...partial } as ResumeDesignObject;

    // Moving between background and foreground layers should put the object at the
    // front of the destination layer instead of inheriting a meaningless old z-index.
    if (partial.layer && partial.layer !== (selectedDesignObject.layer ?? "background")) {
      const maxZ = getDesignObjects(d)
        .filter(o =>
          o.id !== selectedDesignObject.id &&
          (o.layer ?? (o.type === "image" ? "foreground" : "background")) === partial.layer
        )
        .reduce((m, o) => Math.max(m, o.zIndex ?? 0), 0);
      next = { ...next, zIndex: maxZ + 1 } as ResumeDesignObject;
    }

    onDesignChange(applyLinkedDesignObjectChange(d, next));
  }

  function toggleSelectedTextLayoutLink() {
    if (!selectedDesignObject || selectedDesignObject.type !== "text") return;
    const next = setLinkedTextLayoutUnlinked(
      selectedDesignObject,
      !selectedDesignObject.webLayoutUnlinked,
      PAGE_W,
      PAGE_H,
    );
    onDesignChange(upsertDesignObject(d, next));
  }

  function reorderSelectedDesignObject(direction: -1 | 1) {
    if (!selectedDesignObject) return;

    const all = getDesignObjects(d);
    const layer = selectedDesignObject.layer ?? "background";
    const group = all
      .filter(o => (o.layer ?? (o.type === "image" ? "foreground" : "background")) === layer)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    const index = group.findIndex(o => o.id === selectedDesignObject.id);
    const target = clampDesignObject(index + direction, 0, Math.max(0, group.length - 1));
    if (index < 0 || target === index) return;

    const reordered = [...group];
    const [moving] = reordered.splice(index, 1);
    reordered.splice(target, 0, moving);

    const zById = new Map(reordered.map((o, i) => [o.id, i + 1]));
    const next = all.map(o => zById.has(o.id) ? { ...o, zIndex: zById.get(o.id)! } as ResumeDesignObject : o);
    onDesignChange(withDesignObjects(d, next));
  }

  function moveSelectedDesignObjectToEdge(edge: "front" | "back") {
    if (!selectedDesignObject) return;

    const all = getDesignObjects(d);
    const layer = designObjectDefaultLayer(selectedDesignObject);
    const group = all
      .filter(object => designObjectDefaultLayer(object) === layer)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    const index = group.findIndex(object => object.id === selectedDesignObject.id);
    if (index < 0 || group.length < 2) return;

    const target = edge === "front" ? group.length - 1 : 0;
    if (index === target) return;

    const reordered = [...group];
    const [moving] = reordered.splice(index, 1);
    if (edge === "front") reordered.push(moving);
    else reordered.unshift(moving);

    const zById = new Map(reordered.map((object, i) => [object.id, i + 1]));
    onDesignChange(withDesignObjects(
      d,
      all.map(object =>
        zById.has(object.id)
          ? { ...object, zIndex: zById.get(object.id)! } as ResumeDesignObject
          : object
      ),
    ));
  }

  function deleteSelectedDesignObject() {
    const ids = selectedDesignObjectIds.length
      ? selectedDesignObjectIds
      : selectedDesignObjectId ? [selectedDesignObjectId] : [];
    if (ids.length === 0) return;

    const remove = new Set(ids);
    onDesignChange(withDesignObjects(
      d,
      normalizeDesignObjectLinks(
        getDesignObjects(d).filter(object => !remove.has(object.id))
      ),
    ));
    setSelectedDesignObjectId(null);
    setSelectedDesignObjectIds([]);
    setDesignObjectAnchorRect(null);
  }

  function selectDesignObjectFromLayers(object: ResumeDesignObject, additive: boolean) {
    setSelected(null); setAnchorRect(null);
    setRightKey(null); setRightAnchor(null);
    setBlockActionId(null); setBlockActionRect(null);
    setSelectedSubDragKey(null);

    const candidates = renderedDesignObjectElements(object.id);
    const preferred =
      candidates.find(el => el.dataset.designObjectPage === String(activePageIndex)) ??
      candidates[0];

    const page = Number(preferred?.dataset.designObjectPage ?? object.page);
    const resolvedPage = Number.isFinite(page) ? page : object.page;

    let nextIds: string[];
    if (!additive && object.groupId && !(object.type === "shape" && object.attachment)) {
      nextIds = getDesignObjects(d)
        .filter(item =>
          item.groupId === object.groupId &&
          designObjectMatchesPage(item, resolvedPage) &&
          !item.hidden
        )
        .map(item => item.id);
    } else if (additive && selectedDesignObjectPage === resolvedPage) {
      nextIds = selectedDesignObjectIds.includes(object.id)
        ? selectedDesignObjectIds.filter(id => id !== object.id)
        : [...selectedDesignObjectIds, object.id];
    } else {
      nextIds = [object.id];
    }

    if (nextIds.length === 0) {
      setSelectedDesignObjectId(null);
      setSelectedDesignObjectIds([]);
      setDesignObjectAnchorRect(null);
      return;
    }

    setActivePageIndex(resolvedPage);
    setSelectedDesignObjectPage(resolvedPage);
    setSelectedDesignObjectIds(nextIds);
    setSelectedDesignObjectId(nextIds.includes(object.id) ? object.id : nextIds[nextIds.length - 1]);
    refreshDesignObjectSelectionAnchor(nextIds, resolvedPage);
  }

  function toggleDesignObjectHidden(object: ResumeDesignObject) {
    const hidden = !object.hidden;
    const next = { ...object, hidden } as ResumeDesignObject;
    onDesignChange(upsertDesignObject(d, next));

    if (selectedDesignObjectIds.includes(object.id)) {
      if (hidden) {
        const remaining = selectedDesignObjectIds.filter(id => id !== object.id);
        setSelectedDesignObjectIds(remaining);
        setSelectedDesignObjectId(remaining[remaining.length - 1] ?? null);
        refreshDesignObjectSelectionAnchor(remaining, selectedDesignObjectPage);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const candidates = renderedDesignObjectElements(object.id);
          const preferred =
            candidates.find(el => el.dataset.designObjectPage === String(activePageIndex)) ??
            candidates[0];
          if (preferred) {
            const page = Number(preferred.dataset.designObjectPage ?? object.page);
            if (Number.isFinite(page)) setSelectedDesignObjectPage(page);
            refreshDesignObjectSelectionAnchor(
              selectedDesignObjectIds.includes(object.id)
                ? selectedDesignObjectIds
                : [...selectedDesignObjectIds, object.id],
              Number.isFinite(page) ? page : selectedDesignObjectPage,
            );
          }
        }));
      }
    }
  }

  function toggleDesignObjectLocked(object: ResumeDesignObject) {
    onDesignChange(upsertDesignObject(d, {
      ...object,
      locked: !object.locked,
    } as ResumeDesignObject));
  }

  function renameDesignObject(object: ResumeDesignObject, name: string) {
    onDesignChange(upsertDesignObject(d, {
      ...object,
      name: name.trim() || undefined,
    } as ResumeDesignObject));
  }

  function reorderDesignObjectsFromLayers(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;

    const all = getDesignObjects(d);
    const dragged = all.find(object => object.id === draggedId);
    const target = all.find(object => object.id === targetId);
    if (!dragged || !target) return;

    const draggedLayer = dragged.layer ?? (dragged.type === "image" ? "foreground" : "background");
    const targetLayer = designObjectDefaultLayer(target);
    if (draggedLayer !== targetLayer) return;

    // Panel order is TOP -> BOTTOM, i.e. high z-index -> low z-index.
    const panelOrder = all
      .filter(object =>
        designObjectDefaultLayer(object) === draggedLayer
      )
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

    const from = panelOrder.findIndex(object => object.id === draggedId);
    const to = panelOrder.findIndex(object => object.id === targetId);
    if (from < 0 || to < 0) return;

    const reordered = [...panelOrder];
    const [moving] = reordered.splice(from, 1);
    reordered.splice(to, 0, moving);

    const total = reordered.length;
    const zById = new Map(
      reordered.map((object, index) => [object.id, total - index])
    );

    const next = all.map(object =>
      zById.has(object.id)
        ? { ...object, zIndex: zById.get(object.id)! } as ResumeDesignObject
        : object
    );

    onDesignChange(withDesignObjects(d, next));
  }

  const selectedDesignObjects = getDesignObjects(d).filter(object =>
    selectedDesignObjectIds.includes(object.id)
  );

  const selectedObjectsCanLink = canLinkDesignObjects(selectedDesignObjects);
  const selectedSharedLinkId = selectedDesignObjects.length > 1 &&
    selectedDesignObjects[0]?.linkId &&
    selectedDesignObjects.every(object => object.linkId === selectedDesignObjects[0].linkId)
      ? selectedDesignObjects[0].linkId
      : null;

  function linkSelectedDesignObjects() {
    if (!selectedObjectsCanLink) return;

    const primary = selectedDesignObjects.find(object => object.id === selectedDesignObjectId)
      ?? selectedDesignObjects[selectedDesignObjects.length - 1];
    if (!primary) return;

    const linkId = `link-${genId()}`;
    const selectedIds = new Set(selectedDesignObjects.map(object => object.id));

    const next = getDesignObjects(d).map(object => {
      if (!selectedIds.has(object.id)) return object;
      const visuallySynced = copyLinkedDesignAppearance(primary, object);
      return { ...visuallySynced, linkId } as ResumeDesignObject;
    });

    onDesignChange(withDesignObjects(d, normalizeDesignObjectLinks(next)));
  }

  function unlinkDesignObjectIds(ids: string[]) {
    if (ids.length === 0) return;
    const remove = new Set(ids);
    const next = getDesignObjects(d).map(object => {
      if (!remove.has(object.id) || !object.linkId) return object;
      const unlinked = { ...object } as ResumeDesignObject;
      delete unlinked.linkId;
      return unlinked;
    });
    onDesignChange(withDesignObjects(d, normalizeDesignObjectLinks(next)));
  }

  function unlinkSelectedDesignObjects() {
    unlinkDesignObjectIds(selectedDesignObjectIds);
  }

  function unlinkPrimaryDesignObject() {
    if (!selectedDesignObjectId) return;
    unlinkDesignObjectIds([selectedDesignObjectId]);
  }

  function selectedEditableDesignObjects(): ResumeDesignObject[] {
    return selectedDesignObjects.filter(object =>
      !object.hidden &&
      !object.locked &&
      !designObjectIsResumeDriven(object) &&
      designObjectMatchesPage(object, selectedDesignObjectPage)
    );
  }

  function commitSelectedGeometry(nextById: Map<string, ResumeDesignObject>) {
    const next = getDesignObjects(d).map(object => nextById.get(object.id) ?? object);
    onDesignChange(withDesignObjects(d, next));
    refreshDesignObjectSelectionAnchor(selectedDesignObjectIds, selectedDesignObjectPage);
  }

  function alignSelectedDesignObjects(mode: DesignAlignMode) {
    const editable = selectedEditableDesignObjects();
    if (editable.length < 2) return;

    const bounds = unionDesignRects(editable.map(designRectForObject));
    if (!bounds) return;

    const nextById = new Map<string, ResumeDesignObject>();

    editable.forEach(object => {
      let x = object.x;
      let y = object.y;

      if (mode === "left") x = bounds.x;
      if (mode === "center") x = bounds.x + bounds.w / 2 - object.width / 2;
      if (mode === "right") x = bounds.x + bounds.w - object.width;
      if (mode === "top") y = bounds.y;
      if (mode === "middle") y = bounds.y + bounds.h / 2 - object.height / 2;
      if (mode === "bottom") y = bounds.y + bounds.h - object.height;

      nextById.set(object.id, {
        ...object,
        x: clampDesignObject(x, 0, PAGE_W - object.width),
        y: clampDesignObject(y, 0, PAGE_H - object.height),
      } as ResumeDesignObject);
    });

    commitSelectedGeometry(nextById);
  }

  function distributeSelectedDesignObjects(axis: "horizontal" | "vertical") {
    const editable = selectedEditableDesignObjects();
    if (editable.length < 3) return;

    const sorted = [...editable].sort((a, b) =>
      axis === "horizontal" ? a.x - b.x : a.y - b.y
    );

    const nextById = new Map<string, ResumeDesignObject>();

    if (axis === "horizontal") {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = (last.x + last.width) - first.x;
      const occupied = sorted.reduce((sum, object) => sum + object.width, 0);
      const gap = (span - occupied) / (sorted.length - 1);

      let cursor = first.x;
      sorted.forEach((object, index) => {
        const x = index === 0 ? first.x : index === sorted.length - 1 ? last.x : cursor;
        nextById.set(object.id, { ...object, x } as ResumeDesignObject);
        cursor = x + object.width + gap;
      });
    } else {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = (last.y + last.height) - first.y;
      const occupied = sorted.reduce((sum, object) => sum + object.height, 0);
      const gap = (span - occupied) / (sorted.length - 1);

      let cursor = first.y;
      sorted.forEach((object, index) => {
        const y = index === 0 ? first.y : index === sorted.length - 1 ? last.y : cursor;
        nextById.set(object.id, { ...object, y } as ResumeDesignObject);
        cursor = y + object.height + gap;
      });
    }

    commitSelectedGeometry(nextById);
  }

  function groupSelectedDesignObjects() {
    const groupable = selectedDesignObjects.filter(object =>
      !object.hidden &&
      !designObjectIsResumeDriven(object) &&
      designObjectMatchesPage(object, selectedDesignObjectPage)
    );
    if (groupable.length < 2) return;

    const groupId = `group-${genId()}`;
    const ids = new Set(groupable.map(object => object.id));
    onDesignChange(withDesignObjects(
      d,
      getDesignObjects(d).map(object =>
        ids.has(object.id)
          ? { ...object, groupId } as ResumeDesignObject
          : object
      ),
    ));
  }

  function ungroupSelectedDesignObjects() {
    const groupIds = new Set(
      selectedDesignObjects.map(object => object.groupId).filter((id): id is string => !!id)
    );
    if (groupIds.size === 0) return;

    onDesignChange(withDesignObjects(
      d,
      getDesignObjects(d).map(object => {
        if (!object.groupId || !groupIds.has(object.groupId)) return object;
        const next = { ...object } as ResumeDesignObject;
        delete next.groupId;
        return next;
      }),
    ));
  }

  function toggleSelectedDesignObjectLock() {
    if (selectedDesignObjects.length === 0) return;
    const allLocked = selectedDesignObjects.every(object => !!object.locked);
    const ids = new Set(selectedDesignObjects.map(object => object.id));

    onDesignChange(withDesignObjects(
      d,
      getDesignObjects(d).map(object =>
        ids.has(object.id)
          ? { ...object, locked: !allLocked } as ResumeDesignObject
          : object
      ),
    ));
  }

  function nudgeSelectedDesignObjects(dx: number, dy: number) {
    const editable = selectedEditableDesignObjects();
    if (editable.length === 0) return;

    const bounds = unionDesignRects(editable.map(designRectForObject));
    if (!bounds) return;

    const boundedDx = clampDesignObject(dx, -bounds.x, PAGE_W - (bounds.x + bounds.w));
    const boundedDy = clampDesignObject(dy, -bounds.y, PAGE_H - (bounds.y + bounds.h));

    const byId = new Map<string, ResumeDesignObject>();
    editable.forEach(object => {
      byId.set(object.id, {
        ...object,
        x: object.x + boundedDx,
        y: object.y + boundedDy,
      } as ResumeDesignObject);
    });

    commitSelectedGeometry(byId);
  }

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable='true']")) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedDesignObjectIds.length > 0) {
        e.preventDefault();
        deleteSelectedDesignObject();
        return;
      }

      if (selectedDesignObjectIds.length > 0 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") nudgeSelectedDesignObjects(-step, 0);
        if (e.key === "ArrowRight") nudgeSelectedDesignObjects(step, 0);
        if (e.key === "ArrowUp") nudgeSelectedDesignObjects(0, -step);
        if (e.key === "ArrowDown") nudgeSelectedDesignObjects(0, step);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedDesignObjectIds, selectedDesignObjectPage, d]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume text styling callbacks. These are deliberately kept in ResumeCanvas so
  // the floating ContextToolbar/StylePopover always edit the current merged design.
  function changeTs(key: SelectableKey, partial: Partial<TextStyle>) {
    const role = visualRoleForDesignKey(key);
    if (!role) {
      const current = d[key] as TextStyle & Record<string, unknown>;
      onDesignChange({ ...d, [key]: { ...current, ...partial } });
      return;
    }

    onDesignChange(applyPdfEditorTextStylePatch(d, role, partial));
  }

  function toggleTextStyleLink(key: SelectableKey) {
    const role = visualRoleForDesignKey(key);
    if (!role) return;
    onDesignChange(setWebTextLinked(d, role, !isWebTextLinked(d, role)));
  }

  function changeBlock(id: string, partial: Partial<LayoutOverride>) {
    const existing = d.layoutOverrides?.[id] ?? {};
    const next: LayoutOverride = { ...existing, ...partial };
    if (!next.flowDisplacementY) delete next.flowDisplacementY;
    if (!next.visualDx)          delete next.visualDx;
    if (!next.visualDy)          delete next.visualDy;
    if (!next.rotation)          delete next.rotation;
    if (!next.width)             delete next.width;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}), [id]: next };
    if (!Object.keys(next).length) delete layoutOverrides[id];
    onDesignChange({ ...d, layoutOverrides });
  }

  // The regular text toolbar needs to know which repeated SubDrag owns the text
  // selection so it can surface the same linked/unlinked control used by the compact
  // logo/description toolbar. Phase 7 extends this to education as well as work.
  function linkKeysForSubDrag(key: string): string[] {
    const work = key.match(/^work\.[^.]+\.(logo|title|org|date|body)$/);
    if (work) {
      const part = work[1];
      return data.workEntries.map(entry => `work.${entry.id}.${part}`);
    }

    const edu = key.match(/^edu\.[^.]+\.(title|org|date)$/);
    if (edu) {
      const part = edu[1];
      return data.education.map(entry => `edu.${entry.id}.${part}`);
    }

    const project = key.match(
      /^projects\.[^.]+\.(title|tech|body|github|live)$/,
    );
    if (project) {
      const part = project[1];
      return getResumeProjects(data).map(
        entry => `projects.${entry.id}.${part}`,
      );
    }

    return [];
  }

  function linkLabelForSubDrag(key: string): string {
    if (key.startsWith("edu.")) {
      if (key.endsWith(".title")) return "School";
      if (key.endsWith(".org")) return "Degree";
      if (key.endsWith(".date")) return "Education date";
    }

    if (key.startsWith("projects.")) {
      if (key.endsWith(".title")) return "Project title";
      if (key.endsWith(".tech")) return "Project tech";
      if (key.endsWith(".body")) return "Project description";
      if (key.endsWith(".github")) return "GitHub link";
      if (key.endsWith(".live")) return "Live project link";
    }

    if (key.endsWith(".logo")) return "Company logo";
    if (key.endsWith(".title")) return "Job title";
    if (key.endsWith(".org")) return "Company";
    if (key.endsWith(".date")) return "Date";
    if (key.endsWith(".body")) return "Description";
    return "Element";
  }

  function cleanLinkOverride(value: LinkableLayoutOverride): LinkableLayoutOverride {
    const next: LinkableLayoutOverride = { ...value };
    if (!next.visualDx) delete next.visualDx;
    if (!next.visualDy) delete next.visualDy;
    if (!next.rotation) delete next.rotation;
    if (!next.width) delete next.width;
    // linked=true is the default, so persist only the explicit opt-out.
    if (next.linked !== false) delete next.linked;
    return next;
  }

  function toggleSubDragLink(key: string) {
    const keys = linkKeysForSubDrag(key);
    if (keys.length <= 1) return;

    const layoutOverrides = { ...(d.layoutOverrides ?? {}) };
    const existing = linkedOverride(layoutOverrides[key]) ?? {};
    const isCurrentlyLinked = existing.linked !== false;

    const source = (() => {
      for (const peerKey of keys) {
        if (peerKey === key) continue;
        const candidate = linkedOverride(d.layoutOverrides?.[peerKey]);
        if (candidate && candidate.linked !== false) return candidate;
      }
      return undefined;
    })();

    if (isCurrentlyLinked) {
      // Freeze the effective shared geometry before detaching so nothing jumps.
      layoutOverrides[key] = cleanLinkOverride({
        ...existing,
        visualDx: existing.visualDx ?? source?.visualDx,
        visualDy: existing.visualDy ?? source?.visualDy,
        rotation: existing.rotation ?? source?.rotation,
        width: existing.width ?? source?.width,
        linked: false,
      });
    } else {
      // Relinking intentionally adopts the first still-linked peer's geometry.
      const next = cleanLinkOverride({
        ...existing,
        visualDx: source?.visualDx,
        visualDy: source?.visualDy,
        rotation: source?.rotation,
        width: source?.width,
        linked: true,
      });
      if (Object.keys(next).length) layoutOverrides[key] = next;
      else delete layoutOverrides[key];
    }

    onDesignChange({ ...d, layoutOverrides });
  }

  const selectedLinkControl = (() => {
    if (!selectedSubDragKey) return undefined;
    const keys = linkKeysForSubDrag(selectedSubDragKey);
    if (keys.length <= 1) return undefined;

    const own = linkedOverride(d.layoutOverrides?.[selectedSubDragKey]);
    const linked = own?.linked !== false;
    const count = keys.filter(key =>
      key === selectedSubDragKey || linkedOverride(d.layoutOverrides?.[key])?.linked !== false
    ).length;

    return {
      label: linkLabelForSubDrag(selectedSubDragKey),
      linked,
      count,
      onToggle: () => toggleSubDragLink(selectedSubDragKey),
    };
  })();

  const ctx: SelectCtx = {
    selected,
    hovered,
    onSelect:      handleSelect,
    onHover:       setHovered,
    onClearSelect: clearSelection,
    onRightClick:  handleRightClick,
  };

  return (
    <div onClick={handleCanvasClickAway}>

      {/* Status bar */}
      <div style={{
        height: 22, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10.5,
        color: hovered ? "#7c3aed" : "#9ca3af",
        fontWeight: hovered ? 600 : 400,
        fontFamily: "system-ui, sans-serif",
        transition: "color 0.15s",
        marginBottom: 6,
        userSelect: "none",
      }}>
          {hovered
          ? `${ELEMENT_LABELS[hovered]} - click · right-click for more · double-click to edit`
          : <>
              Drag · click to format · right-click for more · double-click to edit
              {d.layoutOverrides && Object.keys(d.layoutOverrides).length > 0 && (
                <span
                  style={{ marginLeft: 10, cursor: "pointer", textDecoration: "underline", color: "#7c3aed" }}
                  onClick={e => {
                    e.stopPropagation();
                    onDesignChange({ ...d, layoutOverrides: undefined });
                  }}
                >
                  Reset layout
                </span>
              )}
            </>}
      </div>

      {/* Phase 6 toolbar: keep the canvas calm by grouping creation and arrangement
          tools. Text formatting remains contextual on-canvas and is intentionally not
          duplicated here. */}
      <div
        style={{
          minHeight: 36,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontFamily: "system-ui, sans-serif",
          userSelect: "none",
          paddingBottom: 1,
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            minWidth: "max-content",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {/* One creation menu replaces separate Shape / Image / Components buttons. */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setBackgroundMenuOpen(false);
                setImageMenuOpen(false);
                setComponentMenuOpen(false);
                setArrangeMenuOpen(false);
                setMoreMenuOpen(false);
                setLayersPanelOpen(false);
                setShapeMenuOpen(value => !value);
              }}
              aria-expanded={shapeMenuOpen}
              style={{
                height: 31,
                padding: "0 11px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 7,
                border: shapeMenuOpen ? "1px solid #c4b5fd" : "1px solid #ddd6fe",
                background: shapeMenuOpen ? "#faf5ff" : "#fff",
                color: "#6d28d9",
                fontSize: 11,
                fontWeight: 650,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Plus size={13} />
              Add
              <ChevronDown size={12} />
            </button>

            {shapeMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 35,
                  left: 0,
                  zIndex: 10002,
                  width: 244,
                  maxHeight: "min(460px, calc(100vh - 130px))",
                  overflowY: "auto",
                  padding: 6,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 9,
                  boxShadow: "0 10px 28px rgba(15,23,42,0.16)",
                }}
              >
                <div style={{ padding: "4px 7px 5px", fontSize: 8.5, fontWeight: 750, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Text
                </div>
                <button
                  type="button"
                  onClick={addTextBox}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <FileText size={14} />
                  Text box
                </button>

                <div style={{ marginTop: 4, padding: "5px 7px", borderTop: "1px solid #f1f5f9", fontSize: 8.5, fontWeight: 750, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Shapes
                </div>
                {[
                  { type: "rectangle" as const, label: "Rectangle", icon: <Square size={14} /> },
                  { type: "ellipse" as const, label: "Circle", icon: <Circle size={14} /> },
                  { type: "line" as const, label: "Line", icon: <Minus size={15} /> },
                ].map(item => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => addShape(item.type)}
                    style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}

                <div style={{ marginTop: 4, padding: "5px 7px", borderTop: "1px solid #f1f5f9", fontSize: 8.5, fontWeight: 750, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Images
                </div>
                <button
                  type="button"
                  onClick={() => requestImageUpload("photo")}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <User size={14} />
                  Profile photo
                </button>
                <button
                  type="button"
                  onClick={() => requestImageUpload("image")}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <ImageIcon size={14} />
                  Image / graphic
                </button>

                <div style={{ marginTop: 4, padding: "5px 7px", borderTop: "1px solid #f1f5f9", fontSize: 8.5, fontWeight: 750, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Page components
                </div>
                {[
                  ["sidebar-left", "Left sidebar"],
                  ["sidebar-right", "Right sidebar"],
                  ["header-accent", "Header accent bar"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => addSmartComponent(key as SmartComponentPreset)}
                    style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 10.5, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Square size={12} />
                    {label}
                  </button>
                ))}

                <div style={{ marginTop: 4, padding: "5px 7px", borderTop: "1px solid #f1f5f9", fontSize: 8.5, fontWeight: 750, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Resume-aware components
                </div>
                {[
                  ["work-timeline", "Experience timeline"],
                  ["education-timeline", "Education timeline"],
                  ["work-divider", "Experience divider"],
                  ["education-divider", "Education divider"],
                  ["skills-divider", "Skills divider"],
                  ["bio-divider", "Summary divider"],
                  ["links-divider", "Links divider"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => addSmartComponent(key as SmartComponentPreset)}
                    style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 10.5, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {key.endsWith("timeline") ? <Circle size={11} /> : <Minus size={13} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Background stays top-level because it is a frequent, conceptually distinct action. */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setShapeMenuOpen(false);
                setImageMenuOpen(false);
                setComponentMenuOpen(false);
                setArrangeMenuOpen(false);
                setMoreMenuOpen(false);
                setLayersPanelOpen(false);
                setBackgroundMenuOpen(value => !value);
              }}
              aria-expanded={backgroundMenuOpen}
              style={{
                height: 31,
                padding: "0 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 7,
                border: backgroundMenuOpen ? "1px solid #c4b5fd" : "1px solid #e2e8f0",
                background: backgroundMenuOpen ? "#faf5ff" : "#fff",
                color: backgroundMenuOpen ? "#6d28d9" : "#475569",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Square size={13} />
              Background
              <ChevronDown size={12} />
            </button>

            {backgroundMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 35,
                  left: 0,
                  zIndex: 10002,
                  width: 184,
                  padding: 5,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                }}
              >
                {[
                  { key: "page" as const, label: `Page ${activePageIndex + 1}` },
                  { key: "header" as const, label: "Header" },
                  { key: "work" as const, label: "Experience" },
                  { key: "education" as const, label: "Education" },
                  { key: "skills" as const, label: "Skills" },
                  { key: "bio" as const, label: "Summary" },
                  { key: "links" as const, label: "Links" },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => addSmartBackground(item.key)}
                    style={{ width: "100%", height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Square size={12} />
                    {item.label} background
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Arrange groups layers and selection-dependent object ordering/grouping. */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setShapeMenuOpen(false);
                setBackgroundMenuOpen(false);
                setImageMenuOpen(false);
                setComponentMenuOpen(false);
                setMoreMenuOpen(false);
                if (layersPanelOpen) {
                  setLayersPanelOpen(false);
                  setArrangeMenuOpen(true);
                } else {
                  setArrangeMenuOpen(value => !value);
                }
              }}
              aria-expanded={arrangeMenuOpen || layersPanelOpen}
              style={{
                height: 31,
                padding: "0 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 7,
                border: arrangeMenuOpen || layersPanelOpen ? "1px solid #c4b5fd" : "1px solid #e2e8f0",
                background: arrangeMenuOpen || layersPanelOpen ? "#faf5ff" : "#fff",
                color: arrangeMenuOpen || layersPanelOpen ? "#6d28d9" : "#475569",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Layers3 size={13} />
              Arrange
              {getDesignObjects(d).length > 0 && (
                <span
                  style={{
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: arrangeMenuOpen || layersPanelOpen ? "#ede9fe" : "#f1f5f9",
                    color: arrangeMenuOpen || layersPanelOpen ? "#7c3aed" : "#64748b",
                    fontSize: 8.5,
                    fontWeight: 700,
                  }}
                >
                  {getDesignObjects(d).length}
                </span>
              )}
              <ChevronDown size={12} />
            </button>

            {arrangeMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 35,
                  left: 0,
                  zIndex: 10002,
                  width: 206,
                  padding: 5,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setArrangeMenuOpen(false);
                    setLayersPanelOpen(true);
                  }}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 11, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Layers3 size={13} />
                  Layers
                  <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 9 }}>{getDesignObjects(d).length}</span>
                </button>

                <div style={{ margin: "4px 3px", borderTop: "1px solid #f1f5f9" }} />
                {[
                  { label: "Bring forward", icon: <ArrowUp size={13} />, enabled: selectedDesignObjectIds.length === 1, action: () => reorderSelectedDesignObject(1) },
                  { label: "Send backward", icon: <ArrowDown size={13} />, enabled: selectedDesignObjectIds.length === 1, action: () => reorderSelectedDesignObject(-1) },
                  { label: "Bring to front", icon: <ChevronsUp size={13} />, enabled: selectedDesignObjectIds.length === 1, action: () => moveSelectedDesignObjectToEdge("front") },
                  { label: "Send to back", icon: <ChevronsDown size={13} />, enabled: selectedDesignObjectIds.length === 1, action: () => moveSelectedDesignObjectToEdge("back") },
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!item.enabled}
                    onClick={() => {
                      item.action();
                      setArrangeMenuOpen(false);
                    }}
                    style={{ width: "100%", height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: item.enabled ? "#334155" : "#cbd5e1", fontSize: 10.5, cursor: item.enabled ? "pointer" : "default", textAlign: "left" }}
                    onMouseEnter={e => { if (item.enabled) e.currentTarget.style.background = "#f8fafc"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}

                <div style={{ margin: "4px 3px", borderTop: "1px solid #f1f5f9" }} />
                <button
                  type="button"
                  disabled={selectedDesignObjectIds.length < 2}
                  onClick={() => {
                    groupSelectedDesignObjects();
                    setArrangeMenuOpen(false);
                  }}
                  style={{ width: "100%", height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: selectedDesignObjectIds.length >= 2 ? "#334155" : "#cbd5e1", fontSize: 10.5, cursor: selectedDesignObjectIds.length >= 2 ? "pointer" : "default", textAlign: "left" }}
                >
                  <Layers3 size={13} />
                  Group selection
                </button>
                <button
                  type="button"
                  disabled={!selectedDesignObjects.some(object => !!object.groupId)}
                  onClick={() => {
                    ungroupSelectedDesignObjects();
                    setArrangeMenuOpen(false);
                  }}
                  style={{ width: "100%", height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: selectedDesignObjects.some(object => !!object.groupId) ? "#334155" : "#cbd5e1", fontSize: 10.5, cursor: selectedDesignObjects.some(object => !!object.groupId) ? "pointer" : "default", textAlign: "left" }}
                >
                  <Unlink2 size={13} />
                  Ungroup selection
                </button>
                <button
                  type="button"
                  disabled={selectedDesignObjectIds.length === 0}
                  onClick={() => {
                    toggleSelectedDesignObjectLock();
                    setArrangeMenuOpen(false);
                  }}
                  style={{ width: "100%", height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: selectedDesignObjectIds.length > 0 ? "#334155" : "#cbd5e1", fontSize: 10.5, cursor: selectedDesignObjectIds.length > 0 ? "pointer" : "default", textAlign: "left" }}
                >
                  {selectedDesignObjects.length > 0 && selectedDesignObjects.every(object => !!object.locked)
                    ? <Unlock size={13} />
                    : <Lock size={13} />}
                  {selectedDesignObjects.length > 0 && selectedDesignObjects.every(object => !!object.locked)
                    ? "Unlock selection"
                    : "Lock selection"}
                </button>
              </div>
            )}

            {layersPanelOpen && (
              <LayersPanel
                objects={getDesignObjects(d)}
                activePage={activePageIndex}
                selectedIds={selectedDesignObjectIds}
                onSelect={selectDesignObjectFromLayers}
                onToggleHidden={toggleDesignObjectHidden}
                onToggleLocked={toggleDesignObjectLocked}
                onRename={renameDesignObject}
                onReorder={reorderDesignObjectsFromLayers}
                onClose={() => setLayersPanelOpen(false)}
              />
            )}
          </div>

          {/* Editor zoom - intentionally separate from PDF design/export state. */}
          <div
            style={{
              height: 31,
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid #e2e8f0",
              borderRadius: 7,
              background: "#fff",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              overflow: "hidden",
              flexShrink: 0,
            }}
            title="PDF canvas zoom - editor only"
          >
            <button
              type="button"
              aria-label="Zoom PDF canvas out"
              title="Zoom out"
              disabled={canvasZoom <= PDF_CANVAS_ZOOM_MIN + 0.001}
              onClick={() =>
                setCanvasZoom(current =>
                  clampPdfCanvasZoom(
                    Math.round((current - PDF_CANVAS_ZOOM_STEP) * 10) / 10,
                  ),
                )
              }
              style={{
                width: 30,
                height: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                borderRight: "1px solid #e2e8f0",
                background: "transparent",
                color: canvasZoom <= PDF_CANVAS_ZOOM_MIN + 0.001 ? "#cbd5e1" : "#475569",
                cursor: canvasZoom <= PDF_CANVAS_ZOOM_MIN + 0.001 ? "default" : "pointer",
              }}
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              onClick={() => setCanvasZoom(1)}
              title="Fit canvas to available width"
              style={{
                minWidth: 50,
                height: "100%",
                padding: "0 7px",
                border: "none",
                borderRight: "1px solid #e2e8f0",
                background: canvasZoom === 1 ? "#faf5ff" : "transparent",
                color: canvasZoom === 1 ? "#6d28d9" : "#475569",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(canvasZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom PDF canvas in"
              title="Zoom in"
              disabled={canvasZoom >= PDF_CANVAS_ZOOM_MAX - 0.001}
              onClick={() =>
                setCanvasZoom(current =>
                  clampPdfCanvasZoom(
                    Math.round((current + PDF_CANVAS_ZOOM_STEP) * 10) / 10,
                  ),
                )
              }
              style={{
                width: 30,
                height: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                color: canvasZoom >= PDF_CANVAS_ZOOM_MAX - 0.001 ? "#cbd5e1" : "#475569",
                cursor: canvasZoom >= PDF_CANVAS_ZOOM_MAX - 0.001 ? "default" : "pointer",
              }}
            >
              <Plus size={13} />
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="More PDF canvas actions"
              title="More canvas actions"
              onClick={() => {
                setShapeMenuOpen(false);
                setBackgroundMenuOpen(false);
                setArrangeMenuOpen(false);
                setLayersPanelOpen(false);
                setImageMenuOpen(false);
                setComponentMenuOpen(false);
                setMoreMenuOpen(value => !value);
              }}
              style={{
                width: 32,
                height: 31,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                border: moreMenuOpen ? "1px solid #c4b5fd" : "1px solid #e2e8f0",
                background: moreMenuOpen ? "#faf5ff" : "#fff",
                color: moreMenuOpen ? "#6d28d9" : "#475569",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                flexShrink: 0,
              }}
            >
              <MoreHorizontal size={15} />
            </button>

            {moreMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 35,
                  right: 0,
                  zIndex: 10002,
                  width: 174,
                  padding: 5,
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                }}
              >
                <button
                  type="button"
                  disabled={!d.layoutOverrides || Object.keys(d.layoutOverrides).length === 0}
                  onClick={() => {
                    if (d.layoutOverrides && Object.keys(d.layoutOverrides).length > 0) {
                      onDesignChange({ ...d, layoutOverrides: undefined });
                    }
                    setMoreMenuOpen(false);
                  }}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: d.layoutOverrides && Object.keys(d.layoutOverrides).length > 0 ? "#334155" : "#cbd5e1", fontSize: 10.5, cursor: d.layoutOverrides && Object.keys(d.layoutOverrides).length > 0 ? "pointer" : "default", textAlign: "left" }}
                >
                  <FileText size={13} />
                  Reset layout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearSelection();
                    setMoreMenuOpen(false);
                  }}
                  style={{ width: "100%", height: 31, display: "flex", alignItems: "center", gap: 8, padding: "0 8px", border: "none", borderRadius: 6, background: "transparent", color: "#334155", fontSize: 10.5, cursor: "pointer", textAlign: "left" }}
                >
                  <X size={13} />
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          aria-label="Upload resume image"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0] ?? null;
            void handleImageFile(file);
          }}
        />

        <span
          style={{
            flexShrink: 0,
            fontSize: 9.5,
            color: "#94a3b8",
            whiteSpace: "nowrap",
          }}
        >
          Page {activePageIndex + 1} · Shift-click to multi-select
        </span>
      </div>

      {/* Paginated resume pages - FreeFormLayout owns the physical page shells so
          it can add page 2/3/etc. as soon as measured flow exceeds the current page. */}
      <div
        style={{
          width: "100%",
          minWidth: Math.max(containerWidth, displayedPageWidth),
          display: "flex",
          justifyContent:
            displayedPageWidth <= containerWidth ? "center" : "flex-start",
        }}
      >
        <FreeFormLayout
          data={data}
          d={d}
          ctx={ctx}
          setData={onDataChange}
          scale={scale}
          pageW={PAGE_W}
          pageH={PAGE_H}
          remeasureKey={remeasureKey}
          onDesignChange={onDesignChange}
          onHoverBlock={setHoveredBlock}
          onBlockClick={handleBlockClick}
          selectedDesignObjectId={selectedDesignObjectId}
          selectedDesignObjectIds={selectedDesignObjectIds}
          selectedDesignObjectPage={selectedDesignObjectPage}
          onSelectDesignObject={selectDesignObject}
          onDesignObjectRectChange={setDesignObjectAnchorRect}
          onActivePageChange={setActivePageIndex}
        />
      </div>

      {/* Multi-selection toolbar - align/distribute/group without touching resume flow. */}
      {selectedDesignObjectIds.length > 1 && designObjectAnchorRect && createPortal(
        <MultiDesignObjectToolbar
          count={selectedDesignObjectIds.length}
          anchorRect={designObjectAnchorRect}
          canDistribute={selectedEditableDesignObjects().length >= 3}
          canLink={selectedObjectsCanLink}
          isLinkedSet={!!selectedSharedLinkId}
          hasGroup={selectedDesignObjects.some(object => !!object.groupId)}
          allLocked={selectedDesignObjects.length > 0 && selectedDesignObjects.every(object => !!object.locked)}
          onAlign={alignSelectedDesignObjects}
          onDistribute={distributeSelectedDesignObjects}
          onLink={linkSelectedDesignObjects}
          onUnlink={unlinkSelectedDesignObjects}
          onGroup={groupSelectedDesignObjects}
          onUngroup={ungroupSelectedDesignObjects}
          onToggleLock={toggleSelectedDesignObjectLock}
          onDelete={deleteSelectedDesignObject}
        />,
        document.body
      )}

      {/* Design-object toolbar - shapes/images stay isolated from resume text styling. */}
      {selectedDesignObject && selectedDesignObjectIds.length === 1 && designObjectAnchorRect && createPortal(
        <DesignObjectToolbar
          object={selectedDesignObject}
          anchorRect={designObjectAnchorRect}
          linkedCount={selectedDesignObject.linkId
            ? linkedDesignObjectPeers(d, selectedDesignObject).length
            : 0}
          onChange={changeSelectedDesignObject}
          onUnlink={unlinkPrimaryDesignObject}
          onBringForward={() => reorderSelectedDesignObject(1)}
          onSendBackward={() => reorderSelectedDesignObject(-1)}
          onDelete={deleteSelectedDesignObject}
          onReplaceImage={selectedDesignObject.type === "image"
            ? () => requestImageUpload(
                (selectedDesignObject as ImageDesignObject).imageKind ?? "image",
                selectedDesignObject.id,
              )
            : undefined}
          onToggleTextLayoutLink={selectedDesignObject.type === "text"
            ? toggleSelectedTextLayoutLink
            : undefined}
        />,
        document.body
      )}

      {/* Context toolbar - single click */}
      {selected && anchorRect && createPortal(
        <ContextToolbar
          elementKey={selected}
          design={d}
          anchorRect={anchorRect}
          onChangeTs={changeTs}
          linkControl={selectedLinkControl}
          styleLinked={!!visualRoleForDesignKey(selected) && isWebTextLinked(d, visualRoleForDesignKey(selected)!)}
          onToggleStyleLink={() => toggleTextStyleLink(selected)}
          onOpenFull={() => handleRightClick(selected, { getBoundingClientRect: () => anchorRect } as HTMLElement)}
          onClose={clearSelection}
        />,
        document.body
      )}

      {/* Block action bar - click on an entry section */}
      {blockActionId && blockActionRect && (() => {
        const isEntry = blockActionId.startsWith("work.") || blockActionId.startsWith("edu.");
        const prefix  = blockActionId + ".";
        const hasChild = isEntry && Object.keys(d.layoutOverrides ?? {}).some(k => k.startsWith(prefix));
        if (!hasChild) return null;
        return createPortal(
          <BlockActionBar
            anchorRect={blockActionRect}
            onSnapBack={() => clearChildOverridesFor(blockActionId)}
            onClose={() => { setBlockActionId(null); setBlockActionRect(null); }}
          />,
          document.body
        );
      })()}

      {/* Full style popover - right-click or ⋯ */}
      {rightKey && rightAnchor && createPortal(
        <StylePopover
          elementKey={rightKey}
          design={d}
          anchorRect={rightAnchor}
          onChangeTs={changeTs}
          onChangeDesign={partial => onDesignChange({ ...d, ...partial })}
          styleLinked={!!visualRoleForDesignKey(rightKey) && isWebTextLinked(d, visualRoleForDesignKey(rightKey)!)}
          onToggleStyleLink={() => toggleTextStyleLink(rightKey)}
          onClose={clearSelection}
          blockId={rightBlockId}
          onChangeBlock={changeBlock}
        />,
        document.body
      )}
    </div>
  );
}

// ── Font family helpers ───────────────────────────────────────────────────────

type FontBase = "Helvetica" | "Times" | "Courier";

function parseFontFamily(ff: FontFamily): { base: FontBase; bold: boolean; italic: boolean } {
  if (ff.startsWith("Helvetica")) return { base: "Helvetica", bold: ff.includes("Bold"), italic: ff.includes("Oblique") };
  if (ff.startsWith("Times"))     return { base: "Times",     bold: ff.includes("Bold"), italic: ff.includes("Italic") };
  return { base: "Courier", bold: ff.includes("Bold"), italic: ff.includes("Oblique") };
}

function composeFontFamily(base: FontBase, bold: boolean, italic: boolean): FontFamily {
  if (base === "Helvetica") {
    if (bold && italic) return "Helvetica-BoldOblique";
    if (bold)           return "Helvetica-Bold";
    if (italic)         return "Helvetica-Oblique";
    return "Helvetica";
  }
  if (base === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold)           return "Times-Bold";
    if (italic)         return "Times-Italic";
    return "Times-Roman";
  }
  if (bold && italic) return "Courier-BoldOblique";
  if (bold)           return "Courier-Bold";
  if (italic)         return "Courier-Oblique";
  return "Courier";
}

// ── Context Toolbar (single-click) ────────────────────────────────────────────
// Compact floating bar for the most common formatting actions.
// The ⋯ button opens the full advanced StylePopover.

function AlignIcon({ align, size = 14 }: { align: "left" | "center" | "right"; size?: number }) {
  const w = size, h = size;
  const full = w, half = Math.round(w * 0.6);
  const lx = align === "right" ? w - half : 0;
  const cx = align === "center" ? Math.round((w - half) / 2) : align === "right" ? w - half : 0;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="currentColor" style={{ display: "block" }}>
      <rect x={0}  y={0}                    width={full} height={1.5} rx={0.75} />
      <rect x={align === "left" ? 0 : align === "center" ? cx : lx} y={3.5} width={half} height={1.5} rx={0.75} />
      <rect x={0}  y={7}                    width={full} height={1.5} rx={0.75} />
      <rect x={align === "left" ? 0 : align === "center" ? cx : lx} y={10.5} width={half} height={1.5} rx={0.75} />
    </svg>
  );
}

const TB_BTN: CSSProperties = {
  ...CONTEXT_ICON_BUTTON,
  flexShrink: 0,
  minHeight: 30,
  width: 30,
  minWidth: 30,
  height: 30,
};

function BlockActionBar({ anchorRect, onSnapBack, onClose }: {
  anchorRect: DOMRect;
  onSnapBack: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const BAR_H = 38;
  const belowTop = anchorRect.bottom + 6;
  const aboveTop = anchorRect.top - BAR_H - 6;
  const top  = belowTop + BAR_H < window.innerHeight ? belowTop : Math.max(4, aboveTop);
  const left = Math.min(window.innerWidth - 180, Math.max(4, anchorRect.left));

  return (
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, zIndex: 9999,
        ...CONTEXT_TOOLBAR_SURFACE,
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 6px",
      }}
    >
      <button
        onClick={onSnapBack}
        style={{ ...TB_BTN, width: "auto", fontSize: 12, gap: 4, padding: "0 10px", whiteSpace: "nowrap", color: "#7c3aed", fontWeight: 600 }}
      >
        ↺ Snap back
      </button>
    </div>
  );
}

function ContextToolbar({
  elementKey, design, anchorRect, onChangeTs, linkControl,
  styleLinked, onToggleStyleLink, onOpenFull, onClose,
}: {
  elementKey: SelectableKey;
  design: ResumeDesign;
  anchorRect: DOMRect;
  onChangeTs: (key: SelectableKey, partial: Partial<TextStyle>) => void;
  linkControl?: { label: string; linked: boolean; count: number; onToggle: () => void };
  styleLinked: boolean;
  onToggleStyleLink: () => void;
  onOpenFull: () => void;
  onClose: () => void;
}) {
  const tbRef = useRef<HTMLDivElement>(null);
  const ts = design[elementKey] as TextStyle & { separator?: string };
  const { base, bold, italic } = parseFontFamily(ts.fontFamily);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tbRef.current && !tbRef.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  // Prefer below the element; flip above only if it would go off-screen
  const TOOLBAR_H = 46;
  const belowTop = anchorRect.bottom + 6;
  const aboveTop = anchorRect.top - TOOLBAR_H - 6;
  const top  = belowTop + TOOLBAR_H < window.innerHeight ? belowTop : Math.max(4, aboveTop);
  const left = Math.min(window.innerWidth - 340, Math.max(4, anchorRect.left));

  const divider = <div style={{ width: 1, height: 16, background: "#e5e7eb", margin: "0 3px", flexShrink: 0 }} />;
  const active = (on: boolean): CSSProperties => ({
    ...TB_BTN,
    ...(on ? CONTEXT_ACTIVE_BUTTON : {}),
    background: on ? CONTEXT_ACTIVE_BUTTON.background : "#fff",
  });

  return (
    <div
      ref={tbRef}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, zIndex: 9999,
        ...CONTEXT_TOOLBAR_SURFACE,
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 6px",
      }}
    >
      {/* Element label */}
      <span style={{ fontSize: 10, color: "#9ca3af", paddingRight: 6, borderRight: "1px solid #e5e7eb", marginRight: 2, whiteSpace: "nowrap" }}>
        {ELEMENT_LABELS[elementKey]}
      </span>

      {visualRoleForDesignKey(elementKey) && (
        <button
          type="button"
          onClick={onToggleStyleLink}
          title={
            styleLinked
              ? "Typography linked between Designed PDF and Web. Click to unlink Web."
              : "Web has its own typography override. Click to relink."
          }
          style={{
            ...TB_BTN,
            width: "auto",
            minWidth: 30,
            padding: "0 7px",
            border: styleLinked ? "1px solid #ddd6fe" : "1px solid #fed7aa",
            background: styleLinked ? "#f5f3ff" : "#fff7ed",
            color: styleLinked ? "#6d28d9" : "#c2410c",
            fontSize: 11,
          }}
        >
          {styleLinked ? <Link2 size={13} /> : <Unlink2 size={13} />}
        </button>
      )}

      {/* Linking is first because it controls the repeated layout relationship;
          everything after it is ordinary text styling. */}
      {linkControl && (
        <>
          <button
            type="button"
            title={linkControl.linked
              ? `${linkControl.label} matches all same fields`
              : `${linkControl.label} is independent`}
            onClick={linkControl.onToggle}
            style={{
              ...TB_BTN,
              width: "auto",
              minWidth: 0,
              padding: "0 7px",
              gap: 4,
              display: "inline-flex",
              alignItems: "center",
              border: linkControl.linked ? "1px solid rgba(245,158,11,0.34)" : "1px solid #d1d5db",
              background: linkControl.linked ? "rgba(255,251,235,0.98)" : "#fff",
              color: linkControl.linked ? "#a16207" : "#64748b",
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {linkControl.linked ? <Link2 size={13} strokeWidth={2.1} /> : <Unlink2 size={13} strokeWidth={2} />}
            <span>{linkControl.linked ? `All ${linkControl.label.toLowerCase()} · ${linkControl.count}` : "Individual"}</span>
          </button>
          {divider}
        </>
      )}

      {/* Font size */}
      <button style={TB_BTN} onClick={() => onChangeTs(elementKey, { fontSize: Math.max(6, ts.fontSize - 1) })}>−</button>
      <span style={{ minWidth: 20, textAlign: "center", fontSize: 12, color: "#374151" }}>{ts.fontSize}</span>
      <button style={TB_BTN} onClick={() => onChangeTs(elementKey, { fontSize: ts.fontSize + 1 })}>+</button>

      {divider}

      {/* Bold / Italic */}
      <button style={{ ...active(bold), fontWeight: 700 }}
        onClick={() => onChangeTs(elementKey, { fontFamily: composeFontFamily(base, !bold, italic) })}>B</button>
      <button style={{ ...active(italic), fontStyle: "italic" }}
        onClick={() => onChangeTs(elementKey, { fontFamily: composeFontFamily(base, bold, !italic) })}>I</button>

      {divider}

      {/* Color */}
      <label style={{ display: "flex", alignItems: "center", cursor: "pointer", position: "relative" }} title="Text color">
        <div style={{ width: 16, height: 16, borderRadius: 3, background: ts.color, border: "1px solid #d1d5db", flexShrink: 0 }} />
        <input type="color" value={ts.color.startsWith("#") ? ts.color : "#000000"}
          style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
          onChange={e => onChangeTs(elementKey, { color: e.target.value })} />
      </label>

      {divider}

      {/* Alignment */}
      {(["left","center","right"] as const).map(a => (
        <button key={a} title={a}
          style={active((ts.textAlign ?? "left") === a)}
          onClick={() => onChangeTs(elementKey, { textAlign: a })}>
          <AlignIcon align={a} size={14} />
        </button>
      ))}

      {divider}

      {/* Open full popover */}
      <button style={{ ...TB_BTN, fontSize: 16, letterSpacing: 1 }} title="More formatting" onClick={onOpenFull}>⋯</button>
    </div>
  );
}

// ── Style Popover (right-click / ⋯) ──────────────────────────────────────────

const FONTS: { value: FontFamily; label: string }[] = [
  { value: "Helvetica",             label: "Helvetica (sans)" },
  { value: "Helvetica-Bold",        label: "Helvetica Bold" },
  { value: "Helvetica-Oblique",     label: "Helvetica Italic" },
  { value: "Helvetica-BoldOblique", label: "Helvetica Bold Italic" },
  { value: "Times-Roman",           label: "Times Roman (serif)" },
  { value: "Times-Bold",            label: "Times Bold" },
  { value: "Times-Italic",          label: "Times Italic" },
  { value: "Times-BoldItalic",      label: "Times Bold Italic" },
  { value: "Courier",               label: "Courier (mono)" },
  { value: "Courier-Bold",          label: "Courier Bold" },
  { value: "Courier-Oblique",       label: "Courier Italic" },
  { value: "Courier-BoldOblique",   label: "Courier Bold Italic" },
];

interface PopoverProps {
  elementKey: SelectableKey;
  design: ResumeDesign;
  styleLinked: boolean;
  onToggleStyleLink: () => void;
  anchorRect: DOMRect;
  onChangeTs: (key: SelectableKey, partial: Partial<TextStyle>) => void;
  onChangeDesign: (partial: Partial<ResumeDesign>) => void;
  onClose: () => void;
  blockId?: string | null;
  onChangeBlock?: (id: string, partial: Partial<LayoutOverride>) => void;
}

function StylePopover({
  elementKey,
  design: d,
  anchorRect,
  onChangeTs,
  onChangeDesign,
  onClose,
  blockId,
  onChangeBlock,
  styleLinked,
  onToggleStyleLink,
}: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const s = d[elementKey] as TextStyle & Record<string, unknown>;
  const set = (p: Partial<TextStyle>) => onChangeTs(elementKey, p);

  // The full formatter is intentionally a narrow vertical panel. Nothing in
  // here should require horizontal scrolling; advanced controls are grouped
  // into expandable sections instead of being packed side-by-side.
  const margin = 12;
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const POP_W = Math.min(360, Math.max(240, vp.w - margin * 2));
  const POP_MAX_H = Math.min(620, Math.max(320, vp.h - margin * 2));

  let left = anchorRect.right + margin;
  let top = anchorRect.top;
  if (left + POP_W > vp.w - margin) left = anchorRect.left - POP_W - margin;
  if (left < margin) {
    left = Math.max(margin, Math.min(anchorRect.left, vp.w - POP_W - margin));
    top = anchorRect.bottom + margin;
  }
  top = Math.max(margin, Math.min(top, vp.h - POP_MAX_H - margin));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const label = (txt: string) => (
    <div style={{
      fontSize: 10,
      fontWeight: 750,
      color: "#71717a",
      textTransform: "uppercase" as const,
      letterSpacing: "0.055em",
      marginBottom: 6,
    }}>{txt}</div>
  );

  const fieldShell: CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    background: "#fff",
    color: "#27272a",
    fontSize: 12,
  };

  const section = (title: string, children: ReactNode) => (
    <section style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#3f3f46", letterSpacing: "0.01em" }}>{title}</div>
      {children}
    </section>
  );

  const disclosure = (title: string, children: ReactNode, open = false) => (
    <details open={open} style={{
      border: "1px solid #e4e4e7",
      borderRadius: 10,
      background: "#fafafa",
      overflow: "hidden",
    }}>
      <summary style={{
        cursor: "pointer",
        padding: "10px 11px",
        fontSize: 11,
        fontWeight: 750,
        color: "#3f3f46",
        userSelect: "none",
      }}>{title}</summary>
      <div style={{
        padding: "2px 11px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 11,
        minWidth: 0,
      }}>{children}</div>
    </details>
  );

  const colorField = (fieldLabel: string, value: string, onChange: (v: string) => void) => (
    <div style={{ minWidth: 0 }}>
      {label(fieldLabel)}
      <div style={{
        ...fieldShell,
        minHeight: 36,
        padding: "5px 7px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <input
          aria-label={`${fieldLabel} picker`}
          type="color"
          value={value.startsWith("#") ? value : "#ffffff"}
          onChange={e => onChange(e.target.value)}
          style={{ width: 25, height: 24, cursor: "pointer", border: 0, padding: 0, background: "transparent", flexShrink: 0 }}
        />
        <input
          aria-label={`${fieldLabel} value`}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...fieldShell, border: 0, outline: "none", padding: 0, fontFamily: "monospace", flex: 1 }}
        />
      </div>
    </div>
  );

  const sliderField = (
    fieldLabel: string,
    value: number,
    onChange: (v: number) => void,
    min = 0,
    max = 100,
    step = 0.5,
  ) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 750,
          color: "#71717a",
          textTransform: "uppercase" as const,
          letterSpacing: "0.055em",
        }}>{fieldLabel}</div>
        <input
          aria-label={`${fieldLabel} value`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ ...fieldShell, width: 62, height: 30, padding: "3px 7px", textAlign: "right" as const, flexShrink: 0 }}
        />
      </div>
      <input
        aria-label={fieldLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ display: "block", width: "100%", minWidth: 0, margin: 0, accentColor: CONTEXT_PURPLE }}
      />
    </div>
  );

  const selectField = (fieldLabel: string, value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) => (
    <div style={{ minWidth: 0 }}>
      {label(fieldLabel)}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldShell, height: 36, padding: "0 9px" }}
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const textField = (fieldLabel: string, value: string, onChange: (v: string) => void, maxLen = 20) => (
    <div style={{ minWidth: 0 }}>
      {label(fieldLabel)}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        maxLength={maxLen}
        style={{ ...fieldShell, height: 36, padding: "0 9px" }}
      />
    </div>
  );

  const compactPair = (a: ReactNode, b: ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, minWidth: 0 }}>{a}{b}</div>
  );

  const toggleField = (fieldLabel: string, value: boolean, onChange: (v: boolean) => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12, color: "#3f3f46", fontWeight: 600 }}>{fieldLabel}</span>
      <button type="button" onClick={() => onChange(!value)} aria-pressed={value} style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: value ? CONTEXT_PURPLE : "#d4d4d8",
        position: "relative" as const,
        flexShrink: 0,
      }}>
        <span style={{
          position: "absolute" as const,
          top: 3,
          left: value ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.12s",
          boxShadow: "0 1px 2px rgba(0,0,0,.18)",
        }} />
      </button>
    </div>
  );

  return (
    <div
      ref={popRef}
      style={{
        position: "fixed" as const,
        zIndex: 9999,
        top,
        left,
        width: POP_W,
        maxWidth: "calc(100vw - 24px)",
        ...CONTEXT_POPOVER_SURFACE,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e4e4e7",
        padding: "10px 11px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 13, fontWeight: 800, color: "#27272a" }}>
          <Pencil size={14} color={CONTEXT_PURPLE} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ELEMENT_LABELS[elementKey]}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {visualRoleForDesignKey(elementKey) && (
            <button
              type="button"
              onClick={onToggleStyleLink}
              title={styleLinked ? "Typography linked to Web" : "Web typography overridden"}
              style={{
                ...CONTEXT_BUTTON,
                minHeight: 28,
                height: 28,
                ...(styleLinked ? CONTEXT_ACTIVE_BUTTON : CONTEXT_WARNING_BUTTON),
                padding: "0 8px",
              }}
            >
              {styleLinked ? <Link2 size={13} /> : <Unlink2 size={13} />}
              {styleLinked ? "Linked" : "PDF only"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close formatting"
            style={{ ...CONTEXT_ICON_BUTTON, width: 28, minWidth: 28, minHeight: 28, height: 28, borderColor: "transparent", background: "transparent", color: "#71717a" }}
          ><X size={15} /></button>
        </div>
      </div>

      <div style={{
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxHeight: POP_MAX_H - 52,
        overflowY: "auto" as const,
        overflowX: "hidden" as const,
        boxSizing: "border-box",
      }}>
        {visualRoleForDesignKey(elementKey) && (
          <div style={{
            borderRadius: 9,
            border: `1px solid ${styleLinked ? "rgba(46,5,98,0.12)" : "#fed7aa"}`,
            background: styleLinked ? "#f7f5ff" : "#fff7ed",
            padding: "8px 9px",
            color: styleLinked ? CONTEXT_PURPLE : "#9a3412",
            fontSize: 11,
            lineHeight: 1.45,
          }}>
            {styleLinked
              ? "Linked to Responsive Web. Typography changes update both formats."
              : "PDF typography is currently independent from Responsive Web."}
          </div>
        )}

        {section("Typography", <>
          {selectField("Font family", s.fontFamily as string, v => set({ fontFamily: v as FontFamily }), FONTS)}
          {sliderField("Font size (pt)", s.fontSize as number, v => set({ fontSize: v }), 7, 48, 0.5)}
          {colorField("Text colour", s.color as string, v => set({ color: v }))}
          <div>
            {label("Alignment")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
              {(["left", "center", "right"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  title={a}
                  onClick={() => set({ textAlign: a })}
                  style={{
                    ...CONTEXT_BUTTON,
                    minWidth: 0,
                    height: 34,
                    minHeight: 34,
                    padding: 0,
                    ...((s.textAlign ?? "left") === a ? CONTEXT_ACTIVE_BUTTON : {}),
                  }}
                ><AlignIcon align={a} size={15} /></button>
              ))}
            </div>
          </div>
          {(elementKey === "name" || elementKey === "sectionHeading") &&
            selectField("Text transform", (s.textTransform ?? "none") as string,
              v => set({ textTransform: v as "none" | "uppercase" | "lowercase" | "capitalize" }), [
                { value: "none", label: "None" },
                { value: "uppercase", label: "UPPERCASE" },
                { value: "lowercase", label: "lowercase" },
                { value: "capitalize", label: "Capitalize Each Word" },
              ])
          }
        </>)}

        {elementKey === "entryBullet" && disclosure("Bullet settings", <>
          {compactPair(
            textField("Bullet character", d.bulletMarkerChar, v => onChangeDesign({ bulletMarkerChar: v || "•" }), 2),
            colorField("Bullet colour", d.bulletMarkerColor, v => onChangeDesign({ bulletMarkerColor: v })),
          )}
          {sliderField("Marker indent (pt)", d.bulletMarkerWidth, v => onChangeDesign({ bulletMarkerWidth: v }), 6, 24, 1)}
        </>, true)}

        {elementKey === "contact" && section("Element", <>
          {textField("Separator between items", (s as { separator?: string }).separator ?? " · ",
            v => onChangeDesign({ contact: { ...d.contact, separator: v } }), 10)}
        </>)}

        {elementKey === "entryDate" && section("Element", <>
          {selectField("Date position", (s as { position?: string }).position ?? "right",
            v => onChangeDesign({ entryDate: { ...d.entryDate, position: v as "right" | "below" } }), [
              { value: "right", label: "Right of title (inline)" },
              { value: "below", label: "Below title" },
            ])}
        </>)}

        {elementKey === "sectionHeading" && disclosure("Heading rule", <>
          {toggleField("Rule line under heading", d.sectionRuleShow, v => onChangeDesign({ sectionRuleShow: v }))}
          {d.sectionRuleShow && <>
            {colorField("Rule colour", d.sectionRuleColor, v => onChangeDesign({ sectionRuleColor: v }))}
            {sliderField("Thickness", d.sectionRuleThickness, v => onChangeDesign({ sectionRuleThickness: v }), 0.5, 4, 0.5)}
          </>}
        </>)}

        {elementKey === "skillItem" && disclosure("Skill appearance", <>
          {colorField("Background colour", (s.backgroundColor ?? "transparent") as string, v => set({ backgroundColor: v }))}
          {selectField("Display style", d.skillDisplay, v => onChangeDesign({ skillDisplay: v as typeof d.skillDisplay }), [
            { value: "tags", label: "Tags / pills" },
            { value: "list", label: "Bulleted list" },
            { value: "inline", label: "Inline (comma separated)" },
            { value: "grid", label: "Grid" },
          ])}
          {sliderField("Horizontal padding (pt)", (s.paddingLeft ?? 0) as number, v => set({ paddingLeft: v, paddingRight: v }), 0, 20)}
          {sliderField("Vertical padding (pt)", (s.paddingTop ?? 0) as number, v => set({ paddingTop: v, paddingBottom: v }), 0, 12)}
          {sliderField("Corner radius", (s.borderRadius ?? 0) as number, v => set({ borderRadius: v }), 0, 16, 1)}
        </>)}

        {(elementKey === "name" || elementKey === "sectionHeading") &&
          disclosure("Background", <>
            {colorField("Background colour", (s.backgroundColor ?? "transparent") as string, v => set({ backgroundColor: v }))}
          </>)}

        {(elementKey === "entryTitle" || elementKey === "entryOrg") && disclosure("Entry spacing", <>
          {sliderField("Space between entries (pt)", d.entrySpacing, v => onChangeDesign({ entrySpacing: v }), 2, 30)}
        </>)}

        {disclosure("Spacing & rhythm", <>
          {sliderField("Letter spacing", (s.letterSpacing ?? 0) as number, v => set({ letterSpacing: v }), -2, 10, 0.5)}
          {sliderField("Line height", (s.lineHeight ?? 1.2) as number, v => set({ lineHeight: v }), 1, 3, 0.05)}
          {sliderField("Space above (pt)", (s.marginTop ?? 0) as number, v => set({ marginTop: v }), 0, 40)}
          {sliderField("Space below (pt)", (s.marginBottom ?? 0) as number, v => set({ marginBottom: v }), 0, 40)}
        </>)}

        {blockId && onChangeBlock && (() => {
          const ov = d.layoutOverrides?.[blockId] ?? {};
          return disclosure("Position & transform", <>
            {sliderField("Rotation (°)", ov.rotation ?? 0,
              v => onChangeBlock(blockId, { rotation: v || undefined }), -180, 180, 1)}
            {sliderField("Horizontal offset (pt)", Math.round(ov.visualDx ?? 0),
              v => onChangeBlock(blockId, { visualDx: v || undefined }), -300, 300, 1)}
            {sliderField("Vertical displacement (pt)", Math.round(ov.flowDisplacementY ?? 0),
              v => onChangeBlock(blockId, { flowDisplacementY: v || undefined }), -500, 500, 1)}
          </>);
        })()}
      </div>
    </div>
  );
}
