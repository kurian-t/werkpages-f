import { Sparkles } from "lucide-react";
import ResumeInteractivePreview from "./ResumeInteractivePreview";
import type { ResumeData } from "./types";

interface Props {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  templateOpenRequest?: number;
}

export default function InteractiveResumeWorkspace({
  data,
  onChange,
  templateOpenRequest,
}: Props) {
  return (
    <div className="h-full min-h-0 p-3 sm:p-4">
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-none items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-5">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#2e0562]/[0.07] text-[#2e0562]">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              Interactive experience
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              Build scenes, arrange layers, edit properties, and preview motion directly on the canvas.
            </p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <ResumeInteractivePreview
            data={data}
            onDataChange={onChange}
            onDesignChange={design => onChange({ ...data, design })}
            workspaceMode
            templateOpenRequest={templateOpenRequest}
          />
        </main>
      </section>
    </div>
  );
}
