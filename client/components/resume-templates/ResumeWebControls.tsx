import type { ResumeDesign } from "./types";
import {
  getResumeWebSettings,
  withResumeWebSettings,
  type ResumeWebDetailsMode,
  type ResumeWebFeaturedLink,
  type ResumeWebSettings,
} from "./resumeWeb";

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{detail}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#2e0562]"
      />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`grid gap-1 rounded-lg border border-border bg-muted/25 p-1 ${
        options.length === 4 ? "grid-cols-4" : options.length === 2 ? "grid-cols-2" : "grid-cols-3"
      }`}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
              value === option.value
                ? "bg-background text-[#2e0562] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-foreground outline-none focus:border-[#2e0562]/50";
const labelCls = "mb-1 block text-[9.5px] font-semibold text-muted-foreground";


export default function ResumeWebControls({
  design,
  onChange,
}: {
  design: ResumeDesign;
  onChange: (design: ResumeDesign) => void;
}) {
  const settings = getResumeWebSettings(design);

  const patch = <K extends keyof ResumeWebSettings>(key: K, value: ResumeWebSettings[K]) => {
    onChange(withResumeWebSettings(design, { [key]: value } as Partial<ResumeWebSettings>));
  };



  const updateFeaturedLink = (linkId: string, updates: Partial<ResumeWebFeaturedLink>) => {
    patch("featuredLinks", settings.featuredLinks.map(link =>
      link.id === linkId ? { ...link, ...updates } : link
    ));
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Web resume</div>
          <div className="mt-0.5 text-xs font-semibold text-foreground">Web superpowers</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Web-only visitor behavior and featured links live here. Shared resume content is edited in the main tabs below.
          </p>
        </div>

      </div>

      <div className="space-y-4 p-3.5">
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#2e0562]">
            Design on the canvas
          </div>
          <div className="mt-2 rounded-xl border border-border bg-background px-3 py-3">
            <div className="text-[10.5px] font-semibold text-foreground">
              The Web resume now behaves like a design editor
            </div>
            <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
              Click an element to select it. Its toolbar stays attached to the selection.
              Drag a selected item to move it, use the corner handles to resize it, and double-click editable text to change the shared resume content.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[
                ["🔗", "Typography links to PDF by default"],
                ["⠿", "Drag / reorder directly"],
                ["🖥", "Desktop / tablet / mobile"],
              ].map(([title, detail]) => (
                <div
                  key={detail}
                  className="rounded-lg border border-border px-2 py-2 text-center"
                >
                  <div className="text-[11px] font-bold text-foreground">{title}</div>
                  <div className="mt-0.5 text-[7.5px] leading-snug text-muted-foreground">{detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="text-[10.5px] font-semibold text-foreground">
              Shared content lives in the tabs below
            </div>
            <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
              Projects are now part of the resume itself, so the same project content renders in Designed PDF, ATS and Web.
              Video remains Web-only and appears as its own tab only while Web preview is selected.
            </p>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2e0562]">Featured links</div>
              <div className="mt-0.5 text-[9px] text-muted-foreground">Portfolio, articles, talks, demos or anything worth highlighting.</div>
            </div>
            <button
              type="button"
              onClick={() => patch("featuredLinks", [
                ...settings.featuredLinks,
                { id: id("web-link"), label: "", url: "", description: "" },
              ])}
              className="rounded-md border border-[#2e0562]/25 px-2 py-1 text-[10px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5"
            >
              + Link
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {settings.featuredLinks.map((link, index) => (
              <div key={link.id} className="rounded-xl border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-foreground">Link {index + 1}</div>
                  <button
                    type="button"
                    onClick={() => patch("featuredLinks", settings.featuredLinks.filter(item => item.id !== link.id))}
                    className="text-[9.5px] font-semibold text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="space-y-2">
                  <input className={inputCls} value={link.label} onChange={event => updateFeaturedLink(link.id, { label: event.target.value })} placeholder="Label — e.g. Portfolio" />
                  <input className={inputCls} value={link.url} onChange={event => updateFeaturedLink(link.id, { url: event.target.value })} placeholder="https://..." />
                  <input className={inputCls} value={link.description} onChange={event => updateFeaturedLink(link.id, { description: event.target.value })} placeholder="Short description" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#2e0562]">Visitor tools</div>
          <div className="mb-3">
            <Segmented<ResumeWebDetailsMode>
              label="Experience details"
              value={settings.detailsMode}
              options={[
                { value: "all", label: "Open" },
                { value: "first-two", label: "First 2" },
                { value: "collapsed", label: "Collapsed" },
              ]}
              onChange={value => patch("detailsMode", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Toggle label="Sticky navigation" detail="Keep section navigation accessible while scrolling." checked={settings.showNav} onChange={value => patch("showNav", value)} />
            <Toggle label="Resume search" detail="Visitors can filter experience, projects, education, skills and links." checked={settings.showSearch} onChange={value => patch("showSearch", value)} />
            <Toggle label="Print / save PDF" detail="Adds a print action to the standalone web resume." checked={settings.showPrint} onChange={value => patch("showPrint", value)} />
            <Toggle label="Profile photo" detail="Reuse the resume's profile-photo design object in the web hero." checked={settings.showPhoto} onChange={value => patch("showPhoto", value)} />
            <Toggle label="Back to top" detail="Show a floating shortcut after the visitor scrolls down." checked={settings.showBackToTop} onChange={value => patch("showBackToTop", value)} />
          </div>
        </section>
      </div>
    </div>
  );
}
