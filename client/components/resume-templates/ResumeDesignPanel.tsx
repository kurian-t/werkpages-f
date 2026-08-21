/**
 * PDF design panel — structural/page settings only.
 *
 * Per-element typography (font, size, color, spacing) belongs to the canvas
 * contextual toolbar/popover. This panel intentionally avoids duplicating
 * those controls and uses drill-down views so the default state stays calm.
 */
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutPanelLeft,
  ListTree,
  Palette,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type {
  ResumeDesign,
  LayoutType,
  SkillDisplay,
} from "@/components/resume-templates/types";

interface Props {
  design: ResumeDesign;
  onChange: (d: ResumeDesign) => void;
}

const LABEL = "text-[11px] font-semibold text-muted-foreground block mb-1.5";
const SELECT =
  "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-[#2e0562]/45";
const TOGGLE =
  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer";

const LAYOUTS: { value: LayoutType; label: string }[] = [
  { value: "single", label: "Single column" },
  { value: "sidebar-left", label: "Sidebar — left" },
  { value: "sidebar-right", label: "Sidebar — right" },
  { value: "two-column", label: "Two column" },
  { value: "label", label: "Label column" },
];

const SKILL_DISPLAYS: { value: SkillDisplay; label: string }[] = [
  { value: "tags", label: "Tags / pills" },
  { value: "list", label: "Bulleted list" },
  { value: "inline", label: "Inline text" },
  { value: "grid", label: "Grid" },
];

const SECTION_LABELS_UI: Record<string, string> = {
  work: "Work Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  bio: "Bio / Summary",
  links: "Links",
};

const DEFAULT_ORDER = [
  "work",
  "projects",
  "education",
  "skills",
  "bio",
  "links",
];

type View =
  | "overview"
  | "layout"
  | "page"
  | "colors"
  | "skills"
  | "sections"
  | "features";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#ffffff"}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border border-border bg-background p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none focus:border-[#2e0562]/45"
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 100,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[#2e0562]"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs text-foreground outline-none focus:border-[#2e0562]/45"
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {detail && (
          <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {detail}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(!value)}
        className={`${TOGGLE} flex-none ${value ? "bg-[#2e0562]" : "bg-border"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5">
      {children}
    </div>
  );
}

function SettingRow({
  icon,
  label,
  summary,
  onClick,
  swatches,
}: {
  icon: ReactNode;
  label: string;
  summary: string;
  onClick: () => void;
  swatches?: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left last:border-b-0 hover:bg-muted/25"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/7 text-[#2e0562]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-foreground">
          {label}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {swatches?.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="h-3 w-3 rounded-full border border-black/10"
              style={{ background: color }}
            />
          ))}
          <span className="truncate">{summary}</span>
        </span>
      </span>
      <ChevronRight
        size={15}
        className="flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </button>
  );
}

function DetailHeader({
  title,
  detail,
  onBack,
}: {
  title: string;
  detail?: string;
  onBack: () => void;
}) {
  return (
    <div className="border-b border-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} /> PDF design
      </button>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {detail && (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

function SectionsList({
  d,
  onChange,
}: {
  d: ResumeDesign;
  onChange: (d: ResumeDesign) => void;
}) {
  const isSidebar = d.layout === "sidebar-left" || d.layout === "sidebar-right";
  const configured = (d.sectionOrder ?? []).filter(id =>
    DEFAULT_ORDER.includes(id as string),
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
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Order & visibility
        </div>
        <div className="space-y-1.5">
          {order.map((id, idx) => {
            const visible = !hidden.includes(id);
            return (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-xs font-medium text-foreground">
                  {SECTION_LABELS_UI[id] ?? id}
                </span>
                <div className="ml-2 flex items-center gap-1">
                  <button
                    type="button"
                    title="Move up"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    onClick={() => move(idx, 1)}
                    disabled={idx === order.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    title={visible ? "Hide section" : "Show section"}
                    aria-pressed={visible}
                    onClick={() => {
                      const next = visible
                        ? [...hidden, id]
                        : hidden.filter(sectionId => sectionId !== id);
                      onChange({ ...d, hiddenSections: next });
                    }}
                    className={`ml-1 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      visible ? "bg-[#2e0562]" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        visible ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isSidebar && (
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sidebar placement
          </div>
          <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
            Choose which visible sections sit in the sidebar column.
          </p>
          <div className="space-y-2">
            {order.map(id => (
              <Toggle
                key={id}
                label={SECTION_LABELS_UI[id] ?? id}
                value={(d.sidebarSections ?? []).includes(id)}
                onChange={inSidebar => {
                  const next = inSidebar
                    ? [...(d.sidebarSections ?? []), id]
                    : (d.sidebarSections ?? []).filter(sectionId => sectionId !== id);
                  onChange({ ...d, sidebarSections: next });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function marginSummary(d: ResumeDesign): string {
  const values = [
    d.pageMarginTop,
    d.pageMarginRight,
    d.pageMarginBottom,
    d.pageMarginLeft,
  ];
  const same = values.every(value => value === values[0]);
  return same ? `${values[0]} pt margins` : "Custom margins";
}

export default function ResumeDesignPanel({ design: d, onChange }: Props) {
  const [view, setView] = useState<View>("overview");
  const set = (partial: Partial<ResumeDesign>) => onChange({ ...d, ...partial });
  const isSidebar = d.layout === "sidebar-left" || d.layout === "sidebar-right";
  const isLabel = d.layout === "label";
  const needsWidthControl = isSidebar || isLabel;

  const layoutLabel =
    LAYOUTS.find(option => option.value === d.layout)?.label ?? "Custom layout";
  const skillsLabel =
    SKILL_DISPLAYS.find(option => option.value === d.skillDisplay)?.label ??
    "Custom";

  const sectionSummary = useMemo(() => {
    const hidden = d.hiddenSections ?? [];
    const visible = DEFAULT_ORDER.filter(id => !hidden.includes(id)).length;
    if (isSidebar) {
      return `${visible} visible · ${(d.sidebarSections ?? []).length} in sidebar`;
    }
    return `${visible} visible`;
  }, [d.hiddenSections, d.sidebarSections, isSidebar]);

  if (view === "overview") {
    return (
      <div>
        <div className="border-b border-border px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            PDF appearance
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Page and structure settings live here. Select text on the canvas for typography and spacing.
          </p>
        </div>

        <SettingRow
          icon={<LayoutPanelLeft size={15} />}
          label="Layout"
          summary={`${layoutLabel}${
            needsWidthControl
              ? ` · ${isLabel ? `${d.sidebarWidth} pt` : `${d.sidebarWidth}%`}`
              : ""
          }`}
          onClick={() => setView("layout")}
        />
        <SettingRow
          icon={<SlidersHorizontal size={15} />}
          label="Page"
          summary={`${d.pageSize === "A4" ? "A4" : "US Letter"} · ${marginSummary(d)}`}
          onClick={() => setView("page")}
        />
        <SettingRow
          icon={<Palette size={15} />}
          label="Colors"
          summary={isSidebar ? "Page and sidebar" : "Page background"}
          swatches={
            isSidebar
              ? [d.pageBackground, d.sidebarBackground]
              : [d.pageBackground]
          }
          onClick={() => setView("colors")}
        />
        <SettingRow
          icon={<Sparkles size={15} />}
          label="Skills"
          summary={skillsLabel}
          onClick={() => setView("skills")}
        />
        <SettingRow
          icon={<ListTree size={15} />}
          label="Sections"
          summary={sectionSummary}
          onClick={() => setView("sections")}
        />
        <SettingRow
          icon={<Sparkles size={15} />}
          label="Features"
          summary={`Company logos ${d.showCompanyLogos ? "on" : "off"}`}
          onClick={() => setView("features")}
        />
      </div>
    );
  }

  if (view === "layout") {
    return (
      <div>
        <DetailHeader
          title="Layout"
          detail="Choose the document structure, then fine-tune column proportions and spacing."
          onBack={() => setView("overview")}
        />
        <div className="space-y-4 p-4">
          <SectionCard>
            <label className={LABEL}>Layout</label>
            <select
              value={d.layout}
              onChange={e => set({ layout: e.target.value as LayoutType })}
              className={SELECT}
            >
              {LAYOUTS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SectionCard>

          <SectionCard>
            <div className="space-y-4">
              {needsWidthControl && (
                <NumberField
                  label={
                    isLabel ? "Label column width (pt)" : "Sidebar width (%)"
                  }
                  value={d.sidebarWidth}
                  onChange={value => set({ sidebarWidth: value })}
                  min={isLabel ? 60 : 20}
                  max={isLabel ? 200 : 50}
                  step={isLabel ? 5 : 1}
                />
              )}
              <NumberField
                label="Column gap (pt)"
                value={d.columnGap}
                onChange={value => set({ columnGap: value })}
                min={0}
                max={60}
                step={2}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  if (view === "page") {
    return (
      <div>
        <DetailHeader
          title="Page"
          detail="Set the paper size and printable margins. These values affect the exported PDF."
          onBack={() => setView("overview")}
        />
        <div className="space-y-4 p-4">
          <SectionCard>
            <label className={LABEL}>Page size</label>
            <select
              value={d.pageSize}
              onChange={e =>
                set({ pageSize: e.target.value as "LETTER" | "A4" })
              }
              className={SELECT}
            >
              <option value="LETTER">US Letter</option>
              <option value="A4">A4</option>
            </select>
          </SectionCard>

          <SectionCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">
                  Margins
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Fine-tune each side independently.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  set({
                    pageMarginTop: 36,
                    pageMarginRight: 36,
                    pageMarginBottom: 36,
                    pageMarginLeft: 36,
                  })
                }
                className="rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            </div>
            <div className="space-y-4">
              <NumberField
                label="Top (pt)"
                value={d.pageMarginTop}
                onChange={value => set({ pageMarginTop: value })}
                min={10}
                max={100}
              />
              <NumberField
                label="Bottom (pt)"
                value={d.pageMarginBottom}
                onChange={value => set({ pageMarginBottom: value })}
                min={10}
                max={100}
              />
              <NumberField
                label="Left (pt)"
                value={d.pageMarginLeft}
                onChange={value => set({ pageMarginLeft: value })}
                min={10}
                max={100}
              />
              <NumberField
                label="Right (pt)"
                value={d.pageMarginRight}
                onChange={value => set({ pageMarginRight: value })}
                min={10}
                max={100}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  if (view === "colors") {
    return (
      <div>
        <DetailHeader
          title="Colors"
          detail="Set page-level surfaces here. Text colors stay contextual on the canvas."
          onBack={() => setView("overview")}
        />
        <div className="space-y-4 p-4">
          <SectionCard>
            <div className="space-y-4">
              <ColorField
                label="Page background"
                value={d.pageBackground}
                onChange={value => set({ pageBackground: value })}
              />
              {isSidebar && (
                <ColorField
                  label="Sidebar background"
                  value={d.sidebarBackground}
                  onChange={value => set({ sidebarBackground: value })}
                />
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  if (view === "skills") {
    return (
      <div>
        <DetailHeader
          title="Skills"
          detail="Choose how the shared Skills section is presented in the Designed PDF."
          onBack={() => setView("overview")}
        />
        <div className="space-y-4 p-4">
          <SectionCard>
            <label className={LABEL}>Display style</label>
            <select
              value={d.skillDisplay}
              onChange={e =>
                set({ skillDisplay: e.target.value as SkillDisplay })
              }
              className={SELECT}
            >
              {SKILL_DISPLAYS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {d.skillDisplay === "grid" && (
              <div className="mt-4">
                <NumberField
                  label="Grid columns"
                  value={d.skillGridColumns}
                  onChange={value =>
                    set({ skillGridColumns: Math.round(value) })
                  }
                  min={2}
                  max={5}
                  step={1}
                />
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    );
  }

  if (view === "sections") {
    return (
      <div>
        <DetailHeader
          title="Sections"
          detail="Reorder, show or hide sections. Sidebar layouts can also place sections in either column."
          onBack={() => setView("overview")}
        />
        <div className="p-4">
          <SectionsList d={d} onChange={onChange} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <DetailHeader
        title="Features"
        detail="Optional PDF presentation features."
        onBack={() => setView("overview")}
      />
      <div className="p-4">
        <SectionCard>
          <Toggle
            label="Show company logos"
            detail="Uses the saved company logo where one is available."
            value={d.showCompanyLogos}
            onChange={value => set({ showCompanyLogos: value })}
          />
        </SectionCard>
      </div>
    </div>
  );
}
