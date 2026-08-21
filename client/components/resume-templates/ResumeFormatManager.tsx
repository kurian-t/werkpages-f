import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  FileText,
  Globe2,
  LayoutTemplate,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ResumeBuilderEnabledFormats,
  ResumeBuilderWorkspace,
} from "./resumeBuilderFormats";

interface Props {
  enabled: ResumeBuilderEnabledFormats;
  currentWorkspace?: ResumeBuilderWorkspace;
  onClose: () => void;
  onSave: (enabled: ResumeBuilderEnabledFormats) => void;
}

type FormatKey = keyof ResumeBuilderEnabledFormats;

const OPTIONS: Array<{
  key: FormatKey;
  workspace: Exclude<ResumeBuilderWorkspace, "content">;
  label: string;
  detail: string;
  icon: typeof LayoutTemplate;
}> = [
  {
    key: "designedPdf",
    workspace: "designed-pdf",
    label: "Designed PDF",
    detail: "Visual document editor with freeform layout and PDF export.",
    icon: LayoutTemplate,
  },
  {
    key: "ats",
    workspace: "ats",
    label: "ATS Resume",
    detail: "Semantic, applicant-system-friendly version from the same content.",
    icon: FileText,
  },
  {
    key: "responsiveWeb",
    workspace: "responsive-web",
    label: "Responsive Web",
    detail: "A traditional resume website that adapts cleanly to each screen.",
    icon: Globe2,
  },
  {
    key: "interactiveWeb",
    workspace: "interactive-web",
    label: "Interactive Web",
    detail: "A scene-based web experience with motion and storytelling.",
    icon: Sparkles,
  },
];

function sameFormats(
  a: ResumeBuilderEnabledFormats,
  b: ResumeBuilderEnabledFormats,
): boolean {
  return OPTIONS.every(option => a[option.key] === b[option.key]);
}

function FormatRow({
  option,
  active,
  isCurrent,
  pendingHide,
  onToggle,
}: {
  option: (typeof OPTIONS)[number];
  active: boolean;
  isCurrent: boolean;
  pendingHide: boolean;
  onToggle: () => void;
}) {
  const Icon = option.icon;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4 ${
        active
          ? "border-[#2e0562]/25 bg-[#2e0562]/[0.025]"
          : "border-border bg-card"
      }`}
    >
      <div
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${
          active
            ? "bg-[#2e0562]/10 text-[#2e0562]"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {option.label}
          </span>
          {isCurrent && (
            <span className="rounded-full bg-[#2e0562]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2e0562]">
              Current
            </span>
          )}
          {pendingHide && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Will hide
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {option.detail}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1 ${
          active
            ? "border border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
        }`}
        aria-label={`${active ? "Hide" : "Add"} ${option.label}`}
      >
        {active ? (
          "Hide"
        ) : (
          <>
            <Plus size={12} />
            Add
          </>
        )}
      </button>
    </div>
  );
}

export default function ResumeFormatManager({
  enabled,
  currentWorkspace,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ResumeBuilderEnabledFormats>({
    ...enabled,
  });

  useEffect(() => {
    setDraft({ ...enabled });
  }, [enabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const enabledOptions = useMemo(
    () => OPTIONS.filter(option => draft[option.key]),
    [draft],
  );
  const availableOptions = useMemo(
    () => OPTIONS.filter(option => !draft[option.key]),
    [draft],
  );
  const changed = !sameFormats(draft, enabled);
  const enabledCount = enabledOptions.length;

  const currentOption = OPTIONS.find(
    option => option.workspace === currentWorkspace,
  );
  const currentWillHide = Boolean(
    currentOption && enabled[currentOption.key] && !draft[currentOption.key],
  );

  const toggle = (key: FormatKey) => {
    setDraft(current => ({
      ...current,
      [key]: !current[key],
    }));
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-format-manager-title"
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2
              id="resume-format-manager-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Manage resume formats
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Add only the outputs you want. Hiding a format removes it from the
              builder navigation, but keeps its saved design so you can restore
              it later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2e0562]/30"
            aria-label="Close format manager"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#2e0562]/10 bg-[#2e0562]/[0.025] p-3.5">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/10 text-[#2e0562]">
              <Check size={15} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">
                Shared Content is always available
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                PDF, ATS and Web are optional outputs. You can work with Content
                only, then add any format whenever you need it.
              </p>
            </div>
          </div>

          <section>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Your formats
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {enabledCount === 0
                    ? "No output formats are currently shown."
                    : `${enabledCount} output format${enabledCount === 1 ? "" : "s"} shown in the builder.`}
                </p>
              </div>
            </div>

            {enabledOptions.length > 0 ? (
              <div className="space-y-2.5">
                {enabledOptions.map(option => (
                  <FormatRow
                    key={option.key}
                    option={option}
                    active
                    isCurrent={option.workspace === currentWorkspace}
                    pendingHide={Boolean(
                      enabled[option.key] && !draft[option.key],
                    )}
                    onToggle={() => toggle(option.key)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
                <div className="text-sm font-semibold text-foreground">
                  Content-only workspace
                </div>
                <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                  That's completely valid. Your shared resume information stays
                  editable, and you can add an output below at any time.
                </p>
              </div>
            )}
          </section>

          {availableOptions.length > 0 && (
            <section className="mt-6">
              <div className="mb-2.5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Available to add
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Adding a format never duplicates your resume facts; it uses the
                  same shared content.
                </p>
              </div>
              <div className="space-y-2.5">
                {availableOptions.map(option => (
                  <FormatRow
                    key={option.key}
                    option={option}
                    active={false}
                    isCurrent={false}
                    pendingHide={false}
                    onToggle={() => toggle(option.key)}
                  />
                ))}
              </div>
            </section>
          )}

          {currentWillHide && currentOption && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-[11px] leading-relaxed text-amber-800">
              <strong>{currentOption.label}</strong> is the workspace you're using
              now. Saving will hide it and return you to Content. Its saved
              design will not be deleted.
            </div>
          )}
        </div>

        <div className="flex flex-none flex-col gap-3 border-t border-border bg-muted/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-[11px] text-muted-foreground">
            {changed
              ? "Unsaved format changes"
              : enabledCount === 0
                ? "Content only"
                : `${enabledCount} output${enabledCount === 1 ? "" : "s"} enabled`}
          </span>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-[#2e0562]/30"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!changed}
              onClick={() => onSave(draft)}
              className="rounded-lg bg-[#2e0562] px-4 py-2 text-xs font-semibold text-white outline-none hover:bg-[#2e0562]/90 focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
