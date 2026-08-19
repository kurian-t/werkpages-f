/**
 * ResumeCanvas — interactive DOM-rendered resume.
 * Single-click → floating style popover.
 * Double-click → contenteditable in-place text editing.
 *
 * contenteditable is used instead of <input> because inputs inside a CSS
 * transform:scale() container have broken keyboard routing in Chromium —
 * the space key gets swallowed. contenteditable uses the browser's native
 * editing engine which works correctly inside any container.
 */
import { CSSProperties, ReactNode, useState, useRef, useEffect, useLayoutEffect, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_DESIGN } from "./defaults";
import type { ResumeData, ResumeDesign, TextStyle, FontFamily, WorkEntry, EducationEntry, BulletPoint, LayoutOverride } from "./types";
import { formatDateRange, formatEduYears, genId } from "./types";
import RichTextEditor from "@/components/RichTextEditor";
import { companyLogoDomain } from "@/lib/utils";

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

  if (failed || !company.trim()) return null;
  return (
    // width:"100%" fills the SubDrag wrapper — default is 20px (from defaultWidth={20}),
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

// SubDrag — wraps an individual sub-element within a section block.
// Independently moveable (visualDx/visualDy), resizable (width), and rotatable.
// Movement is clamped to the section bounds. All overrides are visual-only (no cascade).
function SubDrag({ overrideKey, defaultWidth, children }: { overrideKey: string; defaultWidth?: number; children: ReactNode }) {
  const ctx = useContext(SectionBoundsCtx);
  const elRef   = useRef<HTMLDivElement>(null);   // content wrapper (carries transform)
  const outerRef = useRef<HTMLDivElement>(null);  // outer wrapper (hover zone)
  const ctxRef  = useRef(ctx);
  ctxRef.current = ctx;
  const [isHovered,  setIsHovered]  = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  // Prevents onMouseLeave from collapsing handles mid-operation
  const operationRef = useRef(false);

  // In pass-1 (no SectionBoundsCtx), still render a width-constraining wrapper so
  // images with width:"100%" don't expand to fill the whole region column.
  if (!ctx) return <div style={{ width: defaultWidth ?? "fit-content", maxWidth: "100%" }}>{children}</div>;

  const override  = ctx.design.layoutOverrides?.[overrideKey];
  const dx        = override?.visualDx ?? 0;
  const dy        = override?.visualDy ?? 0;
  const rot       = override?.rotation  ?? 0;
  const overrideW = override?.width;

  // Merge partial updates into the existing override, strip zero/falsy fields.
  function saveSubOverride(updates: Partial<LayoutOverride>) {
    const current = ctxRef.current!;
    const d = current.design;
    const existing = d.layoutOverrides?.[overrideKey] ?? {};
    const next: LayoutOverride = { ...existing, ...updates };
    if (!next.visualDx) delete next.visualDx;
    if (!next.visualDy) delete next.visualDy;
    if (!next.rotation) delete next.rotation;
    if (!next.width)    delete next.width;
    const layoutOverrides = { ...(d.layoutOverrides ?? {}), [overrideKey]: next };
    if (!Object.keys(next).length) delete layoutOverrides[overrideKey];
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
    // Extend check 14px above to cover the rotation handle zone
    const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top - 14 && e.clientY <= rect.bottom;
    if (!over) setIsHovered(false);
  }

  const tfStr = (dx || dy || rot)
    ? `translate(${dx}px, ${dy}px) rotate(${rot}deg)` : undefined;

  // ── Move ──────────────────────────────────────────────────────────────────
  function handleMouseDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const el = elRef.current;
    const container = ctxRef.current?.containerRef.current;
    if (!el || !container) return;
    const s = ctxRef.current?.scale ?? 1;
    const startCX = ev.clientX, startCY = ev.clientY;
    const startOvr = ctxRef.current?.design.layoutOverrides?.[overrideKey];
    const startDx  = startOvr?.visualDx ?? 0;
    const startDy  = startOvr?.visualDy ?? 0;
    const startRot = startOvr?.rotation  ?? 0;
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
      operationRef.current = true;
      setIsResizing(true);
      const el = elRef.current;
      if (!el) return;
      const s = ctxRef.current?.scale ?? 1;
      const startCX  = ev.clientX;
      const startW   = el.getBoundingClientRect().width / s;
      const startOvr = ctxRef.current?.design.layoutOverrides?.[overrideKey];
      const startDx  = startOvr?.visualDx ?? 0;
      const startDy  = startOvr?.visualDy ?? 0;
      const startRot = startOvr?.rotation  ?? 0;

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
        } else {
          elRef.current.style.width = `${Math.max(20, startW + ddx)}px`;
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
    operationRef.current = true;
    setIsRotating(true);
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const startOvr = ctxRef.current?.design.layoutOverrides?.[overrideKey];
    const startDx  = startOvr?.visualDx ?? 0;
    const startDy  = startOvr?.visualDy ?? 0;
    let newRot = startOvr?.rotation ?? 0;

    function onMove(e: MouseEvent) {
      newRot = snapRotation(Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90) * 10) / 10);
      if (elRef.current) {
        const tf = (startDx || startDy || newRot)
          ? `translate(${startDx}px, ${startDy}px) rotate(${newRot}deg)` : "";
        elRef.current.style.transform = tf;
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

  const showHandles = isHovered || isResizing || isRotating;

  const subEdgeH = (p: CSSProperties): CSSProperties => ({
    position: "absolute", ...p,
    width: 4, height: "60%", top: "20%",
    borderRadius: 2, backgroundColor: HC, opacity: 0.8,
    cursor: "ew-resize", zIndex: 10, userSelect: "none",
  });

  return (
    <div
      ref={outerRef}
      style={{ position: "relative", width: overrideW ?? defaultWidth ?? "fit-content", maxWidth: overrideW ? undefined : "100%" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!operationRef.current) setIsHovered(false); }}
    >
      {/* Content wrapper — carries transform + rotation handle + resize handles */}
      <div
        ref={elRef}
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
            <div data-subdrag-handle="left"  onMouseDown={makeResizeDown(true)}  onClick={e => e.stopPropagation()} style={subEdgeH({ left: 0 })} />
            <div data-subdrag-handle="right" onMouseDown={makeResizeDown(false)} onClick={e => e.stopPropagation()} style={subEdgeH({ right: 0 })} />
          </>
        )}
      </div>
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

type SectionId = "work" | "education" | "skills" | "bio" | "links";
const ALL_SECTIONS: SectionId[] = ["work", "education", "skills", "bio", "links"];
const SECTION_LABELS: Record<SectionId, string> = {
  work: "Experience", education: "Education", skills: "Skills", bio: "Summary", links: "Links",
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
//   "name"             — full name
//   "contact"          — contact line
//   "work.heading"     — Experience section heading
//   "work.<entryId>"   — individual work entry (stable entry.id, NOT array index)
//   "edu.heading"      — Education section heading
//   "edu.<entryId>"    — individual education entry
//   "bio.heading"      — Summary heading
//   "bio"              — summary body
//   "skills.heading"   — Skills heading
//   "skills"           — skills body
//   "links.heading"    — Links heading
//   "links"            — links body

interface FlowRegion {
  id: string;
  x: number;           // page-relative left edge (pts)
  y: number;           // page-relative top edge (pts)
  width: number;       // available content width (pts)
  blockIds: string[];  // ordered block IDs whose flow belongs to this region
}

interface ComputedPos { x: number; y: number; w: number; h: number }

function buildSectionBlockIds(sectionId: SectionId, data: ResumeData): string[] {
  if (!sectionHasContent(sectionId, data)) return [];
  const ids: string[] = [`${sectionId}.heading`];
  switch (sectionId) {
    case "work":
      data.workEntries.forEach(e => ids.push(`work.${e.id}`));
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
      // Narrow label column left, content right — content is the single flow column.
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
// from blocks at or before it — including blocks whose nat entry is missing (e.g. a
// block that has a displacement override but wasn't measured in the last pass-1).
// Skipping displacement accumulation when nat is missing was the prior bug: if
// "name" happened to be absent from naturalPos, its flowDisplacementY=200 would
// never enter cumulativeY, and every subsequent block would silently get cumulativeY=0.
//
// effectiveBottom(block) = out[block].y + out[block].h
// The next block in reading order should start at effectiveBottom(prev) + natural_gap,
// which the cascade already achieves because nat.y encodes those gaps from pass-1.
//
// visualDx is added to x only — never cascades.
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
      // Role blocks (work/edu entries, not headings) are independently positioned —
      // their flowDisplacementY does NOT cascade to subsequent blocks. It only offsets
      // the role itself (treated like visualDy). This prevents one role's drag from
      // shifting all roles below it. Old data with flowDisplacementY on roles is
      // automatically handled: it moves the role but doesn't cascade.
      const isRoleBlock = (bid.startsWith("work.") || bid.startsWith("edu.")) && !bid.endsWith(".heading");
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

  // Explicit focus after every editingId change — runs after React commits the DOM,
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
          // Last bullet deleted — clear the list and exit editing mode (shows placeholder).
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
                : <span style={textSt}>{b.text || <em style={{ opacity: 0.35 }}>—</em>}</span>
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
      <div style={{ ...base, opacity: 0.3, fontStyle: "italic" }}>
        Describe this role — use the editor on the left to add text and bullet points.
      </div>
    );
  }
  return (
    <div
      style={base}
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
    case "work":      return <WorkC   data={data} d={d} ctx={ctx} setData={setData} />;
    case "education": return <EduC    data={data} d={d} ctx={ctx} setData={setData} />;
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
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const [bodyRect,   setBodyRect]     = useState<DOMRect | null>(null);

  function openBodyEditor(ev: React.MouseEvent) {
    ev.stopPropagation();
    ctx.onClearSelect();
    if (bodyWrapRef.current) setBodyRect(bodyWrapRef.current.getBoundingClientRect());
    setEditingBody(true);
  }

  return (
    <div>
      {d.showCompanyLogos && e.company && (
        <SubDrag overrideKey={`${pfx}.logo`} defaultWidth={20}>
          <CanvasLogo company={e.company} logoUrl={e.logoUrl} />
        </SubDrag>
      )}
      <SubDrag overrideKey={`${pfx}.title`}>
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
      <SubDrag overrideKey={`${pfx}.org`}>
        <Sel k="entryOrg" ctx={ctx} block style={toCss(d.entryOrg)}
          editInfo={{ value: e.company, onChange: v => update({ company: v }) }}>
          {e.company || <em style={{ opacity: 0.3 }}>Company name</em>}
        </Sel>
      </SubDrag>
      {d.entryDate.position === "below" && (
        <SubDrag overrideKey={`${pfx}.date`}>
          <Sel k="entryDate" ctx={ctx} block style={toCss(d.entryDate)}>
            {formatDateRange(e.startDate, e.endDate, e.current)}
          </Sel>
        </SubDrag>
      )}
      <SubDrag overrideKey={`${pfx}.body`}>
        <div ref={bodyWrapRef} onDoubleClick={openBodyEditor}>
          <EntryBody body={e.body} d={d} />
        </div>
      </SubDrag>

      {editingBody && bodyRect && createPortal(
        <div
          style={{
            position: "fixed",
            left: bodyRect.left - 2,
            top: bodyRect.top - 2,
            width: Math.max(bodyRect.width + 4, 340),
            zIndex: 9999,
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            borderRadius: 8,
            overflow: "hidden",
            border: "2px solid #7c3aed",
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <RichTextEditor
            value={e.body ?? ""}
            onChange={html => update({ body: html || undefined })}
            minHeight={Math.max(bodyRect.height, 80)}
          />
          <div style={{ padding: "4px 8px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end" }}>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setEditingBody(false)}
              style={{ fontSize: 11, padding: "3px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function SingleEduEntryC({ entry: e, i, data, d, ctx, setData }: SectionProps & { entry: EducationEntry; i: number }) {
  function update(partial: Partial<EducationEntry>) {
    setData({ ...data, education: data.education.map((x, j) => j === i ? { ...x, ...partial } : x) });
  }
  const degreeField = [e.degree, e.field].filter(Boolean).join(", ");
  const pfx = `edu.${e.id}`;
  return (
    <div>
      <SubDrag overrideKey={`${pfx}.title`}>
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
        <SubDrag overrideKey={`${pfx}.org`}>
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
        <SubDrag overrideKey={`${pfx}.date`}>
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
  // For section heading blocks: computed height encompassing all entries below.
  // Makes the block visually span the whole section group.
  groupHeight?: number;
  // Forced hover: true when any block in this section is hovered (makes group border visible).
  forcedHover?: boolean;
  children: ReactNode;
}

// px of invisible padding above the block that keeps handles reachable
const ABOVE_PAD = 30;
const HC = "#7c3aed"; // handle colour

function DraggableBlock({ id, computedPos, override, scale, design, onDesignChange, onHoverBlock, onBlockClick, onDragMove, onDragEnd, onRotate, onRotateEnd, additionalDy, additionalDx, additionalRotation, groupHeight, forcedHover, children }: DragBlockProps) {
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
    const isRoleBlock = (id.startsWith("work.") || id.startsWith("edu.")) && !id.endsWith(".heading");
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
          // Independent vertical offset — does not cascade to other roles.
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

  const isEntryBlock = id.startsWith("work.") || id.startsWith("edu.");
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
          Hover events live on the inner content div — NOT here — so the hover zone matches the
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

        {/* Inner content div — carries the outline, rotation, and resize handles */}
        <div
          ref={innerRef}
          onMouseEnter={() => { setHover(true);  onHoverBlock(id); }}
          onMouseLeave={() => { if (!isDragging && !isResizing && !isRotating) { setHover(false); if (!isPinned) onHoverBlock(null); } }}
          className={isDragging ? "canvas-block canvas-block--dragging" : "canvas-block"}
          style={{
            position: "relative",
            width: "100%",
            minHeight: groupHeight != null
              ? Math.max(groupHeight, height ?? 0)          // heading: computed group size OR user-dragged size, whichever is larger
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
  remeasureKey: number;
  onDesignChange: (d: ResumeDesign) => void;
  onHoverBlock: (id: string | null) => void;
  onBlockClick?: (id: string, rect: DOMRect | null) => void;
}

function FreeFormLayout({ data, d, ctx, setData, scale, pageW, remeasureKey, onDesignChange, onHoverBlock, onBlockClick }: FreeFormProps) {
  const sp: SectionProps = { data, d, ctx, setData };

  // ── Bullet editing state — lifted here so it survives pass-1 ↔ pass-2 remounts ──
  const [bulletEditKey, setBulletEditKey] = useState<string | null>(null);
  const bulletEditCtxValue = useMemo(() => ({ key: bulletEditKey, set: setBulletEditKey }), [bulletEditKey]);

  // ── Group drag: heading block drags all its entries in real-time ──────────
  const [groupDrag,     setGroupDrag]     = useState<{ prefix: string; dy: number; dx: number } | null>(null);
  const [groupRotation, setGroupRotation] = useState<{ prefix: string; rot: number } | null>(null);

  // ── Group hover: tracks which section prefix is currently hovered ─────────
  // Used to force the heading block's border visible when hovering any entry.
  const [groupHoveredSection, setGroupHoveredSection] = useState<string | null>(null);

  // ── Stable memoized flow regions ────────────────────────────────────────
  // Re-built when content count, layout type, or sidebar config changes.
  const regions = useMemo(
    () => buildFlowRegions(data, d, pageW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.workEntries.map(e => e.id).join(","),
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
  const blockRefs    = useRef<Record<string, HTMLDivElement | null>>({});
  const regionRefs   = useRef<Record<string, HTMLDivElement | null>>({});

  // Reset measurement when anything that affects block heights changes:
  //   • block set changes (entries added/removed/reordered) via allBlockIds
  //   • bullet counts per work entry (adding a bullet grows that block's height)
  //   • font sizes / entry spacing (change intrinsic heights of every block)
  //   • layout geometry (column widths affect text wrap → heights)
  const contentHeightSig = [
    data.workEntries.map(e => `${e.id}:${(e.body ?? "").length}`).join("|"),
    data.education.map(e => e.id).join("|"),
    data.summary.length,
    d.sectionHeading.fontSize, d.entryTitle.fontSize,
    d.entryBullet.fontSize, d.entryOrg.fontSize,
    d.entrySpacing,
  ].join("~");
  const measureResetKey = [
    remeasureKey,
    d.layout, d.sidebarWidth, d.columnGap,
    allBlockIds.join(","),
    contentHeightSig,
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
    // ── Pass 1 — invisible, stacked in correct region columns for accurate measurement
    return (
      <BulletEditCtx.Provider value={bulletEditCtxValue}>
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, pointerEvents: "none", userSelect: "none" }}>
          {regions.map(region => (
            <div
              key={region.id}
              ref={el => { regionRefs.current[region.id] = el; }}
              style={{ position: "absolute", left: region.x, top: region.y, width: region.width }}
            >
              {region.blockIds.map(bid => {
                const widthOverride = d.layoutOverrides?.[bid]?.width;
                return (
                  <div key={bid} ref={el => { blockRefs.current[bid] = el; }}
                    style={{ overflow: "hidden", ...(widthOverride ? { width: widthOverride } : {}) }}>
                    {renderContent(bid)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </BulletEditCtx.Provider>
    );
  }

  // ── Pass 2 — compute final positions, render draggable blocks
  const overrides     = d.layoutOverrides ?? {};
  const computedPositions = computeBlockPositions(regions, naturalPositions, overrides);

  // Compute the section's natural height (heading top → bottom of last entry) using
  // naturalPositions — ignores visualDy overrides so the box never shrinks when an
  // entry is dragged to a different location. Only content changes (add/remove entries,
  // text reflow) affect the box size.
  function sectionGroupHeight(prefix: string): number | undefined {
    const headingNat = naturalPositions[`${prefix}.heading`];
    if (!headingNat) return undefined;
    const bottoms = allBlockIds
      .filter(bid => bid.startsWith(prefix + ".") && !bid.endsWith(".heading"))
      .map(bid => { const cp = naturalPositions[bid]; return cp ? cp.y + cp.h : 0; });
    if (bottoms.length === 0) return undefined;
    return Math.max(...bottoms) - headingNat.y;
  }

  // IMPORTANT: the heading DraggableBlock can be manually height-resized. Its CSS
  // transform rotates around the center of the ACTUAL rendered box, which is
  // max(natural group height, saved height override). Group-rotated entries must orbit
  // around that exact same center or they drift outside the purple group rectangle.
  function sectionRenderedGroupHeight(prefix: string): number {
    const naturalH = sectionGroupHeight(prefix) ?? 0;
    const savedH   = overrides[`${prefix}.heading`]?.height ?? 0;
    return Math.max(naturalH, savedH);
  }

  return (
    <BulletEditCtx.Provider value={bulletEditCtxValue}>
      <>
        {allBlockIds.map(bid => {
          const content = renderContent(bid);
          if (!content) return null;
          let cp = computedPositions[bid];
          if (!cp) return null;
          const isHeading = bid.endsWith(".heading");
          const sectionPrefix = isHeading ? bid.replace(".heading", "") : bid.split(".")[0];

          // Group rotation: when a work/edu heading is rotated, orbit its entries around
          // the group center so they follow the heading as a rigid body.
          // The heading itself stays at its natural position and CSS-rotates in place
          // (moving it would disconnect it from its selection box / groupHeight area).
          //
          // Orbit uses NATURAL positions (without visualDy/visualDx overrides) so the
          // orbit center is stable. Any user-applied visual displacement is then
          // re-applied in the rotated coordinate frame, keeping manual tweaks intact.
          let entryAdditionalRotation: number | undefined;
          if (bid.startsWith("work.") || bid.startsWith("edu.")) {
            const headingBid = isHeading ? bid : `${sectionPrefix}.heading`;
            // Live rotation during drag takes priority over saved override
            const liveRot    = groupRotation?.prefix === sectionPrefix + "." ? groupRotation.rot : undefined;
            const headingRot = liveRot ?? overrides[headingBid]?.rotation ?? 0;
            const headingCp  = computedPositions[headingBid];
            if (headingRot !== 0 && headingCp && !isHeading) {
              const θ    = headingRot * Math.PI / 180;
              const cosT = Math.cos(θ), sinT = Math.sin(θ);
              // Use the same rendered height that DraggableBlock rotates. If the
              // user resized the outer section box, using only the natural height here
              // produces a different rotation center and makes entries fly outside.
              const renderedGroupH = sectionRenderedGroupHeight(sectionPrefix);
              const gcx  = headingCp.x + headingCp.w / 2;
              const gcy  = headingCp.y + renderedGroupH / 2;

              // Strip visualDy/visualDx before orbit so the rotation center is stable
              // regardless of how the entry was manually positioned.
              const vdx = overrides[bid]?.visualDx ?? 0;
              const vdy = overrides[bid]?.visualDy ?? 0;
              const natCx = cp.x - vdx + cp.w / 2;
              const natCy = cp.y - vdy + cp.h / 2;

              const relX = natCx - gcx, relY = natCy - gcy;
              // CSS uses screen coordinates (x right, y down), so positive rotate()
              // angles use this matrix for the same clockwise visual rotation.
              const orbitCx = gcx + relX * cosT - relY * sinT;
              const orbitCy = gcy + relX * sinT + relY * cosT;

              // Re-apply visual displacement in that same rotated coordinate frame.
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
                  const prefix = bid.replace(".heading", ".");
                  const entryBids = allBlockIds.filter(b => b.startsWith(prefix) && !b.endsWith(".heading"));
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
                setGroupHoveredSection(blockId ? blockId.split(".")[0] : null);
                onHoverBlock(blockId);
              }}
              onBlockClick={onBlockClick}
              onRotate={isHeading ? rot => setGroupRotation({ prefix: bid.replace(".heading", "."), rot }) : undefined}
              onRotateEnd={isHeading ? () => setGroupRotation(null) : undefined}
              onDragMove={isHeading ? (dy, dx) => setGroupDrag({ prefix: bid.replace(".heading", "."), dy, dx }) : undefined}
              onDragEnd={isHeading ? (dx, dy) => {
                // One atomic onDesignChange: heading flowDisplacementY + visualDx,
                // plus entries' visualDx propagation. Must be one call so React
                // batching doesn't clobber the heading's flowDisplacementY.
                const prefix = bid.replace(".heading", ".");
                const entryBids = allBlockIds.filter(b => b.startsWith(prefix) && !b.endsWith(".heading"));
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
                if (!groupDrag || isHeading) return 0;
                return bid.startsWith(groupDrag.prefix) ? groupDrag.dy : 0;
              })()}
              additionalDx={(() => {
                if (!groupDrag || isHeading) return 0;
                return bid.startsWith(groupDrag.prefix) ? groupDrag.dx : 0;
              })()}
              groupHeight={isHeading ? sectionGroupHeight(sectionPrefix) : undefined}
              forcedHover={isHeading && groupHoveredSection === sectionPrefix}
            >
              {content}
            </DraggableBlock>
          );
        })}
      </>
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

export default function ResumeCanvas({ data, onDesignChange, onDataChange, containerWidth, remeasureKey = 0 }: ResumeCanvasProps) {
  // Merge with DEFAULT_DESIGN so partial design objects (e.g. only layoutOverrides set)
  // don't break the canvas — any missing field falls back to the default.
  const d = data.design ? { ...DEFAULT_DESIGN, ...data.design } : DEFAULT_DESIGN;
  const [PAGE_W, PAGE_H] = d.pageSize === "A4" ? [595, 842] : [612, 792];
  const scale = containerWidth > 0 ? containerWidth / PAGE_W : 1;

  const [selected,      setSelected]     = useState<SelectableKey | null>(null);
  const [anchorRect,    setAnchorRect]   = useState<DOMRect | null>(null);
  const [hovered,       setHovered]      = useState<SelectableKey | null>(null);
  const [rightKey,      setRightKey]     = useState<SelectableKey | null>(null);
  const [rightAnchor,   setRightAnchor]  = useState<DOMRect | null>(null);
  const [rightBlockId,  setRightBlockId] = useState<string | null>(null);
  const [hoveredBlock,  setHoveredBlock] = useState<string | null>(null);
  const [blockActionId, setBlockActionId]   = useState<string | null>(null);
  const [blockActionRect, setBlockActionRect] = useState<DOMRect | null>(null);

  function handleSelect(key: SelectableKey, el: HTMLElement) {
    setSelected(key);
    setAnchorRect(el.getBoundingClientRect());
    setRightKey(null); setRightAnchor(null);
  }

  function handleRightClick(key: SelectableKey, el: HTMLElement) {
    setRightKey(key);
    setRightAnchor(el.getBoundingClientRect());
    setRightBlockId(hoveredBlock);
    setSelected(null); setAnchorRect(null);
  }

  function clearSelection() {
    setSelected(null); setAnchorRect(null);
    setRightKey(null); setRightAnchor(null);
    setBlockActionId(null); setBlockActionRect(null);
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

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") clearSelection(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function changeTs(key: SelectableKey, partial: Partial<TextStyle>) {
    const current = d[key] as TextStyle & Record<string, unknown>;
    onDesignChange({ ...d, [key]: { ...current, ...partial } });
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

  const ctx: SelectCtx = {
    selected,
    hovered,
    onSelect:      handleSelect,
    onHover:       setHovered,
    onClearSelect: clearSelection,
    onRightClick:  handleRightClick,
  };

  return (
    <div onClick={clearSelection}>

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
          ? `${ELEMENT_LABELS[hovered]} — click · right-click for more · double-click to edit`
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

      {/* Scaled resume page */}
      <div style={{ width: containerWidth, height: PAGE_H * scale, position: "relative", flexShrink: 0 }}>
        <div style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: PAGE_W,
          height: PAGE_H,
          backgroundColor: d.pageBackground,
          boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
          overflow: "hidden",
          boxSizing: "border-box",
          position: "relative",
        }}>
          <FreeFormLayout
            data={data}
            d={d}
            ctx={ctx}
            setData={onDataChange}
            scale={scale}
            pageW={PAGE_W}
            remeasureKey={remeasureKey}
            onDesignChange={onDesignChange}
            onHoverBlock={setHoveredBlock}
            onBlockClick={handleBlockClick}
          />
        </div>
      </div>

      {/* Context toolbar — single click */}
      {selected && anchorRect && createPortal(
        <ContextToolbar
          elementKey={selected}
          design={d}
          anchorRect={anchorRect}
          onChangeTs={changeTs}
          onOpenFull={() => handleRightClick(selected, { getBoundingClientRect: () => anchorRect } as HTMLElement)}
          onClose={clearSelection}
        />,
        document.body
      )}

      {/* Block action bar — click on an entry section */}
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

      {/* Full style popover — right-click or ⋯ */}
      {rightKey && rightAnchor && createPortal(
        <StylePopover
          elementKey={rightKey}
          design={d}
          anchorRect={rightAnchor}
          onChangeTs={changeTs}
          onChangeDesign={partial => onDesignChange({ ...d, ...partial })}
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
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 4,
  background: "none", border: "none",
  cursor: "pointer", color: "#374151",
  flexShrink: 0,
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
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 6px",
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
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
  elementKey, design, anchorRect, onChangeTs, onOpenFull, onClose,
}: {
  elementKey: SelectableKey;
  design: ResumeDesign;
  anchorRect: DOMRect;
  onChangeTs: (key: SelectableKey, partial: Partial<TextStyle>) => void;
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
  const active  = (on: boolean): CSSProperties => ({ ...TB_BTN, background: on ? "#ede9fe" : "none", color: on ? "#7c3aed" : "#374151" });

  return (
    <div
      ref={tbRef}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, zIndex: 9999,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        display: "flex", alignItems: "center", gap: 2,
        padding: "4px 6px",
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {/* Element label */}
      <span style={{ fontSize: 10, color: "#9ca3af", paddingRight: 6, borderRight: "1px solid #e5e7eb", marginRight: 2, whiteSpace: "nowrap" }}>
        {ELEMENT_LABELS[elementKey]}
      </span>

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
  anchorRect: DOMRect;
  onChangeTs: (key: SelectableKey, partial: Partial<TextStyle>) => void;
  onChangeDesign: (partial: Partial<ResumeDesign>) => void;
  onClose: () => void;
  blockId?: string | null;
  onChangeBlock?: (id: string, partial: Partial<LayoutOverride>) => void;
}

function StylePopover({ elementKey, design: d, anchorRect, onChangeTs, onChangeDesign, onClose, blockId, onChangeBlock }: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const s = d[elementKey] as TextStyle & Record<string, unknown>;
  const set = (p: Partial<TextStyle>) => onChangeTs(elementKey, p);

  const POP_W = 288;
  const margin = 10;
  const vp = { w: window.innerWidth, h: window.innerHeight };

  let left = anchorRect.right + margin;
  let top  = anchorRect.top;
  if (left + POP_W > vp.w - margin) left = anchorRect.left - POP_W - margin;
  if (left < margin) {
    left = Math.max(margin, Math.min(anchorRect.left, vp.w - POP_W - margin));
    top  = anchorRect.bottom + margin;
  }
  top = Math.max(margin, Math.min(top, vp.h - 500));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const lbl = (txt: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 3 }}>{txt}</div>
  );
  const row2 = (a: ReactNode, b: ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>{a}{b}</div>
  );
  const colorField = (label: string, value: string, onChange: (v: string) => void) => (
    <div>
      {lbl(label)}
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <input type="color" value={value.startsWith("#") ? value : "#ffffff"} onChange={e => onChange(e.target.value)}
          style={{ width: 26, height: 22, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 3, padding: 1, flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, fontSize: 11, fontFamily: "monospace", border: "1px solid #e5e7eb", borderRadius: 3, padding: "2px 5px" }} />
      </div>
    </div>
  );
  const sliderField = (label: string, value: number, onChange: (v: number) => void, min = 0, max = 100, step = 0.5) => (
    <div>
      {lbl(label)}
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
          style={{ flex: 1, accentColor: "#7c3aed", height: 14 }} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
          style={{ width: 42, fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 3, padding: "2px 4px", textAlign: "right" as const }} />
      </div>
    </div>
  );
  const selectField = (label: string, value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) => (
    <div>
      {lbl(label)}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 3, padding: "3px 5px" }}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  const textField = (label: string, value: string, onChange: (v: string) => void, maxLen = 20) => (
    <div>
      {lbl(label)}
      <input type="text" value={value} onChange={e => onChange(e.target.value)} maxLength={maxLen}
        style={{ width: "100%", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 3, padding: "3px 6px", boxSizing: "border-box" as const }} />
    </div>
  );
  const toggleField = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, color: "#374151" }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)} style={{
        width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
        background: value ? "#7c3aed" : "#d1d5db", position: "relative" as const, flexShrink: 0,
      }}>
        <span style={{
          position: "absolute" as const, top: 1, left: value ? 15 : 1, width: 16, height: 16,
          borderRadius: "50%", background: "#fff", transition: "left 0.12s",
        }} />
      </button>
    </div>
  );

  return (
    <div
      ref={popRef}
      style={{
        position: "fixed" as const, zIndex: 9999, top, left, width: POP_W,
        background: "#fff",
        border: "1.5px solid #ede9fe",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(124,58,237,0.18), 0 2px 8px rgba(0,0,0,0.08)",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ background: "#7c3aed", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>✏ {ELEMENT_LABELS[elementKey]}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, opacity: 0.8 }}>×</button>
      </div>

      <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column" as const, gap: 10, maxHeight: 440, overflowY: "auto" as const }}>

        {selectField("Font family", s.fontFamily as string, v => set({ fontFamily: v as FontFamily }), FONTS)}
        {row2(
          sliderField("Font size (pt)", s.fontSize as number, v => set({ fontSize: v }), 7, 48, 0.5),
          colorField("Text colour", s.color as string, v => set({ color: v })),
        )}
        <div>
          {lbl("Alignment")}
          <div style={{ display: "flex", gap: 4 }}>
            {(["left","center","right"] as const).map(a => (
              <button key={a} onClick={() => set({ textAlign: a })} style={{
                flex: 1, padding: "4px 0", border: "1px solid #e5e7eb", borderRadius: 4,
                background: (s.textAlign ?? "left") === a ? "#ede9fe" : "transparent",
                cursor: "pointer", fontSize: 13, color: (s.textAlign ?? "left") === a ? "#7c3aed" : "#374151",
              }}>
                <AlignIcon align={a} size={14} />
              </button>
            ))}
          </div>
        </div>
        {row2(
          sliderField("Letter spacing", (s.letterSpacing ?? 0) as number, v => set({ letterSpacing: v }), -2, 10, 0.5),
          sliderField("Line height", (s.lineHeight ?? 1.2) as number, v => set({ lineHeight: v }), 1, 3, 0.05),
        )}
        {(elementKey === "name" || elementKey === "sectionHeading") &&
          selectField("Text transform", (s.textTransform ?? "none") as string,
            v => set({ textTransform: v as "none" | "uppercase" | "lowercase" | "capitalize" }), [
            { value: "none",       label: "None" },
            { value: "uppercase",  label: "UPPERCASE" },
            { value: "lowercase",  label: "lowercase" },
            { value: "capitalize", label: "Capitalize Each Word" },
          ])
        }
        {row2(
          sliderField("Space above (pt)", (s.marginTop ?? 0) as number, v => set({ marginTop: v }), 0, 40),
          sliderField("Space below (pt)", (s.marginBottom ?? 0) as number, v => set({ marginBottom: v }), 0, 40),
        )}
        {(elementKey === "skillItem" || elementKey === "name" || elementKey === "sectionHeading") &&
          colorField("Background colour", (s.backgroundColor ?? "transparent") as string, v => set({ backgroundColor: v }))
        }
        {elementKey === "skillItem" && row2(
          sliderField("Padding H (pt)", (s.paddingLeft ?? 0) as number, v => set({ paddingLeft: v, paddingRight: v }), 0, 20),
          sliderField("Padding V (pt)", (s.paddingTop ?? 0) as number, v => set({ paddingTop: v, paddingBottom: v }), 0, 12),
        )}
        {elementKey === "skillItem" && sliderField("Corner radius", (s.borderRadius ?? 0) as number, v => set({ borderRadius: v }), 0, 16, 1)}
        {elementKey === "contact" &&
          textField("Separator between items", (s as { separator?: string }).separator ?? " · ",
            v => onChangeDesign({ contact: { ...d.contact, separator: v } }), 10)
        }
        {elementKey === "entryDate" &&
          selectField("Position", (s as { position?: string }).position ?? "right",
            v => onChangeDesign({ entryDate: { ...d.entryDate, position: v as "right" | "below" } }), [
              { value: "right", label: "Right of title (inline)" },
              { value: "below", label: "Below title" },
            ])
        }
        {elementKey === "entryBullet" && <>
          {row2(
            textField("Bullet character", d.bulletMarkerChar, v => onChangeDesign({ bulletMarkerChar: v || "•" }), 2),
            colorField("Bullet colour", d.bulletMarkerColor, v => onChangeDesign({ bulletMarkerColor: v })),
          )}
          {sliderField("Marker indent (pt)", d.bulletMarkerWidth, v => onChangeDesign({ bulletMarkerWidth: v }), 6, 24, 1)}
        </>}
        {elementKey === "sectionHeading" && <>
          {toggleField("Rule line under heading", d.sectionRuleShow, v => onChangeDesign({ sectionRuleShow: v }))}
          {d.sectionRuleShow && row2(
            colorField("Rule colour", d.sectionRuleColor, v => onChangeDesign({ sectionRuleColor: v })),
            sliderField("Thickness", d.sectionRuleThickness, v => onChangeDesign({ sectionRuleThickness: v }), 0.5, 4, 0.5),
          )}
        </>}
        {elementKey === "skillItem" &&
          selectField("Display style", d.skillDisplay, v => onChangeDesign({ skillDisplay: v as typeof d.skillDisplay }), [
            { value: "tags",   label: "Tags / pills" },
            { value: "list",   label: "Bulleted list" },
            { value: "inline", label: "Inline (comma separated)" },
            { value: "grid",   label: "Grid" },
          ])
        }
        {(elementKey === "entryTitle" || elementKey === "entryOrg") &&
          sliderField("Space between entries (pt)", d.entrySpacing, v => onChangeDesign({ entrySpacing: v }), 2, 30)
        }

        {/* Block-level: rotation + position overrides */}
        {blockId && onChangeBlock && (() => {
          const ov = d.layoutOverrides?.[blockId] ?? {};
          return (
            <>
              <div style={{ height: 1, background: "#f0e9ff", margin: "4px 0" }} />
              {sliderField("Rotation (°)", ov.rotation ?? 0,
                v => onChangeBlock(blockId, { rotation: v || undefined }), -180, 180, 1)}
              {row2(
                sliderField("Horizontal offset (pt)", Math.round(ov.visualDx ?? 0),
                  v => onChangeBlock(blockId, { visualDx: v || undefined }), -300, 300, 1),
                sliderField("Vertical displacement (pt)", Math.round(ov.flowDisplacementY ?? 0),
                  v => onChangeBlock(blockId, { flowDisplacementY: v || undefined }), -500, 500, 1),
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}