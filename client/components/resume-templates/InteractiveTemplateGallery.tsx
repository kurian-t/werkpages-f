import {
  Check,
  LayoutTemplate,
  Rocket,
  Route,
  Terminal,
} from "lucide-react";
import {
  INTERACTIVE_TEMPLATES,
  type InteractiveTemplateDefinition,
  type InteractiveTemplateId,
} from "./resumeInteractiveTemplates";

function TemplateThumbnail({
  template,
}: {
  template: InteractiveTemplateDefinition;
}) {
  if (template.preview === "terminal") {
    return (
      <div className="relative h-[132px] overflow-hidden rounded-xl border border-emerald-900 bg-[#030805] p-3 font-mono sm:h-[148px]">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-yellow-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <div className="mt-4 text-[8px] font-bold text-emerald-300">
          $ whoami
        </div>
        <div className="mt-2 h-2.5 w-[58%] rounded-sm bg-emerald-300/50" />
        <div className="mt-4 text-[7px] text-emerald-300/60">
          $ cat experience.log
        </div>
        <div className="mt-2 space-y-2">
          <div className="h-2 w-[82%] rounded-sm bg-emerald-300/20" />
          <div className="h-2 w-[68%] rounded-sm bg-emerald-300/10" />
          <div className="h-2 w-[75%] rounded-sm bg-emerald-300/10" />
        </div>
      </div>
    );
  }

  if (template.preview === "space") {
    return (
      <div className="relative h-[132px] overflow-hidden rounded-xl bg-gradient-to-br from-[#07051b] to-[#32106d] sm:h-[148px]">
        {[
          [12, 18, 1.5],
          [28, 70, 2],
          [72, 22, 1.5],
          [84, 62, 2.5],
          [55, 80, 1.5],
          [42, 20, 1],
          [65, 54, 1],
        ].map(([x, y, size], index) => (
          <span
            key={index}
            className="absolute rounded-full bg-white"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
            }}
          />
        ))}
        <div className="absolute right-7 top-5 h-16 w-16 rounded-full border border-violet-300/50 bg-violet-500/20" />
        <div className="absolute right-12 top-10 h-7 w-7 rounded-full bg-violet-400" />
        <div className="absolute bottom-4 left-4 w-[66%] rounded-lg border border-white/20 bg-white/10 p-3 backdrop-blur">
          <div className="h-2.5 w-[55%] rounded bg-violet-200/75" />
          <div className="mt-2 h-2 w-[85%] rounded bg-white/30" />
          <div className="mt-1.5 h-2 w-[65%] rounded bg-white/20" />
        </div>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 240 148"
          aria-hidden="true"
        >
          <path
            d="M 22 124 C 82 26, 150 128, 218 34"
            fill="none"
            stroke="rgba(196,181,253,.65)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        </svg>
      </div>
    );
  }

  if (template.preview === "journey") {
    return (
      <div className="relative h-[132px] overflow-hidden rounded-xl bg-gradient-to-br from-[#fffafe] to-[#ede9fe] sm:h-[148px]">
        <div className="absolute bottom-5 left-7 top-5 w-px bg-violet-300" />
        {[19, 44, 69].map(top => (
          <span
            key={top}
            className="absolute left-[21px] h-3.5 w-3.5 rounded-full border-2 border-white bg-violet-600 shadow-sm"
            style={{ top: `${top}%` }}
          />
        ))}
        <div className="absolute left-12 top-5 w-[67%] rounded-lg border border-violet-200 bg-white/85 p-3 shadow-sm">
          <div className="h-2.5 w-[48%] rounded bg-violet-500/60" />
          <div className="mt-2 h-2 w-[82%] rounded bg-violet-950/15" />
          <div className="mt-1.5 h-2 w-[60%] rounded bg-violet-950/10" />
        </div>
        <div className="absolute bottom-5 left-12 w-[58%] rounded-lg border border-violet-200 bg-white/75 p-2.5">
          <div className="h-2 w-[72%] rounded bg-violet-950/10" />
          <div className="mt-1.5 h-2 w-[52%] rounded bg-violet-950/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[132px] overflow-hidden rounded-xl bg-gradient-to-br from-[#fbfaff] to-[#eee8fa] sm:h-[148px]">
      <div className="absolute -right-3 top-3 h-20 w-20 rounded-full bg-violet-200/60" />
      <div className="absolute left-6 top-6 h-2.5 w-[42%] rounded bg-violet-600/70" />
      <div className="absolute left-6 top-12 h-4 w-[62%] rounded bg-violet-950/80" />
      <div className="absolute bottom-5 left-6 w-[72%] rounded-lg border border-violet-100 bg-white/90 p-3 shadow-sm">
        <div className="h-2 w-[92%] rounded bg-violet-950/14" />
        <div className="mt-2 h-2 w-[72%] rounded bg-violet-950/10" />
        <div className="mt-1.5 h-2 w-[60%] rounded bg-violet-950/10" />
      </div>
    </div>
  );
}

function TemplateIcon({
  templateId,
}: {
  templateId: InteractiveTemplateId;
}) {
  if (templateId === "terminal") return <Terminal size={14} />;
  if (templateId === "space-journey") return <Rocket size={14} />;
  if (templateId === "career-journey") return <Route size={14} />;
  return <LayoutTemplate size={14} />;
}

export default function InteractiveTemplateGallery({
  activeTemplateId,
  mode = "editor",
  onApply,
}: {
  activeTemplateId?: string;
  mode?: "initial" | "editor";
  onApply: (templateId: InteractiveTemplateId) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {INTERACTIVE_TEMPLATES.map(template => {
        const active = activeTemplateId === template.id;

        return (
          <article
            key={template.id}
            aria-current={active ? "true" : undefined}
            className={`flex min-h-0 flex-col rounded-2xl border p-2.5 transition-colors sm:p-3 ${
              active
                ? "border-[#2e0562]/35 bg-[#2e0562]/[0.035]"
                : "border-border bg-card hover:border-[#2e0562]/20"
            }`}
          >
            <TemplateThumbnail template={template} />

            <div className="mt-3 flex items-start gap-2.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                <TemplateIcon templateId={template.id} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-[10.5px] font-bold text-foreground">
                    {template.name}
                  </h3>
                  {active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#2e0562]/8 px-1.5 py-0.5 text-[6.5px] font-bold uppercase tracking-wider text-[#2e0562]">
                      <Check size={7} />
                      Current base
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[7.5px] font-semibold text-[#2e0562]">
                  {template.mood} · {template.motionLevel} motion
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-[8px] leading-relaxed text-muted-foreground">
              {template.description}
            </p>

            <div className="mt-2 text-[7px] text-muted-foreground">
              <span className="font-semibold text-foreground/70">Best for:</span>{" "}
              {template.bestFor}
            </div>

            <div className="mt-auto pt-3">
              <button
                type="button"
                onClick={() => onApply(template.id)}
                className={`flex h-8 w-full items-center justify-center rounded-lg px-3 text-[8px] font-semibold transition-colors ${
                  active && mode === "editor"
                    ? "border border-[#2e0562]/20 bg-background text-[#2e0562] hover:bg-[#2e0562]/5"
                    : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                }`}
              >
                {mode === "initial"
                  ? "Use this template"
                  : active
                    ? "Reapply base"
                    : "Apply template"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
