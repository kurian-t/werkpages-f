import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LayoutTemplate, X } from "lucide-react";
import InteractiveTemplateGallery from "./InteractiveTemplateGallery";
import type { InteractiveTemplateId } from "./resumeInteractiveTemplates";

export default function InteractiveTemplateOverlay({
  open,
  activeTemplateId,
  mode = "editor",
  onApply,
  onClose,
}: {
  open: boolean;
  activeTemplateId?: string;
  mode?: "initial" | "editor";
  onApply: (templateId: InteractiveTemplateId) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="interactive-template-title"
        className="flex max-h-[calc(100vh-24px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-40px)]"
      >
        <header className="flex flex-none items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#2e0562]/8 text-[#2e0562]">
              <LayoutTemplate size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
                Interactive templates
              </div>
              <h2 id="interactive-template-title" className="mt-0.5 text-[16px] font-semibold text-foreground">
                {mode === "initial"
                  ? "Choose a starting experience"
                  : "Choose a new Interactive base"}
              </h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                {mode === "initial"
                  ? "Templates arrange your shared resume data into a complete Interactive experience. You can change every scene, object and motion setting afterward."
                  : "Preview the available starting styles without crowding the canvas. Applying one replaces only this Interactive presentation; your shared resume facts and other formats stay unchanged."}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close templates"
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5">
          <InteractiveTemplateGallery
            activeTemplateId={activeTemplateId}
            mode={mode}
            onApply={onApply}
          />
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-2.5 text-[12px] leading-relaxed text-muted-foreground sm:px-5">
          <span>
            Templates reference the same Work, Projects, Education, Skills and Links data — they never duplicate or replace those facts.
          </span>
          {mode === "editor" && (
            <span className="font-semibold text-foreground/70">
              Apply is undoable from the editor.
            </span>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
