import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ATSCheck } from "./resumeATS";

interface Props {
  checks: ATSCheck[];
  onFixCheck?: (check: ATSCheck) => void;
}

function fixLabelForCheck(check: ATSCheck): string | null {
  switch (check.id) {
    case "identity":
    case "contact":
      return "Fix in Profile";
    case "experience":
    case "descriptions":
      return "Fix in Experience";
    case "projects":
    case "project-detail":
      return "Fix in Projects";
    default:
      return null;
  }
}

export function ATSChecksPopover({ checks, onFixCheck }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    right: 16,
    width: 410,
    height: 480,
  });

  const passed = checks.filter(check => check.ok).length;
  const allPassed = passed === checks.length;

  const orderedChecks = useMemo(
    () => [...checks].sort((a, b) => Number(a.ok) - Number(b.ok)),
    [checks],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const root = rootRef.current;
      const panel = panelRef.current;
      if (root?.contains(target) || panel?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);



  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const viewportPadding = 16;
      const gap = 8;
      const desiredHeight = 560;
      const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const availableAbove = rect.top - gap - viewportPadding;
      const width = Math.min(410, Math.max(280, window.innerWidth - viewportPadding * 2));

      const openAbove = availableBelow < 300 && availableAbove > availableBelow;
      const availableHeight = Math.max(120, openAbove ? availableAbove : availableBelow);
      const height = Math.min(desiredHeight, availableHeight);
      const top = openAbove
        ? Math.max(viewportPadding, rect.top - gap - height)
        : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - height);

      setPanelPosition({
        top,
        right: Math.max(viewportPadding, window.innerWidth - rect.right),
        width,
        height,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[10.5px] font-semibold transition-colors ${
          allPassed
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70"
            : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/70"
        }`}
      >
        {allPassed ? (
          <CheckCircle2 size={13} />
        ) : (
          <TriangleAlert size={13} />
        )}
        <span>{passed}/{checks.length} checks</span>
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="ATS compatibility checks"
            className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
            style={{
              top: panelPosition.top,
              right: panelPosition.right,
              width: panelPosition.width,
              height: panelPosition.height,
            }}
          >
            <div className="flex flex-none items-start justify-between gap-3 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg ${
                      allPassed
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {allPassed ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <TriangleAlert size={14} />
                    )}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      ATS compatibility checks
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {allPassed
                        ? "Your resume passes all current structural checks."
                        : `${checks.length - passed} check${checks.length - passed === 1 ? "" : "s"} need attention.`}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close ATS checks"
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
              <div className="space-y-1.5">
                {orderedChecks.map(check => {
                  const fixLabel = !check.ok && onFixCheck ? fixLabelForCheck(check) : null;
                  return (
                    <div
                      key={check.id}
                      className={`rounded-xl border px-3 py-2.5 ${
                        check.ok
                          ? "border-border bg-background"
                          : "border-amber-200 bg-amber-50/60"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                            check.ok
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {check.ok ? <Check size={11} /> : <TriangleAlert size={11} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-[10.5px] font-semibold ${
                              check.ok ? "text-foreground" : "text-amber-950"
                            }`}
                          >
                            {check.label}
                          </div>
                          <p
                            className={`mt-0.5 text-[9.5px] leading-relaxed ${
                              check.ok ? "text-muted-foreground" : "text-amber-800"
                            }`}
                          >
                            {check.detail}
                          </p>

                          {fixLabel && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onFixCheck?.(check);
                              }}
                              className="mt-2 inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#2e0562] hover:underline"
                            >
                              {fixLabel}
                              <ArrowRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-[38px] shrink-0 items-center border-t border-border bg-muted/15 px-4 py-2.5 text-[9px] leading-[1.35] text-muted-foreground">
              Structural checks only. ATS parsing and ranking can vary by system.
            </div>
          </div>,
          document.body,
        )}

    </div>
  );
}

export default ATSChecksPopover;
