import API_BASE from "@/lib/api";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { pdf } from "@react-pdf/renderer";
import UniversalTemplate from "@/components/resume-templates/UniversalTemplate";
import ResumeCanvas from "@/components/resume-templates/ResumeCanvas";
import { DEFAULT_DESIGN, STARTING_POINTS } from "@/components/resume-templates/defaults";
import ResumeDesignPanel from "@/components/ResumeDesignPanel";
import type { ResumeData, WorkEntry, EducationEntry } from "@/components/resume-templates/types";
import { genId } from "@/components/resume-templates/types";
import { Lock, Download, Plus, Trash2, ChevronDown, ChevronUp, Save, Loader2, AlertCircle } from "lucide-react";
import { Component, type ReactNode } from "react";
import axios from "axios";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS  = Array.from({ length: 60 }, (_, i) => new Date().getFullYear() - i);

function monthYear(date: string | null): { month: string; year: string } {
  if (!date) return { month: "", year: "" };
  const [y, m] = date.split("-");
  return { month: m ?? "", year: y ?? "" };
}
function toDateStr(month: string, year: string): string | null {
  return month && year ? `${year}-${month.padStart(2, "0")}` : null;
}

function emptyWork(): WorkEntry {
  return { id: genId(), company: "", title: "", startDate: null, endDate: null, current: false };
}

/** Normalizes a saved work entry — migrates legacy bullets/description to unified HTML body. */
function normalizeWorkEntry(e: any): WorkEntry {
  let body: string | undefined = e.body;
  if (!body) {
    const bullets: { id?: string; text?: string }[] = Array.isArray(e.bullets) ? e.bullets : [];
    const desc: string = e.description ?? "";
    const parts: string[] = [];
    if (desc.trim()) parts.push(`<p>${desc.replace(/\n/g, "<br>")}</p>`);
    if (bullets.length > 0) {
      parts.push(`<ul>${bullets.map(b => `<li>${b.text ?? ""}</li>`).join("")}</ul>`);
    }
    body = parts.join("") || undefined;
  }
  return { id: e.id ?? genId(), company: e.company ?? "", title: e.title ?? "", startDate: e.startDate ?? null, endDate: e.endDate ?? null, current: !!e.current, body, managerId: e.managerId, logoUrl: e.logoUrl };
}

function emptyEdu(): EducationEntry {
  return { id: genId(), school: "", degree: "", field: "", startYear: null, endYear: null, current: false };
}

/** Normalizes a saved education entry — adds stable id if absent. */
function normalizeEduEntry(e: any): EducationEntry {
  return { ...e, id: e.id ?? genId() };
}


// ── Error boundary (prevents Design panel crashes from wiping all state) ──────

class DesignPanelErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-2">
          <AlertCircle size={20} className="mx-auto text-red-500" />
          <p className="text-sm font-medium text-foreground">Design panel error</p>
          <p className="text-xs text-muted-foreground">Your content is safe. Reload the page to reset the panel.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Gate screen ───────────────────────────────────────────────────────────────

function GateScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2e0562]/10">
        <Lock size={28} className="text-[#2e0562]" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Unlock your resume builder</h1>
      <p className="text-muted-foreground max-w-sm mb-6">
        Rate at least one manager to unlock the resume builder. Your work history is pre-filled automatically from your ratings.
      </p>
      <button
        onClick={() => navigate("/add")}
        className="inline-flex items-center gap-2 rounded-lg bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors"
      >
        ⭐ Rate a manager
      </button>
    </div>
  );
}

// ── Date selects ──────────────────────────────────────────────────────────────

function MonthYearSelect({ value, onChange, label }: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
}) {
  const parsed = monthYear(value);
  const [localMonth, setLocalMonth] = useState(parsed.month);
  const [localYear,  setLocalYear]  = useState(parsed.year);

  useEffect(() => {
    const p = monthYear(value);
    setLocalMonth(p.month);
    setLocalYear(p.year);
  }, [value]);

  const handleMonth = (m: string) => {
    setLocalMonth(m);
    onChange(toDateStr(m, localYear));
  };
  const handleYear = (y: string) => {
    setLocalYear(y);
    onChange(toDateStr(localMonth, y));
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div className="flex gap-1">
        <select
          value={localMonth}
          onChange={e => handleMonth(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
        </select>
        <select
          value={localYear}
          onChange={e => handleYear(e.target.value)}
          className="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">Year</option>
          {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Work entry editor ─────────────────────────────────────────────────────────

function WorkEntryEditor({ entry, onChange, onRemove }: {
  entry: WorkEntry;
  onChange: (e: WorkEntry) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">
          {entry.title || entry.company || "New entry"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(o => !o)} className="p-1 rounded text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button onClick={onRemove} className="p-1 rounded text-muted-foreground hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3">
          <input value={entry.company} placeholder="Company" onChange={e => onChange({ ...entry, company: e.target.value })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <input value={entry.title} placeholder="Job title" onChange={e => onChange({ ...entry, title: e.target.value })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <div className="grid grid-cols-2 gap-3">
            <MonthYearSelect label="Start" value={entry.startDate} onChange={v => onChange({ ...entry, startDate: v })} />
            {!entry.current && (
              <MonthYearSelect label="End" value={entry.endDate} onChange={v => onChange({ ...entry, endDate: v })} />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={entry.current} onChange={e => onChange({ ...entry, current: e.target.checked, endDate: e.target.checked ? null : entry.endDate })} />
            Currently working here
          </label>
          <RichTextEditor
            value={entry.body ?? ""}
            onChange={html => onChange({ ...entry, body: html || undefined })}
            placeholder="Describe this role — use bullet points (•), bold, italic, and alignment to format."
            minHeight={100}
          />
          <input value={entry.logoUrl ?? ""} placeholder="Logo URL (optional — shown when logos enabled)"
            onChange={e => onChange({ ...entry, logoUrl: e.target.value || undefined })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ── Education entry editor ────────────────────────────────────────────────────

function EduEntryEditor({ entry, onChange, onRemove }: {
  entry: EducationEntry;
  onChange: (e: EducationEntry) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{entry.school || "New school"}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(o => !o)} className="p-1 rounded text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button onClick={onRemove} className="p-1 rounded text-muted-foreground hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3">
          <input value={entry.school} placeholder="School / University" onChange={e => onChange({ ...entry, school: e.target.value })}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <div className="grid grid-cols-2 gap-3">
            <input value={entry.degree} placeholder="Degree (e.g. BSc)" onChange={e => onChange({ ...entry, degree: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <input value={entry.field} placeholder="Field of study" onChange={e => onChange({ ...entry, field: e.target.value })}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Start year</label>
              <select value={entry.startYear ?? ""} onChange={e => onChange({ ...entry, startYear: e.target.value ? Number(e.target.value) : null })}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {!entry.current && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">End year</label>
                <select value={entry.endYear ?? ""} onChange={e => onChange({ ...entry, endYear: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                  <option value="">Year</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={entry.current} onChange={e => onChange({ ...entry, current: e.target.checked, endYear: e.target.checked ? null : entry.endYear })} />
            Currently enrolled
          </label>
        </div>
      )}
    </div>
  );
}

// ── Work list ─────────────────────────────────────────────────────────────────

function WorkList({ entries, onChange, onAdd }: {
  entries: WorkEntry[];
  onChange: (entries: WorkEntry[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <WorkEntryEditor key={i}
          entry={e}
          onChange={next => { const arr = [...entries]; arr[i] = next; onChange(arr); }}
          onRemove={() => onChange(entries.filter((_, j) => j !== i))}
        />
      ))}
      <button onClick={onAdd} className="flex items-center gap-2 text-sm text-[#2e0562] hover:text-[#2e0562]/80 transition-colors">
        <Plus size={14} /> Add position
      </button>
    </div>
  );
}

// ── Education list ────────────────────────────────────────────────────────────

function EduList({ entries, onChange, onAdd }: {
  entries: EducationEntry[];
  onChange: (entries: EducationEntry[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <EduEntryEditor key={i}
          entry={e}
          onChange={next => { const arr = [...entries]; arr[i] = next; onChange(arr); }}
          onRemove={() => onChange(entries.filter((_, j) => j !== i))}
        />
      ))}
      <button onClick={onAdd} className="flex items-center gap-2 text-sm text-[#2e0562] hover:text-[#2e0562]/80 transition-colors">
        <Plus size={14} /> Add school
      </button>
    </div>
  );
}

// ── Skills tab with drag-to-reorder ──────────────────────────────────────────

function SkillsTab({ skills, onChange }: { skills: string[]; onChange: (skills: string[]) => void }) {
  const [input, setInput] = useState("");
  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  function setSkillSource(i: number | null) { dragFromRef.current = i; setDragFrom(i); }

  function addSkill() {
    const trimmed = input.trim();
    if (trimmed && !skills.includes(trimmed)) onChange([...skills, trimmed]);
    setInput("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={input}
          placeholder="Add a skill (press Enter)"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button onClick={addSkill}
          className="rounded border border-[#2e0562] px-3 py-2 text-sm font-semibold text-[#2e0562] hover:bg-[#2e0562]/5 transition-colors">
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((sk, i) => (
          <span key={i}
            onDragOver={ev => { ev.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={ev => {
              ev.preventDefault();
              const from = dragFromRef.current;
              if (from !== null && from !== i) {
                const next = [...skills]; const [item] = next.splice(from, 1); next.splice(i, 0, item); onChange(next);
              }
              setSkillSource(null); setDragOver(null);
            }}
            className="group inline-flex items-center gap-1 rounded-lg bg-[#2e0562]/8 px-2.5 py-1 text-xs font-medium text-[#2e0562]"
            style={{
              opacity: dragFrom === i ? 0.4 : 1,
              outline: dragOver === i && dragFrom !== null && dragFrom !== i ? "2px dashed #7c3aed" : "none",
              borderRadius: 8,
            }}
          >
            <span draggable
              onDragStart={ev => { ev.dataTransfer.setData("text/plain", String(i)); ev.dataTransfer.effectAllowed = "move"; setSkillSource(i); }}
              onDragEnd={() => { setSkillSource(null); setDragOver(null); }}
              style={{ cursor: "grab", display: "flex", alignItems: "center", fontSize: 10, lineHeight: 1, color: "#7c3aed", userSelect: "none" }}>
              ⠿
            </span>
            {sk}
            <button onClick={() => onChange(skills.filter((_, j) => j !== i))}
              className="text-[#2e0562]/60 hover:text-[#2e0562] leading-none ml-0.5">×</button>
          </span>
        ))}
      </div>
      {skills.length === 0 && <p className="text-xs text-muted-foreground">No skills added yet.</p>}
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

const TABS = ["Work", "Education", "Skills", "Bio", "Links", "Design"] as const;
type Tab = typeof TABS[number];

function defaultData(user: { firstName?: string; lastName?: string; email?: string }): ResumeData {
  return {
    firstName:   user.firstName ?? "",
    lastName:    user.lastName  ?? "",
    email:       user.email     ?? "",
    phone:       "",
    location:    "",
    website:     "",
    summary:     "",
    workEntries: [],
    education:   [],
    skills:      [],
    extraLinks:  [],
    design:      DEFAULT_DESIGN,
  };
}

export default function ResumeBuilder() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [data,              setData]              = useState<ResumeData | null>(null);
  const [tab,               setTab]               = useState<Tab>("Work");
  const [saving,            setSaving]            = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [canvasRemeasureKey, setCanvasRemeasureKey] = useState(0);

  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave  = useRef<ResumeData | null>(null);

  const [canvasWidth, setCanvasWidth] = useState(560);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      if (canvasWrapperRef.current) {
        setCanvasWidth(canvasWrapperRef.current.clientWidth - 2);
      }
    }
    update();
    const ro = new ResizeObserver(update);
    if (canvasWrapperRef.current) ro.observe(canvasWrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Load saved resume (or prefill) ────────────────────────────────────────

  useEffect(() => {
    if (!user?.hasContributed) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/resumes/mine`);
        if (!cancelled) {
          if (res.status === 200 && res.data?.data) {
            const saved = res.data.data;
            setData({
              ...defaultData(user), ...saved,
              workEntries: (saved.workEntries ?? []).map(normalizeWorkEntry),
              education:   (saved.education   ?? []).map(normalizeEduEntry),
              design: saved.design ?? DEFAULT_DESIGN,
            });
          } else {
            // 204 = no resume yet — try prefill
            try {
              const pre = await axios.get(`${API_BASE}/api/resumes/mine/prefill`);
              if (!cancelled) {
                const entries: WorkEntry[] = (pre.data.data ?? []).map((e: any) => ({
                  id:        genId(),
                  company:   e.company   ?? "",
                  title:     e.title     ?? "",
                  startDate: e.startDate ?? null,
                  endDate:   e.endDate   ?? null,
                  current:   e.current   ?? false,
                  bullets:   [],
                  managerId: e.managerId,
                  logoUrl:   e.logoUrl,
                }));
                setData({ ...defaultData(user), workEntries: entries });
              }
            } catch {
              if (!cancelled) setData(defaultData(user));
            }
          }
        }
      } catch {
        if (!cancelled) setData(defaultData(user));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Debounced auto-save ────────────────────────────────────────────────────

  const doSave = useCallback(async (d: ResumeData) => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/api/resumes/mine`, {
        summary:     d.summary,
        skills:      d.skills,
        education:   d.education,
        workEntries: d.workEntries,
        extraLinks:  d.extraLinks,
        design:      d.design,
      });
    } catch (e: any) {
      const status = e?.response?.status;
      const body   = e?.response?.data;
      const msg    = (typeof body === "string" ? body : body?.message ?? body?.error) ?? e?.message ?? "unknown";
      console.error(`[Resume] save failed: HTTP ${status ?? "network error"} —`, msg, body ?? e);
      toast.error(`Failed to save (${status ?? "network error"}): ${msg}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const onChange = useCallback((next: ResumeData) => {
    setData(next);
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingSave.current) doSave(pendingSave.current);
    }, 1500);
  }, [doSave]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ── Download ───────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!data) return;
    try {
      const blob = await pdf(<UniversalTemplate data={data} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${data.firstName}-${data.lastName}-resume.pdf`.replace(/\s+/g, "-").toLowerCase();
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  // ── Gates ──────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <h1 className="text-2xl font-semibold mb-3">Sign in to use the resume builder</h1>
          <button onClick={() => navigate("/signin")}
            className="rounded-lg bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors">
            Sign in
          </button>
        </div>
      </Layout>
    );
  }

  if (!user.hasContributed) {
    return <Layout><GateScreen /></Layout>;
  }

  if (loading || !data) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Top bar */}
      <div className="border-b border-border bg-background sticky top-16 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-foreground">Resume Builder</h1>
            {saving && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 size={11} className="animate-spin" /> Saving…</span>}
            {!saving && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Save size={11} /> Auto-saved</span>}
          </div>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2e0562] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2e0562]/90 transition-colors"
          >
            <Download size={14} /> Download PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6 lg:flex-row flex-col">

          {/* ── Left: editor ───────────────────────────────────────────────── */}
          <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 space-y-4">

            {/* Personal info */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Personal Info</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={data.firstName} placeholder="First name" onChange={e => onChange({ ...data, firstName: e.target.value })}
                  className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
                <input value={data.lastName} placeholder="Last name" onChange={e => onChange({ ...data, lastName: e.target.value })}
                  className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              </div>
              <input value={data.email ?? ""} placeholder="Email" onChange={e => onChange({ ...data, email: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <div className="grid grid-cols-2 gap-3">
                <input value={data.phone ?? ""} placeholder="Phone" onChange={e => onChange({ ...data, phone: e.target.value })}
                  className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
                <input value={data.location ?? ""} placeholder="Location" onChange={e => onChange({ ...data, location: e.target.value })}
                  className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              </div>
              <input value={data.website ?? ""} placeholder="Website / Portfolio URL" onChange={e => onChange({ ...data, website: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            </div>

            {/* Starting points strip */}
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Layout</p>
              <div className="grid grid-cols-4 gap-1.5">
                {STARTING_POINTS.map(sp => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => {
                      if (!data) return;
                      onChange({ ...data, design: { ...sp.design, layoutOverrides: undefined } });
                      setCanvasRemeasureKey(k => k + 1);
                    }}
                    className="rounded-lg border border-border px-2 py-1.5 text-left hover:border-[#2e0562]/60 hover:bg-[#2e0562]/5 transition-colors"
                  >
                    <p className="text-[11px] font-semibold text-foreground leading-tight">{sp.label}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{sp.desc.split(" · ")[0]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex border-b border-border">
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                      tab === t ? "bg-[#2e0562] text-white" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              {tab !== "Design" && <div className="p-4 space-y-3">

                {/* Work */}
                {tab === "Work" && (
                  <WorkList
                    entries={data.workEntries}
                    onChange={entries => onChange({ ...data, workEntries: entries })}
                    onAdd={() => onChange({ ...data, workEntries: [...data.workEntries, emptyWork()] })}
                  />
                )}

                {/* Education */}
                {tab === "Education" && (
                  <EduList
                    entries={data.education}
                    onChange={entries => onChange({ ...data, education: entries })}
                    onAdd={() => onChange({ ...data, education: [...data.education, emptyEdu()] })}
                  />
                )}

                {/* Skills */}
                {tab === "Skills" && (
                  <SkillsTab
                    skills={data.skills}
                    onChange={skills => onChange({ ...data, skills })}
                  />
                )}

                {/* Bio */}
                {tab === "Bio" && (
                  <textarea
                    value={data.summary}
                    rows={8}
                    placeholder="Write a short professional summary…"
                    onChange={e => onChange({ ...data, summary: e.target.value })}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
                  />
                )}

                {/* Links */}
                {tab === "Links" && (
                  <div className="space-y-3">
                    {data.extraLinks.map((lnk, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1.5">
                          <input value={lnk.label} placeholder="Label (e.g. LinkedIn)"
                            onChange={e => { const arr = [...data.extraLinks]; arr[i] = { ...lnk, label: e.target.value }; onChange({ ...data, extraLinks: arr }); }}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
                          <input value={lnk.url} placeholder="https://…"
                            onChange={e => { const arr = [...data.extraLinks]; arr[i] = { ...lnk, url: e.target.value }; onChange({ ...data, extraLinks: arr }); }}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
                        </div>
                        <button onClick={() => onChange({ ...data, extraLinks: data.extraLinks.filter((_, j) => j !== i) })}
                          className="mt-1 p-1.5 rounded text-muted-foreground hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => onChange({ ...data, extraLinks: [...data.extraLinks, { label: "", url: "" }] })}
                      className="flex items-center gap-2 text-sm text-[#2e0562] hover:text-[#2e0562]/80 transition-colors">
                      <Plus size={14} /> Add link
                    </button>
                  </div>
                )}

              </div>}
            </div>

            {/* Design panel — rendered as its own scrollable card below the tabs */}
            {tab === "Design" && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden overflow-y-auto" style={{ maxHeight: "calc(100vh - 16rem)" }}>
                <DesignPanelErrorBoundary>
                  <ResumeDesignPanel
                    design={data.design}
                    onChange={design => onChange({ ...data, design })}
                  />
                </DesignPanelErrorBoundary>
              </div>
            )}
          </div>

          {/* ── Right: interactive canvas ───────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div
              ref={canvasWrapperRef}
              className="sticky top-[7.5rem] rounded-2xl border border-border overflow-y-auto bg-muted/30 p-3"
              style={{ maxHeight: "calc(100vh - 9rem)" }}
            >
              <ResumeCanvas
                data={data}
                onDesignChange={design => onChange({ ...data, design })}
                onDataChange={onChange}
                containerWidth={canvasWidth}
                remeasureKey={canvasRemeasureKey}
              />
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
