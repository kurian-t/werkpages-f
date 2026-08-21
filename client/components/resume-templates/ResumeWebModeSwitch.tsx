import { LayoutTemplate, Sparkles } from "lucide-react";
import type { WebExperienceMode } from "./resumeWebExperience";

export default function ResumeWebModeSwitch({
  mode,
  onChange,
}: {
  mode: WebExperienceMode;
  onChange: (mode: WebExperienceMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5"
      aria-label="Web experience mode"
    >
      <button
        type="button"
        onClick={() => onChange("responsive")}
        aria-pressed={mode === "responsive"}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
          mode === "responsive"
            ? "bg-background text-[#2e0562] shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutTemplate size={11} />
        Responsive Site
      </button>

      <button
        type="button"
        onClick={() => onChange("interactive")}
        aria-pressed={mode === "interactive"}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
          mode === "interactive"
            ? "bg-background text-[#2e0562] shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sparkles size={11} />
        Interactive Experience
      </button>
    </div>
  );
}
