import { useMemo, useState } from "react";
import {
  Check,
  FileCheck2,
  FileText,
  Globe2,
  LayoutTemplate,
  Sparkles,
} from "lucide-react";
import type { ResumeBuilderEnabledFormats } from "./resumeBuilderFormats";

interface Props {
  initial?: ResumeBuilderEnabledFormats;
  onContinue: (enabled: ResumeBuilderEnabledFormats) => void;
}

const EMPTY_FORMATS: ResumeBuilderEnabledFormats = {
  designedPdf: false,
  ats: false,
  responsiveWeb: false,
  interactiveWeb: false,
};

const OPTIONS = [
  {
    key: "designedPdf" as const,
    title: "Designed PDF",
    detail: "A polished visual resume you can style, position and download.",
    icon: LayoutTemplate,
  },
  {
    key: "ats" as const,
    title: "ATS Resume",
    detail: "A clean semantic version focused on structure and extractable text.",
    icon: FileText,
  },
  {
    key: "responsiveWeb" as const,
    title: "Responsive Web",
    detail: "A traditional resume website that adapts cleanly to every screen.",
    icon: Globe2,
  },
  {
    key: "interactiveWeb" as const,
    title: "Interactive Web",
    detail: "A freeform scene-based experience with motion, paths and storytelling.",
    icon: Sparkles,
  },
];

export default function ResumeFormatChooser({
  initial = EMPTY_FORMATS,
  onContinue,
}: Props) {
  const [enabled, setEnabled] = useState<ResumeBuilderEnabledFormats>({
    ...initial,
  });

  const selectedCount = useMemo(
    () => Object.values(enabled).filter(Boolean).length,
    [enabled],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-format-chooser-title"
        className="flex max-h-[min(820px,calc(100vh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
      >
        <div className="flex-none border-b border-border px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#2e0562]/10 text-[#2e0562]">
              <FileCheck2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
                Set up your resume project · 1 of 2
              </div>
              <h2
                id="resume-format-chooser-title"
                className="mt-1 text-xl font-semibold tracking-tight text-foreground"
              >
                What would you like to create?
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Your resume facts live once in Shared Content. Choose any outputs
                you want now, or begin with Content only and add formats later.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pt-5 sm:px-8 sm:pt-6">
            <div className="flex items-center gap-3 rounded-2xl border border-[#2e0562]/15 bg-[#2e0562]/[0.03] p-4">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#2e0562] text-white">
                <Check size={16} strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">
                  Shared Content
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Profile, experience, projects, education, skills, summary and
                  links—the source of truth every output reads from.
                </p>
              </div>
              <span className="hidden rounded-full bg-[#2e0562]/10 px-2.5 py-1 text-[10px] font-semibold text-[#2e0562] sm:inline-flex">
                Always included
              </span>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-8 sm:pt-5">
            {OPTIONS.map(option => {
              const Icon = option.icon;
              const active = enabled[option.key];

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    setEnabled(current => ({
                      ...current,
                      [option.key]: !current[option.key],
                    }))
                  }
                  className={`group relative min-h-[138px] rounded-2xl border p-5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1 ${
                    active
                      ? "border-[#2e0562] bg-[#2e0562]/[0.045] shadow-sm"
                      : "border-border bg-card hover:border-[#2e0562]/35 hover:bg-muted/20"
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        active
                          ? "bg-[#2e0562] text-white"
                          : "bg-muted text-muted-foreground group-hover:text-[#2e0562]"
                      }`}
                    >
                      <Icon size={19} />
                    </div>

                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        active
                          ? "border-[#2e0562] bg-[#2e0562] text-white"
                          : "border-border bg-background text-transparent"
                      }`}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </div>

                  <div className="mt-4 text-sm font-semibold text-foreground">
                    {option.title}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {option.detail}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mx-5 mb-5 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground sm:mx-8">
            Nothing here is permanent. You can add or hide outputs later without
            deleting the design work you already made.
          </div>
        </div>

        <div className="flex flex-none flex-col gap-3 border-t border-border bg-muted/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground">
              {selectedCount === 0
                ? "Content only for now"
                : `${selectedCount} output format${selectedCount === 1 ? "" : "s"} selected`}
            </div>
            <div className="mt-0.5 text-[10.5px] text-muted-foreground">
              Next: review the shared resume information already available.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onContinue(enabled)}
            className="rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#2e0562]/90 focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1"
          >
            {selectedCount === 0 ? "Start with Content" : "Continue to Content"}
          </button>
        </div>
      </div>
    </div>
  );
}
