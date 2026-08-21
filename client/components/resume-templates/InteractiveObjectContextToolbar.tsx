import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  MoreHorizontal,
  Pencil,
  ArrowDown,
  ArrowUp,
  Layers3,
  Lock,
  Unlock,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type {
  InteractiveObjectAppearance,
  InteractiveObjectGeometry,
  InteractiveSceneObject,
} from "./resumeInteractive";

const FONT_OPTIONS = [
  {
    label: "System",
    value:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Trebuchet", value: '"Trebuchet MS", Arial, sans-serif' },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  {
    label: "Mono",
    value:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
] as const;

function appearanceFor(
  object: InteractiveSceneObject,
): InteractiveObjectAppearance {
  return {
    variant: object.appearance?.variant ?? "card",
    ...(object.appearance ?? {}),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function Popup({
  children,
  anchorRef,
  popupRef,
  align = "right",
  side = "bottom",
}: {
  children: ReactNode;
  anchorRef: RefObject<HTMLElement | null>;
  popupRef: RefObject<HTMLDivElement | null>;
  align?: "left" | "right";
  side?: "top" | "bottom";
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const popupWidth = popupRef.current?.offsetWidth || 220;
      const popupHeight = popupRef.current?.offsetHeight || 180;
      const gap = 8;
      const edge = 8;

      let left = align === "left" ? rect.left : rect.right - popupWidth;
      left = clamp(left, edge, Math.max(edge, window.innerWidth - popupWidth - edge));

      const preferredTop =
        side === "top" ? rect.top - popupHeight - gap : rect.bottom + gap;
      const alternateTop =
        side === "top" ? rect.bottom + gap : rect.top - popupHeight - gap;
      const preferredFits =
        preferredTop >= edge &&
        preferredTop + popupHeight <= window.innerHeight - edge;
      const alternateFits =
        alternateTop >= edge &&
        alternateTop + popupHeight <= window.innerHeight - edge;

      let top = preferredFits
        ? preferredTop
        : alternateFits
          ? alternateTop
          : clamp(
              preferredTop,
              edge,
              Math.max(edge, window.innerHeight - popupHeight - edge),
            );

      setPosition({ left, top });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, anchorRef, popupRef, side]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[5000] w-[220px] rounded-xl border border-border bg-background p-3 shadow-xl"
      style={{
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        visibility: position ? "visible" : "hidden",
      }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export default function InteractiveObjectContextToolbar({
  object,
  geometry,
  sceneWidth,
  sceneHeight,
  onUpdateObject,
  onOpacityChange,
  selectionCount = 1,
  isGrouped = false,
  groupName,
  allLocked = false,
  canBringForward = true,
  canSendBackward = true,
  onArrange,
  onToggleLock,
  onToggleGroup,
  onGroupNameChange,
}: {
  object: InteractiveSceneObject;
  geometry: InteractiveObjectGeometry;
  sceneWidth: number;
  sceneHeight: number;
  onUpdateObject: (
    updater: (object: InteractiveSceneObject) => InteractiveSceneObject,
  ) => void;
  onOpacityChange: (opacity: number) => void;
  selectionCount?: number;
  isGrouped?: boolean;
  groupName?: string;
  allLocked?: boolean;
  canBringForward?: boolean;
  canSendBackward?: boolean;
  onArrange?: (action: "front" | "forward" | "backward") => void;
  onToggleLock?: () => void;
  onToggleGroup?: () => void;
  onGroupNameChange?: (name: string) => void;
}) {
  const [openPopover, setOpenPopover] = useState<
    "opacity" | "border" | "more" | "arrange" | "groupName" | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const borderButtonRef = useRef<HTMLButtonElement>(null);
  const opacityButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const arrangeButtonRef = useRef<HTMLButtonElement>(null);
  const groupNameButtonRef = useRef<HTMLButtonElement>(null);
  const [groupNameDraft, setGroupNameDraft] = useState(groupName ?? "Group");

  useEffect(() => {
    setOpenPopover(null);
  }, [object.id]);

  useEffect(() => {
    setGroupNameDraft(groupName ?? "Group");
  }, [groupName]);

  useEffect(() => {
    if (!openPopover) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        !target ||
        rootRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpenPopover(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPopover]);

  const appearance = appearanceFor(object);
  const centerX = geometry.x + geometry.width / 2;
  const centerRatio = sceneWidth ? centerX / sceneWidth : 0.5;
  const showBelow = geometry.y < Math.max(72, sceneHeight * 0.09);
  const anchorTop = showBelow
    ? ((geometry.y + geometry.height) / sceneHeight) * 100
    : (geometry.y / sceneHeight) * 100;

  const centered = centerRatio >= 0.3 && centerRatio <= 0.7;
  const horizontalStyle: CSSProperties =
    centerRatio < 0.3
      ? { left: 8 }
      : centerRatio > 0.7
        ? { right: 8 }
        : { left: `${clamp(centerRatio * 100, 30, 70)}%` };

  const transforms = [
    centered ? "translateX(-50%)" : "",
    showBelow ? "" : "translateY(-100%)",
  ].filter(Boolean);

  const rootStyle: CSSProperties = {
    ...horizontalStyle,
    top: `${clamp(anchorTop, 0, 100)}%`,
    marginTop: showBelow ? 10 : -10,
    transform: transforms.length ? transforms.join(" ") : undefined,
  };

  const patchAppearance = (patch: Partial<InteractiveObjectAppearance>) => {
    onUpdateObject(current => ({
      ...current,
      appearance: {
        variant: current.appearance?.variant ?? "card",
        ...(current.appearance ?? {}),
        ...patch,
      },
    } as InteractiveSceneObject));
  };

  const stop = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const textAlign = appearance.textAlign ?? "left";
  const fontWeight = appearance.fontWeight ?? 650;
  const fontSize = appearance.fontSize ?? 24;
  const fontFamily =
    appearance.fontFamily ??
    (appearance.variant === "terminal"
      ? FONT_OPTIONS[4].value
      : FONT_OPTIONS[0].value);
  const fontStyle = appearance.fontStyle ?? "normal";
  const lineHeight = appearance.lineHeight ?? 1.35;
  const letterSpacing = appearance.letterSpacing ?? 0;

  // Locked objects/groups deliberately collapse to a single recovery action.
  // This keeps the contextual toolbar from looking editable while canvas
  // manipulation is protected; Layers remains another reliable unlock surface.
  if (allLocked && onToggleLock) {
    return (
      <div
        ref={rootRef}
        className="absolute z-[650] max-w-[calc(100%-16px)]"
        style={rootStyle}
        onPointerDown={stop}
        onClick={event => event.stopPropagation()}
        role="toolbar"
        aria-label={
          selectionCount > 1
            ? `${selectionCount} locked objects`
            : `${object.name} locked`
        }
      >
        <div className="flex items-center overflow-visible rounded-xl border border-amber-300/80 bg-background/95 p-1.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={onToggleLock}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-100"
          >
            <Unlock size={13} />
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute z-[650] max-w-[calc(100%-16px)]"
      style={rootStyle}
      onPointerDown={stop}
      onClick={event => event.stopPropagation()}
      role="toolbar"
      aria-label={
        selectionCount > 1
          ? `${selectionCount} selected object controls`
          : `${object.name} formatting controls`
      }
    >
      <div className="flex max-w-full flex-wrap items-center gap-1 overflow-visible rounded-xl border border-[#2e0562]/20 bg-background/95 p-1.5 shadow-xl backdrop-blur">
        {selectionCount > 1 && (
          <>
            <span className="flex h-8 items-center rounded-lg bg-muted/55 px-2.5 text-[12px] font-semibold text-foreground">
              {selectionCount} selected
            </span>

            {isGrouped && onGroupNameChange && (
              <div className="relative">
                <button
                  ref={groupNameButtonRef}
                  type="button"
                  onClick={() =>
                    setOpenPopover(current =>
                      current === "groupName" ? null : "groupName",
                    )
                  }
                  aria-expanded={openPopover === "groupName"}
                  className="flex h-8 max-w-[150px] items-center gap-1.5 rounded-lg border border-[#2e0562]/20 bg-[#2e0562]/5 px-2.5 text-[12px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/10"
                  title={groupName || "Rename group"}
                >
                  <Pencil size={12} className="shrink-0" />
                  <span className="truncate">{groupName || "Group"}</span>
                </button>
                {openPopover === "groupName" && (
                  <Popup
                    anchorRef={groupNameButtonRef}
                    popupRef={popupRef}
                    align="left"
                    side={showBelow ? "bottom" : "top"}
                  >
                    <div className="text-[12px] font-semibold text-foreground">Group name</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Name this group so it is easier to recognize while editing.
                    </p>
                    <input
                      autoFocus
                      value={groupNameDraft}
                      onChange={event => setGroupNameDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const nextName = groupNameDraft.trim() || "Group";
                          onGroupNameChange(nextName);
                          setOpenPopover(null);
                        }
                      }}
                      aria-label="Group name"
                      className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none focus:border-[#2e0562]/45 focus:ring-2 focus:ring-[#2e0562]/10"
                    />
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupNameDraft(groupName ?? "Group");
                          setOpenPopover(null);
                        }}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextName = groupNameDraft.trim() || "Group";
                          onGroupNameChange(nextName);
                          setOpenPopover(null);
                        }}
                        className="rounded-lg bg-[#2e0562] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#24044f]"
                      >
                        Save
                      </button>
                    </div>
                  </Popup>
                )}
              </div>
            )}

            {onToggleGroup && (
              <button
                type="button"
                onClick={onToggleGroup}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <Layers3 size={13} />
                {isGrouped ? "Ungroup" : "Group"}
              </button>
            )}

            {onArrange && (
              <div className="relative">
                <button
                  ref={arrangeButtonRef}
                  type="button"
                  onClick={() =>
                    setOpenPopover(current =>
                      current === "arrange" ? null : "arrange",
                    )
                  }
                  aria-expanded={openPopover === "arrange"}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Arrange
                  <ChevronDown size={12} />
                </button>
                {openPopover === "arrange" && (
                  <Popup
                    anchorRef={arrangeButtonRef}
                    popupRef={popupRef}
                    align="left"
                    side={showBelow ? "bottom" : "top"}
                  >
                    <div className="text-[12px] font-semibold text-foreground">{isGrouped ? "Arrange group" : "Arrange selection"}</div>
                    <div className="mt-2 space-y-1">
                      <button type="button" disabled={!canBringForward} onClick={() => { onArrange("front"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                        <Layers3 size={14} /> Bring to front
                      </button>
                      <button type="button" disabled={!canBringForward} onClick={() => { onArrange("forward"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                        <ArrowUp size={14} /> Bring forward
                      </button>
                      <button type="button" disabled={!canSendBackward} onClick={() => { onArrange("backward"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                        <ArrowDown size={14} /> Send backward
                      </button>
                    </div>
                  </Popup>
                )}
              </div>
            )}

            {onToggleLock && (
              <button
                type="button"
                onClick={onToggleLock}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold ${
                  allLocked
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {allLocked ? <Unlock size={13} /> : <Lock size={13} />}
                {allLocked ? "Unlock" : "Lock"}
              </button>
            )}
          </>
        )}

        {selectionCount === 1 && (
          <>
        {object.type === "text" && (
          <>
            <select
              aria-label="Font family"
              value={fontFamily}
              onChange={event => patchAppearance({ fontFamily: event.target.value })}
              className="h-8 min-w-[104px] rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-foreground outline-none"
            >
              {FONT_OPTIONS.map(option => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="flex h-8 items-center rounded-lg border border-border bg-background px-1.5">
              <span className="sr-only">Font size</span>
              <input
                type="number"
                min={8}
                max={160}
                step={1}
                value={fontSize}
                onChange={event => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    patchAppearance({ fontSize: clamp(value, 8, 160) });
                  }
                }}
                className="w-[42px] bg-transparent text-center text-[12px] font-semibold text-foreground outline-none"
                aria-label="Font size"
              />
              <span className="text-[11px] text-muted-foreground">px</span>
            </label>

            <button
              type="button"
              aria-label="Bold"
              aria-pressed={fontWeight >= 700}
              onClick={() =>
                patchAppearance({ fontWeight: fontWeight >= 700 ? 400 : 700 })
              }
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${
                fontWeight >= 700
                  ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bold size={14} />
            </button>

            <button
              type="button"
              aria-label="Italic"
              aria-pressed={fontStyle === "italic"}
              onClick={() =>
                patchAppearance({
                  fontStyle: fontStyle === "italic" ? "normal" : "italic",
                })
              }
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${
                fontStyle === "italic"
                  ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Italic size={14} />
            </button>

            <label
              className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-border bg-background"
              title="Text color"
            >
              <input
                type="color"
                value={appearance.textColor ?? "#2e0562"}
                onChange={event => patchAppearance({ textColor: event.target.value })}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Text color"
              />
            </label>

            <div className="flex rounded-lg border border-border bg-background p-0.5">
              {[
                ["left", AlignLeft, "Align left"],
                ["center", AlignCenter, "Align center"],
                ["right", AlignRight, "Align right"],
              ].map(([value, Icon, label]) => {
                const active = textAlign === value;
                const AlignmentIcon = Icon as typeof AlignLeft;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    aria-label={String(label)}
                    aria-pressed={active}
                    onClick={() =>
                      patchAppearance({
                        textAlign: value as "left" | "center" | "right",
                      })
                    }
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${
                      active
                        ? "bg-[#2e0562]/8 text-[#2e0562]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <AlignmentIcon size={13} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {object.type === "shape" && (
          <>
            <label className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground">
              Shape
              <select
                value={object.shape}
                onChange={event =>
                  onUpdateObject(current =>
                    current.type === "shape"
                      ? {
                          ...current,
                          shape: event.target.value as
                            | "rectangle"
                            | "ellipse"
                            | "line",
                        }
                      : current,
                  )
                }
                className="bg-transparent text-[12px] font-semibold text-foreground outline-none"
                aria-label="Shape type"
              >
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="line">Line</option>
              </select>
            </label>

            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground">
              Fill
              <input
                type="color"
                value={object.fill || "#ede9fe"}
                onChange={event =>
                  onUpdateObject(current =>
                    current.type === "shape"
                      ? { ...current, fill: event.target.value }
                      : current,
                  )
                }
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Shape fill"
              />
            </label>

            <div className="relative">
              <button
                ref={borderButtonRef}
                type="button"
                onClick={() =>
                  setOpenPopover(current =>
                    current === "border" ? null : "border",
                  )
                }
                aria-expanded={openPopover === "border"}
                className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Border
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-sm border"
                  style={{
                    borderColor: object.stroke || "#7c3aed",
                    borderWidth: Math.max(1, Math.min(3, object.strokeWidth ?? 0)),
                    background: (object.strokeWidth ?? 0) > 0 ? "transparent" : "currentColor",
                    opacity: (object.strokeWidth ?? 0) > 0 ? 1 : 0.25,
                  }}
                />
                <ChevronDown size={12} />
              </button>

              {openPopover === "border" && (
                <Popup
                  anchorRef={borderButtonRef}
                  popupRef={popupRef}
                  align="left"
                  side={showBelow ? "bottom" : "top"}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-semibold text-foreground">
                        Border
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Add an outline to this shape.
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={(object.strokeWidth ?? 0) > 0}
                      onClick={() =>
                        onUpdateObject(current =>
                          current.type === "shape"
                            ? {
                                ...current,
                                strokeWidth:
                                  (current.strokeWidth ?? 0) > 0
                                    ? 0
                                    : 2,
                              }
                            : current,
                        )
                      }
                      className={`min-h-8 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${
                        (object.strokeWidth ?? 0) > 0
                          ? "border-[#2e0562]/30 bg-[#2e0562]/8 text-[#2e0562]"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {(object.strokeWidth ?? 0) > 0
                        ? "Remove border"
                        : "Add border"}
                    </button>
                  </div>

                  {(object.strokeWidth ?? 0) > 0 && (
                    <>
                      <label className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-muted-foreground">
                          Color
                        </span>
                        <input
                          type="color"
                          value={object.stroke || "#7c3aed"}
                          onChange={event =>
                            onUpdateObject(current =>
                              current.type === "shape"
                                ? { ...current, stroke: event.target.value }
                                : current,
                            )
                          }
                          className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                          aria-label="Shape border color"
                        />
                      </label>

                      <label className="mt-3 block">
                        <span className="mb-1 flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                          <span>Width</span>
                          <span>{object.strokeWidth ?? 2}px</span>
                        </span>
                        <input
                          type="range"
                          min={0.5}
                          max={20}
                          step={0.5}
                          value={Math.max(0.5, object.strokeWidth ?? 2)}
                          onChange={event =>
                            onUpdateObject(current =>
                              current.type === "shape"
                                ? {
                                    ...current,
                                    strokeWidth: Number(event.target.value),
                                  }
                                : current,
                            )
                          }
                          className="w-full"
                          aria-label="Shape border width"
                        />
                      </label>
                    </>
                  )}
                </Popup>
              )}
            </div>
          </>
        )}

        {object.type === "image" && (
          <label className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground">
            Fit
            <select
              value={object.fit ?? "cover"}
              onChange={event =>
                onUpdateObject(current =>
                  current.type === "image"
                    ? {
                        ...current,
                        fit: event.target.value as "cover" | "contain" | "stretch",
                      }
                    : current,
                )
              }
              className="bg-transparent text-[12px] font-semibold text-foreground outline-none"
              aria-label="Image fit"
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
        )}

        {object.type === "resume-content" && (
          <>
            <select
              aria-label="Content font family"
              value={fontFamily}
              onChange={event => patchAppearance({ fontFamily: event.target.value })}
              className="h-8 min-w-[104px] rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-foreground outline-none"
            >
              {FONT_OPTIONS.map(option => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground">
              Surface
              <select
                value={appearance.variant}
                onChange={event =>
                  patchAppearance({
                    variant: event.target.value as InteractiveObjectAppearance["variant"],
                  })
                }
                className="bg-transparent text-[12px] font-semibold text-foreground outline-none"
                aria-label="Content surface"
              >
                <option value="card">Card</option>
                <option value="plain">Plain</option>
                <option value="glass">Glass</option>
                <option value="terminal">Terminal</option>
                <option value="accent">Accent</option>
              </select>
            </label>
            <label
              className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-border bg-background"
              title="Text color"
            >
              <input
                type="color"
                value={appearance.textColor ?? "#2e0562"}
                onChange={event => patchAppearance({ textColor: event.target.value })}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Text color"
              />
            </label>
          </>
        )}

        <div className="relative">
          <button
            ref={opacityButtonRef}
            type="button"
            onClick={() =>
              setOpenPopover(current =>
                current === "opacity" ? null : "opacity",
              )
            }
            aria-expanded={openPopover === "opacity"}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Opacity {Math.round(geometry.opacity * 100)}%
            <ChevronDown size={12} />
          </button>
          {openPopover === "opacity" && (
            <Popup
              anchorRef={opacityButtonRef}
              popupRef={popupRef}
              side={showBelow ? "bottom" : "top"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-foreground">
                  Opacity
                </span>
                <span className="text-[12px] font-semibold text-[#2e0562]">
                  {Math.round(geometry.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(geometry.opacity * 100)}
                onChange={event =>
                  onOpacityChange(clamp(Number(event.target.value) / 100, 0, 1))
                }
                className="mt-3 w-full"
                aria-label="Object opacity"
              />
            </Popup>
          )}
        </div>

        {onArrange && (
          <div className="relative">
            <button
              ref={arrangeButtonRef}
              type="button"
              onClick={() =>
                setOpenPopover(current =>
                  current === "arrange" ? null : "arrange",
                )
              }
              aria-expanded={openPopover === "arrange"}
              className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Arrange
              <ChevronDown size={12} />
            </button>
            {openPopover === "arrange" && (
              <Popup
                anchorRef={arrangeButtonRef}
                popupRef={popupRef}
                align="left"
                side={showBelow ? "bottom" : "top"}
              >
                <div className="text-[12px] font-semibold text-foreground">Arrange</div>
                <div className="mt-2 space-y-1">
                  <button type="button" disabled={!canBringForward} onClick={() => { onArrange("front"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                    <Layers3 size={14} /> Bring to front
                  </button>
                  <button type="button" disabled={!canBringForward} onClick={() => { onArrange("forward"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                    <ArrowUp size={14} /> Bring forward
                  </button>
                  <button type="button" disabled={!canSendBackward} onClick={() => { onArrange("backward"); setOpenPopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-35">
                    <ArrowDown size={14} /> Send backward
                  </button>
                </div>
              </Popup>
            )}
          </div>
        )}

        {onToggleLock && (
          <button
            type="button"
            onClick={onToggleLock}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold ${
              allLocked
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {allLocked ? <Unlock size={13} /> : <Lock size={13} />}
            {allLocked ? "Unlock" : "Lock"}
          </button>
        )}

        {object.type === "text" && (
          <div className="relative">
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() =>
                setOpenPopover(current => (current === "more" ? null : "more"))
              }
              aria-label="More text formatting"
              aria-expanded={openPopover === "more"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal size={15} />
            </button>
            {openPopover === "more" && (
              <Popup
                anchorRef={moreButtonRef}
                popupRef={popupRef}
                side={showBelow ? "bottom" : "top"}
              >
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                    <span>Line height</span>
                    <span>{lineHeight.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.8}
                    max={2.4}
                    step={0.05}
                    value={lineHeight}
                    onChange={event =>
                      patchAppearance({ lineHeight: Number(event.target.value) })
                    }
                    className="w-full"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                    <span>Letter spacing</span>
                    <span>{letterSpacing.toFixed(1)}px</span>
                  </span>
                  <input
                    type="range"
                    min={-2}
                    max={12}
                    step={0.25}
                    value={letterSpacing}
                    onChange={event =>
                      patchAppearance({ letterSpacing: Number(event.target.value) })
                    }
                    className="w-full"
                  />
                </label>
              </Popup>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
