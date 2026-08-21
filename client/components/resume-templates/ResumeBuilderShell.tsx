import type { ReactNode } from "react";
import {
  AlertCircle,
  Clock,
  FileText,
  Globe2,
  LayoutTemplate,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ResumeBuilderEnabledFormats,
  ResumeBuilderWorkspace,
} from "./resumeBuilderFormats";
import { firstEnabledWebWorkspace } from "./resumeBuilderFormats";

export type ResumeBuilderSaveStatus =
  | "saved"
  | "pending"
  | "saving"
  | "error";

interface Props {
  workspace: ResumeBuilderWorkspace;
  enabled: ResumeBuilderEnabledFormats;
  saveStatus: ResumeBuilderSaveStatus;
  onWorkspaceChange: (workspace: ResumeBuilderWorkspace) => void;
  onManageFormats: () => void;
  preferredWebWorkspace?: "responsive-web" | "interactive-web";
  webModeControl?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

function TabButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-lg px-3 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1 ${
        active
          ? "bg-[#2e0562] text-white shadow-sm"
          : "text-muted-foreground hover:bg-background hover:text-foreground"
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

function SaveStatus({ status }: { status: ResumeBuilderSaveStatus }) {
  const content =
    status === "saving"
      ? {
          icon: <Loader2 size={11} className="animate-spin" />,
          label: "Saving…",
          className: "text-muted-foreground",
        }
      : status === "pending"
        ? {
            icon: <Clock size={11} />,
            label: "Changes pending",
            className: "text-amber-700",
          }
        : status === "error"
          ? {
              icon: <AlertCircle size={11} />,
              label: "Save failed",
              className: "text-red-600",
            }
          : {
              icon: <Save size={11} />,
              label: "Auto-saved",
              className: "text-muted-foreground",
            };

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${content.className}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {content.icon}
      <span className="hidden sm:inline">{content.label}</span>
      <span className="sr-only sm:hidden">{content.label}</span>
    </span>
  );
}

export default function ResumeBuilderShell({
  workspace,
  enabled,
  saveStatus,
  onWorkspaceChange,
  onManageFormats,
  preferredWebWorkspace,
  webModeControl,
  actions,
  children,
}: Props) {
  const webActive =
    workspace === "responsive-web" || workspace === "interactive-web";

  const webTarget =
    preferredWebWorkspace &&
    ((preferredWebWorkspace === "responsive-web" && enabled.responsiveWeb) ||
      (preferredWebWorkspace === "interactive-web" && enabled.interactiveWeb))
      ? preferredWebWorkspace
      : firstEnabledWebWorkspace(enabled);

  const enabledFormatCount = Object.values(enabled).filter(Boolean).length;
  const allFormatsEnabled = enabledFormatCount === 4;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <header className="sticky top-16 z-40 border-b border-border bg-background/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-[15px] font-semibold text-foreground">
              Resume Builder
            </h1>
            <span className="h-4 w-px flex-none bg-border" aria-hidden="true" />
            <SaveStatus status={saveStatus} />
          </div>

          <nav
            role="tablist"
            aria-label="Resume builder workspaces"
            className="order-3 col-span-2 flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:order-none lg:col-span-1 lg:justify-self-center"
          >
            <TabButton
              active={workspace === "content"}
              onClick={() => onWorkspaceChange("content")}
            >
              Content
            </TabButton>

            {enabled.designedPdf && (
              <TabButton
                active={workspace === "designed-pdf"}
                icon={<LayoutTemplate size={12} />}
                onClick={() => onWorkspaceChange("designed-pdf")}
              >
                Designed PDF
              </TabButton>
            )}

            {enabled.ats && (
              <TabButton
                active={workspace === "ats"}
                icon={<FileText size={12} />}
                onClick={() => onWorkspaceChange("ats")}
              >
                ATS
              </TabButton>
            )}

            {(enabled.responsiveWeb || enabled.interactiveWeb) && webTarget && (
              <TabButton
                active={webActive}
                icon={<Globe2 size={12} />}
                onClick={() => onWorkspaceChange(webTarget)}
              >
                Web
              </TabButton>
            )}

            {webActive && webModeControl && (
              <>
                <span
                  className="mx-0.5 h-5 w-px flex-none bg-border"
                  aria-hidden="true"
                />
                <div className="flex-none">{webModeControl}</div>
              </>
            )}

            <span
              className="mx-0.5 h-5 w-px flex-none bg-border"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={onManageFormats}
              className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold text-[#2e0562] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-[#2e0562]/30 focus-visible:ring-offset-1"
              aria-label={
                allFormatsEnabled
                  ? "Manage resume formats"
                  : "Add or manage resume formats"
              }
              title={
                allFormatsEnabled
                  ? "Manage resume formats"
                  : "Add or manage resume formats"
              }
            >
              {allFormatsEnabled ? (
                <SlidersHorizontal size={12} />
              ) : (
                <Plus size={12} />
              )}
              <span>{allFormatsEnabled ? "Manage formats" : "Add format"}</span>
            </button>
          </nav>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
            {actions}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
