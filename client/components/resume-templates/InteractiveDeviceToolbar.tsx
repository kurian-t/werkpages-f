import {
  ChevronDown,
  Monitor,
  RefreshCcw,
  Smartphone,
  Sparkles,
  Tablet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  INTERACTIVE_BREAKPOINT_VIEWPORTS,
  type InteractiveBreakpoint,
  type InteractiveScene,
} from "./resumeInteractive";

interface InteractiveDeviceToolbarProps {
  breakpoint: InteractiveBreakpoint;
  scene: InteractiveScene;
  layout: {
    width: number;
    height: number;
    scrollLength: number;
  };
  onBreakpointChange: (breakpoint: InteractiveBreakpoint) => void;
  onSceneSizeChange: (patch: { width?: number; height?: number }) => void;
  onAutoLayout: () => void;
  onResetDevice: () => void;
}

const DEVICES = [
  {
    id: "desktop" as const,
    label: "Desktop",
    icon: Monitor,
  },
  {
    id: "tablet" as const,
    label: "Tablet",
    icon: Tablet,
  },
  {
    id: "mobile" as const,
    label: "Mobile",
    icon: Smartphone,
  },
];

function deviceOverrideCount(
  scene: InteractiveScene,
  breakpoint: Exclude<InteractiveBreakpoint, "desktop">,
): number {
  return scene.objectOrder.reduce((count, objectId) => {
    return count + (scene.objects[objectId]?.responsive?.[breakpoint] ? 1 : 0);
  }, 0);
}

function hasDeviceOverrides(
  scene: InteractiveScene,
  breakpoint: Exclude<InteractiveBreakpoint, "desktop">,
): boolean {
  return Boolean(
    scene.responsive?.[breakpoint] ||
      deviceOverrideCount(scene, breakpoint) > 0,
  );
}


export default function InteractiveDeviceToolbar({
  breakpoint,
  scene,
  layout,
  onBreakpointChange,
  onSceneSizeChange,
  onAutoLayout,
  onResetDevice,
}: InteractiveDeviceToolbarProps) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizePopoverRef = useRef<HTMLDivElement>(null);

  const editableBreakpoint = breakpoint === "desktop" ? null : breakpoint;
  const overrideCount = editableBreakpoint
    ? deviceOverrideCount(scene, editableBreakpoint)
    : 0;
  const hasOverrides = editableBreakpoint
    ? hasDeviceOverrides(scene, editableBreakpoint)
    : false;

  const sizeStatus =
    breakpoint === "desktop"
      ? "Desktop base"
      : hasOverrides
        ? `Custom ${breakpoint}`
        : "Inherits Desktop";

  useEffect(() => {
    if (!sizeOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || sizePopoverRef.current?.contains(target)) return;
      setSizeOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSizeOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sizeOpen]);

  useEffect(() => {
    setSizeOpen(false);
  }, [breakpoint, scene.id]);

  return (
    <div className="mb-2 rounded-xl border border-border bg-card px-2.5 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Interactive device layout"
          className="grid min-w-[315px] flex-1 grid-cols-3 gap-1 rounded-lg bg-muted/35 p-1"
        >
          {DEVICES.map(device => {
            const Icon = device.icon;
            const active = breakpoint === device.id;
            const targetWidth = INTERACTIVE_BREAKPOINT_VIEWPORTS[device.id].width;
            const customized =
              device.id === "desktop"
                ? false
                : hasDeviceOverrides(scene, device.id);

            return (
              <button
                key={device.id}
                type="button"
                onClick={() => onBreakpointChange(device.id)}
                aria-pressed={active}
                title={
                  device.id === "desktop"
                    ? "Desktop is the base Interactive layout."
                    : customized
                      ? `${device.label} has custom scene or object overrides.`
                      : `${device.label} inherits Desktop until you edit or auto-layout it.`
                }
                className={`relative flex min-w-0 items-center justify-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${
                  active
                    ? "border-[#2e0562]/25 bg-background text-[#2e0562] shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
                }`}
              >
                <Icon size={14} className="flex-none" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold leading-tight">
                    {device.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-none text-muted-foreground">
                    {targetWidth}px
                  </span>
                </span>
                {device.id !== "desktop" && customized && (
                  <span
                    aria-label={`${device.label} customized`}
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#7c3aed]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <div ref={sizePopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setSizeOpen(open => !open)}
              aria-haspopup="dialog"
              aria-expanded={sizeOpen}
              title="Edit scene width and height"
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:border-[#2e0562]/25 hover:bg-[#2e0562]/[0.025] ${
                breakpoint === "desktop"
                  ? "border-border bg-muted/20"
                  : hasOverrides
                    ? "border-[#2e0562]/15 bg-[#2e0562]/[0.035]"
                    : "border-border bg-muted/20"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold leading-tight text-foreground">
                  Scene size
                </span>
                <span className="mt-0.5 block whitespace-nowrap text-[12px] leading-none text-muted-foreground">
                  {Math.round(layout.width)} × {Math.round(layout.height)}
                </span>
              </span>
              <ChevronDown
                size={13}
                className={`flex-none text-muted-foreground transition-transform ${sizeOpen ? "rotate-180" : ""}`}
              />
            </button>

            {sizeOpen && (
              <div
                role="dialog"
                aria-label={`${breakpoint} scene size`}
                className="absolute right-0 top-[calc(100%+8px)] z-[1500] w-[300px] rounded-xl border border-border bg-background p-3 shadow-xl"
              >
                <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground">
                  {breakpoint === "desktop"
                    ? "Scene size"
                    : `${breakpoint[0].toUpperCase() + breakpoint.slice(1)} scene size`}
                </div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {sizeStatus}
                  {editableBreakpoint && !hasOverrides
                    ? " · changing either value creates a device override."
                    : "."}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      Width
                    </span>
                    <div className="flex items-center rounded-lg border border-border bg-background px-2.5 focus-within:border-[#2e0562]/35">
                      <input
                        type="number"
                        min={320}
                        max={3840}
                        value={Math.round(layout.width)}
                        onChange={event => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          onSceneSizeChange({ width: value });
                        }}
                        className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-foreground outline-none"
                      />
                      <span className="ml-1 text-[12px] text-muted-foreground">px</span>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      Height
                    </span>
                    <div className="flex items-center rounded-lg border border-border bg-background px-2.5 focus-within:border-[#2e0562]/35">
                      <input
                        type="number"
                        min={320}
                        max={3000}
                        value={Math.round(layout.height)}
                        onChange={event => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          onSceneSizeChange({ height: value });
                        }}
                        className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-foreground outline-none"
                      />
                      <span className="ml-1 text-[12px] text-muted-foreground">px</span>
                    </div>
                  </label>
                </div>

                <div className="mt-2.5 rounded-lg bg-muted/30 px-2.5 py-2 text-[12px] leading-relaxed text-muted-foreground">
                  Scene size controls the visual canvas. Visitor scroll stays in the Scene inspector because it controls scroll choreography, not canvas dimensions.
                </div>
              </div>
            )}
          </div>

          {editableBreakpoint && (
            <button
              type="button"
              onClick={onAutoLayout}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2e0562]/20 bg-[#2e0562]/5 px-2.5 text-[12px] font-semibold text-[#2e0562] transition-colors hover:bg-[#2e0562]/10"
              title={
                hasOverrides
                  ? `Rebuild the ${breakpoint} starting layout from Desktop. Undo can restore the current device layout.`
                  : `Create an editable ${breakpoint} starting layout from Desktop.`
              }
            >
              <Sparkles size={12} />
              {hasOverrides ? "Rebuild layout" : "Auto layout"}
            </button>
          )}

          {editableBreakpoint && hasOverrides && (
            <button
              type="button"
              onClick={onResetDevice}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              title={`Remove every ${breakpoint} scene/object override and inherit Desktop again. Undo can restore it.`}
            >
              <RefreshCcw size={12} />
              Reset device
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
