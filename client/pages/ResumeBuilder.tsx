import API_BASE from "@/lib/api";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { pdf } from "@react-pdf/renderer";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";

import UniversalTemplate from "@/components/resume-templates/UniversalTemplateWithProjects";
import ATSResumeTemplate from "@/components/resume-templates/ATSResumeTemplate";
import ResumeCanvas from "@/components/resume-templates/ResumeCanvas";
import InteractiveResumeWorkspace from "@/components/resume-templates/InteractiveResumeWorkspace";
import ResumeWebModeSwitch from "@/components/resume-templates/ResumeWebModeSwitch";
import ResumeDesignIntelligence from "@/components/resume-templates/ResumeDesignIntelligence";
import ResumeDesignPanel from "@/components/ResumeDesignPanel";
import ResumeBuilderShell, {
  type ResumeBuilderSaveStatus,
} from "@/components/resume-templates/ResumeBuilderShell";
import ATSResumeWorkspace from "@/components/resume-templates/ATSResumeWorkspace";
import ResponsiveResumeWorkspace from "@/components/resume-templates/ResponsiveResumeWorkspace";
import ResumeContentPanel, {
  type ResumeContentSection,
} from "@/components/resume-templates/ResumeContentPanel";
import ResumeContentWorkspace from "@/components/resume-templates/ResumeContentWorkspace";
import ResumeFirstRunGuide from "@/components/resume-templates/ResumeFirstRunGuide";
import ResumeFormatChooser from "@/components/resume-templates/ResumeFormatChooser";
import ResumeFormatManager from "@/components/resume-templates/ResumeFormatManager";

import { DEFAULT_DESIGN } from "@/components/resume-templates/defaults";
import type {
  ResumeData,
  WorkEntry,
} from "@/components/resume-templates/types";
import { genId } from "@/components/resume-templates/types";
import {
  RESUME_TEMPLATES,
  applyResumeTemplate,
  detachResumeTemplate,
  getAppliedResumeTemplateId,
  type ResumeTemplateDefinition,
} from "@/components/resume-templates/resumeDesignTemplates";
import { compactResumeDesignImages } from "@/components/resume-templates/resumeImageCompression";
import { injectLinkedTextIntoResponsiveHtml } from "@/components/resume-templates/resumeDesignObjects";
import { effectiveResumeDataForSurface } from "@/components/resume-templates/resumeSharedContentOverrides";
import { buildAnimatedStandaloneResumeWebHtml } from "@/components/resume-templates/resumeWebAnimation";
import { buildStandaloneInteractiveResumeHtml } from "@/components/resume-templates/resumeInteractivePublish";
import {
  analyzeInteractivePublish,
  formatBytes,
  prepareInteractiveDataForPublish,
} from "@/components/resume-templates/resumeInteractivePerformance";
import {
  createInteractivePublishSnapshot,
  recordPreparedInteractiveSnapshot,
  InteractivePublishBlockedError,
} from "@/components/resume-templates/resumeInteractivePublishing";
import {
  getResumeProjects,
  migrateLegacyWebPortfolioData,
  withResumeProjects,
} from "@/components/resume-templates/resumeProjects";
import {
  relinkAllWebTypographyToShared,
} from "@/components/resume-templates/resumePresentation";
import {
  getResumeWebSettings,
  withResumeWebSettings,
  type ResumeWebVideoPlacement,
} from "@/components/resume-templates/resumeWeb";
import {
  getActiveWebExperienceMode,
  setActiveWebExperienceMode,
  type WebExperienceMode,
} from "@/components/resume-templates/resumeWebExperience";
import {
  createNewResumeDesignWithFormatChooser,
  firstEnabledWebWorkspace,
  getResumeBuilderFormats,
  isWorkspaceEnabled,
  withResumeBuilderFormats,
  type ResumeBuilderEnabledFormats,
  type ResumeBuilderWorkspace,
} from "@/components/resume-templates/resumeBuilderFormats";

// ── Error boundary ───────────────────────────────────────────────────────────

class DesignPanelErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-2">
          <AlertCircle size={20} className="mx-auto text-red-500" />
          <p className="text-sm font-medium text-foreground">
            Design panel error
          </p>
          <p className="text-xs text-muted-foreground">
            Your content is safe. Reload the page to reset the panel.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Gate screen ──────────────────────────────────────────────────────────────

function GateScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2e0562]/10">
        <Lock size={28} className="text-[#2e0562]" />
      </div>
      <h1 className="mb-2 text-2xl font-semibold text-foreground">
        Unlock your resume builder
      </h1>
      <p className="mb-6 max-w-sm text-muted-foreground">
        Rate at least one manager to unlock the resume builder. Your work history
        is pre-filled automatically from your ratings.
      </p>
      <button
        onClick={() => navigate("/add")}
        className="inline-flex items-center gap-2 rounded-lg bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2e0562]/90"
      >
        ⭐ Rate a manager
      </button>
    </div>
  );
}

// ── Template preview / gallery ───────────────────────────────────────────────

function TemplateMiniPreview({ template, large = false }: {
  template: ResumeTemplateDefinition;
  large?: boolean;
}) {
  const p = template.preview;
  const width = large ? 176 : 74;
  const height = large ? 222 : 94;
  const pad = large ? 12 : 5;
  const sidebarW = p.layout === "single" ? 0 : Math.round(width * 0.27);
  const contentX = p.layout === "sidebar-left" ? sidebarW : 0;
  const lineH = large ? 4 : 2;
  const headingH = large ? 7 : 3;

  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        borderRadius: large ? 8 : 5,
        background: p.paper,
        border: "1px solid #e4e4e7",
        boxShadow: large ? "0 8px 20px rgba(15,23,42,0.08)" : "0 2px 6px rgba(15,23,42,0.06)",
      }}
    >
      {p.layout !== "single" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: sidebarW,
            left: p.layout === "sidebar-left" ? 0 : undefined,
            right: p.layout === "sidebar-right" ? 0 : undefined,
            background: p.sidebarColor ?? `${p.accent}18`,
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: contentX + pad,
          right: p.layout === "sidebar-right" ? sidebarW + pad : pad,
          top: pad,
        }}
      >
        <div style={{ width: "58%", height: headingH, borderRadius: 999, background: "#27272a", opacity: 0.92 }} />
        <div style={{ width: "72%", height: lineH, borderRadius: 999, background: "#a1a1aa", marginTop: large ? 6 : 3 }} />

        {p.headerAccent && (
          <div style={{ width: "100%", height: large ? 3 : 2, background: p.accent, borderRadius: 999, marginTop: large ? 8 : 4 }} />
        )}

        {[0, 1, 2].map(section => (
          <div key={section} style={{ marginTop: large ? 15 : 7, position: "relative" }}>
            {p.timeline && section < 2 && (
              <>
                <div style={{
                  position: "absolute",
                  left: large ? -7 : -3,
                  top: large ? 13 : 6,
                  width: large ? 2 : 1,
                  height: large ? 37 : 16,
                  background: p.accent,
                  opacity: 0.65,
                }} />
                <div style={{
                  position: "absolute",
                  left: large ? -10 : -5,
                  top: large ? 11 : 5,
                  width: large ? 8 : 4,
                  height: large ? 8 : 4,
                  borderRadius: "50%",
                  background: p.accent,
                }} />
              </>
            )}
            <div style={{ width: "38%", height: large ? 4 : 2, borderRadius: 999, background: p.accent }} />
            <div style={{ width: section === 1 ? "78%" : "88%", height: lineH, borderRadius: 999, background: "#71717a", marginTop: large ? 8 : 4 }} />
            <div style={{ width: "96%", height: lineH, borderRadius: 999, background: "#d4d4d8", marginTop: large ? 5 : 2 }} />
            <div style={{ width: "82%", height: lineH, borderRadius: 999, background: "#d4d4d8", marginTop: large ? 4 : 2 }} />
          </div>
        ))}
      </div>

      {p.layout !== "single" && (
        <div
          style={{
            position: "absolute",
            width: Math.max(10, sidebarW - pad * 2),
            left: p.layout === "sidebar-left" ? pad : undefined,
            right: p.layout === "sidebar-right" ? pad : undefined,
            top: large ? 48 : 21,
          }}
        >
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: i % 2 ? "70%" : "88%",
                height: lineH,
                borderRadius: 999,
                background: i === 0 ? p.accent : "#a78bfa",
                opacity: i === 0 ? 0.9 : 0.5,
                marginTop: large ? 8 : 4,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateGallery({
  currentTemplateId,
  onApply,
  onDetach,
  onClose,
}: {
  currentTemplateId?: string;
  onApply: (template: ResumeTemplateDefinition) => void;
  onDetach: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<"All" | "Professional" | "Modern" | "Creative">("All");
  const categories = ["All", "Professional", "Modern", "Creative"] as const;
  const visible = category === "All"
    ? RESUME_TEMPLATES
    : RESUME_TEMPLATES.filter(template => template.category === category);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#2e0562]" />
              <h2 className="text-base font-semibold text-foreground">Templates</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Shared visual starting points for Designed PDF + Responsive Web. Your resume content stays yours.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close templates"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          {categories.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === item
                  ? "bg-[#2e0562] text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
          {currentTemplateId && (
            <button
              type="button"
              onClick={onDetach}
              className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
              title="Keep the current appearance but stop treating it as an applied template"
            >
              Make current design custom
            </button>
          )}
        </div>

        <div className="max-h-[calc(90vh-9rem)] overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(template => {
              const active = currentTemplateId === template.id;
              return (
                <div
                  key={template.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    active
                      ? "border-[#2e0562] bg-[#2e0562]/[0.035] shadow-sm"
                      : "border-border bg-card hover:border-[#2e0562]/40"
                  }`}
                >
                  <div className="flex justify-center rounded-xl bg-muted/30 py-4">
                    <TemplateMiniPreview template={template} large />
                  </div>

                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                        {active && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#2e0562]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2e0562]">
                            <Check size={10} /> Applied
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{template.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onApply(template)}
                    className={`mt-4 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? "border border-[#2e0562]/30 text-[#2e0562] hover:bg-[#2e0562]/5"
                        : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                    }`}
                  >
                    {active ? "Reapply template" : "Use this template"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Applying a shared template updates the Designed PDF and gives Responsive Web a responsive adaptation of
            the same visual structure - including sidebar direction, accent treatment and timeline styling where the
            template uses them. Web-only content and your breakpoint-specific edits stay intact. Existing Web typography
            overrides are re-linked so the selected template is visibly shared across both formats.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Projects - shared resume content ─────────────────────────────────────────


// ── Web-only video content ───────────────────────────────────────────────────

function VideoTab({
  data,
  onChange,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
}) {
  const settings = getResumeWebSettings(data.design);
  const video = settings.videoIntro;

  function patchVideo(patch: Partial<typeof video>) {
    onChange({
      ...data,
      design: withResumeWebSettings(data.design, {
        videoIntro: { ...video, ...patch },
      }),
    });
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2e0562]/45 focus:ring-2 focus:ring-[#2e0562]/10";

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-foreground">
          Video introduction
        </div>
        <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
          Add a Web-only introduction from YouTube, Vimeo, or a direct MP4/WebM URL.
        </p>
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Show video introduction
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            YouTube, Vimeo, or a direct MP4/WebM URL.
          </div>
        </div>
        <input
          type="checkbox"
          checked={video.enabled}
          onChange={event => patchVideo({ enabled: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[#2e0562]"
        />
      </label>

      <input
        value={video.url}
        placeholder="Video URL"
        onChange={event => patchVideo({ url: event.target.value })}
        className={inputCls}
      />
      <input
        value={video.title}
        placeholder="Section title - e.g. Video introduction"
        onChange={event => patchVideo({ title: event.target.value })}
        className={inputCls}
      />
      <textarea
        value={video.caption}
        rows={3}
        placeholder="Optional caption"
        onChange={event => patchVideo({ caption: event.target.value })}
        className={`${inputCls} resize-y`}
      />

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          Placement
        </label>
        <select
          value={video.placement}
          onChange={event =>
            patchVideo({
              placement: event.target.value as ResumeWebVideoPlacement,
            })
          }
          className={inputCls}
        >
          <option value="after-hero">After personal info</option>
          <option value="after-about">After summary</option>
        </select>
      </div>
    </div>
  );
}

// ── Defaults / normalization ─────────────────────────────────────────────────

function normalizeWorkEntry(entry: any): WorkEntry {
  let body: string | undefined = entry.body;

  if (!body) {
    const bullets: { id?: string; text?: string }[] = Array.isArray(entry.bullets)
      ? entry.bullets
      : [];
    const description: string = entry.description ?? "";
    const parts: string[] = [];

    if (description.trim()) {
      parts.push(`<p>${description.replace(/\n/g, "<br>")}</p>`);
    }
    if (bullets.length > 0) {
      parts.push(
        `<ul>${bullets
          .map(bullet => `<li>${bullet.text ?? ""}</li>`)
          .join("")}</ul>`,
      );
    }
    body = parts.join("") || undefined;
  }

  return {
    id: entry.id ?? genId(),
    company: entry.company ?? "",
    title: entry.title ?? "",
    startDate: entry.startDate ?? null,
    endDate: entry.endDate ?? null,
    current: !!entry.current,
    body,
    managerId: entry.managerId,
    logoUrl: entry.logoUrl,
  };
}

function normalizeEducationEntry(entry: any) {
  return { ...entry, id: entry.id ?? genId() };
}

function defaultData(
  user: { firstName?: string; lastName?: string; email?: string },
  isBrandNew = false,
): ResumeData {
  const design = isBrandNew
    ? createNewResumeDesignWithFormatChooser(DEFAULT_DESIGN)
    : DEFAULT_DESIGN;

  const base: ResumeData = {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email ?? "",
    phone: "",
    location: "",
    website: "",
    summary: "",
    workEntries: [],
    education: [],
    skills: [],
    extraLinks: [],
    design,
  };

  return withResumeProjects(base, []);
}

// ── PDF editor preference helpers ────────────────────────────────────────────

const PDF_SIDEBAR_COLLAPSED_KEY = "werkpages.resumeBuilder.pdfSidebarCollapsed";

function getInitialPdfSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PDF_SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

const LAST_WORKSPACE_KEY = "werkpages.resumeBuilder.lastWorkspace";
const FIRST_RUN_GUIDE_KEY = "werkpages.resumeBuilder.firstRunGuidePending";

function firstRunGuideStorageKey(userId?: string | number | null) {
  return userId
    ? `${FIRST_RUN_GUIDE_KEY}.${String(userId)}`
    : FIRST_RUN_GUIDE_KEY;
}

function readFirstRunGuidePending(
  userId?: string | number | null,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(firstRunGuideStorageKey(userId)) === "true";
  } catch {
    return false;
  }
}

function writeFirstRunGuidePending(
  userId: string | number | null | undefined,
  pending: boolean,
) {
  if (typeof window === "undefined") return;
  try {
    if (pending) {
      window.localStorage.setItem(firstRunGuideStorageKey(userId), "true");
    } else {
      window.localStorage.removeItem(firstRunGuideStorageKey(userId));
    }
  } catch {
    // Browser storage can be unavailable in private/restricted contexts.
  }
}

function lastWorkspaceStorageKey(userId?: string | number | null) {
  return userId ? `${LAST_WORKSPACE_KEY}.${String(userId)}` : LAST_WORKSPACE_KEY;
}

function getStoredWorkspace(
  userId: string | number | null | undefined,
  enabled: ResumeBuilderEnabledFormats,
): ResumeBuilderWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(lastWorkspaceStorageKey(userId));
    if (!stored) return null;
    const candidate = stored as ResumeBuilderWorkspace;
    return isWorkspaceEnabled(candidate, enabled) ? candidate : null;
  } catch {
    return null;
  }
}

// ── Builder ──────────────────────────────────────────────────────────────────

export default function ResumeBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<ResumeData | null>(null);
  const [saveStatus, setSaveStatus] =
    useState<ResumeBuilderSaveStatus>("saved");
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] =
    useState<ResumeBuilderWorkspace>("designed-pdf");
  const [preferredWebWorkspace, setPreferredWebWorkspace] = useState<
    "responsive-web" | "interactive-web"
  >("responsive-web");
  const [formatManagerOpen, setFormatManagerOpen] = useState(false);
  const [firstRunGuideVisible, setFirstRunGuideVisible] = useState(false);
  const [canvasRemeasureKey, setCanvasRemeasureKey] = useState(0);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [interactiveTemplateOpenRequest, setInteractiveTemplateOpenRequest] = useState(0);
  const [designCheckOpen, setDesignCheckOpen] = useState(false);
  const [sharedSection, setSharedSection] =
    useState<ResumeContentSection>("profile");
  const [pdfSidebarMode, setPdfSidebarMode] =
    useState<"content" | "design">("content");
  const [pdfSidebarCollapsed, setPdfSidebarCollapsed] = useState(
    getInitialPdfSidebarCollapsed,
  );
  const [webSidebarMode, setWebSidebarMode] =
    useState<"content" | "site">("content");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<ResumeData | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(840);

  const handlePdfSidebarWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.defaultPrevented || !event.deltaY || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    let node: HTMLElement | null = target;
    while (node && node !== event.currentTarget) {
      const style = window.getComputedStyle(node);
      const scrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrollable) {
        const max = node.scrollHeight - node.clientHeight;
        const canConsume = event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop < max - 1;
        if (canConsume) return;
      }
      node = node.parentElement;
    }

    const primary = canvasWrapperRef.current;
    if (!primary) return;
    const max = primary.scrollHeight - primary.clientHeight;
    if (max <= 0) return;
    const before = primary.scrollTop;
    primary.scrollTop = Math.max(0, Math.min(max, before + event.deltaY));
    if (primary.scrollTop !== before) event.preventDefault();
  }, []);

  const formatState = data
    ? getResumeBuilderFormats(data.design)
    : null;

  // ── Load saved resume / prefill ───────────────────────────────────────────

  useEffect(() => {
    if (!user?.hasContributed) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/resumes/mine`);

        if (cancelled) return;

        if (response.status === 200 && response.data?.data) {
          const saved = response.data.data;
          const normalizedSaved = {
            ...saved,
            workEntries: (saved.workEntries ?? []).map(normalizeWorkEntry),
            education: (saved.education ?? []).map(normalizeEducationEntry),
            design: saved.design ?? DEFAULT_DESIGN,
          } as ResumeData;

          const migrated = migrateLegacyWebPortfolioData(normalizedSaved);
          const nextData: ResumeData = {
            ...defaultData(user),
            ...migrated,
            workEntries: migrated.workEntries ?? [],
            education: migrated.education ?? [],
            skills: migrated.skills ?? [],
            extraLinks: migrated.extraLinks ?? [],
            design: migrated.design ?? DEFAULT_DESIGN,
          };

          setData(nextData);
          setFirstRunGuideVisible(readFirstRunGuidePending(user?.id));

          const formats = getResumeBuilderFormats(nextData.design);
          const storedWorkspace = getStoredWorkspace(
            user?.id,
            formats.enabled,
          );
          const activeWebMode = getActiveWebExperienceMode(nextData.design);
          const preferredFromDesign: "responsive-web" | "interactive-web" =
            activeWebMode === "interactive"
              ? "interactive-web"
              : "responsive-web";

          if (
            (preferredFromDesign === "responsive-web" &&
              formats.enabled.responsiveWeb) ||
            (preferredFromDesign === "interactive-web" &&
              formats.enabled.interactiveWeb)
          ) {
            setPreferredWebWorkspace(preferredFromDesign);
          }

          if (storedWorkspace) {
            setWorkspace(storedWorkspace);
            if (
              storedWorkspace === "responsive-web" ||
              storedWorkspace === "interactive-web"
            ) {
              setPreferredWebWorkspace(storedWorkspace);
            }
          } else if (formats.enabled.designedPdf) {
            setWorkspace("designed-pdf");
          } else if (formats.enabled.ats) {
            setWorkspace("ats");
          } else {
            const web = firstEnabledWebWorkspace(formats.enabled);
            setWorkspace(web ?? "content");
            if (web) setPreferredWebWorkspace(web);
          }
        } else {
          try {
            const prefill = await axios.get(
              `${API_BASE}/api/resumes/mine/prefill`,
            );

            if (cancelled) return;

            const entries: WorkEntry[] = (prefill.data.data ?? []).map(
              (entry: any) => ({
                id: genId(),
                company: entry.company ?? "",
                title: entry.title ?? "",
                startDate: entry.startDate ?? null,
                endDate: entry.endDate ?? null,
                current: entry.current ?? false,
                bullets: [],
                managerId: entry.managerId,
                logoUrl: entry.logoUrl,
              }),
            );

            setData({
              ...defaultData(user, true),
              workEntries: entries,
            });
            setFirstRunGuideVisible(false);
            setWorkspace("content");
          } catch {
            if (!cancelled) {
              setData(defaultData(user, true));
              setFirstRunGuideVisible(false);
              setWorkspace("content");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setData(defaultData(user, true));
          setFirstRunGuideVisible(false);
          setWorkspace("content");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const doSave = useCallback(async (nextData: ResumeData) => {
    setSaveStatus("saving");

    try {
      const compactedDesign = await compactResumeDesignImages(
        nextData.design ?? DEFAULT_DESIGN,
      );

      const payload = {
        summary: nextData.summary,
        skills: nextData.skills,
        education: nextData.education,
        workEntries: nextData.workEntries,
        projects: getResumeProjects(nextData),
        extraLinks: nextData.extraLinks,
        design: compactedDesign,
      };

      const payloadChars = JSON.stringify(payload).length;
      if (payloadChars > 90_000) {
        throw new Error(
          `Resume save payload is still too large (${Math.ceil(
            payloadChars / 1024,
          )} KB). Remove one or more large decorative images and try again.`,
        );
      }

      await axios.put(`${API_BASE}/api/resumes/mine`, payload);

      if (compactedDesign !== nextData.design) {
        setData(current => {
          if (!current || current.design !== nextData.design) return current;
          const compacted = { ...current, design: compactedDesign };
          if (pendingSave.current?.design === nextData.design) {
            pendingSave.current = compacted;
          }
          return compacted;
        });
      }

      setSaveStatus(pendingSave.current ? "pending" : "saved");
    } catch (error: any) {
      setSaveStatus("error");
      const status = error?.response?.status;
      const body = error?.response?.data;
      const message =
        (typeof body === "string"
          ? body
          : body?.message ?? body?.error) ??
        error?.message ??
        "unknown";

      console.error(
        `[Resume] save failed: HTTP ${status ?? "network error"} -`,
        message,
        body ?? error,
      );
      toast.error(
        status ? `Failed to save (${status}): ${message}` : message,
      );
    }
  }, []);

  const onChange = useCallback(
    (next: ResumeData) => {
      setData(next);
      pendingSave.current = next;
      setSaveStatus("pending");

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const nextToSave = pendingSave.current;
        pendingSave.current = null;
        if (nextToSave) doSave(nextToSave);
      }, 1500);
    },
    [doSave],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PDF_SIDEBAR_COLLAPSED_KEY,
        String(pdfSidebarCollapsed),
      );
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
  }, [pdfSidebarCollapsed]);


  useEffect(() => {
    if (!user?.id) return;
    try {
      window.localStorage.setItem(
        lastWorkspaceStorageKey(user.id),
        workspace,
      );
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
  }, [user?.id, workspace]);

  // ── Canvas width ──────────────────────────────────────────────────────────

  useEffect(() => {
    const element = canvasWrapperRef.current;
    if (!element) return;

    const update = () => {
      setCanvasWidth(Math.max(320, element.clientWidth - 24));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [workspace, pdfSidebarMode]);

  // ── Workspace / format helpers ────────────────────────────────────────────

  const switchWorkspace = useCallback(
    (nextWorkspace: ResumeBuilderWorkspace) => {
      if (!data) return;

      const formats = getResumeBuilderFormats(data.design);
      if (!isWorkspaceEnabled(nextWorkspace, formats.enabled)) return;

      setWorkspace(nextWorkspace);

      if (
        nextWorkspace === "responsive-web" ||
        nextWorkspace === "interactive-web"
      ) {
        setPreferredWebWorkspace(nextWorkspace);
        const mode: WebExperienceMode =
          nextWorkspace === "interactive-web" ? "interactive" : "responsive";

        if (getActiveWebExperienceMode(data.design) !== mode) {
          onChange({
            ...data,
            design: setActiveWebExperienceMode(data.design, mode),
          });
        }
      }
    },
    [data, onChange],
  );

  const applyEnabledFormats = useCallback(
    (enabled: ResumeBuilderEnabledFormats, onboardingComplete = true) => {
      if (!data) return;

      const nextDesign = withResumeBuilderFormats(data.design, {
        version: 1,
        onboardingComplete,
        enabled,
      });

      onChange({ ...data, design: nextDesign });

      if (!isWorkspaceEnabled(workspace, enabled)) {
        setWorkspace("content");
      }

      if (
        preferredWebWorkspace === "responsive-web" &&
        !enabled.responsiveWeb
      ) {
        setPreferredWebWorkspace(
          enabled.interactiveWeb ? "interactive-web" : "responsive-web",
        );
      } else if (
        preferredWebWorkspace === "interactive-web" &&
        !enabled.interactiveWeb
      ) {
        setPreferredWebWorkspace(
          enabled.responsiveWeb ? "responsive-web" : "interactive-web",
        );
      }
    },
    [data, onChange, preferredWebWorkspace, workspace],
  );

  // ── Export / preview ──────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!data || workspace === "content") return;

    try {
      if (
        workspace === "responsive-web" ||
        workspace === "interactive-web"
      ) {
        let html: string;

        if (workspace === "interactive-web") {
          const prepared = await prepareInteractiveDataForPublish(data);
          html = buildStandaloneInteractiveResumeHtml(prepared.data);

          const report = analyzeInteractivePublish(prepared.data, html);
          if (report.readiness === "blocked") {
            toast.error(
              report.issues.find(issue => issue.severity === "error")
                ?.detail ??
                "Interactive export is too large to publish safely.",
            );
            return;
          }

          if (prepared.compressedAssetCount > 0) {
            const savedChars =
              prepared.embeddedCharsBefore - prepared.embeddedCharsAfter;
            toast.success(
              `Optimized ${prepared.compressedAssetCount} Interactive image${
                prepared.compressedAssetCount === 1 ? "" : "s"
              } for export${
                savedChars > 0
                  ? ` · saved about ${formatBytes(savedChars)}`
                  : ""
              }.`,
            );
          }

          if (report.warningCount > 0) {
            toast.warning(
              `Exporting with ${report.warningCount} performance warning${
                report.warningCount === 1 ? "" : "s"
              }. The visitor runtime will simplify effects on lower-powered devices.`,
            );
          }
        } else {
          const responsiveData = effectiveResumeDataForSurface(
            data,
            "responsive",
          );
          html = injectLinkedTextIntoResponsiveHtml(
            buildAnimatedStandaloneResumeWebHtml(responsiveData),
            responsiveData.design,
          );
        }

        const blob = new Blob([html], {
          type: "text/html;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = `${data.firstName}-${data.lastName}-resume.html`
          .replace(/\s+/g, "-")
          .toLowerCase();
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }

      const pdfDocument =
        workspace === "ats" ? (
          <ATSResumeTemplate data={data} />
        ) : (
          <UniversalTemplate data={effectiveResumeDataForSurface(data, "pdf")} />
        );
      const blob = await pdf(pdfDocument).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const suffix = workspace === "ats" ? "-ats" : "";
      anchor.download = `${data.firstName}-${data.lastName}-resume${suffix}.pdf`
        .replace(/\s+/g, "-")
        .toLowerCase();
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(
        workspace === "responsive-web" || workspace === "interactive-web"
          ? "Failed to export web resume"
          : workspace === "ats"
            ? "Failed to generate ATS PDF"
            : "Failed to generate PDF",
      );
    }
  };

  const handleOpenWebPreview = async () => {
    if (
      !data ||
      (workspace !== "responsive-web" && workspace !== "interactive-web")
    ) {
      return;
    }

    const opened = window.open("about:blank", "_blank");
    if (!opened) {
      toast.error("Your browser blocked the preview window");
      return;
    }

    try {
      opened.opener = null;
      let html: string;

      if (workspace === "interactive-web") {
        const prepared = await prepareInteractiveDataForPublish(data);
        html = buildStandaloneInteractiveResumeHtml(prepared.data);

        const report = analyzeInteractivePublish(prepared.data, html);
        if (report.readiness === "blocked") {
          opened.close();
          toast.error(
            report.issues.find(issue => issue.severity === "error")
              ?.detail ??
              "Interactive preview is too large to open safely.",
          );
          return;
        }

        if (report.warningCount > 0) {
          toast.warning(
            `Preview has ${report.warningCount} performance warning${
              report.warningCount === 1 ? "" : "s"
            }. Lower-powered visitors automatically receive a lighter runtime.`,
          );
        }
      } else {
        const responsiveData = effectiveResumeDataForSurface(
          data,
          "responsive",
        );
        html = injectLinkedTextIntoResponsiveHtml(
          buildAnimatedStandaloneResumeWebHtml(responsiveData),
          responsiveData.design,
        );
      }

      const blob = new Blob([html], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);

      try {
        opened.location.href = url;
      } catch {
        opened.close();
        URL.revokeObjectURL(url);
        toast.error("Failed to open web preview");
        return;
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      opened.close();
      toast.error("Failed to open web preview");
    }
  };

  const handlePrepareInteractivePublish = async () => {
    if (!data || workspace !== "interactive-web") return;

    try {
      const snapshot = await createInteractivePublishSnapshot(data);
      const nextDesign = recordPreparedInteractiveSnapshot(
        data.design,
        snapshot.metadata,
      );

      onChange({ ...data, design: nextDesign });

      toast.success(
        snapshot.metadata.addressMode === "werkpages"
          ? `Prepared for Werkpages hosting at /resume/${snapshot.metadata.slug}.`
          : `Prepared for hosting at ${snapshot.metadata.customDomainHostname}.`,
      );

      if (snapshot.report.warningCount > 0) {
        toast.warning(
          `${snapshot.report.warningCount} publish warning${
            snapshot.report.warningCount === 1 ? "" : "s"
          } remain. The snapshot is still deployable.`,
        );
      }
    } catch (error) {
      if (error instanceof InteractivePublishBlockedError) {
        toast.error(error.message);
        return;
      }

      console.error("Failed to prepare Interactive publish snapshot", error);
      toast.error("Failed to prepare Interactive publish snapshot.");
    }
  };

  // ── Gates ─────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <h1 className="mb-3 text-2xl font-semibold">
            Sign in to use the resume builder
          </h1>
          <button
            onClick={() => navigate("/signin")}
            className="rounded-lg bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2e0562]/90"
          >
            Sign in
          </button>
        </div>
      </Layout>
    );
  }

  if (!user.hasContributed) {
    return (
      <Layout>
        <GateScreen />
      </Layout>
    );
  }

  if (loading || !data || !formatState) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  // ── Header actions ────────────────────────────────────────────────────────

  const actions =
    workspace === "content" ? null : (
      <>
        {(workspace === "designed-pdf" ||
          workspace === "responsive-web" ||
          workspace === "interactive-web") && (
          <button
            type="button"
            onClick={() => {
              if (workspace === "interactive-web") {
                setInteractiveTemplateOpenRequest(request => request + 1);
              } else {
                setTemplatePickerOpen(true);
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2e0562]/25 bg-[#2e0562]/5 px-2.5 text-xs font-semibold text-[#2e0562] transition-colors hover:border-[#2e0562]/40 hover:bg-[#2e0562]/10"
            title={
              workspace === "interactive-web"
                ? "Browse Interactive templates"
                : "Browse shared PDF and Responsive Web templates"
            }
            aria-label="Browse templates"
          >
            <LayoutTemplate size={13} />
            <span className="hidden xl:inline">Templates</span>
          </button>
        )}

        {(workspace === "responsive-web" ||
          workspace === "interactive-web") && (
          <button
            type="button"
            onClick={handleOpenWebPreview}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2e0562]/25 bg-background px-2.5 text-xs font-semibold text-[#2e0562] transition-colors hover:bg-[#2e0562]/5"
            title="Open Web preview"
            aria-label="Open Web preview"
          >
            <ExternalLink size={13} />
            <span className="hidden xl:inline">Preview</span>
          </button>
        )}

        {workspace === "interactive-web" && (
          <button
            type="button"
            onClick={handlePrepareInteractivePublish}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2e0562]/25 bg-[#2e0562]/5 px-2.5 text-xs font-semibold text-[#2e0562] transition-colors hover:bg-[#2e0562]/10"
            title="Prepare Interactive publish"
            aria-label="Prepare Interactive publish"
          >
            <CloudUpload size={13} />
            <span className="hidden 2xl:inline">Prepare publish</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2e0562] px-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#2e0562]/90"
          title={
            workspace === "designed-pdf"
              ? "Download PDF"
              : workspace === "ats"
                ? "Download ATS PDF"
                : "Export HTML"
          }
          aria-label={
            workspace === "designed-pdf"
              ? "Download PDF"
              : workspace === "ats"
                ? "Download ATS PDF"
                : "Export HTML"
          }
        >
          <Download size={13} />
          <span className="hidden lg:inline">
            {workspace === "designed-pdf"
              ? "Download PDF"
              : workspace === "ats"
                ? "Download ATS PDF"
                : "Export HTML"}
          </span>
        </button>
      </>
    );

  const webModeControl =
    (formatState.enabled.responsiveWeb &&
      formatState.enabled.interactiveWeb &&
      (workspace === "responsive-web" || workspace === "interactive-web")) ? (
      <ResumeWebModeSwitch
        mode={workspace === "interactive-web" ? "interactive" : "responsive"}
        onChange={mode =>
          switchWorkspace(
            mode === "interactive" ? "interactive-web" : "responsive-web",
          )
        }
      />
    ) : null;

  // ── Workspace renderers ──────────────────────────────────────────────────

  const renderDesignedWorkspace = () => (
    <div
      className={`grid h-full min-h-0 gap-4 p-4 lg:p-5 ${
        pdfSidebarCollapsed
          ? "lg:grid-cols-[48px_minmax(0,1fr)]"
          : "lg:grid-cols-[350px_minmax(0,1fr)]"
      }`}
    >
      <aside
        onWheel={handlePdfSidebarWheel}
        className="flex min-h-0 flex-col overflow-hidden"
      >
        {pdfSidebarCollapsed ? (
          <div className="flex h-full items-start justify-center">
            <button
              type="button"
              onClick={() => setPdfSidebarCollapsed(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-[#2e0562]/30 hover:bg-[#2e0562]/5 hover:text-[#2e0562]"
              title="Show PDF sidebar"
              aria-label="Show PDF sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-border bg-muted/20 p-1">
                <button
                  type="button"
                  onClick={() => setPdfSidebarMode("content")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    pdfSidebarMode === "content"
                      ? "bg-background text-[#2e0562] shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Shared content
                </button>
                <button
                  type="button"
                  onClick={() => setPdfSidebarMode("design")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    pdfSidebarMode === "design"
                      ? "bg-background text-[#2e0562] shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  PDF design
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPdfSidebarCollapsed(true)}
                className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-[#2e0562]/30 hover:bg-[#2e0562]/5 hover:text-[#2e0562]"
                title="Hide PDF sidebar"
                aria-label="Hide PDF sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {pdfSidebarMode === "content" ? (
              <ResumeContentPanel
                data={data}
                onChange={onChange}
                section={sharedSection}
                onSectionChange={setSharedSection}
                variant="pdf-sidebar"
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card">
                <div className="border-b border-border">
                  <button
                    type="button"
                    onClick={() => setDesignCheckOpen(open => !open)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                        <Sparkles size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            Design check
                          </span>
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700">
                            Live
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          Typography, contrast and design consistency
                        </div>
                      </div>
                    </div>
                    {designCheckOpen ? (
                      <ChevronDown size={14} className="flex-none text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="flex-none text-muted-foreground" />
                    )}
                  </button>

                  {designCheckOpen && (
                    <div className="border-t border-border bg-muted/10">
                      <ResumeDesignIntelligence
                        data={data}
                        onChangeDesign={design => onChange({ ...data, design })}
                        onRemeasure={() => setCanvasRemeasureKey(key => key + 1)}
                      />
                    </div>
                  )}
                </div>

                <DesignPanelErrorBoundary>
                  <ResumeDesignPanel
                    design={data.design}
                    onChange={design => onChange({ ...data, design })}
                  />
                </DesignPanelErrorBoundary>
              </div>
            )}
          </>
        )}
      </aside>

      <main
        ref={canvasWrapperRef}
        className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-muted/30 p-3"
      >
        <ResumeCanvas
          data={data}
          onDesignChange={design => onChange({ ...data, design })}
          onDataChange={onChange}
          containerWidth={canvasWidth}
          remeasureKey={canvasRemeasureKey}
        />
      </main>
    </div>
  );

  const renderATSWorkspace = () => (
    <ATSResumeWorkspace
      data={data}
      onChange={onChange}
      section={sharedSection}
      onSectionChange={setSharedSection}
    />
  );

  const renderResponsiveWorkspace = () => (
    <ResponsiveResumeWorkspace
      data={data}
      onChange={onChange}
      section={sharedSection}
      onSectionChange={setSharedSection}
      sidebarMode={webSidebarMode}
      onSidebarModeChange={setWebSidebarMode}
      videoEditor={<VideoTab data={data} onChange={onChange} />}
    />
  );

  const renderInteractiveWorkspace = () => (
    <InteractiveResumeWorkspace
      data={data}
      onChange={onChange}
      templateOpenRequest={interactiveTemplateOpenRequest}
    />
  );

  return (
    <Layout>
      <ResumeBuilderShell
        workspace={workspace}
        enabled={formatState.enabled}
        saveStatus={saveStatus}
        preferredWebWorkspace={preferredWebWorkspace}
        onWorkspaceChange={switchWorkspace}
        onManageFormats={() => setFormatManagerOpen(true)}
        webModeControl={webModeControl}
        actions={actions}
      >
        {workspace === "content" && (
          <ResumeContentWorkspace
            data={data}
            onChange={onChange}
            section={sharedSection}
            onSectionChange={setSharedSection}
            intro={
              firstRunGuideVisible ? (
                <ResumeFirstRunGuide
                  data={data}
                  enabled={formatState.enabled}
                  onSectionChange={setSharedSection}
                  onWorkspaceChange={switchWorkspace}
                  onManageFormats={() => setFormatManagerOpen(true)}
                  onDismiss={() => {
                    setFirstRunGuideVisible(false);
                    writeFirstRunGuidePending(user?.id, false);
                  }}
                />
              ) : null
            }
          />
        )}
        {workspace === "designed-pdf" && renderDesignedWorkspace()}
        {workspace === "ats" && renderATSWorkspace()}
        {workspace === "responsive-web" && renderResponsiveWorkspace()}
        {workspace === "interactive-web" && renderInteractiveWorkspace()}
      </ResumeBuilderShell>

      {!formatState.onboardingComplete && (
        <ResumeFormatChooser
          onContinue={enabled => {
            applyEnabledFormats(enabled, true);
            writeFirstRunGuidePending(user?.id, true);
            setFirstRunGuideVisible(true);
            setSharedSection("profile");
            setWorkspace("content");
          }}
        />
      )}

      {formatManagerOpen && (
        <ResumeFormatManager
          enabled={formatState.enabled}
          currentWorkspace={workspace}
          onClose={() => setFormatManagerOpen(false)}
          onSave={enabled => {
            applyEnabledFormats(enabled, true);
            setFormatManagerOpen(false);
          }}
        />
      )}

      {templatePickerOpen && (
        <TemplateGallery
          currentTemplateId={getAppliedResumeTemplateId(data.design)}
          onClose={() => setTemplatePickerOpen(false)}
          onApply={template => {
            const templatedDesign = applyResumeTemplate(
              data.design ?? DEFAULT_DESIGN,
              template.id,
            );
            const relinkedDesign = relinkAllWebTypographyToShared(templatedDesign);
            const nextDesign = withResumeWebSettings(relinkedDesign, {
              templatePresentation: {
                templateId: template.id,
                layout: template.preview.layout,
                accent: template.preview.accent,
                paper: template.preview.paper,
                sidebarColor: template.preview.sidebarColor ?? "",
                headerAccent: Boolean(template.preview.headerAccent),
                timeline: Boolean(template.preview.timeline),
              },
            });
            onChange({ ...data, design: nextDesign });
            setCanvasRemeasureKey(key => key + 1);
            setTemplatePickerOpen(false);
            toast.success(`${template.name} template applied`);
          }}
          onDetach={() => {
            const nextDesign = detachResumeTemplate(
              data.design ?? DEFAULT_DESIGN,
            );
            onChange({ ...data, design: nextDesign });
            setTemplatePickerOpen(false);
            toast.success("Current appearance is now a custom design");
          }}
        />
      )}
    </Layout>
  );
}
