import {
  ArrowRight,
  Briefcase,
  Check,
  FileText,
  Globe2,
  LayoutTemplate,
  Plus,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { ResumeData } from "./types";
import type { ResumeContentSection } from "./ResumeContentPanel";
import type {
  ResumeBuilderEnabledFormats,
  ResumeBuilderWorkspace,
} from "./resumeBuilderFormats";

interface Props {
  data: ResumeData;
  enabled: ResumeBuilderEnabledFormats;
  onSectionChange: (section: ResumeContentSection) => void;
  onWorkspaceChange: (workspace: ResumeBuilderWorkspace) => void;
  onManageFormats: () => void;
  onDismiss: () => void;
}

const OUTPUTS = [
  {
    key: "designedPdf" as const,
    workspace: "designed-pdf" as const,
    label: "Designed PDF",
    icon: LayoutTemplate,
  },
  {
    key: "ats" as const,
    workspace: "ats" as const,
    label: "ATS Resume",
    icon: FileText,
  },
  {
    key: "responsiveWeb" as const,
    workspace: "responsive-web" as const,
    label: "Responsive Web",
    icon: Globe2,
  },
  {
    key: "interactiveWeb" as const,
    workspace: "interactive-web" as const,
    label: "Interactive Web",
    icon: Sparkles,
  },
];

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export default function ResumeFirstRunGuide({
  data,
  enabled,
  onSectionChange,
  onWorkspaceChange,
  onManageFormats,
  onDismiss,
}: Props) {
  const profileReady =
    (hasText(data.firstName) || hasText(data.lastName)) &&
    [data.email, data.phone, data.location, data.website].some(hasText);
  const experienceReady = (data.workEntries ?? []).some(
    entry => hasText(entry.company) || hasText(entry.title),
  );
  const summaryReady = hasText(data.summary);
  const skillsReady = (data.skills ?? []).some(hasText);

  const starterItems = [
    {
      section: "profile" as const,
      label: "Profile",
      detail: "Name and contact details",
      ready: profileReady,
      icon: UserRound,
    },
    {
      section: "experience" as const,
      label: "Experience",
      detail: "Your recent roles",
      ready: experienceReady,
      icon: Briefcase,
    },
    {
      section: "summary" as const,
      label: "Summary",
      detail: "A short professional introduction",
      ready: summaryReady,
      icon: FileText,
    },
    {
      section: "skills" as const,
      label: "Skills",
      detail: "Your strongest capabilities",
      ready: skillsReady,
      icon: Sparkles,
    },
  ];

  const readyCount = starterItems.filter(item => item.ready).length;
  const nextItem = starterItems.find(item => !item.ready) ?? starterItems[0];
  const enabledOutputs = OUTPUTS.filter(output => enabled[output.key]);

  return (
    <section
      aria-labelledby="resume-first-run-guide-title"
      className="flex-none overflow-hidden rounded-2xl border border-[#2e0562]/15 bg-gradient-to-br from-[#2e0562]/[0.045] via-background to-background shadow-sm"
    >
      <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#2e0562] text-white shadow-sm">
          <Sparkles size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
                Your resume project is ready
              </div>
              <h2
                id="resume-first-run-guide-title"
                className="mt-1 text-base font-semibold tracking-tight text-foreground"
              >
                Start with the facts. Style them anywhere later.
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Content is the shared source of truth for every format. Review it
                here once, then open PDF, ATS or Web without re-entering your
                resume information.
              </p>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2e0562]/30"
              aria-label="Dismiss getting started guide"
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
            <div className="rounded-xl border border-border bg-background/80 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Starter checklist
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    A quick orientation, not a list of required sections.
                  </p>
                </div>
                <span className="rounded-full bg-[#2e0562]/10 px-2.5 py-1 text-[10px] font-semibold text-[#2e0562]">
                  {readyCount}/4 ready
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {starterItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.section}
                      type="button"
                      onClick={() => onSectionChange(item.section)}
                      className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left outline-none transition-colors hover:border-[#2e0562]/30 hover:bg-[#2e0562]/[0.025] focus-visible:ring-2 focus-visible:ring-[#2e0562]/30"
                    >
                      <span
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
                          item.ready
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground group-hover:text-[#2e0562]"
                        }`}
                      >
                        {item.ready ? <Check size={14} strokeWidth={2.6} /> : <Icon size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {item.ready ? "Ready to use" : item.detail}
                        </span>
                      </span>
                      <ArrowRight
                        size={12}
                        className="flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e0562]"
                      />
                    </button>
                  );
                })}
              </div>

              {readyCount < starterItems.length && (
                <button
                  type="button"
                  onClick={() => onSectionChange(nextItem.section)}
                  className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2e0562] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-2"
                >
                  Continue with {nextItem.label}
                  <ArrowRight size={12} />
                </button>
              )}
            </div>

            <div className="rounded-xl border border-border bg-background/80 p-3.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Your outputs
              </div>

              {enabledOutputs.length > 0 ? (
                <>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Open any format whenever you want to see how this shared
                    content is presented.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {enabledOutputs.map(output => {
                      const Icon = output.icon;
                      return (
                        <button
                          key={output.key}
                          type="button"
                          onClick={() => onWorkspaceChange(output.workspace)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-[10.5px] font-semibold text-foreground outline-none transition-colors hover:border-[#2e0562]/30 hover:bg-[#2e0562]/[0.025] focus-visible:ring-2 focus-visible:ring-[#2e0562]/30"
                        >
                          <Icon size={12} className="text-[#2e0562]" />
                          {output.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Content-only is perfectly fine. Add an output when you are
                    ready to design, apply or publish.
                  </p>
                  <button
                    type="button"
                    onClick={onManageFormats}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#2e0562] px-3 py-2 text-[10.5px] font-semibold text-white outline-none hover:bg-[#2e0562]/90 focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1"
                  >
                    <Plus size={12} />
                    Add a format
                  </button>
                </>
              )}

              {enabledOutputs.length > 0 && (
                <button
                  type="button"
                  onClick={onManageFormats}
                  className="mt-3 text-[10.5px] font-semibold text-muted-foreground outline-none hover:text-[#2e0562] hover:underline focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-2"
                >
                  Manage formats
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
