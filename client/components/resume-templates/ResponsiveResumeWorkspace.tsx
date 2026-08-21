import { useMemo, useState, type ReactNode } from "react";
import {
  AlignLeft,
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  FolderKanban,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  Menu,
  MonitorSmartphone,
  Palette,
  PlaySquare,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import ResumeContentPanel, {
  type ResumeContentSection,
} from "./ResumeContentPanel";
import ResumeWebControls, {
  type ResumeWebControlSection,
} from "./ResumeWebControls";
import ResumeWebPreview from "./ResumeWebPreview";
import { getResumeProjects } from "./resumeProjects";
import { getResumeWebSettings } from "./resumeWeb";
import type { ResumeData } from "./types";

export type ResponsiveWebSidebarMode = "content" | "site";

type WebOnlyTarget = "video" | "featured-links";
type SiteTarget = ResumeWebControlSection;
type SidebarTarget =
  | { kind: "shared"; section: ResumeContentSection }
  | { kind: "web"; section: WebOnlyTarget }
  | { kind: "site"; section: SiteTarget };

interface Props {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  section: ResumeContentSection;
  onSectionChange: (section: ResumeContentSection) => void;
  sidebarMode: ResponsiveWebSidebarMode;
  onSidebarModeChange: (mode: ResponsiveWebSidebarMode) => void;
  videoEditor?: ReactNode;
}

const SHARED_ITEMS: Array<{
  id: ResumeContentSection;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "experience", label: "Experience", icon: BriefcaseBusiness },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "summary", label: "Summary", icon: AlignLeft },
  { id: "links", label: "Links", icon: Link2 },
];

const WEB_ITEMS: Array<{
  id: WebOnlyTarget;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "video", label: "Video", icon: PlaySquare },
  { id: "featured-links", label: "Featured links", icon: Link2 },
];

const SITE_ITEMS: Array<{
  id: SiteTarget;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "navigation", label: "Navigation", icon: Menu },
  { id: "visitor-tools", label: "Visitor tools", icon: Search },
  { id: "appearance", label: "Appearance", icon: Palette },
];

function sharedMeta(section: ResumeContentSection, data: ResumeData): string {
  switch (section) {
    case "experience":
      return String(data.workEntries.length);
    case "projects":
      return String(getResumeProjects(data).length);
    case "education":
      return String(data.education.length);
    case "skills":
      return String(data.skills.length);
    case "links":
      return String(data.extraLinks.length);
    case "profile":
      return data.firstName || data.lastName || data.email || data.phone || data.location || data.website
        ? "Added"
        : "Empty";
    case "summary":
      return data.summary.trim() ? "Added" : "Empty";
  }
}

function targetTitle(target: SidebarTarget): string {
  if (target.kind === "shared") {
    return SHARED_ITEMS.find(item => item.id === target.section)?.label ?? "Shared content";
  }
  if (target.kind === "web") {
    return WEB_ITEMS.find(item => item.id === target.section)?.label ?? "Web only";
  }
  return SITE_ITEMS.find(item => item.id === target.section)?.label ?? "Site";
}

function targetEyebrow(target: SidebarTarget): string {
  if (target.kind === "shared") return "Shared content";
  if (target.kind === "web") return "Web only";
  return "Site";
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pb-1.5 pt-2 text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted/45"
    >
      <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2e0562]/[0.065] text-[#2e0562]">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
        {label}
      </span>
      {meta && (
        <span className="flex-none text-[9.5px] font-medium text-muted-foreground">
          {meta}
        </span>
      )}
      <ChevronRight
        size={14}
        className="flex-none text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-[#2e0562]"
      />
    </button>
  );
}

function SidebarOverview({
  data,
  onOpen,
}: {
  data: ResumeData;
  onOpen: (target: SidebarTarget) => void;
}) {
  const settings = useMemo(() => getResumeWebSettings(data.design), [data.design]);
  const visitorToolsEnabled = [
    settings.showSearch,
    settings.showPrint,
    settings.showPhoto,
    settings.showBackToTop,
  ].filter(Boolean).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3 pt-1.5">
      <GroupLabel>Shared content</GroupLabel>
      <div className="space-y-0.5">
        {SHARED_ITEMS.map(item => (
          <MenuRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            meta={sharedMeta(item.id, data)}
            onClick={() => onOpen({ kind: "shared", section: item.id })}
          />
        ))}
      </div>

      <div className="my-2 border-t border-border" />

      <GroupLabel>Web only</GroupLabel>
      <div className="space-y-0.5">
        <MenuRow
          icon={PlaySquare}
          label="Video"
          meta={settings.videoIntro.enabled ? "On" : "Off"}
          onClick={() => onOpen({ kind: "web", section: "video" })}
        />
        <MenuRow
          icon={Link2}
          label="Featured links"
          meta={String(settings.featuredLinks.length)}
          onClick={() => onOpen({ kind: "web", section: "featured-links" })}
        />
      </div>

      <div className="my-2 border-t border-border" />

      <GroupLabel>Site</GroupLabel>
      <div className="space-y-0.5">
        <MenuRow
          icon={Menu}
          label="Navigation"
          meta={settings.showNav ? "On" : "Off"}
          onClick={() => onOpen({ kind: "site", section: "navigation" })}
        />
        <MenuRow
          icon={Search}
          label="Visitor tools"
          meta={`${visitorToolsEnabled}/4`}
          onClick={() => onOpen({ kind: "site", section: "visitor-tools" })}
        />
        <MenuRow
          icon={Palette}
          label="Appearance"
          meta={settings.theme === "auto" ? "Auto" : settings.theme === "dark" ? "Dark" : "Light"}
          onClick={() => onOpen({ kind: "site", section: "appearance" })}
        />
      </div>
    </div>
  );
}

export default function ResponsiveResumeWorkspace({
  data,
  onChange,
  section,
  onSectionChange,
  sidebarMode,
  onSidebarModeChange,
  videoEditor,
}: Props) {
  const [target, setTarget] = useState<SidebarTarget | null>(null);

  const openTarget = (next: SidebarTarget) => {
    setTarget(next);
    if (next.kind === "shared") {
      onSectionChange(next.section);
      onSidebarModeChange("content");
    } else {
      onSidebarModeChange("site");
    }
  };

  const closeTarget = () => setTarget(null);

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden lg:p-4">
      <aside className="flex min-h-[360px] max-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:min-h-0 lg:max-h-none">
        <div className="flex-none border-b border-border px-3.5 py-3.5">
          <div className="flex items-start gap-2.5">
            <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-[#2e0562]/[0.07] text-[#2e0562]">
              <MonitorSmartphone size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#2e0562]">
                Responsive web
              </div>
              <div className="mt-0.5 text-xs font-semibold text-foreground">
                Resume site
              </div>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">
                Shared facts, Web-only content and site behavior are kept separate.
              </p>
            </div>
          </div>
        </div>

        {!target ? (
          <SidebarOverview data={data} onOpen={openTarget} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-12 flex-none items-center gap-2 border-b border-border px-3">
              <button
                type="button"
                onClick={closeTarget}
                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-[#2e0562]"
                aria-label="Back to responsive web sections"
              >
                <ArrowLeft size={14} />
              </button>
              <div className="min-w-0">
                <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-[#2e0562]">
                  {targetEyebrow(target)}
                </div>
                <div className="truncate text-[11.5px] font-semibold text-foreground">
                  {targetTitle(target)}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {target.kind === "shared" && (
                <ResumeContentPanel
                  data={data}
                  onChange={onChange}
                  section={section}
                  onSectionChange={onSectionChange}
                  variant="web-sidebar-section"
                />
              )}

              {target.kind === "web" && target.section === "video" && (
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3.5">
                  {videoEditor ?? (
                    <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[10px] text-muted-foreground">
                      Video settings are unavailable.
                    </div>
                  )}
                </div>
              )}

              {target.kind === "web" && target.section === "featured-links" && (
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3.5">
                  <ResumeWebControls
                    design={data.design}
                    onChange={design => onChange({ ...data, design })}
                    section="featured-links"
                  />
                </div>
              )}

              {target.kind === "site" && (
                <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3.5">
                  <ResumeWebControls
                    design={data.design}
                    onChange={design => onChange({ ...data, design })}
                    section={target.section}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <section className="flex min-h-[640px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:min-h-0">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-border bg-background px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground">
              Live site preview
            </div>
            <div className="mt-0.5 text-[9.5px] text-muted-foreground">
              Select and edit directly on the page.
            </div>
          </div>
          <span className="flex-none rounded-full bg-[#2e0562]/[0.06] px-2 py-1 text-[9px] font-semibold text-[#2e0562]">
            Responsive
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden bg-[#f7f7f9] p-2 sm:p-3">
          <ResumeWebPreview
            data={data}
            onDesignChange={design => onChange({ ...data, design })}
            onDataChange={onChange}
          />
        </main>
      </section>
    </div>
  );
}
