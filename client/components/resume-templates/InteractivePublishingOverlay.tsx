import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloudUpload, X } from "lucide-react";
import type { ResumeData, ResumeDesign } from "./types";
import InteractivePublishingPanel from "./InteractivePublishingPanel";

export default function InteractivePublishingOverlay({
  open,
  data,
  onDesignChange,
  onClose,
  onReviewReadiness,
}: {
  open: boolean;
  data: ResumeData;
  onDesignChange: (design: ResumeDesign) => void;
  onClose: () => void;
  onReviewReadiness?: () => void;
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
    const focusTimer = window.setTimeout(
      () => closeButtonRef.current?.focus(),
      0,
    );

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="interactive-publish-title"
        className="flex max-h-[calc(100vh-24px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-40px)]"
      >
        <header className="flex flex-none items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#2e0562]/8 text-[#2e0562]">
              <CloudUpload size={20} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
                Interactive publishing
              </div>
              <h2
                id="interactive-publish-title"
                className="mt-0.5 text-[18px] font-semibold text-foreground"
              >
                Publish your Interactive Experience
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                Choose the address, visibility and hosted destination for this Interactive resume. Publishing settings stay separate from your shared resume facts and editor layout.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close publishing"
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5">
          <InteractivePublishingPanel
            data={data}
            onDesignChange={onDesignChange}
            onReviewReadiness={onReviewReadiness}
          />
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-2.5 text-[12px] leading-relaxed text-muted-foreground sm:px-5">
          <span>
            Hosted publishing uses the address you choose here. Export HTML remains a separate optional self-hosting path.
          </span>
          <span className="font-semibold text-foreground/70">
            Esc closes this window.
          </span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
