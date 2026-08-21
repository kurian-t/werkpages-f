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
      <div className="relative h-[92px] overflow-hidden rounded-lg border border-emerald-900 bg-[#030805] p-2 font-mono">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </div>
        <div className="mt-2 text-[5px] font-bold text-emerald-300">
          $ whoami
        </div>
        <div className="mt-1 h-2 w-[58%] rounded-sm bg-emerald-300/50" />
        <div className="mt-2 text-[4px] text-emerald-300/60">
          $ cat experience.log
        </div>
        <div className="mt-1 space-y-1">
          <div className="h-1.5 w-[82%] rounded-sm bg-emerald-300/20" />
          <div className="h-1.5 w-[68%] rounded-sm bg-emerald-300/10" />
          <div className="h-1.5 w-[75%] rounded-sm bg-emerald-300/10" />
        </div>
      </div>
    );
  }

  if (template.preview === "space") {
    return (
      <div className="relative h-[92px] overflow-hidden rounded-lg bg-gradient-to-br from-[#07051b] to-[#32106d]">
        {[
          [12, 18, 1],
          [28, 70, 1.5],
          [72, 22, 1],
          [84, 62, 2],
          [55, 80, 1],
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
        <div className="absolute right-5 top-3 h-11 w-11 rounded-full border border-violet-300/50 bg-violet-500/20" />
        <div className="absolute right-8 top-6 h-5 w-5 rounded-full bg-violet-400" />
        <div className="absolute bottom-3 left-3 w-[64%] rounded-md border border-white/20 bg-white/10 p-2 backdrop-blur">
          <div className="h-2 w-[55%] rounded bg-violet-200/75" />
          <div className="mt-1.5 h-1.5 w-[85%] rounded bg-white/30" />
          <div className="mt-1 h-1.5 w-[65%] rounded bg-white/20" />
        </div>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 200 92"
          aria-hidden="true"
        >
          <path
            d="M 22 77 C 72 18, 120 80, 180 25"
            fill="none"
            stroke="rgba(196,181,253,.65)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </svg>
      </div>
    );
  }

  if (template.preview === "journey") {
    return (
      <div className="relative h-[92px] overflow-hidden rounded-lg bg-gradient-to-br from-[#fffafe] to-[#ede9fe]">
        <div className="absolute bottom-4 left-5 top-4 w-px bg-violet-300" />
        {[19, 44, 69].map((top, index) => (
          <span
            key={top}
            className="absolute left-[14px] h-3 w-3 rounded-full border-2 border-white bg-violet-600"
            style={{ top: `${top}%` }}
          />
        ))}
        <div className="absolute left-10 top-4 w-[67%] rounded-md border border-violet-200 bg-white/80 p-2">
          <div className="h-2 w-[48%] rounded bg-violet-500/60" />
          <div className="mt-1.5 h-1.5 w-[82%] rounded bg-violet-950/15" />
          <div className="mt-1 h-1.5 w-[60%] rounded bg-violet-950/10" />
        </div>
        <div className="absolute bottom-4 left-10 w-[58%] rounded-md border border-violet-200 bg-white/70 p-1.5">
          <div className="h-1.5 w-[72%] rounded bg-violet-950/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[92px] overflow-hidden rounded-lg bg-gradient-to-br from-[#fbfaff] to-[#eee8fa]">
      <div className="absolute -right-2 top-2 h-14 w-14 rounded-full bg-violet-200/60" />
      <div className="absolute left-4 top-4 h-2 w-[42%] rounded bg-violet-600/70" />
      <div className="absolute left-4 top-9 h-3 w-[62%] rounded bg-violet-950/80" />
      <div className="absolute bottom-4 left-4 w-[70%] rounded-md border border-violet-100 bg-white/90 p-2 shadow-sm">
        <div className="h-1.5 w-[92%] rounded bg-violet-950/14" />
        <div className="mt-1 h-1.5 w-[72%] rounded bg-violet-950/10" />
      </div>
    </div>
  );
}

function TemplateIcon({
  templateId,
}: {
  templateId: InteractiveTemplateId;
}) {
  if (templateId === "terminal") return <Terminal size={12} />;
  if (templateId === "space-journey") return <Rocket size={12} />;
  if (templateId === "career-journey") return <Route size={12} />;
  return <LayoutTemplate size={12} />;
}

export default function InteractiveTemplateGallery({
  activeTemplateId,
  mode = "editor",
  onApply,
  onClose,
}: {
  activeTemplateId?: string;
  mode?: "initial" | "editor";
  onApply: (templateId: InteractiveTemplateId) => void;
  onClose?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#2e0562]/15 bg-background p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#2e0562]">
            Interactive templates
          </div>
          <div className="mt-1 text-[11px] font-semibold text-foreground">
            Start with a complete experience — then change anything.
          </div>
          <p className="mt-1 max-w-2xl text-[7.5px] leading-relaxed text-muted-foreground">
            Templates arrange references to the same Work, Projects, Education,
            Skills and Links data. They never copy or replace the underlying
            resume content.
            {mode === "editor"
              ? " Applying another template replaces only the current Interactive presentation; Responsive Site, PDF and ATS stay untouched, and the editor's Undo restores the previous scene layout."
              : ""}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-[7px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {INTERACTIVE_TEMPLATES.map(template => {
          const active = activeTemplateId === template.id;

          return (
            <div
              key={template.id}
              className={`rounded-xl border p-2 transition-colors ${
                active
                  ? "border-[#2e0562]/35 bg-[#2e0562]/[0.035]"
                  : "border-border bg-card"
              }`}
            >
              <TemplateThumbnail template={template} />

              <div className="mt-2 flex items-start gap-2">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#2e0562]/8 text-[#2e0562]">
                  <TemplateIcon templateId={template.id} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <div className="truncate text-[8.5px] font-bold text-foreground">
                      {template.name}
                    </div>
                    {active && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#2e0562]/8 px-1.5 py-0.5 text-[5.8px] font-bold uppercase tracking-wider text-[#2e0562]">
                        <Check size={6} />
                        Base
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[6.5px] font-semibold text-[#2e0562]">
                    {template.mood} · {template.motionLevel}
                  </div>
                </div>
              </div>

              <p className="mt-2 min-h-[34px] text-[6.8px] leading-relaxed text-muted-foreground">
                {template.description}
              </p>

              <div className="mt-1 text-[6px] text-muted-foreground">
                Best for: {template.bestFor}
              </div>

              <button
                type="button"
                onClick={() => onApply(template.id)}
                className={`mt-2 flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-[7px] font-semibold ${
                  active
                    ? "border border-[#2e0562]/20 bg-background text-[#2e0562]"
                    : "bg-[#2e0562] text-white"
                }`}
              >
                {mode === "initial"
                  ? "Use this template"
                  : active
                    ? "Reapply base"
                    : "Apply template"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
