import { FileText } from "lucide-react";
import ResumeATSTwin from "./ResumeATSTwin";
import ATSChecksPopover from "./ATSChecksPopover";
import ResumeContentPanel, {
  type ResumeContentSection,
} from "./ResumeContentPanel";
import { buildATSChecks } from "./resumeATS";
import type { ResumeData } from "./types";

interface Props {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  section: ResumeContentSection;
  onSectionChange: (section: ResumeContentSection) => void;
}

export default function ATSResumeWorkspace({
  data,
  onChange,
  section,
  onSectionChange,
}: Props) {
  const checks = buildATSChecks(data);

  return (
    <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[330px_minmax(0,1fr)] lg:p-4">
      <aside className="flex min-h-0 overflow-hidden">
        <ResumeContentPanel
          data={data}
          onChange={onChange}
          section={section}
          onSectionChange={onSectionChange}
          variant="ats-sidebar"
        />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-none items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#2e0562]/[0.07] text-[#2e0562]">
              <FileText size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">ATS resume</div>
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                Clean, structured output generated from your shared resume content.
              </p>
            </div>
          </div>

          <ATSChecksPopover checks={checks} />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f9] p-3 sm:p-5 lg:p-6 xl:p-8">
          <ResumeATSTwin data={data} />
        </main>
      </section>
    </div>
  );
}
