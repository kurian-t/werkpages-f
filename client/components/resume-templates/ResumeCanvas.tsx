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
import { Link2, Unlink2, List, ListOrdered } from "lucide-react";
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

  // Reset when company or logoUrl changes so the logo refreshes without a page reload.
  useEffect(() => {
    const fresh = `https://img.logo.dev/${companyLogoDomain(company)}?token=${LOGO_TOKEN}`;
    setSrc(logoUrl ?? fresh);
    setFailed(false);
  }, [company, logoUrl]);

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
//
// Repeatable work-entry elements can also be LINKED. Linked peers share layout edits
// (move, resize, rotation) while their actual text/logo content remains entry-specific.
// The link state is persisted on the element's LayoutOverride so it survives remeasure,
// pagination remounts, and reloads without requiring a separate settings model.
type LinkableLayoutOverride = LayoutOverride & { linked?: boolean };

function linkedOverride(ov: LayoutOverride | undefined): LinkableLayoutOverride | undefined {
  return ov as LinkableLayoutOverride | undefined;
}

function SubDrag({ overrideKey, defaultWidth, design, inheritFrom, linkKeys, linkLabel, constrainToBounds = false, children }: {
  overrideKey: string;
  defaultWidth?: number;
  design?: ResumeDesign;
  inheritFrom?: string;
  linkKeys?: string[];
  linkLabel?: string;
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
  // obvious immediately — peers do not wait until mouse-up to snap into place.
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
    current.onDesignChange({ ...d, layoutOverrides });
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
      {/* Content wrapper — carries transform + rotation handle + resize handles */}
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
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              fontFamily: "system-ui, sans-serif",
              userSelect: "none",
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
              title={isLinked
                ? `${linkLabel ?? "Element"} is linked across roles`
                : `${linkLabel ?? "Element"} is independent`}
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
              {isLinked
                ? <><Link2 size={13} strokeWidth={2.1} /><span>Linked · {linkedPeerKeys(ctx.design).length}</span></>
                : <><Unlink2 size={13} strokeWidth={2} /><span>Unlinked</span></>}
            </button>
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
interface PageComputedPos extends ComputedPos { page: number }

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
      <div style={{
        ...base,
        opacity: 0.3,
        fontStyle: "italic",
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        boxSizing: "border-box",
      }}>
        Describe this role — use the editor on the left to add text and bullet points.
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
        <SubDrag overrideKey={`${pfx}.logo`} defaultWidth={20} design={d}
          linkKeys={workLinkKeys("logo")} linkLabel="Company logo">
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
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              fontFamily: "system-ui, sans-serif",
              userSelect: "none",
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
}

function FreeFormLayout({ data, d, ctx, setData, scale, pageW, pageH, remeasureKey, onDesignChange, onHoverBlock, onBlockClick }: FreeFormProps) {
  const sp: SectionProps = { data, d, ctx, setData };

  // ── Bullet editing state — lifted here so it survives pass-1 ↔ pass-2 remounts ──
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
    // ── Pass 1 — invisible continuous flow used only for measurement.
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

  // ── Pass 2 — paginate the measured flow, then render draggable blocks ───────
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
        const isRoleBlock = (bid.startsWith("work.") || bid.startsWith("edu.")) && !bid.endsWith(".heading");
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
        const isRoleBlock = (bid.startsWith("work.") || bid.startsWith("edu.")) && !bid.endsWith(".heading");
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

  function ContinuationSectionBox({ prefix, page }: { prefix: "work" | "education"; page: number }) {
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
              {/* Continuation pages get their own editor-only Experience/Education
                  fragment box. It shares the logical section rotation but uses this
                  page fragment's local center and position. */}
              {(["work", "education"] as const).map(prefix =>
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
  const [selectedSubDragKey, setSelectedSubDragKey] = useState<string | null>(null);

  function handleSelect(key: SelectableKey, el: HTMLElement) {
    setSelected(key);
    setAnchorRect(el.getBoundingClientRect());
    const subDrag = el.closest("[data-subdrag-key]") as HTMLElement | null;
    setSelectedSubDragKey(subDrag?.dataset.subdragKey ?? null);
    setRightKey(null); setRightAnchor(null);
  }

  function handleRightClick(key: SelectableKey, el: HTMLElement) {
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

  function linkKeysForSubDrag(key: string): string[] {
    const m = key.match(/^work\.[^.]+\.(logo|title|org|date|body)$/);
    if (!m) return [];
    const part = m[1];
    return data.workEntries.map(entry => `work.${entry.id}.${part}`);
  }

  function linkLabelForSubDrag(key: string): string {
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
      layoutOverrides[key] = cleanLinkOverride({
        ...existing,
        visualDx: existing.visualDx ?? source?.visualDx,
        visualDy: existing.visualDy ?? source?.visualDy,
        rotation: existing.rotation ?? source?.rotation,
        width: existing.width ?? source?.width,
        linked: false,
      });
    } else {
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

      {/* Paginated resume pages — FreeFormLayout owns the physical page shells so
          it can add page 2/3/etc. as soon as measured flow exceeds the current page. */}
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
      />

      {/* Context toolbar — single click */}
      {selected && anchorRect && createPortal(
        <ContextToolbar
          elementKey={selected}
          design={d}
          anchorRect={anchorRect}
          onChangeTs={changeTs}
          linkControl={selectedLinkControl}
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
  elementKey, design, anchorRect, onChangeTs, linkControl, onOpenFull, onClose,
}: {
  elementKey: SelectableKey;
  design: ResumeDesign;
  anchorRect: DOMRect;
  onChangeTs: (key: SelectableKey, partial: Partial<TextStyle>) => void;
  linkControl?: { label: string; linked: boolean; count: number; onToggle: () => void };
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

      {/* Linking is first because it controls the repeated layout relationship;
          everything after it is ordinary text styling. */}
      {linkControl && (
        <>
          <button
            type="button"
            title={linkControl.linked
              ? `${linkControl.label} is linked across roles`
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
            <span>{linkControl.linked ? `Linked · ${linkControl.count}` : "Unlinked"}</span>
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