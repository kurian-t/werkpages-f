/**
 * Design panel - page-level and structural settings only.
 * Per-element typography (font, size, color, spacing) lives in the canvas
 * click-to-style popover, so we don't duplicate it here.
 */
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ResumeDesign, LayoutType, SkillDisplay } from "@/components/resume-templates/types";

interface Props {
  design: ResumeDesign;
  onChange: (d: ResumeDesign) => void;
}

const LABEL   = "text-xs font-semibold text-muted-foreground block mb-1";
const SELECT  = "w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground";
const TOGGLE  = "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer";

const LAYOUTS: { value: LayoutType; label: string }[] = [
  { value: "single",        label: "Single column" },
  { value: "sidebar-left",  label: "Sidebar - left" },
  { value: "sidebar-right", label: "Sidebar - right" },
  { value: "two-column",    label: "Two column" },
  { value: "label",         label: "Label column" },
];

const SKILL_DISPLAYS: { value: SkillDisplay; label: string }[] = [
  { value: "tags",   label: "Tags / pills" },
  { value: "list",   label: "Bulleted list" },
  { value: "inline", label: "Inline text" },
  { value: "grid",   label: "Grid" },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value.startsWith("#") ? value : "#ffffff"} onChange={e => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-border bg-background p-0.5" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground font-mono" />
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, min = 1, max = 100, step = 0.5 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-[#2e0562]" />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-14 rounded border border-border bg-background px-2 py-1 text-xs text-foreground text-right" />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button type="button" onClick={() => onChange(!value)} className={`${TOGGLE} ${value ? "bg-[#2e0562]" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Panel({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
        {title}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Section ordering ──────────────────────────────────────────────────────────

const SECTION_LABELS_UI: Record<string, string> = {
  work: "Work Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  bio: "Bio / Summary",
  links: "Links",
};
const DEFAULT_ORDER = ["work", "projects", "education", "skills", "bio", "links"];

function SectionsList({ d, onChange }: { d: ResumeDesign; onChange: (d: ResumeDesign) => void }) {
  const isSidebar = d.layout === "sidebar-left" || d.layout === "sidebar-right";
  const configured = (d.sectionOrder ?? []).filter(id =>
    DEFAULT_ORDER.includes(id as string)
  );
  const order = [
    ...configured,
    ...DEFAULT_ORDER.filter(id => !configured.includes(id as never)),
  ];
  const hidden = d.hiddenSections ?? [];

  function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...d, sectionOrder: next });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Reorder and show/hide sections</p>
      <div className="space-y-1.5">
        {order.map((id, idx) => (
          <div key={id} className="flex items-center justify-between rounded-lg border border-border bg-background px-2 py-1.5">
            <span className="text-sm text-foreground">{SECTION_LABELS_UI[id] ?? id}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-25 transition-opacity">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === order.length - 1}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-25 transition-opacity">
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => {
                const next = hidden.includes(id) ? hidden.filter(s => s !== id) : [...hidden, id];
                onChange({ ...d, hiddenSections: next });
              }} className={`ml-1 relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${hidden.includes(id) ? "bg-border" : "bg-[#2e0562]"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hidden.includes(id) ? "translate-x-0.5" : "translate-x-4"}`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isSidebar && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Sections in the sidebar column:</p>
          {order.map(id => (
            <Toggle key={id} label={SECTION_LABELS_UI[id] ?? id}
              value={(d.sidebarSections ?? []).includes(id)}
              onChange={inSidebar => {
                const next = inSidebar
                  ? [...(d.sidebarSections ?? []), id]
                  : (d.sidebarSections ?? []).filter(s => s !== id);
                onChange({ ...d, sidebarSections: next });
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ResumeDesignPanel({ design: d, onChange }: Props) {
  const set = (partial: Partial<ResumeDesign>) => onChange({ ...d, ...partial });
  const isSidebar = d.layout === "sidebar-left" || d.layout === "sidebar-right";
  const isLabel   = d.layout === "label";
  const needsWidthControl = isSidebar || isLabel;

  return (
    <div className="divide-y divide-border">

      {/* ── Page layout ─────────────────────────────────────────────────────── */}
      <Panel title="Page">
        <div>
          <label className={LABEL}>Layout</label>
          <select value={d.layout} onChange={e => set({ layout: e.target.value as LayoutType })} className={SELECT}>
            {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        {needsWidthControl && (
          <NumberField
            label={isLabel ? "Label column width (pt)" : "Sidebar width (%)"}
            value={d.sidebarWidth}
            onChange={v => set({ sidebarWidth: v })}
            min={isLabel ? 60 : 20}
            max={isLabel ? 200 : 50}
            step={isLabel ? 5 : 1}
          />
        )}
        <NumberField label="Column gap (pt)" value={d.columnGap} onChange={v => set({ columnGap: v })} min={0} max={60} step={2} />
        <div>
          <label className={LABEL}>Page size</label>
          <select value={d.pageSize} onChange={e => set({ pageSize: e.target.value as "LETTER" | "A4" })} className={SELECT}>
            <option value="LETTER">US Letter</option>
            <option value="A4">A4</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Margin top (pt)"    value={d.pageMarginTop}    onChange={v => set({ pageMarginTop: v })}    min={10} max={100} />
          <NumberField label="Margin bottom (pt)" value={d.pageMarginBottom} onChange={v => set({ pageMarginBottom: v })} min={10} max={100} />
          <NumberField label="Margin left (pt)"   value={d.pageMarginLeft}   onChange={v => set({ pageMarginLeft: v })}   min={10} max={100} />
          <NumberField label="Margin right (pt)"  value={d.pageMarginRight}  onChange={v => set({ pageMarginRight: v })}  min={10} max={100} />
        </div>
        <ColorField label="Page background" value={d.pageBackground} onChange={v => set({ pageBackground: v })} />
        {isSidebar && (
          <ColorField label="Sidebar background" value={d.sidebarBackground} onChange={v => set({ sidebarBackground: v })} />
        )}
      </Panel>

      {/* ── Skills display ───────────────────────────────────────────────────── */}
      <Panel title="Skills display" defaultOpen={false}>
        <div>
          <label className={LABEL}>Display style</label>
          <select value={d.skillDisplay} onChange={e => set({ skillDisplay: e.target.value as SkillDisplay })} className={SELECT}>
            {SKILL_DISPLAYS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {d.skillDisplay === "grid" && (
          <NumberField label="Grid columns" value={d.skillGridColumns} onChange={v => set({ skillGridColumns: Math.round(v) })} min={2} max={5} step={1} />
        )}
      </Panel>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <Panel title="Features" defaultOpen={false}>
        <Toggle label="Show company logos" value={d.showCompanyLogos} onChange={v => set({ showCompanyLogos: v })} />
      </Panel>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <Panel title="Sections" defaultOpen={false}>
        <SectionsList d={d} onChange={onChange} />
      </Panel>

    </div>
  );
}
