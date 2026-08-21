import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignLeft,
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  FolderKanban,
  GraduationCap,
  GripVertical,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import type {
  EducationEntry,
  ResumeData,
  WorkEntry,
} from "./types";
import { genId } from "./types";
import {
  getResumeProjects,
  withResumeProjects,
  type ResumeProjectEntry,
} from "./resumeProjects";

export type ResumeContentSection =
  | "profile"
  | "experience"
  | "projects"
  | "education"
  | "skills"
  | "summary"
  | "links";

interface Props {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  section: ResumeContentSection;
  onSectionChange: (section: ResumeContentSection) => void;
  variant?: "workspace" | "sidebar" | "pdf-sidebar" | "ats-sidebar" | "web-sidebar-section";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const YEARS = Array.from(
  { length: 60 },
  (_, index) => new Date().getFullYear() - index,
);

const INPUT =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2e0562]/45 focus:ring-2 focus:ring-[#2e0562]/10";

function monthYear(date: string | null): { month: string; year: string } {
  if (!date) return { month: "", year: "" };
  const [year, month] = date.split("-");
  return { month: month ?? "", year: year ?? "" };
}

function toDateStr(month: string, year: string): string | null {
  return month && year ? `${year}-${month.padStart(2, "0")}` : null;
}

function formatMonthYear(date: string | null): string {
  if (!date) return "";
  const { month, year } = monthYear(date);
  const monthIndex = Number(month) - 1;
  const monthLabel = monthIndex >= 0 && monthIndex < MONTHS.length
    ? MONTHS[monthIndex]
    : "";
  return [monthLabel, year].filter(Boolean).join(" ");
}

function formatWorkRange(entry: WorkEntry): string {
  const start = formatMonthYear(entry.startDate);
  const end = entry.current ? "Present" : formatMonthYear(entry.endDate);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  return `${start} – ${end}`;
}

function MonthYearSelect({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
}) {
  const parsed = monthYear(value);
  const [localMonth, setLocalMonth] = useState(parsed.month);
  const [localYear, setLocalYear] = useState(parsed.year);

  useEffect(() => {
    const next = monthYear(value);
    setLocalMonth(next.month);
    setLocalYear(next.year);
  }, [value]);

  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="grid grid-cols-[1fr_86px] gap-1.5">
        <select
          value={localMonth}
          onChange={event => {
            const month = event.target.value;
            setLocalMonth(month);
            onChange(toDateStr(month, localYear));
          }}
          className={INPUT}
        >
          <option value="">Month</option>
          {MONTHS.map((month, index) => (
            <option
              key={month}
              value={String(index + 1).padStart(2, "0")}
            >
              {month}
            </option>
          ))}
        </select>
        <select
          value={localYear}
          onChange={event => {
            const year = event.target.value;
            setLocalYear(year);
            onChange(toDateStr(localMonth, year));
          }}
          className={INPUT}
        >
          <option value="">Year</option>
          {YEARS.map(year => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function emptyWork(): WorkEntry {
  return {
    id: genId(),
    company: "",
    title: "",
    startDate: null,
    endDate: null,
    current: false,
  };
}

function emptyEducation(): EducationEntry {
  return {
    id: genId(),
    school: "",
    degree: "",
    field: "",
    startYear: null,
    endYear: null,
    current: false,
  };
}

function emptyProject(): ResumeProjectEntry {
  return {
    id: genId(),
    title: "",
    description: "",
    techStack: "",
    githubUrl: "",
    liveUrl: "",
    imageUrl: "",
  };
}

const SECTIONS: Array<{
  id: ResumeContentSection;
  label: string;
}> = [
  { id: "profile", label: "Profile" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "summary", label: "Summary" },
  { id: "links", label: "Links" },
];

function countForSection(
  section: ResumeContentSection,
  data: ResumeData,
): number | null {
  switch (section) {
    case "experience":
      return data.workEntries.length;
    case "projects":
      return getResumeProjects(data).length;
    case "education":
      return data.education.length;
    case "skills":
      return data.skills.length;
    case "links":
      return data.extraLinks.length;
    default:
      return null;
  }
}

const SECTION_ICONS = {
  profile: UserRound,
  experience: BriefcaseBusiness,
  projects: FolderKanban,
  education: GraduationCap,
  skills: Sparkles,
  summary: AlignLeft,
  links: Link2,
} satisfies Record<ResumeContentSection, typeof UserRound>;

function sectionMeta(section: ResumeContentSection, data: ResumeData): string {
  const count = countForSection(section, data);
  if (count !== null) return String(count);
  if (section === "profile") {
    return data.firstName || data.lastName || data.email || data.phone || data.location || data.website
      ? "Added"
      : "Empty";
  }
  return data.summary.trim() ? "Added" : "Empty";
}

function ContentOverview({
  data,
  onOpenSection,
  eyebrow = "Resume content",
  detail = "Shared across your enabled formats.",
}: {
  data: ResumeData;
  onOpenSection: (section: ResumeContentSection) => void;
  eyebrow?: string;
  detail?: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="px-1 pb-2 pt-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2e0562]">
          {eyebrow}
        </div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">
          {detail}
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {SECTIONS.map(item => {
          const Icon = SECTION_ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenSection(item.id)}
              className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/45"
            >
              <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/[0.065] text-[#2e0562]">
                <Icon size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {item.label}
                </span>
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="min-w-[30px] text-right text-[10px] font-medium text-muted-foreground">
                  {sectionMeta(item.id, data)}
                </span>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground/65 transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e0562]"
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ContentNavigation({
  data,
  section,
  onSectionChange,
  compact,
}: {
  data: ResumeData;
  section: ResumeContentSection;
  onSectionChange: (section: ResumeContentSection) => void;
  compact: boolean;
}) {
  return (
    <nav
      className={
        compact
          ? "grid grid-cols-2 gap-1.5 border-b border-border p-3"
          : "space-y-1"
      }
    >
      {SECTIONS.map(item => {
        const count = countForSection(item.id, data);
        const active = section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
              active
                ? "bg-[#2e0562] text-white"
                : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
            }`}
          >
            <span className="truncate">{item.label}</span>
            {count !== null && (
              <span
                className={`text-[10px] ${
                  active ? "text-white/75" : "text-muted-foreground/75"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function SectionHeader({
  eyebrow = "Shared content",
  title,
  detail,
  action,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "mb-3" : "mb-5"} flex items-start justify-between gap-3`}>
      <div className="min-w-0">
        {!compact && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2e0562]">
            {eyebrow}
          </div>
        )}
        <h2 className={`${compact ? "text-sm" : "mt-1 text-base"} truncate font-semibold text-foreground`}>
          {title}
        </h2>
        {detail && !compact && (
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

function ProfileEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <SectionHeader
        title="Profile"
        detail="These details are shared by every enabled resume format."
        compact={compact}
      />
      <div className="space-y-3">
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <input
            value={data.firstName}
            placeholder="First name"
            onChange={event =>
              onChange({ ...data, firstName: event.target.value })
            }
            className={INPUT}
          />
          <input
            value={data.lastName}
            placeholder="Last name"
            onChange={event =>
              onChange({ ...data, lastName: event.target.value })
            }
            className={INPUT}
          />
        </div>
        <input
          value={data.email ?? ""}
          placeholder="Email"
          onChange={event => onChange({ ...data, email: event.target.value })}
          className={INPUT}
        />
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <input
            value={data.phone ?? ""}
            placeholder="Phone"
            onChange={event => onChange({ ...data, phone: event.target.value })}
            className={INPUT}
          />
          <input
            value={data.location ?? ""}
            placeholder="Location"
            onChange={event =>
              onChange({ ...data, location: event.target.value })
            }
            className={INPUT}
          />
        </div>
        <input
          value={data.website ?? ""}
          placeholder="Website / portfolio URL"
          onChange={event =>
            onChange({ ...data, website: event.target.value })
          }
          className={INPUT}
        />
      </div>
    </div>
  );
}

function WorkEditor({
  entry,
  onChange,
  onBack,
  onRemove,
  compact = false,
}: {
  entry: WorkEntry;
  onChange: (entry: WorkEntry) => void;
  onBack: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={13} /> Experience
      </button>
      <SectionHeader
        title={entry.company || entry.title || "New position"}
        detail="Changes here update the shared experience entry everywhere it is used."
        compact={compact}
      />

      <div className="space-y-3">
        <input
          value={entry.company}
          placeholder="Company"
          onChange={event => onChange({ ...entry, company: event.target.value })}
          className={INPUT}
        />
        <input
          value={entry.title}
          placeholder="Job title"
          onChange={event => onChange({ ...entry, title: event.target.value })}
          className={INPUT}
        />
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <MonthYearSelect
            label="Start"
            value={entry.startDate}
            onChange={value => onChange({ ...entry, startDate: value })}
          />
          {!entry.current && (
            <MonthYearSelect
              label="End"
              value={entry.endDate}
              onChange={value => onChange({ ...entry, endDate: value })}
            />
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={entry.current}
            onChange={event =>
              onChange({
                ...entry,
                current: event.target.checked,
                endDate: event.target.checked ? null : entry.endDate,
              })
            }
          />
          Currently working here
        </label>
        <RichTextEditor
          value={entry.body ?? ""}
          onChange={html => onChange({ ...entry, body: html || undefined })}
          placeholder="Describe this role — use bullet points, bold, italic and alignment to format."
          minHeight={120}
        />
        <input
          value={entry.logoUrl ?? ""}
          placeholder="Logo URL (optional)"
          onChange={event =>
            onChange({ ...entry, logoUrl: event.target.value || undefined })
          }
          className={INPUT}
        />
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
        >
          <Trash2 size={13} /> Delete position
        </button>
      </div>
    </div>
  );
}

function ExperienceEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data.workEntries.find(entry => entry.id === editingId);

  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editing, editingId]);

  if (editing) {
    return (
      <WorkEditor
        entry={editing}
        onBack={() => setEditingId(null)}
        onChange={next =>
          onChange({
            ...data,
            workEntries: data.workEntries.map(entry =>
              entry.id === editing.id ? next : entry,
            ),
          })
        }
        onRemove={() => {
          onChange({
            ...data,
            workEntries: data.workEntries.filter(entry => entry.id !== editing.id),
          });
          setEditingId(null);
        }}
        compact={compact}
      />
    );
  }

  return (
    <div>
      <SectionHeader
        title="Experience"
        detail="Your work history is shared across PDF, ATS and Web formats."
        compact={compact}
        action={
          <button
            type="button"
            onClick={() => {
              const entry = emptyWork();
              onChange({
                ...data,
                workEntries: [...data.workEntries, entry],
              });
              setEditingId(entry.id);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2e0562] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90"
          >
            <Plus size={13} /> Add
          </button>
        }
      />

      <div className="space-y-2">
        {data.workEntries.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setEditingId(entry.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-[#2e0562]/25 hover:bg-muted/20"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {entry.company || "Untitled company"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {entry.title || "Add a job title"}
                {formatWorkRange(entry) ? ` · ${formatWorkRange(entry)}` : ""}
              </div>
            </div>
            <ChevronRight size={15} className="flex-none text-muted-foreground" />
          </button>
        ))}

        {data.workEntries.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No experience added yet.
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectEditor({
  project,
  onChange,
  onBack,
  onRemove,
  compact = false,
}: {
  project: ResumeProjectEntry;
  onChange: (project: ResumeProjectEntry) => void;
  onBack: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={13} /> Projects
      </button>
      <SectionHeader
        title={project.title || "New project"}
        detail="Project facts are shared; each output decides how richly to present them."
        compact={compact}
      />
      <div className="space-y-3">
        <input
          value={project.title}
          placeholder="Project name"
          onChange={event => onChange({ ...project, title: event.target.value })}
          className={INPUT}
        />
        <textarea
          value={project.description}
          rows={5}
          placeholder="What did you build? What problem did it solve?"
          onChange={event =>
            onChange({ ...project, description: event.target.value })
          }
          className={`${INPUT} resize-y`}
        />
        <input
          value={project.techStack}
          placeholder="Tech stack — e.g. React, TypeScript, PostgreSQL"
          onChange={event =>
            onChange({ ...project, techStack: event.target.value })
          }
          className={INPUT}
        />
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <input
            value={project.githubUrl}
            placeholder="GitHub URL"
            onChange={event =>
              onChange({ ...project, githubUrl: event.target.value })
            }
            className={INPUT}
          />
          <input
            value={project.liveUrl}
            placeholder="Live / demo URL"
            onChange={event =>
              onChange({ ...project, liveUrl: event.target.value })
            }
            className={INPUT}
          />
        </div>
        <div>
          <input
            value={project.imageUrl}
            placeholder="Project image URL (optional)"
            onChange={event =>
              onChange({ ...project, imageUrl: event.target.value })
            }
            className={INPUT}
          />
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Web may use the image. Designed PDF and ATS remain text-first.
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
        >
          <Trash2 size={13} /> Delete project
        </button>
      </div>
    </div>
  );
}

function ProjectsEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  const projects = getResumeProjects(data);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = projects.find(project => project.id === editingId);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editing, editingId]);

  if (editing) {
    return (
      <ProjectEditor
        project={editing}
        onBack={() => setEditingId(null)}
        onChange={next =>
          onChange(
            withResumeProjects(
              data,
              projects.map(project =>
                project.id === editing.id ? next : project,
              ),
            ),
          )
        }
        onRemove={() => {
          onChange(
            withResumeProjects(
              data,
              projects.filter(project => project.id !== editing.id),
            ),
          );
          setEditingId(null);
        }}
        compact={compact}
      />
    );
  }

  return (
    <div>
      <SectionHeader
        title="Projects"
        detail="Shared project data can render differently in each resume format."
        compact={compact}
        action={
          <button
            type="button"
            onClick={() => {
              const project = emptyProject();
              onChange(withResumeProjects(data, [...projects, project]));
              setEditingId(project.id);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2e0562] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90"
          >
            <Plus size={13} /> Add
          </button>
        }
      />

      <div className="space-y-2">
        {projects.map((project, index) => (
          <div
            key={project.id}
            draggable
            onDragStart={() => {
              dragFrom.current = index;
            }}
            onDragOver={event => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={event => {
              event.preventDefault();
              const from = dragFrom.current;
              if (from !== null && from !== index) {
                const next = [...projects];
                const [item] = next.splice(from, 1);
                next.splice(index, 0, item);
                onChange(withResumeProjects(data, next));
              }
              dragFrom.current = null;
              setDragOver(null);
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragOver(null);
            }}
            className={`flex items-center rounded-xl border bg-card transition-colors ${
              dragOver === index
                ? "border-[#2e0562]/60"
                : "border-border hover:border-[#2e0562]/25"
            }`}
          >
            <span className="flex h-full flex-none cursor-grab items-center px-3 text-muted-foreground">
              <GripVertical size={14} />
            </span>
            <button
              type="button"
              onClick={() => setEditingId(project.id)}
              className="flex min-w-0 flex-1 items-center gap-3 px-1 py-3 pr-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {project.title || "Untitled project"}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {project.techStack || project.description || "Add project details"}
                </div>
              </div>
              <ChevronRight size={15} className="flex-none text-muted-foreground" />
            </button>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No projects added yet.
          </div>
        )}
      </div>
    </div>
  );
}

function EducationDetail({
  entry,
  onChange,
  onBack,
  onRemove,
  compact = false,
}: {
  entry: EducationEntry;
  onChange: (entry: EducationEntry) => void;
  onBack: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={13} /> Education
      </button>
      <SectionHeader title={entry.school || "New school"} compact={compact} />
      <div className="space-y-3">
        <input
          value={entry.school}
          placeholder="School / university"
          onChange={event => onChange({ ...entry, school: event.target.value })}
          className={INPUT}
        />
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <input
            value={entry.degree}
            placeholder="Degree (e.g. BSc)"
            onChange={event => onChange({ ...entry, degree: event.target.value })}
            className={INPUT}
          />
          <input
            value={entry.field}
            placeholder="Field of study"
            onChange={event => onChange({ ...entry, field: event.target.value })}
            className={INPUT}
          />
        </div>
        <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Start year</label>
            <select
              value={entry.startYear ?? ""}
              onChange={event =>
                onChange({
                  ...entry,
                  startYear: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
              className={INPUT}
            >
              <option value="">Year</option>
              {YEARS.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {!entry.current && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">End year</label>
              <select
                value={entry.endYear ?? ""}
                onChange={event =>
                  onChange({
                    ...entry,
                    endYear: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                className={INPUT}
              >
                <option value="">Year</option>
                {YEARS.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={entry.current}
            onChange={event =>
              onChange({
                ...entry,
                current: event.target.checked,
                endYear: event.target.checked ? null : entry.endYear,
              })
            }
          />
          Currently enrolled
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
        >
          <Trash2 size={13} /> Delete school
        </button>
      </div>
    </div>
  );
}

function EducationEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data.education.find(entry => entry.id === editingId);

  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editing, editingId]);

  if (editing) {
    return (
      <EducationDetail
        entry={editing}
        onBack={() => setEditingId(null)}
        onChange={next =>
          onChange({
            ...data,
            education: data.education.map(entry =>
              entry.id === editing.id ? next : entry,
            ),
          })
        }
        onRemove={() => {
          onChange({
            ...data,
            education: data.education.filter(entry => entry.id !== editing.id),
          });
          setEditingId(null);
        }}
        compact={compact}
      />
    );
  }

  return (
    <div>
      <SectionHeader
        title="Education"
        compact={compact}
        action={
          <button
            type="button"
            onClick={() => {
              const entry = emptyEducation();
              onChange({ ...data, education: [...data.education, entry] });
              setEditingId(entry.id);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2e0562] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90"
          >
            <Plus size={13} /> Add
          </button>
        }
      />
      <div className="space-y-2">
        {data.education.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setEditingId(entry.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-[#2e0562]/25 hover:bg-muted/20"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {entry.school || "Untitled school"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {[entry.degree, entry.field].filter(Boolean).join(" · ") || "Add degree details"}
                {(entry.startYear || entry.endYear || entry.current)
                  ? ` · ${entry.startYear ?? ""}${entry.endYear || entry.current ? " – " : ""}${
                      entry.current ? "Present" : entry.endYear ?? ""
                    }`
                  : ""}
              </div>
            </div>
            <ChevronRight size={15} className="flex-none text-muted-foreground" />
          </button>
        ))}
        {data.education.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No education added yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SkillsEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  const [input, setInput] = useState("");
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function addSkill() {
    const value = input.trim();
    if (!value || data.skills.includes(value)) {
      setInput("");
      return;
    }
    onChange({ ...data, skills: [...data.skills, value] });
    setInput("");
  }

  return (
    <div>
      <SectionHeader
        title="Skills"
        detail="Drag skills to control their shared ordering."
        compact={compact}
      />
      <div className="flex gap-2">
        <input
          value={input}
          placeholder="Add a skill"
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              addSkill();
            }
          }}
          className={INPUT}
        />
        <button
          type="button"
          onClick={addSkill}
          className="shrink-0 whitespace-nowrap rounded-lg bg-[#2e0562] px-3 text-xs font-semibold text-white hover:bg-[#2e0562]/90"
        >
          Add
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {data.skills.map((skill, index) => (
          <span
            key={`${skill}-${index}`}
            draggable
            onDragStart={() => {
              dragFrom.current = index;
            }}
            onDragOver={event => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDrop={event => {
              event.preventDefault();
              const from = dragFrom.current;
              if (from !== null && from !== index) {
                const next = [...data.skills];
                const [item] = next.splice(from, 1);
                next.splice(index, 0, item);
                onChange({ ...data, skills: next });
              }
              dragFrom.current = null;
              setDragOver(null);
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragOver(null);
            }}
            className={`inline-flex cursor-grab items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-[#2e0562] ${
              dragOver === index
                ? "border-[#2e0562] bg-[#2e0562]/10"
                : "border-[#2e0562]/15 bg-[#2e0562]/[0.055]"
            }`}
          >
            <GripVertical size={11} />
            {skill}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...data,
                  skills: data.skills.filter((_, itemIndex) => itemIndex !== index),
                })
              }
              className="ml-0.5 leading-none text-[#2e0562]/55 hover:text-[#2e0562]"
              aria-label={`Remove ${skill}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {data.skills.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          No skills added yet.
        </div>
      )}
    </div>
  );
}

function SummaryEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <SectionHeader
        title="Summary"
        detail="Write the core professional summary once; each format can present it differently."
        compact={compact}
      />
      <textarea
        value={data.summary}
        rows={10}
        placeholder="Write a short professional summary…"
        onChange={event => onChange({ ...data, summary: event.target.value })}
        className={`${INPUT} resize-y`}
      />
    </div>
  );
}

function LinksEditor({
  data,
  onChange,
  compact = false,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <SectionHeader
        title="Links"
        compact={compact}
        action={
          <button
            type="button"
            onClick={() =>
              onChange({
                ...data,
                extraLinks: [...data.extraLinks, { label: "", url: "" }],
              })
            }
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2e0562] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2e0562]/90"
          >
            <Plus size={13} /> Add
          </button>
        }
      />

      <div className="space-y-2">
        {data.extraLinks.map((link, index) => (
          <div
            key={index}
            className={
              compact
                ? "relative grid gap-2 rounded-lg border border-border bg-background p-3 pr-10"
                : "grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[160px_1fr_auto]"
            }
          >
            <input
              value={link.label}
              placeholder="Label"
              onChange={event => {
                const next = [...data.extraLinks];
                next[index] = { ...link, label: event.target.value };
                onChange({ ...data, extraLinks: next });
              }}
              className={INPUT}
            />
            <input
              value={link.url}
              placeholder="https://…"
              onChange={event => {
                const next = [...data.extraLinks];
                next[index] = { ...link, url: event.target.value };
                onChange({ ...data, extraLinks: next });
              }}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...data,
                  extraLinks: data.extraLinks.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
              className={
                compact
                  ? "absolute right-2 top-2 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  : "self-center rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              }
              aria-label="Remove link"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {data.extraLinks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No links added yet.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  data,
  onChange,
  compact = false,
}: {
  section: ResumeContentSection;
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  compact?: boolean;
}) {
  switch (section) {
    case "profile":
      return <ProfileEditor data={data} onChange={onChange} compact={compact} />;
    case "experience":
      return <ExperienceEditor data={data} onChange={onChange} compact={compact} />;
    case "projects":
      return <ProjectsEditor data={data} onChange={onChange} compact={compact} />;
    case "education":
      return <EducationEditor data={data} onChange={onChange} compact={compact} />;
    case "skills":
      return <SkillsEditor data={data} onChange={onChange} compact={compact} />;
    case "summary":
      return <SummaryEditor data={data} onChange={onChange} compact={compact} />;
    case "links":
      return <LinksEditor data={data} onChange={onChange} compact={compact} />;
  }
}

export default function ResumeContentPanel({
  data,
  onChange,
  section,
  onSectionChange,
  variant = "workspace",
}: Props) {
  const compact = variant === "sidebar";
  const pdfCompact = variant === "pdf-sidebar";
  const atsCompact = variant === "ats-sidebar";
  const webSectionOnly = variant === "web-sidebar-section";
  const focusedSidebar = pdfCompact || atsCompact;
  const [sidebarEditing, setSidebarEditing] = useState(false);

  if (webSectionOnly) {
    return (
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-4">
        <SectionEditor
          section={section}
          data={data}
          onChange={onChange}
          compact
        />
      </div>
    );
  }

  if (focusedSidebar) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {!sidebarEditing ? (
          <ContentOverview
            data={data}
            eyebrow={atsCompact ? "Shared content" : "Resume content"}
            detail={
              atsCompact
                ? "Edit the shared facts this ATS resume reads."
                : "Shared across your enabled formats."
            }
            onOpenSection={nextSection => {
              onSectionChange(nextSection);
              setSidebarEditing(true);
            }}
          />
        ) : (
          <>
            <div className="flex h-11 flex-none items-center border-b border-border px-3">
              <button
                type="button"
                onClick={() => setSidebarEditing(false)}
                className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-[#2e0562]"
              >
                <ArrowLeft size={13} />
                <span className="truncate">{atsCompact ? "Shared content" : "Resume content"}</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SectionEditor
                section={section}
                data={data}
                onChange={onChange}
                compact
              />
            </div>
          </>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Shared content
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Changes here update every enabled format.
          </p>
        </div>
        <ContentNavigation
          data={data}
          section={section}
          onSectionChange={onSectionChange}
          compact
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SectionEditor section={section} data={data} onChange={onChange} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <aside className="border-r border-border bg-muted/[0.12] p-3">
        <div className="px-3 pb-3 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2e0562]">
            Shared resume data
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Your source of truth across every format.
          </p>
        </div>
        <ContentNavigation
          data={data}
          section={section}
          onSectionChange={onSectionChange}
          compact={false}
        />
      </aside>

      <main className="min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-6 lg:p-8">
          <SectionEditor section={section} data={data} onChange={onChange} />
        </div>
      </main>
    </div>
  );
}
